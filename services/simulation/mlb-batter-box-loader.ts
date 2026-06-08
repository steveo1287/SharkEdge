import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbRosterIntelligenceTables } from "@/services/simulation/mlb-roster-intelligence";
import { buildMlbV8PlayerImpactContext } from "@/services/simulation/mlb-v8-player-impact-model";
import {
  projectMlbPlayerStatsForGame,
  type MlbPlayerStatProjectionGame,
  type MlbProjectionLineup,
  type MlbProjectionRating,
  type MlbProjectionTeamContext
} from "@/services/simulation/mlb-player-stat-inning-engine";

export type MlbBatterBoxGameOption = {
  gameId: string;
  awayTeam: string;
  homeTeam: string;
  startTime: string | null;
  source: "games" | "lineups" | "ratings" | "query";
  label: string;
};

export type MlbBatterBoxDiagnostics = {
  databaseReady: boolean;
  paramsReady: boolean;
  selectedGame: MlbBatterBoxGameOption | null;
  gameOptions: MlbBatterBoxGameOption[];
  searched: { gameId: string | null; awayTeam: string | null; homeTeam: string | null };
  counts: { awayHitters: number; homeHitters: number; awayPitchers: number; homePitchers: number; awayLineups: number; homeLineups: number };
  warnings: string[];
};

export type MlbBatterBoxLoadResult = {
  projection: MlbPlayerStatProjectionGame | null;
  diagnostics: MlbBatterBoxDiagnostics;
  error: string | null;
};

type SearchParamsLike = Record<string, string | string[] | undefined>;
type RawGameOption = { game_id: string; away_team: string; home_team: string; start_time: Date | string | null; source: MlbBatterBoxGameOption["source"] };
type CountRow = { count: bigint | number | string | null };
type RawLineupRow = MlbProjectionLineup & { captured_at?: Date | string | null };

const TEAM_ALIASES: Record<string, string> = {
  "ARIZONA DIAMONDBACKS": "ARI", DIAMONDBACKS: "ARI",
  "ATLANTA BRAVES": "ATL", BRAVES: "ATL",
  "BALTIMORE ORIOLES": "BAL", ORIOLES: "BAL",
  "BOSTON RED SOX": "BOS", "RED SOX": "BOS",
  "CHICAGO CUBS": "CHC", CUBS: "CHC",
  "WHITE SOX": "CWS", "CHICAGO WHITE SOX": "CWS",
  "CINCINNATI REDS": "CIN", REDS: "CIN",
  "CLEVELAND GUARDIANS": "CLE", GUARDIANS: "CLE",
  "COLORADO ROCKIES": "COL", ROCKIES: "COL",
  "DETROIT TIGERS": "DET", TIGERS: "DET",
  "HOUSTON ASTROS": "HOU", ASTROS: "HOU",
  "KANSAS CITY ROYALS": "KC", ROYALS: "KC",
  "LOS ANGELES ANGELS": "LAA", ANGELS: "LAA",
  "LOS ANGELES DODGERS": "LAD", DODGERS: "LAD",
  "MIAMI MARLINS": "MIA", MARLINS: "MIA",
  "MILWAUKEE BREWERS": "MIL", BREWERS: "MIL",
  "MINNESOTA TWINS": "MIN", TWINS: "MIN",
  "NEW YORK METS": "NYM", METS: "NYM",
  "NEW YORK YANKEES": "NYY", YANKEES: "NYY",
  ATHLETICS: "ATH",
  "PHILADELPHIA PHILLIES": "PHI", PHILLIES: "PHI",
  "PITTSBURGH PIRATES": "PIT", PIRATES: "PIT",
  "SAN DIEGO PADRES": "SD", PADRES: "SD",
  "SAN FRANCISCO GIANTS": "SF", GIANTS: "SF",
  "SEATTLE MARINERS": "SEA", MARINERS: "SEA",
  "ST. LOUIS CARDINALS": "STL", "ST LOUIS CARDINALS": "STL", CARDINALS: "STL",
  "TAMPA BAY RAYS": "TB", RAYS: "TB",
  "TEXAS RANGERS": "TEX", RANGERS: "TEX",
  "TORONTO BLUE JAYS": "TOR", "BLUE JAYS": "TOR",
  "WASHINGTON NATIONALS": "WSH", NATIONALS: "WSH"
};

