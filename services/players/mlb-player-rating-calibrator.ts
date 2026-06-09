import { randomUUID } from "node:crypto";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import {
  calculateMlbHitterOverall,
  calculateMlbPitcherOverall,
  classifyMlbHitterRole,
  classifyMlbReliefRole,
  classifyMlbStarterRole,
  ensureMlbRosterIntelligenceTables
} from "@/services/simulation/mlb-roster-intelligence";
import { ensureMlbPlayerDataPipeTables } from "@/services/players/mlb-player-data-pipe";

export type MlbRatingCalibrationMode = "preview" | "write";

export type MlbRatingCalibrationPlayer = {
  playerId: string;
  playerName: string;
  team: string;
  role: "BATTER" | "PITCHER";
  season: number;
  sampleSize: number | null;
  sampleWeight: number;
  overall: number;
  roleTier: string;
  skills: Record<string, number>;
  sourceSnapshotDate: string;
};

export type MlbRatingCalibrationResult = {
  ok: boolean;
  generatedAt: string;
  mode: MlbRatingCalibrationMode;
  source: string;
  season: number | null;
  calibrated: { batters: number; pitchers: number; ratingsWritten: number };
  leagueContext: {
    batterRows: number;
    pitcherRows: number;
    batterMetrics: Record<string, { count: number; mean: number | null; p10: number | null; p50: number | null; p90: number | null }>;
    pitcherMetrics: Record<string, { count: number; mean: number | null; p10: number | null; p50: number | null; p90: number | null }>;
  };
  topBatters: MlbRatingCalibrationPlayer[];
  topPitchers: MlbRatingCalibrationPlayer[];
  warnings: string[];
};

type StatRow = {
  player_id?: string;
  player_name?: string;
  pitcher_id?: string;
  pitcher_name?: string;
  team: string;
  season: number;
  snapshot_date: Date | string;
  stats_json: Record<string, unknown>;
  source: string;
  captured_at: Date | string;
};

const BATTER_METRICS = ["avg", "obp", "slg", "iso", "woba", "xwoba", "kRate", "bbRate", "hardHitRate", "barrelRate", "vsLhpOps", "vsRhpOps", "sprintSpeed", "defensiveValue", "recentWoba", "recentOps"] as const;
const PITCHER_METRICS = ["era", "xera", "fip", "xfip", "kRate", "bbRate", "kMinusBbRate", "hrPer9", "groundBallRate", "pitchCountAvg", "recentWorkload", "velocity", "stuffPlus", "innings", "starts"] as const;

function n(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function stat(row: StatRow, key: string) {
  const value = row.stats_json?.[key];
  return n(value);
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function dateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function sampleWeight(sample: number | null, stabilizer: number) {
  if (!sample || sample <= 0) return 0.35;
  return clamp(sample / (sample + stabilizer), 0.35, 0.96);
}

function shrink(score: number, weight: number, baseline = 50) {
  return round(baseline + (score - baseline) * weight, 2);
}

function valuesFor(rows: StatRow[], key: string) {
  return rows.map((row) => stat(row, key)).filter((value): value is number => value != null && Number.isFinite(value)).sort((a, b) => a - b);
}

function percentileValue(values: number[], p: number) {
  if (!values.length) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * p)));
  return round(values[index], 4);
}

function mean(values: number[]) {
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 4);
}

function context(rows: StatRow[], keys: readonly string[]) {
  return Object.fromEntries(keys.map((key) => {
    const values = valuesFor(rows, key);
    return [key, { count: values.length, mean: mean(values), p10: percentileValue(values, 0.1), p50: percentileValue(values, 0.5), p90: percentileValue(values, 0.9) }];
  }));
}

function percentile(rows: StatRow[], key: string, value: number | null, invert = false) {
  if (value == null) return 50;
  const values = valuesFor(rows, key);
  if (values.length < 3) return 50;
  const belowOrEqual = values.filter((item) => item <= value).length;
  const pct = (belowOrEqual / values.length) * 100;
  return round(invert ? 100 - pct : pct, 2);
}

function avg(values: number[]) {
  const real = values.filter((value) => Number.isFinite(value));
  if (!real.length) return 50;
  return real.reduce((sum, value) => sum + value, 0) / real.length;
}

