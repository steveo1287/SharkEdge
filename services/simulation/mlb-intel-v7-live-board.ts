import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { LeagueKey } from "@/lib/types/domain";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildMlbIntelV7Probability } from "@/services/simulation/mlb-intel-v7-probability";
import { ensureMlbRosterIntelligenceTables } from "@/services/simulation/mlb-roster-intelligence";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

type SimGame = {
  id: string;
  label: string;
  startTime: string;
  status: string;
  leagueKey: LeagueKey;
  leagueLabel: string;
  scoreboard?: string | null;
};

type RuntimeMlbIntel = {
  modelVersion?: string | null;
  dataSource?: string | null;
  market?: {
    homeNoVigProbability?: number | null;
    homeOddsAmerican?: number | null;
    awayOddsAmerican?: number | null;
    totalLine?: number | null;
    source?: string | null;
  } | null;
  governor?: {
    confidence?: number | null;
    tier?: string | null;
    noBet?: boolean | null;
    reasons?: string[] | null;
  } | null;
  lock?: {
    startersConfirmed?: boolean | null;
    lineupsConfirmed?: boolean | null;
    awayBattingOrder?: string[] | null;
    homeBattingOrder?: string[] | null;
  } | null;
};

type RoleSummaryRow = {
  role_tier: string;
  count: bigint;
  avg_overall: number | null;
};

type LineupRow = {
  confirmed: boolean;
  batting_order_json: unknown;
  bench_json: unknown;
  starting_pitcher_id: string | null;
  starting_pitcher_name: string | null;
  available_relievers_json: unknown;
  unavailable_relievers_json: unknown;
  injuries_json: unknown;
  source: string | null;
  captured_at: Date | string;
};

function parseMatchup(label: string) {
  const atSplit = label.split(" @ ");
  if (atSplit.length === 2) return { away: atSplit[0]?.trim() || "Away", home: atSplit[1]?.trim() || "Home" };
  const vsSplit = label.split(" vs ");
  if (vsSplit.length === 2) return { away: vsSplit[0]?.trim() || "Away", home: vsSplit[1]?.trim() || "Home" };
  return { away: "Away", home: "Home" };
}

function normalizeCount(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function round(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function fetchMlbGames() {
  const sections = await buildBoardSportSections({ selectedLeague: "MLB", gamesByLeague: {}, maxScoreboardGames: null });
  return sections.flatMap((section) => section.leagueKey === "MLB"
    ? section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel }))
    : []) as SimGame[];
}

async function readRoleSummary(table: "mlb_player_ratings" | "mlb_pitcher_ratings", idColumn: "player_id" | "pitcher_id", team: string) {
  return prisma.$queryRawUnsafe<RoleSummaryRow[]>(`
    WITH latest AS (
      SELECT DISTINCT ON (${idColumn}) role_tier, overall
      FROM ${table}
      WHERE team = $1
      ORDER BY ${idColumn}, snapshot_at DESC
    )
    SELECT role_tier, COUNT(*)::bigint AS count, AVG(overall) AS avg_overall
    FROM latest
    GROUP BY role_tier
    ORDER BY count DESC;
  `, team);
}

async function readLatestLineup(gameId: string, team: string) {
  const rows = await prisma.$queryRaw<LineupRow[]>`
    SELECT confirmed, batting_order_json, bench_json, starting_pitcher_id, starting_pitcher_name,
      available_relievers_json, unavailable_relievers_json, injuries_json, source, captured_at
    FROM mlb_lineup_snapshots
    WHERE game_id = ${gameId} AND team = ${team}
    ORDER BY captured_at DESC
    LIMIT 1;
  `;
  return rows[0] ?? null;
}

function mapRoles(rows: RoleSummaryRow[]) {
  return rows.map((row) => ({ role: row.role_tier, count: normalizeCount(row.count), avgOverall: round(row.avg_overall, 2) }));
}

function mapLineup(row: LineupRow | null) {
  if (!row) return null;
  return {
    confirmed: row.confirmed,
    battingOrder: row.batting_order_json,
    bench: row.bench_json,
    startingPitcherId: row.starting_pitcher_id,
    startingPitcherName: row.starting_pitcher_name,
    availableRelievers: row.available_relievers_json,
    unavailableRelievers: row.unavailable_relievers_json,
    injuries: row.injuries_json,
    source: row.source,
    capturedAt: toIso(row.captured_at)
  };
}