function textParam(search: SearchParamsLike, key: string) {
  const value = search[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function numberParam(search: SearchParamsLike, key: string, fallback: number) {
  const value = Number(textParam(search, key));
  return Number.isFinite(value) ? value : fallback;
}

function normalizeCount(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeTeam(value: string) {
  const clean = value.trim().toUpperCase().replace(/\s+/g, " ");
  return TEAM_ALIASES[clean] ?? clean;
}

function optionLabel(option: Omit<MlbBatterBoxGameOption, "label">) {
  const time = option.startTime ? new Date(option.startTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : option.source;
  return `${option.awayTeam} @ ${option.homeTeam} · ${time}`;
}

function toOption(row: RawGameOption): MlbBatterBoxGameOption {
  const option = { gameId: row.game_id, awayTeam: normalizeTeam(row.away_team), homeTeam: normalizeTeam(row.home_team), startTime: toIso(row.start_time), source: row.source };
  return { ...option, label: optionLabel(option) };
}

async function loadGameOptionsFromGames(): Promise<MlbBatterBoxGameOption[]> {
  const rows = await prisma.$queryRaw<RawGameOption[]>`
    SELECT COALESCE(g."externalEventId", g.id) AS game_id, away.abbreviation AS away_team, home.abbreviation AS home_team, g."startTime" AS start_time, 'games'::text AS source
    FROM games g
    JOIN teams away ON away.id = g."awayTeamId"
    JOIN teams home ON home.id = g."homeTeamId"
    JOIN leagues l ON l.id = g."leagueId"
    WHERE (UPPER(l.key) = 'MLB' OR UPPER(l.name) LIKE '%MLB%' OR l.sport::text = 'BASEBALL')
      AND g."startTime" >= NOW() - INTERVAL '36 hours'
      AND g."startTime" <= NOW() + INTERVAL '21 days'
    ORDER BY CASE WHEN g.status = 'PREGAME' THEN 0 WHEN g.status = 'LIVE' THEN 1 ELSE 2 END, ABS(EXTRACT(EPOCH FROM (g."startTime" - NOW()))) ASC
    LIMIT 12;
  `;
  return rows.map(toOption);
}

async function loadGameOptionsFromLineups(): Promise<MlbBatterBoxGameOption[]> {
  const rows = await prisma.$queryRaw<RawGameOption[]>`
    WITH latest AS (
      SELECT DISTINCT ON (game_id, team) game_id, team, captured_at FROM mlb_lineup_snapshots ORDER BY game_id, team, captured_at DESC
    ), paired AS (
      SELECT game_id, ARRAY_AGG(team ORDER BY team) AS teams, MAX(captured_at) AS captured_at FROM latest GROUP BY game_id HAVING COUNT(DISTINCT team) >= 2
    )
    SELECT game_id, teams[1] AS away_team, teams[2] AS home_team, captured_at AS start_time, 'lineups'::text AS source FROM paired ORDER BY captured_at DESC LIMIT 12;
  `;
  return rows.map(toOption);
}

async function loadGameOptionsFromRatings(): Promise<MlbBatterBoxGameOption[]> {
  const rows = await prisma.$queryRaw<RawGameOption[]>`
    WITH hitter_teams AS (
      SELECT team, COUNT(*) AS hitters, MAX(snapshot_at) AS latest_at FROM mlb_player_ratings GROUP BY team HAVING COUNT(*) >= 5
    ), pitcher_teams AS (
      SELECT team, COUNT(*) AS pitchers FROM mlb_pitcher_ratings GROUP BY team HAVING COUNT(*) >= 1
    ), teams AS (
      SELECT h.team, h.latest_at FROM hitter_teams h LEFT JOIN pitcher_teams p ON UPPER(p.team) = UPPER(h.team) ORDER BY h.latest_at DESC, h.hitters DESC LIMIT 8
    )
    SELECT CONCAT('ratings-', a.team, '-', b.team) AS game_id, a.team AS away_team, b.team AS home_team, GREATEST(a.latest_at, b.latest_at) AS start_time, 'ratings'::text AS source
    FROM teams a JOIN teams b ON a.team < b.team ORDER BY GREATEST(a.latest_at, b.latest_at) DESC LIMIT 12;
  `;
  return rows.map(toOption);
}

export async function discoverMlbBatterBoxGameOptions(): Promise<MlbBatterBoxGameOption[]> {
  if (!hasUsableServerDatabaseUrl()) return [];
  await ensureMlbRosterIntelligenceTables();
  const options: MlbBatterBoxGameOption[] = [];
  try { options.push(...await loadGameOptionsFromGames()); } catch { /* schedule table may be empty */ }
  try { options.push(...await loadGameOptionsFromLineups()); } catch { /* lineup table may be empty */ }
  try { options.push(...await loadGameOptionsFromRatings()); } catch { /* ratings table may be empty */ }
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = `${option.gameId}:${option.awayTeam}:${option.homeTeam}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

async function countHitters(team: string) {
  const rows = await prisma.$queryRaw<CountRow[]>`SELECT COUNT(*) AS count FROM mlb_player_ratings WHERE UPPER(team) = UPPER(${team});`;
  return normalizeCount(rows[0]?.count);
}

async function countPitchers(team: string) {
  const rows = await prisma.$queryRaw<CountRow[]>`SELECT COUNT(*) AS count FROM mlb_pitcher_ratings WHERE UPPER(team) = UPPER(${team});`;
  return normalizeCount(rows[0]?.count);
}

async function countLineups(gameId: string, team: string) {
  const rows = await prisma.$queryRaw<CountRow[]>`SELECT COUNT(*) AS count FROM mlb_lineup_snapshots WHERE game_id = ${gameId} AND UPPER(team) = UPPER(${team});`;
  return normalizeCount(rows[0]?.count);
}

async function latestFallbackHitters(team: string): Promise<MlbProjectionRating[]> {
  return prisma.$queryRaw<MlbProjectionRating[]>`
    SELECT DISTINCT ON (player_id)
      player_id AS id, player_name AS name, team, role_tier,
      contact, power, discipline, vs_lhp, vs_rhp, baserunning, fielding, current_form,
      NULL::double precision AS xera_quality, NULL::double precision AS fip_quality, NULL::double precision AS k_bb,
      NULL::double precision AS hr_risk, NULL::double precision AS groundball_rate, NULL::double precision AS platoon_split,
      NULL::double precision AS stamina, NULL::double precision AS recent_workload, NULL::double precision AS arsenal_quality,
      overall, metrics_json
    FROM mlb_player_ratings
    WHERE UPPER(team) = UPPER(${team})
    ORDER BY player_id, snapshot_at DESC;
  `;
}

async function latestFallbackPitchers(team: string): Promise<MlbProjectionRating[]> {
  return prisma.$queryRaw<MlbProjectionRating[]>`
    SELECT DISTINCT ON (pitcher_id)
      pitcher_id AS id, pitcher_name AS name, team, role_tier,
      NULL::double precision AS contact, NULL::double precision AS power, NULL::double precision AS discipline,
      NULL::double precision AS vs_lhp, NULL::double precision AS vs_rhp, NULL::double precision AS baserunning,
      NULL::double precision AS fielding, NULL::double precision AS current_form,
      xera_quality, fip_quality, k_bb, hr_risk, groundball_rate, platoon_split, stamina, recent_workload, arsenal_quality,
      overall, metrics_json
    FROM mlb_pitcher_ratings
    WHERE UPPER(team) = UPPER(${team})
    ORDER BY pitcher_id, snapshot_at DESC;
  `;
}

async function latestFallbackLineup(gameId: string, team: string): Promise<MlbProjectionLineup | null> {
  const rows = await prisma.$queryRaw<RawLineupRow[]>`
    SELECT confirmed, batting_order_json, bench_json, starting_pitcher_id, starting_pitcher_name,
      available_relievers_json, unavailable_relievers_json, injuries_json, source, captured_at
    FROM mlb_lineup_snapshots
    WHERE game_id = ${gameId} AND UPPER(team) = UPPER(${team})
    ORDER BY captured_at DESC
    LIMIT 1;
  `;
  return rows[0] ?? null;
}

async function buildFallbackTeamContext(gameId: string, team: string): Promise<MlbProjectionTeamContext> {
  const [lineup, hitters, pitchers] = await Promise.all([
    latestFallbackLineup(gameId, team),
    latestFallbackHitters(team),
    latestFallbackPitchers(team)
  ]);
  return { team, lineup, hitters, pitchers };
}

async function buildDiagnostics(args: { gameId: string | null; awayTeam: string | null; homeTeam: string | null; selectedGame: MlbBatterBoxGameOption | null; gameOptions: MlbBatterBoxGameOption[]; paramsReady: boolean; baseWarnings?: string[] }): Promise<MlbBatterBoxDiagnostics> {
  const diagnostics: MlbBatterBoxDiagnostics = {
    databaseReady: hasUsableServerDatabaseUrl(),
    paramsReady: args.paramsReady,
    selectedGame: args.selectedGame,
    gameOptions: args.gameOptions,
    searched: { gameId: args.gameId, awayTeam: args.awayTeam, homeTeam: args.homeTeam },
    counts: { awayHitters: 0, homeHitters: 0, awayPitchers: 0, homePitchers: 0, awayLineups: 0, homeLineups: 0 },
    warnings: [...(args.baseWarnings ?? [])]
  };
  if (!diagnostics.databaseReady) {
    diagnostics.warnings.push("DATABASE_URL is unavailable to the server runtime.");
    return diagnostics;
  }
  await ensureMlbRosterIntelligenceTables();
  if (!args.awayTeam || !args.homeTeam) {
    diagnostics.warnings.push("No matchup selected yet.");
    return diagnostics;
  }
  diagnostics.counts.awayHitters = await countHitters(args.awayTeam);
  diagnostics.counts.homeHitters = await countHitters(args.homeTeam);
  diagnostics.counts.awayPitchers = await countPitchers(args.awayTeam);
  diagnostics.counts.homePitchers = await countPitchers(args.homeTeam);
  if (args.gameId) {
    diagnostics.counts.awayLineups = await countLineups(args.gameId, args.awayTeam);
    diagnostics.counts.homeLineups = await countLineups(args.gameId, args.homeTeam);
  }
  if (diagnostics.counts.awayHitters < 5) diagnostics.warnings.push(`${args.awayTeam} has only ${diagnostics.counts.awayHitters} hitter rating rows.`);
  if (diagnostics.counts.homeHitters < 5) diagnostics.warnings.push(`${args.homeTeam} has only ${diagnostics.counts.homeHitters} hitter rating rows.`);
  if (diagnostics.counts.awayPitchers < 1) diagnostics.warnings.push(`${args.awayTeam} has no pitcher rating rows.`);
  if (diagnostics.counts.homePitchers < 1) diagnostics.warnings.push(`${args.homeTeam} has no pitcher rating rows.`);
  if (args.gameId && diagnostics.counts.awayLineups < 1) diagnostics.warnings.push(`${args.awayTeam} has no lineup snapshot for ${args.gameId}; ratings-order fallback will be used.`);
  if (args.gameId && diagnostics.counts.homeLineups < 1) diagnostics.warnings.push(`${args.homeTeam} has no lineup snapshot for ${args.gameId}; ratings-order fallback will be used.`);
  return diagnostics;
}

function projectFromContexts(args: { away: MlbProjectionTeamContext; home: MlbProjectionTeamContext; search: SearchParamsLike }) {
  return projectMlbPlayerStatsForGame({
    away: args.away,
    home: args.home,
    awayRuns: numberParam(args.search, "awayProjectedRuns", numberParam(args.search, "awayRuns", 4.3)),
    homeRuns: numberParam(args.search, "homeProjectedRuns", numberParam(args.search, "homeRuns", 4.5)),
    awayOffenseScore: numberParam(args.search, "awayOffenseScore", 70),
    homeOffenseScore: numberParam(args.search, "homeOffenseScore", 70),
    awayWinProbability: numberParam(args.search, "awayWinProbability", 0.5),
    homeWinProbability: numberParam(args.search, "homeWinProbability", 0.5)
  });
}

export async function loadMlbBatterBoxProjection(search: SearchParamsLike): Promise<MlbBatterBoxLoadResult> {
  const directGameId = textParam(search, "gameId").trim();
  const directAwayTeam = normalizeTeam(textParam(search, "awayTeam"));
  const directHomeTeam = normalizeTeam(textParam(search, "homeTeam"));
  const gameOptions = await discoverMlbBatterBoxGameOptions();
  const selectedGame: MlbBatterBoxGameOption | null = directGameId && directAwayTeam && directHomeTeam
    ? { gameId: directGameId, awayTeam: directAwayTeam, homeTeam: directHomeTeam, startTime: null, source: "query", label: `${directAwayTeam} @ ${directHomeTeam} · query` }
    : gameOptions[0] ?? null;

  if (!selectedGame) {
    const diagnostics = await buildDiagnostics({ gameId: null, awayTeam: null, homeTeam: null, selectedGame: null, gameOptions, paramsReady: false, baseWarnings: ["No scheduled game, lineup pair, or ratings-only matchup could be discovered."] });
    return { projection: null, diagnostics, error: "No MLB Batter Box matchup could be discovered from Railway data." };
  }

  const context = await buildMlbV8PlayerImpactContext({ gameId: selectedGame.gameId, awayTeam: selectedGame.awayTeam, homeTeam: selectedGame.homeTeam });
  const diagnostics = await buildDiagnostics({
    gameId: selectedGame.gameId,
    awayTeam: selectedGame.awayTeam,
    homeTeam: selectedGame.homeTeam,
    selectedGame,
    gameOptions,
    paramsReady: true,
    baseWarnings: selectedGame.source === "ratings" ? ["Using ratings-only synthetic matchup because no scheduled/lineup game was available."] : []
  });

  if (context.available && context.away && context.home && context.away.hitters.length && context.home.hitters.length) {
    return { projection: projectFromContexts({ away: context.away as MlbProjectionTeamContext, home: context.home as MlbProjectionTeamContext, search }), diagnostics, error: null };
  }

  const [awayFallback, homeFallback] = await Promise.all([
    buildFallbackTeamContext(selectedGame.gameId, selectedGame.awayTeam),
    buildFallbackTeamContext(selectedGame.gameId, selectedGame.homeTeam)
  ]);

  if (awayFallback.hitters.length && homeFallback.hitters.length) {
    diagnostics.warnings.push(`V8 context fallback used: ${context.reason ?? "exact team-key lookup did not return full hitter context"}.`);
    return { projection: projectFromContexts({ away: awayFallback, home: homeFallback, search }), diagnostics, error: null };
  }

  return {
    projection: null,
    diagnostics,
    error: context.reason ?? "Roster intelligence unavailable for this Batter Box matchup."
  };
}
