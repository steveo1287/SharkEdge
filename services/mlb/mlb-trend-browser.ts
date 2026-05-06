import { prisma } from "@/lib/db/prisma";

const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_API_BASE = "https://statsapi.mlb.com";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MlbTrendRecord = {
  trendKey: string;
  label: string;
  market: string;
  side: string;
  homeAway: string;
  qualifier: string;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  total: number;
  winPct: number;
  roi: number;
  totalUnits: number;
  streak: { type: "W" | "L" | null; count: number };
  lastResult: string | null;
};

export type MlbTodayGame = {
  gamePk: number;
  homeTeam: string;
  awayTeam: string;
  gameTime: string | null;
  status: string;
  homeTeamTrends: MlbTrendRecord[];
  awayTeamTrends: MlbTrendRecord[];
};

export type MlbTeamProfile = {
  teamId: number;
  teamName: string;
  home: MlbTrendRecord[];
  away: MlbTrendRecord[];
};

type AggRow = {
  trend_key: string;
  market_type: string;
  side: string;
  wins: bigint;
  losses: bigint;
  pushes: bigint;
  pending: bigint;
  total: bigint;
  total_units: number | null;
};

type StreakRow = {
  trend_key: string;
  result: string;
  game_pk: number | bigint;
};

type TeamAggRow = AggRow & { team_id: number | bigint; team_name: string | null };

type ScheduleGame = {
  gamePk?: number;
  gameDate?: string;
  status?: { abstractGameState?: string; detailedState?: string };
  teams?: {
    away?: { team?: { abbreviation?: string; name?: string } };
    home?: { team?: { abbreviation?: string; name?: string } };
  };
};
type ScheduleResponse = { dates?: Array<{ games?: ScheduleGame[] }> };

// ── Label generation ──────────────────────────────────────────────────────────

function qualifierLabel(qualifier: string): string {
  const map: Record<string, string> = {
    base: "all games",
    scored_5_plus: "scored 5+ runs",
    scored_under_5: "scored under 5 runs",
    total_8_plus: "game total 8+ runs",
    total_under_8: "game total under 8 runs",
    allowed_3_or_less: "allowed 3 or fewer runs",
    allowed_4_plus: "allowed 4+ runs",
    big_favorite: "as big favorite (≤-200)",
    favorite: "as favorite (-130 to -200)",
    slight_favorite: "as slight favorite",
    pick: "pick 'em",
    dog: "as underdog",
    big_dog: "as big underdog (+180+)",
    unknown: "",
  };
  return map[qualifier] ?? qualifier.replace(/_/g, " ");
}

function buildLabel(side: string, homeAway: string, market: string, qualifier: string): string {
  const sideLabel = homeAway === "home" ? "Home" : "Away";
  const marketLabel = market === "moneyline" ? "moneyline" : market === "spread" ? "ATS" : "O/U";
  const qualLabel = qualifierLabel(qualifier);
  if (qualifier === "base" || !qualifier || qualifier === "unknown") {
    return `${sideLabel} team ${marketLabel}`;
  }
  return `${sideLabel} team ${marketLabel} — ${qualLabel}`;
}

function parseKey(trendKey: string): { market: string; side: string; homeAway: string; qualifier: string } {
  const parts = trendKey.split("|");
  // MLB|market|side|homeAway[|qualifier_bucket]
  const market = parts[1] ?? "moneyline";
  const side = parts[2] ?? "home";
  const homeAway = parts[3] ?? "home";
  const qualParts = parts.slice(4);
  const qualifier = qualParts.length ? qualParts.join("|") : "base";
  return { market, side, homeAway, qualifier };
}

// ── Streak computation ────────────────────────────────────────────────────────

function computeStreak(rows: StreakRow[], trendKey: string): { type: "W" | "L" | null; count: number } {
  const keyRows = rows
    .filter((r) => r.trend_key === trendKey && (r.result === "win" || r.result === "loss"))
    .sort((a, b) => Number(b.game_pk) - Number(a.game_pk));

  if (!keyRows.length) return { type: null, count: 0 };

  const first = keyRows[0].result;
  let count = 0;
  for (const row of keyRows) {
    if (row.result !== first) break;
    count += 1;
  }

  return { type: first === "win" ? "W" : "L", count };
}