async function buildTeamRosterContext(gameId: string, team: string) {
  if (!hasUsableServerDatabaseUrl()) {
    return { available: false, team, hitterRoles: [], pitcherRoles: [], lineup: null, reason: "database unavailable" };
  }

  try {
    await ensureMlbRosterIntelligenceTables();
    const [hitterRoles, pitcherRoles, lineup] = await Promise.all([
      readRoleSummary("mlb_player_ratings", "player_id", team),
      readRoleSummary("mlb_pitcher_ratings", "pitcher_id", team),
      readLatestLineup(gameId, team)
    ]);
    return {
      available: true,
      team,
      hitterRoles: mapRoles(hitterRoles),
      pitcherRoles: mapRoles(pitcherRoles),
      lineup: mapLineup(lineup),
      reason: null
    };
  } catch (error) {
    return {
      available: false,
      team,
      hitterRoles: [],
      pitcherRoles: [],
      lineup: null,
      reason: error instanceof Error ? error.message : "unknown roster context error"
    };
  }
}

async function buildLiveRow(game: SimGame) {
  const matchup = parseMatchup(game.label);
  const projection = await buildSimProjection(game);
  const mlbIntel = (projection.mlbIntel ?? null) as RuntimeMlbIntel | null;
  const v7 = buildMlbIntelV7Probability({
    rawHomeWinPct: projection.distribution.homeWinPct,
    marketHomeNoVigProbability: mlbIntel?.market?.homeNoVigProbability ?? null,
    existingConfidence: mlbIntel?.governor?.confidence ?? null,
    existingTier: mlbIntel?.governor?.tier ?? null
  });
  const [awayRoster, homeRoster] = await Promise.all([
    buildTeamRosterContext(game.id, matchup.away),
    buildTeamRosterContext(game.id, matchup.home)
  ]);

  return {
    game: {
      id: game.id,
      label: game.label,
      startTime: game.startTime,
      status: game.status,
      matchup
    },
    modelVersion: v7.modelVersion,
    raw: {
      homeWinPct: round(projection.distribution.homeWinPct),
      awayWinPct: round(projection.distribution.awayWinPct),
      awayRuns: round(projection.distribution.avgAway, 2),
      homeRuns: round(projection.distribution.avgHome, 2)
    },
    calibrated: {
      homeWinPct: v7.finalHomeWinPct,
      awayWinPct: v7.finalAwayWinPct,
      shrinkHomeWinPct: v7.shrinkHomeWinPct,
      edgeHomePct: v7.edgeHomePct,
      pickSide: v7.pickSide,
      tier: v7.tier,
      noBet: v7.noBet,
      confidence: v7.confidence,
      reasons: v7.reasons
    },
    market: {
      source: mlbIntel?.market?.source ?? null,
      homeNoVigProbability: v7.marketHomeNoVigProbability,
      homeOddsAmerican: mlbIntel?.market?.homeOddsAmerican ?? null,
      awayOddsAmerican: mlbIntel?.market?.awayOddsAmerican ?? null,
      totalLine: mlbIntel?.market?.totalLine ?? null
    },
    lock: {
      startersConfirmed: mlbIntel?.lock?.startersConfirmed ?? false,
      lineupsConfirmed: mlbIntel?.lock?.lineupsConfirmed ?? false,
      awayBattingOrderCount: mlbIntel?.lock?.awayBattingOrder?.length ?? 0,
      homeBattingOrderCount: mlbIntel?.lock?.homeBattingOrder?.length ?? 0
    },
    roster: {
      away: awayRoster,
      home: homeRoster
    }
  };
}

export async function buildMlbIntelV7LiveBoard(args: { limit?: number } = {}) {
  const generatedAt = new Date().toISOString();
  const games = (await fetchMlbGames()).filter((game) => game.status !== "FINAL" && game.status !== "POSTPONED" && game.status !== "CANCELED");
  const limit = Math.max(1, Math.min(60, Math.round(args.limit ?? 30)));
  const warnings: string[] = [];
  const rows = [];

  for (const game of games.slice(0, limit)) {
    try {
      rows.push(await buildLiveRow(game));
    } catch (error) {
      warnings.push(`${game.label}: ${error instanceof Error ? error.message : "unknown MLB v7 live row error"}`);
    }
  }

  return {
    ok: true,
    generatedAt,
    modelVersion: "mlb-intel-v7",
    gameCount: games.length,
    rowCount: rows.length,
    warnings,
    rows
  };
}
