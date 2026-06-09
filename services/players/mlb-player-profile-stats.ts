import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbPlayerDataPipeTables } from "@/services/players/mlb-player-data-pipe";
import { getMlbPlayerProfileInsight, type MlbPlayerProfileInsightReport } from "@/services/players/mlb-player-profile-insights";

export type MlbPlayerStatQuality = "ELITE" | "PLUS" | "AVERAGE" | "WATCH" | "RISK" | "UNKNOWN";

export type MlbPlayerProfileStat = {
  key: string;
  label: string;
  value: number | string | null;
  display: string;
  quality: MlbPlayerStatQuality;
  note: string;
};

export type MlbPlayerProfileStatGroup = {
  key: string;
  label: string;
  stats: MlbPlayerProfileStat[];
};

export type MlbPlayerProfileStatSnapshot = {
  role: "BATTER" | "PITCHER";
  season: number;
  snapshotDate: string | null;
  capturedAt: string | null;
  source: string;
  stats: Record<string, unknown>;
};

export type MlbPlayerIdentityAudit = {
  playerId: string;
  name: string | null;
  team: string | null;
  primaryPosition: string | null;
  bats: string | null;
  throws: string | null;
  source: string | null;
  updatedAt: string | null;
  aliases: string[];
};

export type MlbPlayerProfileWithStats = {
  ok: boolean;
  generatedAt: string;
  report: MlbPlayerProfileInsightReport;
  identity: MlbPlayerIdentityAudit | null;
  latestSnapshot: MlbPlayerProfileStatSnapshot | null;
  statGroups: MlbPlayerProfileStatGroup[];
  snapshots: MlbPlayerProfileStatSnapshot[];
  dataQuality: {
    hasStats: boolean;
    snapshotCount: number;
    latestSource: string | null;
    latestCapturedAt: string | null;
    statCoverageScore: number;
    missingCoreStats: string[];
  };
  warnings: string[];
};

type BatterSnapshotRow = {
  player_id: string;
  player_name: string;
  team: string;
  season: number;
  snapshot_date: Date | string;
  stats_json: Record<string, unknown>;
  source: string;
  captured_at: Date | string;
};

type PitcherSnapshotRow = {
  pitcher_id: string;
  pitcher_name: string;
  team: string;
  season: number;
  snapshot_date: Date | string;
  stats_json: Record<string, unknown>;
  source: string;
  captured_at: Date | string;
};

type IdentityRow = {
  id: string;
  player_name: string | null;
  team: string | null;
  primary_position: string | null;
  bats: string | null;
  throws: string | null;
  source: string | null;
  updated_at: Date | string | null;
};

type AliasRow = { alias: string };