function latestRows(rows: StatRow[], idKey: "player_id" | "pitcher_id") {
  const map = new Map<string, StatRow>();
  for (const row of rows) {
    const id = row[idKey];
    if (!id) continue;
    const current = map.get(id);
    if (!current || new Date(row.captured_at).getTime() > new Date(current.captured_at).getTime()) {
      map.set(id, row);
    }
  }
  return [...map.values()];
}

async function loadBatterRows(season?: number | null) {
  if (season) {
    return prisma.$queryRaw<StatRow[]>`
      SELECT player_id, player_name, team, season, snapshot_date, stats_json, source, captured_at
      FROM mlb_batter_stat_snapshots
      WHERE season = ${season}
      ORDER BY captured_at DESC;
    `;
  }
  return prisma.$queryRaw<StatRow[]>`
    SELECT player_id, player_name, team, season, snapshot_date, stats_json, source, captured_at
    FROM mlb_batter_stat_snapshots
    ORDER BY captured_at DESC;
  `;
}

async function loadPitcherRows(season?: number | null) {
  if (season) {
    return prisma.$queryRaw<StatRow[]>`
      SELECT pitcher_id, pitcher_name, team, season, snapshot_date, stats_json, source, captured_at
      FROM mlb_pitcher_stat_snapshots
      WHERE season = ${season}
      ORDER BY captured_at DESC;
    `;
  }
  return prisma.$queryRaw<StatRow[]>`
    SELECT pitcher_id, pitcher_name, team, season, snapshot_date, stats_json, source, captured_at
    FROM mlb_pitcher_stat_snapshots
    ORDER BY captured_at DESC;
  `;
}

function batterSkills(row: StatRow, league: StatRow[]): MlbRatingCalibrationPlayer {
  const plateAppearances = stat(row, "plateAppearances");
  const weight = sampleWeight(plateAppearances, 180);
  const contact = shrink(avg([
    percentile(league, "avg", stat(row, "avg")),
    percentile(league, "xwoba", stat(row, "xwoba") ?? stat(row, "woba")),
    percentile(league, "kRate", stat(row, "kRate"), true)
  ]), weight);
  const power = shrink(avg([
    percentile(league, "iso", stat(row, "iso")),
    percentile(league, "slg", stat(row, "slg")),
    percentile(league, "hardHitRate", stat(row, "hardHitRate")),
    percentile(league, "barrelRate", stat(row, "barrelRate"))
  ]), weight);
  const discipline = shrink(avg([
    percentile(league, "obp", stat(row, "obp")),
    percentile(league, "bbRate", stat(row, "bbRate")),
    percentile(league, "kRate", stat(row, "kRate"), true)
  ]), weight);
  const vsLhp = shrink(percentile(league, "vsLhpOps", stat(row, "vsLhpOps")), weight, avg([contact, power]));
  const vsRhp = shrink(percentile(league, "vsRhpOps", stat(row, "vsRhpOps")), weight, avg([contact, power]));
  const baserunning = shrink(percentile(league, "sprintSpeed", stat(row, "sprintSpeed")), weight, 55);
  const fielding = shrink(percentile(league, "defensiveValue", stat(row, "defensiveValue")), weight, 55);
  const currentForm = shrink(avg([
    percentile(league, "recentWoba", stat(row, "recentWoba") ?? stat(row, "woba")),
    percentile(league, "recentOps", stat(row, "recentOps"))
  ]), 0.72);
  const skills = { contact, power, discipline, vsLhp, vsRhp, baserunning, fielding, currentForm };
  const overall = calculateMlbHitterOverall(skills);
  return { playerId: String(row.player_id), playerName: String(row.player_name), team: row.team, role: "BATTER", season: row.season, sampleSize: plateAppearances, sampleWeight: round(weight, 3), overall, roleTier: classifyMlbHitterRole(overall), skills, sourceSnapshotDate: dateKey(row.snapshot_date) };
}

