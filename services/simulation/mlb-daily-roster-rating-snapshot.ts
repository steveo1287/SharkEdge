import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbRosterIntelligenceTables } from "@/services/simulation/mlb-roster-intelligence";
import {
  buildMlbEliteRatingSystem,
  type MlbEliteRatingBuild,
  type MlbEliteTeamContextRow
} from "@/services/simulation/mlb-elite-rating-system";
import type {
  MlbRawHitterStatRow,
  MlbRawPitcherStatRow
} from "@/services/simulation/mlb-real-player-ratings";

export type MlbDailyRosterSnapshotOptions = {
  season?: number;
  rosterType?: "active" | "40Man" | "fullSeason";
  includeStatsApiStats?: boolean;
  persist?: boolean;
  minHitterPlateAppearances?: number;
  minPitcherBattersFaced?: number;
  fetchConcurrency?: number;
  statsApiBaseUrl?: string;
};

export type MlbDailyRosterPlayer = {
  mlbId: string;
  name: string;
  team: string;
  teamId: number;
  primaryPosition: string | null;
  rosterStatus: string | null;
  jerseyNumber: string | null;
  isPitcher: boolean;
  bats: "L" | "R" | "S" | null;
  throws: "L" | "R" | null;
};

export type MlbDailyRosterRatingSnapshotReport = {
  ok: boolean;
  modelVersion: "mlb-daily-roster-rating-snapshot-v1";
  season: number;
  rosterType: string;
  generatedAt: string;
  persisted: boolean;
  teamsExpected: number;
  teamsCovered: number;
  playersSeen: number;
  hittersRated: number;
  pitchersRated: number;
  teams: Array<{
    team: string;
    teamId: number;
    players: number;
    hitters: number;
    pitchers: number;
    hitterRatings: number;
    pitcherRatings: number;
    rosterComplete: boolean;
  }>;
  ratings: MlbEliteRatingBuild;
  warnings: string[];
};

type StatsApiTeam = {
  id: number;
  abbreviation?: string;
  teamCode?: string;
  fileCode?: string;
  name?: string;
  active?: boolean;
};

type StatsApiRosterPerson = {
  person?: {
    id?: number;
    fullName?: string;
    batSide?: { code?: string };
    pitchHand?: { code?: string };
  };
  jerseyNumber?: string;
  position?: { abbreviation?: string; code?: string; type?: string; name?: string };
  status?: { code?: string; description?: string };
};

type StatsApiStatSplit = {
  stat?: Record<string, unknown>;
  team?: { id?: number; abbreviation?: string; name?: string };
  player?: { id?: number; fullName?: string };
};

const MLB_TEAM_FALLBACK: Array<{ id: number; abbr: string }> = [
  { id: 108, abbr: "LAA" },
  { id: 109, abbr: "ARI" },
  { id: 110, abbr: "BAL" },
  { id: 111, abbr: "BOS" },
  { id: 112, abbr: "CHC" },
  { id: 113, abbr: "CIN" },
  { id: 114, abbr: "CLE" },
  { id: 115, abbr: "COL" },
  { id: 116, abbr: "DET" },
  { id: 117, abbr: "HOU" },
  { id: 118, abbr: "KC" },
  { id: 119, abbr: "LAD" },
  { id: 120, abbr: "WSH" },
  { id: 121, abbr: "NYM" },
  { id: 133, abbr: "OAK" },
  { id: 134, abbr: "PIT" },
  { id: 135, abbr: "SD" },
  { id: 136, abbr: "SEA" },
  { id: 137, abbr: "SF" },
  { id: 138, abbr: "STL" },
  { id: 139, abbr: "TB" },
  { id: 140, abbr: "TEX" },
  { id: 141, abbr: "TOR" },
  { id: 142, abbr: "MIN" },
  { id: 143, abbr: "PHI" },
  { id: 144, abbr: "ATL" },
  { id: 145, abbr: "CWS" },
  { id: 146, abbr: "MIA" },
  { id: 147, abbr: "NYY" },
  { id: 158, abbr: "MIL" }
];

const TEAM_ALIASES: Record<string, string> = {
  AZ: "ARI",
  ARI: "ARI",
  ATH: "OAK",
  OAK: "OAK",
  CWS: "CWS",
  CHW: "CWS",
  WSX: "CWS",
  SD: "SD",
  SDP: "SD",
  SF: "SF",
  SFG: "SF",
  TB: "TB",
  TBR: "TB",
  KC: "KC",
  KCR: "KC",
  WSH: "WSH",
  WAS: "WSH",
  LAD: "LAD",
  LAA: "LAA",
  NYY: "NYY",
  NYM: "NYM"
};

