import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import {
  calculateMlbHitterOverall,
  calculateMlbPitcherOverall,
  classifyMlbHitterRole,
  classifyMlbStarterRole,
  ensureMlbRosterIntelligenceTables,
  type MlbHitterSkillInput,
  type MlbPitcherSkillInput
} from "@/services/simulation/mlb-roster-intelligence";

type PlayerStatRow = {
  playerId: string;
  playerName: string;
  teamAbbr: string | null;
  position: string | null;
  starter: boolean | null;
  statsJson: unknown;
  updatedAt: Date | string;
};

type TeamStatRow = {
  gameId: string;
  teamAbbr: string | null;
  statsJson: unknown;
  updatedAt: Date | string;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function num(record: JsonRecord, keys: string[], fallback: number | null = null) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

function nested(record: JsonRecord, key: string) {
  return asRecord(record[key]);
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function scale(value: number | null, min: number, max: number, fallback = 55) {
  if (value == null || !Number.isFinite(value)) return fallback;
  if (value >= 0 && value <= 1 && max > 1) return clamp(value * 100);
  return clamp(((value - min) / Math.max(0.0001, max - min)) * 100);
}

function inverseScale(value: number | null, min: number, max: number, fallback = 55) {
  if (value == null || !Number.isFinite(value)) return fallback;
  return clamp(100 - ((value - min) / Math.max(0.0001, max - min)) * 100);
}

function avg(values: Array<number | null | undefined>, fallback = 55) {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : fallback;
}

function season() {
  return new Date().getUTCFullYear();
}

function safeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function pitcherLike(row: PlayerStatRow, stats: JsonRecord) {
  const pos = String(row.position ?? stats.position ?? stats.primaryPosition ?? "").toUpperCase();
  return pos.includes("P") || ["outsPitched", "inningsPitched", "pitchesThrown", "pitchingStrikeouts", "era", "fip", "xera", "xERA"].some((key) => stats[key] != null);
}

function hitterInput(stats: JsonRecord): MlbHitterSkillInput {
  const statcast = nested(stats, "statcast");
  const xwoba = num(statcast, ["xwoba", "xwOBA"], num(stats, ["xwoba", "xwOBA"]));
  const hardHit = num(statcast, ["hardHitRate", "hard_hit_rate"], num(stats, ["hardHitRate", "hard_hit_rate"]));
  const barrel = num(statcast, ["barrelRate", "barrel_rate"], num(stats, ["barrelRate", "barrel_rate"]));
  const kRate = num(stats, ["strikeoutRate", "kRate", "k_pct"], num(statcast, ["strikeoutRate", "kRate", "k_pct"]));
  const bbRate = num(stats, ["walkRate", "bbRate", "bb_pct"], num(statcast, ["walkRate", "bbRate", "bb_pct"]));
  const ops = num(stats, ["ops", "OPS"]);
  const wrc = num(stats, ["wrcPlus", "wRC+", "wrc_plus"]);
  const avgStat = num(stats, ["avg", "battingAverage", "ba"]);

  return {
    contact: avg([scale(xwoba, 0.25, 0.44), scale(avgStat, 0.18, 0.34), inverseScale(kRate, 0.08, 0.34)], 58),
    power: avg([scale(hardHit, 25, 58), scale(barrel, 2, 18), scale(ops, 0.58, 1.02)], 56),
    discipline: avg([scale(bbRate, 0.04, 0.16), inverseScale(kRate, 0.08, 0.34), scale(wrc, 70, 165)], 55),
    vsLhp: scale(num(stats, ["vsLhp", "vs_lhp", "wobaVsLhp", "opsVsLhp"]), 0.25, 0.95, 55),
    vsRhp: scale(num(stats, ["vsRhp", "vs_rhp", "wobaVsRhp", "opsVsRhp"]), 0.25, 0.95, 55),
    baserunning: scale(num(stats, ["baserunning", "sprintSpeed", "speedScore"]), 20, 90, 52),
    fielding: scale(num(stats, ["fielding", "outsAboveAverage", "defenseScore"]), -10, 18, 52),
    currentForm: avg([scale(num(stats, ["last14Ops", "recentOps", "currentForm"]), 0.5, 1.1), scale(wrc, 70, 165)], 55)
  };
}

function pitcherInput(stats: JsonRecord): MlbPitcherSkillInput {
  const statcast = nested(stats, "statcast");
  const xera = num(statcast, ["xera", "xERA"], num(stats, ["xera", "xERA", "era"]));
  const fip = num(stats, ["fip", "FIP"]);
  const kRate = num(stats, ["strikeoutRate", "kRate", "k_pct", "pitchingStrikeoutRate"]);
  const bbRate = num(stats, ["walkRate", "bbRate", "bb_pct", "pitchingWalkRate"]);
  const hr9 = num(stats, ["hrPer9", "hr9", "homeRunsPer9"]);
  const gb = num(stats, ["groundballRate", "gbRate", "gb_pct"], num(statcast, ["groundballRate", "gbRate", "gb_pct"]));
  const pitches = num(stats, ["pitchesThrown", "recentPitches", "pitchesLastStart"]);
  const pitchMix = nested(nested(statcast, "pitching"), "pitchMix");
  const arsenalKeys = Object.keys(pitchMix).length;

  return {
    xeraQuality: inverseScale(xera, 2.2, 6.2, 58),
    fipQuality: inverseScale(fip, 2.4, 6.0, 58),
    kBb: avg([scale(kRate, 0.12, 0.36), inverseScale(bbRate, 0.03, 0.14)], 56),
    hrRisk: scale(hr9, 0.3, 2.1, 45),
    groundballRate: scale(gb, 0.28, 0.58, 54),
    platoonSplit: inverseScale(num(stats, ["platoonSplit", "splitPenalty"]), 0, 0.12, 55),
    stamina: scale(num(stats, ["inningsPitched", "outsPitched", "starterStamina"]), 3, 21, 56),
    recentWorkload: scale(pitches, 20, 110, 45),
    arsenalQuality: arsenalKeys ? clamp(48 + arsenalKeys * 8) : scale(num(stats, ["arsenalQuality", "pitchQuality"]), 0, 100, 55)
  };
}

async function latestPlayerStats(lookbackDays: number, limit: number): Promise<PlayerStatRow[]> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const rawRows = await prisma.playerGameStat.findMany({
    where: { updatedAt: { gte: since }, player: { league: { key: "MLB" } } },
    select: {
      playerId: true,
      starter: true,
      statsJson: true,
      updatedAt: true,
      player: { select: { name: true, position: true, team: { select: { abbreviation: true, name: true } } } }
    },
    orderBy: { updatedAt: "desc" },
    take: Math.max(50, Math.min(5000, limit))
  });
  const seen = new Set<string>();
  const rows: PlayerStatRow[] = [];
  for (const row of rawRows) {
    if (seen.has(row.playerId)) continue;
    seen.add(row.playerId);
    rows.push({
      playerId: row.playerId,
      playerName: row.player.name,
      teamAbbr: row.player.team.abbreviation ?? row.player.team.name,
      position: row.player.position,
      starter: row.starter,
      statsJson: row.statsJson,
      updatedAt: row.updatedAt
    });
  }
  return rows;
}

async function latestTeamStats(lookbackDays: number, limit: number): Promise<TeamStatRow[]> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const rawRows = await prisma.teamGameStat.findMany({
    where: { updatedAt: { gte: since }, team: { league: { key: "MLB" } } },
    select: { gameId: true, statsJson: true, updatedAt: true, team: { select: { abbreviation: true, name: true } } },
    orderBy: { updatedAt: "desc" },
    take: Math.max(50, Math.min(3000, limit))
  });
  const seen = new Set<string>();
  const rows: TeamStatRow[] = [];
  for (const row of rawRows) {
    const key = `${row.gameId}:${row.team.abbreviation ?? row.team.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ gameId: row.gameId, teamAbbr: row.team.abbreviation ?? row.team.name, statsJson: row.statsJson, updatedAt: row.updatedAt });
  }
  return rows;
}

async function insertHitter(row: PlayerStatRow, input: MlbHitterSkillInput) {
  const stats = asRecord(row.statsJson);
  const team = row.teamAbbr ?? "UNKNOWN";
  const overall = calculateMlbHitterOverall(input);
  const roleTier = classifyMlbHitterRole(overall);
  await prisma.$executeRaw`
    INSERT INTO mlb_player_ratings (
      id, player_id, player_name, team, season, primary_position, role_tier,
      contact, power, discipline, vs_lhp, vs_rhp, baserunning, fielding, current_form, overall,
      metrics_json, source, snapshot_at
    ) VALUES (
      ${crypto.randomUUID()}, ${row.playerId}, ${row.playerName}, ${team}, ${season()}, ${row.position ?? null}, ${roleTier},
      ${input.contact}, ${input.power}, ${input.discipline}, ${input.vsLhp}, ${input.vsRhp}, ${input.baserunning}, ${input.fielding}, ${input.currentForm}, ${overall},
      ${safeJson({ autoBuiltFrom: "player_game_stats", sourceUpdatedAt: row.updatedAt, raw: stats })}::jsonb, 'auto-player-game-stats', now()
    );
  `;
  return { playerId: row.playerId, name: row.playerName, team, overall, roleTier };
}

async function insertPitcher(row: PlayerStatRow, input: MlbPitcherSkillInput) {
  const stats = asRecord(row.statsJson);
  const team = row.teamAbbr ?? "UNKNOWN";
  const overall = calculateMlbPitcherOverall(input);
  const roleTier = classifyMlbStarterRole(overall);
  await prisma.$executeRaw`
    INSERT INTO mlb_pitcher_ratings (
      id, pitcher_id, pitcher_name, team, season, role_tier,
      xera_quality, fip_quality, k_bb, hr_risk, groundball_rate, platoon_split, stamina, recent_workload, arsenal_quality, overall,
      metrics_json, source, snapshot_at
    ) VALUES (
      ${crypto.randomUUID()}, ${row.playerId}, ${row.playerName}, ${team}, ${season()}, ${roleTier},
      ${input.xeraQuality}, ${input.fipQuality}, ${input.kBb}, ${input.hrRisk}, ${input.groundballRate}, ${input.platoonSplit}, ${input.stamina}, ${input.recentWorkload}, ${input.arsenalQuality}, ${overall},
      ${safeJson({ autoBuiltFrom: "player_game_stats", sourceUpdatedAt: row.updatedAt, raw: stats })}::jsonb, 'auto-player-game-stats', now()
    );
  `;
  return { pitcherId: row.playerId, name: row.playerName, team, overall, roleTier };
}

async function insertLineup(row: TeamStatRow) {
  const stats = asRecord(row.statsJson);
  const probablePitcherId = String(stats.probablePitcherId ?? stats.starterPitcherId ?? "").trim() || null;
  const probablePitcherName = String(stats.probablePitcherName ?? stats.starterPitcherName ?? "").trim() || null;
  const battingOrder = Array.isArray(stats.battingOrder) ? stats.battingOrder : [];
  const availableRelievers = Array.isArray(stats.availableRelievers) ? stats.availableRelievers : [];
  const unavailableRelievers = Array.isArray(stats.unavailableRelievers) ? stats.unavailableRelievers : [];
  const injuries = Array.isArray(stats.injuries) ? stats.injuries : [];
  await prisma.$executeRaw`
    INSERT INTO mlb_lineup_snapshots (
      id, game_id, team, confirmed, batting_order_json, bench_json, starting_pitcher_id, starting_pitcher_name,
      available_relievers_json, unavailable_relievers_json, injuries_json, source, captured_at
    ) VALUES (
      ${crypto.randomUUID()}, ${row.gameId}, ${row.teamAbbr ?? "UNKNOWN"}, ${Boolean(stats.confirmedLineup ?? stats.lineupConfirmed)},
      ${safeJson(battingOrder)}::jsonb,
      ${safeJson(Array.isArray(stats.bench) ? stats.bench : [])}::jsonb,
      ${probablePitcherId}, ${probablePitcherName},
      ${safeJson(availableRelievers)}::jsonb,
      ${safeJson(unavailableRelievers)}::jsonb,
      ${safeJson(injuries)}::jsonb,
      'auto-team-game-stats', now()
    );
  `;
  return { gameId: row.gameId, team: row.teamAbbr ?? "UNKNOWN", confirmed: Boolean(stats.confirmedLineup ?? stats.lineupConfirmed) };
}

export async function buildMlbRosterIntelligenceFromStats(options: { lookbackDays?: number; limit?: number; includeLineups?: boolean } = {}) {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, error: "No usable server database URL is configured.", hitters: 0, pitchers: 0, lineups: 0 };
  await ensureMlbRosterIntelligenceTables();
  const lookbackDays = Math.max(1, Math.min(365, Math.round(options.lookbackDays ?? 45)));
  const limit = Math.max(50, Math.min(5000, Math.round(options.limit ?? 1500)));
  const rows = await latestPlayerStats(lookbackDays, limit);
  const hitterResults = [];
  const pitcherResults = [];
  for (const row of rows) {
    const stats = asRecord(row.statsJson);
    if (pitcherLike(row, stats)) pitcherResults.push(await insertPitcher(row, pitcherInput(stats)));
    else hitterResults.push(await insertHitter(row, hitterInput(stats)));
  }
  const lineupRows = options.includeLineups === false ? [] : await latestTeamStats(lookbackDays, Math.min(3000, limit));
  const lineupResults = [];
  for (const row of lineupRows) lineupResults.push(await insertLineup(row));
  return {
    ok: true,
    source: "auto-player-team-game-stats",
    lookbackDays,
    inputRows: rows.length,
    hitters: hitterResults.length,
    pitchers: pitcherResults.length,
    lineups: lineupResults.length,
    hitterResults: hitterResults.slice(0, 20),
    pitcherResults: pitcherResults.slice(0, 20),
    lineupResults: lineupResults.slice(0, 20)
  };
}