function pitcherSkills(row: StatRow, league: StatRow[]): MlbRatingCalibrationPlayer {
  const innings = stat(row, "innings");
  const starts = stat(row, "starts") ?? 0;
  const reliefAppearances = stat(row, "reliefAppearances") ?? 0;
  const pitchCountAvg = stat(row, "pitchCountAvg");
  const weight = sampleWeight(innings, starts >= reliefAppearances ? 55 : 25);
  const xeraQuality = shrink(percentile(league, "xera", stat(row, "xera") ?? stat(row, "era"), true), weight);
  const fipQuality = shrink(percentile(league, "fip", stat(row, "fip") ?? stat(row, "xfip"), true), weight);
  const derivedKBb = stat(row, "kMinusBbRate") ?? ((stat(row, "kRate") ?? 0) - (stat(row, "bbRate") ?? 0));
  const kBb = shrink(avg([
    percentile(league, "kMinusBbRate", derivedKBb),
    percentile(league, "kRate", stat(row, "kRate")),
    percentile(league, "bbRate", stat(row, "bbRate"), true)
  ]), weight);
  const hrRisk = shrink(percentile(league, "hrPer9", stat(row, "hrPer9")), weight);
  const groundballRate = shrink(percentile(league, "groundBallRate", stat(row, "groundBallRate")), weight);
  const platoonSplit = 70;
  const stamina = shrink(avg([
    percentile(league, "innings", innings),
    percentile(league, "pitchCountAvg", pitchCountAvg),
    percentile(league, "starts", starts)
  ]), weight, starts >= reliefAppearances ? 55 : 35);
  const recentWorkload = shrink(percentile(league, "recentWorkload", stat(row, "recentWorkload")), 0.75, 35);
  const arsenalQuality = shrink(avg([
    percentile(league, "velocity", stat(row, "velocity")),
    percentile(league, "stuffPlus", stat(row, "stuffPlus"))
  ]), weight);
  const skills = { xeraQuality, fipQuality, kBb, hrRisk, groundballRate, platoonSplit, stamina, recentWorkload, arsenalQuality };
  const overall = calculateMlbPitcherOverall(skills);
  const roleTier = starts >= Math.max(1, reliefAppearances * 0.35) || (pitchCountAvg ?? 0) >= 68
    ? classifyMlbStarterRole(overall)
    : classifyMlbReliefRole(overall, clamp((stat(row, "recentWorkload") ?? 25) + arsenalQuality * 0.55));
  return { playerId: String(row.pitcher_id), playerName: String(row.pitcher_name), team: row.team, role: "PITCHER", season: row.season, sampleSize: innings, sampleWeight: round(weight, 3), overall, roleTier, skills, sourceSnapshotDate: dateKey(row.snapshot_date) };
}

async function writeHitter(player: MlbRatingCalibrationPlayer, source: string) {
  await prisma.$executeRaw`
    INSERT INTO mlb_player_ratings (id, player_id, player_name, team, season, primary_position, role_tier, contact, power, discipline, vs_lhp, vs_rhp, baserunning, fielding, current_form, overall, metrics_json, source, snapshot_at, updated_at)
    VALUES (${`calibrated-hitter-${player.playerId}-${player.season}-${source}`}, ${player.playerId}, ${player.playerName}, ${player.team}, ${player.season}, ${null}, ${player.roleTier}, ${player.skills.contact}, ${player.skills.power}, ${player.skills.discipline}, ${player.skills.vsLhp}, ${player.skills.vsRhp}, ${player.skills.baserunning}, ${player.skills.fielding}, ${player.skills.currentForm}, ${player.overall}, ${JSON.stringify({ calibrationSource: source, sampleSize: player.sampleSize, sampleWeight: player.sampleWeight, sourceSnapshotDate: player.sourceSnapshotDate })}::jsonb, ${source}, now(), now())
    ON CONFLICT (id) DO UPDATE SET contact = EXCLUDED.contact, power = EXCLUDED.power, discipline = EXCLUDED.discipline, vs_lhp = EXCLUDED.vs_lhp, vs_rhp = EXCLUDED.vs_rhp, baserunning = EXCLUDED.baserunning, fielding = EXCLUDED.fielding, current_form = EXCLUDED.current_form, overall = EXCLUDED.overall, metrics_json = EXCLUDED.metrics_json, snapshot_at = now(), updated_at = now();
  `;
}