function seasonYear() {
  return new Date().getUTCFullYear();
}

function normalizeTeam(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  return TEAM_ALIASES[raw] ?? raw;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim().replace("%", "");
    if (trimmed && Number.isFinite(Number(trimmed))) return Number(trimmed);
  }
  return null;
}

function num(stat: Record<string, unknown>, keys: string[], fallback: number | null = null) {
  for (const key of keys) {
    const parsed = asNumber(stat[key]);
    if (parsed != null) return parsed;
  }
  return fallback;
}

function pct(value: number | null) {
  if (value == null) return null;
  return value > 1.5 ? value / 100 : value;
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function safeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function snapshotId(kind: "hitter" | "pitcher", season: number, playerId: string) {
  return `daily:${kind}:${season}:${playerId}`;
}

function statsApiBase(options: MlbDailyRosterSnapshotOptions) {
  return (options.statsApiBaseUrl ?? process.env.MLB_STATS_API_BASE_URL ?? "https://statsapi.mlb.com").replace(/\/+$/, "");
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`MLB Stats API request failed ${response.status}: ${url}`);
  return await response.json() as T;
}

async function mapLimit<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) break;
      out[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

async function fetchMlbTeams(options: MlbDailyRosterSnapshotOptions): Promise<Array<{ id: number; abbr: string }>> {
  try {
    const url = `${statsApiBase(options)}/api/v1/teams?sportId=1&activeStatus=Y&season=${options.season ?? seasonYear()}`;
    const payload = await fetchJson<{ teams?: StatsApiTeam[] }>(url);
    const teams = (payload.teams ?? [])
      .filter((team) => team.id)
      .map((team) => ({ id: team.id, abbr: normalizeTeam(team.abbreviation ?? team.teamCode ?? team.fileCode ?? team.name) }))
      .filter((team) => team.abbr);
    return teams.length === 30 ? teams : MLB_TEAM_FALLBACK;
  } catch {
    return MLB_TEAM_FALLBACK;
  }
}

async function fetchTeamRoster(team: { id: number; abbr: string }, options: MlbDailyRosterSnapshotOptions): Promise<MlbDailyRosterPlayer[]> {
  const rosterType = options.rosterType ?? "active";
  const url = `${statsApiBase(options)}/api/v1/teams/${team.id}/roster?rosterType=${encodeURIComponent(rosterType)}&season=${options.season ?? seasonYear()}&hydrate=person`;
  const payload = await fetchJson<{ roster?: StatsApiRosterPerson[] }>(url);
  return (payload.roster ?? []).flatMap((row) => {
    const person = row.person;
    if (!person?.id || !person.fullName) return [];
    const position = row.position?.abbreviation ?? row.position?.code ?? null;
    const positionType = String(row.position?.type ?? "").toLowerCase();
    const isPitcher = position === "P" || positionType.includes("pitcher");
    const batCode = String(person.batSide?.code ?? "").toUpperCase();
    const throwCode = String(person.pitchHand?.code ?? "").toUpperCase();
    return [{
      mlbId: String(person.id),
      name: person.fullName,
      team: team.abbr,
      teamId: team.id,
      primaryPosition: position,
      rosterStatus: row.status?.code ?? row.status?.description ?? null,
      jerseyNumber: row.jerseyNumber ?? null,
      isPitcher,
      bats: batCode === "L" || batCode === "R" || batCode === "S" ? batCode : null,
      throws: throwCode === "L" || throwCode === "R" ? throwCode : null
    }];
  });
}

async function fetchPlayerSeasonStat(playerId: string, group: "hitting" | "pitching", options: MlbDailyRosterSnapshotOptions): Promise<Record<string, unknown>> {
  if (options.includeStatsApiStats === false) return {};
  const season = options.season ?? seasonYear();
  const url = `${statsApiBase(options)}/api/v1/people/${playerId}/stats?stats=season&group=${group}&season=${season}`;
  try {
    const payload = await fetchJson<{ stats?: Array<{ splits?: StatsApiStatSplit[] }> }>(url);
    const split = payload.stats?.[0]?.splits?.[0];
    return split?.stat ?? {};
  } catch {
    return {};
  }
}

function hitterRowFromRoster(player: MlbDailyRosterPlayer, stat: Record<string, unknown>, season: number): MlbRawHitterStatRow {
  const pa = num(stat, ["plateAppearances", "pa"], 0) ?? 0;
  const ab = num(stat, ["atBats", "ab"], 0) ?? 0;
  const hits = num(stat, ["hits", "h"], 0) ?? 0;
  const doubles = num(stat, ["doubles", "2b"], 0) ?? 0;
  const triples = num(stat, ["triples", "3b"], 0) ?? 0;
  const homeRuns = num(stat, ["homeRuns", "hr"], 0) ?? 0;
  const walks = num(stat, ["baseOnBalls", "walks", "bb"], 0) ?? 0;
  const strikeouts = num(stat, ["strikeOuts", "strikeouts", "so"], 0) ?? 0;
  const totalBases = num(stat, ["totalBases", "tb"], hits + doubles + triples * 2 + homeRuns * 3) ?? 0;
  const avg = num(stat, ["avg", "battingAverage"], ab > 0 ? hits / ab : 0.245);
  const obp = num(stat, ["obp", "onBasePercentage"], pa > 0 ? (hits + walks) / pa : 0.315);
  const slg = num(stat, ["slg", "slugging"], ab > 0 ? totalBases / ab : 0.41);
  return {
    mlbId: player.mlbId,
    name: player.name,
    team: player.team,
    position: player.primaryPosition,
    bats: player.bats,
    season,
    plateAppearances: pa,
    atBats: ab,
    hits,
    doubles,
    triples,
    homeRuns,
    walks,
    strikeouts,
    stolenBases: num(stat, ["stolenBases", "sb"], 0),
    caughtStealing: num(stat, ["caughtStealing", "cs"], 0),
    totalBases,
    avg,
    obp,
    slg,
    ops: num(stat, ["ops"], (obp ?? 0.315) + (slg ?? 0.41)),
    iso: (slg ?? 0.41) - (avg ?? 0.245),
    wrcPlus: num(stat, ["wrcPlus", "wRC+"], null),
    raw: { roster: player, statsApiSeason: stat }
  };
}

function pitcherRowFromRoster(player: MlbDailyRosterPlayer, stat: Record<string, unknown>, season: number): MlbRawPitcherStatRow {
  const ip = num(stat, ["inningsPitched", "ip"], 0) ?? 0;
  const games = num(stat, ["gamesPlayed", "games", "g"], 0) ?? 0;
  const starts = num(stat, ["gamesStarted", "gs"], player.isPitcher && games > 12 ? Math.min(games, 1) : 0) ?? 0;
  const battersFaced = num(stat, ["battersFaced", "bf"], ip * 4.25) ?? 0;
  const strikeouts = num(stat, ["strikeOuts", "strikeouts", "so"], 0) ?? 0;
  const walks = num(stat, ["baseOnBalls", "walks", "bb"], 0) ?? 0;
  const hits = num(stat, ["hits", "hitsAllowed", "h"], 0) ?? 0;
  const homeRuns = num(stat, ["homeRuns", "homeRunsAllowed", "hr"], 0) ?? 0;
  const earnedRuns = num(stat, ["earnedRuns", "er"], 0) ?? 0;
  const era = num(stat, ["era"], ip > 0 ? earnedRuns * 9 / ip : 4.2);
  const whip = num(stat, ["whip"], ip > 0 ? (hits + walks) / ip : 1.3);
  return {
    mlbId: player.mlbId,
    name: player.name,
    team: player.team,
    position: player.primaryPosition,
    throws: player.throws,
    role: starts >= 1 ? "starter" : "reliever",
    season,
    gamesStarted: starts,
    games,
    inningsPitched: ip,
    battersFaced,
    strikeouts,
    walks,
    hitsAllowed: hits,
    homeRunsAllowed: homeRuns,
    earnedRuns,
    era,
    fip: num(stat, ["fip"], null),
    whip,
    strikeoutsPer9: num(stat, ["strikeoutsPer9Inn", "strikeoutsPer9", "k9"], ip > 0 ? strikeouts * 9 / ip : 8.4),
    walksPer9: num(stat, ["walksPer9Inn", "walksPer9", "bb9"], ip > 0 ? walks * 9 / ip : 3.2),
    hitsPer9: num(stat, ["hitsPer9Inn", "hitsPer9", "h9"], ip > 0 ? hits * 9 / ip : 8.5),
    homeRunsPer9: num(stat, ["homeRunsPer9", "hr9"], ip > 0 ? homeRuns * 9 / ip : 1.1),
    raw: { roster: player, statsApiSeason: stat }
  };
}

function teamContextRows(teams: Array<{ id: number; abbr: string }>): MlbEliteTeamContextRow[] {
  return teams.map((team) => ({ team: team.abbr }));
}

async function persistRatings(ratings: MlbEliteRatingBuild, roster: MlbDailyRosterPlayer[], season: number) {
  const rosterById = new Map(roster.map((player) => [player.mlbId, player]));
  for (const row of ratings.hitters) {
    const player = rosterById.get(row.id);
    await prisma.$executeRaw`
      INSERT INTO mlb_player_ratings (
        id, player_id, player_name, team, season, primary_position, role_tier,
        contact, power, discipline, vs_lhp, vs_rhp, baserunning, fielding, current_form, overall,
        metrics_json, source, snapshot_at
      ) VALUES (
        ${snapshotId("hitter", season, row.id)}, ${row.id}, ${row.name}, ${row.team ?? player?.team ?? "UNKNOWN"}, ${season}, ${player?.primaryPosition ?? null}, ${row.role_tier ?? "UNKNOWN"},
        ${row.contact ?? null}, ${row.power ?? null}, ${row.discipline ?? null}, ${row.vs_lhp ?? null}, ${row.vs_rhp ?? null}, ${row.baserunning ?? null}, ${row.fielding ?? null}, ${row.current_form ?? null}, ${row.overall ?? null},
        ${safeJson({ ...(row.metrics_json ?? {}), snapshotSource: "mlb-daily-roster-rating-snapshot-v1", roster: player ?? null })}::jsonb, 'mlb-daily-roster-rating-snapshot-v1', now()
      )
      ON CONFLICT (id) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        team = EXCLUDED.team,
        primary_position = EXCLUDED.primary_position,
        role_tier = EXCLUDED.role_tier,
        contact = EXCLUDED.contact,
        power = EXCLUDED.power,
        discipline = EXCLUDED.discipline,
        vs_lhp = EXCLUDED.vs_lhp,
        vs_rhp = EXCLUDED.vs_rhp,
        baserunning = EXCLUDED.baserunning,
        fielding = EXCLUDED.fielding,
        current_form = EXCLUDED.current_form,
        overall = EXCLUDED.overall,
        metrics_json = EXCLUDED.metrics_json,
        source = EXCLUDED.source,
        snapshot_at = EXCLUDED.snapshot_at,
        updated_at = now();
    `;
  }
  for (const row of ratings.pitchers) {
    const player = rosterById.get(row.id);
    await prisma.$executeRaw`
      INSERT INTO mlb_pitcher_ratings (
        id, pitcher_id, pitcher_name, team, season, role_tier,
        xera_quality, fip_quality, k_bb, hr_risk, groundball_rate, platoon_split, stamina, recent_workload, arsenal_quality, overall,
        metrics_json, source, snapshot_at
      ) VALUES (
        ${snapshotId("pitcher", season, row.id)}, ${row.id}, ${row.name}, ${row.team ?? player?.team ?? "UNKNOWN"}, ${season}, ${row.role_tier ?? "UNKNOWN"},
        ${row.xera_quality ?? null}, ${row.fip_quality ?? null}, ${row.k_bb ?? null}, ${row.hr_risk ?? null}, ${row.groundball_rate ?? null}, ${row.platoon_split ?? null}, ${row.stamina ?? null}, ${row.recent_workload ?? null}, ${row.arsenal_quality ?? null}, ${row.overall ?? null},
        ${safeJson({ ...(row.metrics_json ?? {}), snapshotSource: "mlb-daily-roster-rating-snapshot-v1", roster: player ?? null })}::jsonb, 'mlb-daily-roster-rating-snapshot-v1', now()
      )
      ON CONFLICT (id) DO UPDATE SET
        pitcher_name = EXCLUDED.pitcher_name,
        team = EXCLUDED.team,
        role_tier = EXCLUDED.role_tier,
        xera_quality = EXCLUDED.xera_quality,
        fip_quality = EXCLUDED.fip_quality,
        k_bb = EXCLUDED.k_bb,
        hr_risk = EXCLUDED.hr_risk,
        groundball_rate = EXCLUDED.groundball_rate,
        platoon_split = EXCLUDED.platoon_split,
        stamina = EXCLUDED.stamina,
        recent_workload = EXCLUDED.recent_workload,
        arsenal_quality = EXCLUDED.arsenal_quality,
        overall = EXCLUDED.overall,
        metrics_json = EXCLUDED.metrics_json,
        source = EXCLUDED.source,
        snapshot_at = EXCLUDED.snapshot_at,
        updated_at = now();
    `;
  }
}

export async function buildDailyMlbRosterRatingSnapshots(options: MlbDailyRosterSnapshotOptions = {}): Promise<MlbDailyRosterRatingSnapshotReport> {
  const season = options.season ?? seasonYear();
  const rosterType = options.rosterType ?? "active";
  const generatedAt = new Date().toISOString();
  const teams = await fetchMlbTeams({ ...options, season, rosterType });
  const concurrency = Math.max(1, Math.min(12, Math.round(options.fetchConcurrency ?? 6)));
  const rosterByTeam = await mapLimit(teams, concurrency, (team) => fetchTeamRoster(team, { ...options, season, rosterType }));
  const roster = rosterByTeam.flat();
  const hitterPlayers = roster.filter((player) => !player.isPitcher);
  const pitcherPlayers = roster.filter((player) => player.isPitcher);

  const hitterStats = await mapLimit(hitterPlayers, concurrency, async (player) => hitterRowFromRoster(player, await fetchPlayerSeasonStat(player.mlbId, "hitting", { ...options, season, rosterType }), season));
  const pitcherStats = await mapLimit(pitcherPlayers, concurrency, async (player) => pitcherRowFromRoster(player, await fetchPlayerSeasonStat(player.mlbId, "pitching", { ...options, season, rosterType }), season));

  const ratings = buildMlbEliteRatingSystem({
    season,
    hitterStats,
    pitcherStats,
    teamContexts: teamContextRows(teams),
    options: {
      minHitterPlateAppearances: options.minHitterPlateAppearances ?? 0,
      minPitcherBattersFaced: options.minPitcherBattersFaced ?? 0,
      theShowPriorWeight: 0
    }
  });

  const warnings = [...ratings.warnings];
  if (teams.length !== 30) warnings.push(`Expected 30 MLB teams, fetched ${teams.length}.`);
  if (roster.length < 650) warnings.push(`Only ${roster.length} roster players were fetched; active roster coverage may be incomplete.`);
  if (ratings.hitters.length < 300) warnings.push(`Only ${ratings.hitters.length} hitters received ratings.`);
  if (ratings.pitchers.length < 250) warnings.push(`Only ${ratings.pitchers.length} pitchers received ratings.`);

  const persist = options.persist !== false;
  if (persist) {
    if (!hasUsableServerDatabaseUrl()) warnings.push("No usable database URL; snapshot was built but not persisted.");
    else {
      await ensureMlbRosterIntelligenceTables();
      await persistRatings(ratings, roster, season);
    }
  }

  const reportTeams = teams.map((team) => {
    const players = roster.filter((player) => player.team === team.abbr);
    const hitters = players.filter((player) => !player.isPitcher);
    const pitchers = players.filter((player) => player.isPitcher);
    const hitterRatings = ratings.hitters.filter((row) => row.team === team.abbr).length;
    const pitcherRatings = ratings.pitchers.filter((row) => row.team === team.abbr).length;
    return {
      team: team.abbr,
      teamId: team.id,
      players: players.length,
      hitters: hitters.length,
      pitchers: pitchers.length,
      hitterRatings,
      pitcherRatings,
      rosterComplete: players.length >= 20 && hitterRatings >= Math.max(8, hitters.length * 0.75) && pitcherRatings >= Math.max(8, pitchers.length * 0.75)
    };
  });

  return {
    ok: reportTeams.length === 30 && reportTeams.every((team) => team.rosterComplete),
    modelVersion: "mlb-daily-roster-rating-snapshot-v1",
    season,
    rosterType,
    generatedAt,
    persisted: persist && hasUsableServerDatabaseUrl(),
    teamsExpected: 30,
    teamsCovered: reportTeams.filter((team) => team.rosterComplete).length,
    playersSeen: roster.length,
    hittersRated: ratings.hitters.length,
    pitchersRated: ratings.pitchers.length,
    teams: reportTeams,
    ratings,
    warnings
  };
}