// ── Core aggregation ──────────────────────────────────────────────────────────

function aggToRecord(row: AggRow, streakRows: StreakRow[]): MlbTrendRecord {
  const { market, side, homeAway, qualifier } = parseKey(row.trend_key);
  const wins = Number(row.wins);
  const losses = Number(row.losses);
  const pushes = Number(row.pushes);
  const pending = Number(row.pending);
  const decided = wins + losses;
  const winPct = decided > 0 ? Math.round((wins / decided) * 1000) / 10 : 0;
  const totalUnits = Number(row.total_units ?? 0);
  const roi = decided > 0 ? Math.round((totalUnits / decided) * 1000) / 10 : 0;
  const streak = computeStreak(streakRows, row.trend_key);

  return {
    trendKey: row.trend_key,
    label: buildLabel(side, homeAway, market, qualifier),
    market,
    side,
    homeAway,
    qualifier,
    wins,
    losses,
    pushes,
    pending,
    total: Number(row.total),
    winPct,
    roi,
    totalUnits: Math.round(totalUnits * 100) / 100,
    streak,
    lastResult: streakRows.find((r) => r.trend_key === row.trend_key)?.result ?? null,
  };
}

// ── League-wide trends ────────────────────────────────────────────────────────

export async function getMlbLeagueTrends(minSample = 20): Promise<MlbTrendRecord[]> {
  const [agg, streakRows] = await Promise.all([
    prisma.$queryRaw<AggRow[]>`
      SELECT
        trend_key,
        market_type,
        side,
        COUNT(*) FILTER (WHERE result = 'win')     AS wins,
        COUNT(*) FILTER (WHERE result = 'loss')    AS losses,
        COUNT(*) FILTER (WHERE result = 'push')    AS pushes,
        COUNT(*) FILTER (WHERE result = 'pending') AS pending,
        COUNT(*)                                    AS total,
        SUM(units)                                  AS total_units
      FROM mlb_trend_rows
      GROUP BY trend_key, market_type, side
      HAVING COUNT(*) FILTER (WHERE result IN ('win','loss','push')) >= ${minSample}
      ORDER BY SUM(units) DESC
    `,
    prisma.$queryRaw<StreakRow[]>`
      SELECT DISTINCT ON (trend_key, game_pk) trend_key, result, game_pk
      FROM mlb_trend_rows
      WHERE result IN ('win','loss')
      ORDER BY trend_key, game_pk DESC
      LIMIT 5000
    `,
  ]);

  return agg.map((row) => aggToRecord(row, streakRows));
}

// ── Team situational profile ──────────────────────────────────────────────────

export async function getMlbTeamProfile(teamName: string): Promise<MlbTeamProfile | null> {
  const pattern = `%${teamName.toLowerCase()}%`;
  const [agg, streakRows] = await Promise.all([
    prisma.$queryRaw<TeamAggRow[]>`
      SELECT
        t.team_id,
        t.team_name,
        t.trend_key,
        t.market_type,
        t.side,
        COUNT(*) FILTER (WHERE t.result = 'win')     AS wins,
        COUNT(*) FILTER (WHERE t.result = 'loss')    AS losses,
        COUNT(*) FILTER (WHERE t.result = 'push')    AS pushes,
        COUNT(*) FILTER (WHERE t.result = 'pending') AS pending,
        COUNT(*)                                      AS total,
        SUM(t.units)                                  AS total_units
      FROM mlb_trend_rows t
      WHERE lower(t.team_name) LIKE ${pattern}
      GROUP BY t.team_id, t.team_name, t.trend_key, t.market_type, t.side
      HAVING COUNT(*) FILTER (WHERE t.result IN ('win','loss','push')) >= 5
      ORDER BY t.team_id, SUM(t.units) DESC
    `,
    prisma.$queryRaw<StreakRow[]>`
      SELECT trend_key, result, game_pk
      FROM mlb_trend_rows
      WHERE result IN ('win','loss')
        AND lower(team_name) LIKE ${pattern}
      ORDER BY trend_key, game_pk DESC
      LIMIT 1000
    `,
  ]);

  if (!agg.length) return null;

  const row0 = agg[0];
  const teamId = Number(row0.team_id);
  const resolvedName = row0.team_name ?? teamName;

  const home = agg.filter((r) => parseKey(r.trend_key).homeAway === "home").map((r) => aggToRecord(r, streakRows));
  const away = agg.filter((r) => parseKey(r.trend_key).homeAway === "away").map((r) => aggToRecord(r, streakRows));

  return { teamId, teamName: resolvedName, home, away };
}

