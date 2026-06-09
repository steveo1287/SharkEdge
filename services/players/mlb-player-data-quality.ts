import type { MlbBatterStatInput, MlbPitcherStatInput, MlbPlayerDataPipePayload } from "@/services/players/mlb-player-data-pipe";

export type PlayerDataRowKind = "BATTER" | "PITCHER";
export type PlayerDataIssueSeverity = "BLOCKER" | "HIGH" | "MEDIUM" | "LOW";

export type PlayerDataQualityIssue = {
  rowKind: PlayerDataRowKind;
  rowIndex: number;
  playerId: string | null;
  playerName: string | null;
  field: string;
  severity: PlayerDataIssueSeverity;
  message: string;
};

export type PlayerDataQualityResult = {
  ok: boolean;
  generatedAt: string;
  source: string;
  accepted: { batters: number; pitchers: number };
  rejected: { batters: number; pitchers: number };
  score: number;
  grade: "A+" | "A" | "B" | "C" | "REJECT";
  cleanPayload: MlbPlayerDataPipePayload;
  issues: PlayerDataQualityIssue[];
  warnings: string[];
};

const BATTER_RANGES: Record<string, [number, number]> = {
  season: [1876, 2100],
  plateAppearances: [0, 850],
  avg: [0, 0.45],
  obp: [0, 0.6],
  slg: [0, 0.9],
  iso: [0, 0.45],
  woba: [0, 0.55],
  xwoba: [0, 0.55],
  kRate: [0, 0.5],
  bbRate: [0, 0.3],
  hardHitRate: [0, 0.75],
  barrelRate: [0, 0.35],
  vsLhpOps: [0, 1.4],
  vsRhpOps: [0, 1.4],
  sprintSpeed: [18, 34],
  defensiveValue: [-40, 40],
  recentWoba: [0, 0.65],
  recentOps: [0, 1.5]
};

const PITCHER_RANGES: Record<string, [number, number]> = {
  season: [1876, 2100],
  innings: [0, 260],
  starts: [0, 40],
  reliefAppearances: [0, 100],
  era: [0, 15],
  xera: [0, 15],
  fip: [0, 15],
  xfip: [0, 15],
  kRate: [0, 0.55],
  bbRate: [0, 0.3],
  kMinusBbRate: [-0.1, 0.45],
  hrPer9: [0, 4],
  groundBallRate: [0, 0.75],
  pitchCountAvg: [0, 120],
  recentWorkload: [0, 140],
  velocity: [70, 105],
  stuffPlus: [40, 170]
};

function sourceName(value: string | null | undefined) {
  return value?.trim() || "player-data-pipe";
}

function grade(score: number): PlayerDataQualityResult["grade"] {
  if (score >= 97) return "A+";
  if (score >= 90) return "A";
  if (score >= 78) return "B";
  if (score >= 65) return "C";
  return "REJECT";
}

function issue(rowKind: PlayerDataRowKind, rowIndex: number, playerId: string | null, playerName: string | null, field: string, severity: PlayerDataIssueSeverity, message: string): PlayerDataQualityIssue {
  return { rowKind, rowIndex, playerId, playerName, field, severity, message };
}

function isBlank(value: unknown) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateRange(kind: PlayerDataRowKind, rowIndex: number, playerId: string | null, playerName: string | null, row: Record<string, unknown>, ranges: Record<string, [number, number]>) {
  const issues: PlayerDataQualityIssue[] = [];
  for (const [field, [min, max]] of Object.entries(ranges)) {
    const value = row[field];
    if (value == null) continue;
    if (!isNumber(value)) {
      issues.push(issue(kind, rowIndex, playerId, playerName, field, "HIGH", `${field} must be numeric.`));
      continue;
    }
    const numberValue = value;
    if (numberValue < min || numberValue > max) {
      issues.push(issue(kind, rowIndex, playerId, playerName, field, "HIGH", `${field}=${numberValue} is outside expected range ${min}-${max}.`));
    }
  }
  return issues;
}

function usefulBatterStats(row: MlbBatterStatInput) {
  return [row.avg, row.obp, row.slg, row.iso, row.woba, row.xwoba, row.kRate, row.bbRate, row.hardHitRate, row.barrelRate].filter((value) => isNumber(value)).length;
}

function usefulPitcherStats(row: MlbPitcherStatInput) {
  return [row.era, row.xera, row.fip, row.xfip, row.kRate, row.bbRate, row.kMinusBbRate, row.hrPer9, row.groundBallRate, row.pitchCountAvg, row.velocity, row.stuffPlus].filter((value) => isNumber(value)).length;
}

function validateBatter(row: MlbBatterStatInput, index: number) {
  const issues: PlayerDataQualityIssue[] = [];
  if (isBlank(row.playerId)) issues.push(issue("BATTER", index, null, row.playerName ?? null, "playerId", "BLOCKER", "Missing playerId."));
  if (isBlank(row.playerName)) issues.push(issue("BATTER", index, row.playerId ?? null, null, "playerName", "BLOCKER", "Missing playerName."));
  if (isBlank(row.team)) issues.push(issue("BATTER", index, row.playerId ?? null, row.playerName ?? null, "team", "BLOCKER", "Missing team."));
  if (!Number.isInteger(row.season)) issues.push(issue("BATTER", index, row.playerId ?? null, row.playerName ?? null, "season", "BLOCKER", "Missing or invalid season."));
  issues.push(...validateRange("BATTER", index, row.playerId ?? null, row.playerName ?? null, row as unknown as Record<string, unknown>, BATTER_RANGES));
  if (usefulBatterStats(row) < 4) issues.push(issue("BATTER", index, row.playerId ?? null, row.playerName ?? null, "stats", "MEDIUM", "Fewer than four useful batter stats supplied."));
  if (row.obp != null && row.avg != null && row.obp < row.avg) issues.push(issue("BATTER", index, row.playerId ?? null, row.playerName ?? null, "obp", "HIGH", "OBP is below AVG, likely bad input."));
  if (row.slg != null && row.avg != null && row.slg < row.avg) issues.push(issue("BATTER", index, row.playerId ?? null, row.playerName ?? null, "slg", "HIGH", "SLG is below AVG, likely bad input."));
  return issues;
}