function n(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function s(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stat(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (value != null) return value;
  }
  return null;
}

function displayNumber(value: number | string | null, mode: "number" | "rate" | "pct" | "int" = "number") {
  const num = n(value);
  if (num == null) return value == null ? "—" : String(value);
  if (mode === "pct") return `${(num <= 1 ? num * 100 : num).toFixed(1)}%`;
  if (mode === "rate") return num.toFixed(3).replace(/^0/, "");
  if (mode === "int") return String(Math.round(num));
  return num.toFixed(2);
}

function qualityAbove(value: number | null, thresholds: [number, number, number, number]): MlbPlayerStatQuality {
  if (value == null) return "UNKNOWN";
  if (value >= thresholds[0]) return "ELITE";
  if (value >= thresholds[1]) return "PLUS";
  if (value >= thresholds[2]) return "AVERAGE";
  if (value >= thresholds[3]) return "WATCH";
  return "RISK";
}

function qualityBelow(value: number | null, thresholds: [number, number, number, number]): MlbPlayerStatQuality {
  if (value == null) return "UNKNOWN";
  if (value <= thresholds[0]) return "ELITE";
  if (value <= thresholds[1]) return "PLUS";
  if (value <= thresholds[2]) return "AVERAGE";
  if (value <= thresholds[3]) return "WATCH";
  return "RISK";
}

function item(raw: Record<string, unknown>, key: string, label: string, keys: string[], mode: "number" | "rate" | "pct" | "int", quality: MlbPlayerStatQuality, note: string): MlbPlayerProfileStat {
  const value = stat(raw, keys);
  return { key, label, value: n(value) ?? s(value), display: displayNumber(n(value) ?? s(value), mode), quality, note };
}

function hitterGroups(raw: Record<string, unknown>): MlbPlayerProfileStatGroup[] {
  const avg = n(stat(raw, ["avg", "battingAverage", "AVG"]));
  const obp = n(stat(raw, ["obp", "OBP"]));
  const slg = n(stat(raw, ["slg", "SLG"]));
  const iso = n(stat(raw, ["iso", "ISO"]));
  const woba = n(stat(raw, ["woba", "wOBA"]));
  const xwoba = n(stat(raw, ["xwoba", "xwOBA"]));
  const kRate = n(stat(raw, ["kRate", "strikeoutRate", "k_pct", "kPercent"]));
  const bbRate = n(stat(raw, ["bbRate", "walkRate", "bb_pct", "bbPercent"]));
  const hardHit = n(stat(raw, ["hardHitRate", "hard_hit_rate", "hardHitPct"]));
  const barrel = n(stat(raw, ["barrelRate", "barrel_rate", "barrelPct"]));
  return [
    { key: "core", label: "Core production", stats: [
      item(raw, "avg", "AVG", ["avg", "battingAverage", "AVG"], "rate", qualityAbove(avg, [0.300, 0.275, 0.245, 0.220]), "Batting-average baseline for hit props and contact profile."),
      item(raw, "obp", "OBP", ["obp", "OBP"], "rate", qualityAbove(obp, [0.390, 0.350, 0.315, 0.290]), "On-base pressure and inning-extension value."),
      item(raw, "slg", "SLG", ["slg", "SLG"], "rate", qualityAbove(slg, [0.540, 0.470, 0.400, 0.360]), "Extra-base damage and team-total sensitivity."),
      item(raw, "woba", "wOBA", ["woba", "wOBA"], "rate", qualityAbove(woba, [0.390, 0.350, 0.315, 0.290]), "Overall offensive quality proxy.")
    ] },
    { key: "quality", label: "Contact quality", stats: [
      item(raw, "xwoba", "xwOBA", ["xwoba", "xwOBA"], "rate", qualityAbove(xwoba, [0.395, 0.355, 0.320, 0.295]), "Expected quality; useful for detecting luck noise."),
      item(raw, "iso", "ISO", ["iso", "ISO"], "rate", qualityAbove(iso, [0.250, 0.190, 0.145, 0.110]), "Raw isolated power."),
      item(raw, "hardHitRate", "Hard-hit", ["hardHitRate", "hard_hit_rate", "hardHitPct"], "pct", qualityAbove(hardHit == null ? null : hardHit <= 1 ? hardHit : hardHit / 100, [0.520, 0.460, 0.380, 0.330]), "Contact authority."),
      item(raw, "barrelRate", "Barrel", ["barrelRate", "barrel_rate", "barrelPct"], "pct", qualityAbove(barrel == null ? null : barrel <= 1 ? barrel : barrel / 100, [0.150, 0.100, 0.065, 0.040]), "Home-run and total-base signal.")
    ] },
    { key: "discipline", label: "Discipline", stats: [
      item(raw, "kRate", "K rate", ["kRate", "strikeoutRate", "k_pct", "kPercent"], "pct", qualityBelow(kRate == null ? null : kRate <= 1 ? kRate : kRate / 100, [0.150, 0.200, 0.250, 0.300]), "Strikeout drag on hit/total-base props."),
      item(raw, "bbRate", "BB rate", ["bbRate", "walkRate", "bb_pct", "bbPercent"], "pct", qualityAbove(bbRate == null ? null : bbRate <= 1 ? bbRate : bbRate / 100, [0.140, 0.105, 0.075, 0.050]), "Walk pressure and run-scoring support."),
      item(raw, "plateAppearances", "PA", ["plateAppearances", "pa", "PA"], "int", "UNKNOWN", "Sample-size context for rating confidence.")
    ] },
    { key: "splits_form", label: "Splits and form", stats: [
      item(raw, "vsLhpOps", "OPS vs LHP", ["vsLhpOps", "opsVsLhp", "ops_vs_lhp"], "rate", "UNKNOWN", "Handedness split for matchup grading."),
      item(raw, "vsRhpOps", "OPS vs RHP", ["vsRhpOps", "opsVsRhp", "ops_vs_rhp"], "rate", "UNKNOWN", "Handedness split for matchup grading."),
      item(raw, "recentWoba", "Recent wOBA", ["recentWoba", "last14Woba", "last30Woba"], "rate", "UNKNOWN", "Recent production after source ingest."),
      item(raw, "recentOps", "Recent OPS", ["recentOps", "last14Ops", "last30Ops"], "rate", "UNKNOWN", "Short-window form signal.")
    ] }
  ];
}

function pitcherGroups(raw: Record<string, unknown>): MlbPlayerProfileStatGroup[] {
  const era = n(stat(raw, ["era", "ERA"]));
  const xera = n(stat(raw, ["xera", "xERA"]));
  const fip = n(stat(raw, ["fip", "FIP"]));
  const kRate = n(stat(raw, ["kRate", "strikeoutRate", "k_pct", "kPercent"]));
  const bbRate = n(stat(raw, ["bbRate", "walkRate", "bb_pct", "bbPercent"]));
  const kbb = n(stat(raw, ["kMinusBbRate", "kbbRate", "k_minus_bb"]));
  const hr9 = n(stat(raw, ["hrPer9", "hr9", "HR9"]));
  const gb = n(stat(raw, ["groundBallRate", "gbRate", "gb_pct"]));
  return [
    { key: "run_prevention", label: "Run prevention", stats: [
      item(raw, "era", "ERA", ["era", "ERA"], "number", qualityBelow(era, [2.75, 3.40, 4.20, 4.90]), "Observed run prevention."),
      item(raw, "xera", "xERA", ["xera", "xERA"], "number", qualityBelow(xera, [3.00, 3.60, 4.25, 4.90]), "Expected run prevention."),
      item(raw, "fip", "FIP", ["fip", "FIP"], "number", qualityBelow(fip, [3.10, 3.70, 4.30, 4.90]), "Defense-independent run prevention."),
      item(raw, "xfip", "xFIP", ["xfip", "xFIP"], "number", "UNKNOWN", "HR-normalized pitching quality.")
    ] },
    { key: "command_miss", label: "Miss and command", stats: [
      item(raw, "kRate", "K rate", ["kRate", "strikeoutRate", "k_pct", "kPercent"], "pct", qualityAbove(kRate == null ? null : kRate <= 1 ? kRate : kRate / 100, [0.320, 0.270, 0.220, 0.180]), "Strikeout ceiling."),
      item(raw, "bbRate", "BB rate", ["bbRate", "walkRate", "bb_pct", "bbPercent"], "pct", qualityBelow(bbRate == null ? null : bbRate <= 1 ? bbRate : bbRate / 100, [0.050, 0.070, 0.090, 0.115]), "Walk risk and pitch-count drag."),
      item(raw, "kMinusBbRate", "K-BB", ["kMinusBbRate", "kbbRate", "k_minus_bb"], "pct", qualityAbove(kbb == null ? null : kbb <= 1 ? kbb : kbb / 100, [0.240, 0.180, 0.130, 0.080]), "Best quick command/miss summary."),
      item(raw, "stuffPlus", "Stuff+", ["stuffPlus", "stuff_plus"], "number", qualityAbove(n(stat(raw, ["stuffPlus", "stuff_plus"])), [120, 108, 100, 92]), "Pitch arsenal quality when available.")
    ] },
    { key: "damage_contact", label: "Damage and contact", stats: [
      item(raw, "hrPer9", "HR/9", ["hrPer9", "hr9", "HR9"], "number", qualityBelow(hr9, [0.70, 1.00, 1.30, 1.65]), "One-swing damage risk."),
      item(raw, "groundBallRate", "GB rate", ["groundBallRate", "gbRate", "gb_pct"], "pct", qualityAbove(gb == null ? null : gb <= 1 ? gb : gb / 100, [0.520, 0.460, 0.400, 0.350]), "Contact-management support."),
      item(raw, "velocity", "Velocity", ["velocity", "fastballVelocity", "fbVelo"], "number", qualityAbove(n(stat(raw, ["velocity", "fastballVelocity", "fbVelo"])), [97, 95, 93, 91]), "Raw fastball velocity signal.")
    ] },
    { key: "workload", label: "Workload", stats: [
      item(raw, "innings", "IP", ["innings", "ip", "IP"], "number", "UNKNOWN", "Season workload and role context."),
      item(raw, "starts", "Starts", ["starts", "gs", "GS"], "int", "UNKNOWN", "Starter role evidence."),
      item(raw, "pitchCountAvg", "Avg pitches", ["pitchCountAvg", "avgPitchCount", "pitchesPerStart"], "number", "UNKNOWN", "Outs-market ceiling."),
      item(raw, "recentWorkload", "Recent workload", ["recentWorkload", "last7Pitches", "last5DaysPitches"], "number", "UNKNOWN", "Fatigue and bullpen availability context.")
    ] }
  ];
}

function snapshotFromBatter(row: BatterSnapshotRow): MlbPlayerProfileStatSnapshot {
  return { role: "BATTER", season: row.season, snapshotDate: iso(row.snapshot_date), capturedAt: iso(row.captured_at), source: row.source, stats: row.stats_json ?? {} };
}

function snapshotFromPitcher(row: PitcherSnapshotRow): MlbPlayerProfileStatSnapshot {
  return { role: "PITCHER", season: row.season, snapshotDate: iso(row.snapshot_date), capturedAt: iso(row.captured_at), source: row.source, stats: row.stats_json ?? {} };
}

async function identity(playerId: string): Promise<MlbPlayerIdentityAudit | null> {
  const [rows, aliases] = await Promise.all([
    prisma.$queryRaw<IdentityRow[]>`
      SELECT id, player_name, team, primary_position, bats, throws, source, updated_at
      FROM mlb_player_identity
      WHERE id = ${playerId}
      LIMIT 1;
    `,
    prisma.$queryRaw<AliasRow[]>`
      SELECT alias
      FROM mlb_player_identity_aliases
      WHERE player_id = ${playerId}
      ORDER BY alias ASC
      LIMIT 20;
    `
  ]);
  const row = rows[0];
  if (!row) return null;
  return { playerId: row.id, name: row.player_name, team: row.team, primaryPosition: row.primary_position, bats: row.bats, throws: row.throws, source: row.source, updatedAt: iso(row.updated_at), aliases: aliases.map((item) => item.alias) };
}

function coreKeys(role: "BATTER" | "PITCHER") {
  return role === "BATTER" ? ["avg", "obp", "slg", "woba", "xwoba", "kRate", "bbRate"] : ["xera", "fip", "kRate", "bbRate", "kMinusBbRate", "hrPer9"];
}

function dataQuality(snapshot: MlbPlayerProfileStatSnapshot | null, groups: MlbPlayerProfileStatGroup[], snapshots: MlbPlayerProfileStatSnapshot[]) {
  const missingCoreStats = snapshot ? coreKeys(snapshot.role).filter((key) => snapshot.stats[key] == null) : [];
  const totalStats = groups.flatMap((group) => group.stats).length;
  const filledStats = groups.flatMap((group) => group.stats).filter((item) => item.value != null).length;
  return {
    hasStats: Boolean(snapshot),
    snapshotCount: snapshots.length,
    latestSource: snapshot?.source ?? null,
    latestCapturedAt: snapshot?.capturedAt ?? null,
    statCoverageScore: totalStats ? Math.round((filledStats / totalStats) * 100) : 0,
    missingCoreStats
  };
}

export async function getMlbPlayerProfileWithStats(playerId: string): Promise<MlbPlayerProfileWithStats | null> {
  const report = await getMlbPlayerProfileInsight(playerId);
  if (!report) return null;
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: false, generatedAt: new Date().toISOString(), report, identity: null, latestSnapshot: null, statGroups: [], snapshots: [], dataQuality: { hasStats: false, snapshotCount: 0, latestSource: null, latestCapturedAt: null, statCoverageScore: 0, missingCoreStats: [] }, warnings: ["No usable server database URL is configured."] };
  }
  await ensureMlbPlayerDataPipeTables();
  const [batterRows, pitcherRows, audit] = await Promise.all([
    prisma.$queryRaw<BatterSnapshotRow[]>`
      SELECT player_id, player_name, team, season, snapshot_date, stats_json, source, captured_at
      FROM mlb_batter_stat_snapshots
      WHERE player_id = ${playerId}
      ORDER BY captured_at DESC
      LIMIT 12;
    `,
    prisma.$queryRaw<PitcherSnapshotRow[]>`
      SELECT pitcher_id, pitcher_name, team, season, snapshot_date, stats_json, source, captured_at
      FROM mlb_pitcher_stat_snapshots
      WHERE pitcher_id = ${playerId}
      ORDER BY captured_at DESC
      LIMIT 12;
    `,
    identity(playerId).catch(() => null)
  ]);
  const snapshots = [...batterRows.map(snapshotFromBatter), ...pitcherRows.map(snapshotFromPitcher)].sort((a, b) => new Date(b.capturedAt ?? 0).getTime() - new Date(a.capturedAt ?? 0).getTime());
  const preferredRole = report.profile.role === "BATTER" ? "BATTER" : "PITCHER";
  const latestSnapshot = snapshots.find((item) => item.role === preferredRole) ?? snapshots[0] ?? null;
  const statGroups = latestSnapshot ? latestSnapshot.role === "BATTER" ? hitterGroups(latestSnapshot.stats) : pitcherGroups(latestSnapshot.stats) : [];
  const quality = dataQuality(latestSnapshot, statGroups, snapshots);
  const warnings: string[] = [];
  if (!latestSnapshot) warnings.push("No raw stat snapshots found for this player. Feed the stat pipe to unlock full profile stats.");
  if (quality.missingCoreStats.length) warnings.push(`Missing core stats: ${quality.missingCoreStats.join(", ")}.`);
  if (quality.statCoverageScore < 70) warnings.push(`Stat coverage is thin at ${quality.statCoverageScore}/100.`);
  return { ok: true, generatedAt: new Date().toISOString(), report, identity: audit, latestSnapshot, statGroups, snapshots, dataQuality: quality, warnings };
}