// ── Today's game activations ──────────────────────────────────────────────────

async function fetchTodaySchedule(): Promise<ScheduleGame[]> {
  const today = new Date().toISOString().slice(0, 10);
  const url = `${DEFAULT_API_BASE}/api/v1/schedule?sportId=1&startDate=${today}&endDate=${today}&hydrate=team`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "SharkEdge/2.0 trend-browser" }, signal: controller.signal });
    if (!res.ok) return [];
    const body = (await res.json()) as ScheduleResponse;
    return body.dates?.flatMap((d) => d.games ?? []) ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

type TeamNameRow = { team_id: number | bigint; team_name: string | null };

async function resolveTeamIds(abbrs: string[]): Promise<Map<string, number>> {
  if (!abbrs.length) return new Map();
  const rows = await prisma.$queryRaw<TeamNameRow[]>`
    SELECT DISTINCT team_id, team_name
    FROM mlb_team_situations
    WHERE team_name IS NOT NULL
    LIMIT 60
  `.catch(() => [] as TeamNameRow[]);

  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.team_name || row.team_id == null) continue;
    const id = Number(row.team_id);
    // Index by first 3 chars of abbreviation-style match
    const key = row.team_name.trim().toUpperCase();
    map.set(key, id);
    // Also store common 2-3 char abbr variants from the team name
    const parts = row.team_name.trim().split(" ");
    if (parts.length) map.set(parts[parts.length - 1].toUpperCase(), id);
  }
  for (const abbr of abbrs) {
    const upper = abbr.toUpperCase();
    if (!map.has(upper)) map.set(upper, -1);
  }
  return map;
}

type TeamTrendRow = AggRow & { team_id: number | bigint; team_name: string | null; home_away: string };

async function getTeamTrendsById(teamIds: number[]): Promise<Map<number, MlbTrendRecord[]>> {
  if (!teamIds.length) return new Map();

  // Fetch each team individually to avoid Prisma array parameter complexity
  const teamResults = await Promise.all(
    teamIds.map(async (teamId) => {
      const [agg, streakRows] = await Promise.all([
        prisma.$queryRaw<TeamTrendRow[]>`
          SELECT
            t.team_id,
            t.team_name,
            t.trend_key,
            t.market_type,
            t.side,
            t.qualifiers->>'homeAway' AS home_away,
            COUNT(*) FILTER (WHERE t.result = 'win')     AS wins,
            COUNT(*) FILTER (WHERE t.result = 'loss')    AS losses,
            COUNT(*) FILTER (WHERE t.result = 'push')    AS pushes,
            COUNT(*) FILTER (WHERE t.result = 'pending') AS pending,
            COUNT(*)                                      AS total,
            SUM(t.units)                                  AS total_units
          FROM mlb_trend_rows t
          WHERE t.team_id = ${teamId}
          GROUP BY t.team_id, t.team_name, t.trend_key, t.market_type, t.side, t.qualifiers->>'homeAway'
          HAVING COUNT(*) FILTER (WHERE t.result IN ('win','loss','push')) >= 5
          ORDER BY SUM(t.units) DESC
        `,
        prisma.$queryRaw<StreakRow[]>`
          SELECT trend_key, result, game_pk
          FROM mlb_trend_rows
          WHERE result IN ('win','loss') AND team_id = ${teamId}
          ORDER BY trend_key, game_pk DESC
          LIMIT 500
        `,
      ]);
      return { teamId, agg, streakRows };
    })
  );

  const result = new Map<number, MlbTrendRecord[]>();
  for (const { teamId, agg, streakRows } of teamResults) {
    result.set(teamId, agg.map((row) => aggToRecord(row, streakRows)));
  }
  return result;
}