function validatePitcher(row: MlbPitcherStatInput, index: number) {
  const issues: PlayerDataQualityIssue[] = [];
  if (isBlank(row.pitcherId)) issues.push(issue("PITCHER", index, null, row.pitcherName ?? null, "pitcherId", "BLOCKER", "Missing pitcherId."));
  if (isBlank(row.pitcherName)) issues.push(issue("PITCHER", index, row.pitcherId ?? null, null, "pitcherName", "BLOCKER", "Missing pitcherName."));
  if (isBlank(row.team)) issues.push(issue("PITCHER", index, row.pitcherId ?? null, row.pitcherName ?? null, "team", "BLOCKER", "Missing team."));
  if (!Number.isInteger(row.season)) issues.push(issue("PITCHER", index, row.pitcherId ?? null, row.pitcherName ?? null, "season", "BLOCKER", "Missing or invalid season."));
  issues.push(...validateRange("PITCHER", index, row.pitcherId ?? null, row.pitcherName ?? null, row as unknown as Record<string, unknown>, PITCHER_RANGES));
  if (usefulPitcherStats(row) < 4) issues.push(issue("PITCHER", index, row.pitcherId ?? null, row.pitcherName ?? null, "stats", "MEDIUM", "Fewer than four useful pitcher stats supplied."));
  if (row.kMinusBbRate != null && row.kRate != null && row.bbRate != null) {
    const expected = Number((row.kRate - row.bbRate).toFixed(3));
    if (Math.abs(expected - row.kMinusBbRate) > 0.04) issues.push(issue("PITCHER", index, row.pitcherId ?? null, row.pitcherName ?? null, "kMinusBbRate", "MEDIUM", "K-BB% does not reconcile with K% and BB%."));
  }
  return issues;
}

function rowKey(kind: PlayerDataRowKind, id: string, season: number) {
  return `${kind}:${id}:${season}`;
}

function issuePenalty(severity: PlayerDataIssueSeverity) {
  if (severity === "BLOCKER") return 25;
  if (severity === "HIGH") return 10;
  if (severity === "MEDIUM") return 4;
  return 1;
}

export function validateMlbPlayerDataPayload(payload: MlbPlayerDataPipePayload): PlayerDataQualityResult {
  const batters = Array.isArray(payload.batters) ? payload.batters : [];
  const pitchers = Array.isArray(payload.pitchers) ? payload.pitchers : [];
  const issues: PlayerDataQualityIssue[] = [];
  const batterKeys = new Set<string>();
  const pitcherKeys = new Set<string>();

  for (const [index, batter] of batters.entries()) {
    const rowIssues = validateBatter(batter, index);
    const key = rowKey("BATTER", batter.playerId, batter.season);
    if (batterKeys.has(key)) rowIssues.push(issue("BATTER", index, batter.playerId ?? null, batter.playerName ?? null, "duplicate", "HIGH", "Duplicate batter row for same player and season."));
    batterKeys.add(key);
    issues.push(...rowIssues);
  }

  for (const [index, pitcher] of pitchers.entries()) {
    const rowIssues = validatePitcher(pitcher, index);
    const key = rowKey("PITCHER", pitcher.pitcherId, pitcher.season);
    if (pitcherKeys.has(key)) rowIssues.push(issue("PITCHER", index, pitcher.pitcherId ?? null, pitcher.pitcherName ?? null, "duplicate", "HIGH", "Duplicate pitcher row for same player and season."));
    pitcherKeys.add(key);
    issues.push(...rowIssues);
  }

  if (!batters.length && !pitchers.length) {
    issues.push(issue("BATTER", 0, null, null, "payload", "BLOCKER", "Payload contains no batter or pitcher rows."));
  }

  const blockedBatters = new Set(issues.filter((item) => item.rowKind === "BATTER" && item.severity === "BLOCKER").map((item) => item.rowIndex));
  const blockedPitchers = new Set(issues.filter((item) => item.rowKind === "PITCHER" && item.severity === "BLOCKER").map((item) => item.rowIndex));
  const cleanBatters = batters.filter((_row, index) => !blockedBatters.has(index));
  const cleanPitchers = pitchers.filter((_row, index) => !blockedPitchers.has(index));
  const penalty = issues.reduce((sum, item) => sum + issuePenalty(item.severity), 0);
  const totalRows = batters.length + pitchers.length;
  const completenessBonus = totalRows >= 500 ? 10 : totalRows >= 250 ? 6 : totalRows >= 50 ? 3 : 0;
  const score = Math.max(0, Math.min(100, 100 - penalty + completenessBonus));

  return {
    ok: cleanBatters.length + cleanPitchers.length > 0 && !issues.some((item) => item.severity === "BLOCKER" && item.field === "payload"),
    generatedAt: new Date().toISOString(),
    source: sourceName(payload.source),
    accepted: { batters: cleanBatters.length, pitchers: cleanPitchers.length },
    rejected: { batters: blockedBatters.size, pitchers: blockedPitchers.size },
    score,
    grade: grade(score),
    cleanPayload: { ...payload, batters: cleanBatters, pitchers: cleanPitchers },
    issues,
    warnings: issues.filter((item) => item.severity !== "LOW").slice(0, 20).map((item) => `${item.rowKind} row ${item.rowIndex} ${item.field}: ${item.message}`)
  };
}