async function writePitcher(player: MlbRatingCalibrationPlayer, source: string) {
  await prisma.$executeRaw`
    INSERT INTO mlb_pitcher_ratings (id, pitcher_id, pitcher_name, team, season, role_tier, xera_quality, fip_quality, k_bb, hr_risk, groundball_rate, platoon_split, stamina, recent_workload, arsenal_quality, overall, metrics_json, source, snapshot_at, updated_at)
    VALUES (${`calibrated-pitcher-${player.playerId}-${player.season}-${source}`}, ${player.playerId}, ${player.playerName}, ${player.team}, ${player.season}, ${player.roleTier}, ${player.skills.xeraQuality}, ${player.skills.fipQuality}, ${player.skills.kBb}, ${player.skills.hrRisk}, ${player.skills.groundballRate}, ${player.skills.platoonSplit}, ${player.skills.stamina}, ${player.skills.recentWorkload}, ${player.skills.arsenalQuality}, ${player.overall}, ${JSON.stringify({ calibrationSource: source, sampleSize: player.sampleSize, sampleWeight: player.sampleWeight, sourceSnapshotDate: player.sourceSnapshotDate })}::jsonb, ${source}, now(), now())
    ON CONFLICT (id) DO UPDATE SET xera_quality = EXCLUDED.xera_quality, fip_quality = EXCLUDED.fip_quality, k_bb = EXCLUDED.k_bb, hr_risk = EXCLUDED.hr_risk, groundball_rate = EXCLUDED.groundball_rate, platoon_split = EXCLUDED.platoon_split, stamina = EXCLUDED.stamina, recent_workload = EXCLUDED.recent_workload, arsenal_quality = EXCLUDED.arsenal_quality, overall = EXCLUDED.overall, metrics_json = EXCLUDED.metrics_json, snapshot_at = now(), updated_at = now();
  `;
}

async function ensureCalibrationTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mlb_player_rating_calibration_runs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      mode TEXT NOT NULL,
      season INTEGER,
      batter_count INTEGER NOT NULL DEFAULT 0,
      pitcher_count INTEGER NOT NULL DEFAULT 0,
      ratings_written INTEGER NOT NULL DEFAULT 0,
      league_context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export async function calibrateMlbPlayerRatings(args: { mode?: MlbRatingCalibrationMode; season?: number | null; source?: string | null } = {}): Promise<MlbRatingCalibrationResult> {
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: false, generatedAt: new Date().toISOString(), mode: args.mode ?? "preview", source: args.source ?? "calibrated-stat-pipe-v1", season: args.season ?? null, calibrated: { batters: 0, pitchers: 0, ratingsWritten: 0 }, leagueContext: { batterRows: 0, pitcherRows: 0, batterMetrics: {}, pitcherMetrics: {} }, topBatters: [], topPitchers: [], warnings: ["No usable server database URL is configured."] };
  }
  await ensureMlbPlayerDataPipeTables();
  await ensureMlbRosterIntelligenceTables();
  await ensureCalibrationTables();
  const mode = args.mode ?? "preview";
  const source = args.source?.trim() || "calibrated-stat-pipe-v1";
  const [batterRaw, pitcherRaw] = await Promise.all([loadBatterRows(args.season), loadPitcherRows(args.season)]);
  const batterRows = latestRows(batterRaw, "player_id");
  const pitcherRows = latestRows(pitcherRaw, "pitcher_id");
  const batters = batterRows.map((row) => batterSkills(row, batterRows)).sort((a, b) => b.overall - a.overall);
  const pitchers = pitcherRows.map((row) => pitcherSkills(row, pitcherRows)).sort((a, b) => b.overall - a.overall);
  let written = 0;
  if (mode === "write") {
    for (const player of batters) {
      await writeHitter(player, source);
      written += 1;
    }
    for (const player of pitchers) {
      await writePitcher(player, source);
      written += 1;
    }
  }
  const leagueContext = { batterRows: batterRows.length, pitcherRows: pitcherRows.length, batterMetrics: context(batterRows, BATTER_METRICS), pitcherMetrics: context(pitcherRows, PITCHER_METRICS) };
  await prisma.$executeRaw`
    INSERT INTO mlb_player_rating_calibration_runs (id, source, mode, season, batter_count, pitcher_count, ratings_written, league_context_json)
    VALUES (${randomUUID()}, ${source}, ${mode}, ${args.season ?? null}, ${batters.length}, ${pitchers.length}, ${written}, ${JSON.stringify(leagueContext)}::jsonb);
  `;
  const warnings: string[] = [];
  if (batterRows.length < 150) warnings.push(`Batter calibration sample is thin: ${batterRows.length} latest rows.`);
  if (pitcherRows.length < 120) warnings.push(`Pitcher calibration sample is thin: ${pitcherRows.length} latest rows.`);
  if (mode === "preview") warnings.push("Preview mode only. Use mode=write to update player-card rating tables.");
  return { ok: true, generatedAt: new Date().toISOString(), mode, source, season: args.season ?? null, calibrated: { batters: batters.length, pitchers: pitchers.length, ratingsWritten: written }, leagueContext, topBatters: batters.slice(0, 12), topPitchers: pitchers.slice(0, 12), warnings };
}