export async function getMlbTodayActivations(): Promise<MlbTodayGame[]> {
  const games = await fetchTodaySchedule();
  if (!games.length) return [];

  const abbrs = games.flatMap((g) => [
    g.teams?.home?.team?.abbreviation ?? "",
    g.teams?.away?.team?.abbreviation ?? "",
  ]).filter(Boolean);

  // Try resolving team IDs from DB first
  const teamIdMap = await resolveTeamIds(abbrs);

  // Build a lookup of game → home/away team IDs
  type GameDef = { gamePk: number; homeAbbr: string; awayAbbr: string; homeId: number; awayId: number; gameTime: string | null; status: string };
  const gameDefs: GameDef[] = [];

  for (const g of games) {
    if (!g.gamePk) continue;
    const homeAbbr = g.teams?.home?.team?.abbreviation ?? "";
    const awayAbbr = g.teams?.away?.team?.abbreviation ?? "";
    const homeName = g.teams?.home?.team?.name ?? homeAbbr;
    const awayName = g.teams?.away?.team?.name ?? awayAbbr;
    const homeId = teamIdMap.get(homeName.split(" ").pop()!.toUpperCase() ?? "") ??
      teamIdMap.get(homeAbbr.toUpperCase()) ?? -1;
    const awayId = teamIdMap.get(awayName.split(" ").pop()!.toUpperCase() ?? "") ??
      teamIdMap.get(awayAbbr.toUpperCase()) ?? -1;

    gameDefs.push({
      gamePk: g.gamePk,
      homeAbbr: homeName,
      awayAbbr: awayName,
      homeId,
      awayId,
      gameTime: g.gameDate ?? null,
      status: g.status?.detailedState ?? g.status?.abstractGameState ?? "Scheduled",
    });
  }

  const allTeamIds = [...new Set(gameDefs.flatMap((g) => [g.homeId, g.awayId]).filter((id) => id > 0))];
  const teamTrendMap = await getTeamTrendsById(allTeamIds).catch(() => new Map<number, MlbTrendRecord[]>());

  return gameDefs.map((g) => {
    const homeTrends = (teamTrendMap.get(g.homeId) ?? []).filter((t) => t.homeAway === "home");
    const awayTrends = (teamTrendMap.get(g.awayId) ?? []).filter((t) => t.homeAway === "away");
    return {
      gamePk: g.gamePk,
      homeTeam: g.homeAbbr,
      awayTeam: g.awayAbbr,
      gameTime: g.gameTime,
      status: g.status,
      homeTeamTrends: homeTrends.slice(0, 6),
      awayTeamTrends: awayTrends.slice(0, 6),
    };
  });
}

// ── Team name list (for search autocomplete) ──────────────────────────────────

export async function getMlbTeamNames(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ team_name: string }[]>`
    SELECT DISTINCT team_name FROM mlb_team_situations WHERE team_name IS NOT NULL ORDER BY team_name
  `.catch(() => [] as { team_name: string }[]);
  return rows.map((r) => r.team_name).filter(Boolean);
}

// ── Browser summary (row counts + last refresh) ───────────────────────────────

type SummaryRow = { total_rows: bigint; final_rows: bigint; team_count: bigint; last_updated: Date | null };

export async function getMlbTrendBrowserSummary() {
  const rows = await prisma.$queryRaw<SummaryRow[]>`
    SELECT
      COUNT(*)                                             AS total_rows,
      COUNT(*) FILTER (WHERE result IN ('win','loss'))     AS final_rows,
      COUNT(DISTINCT team_id)                              AS team_count,
      MAX(updated_at)                                      AS last_updated
    FROM mlb_trend_rows
  `.catch(() => [] as SummaryRow[]);

  const row = rows[0];
  return {
    totalRows: Number(row?.total_rows ?? 0),
    finalRows: Number(row?.final_rows ?? 0),
    teamCount: Number(row?.team_count ?? 0),
    lastUpdated: row?.last_updated ? new Date(row.last_updated).toISOString() : null,
  };
}
