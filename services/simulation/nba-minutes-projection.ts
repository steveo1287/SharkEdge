import type { NbaLineupTruth } from "./nba-lineup-truth";
import type { NbaPlayerStatProfile } from "./nba-player-stat-profile";

export type NbaMinutesProjection = {
  projectedMinutes: number;
  floorMinutes: number;
  ceilingMinutes: number;
  confidence: number;
  roleConfidence: number;
  starterConfidence: number;
  rotationStability: number;
  minutesVolatility: number;
  role: "starter" | "bench" | "fringe" | "unknown";
  starterLikely: boolean;
  closingLineupLikely: boolean;
  blowoutRisk: number;
  foulRisk: number;
  injuryRisk: number;
  restAdjustment: number;
  blowoutAdjustment: number;
  injuryAdjustment: number;
  roleAdjustment: number;
  blockers: string[];
  warnings: string[];
  drivers: string[];
};

export type NbaMinutesProjectionInput = {
  profile: NbaPlayerStatProfile;
  lineupTruth?: NbaLineupTruth | null;
  marketLine?: number | null;
  teamSpread?: number | null;
  backToBack?: boolean;
  playerStatus?: "ACTIVE" | "PROBABLE" | "QUESTIONABLE" | "DOUBTFUL" | "OUT" | "UNKNOWN" | null;
};

type StatusRisk = {
  multiplier: number;
  risk: number;
  blocker: string | null;
  warning: string | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function roleFrom(profile: NbaPlayerStatProfile): NbaMinutesProjection["role"] {
  if (profile.minutes.starterRate >= 0.65 || profile.minutes.weighted >= 29) return "starter";
  if (profile.minutes.weighted >= 17) return "bench";
  if (profile.minutes.weighted > 0) return "fringe";
  return "unknown";
}

function statusPenalty(status: NbaMinutesProjectionInput["playerStatus"]): StatusRisk {
  switch (status) {
    case "OUT": return { multiplier: 0, risk: 1, blocker: "player listed OUT", warning: null };
    case "DOUBTFUL": return { multiplier: 0.25, risk: 0.88, blocker: "player listed DOUBTFUL", warning: null };
    case "QUESTIONABLE": return { multiplier: 0.68, risk: 0.68, blocker: "player listed QUESTIONABLE", warning: "questionable tag depresses minutes confidence" };
    case "UNKNOWN": return { multiplier: 0.76, risk: 0.55, blocker: "player status UNKNOWN", warning: "unknown availability depresses minutes confidence" };
    case "PROBABLE": return { multiplier: 0.94, risk: 0.2, blocker: null, warning: "probable tag slightly reduces minutes" };
    case "ACTIVE": return { multiplier: 1, risk: 0.05, blocker: null, warning: null };
    default: return { multiplier: 0.82, risk: 0.52, blocker: "player status missing", warning: "missing player status depresses minutes confidence" };
  }
}

function projectedBaseline(profile: NbaPlayerStatProfile, role: NbaMinutesProjection["role"]) {
  const weighted = profile.minutes.weighted;
  const average = profile.minutes.average;
  const fallback = role === "starter" ? 31 : role === "bench" ? 18 : role === "fringe" ? 8 : 0;
  return weighted || average || fallback;
}

function roleConfidence(profile: NbaPlayerStatProfile, role: NbaMinutesProjection["role"]) {
  const sampleScore = clamp(profile.sampleSize / 12, 0, 1);
  const volatilityScore = clamp(1 - profile.minutes.stdDev / Math.max(7, profile.minutes.average || 1), 0, 1);
  const starterSignal = role === "starter"
    ? clamp(profile.minutes.starterRate, 0, 1)
    : role === "bench"
      ? clamp(1 - Math.abs(profile.minutes.starterRate - 0.15), 0, 1)
      : role === "fringe"
        ? clamp(1 - profile.minutes.starterRate, 0, 1)
        : 0.2;
  return clamp(sampleScore * 0.35 + volatilityScore * 0.35 + starterSignal * 0.3, 0, 1);
}

function starterConfidence(profile: NbaPlayerStatProfile, role: NbaMinutesProjection["role"], lineupTruth?: NbaLineupTruth | null) {
  const base = role === "starter"
    ? Math.max(profile.minutes.starterRate, profile.minutes.weighted >= 30 ? 0.82 : 0)
    : role === "bench"
      ? Math.min(0.45, profile.minutes.starterRate)
      : 0.1;
  const lineupBoost = lineupTruth?.minutesTrusted ? 0.08 : lineupTruth ? -0.08 : -0.14;
  const uncertaintyPenalty = lineupTruth?.starQuestionable || lineupTruth?.lateScratchRisk ? 0.18 : 0;
  return clamp(base + lineupBoost - uncertaintyPenalty, 0, 1);
}

function rotationStability(profile: NbaPlayerStatProfile, lineupTruth?: NbaLineupTruth | null) {
  const sampleScore = clamp(profile.sampleSize / 12, 0, 1);
  const volatilityScore = clamp(1 - profile.minutes.stdDev / Math.max(6, profile.minutes.average || 1), 0, 1);
  const lineupScore = lineupTruth?.status === "GREEN" && lineupTruth.minutesTrusted ? 1 : lineupTruth?.status === "YELLOW" ? 0.55 : 0.25;
  return clamp(sampleScore * 0.3 + volatilityScore * 0.42 + lineupScore * 0.28, 0, 1);
}

function blowoutRiskFromSpread(teamSpread?: number | null) {
  if (typeof teamSpread !== "number" || !Number.isFinite(teamSpread)) return 0.12;
  return clamp((Math.abs(teamSpread) - 7.5) / 13, 0, 0.62);
}

function lineupRiskBlockers(lineupTruth?: NbaLineupTruth | null) {
  if (!lineupTruth) {
    return {
      blockers: ["lineup truth missing"],
      warnings: ["lineup truth unavailable"],
      injuryRisk: 0.55
    };
  }
  const blockers = [
    ...(lineupTruth.status !== "GREEN" ? [`lineup truth ${lineupTruth.status}`] : []),
    ...(!lineupTruth.injuryReportFresh ? ["stale injury report"] : []),
    ...(lineupTruth.starQuestionable ? ["star/high-usage player questionable or unknown"] : []),
    ...(lineupTruth.highUsageOut && !lineupTruth.minutesTrusted ? ["high-usage player out without trusted minutes redistribution"] : []),
    ...(lineupTruth.lateScratchRisk ? ["late scratch risk near tipoff"] : []),
    ...lineupTruth.blockers.map((blocker) => `lineup blocker: ${blocker}`)
  ];
  const warnings = [
    ...(!lineupTruth.minutesTrusted ? ["projected minutes are not fully trusted"] : []),
    ...lineupTruth.warnings.map((warning) => `lineup warning: ${warning}`)
  ];
  const injuryRisk = clamp(
    (lineupTruth.injuryReportFresh ? 0.08 : 0.62)
    + (lineupTruth.starQuestionable ? 0.24 : 0)
    + (lineupTruth.highUsageOut ? 0.18 : 0)
    + (lineupTruth.lateScratchRisk ? 0.22 : 0),
    0,
    1
  );
  return { blockers, warnings, injuryRisk };
}

function affectedPlayerRisk(profile: NbaPlayerStatProfile, lineupTruth?: NbaLineupTruth | null) {
  const flag = lineupTruth?.playerFlags.find((candidate) => candidate.playerName.toLowerCase() === profile.playerName.toLowerCase());
  if (!flag) return 0;
  if (flag.status === "OUT") return 1;
  if (flag.status === "DOUBTFUL") return 0.88;
  if (flag.status === "QUESTIONABLE" || flag.status === "UNKNOWN") return flag.risk === "HIGH" ? 0.76 : 0.55;
  if (flag.status === "PROBABLE") return 0.2;
  return 0.08;
}

function roleAdjustment(profile: NbaPlayerStatProfile, role: NbaMinutesProjection["role"], starterConfidenceValue: number) {
  if (role === "starter") return clamp(1 + (starterConfidenceValue - 0.75) * 0.08, 0.94, 1.04);
  if (role === "bench") return clamp(1 - profile.minutes.starterRate * 0.04, 0.94, 1.03);
  if (role === "fringe") return clamp(0.92 + profile.minutes.weighted / 100, 0.86, 1.0);
  return 0.78;
}

function restAdjustment(backToBack?: boolean) {
  return backToBack ? 0.955 : 1;
}

function blowoutAdjustment(role: NbaMinutesProjection["role"], blowoutRisk: number) {
  const sensitivity = role === "starter" ? 0.18 : role === "bench" ? 0.09 : 0.04;
  return clamp(1 - blowoutRisk * sensitivity, 0.84, 1);
}

function injuryAdjustment(injuryRisk: number, statusRisk: number) {
  return clamp(1 - Math.max(injuryRisk, statusRisk) * 0.18, 0.72, 1);
}

export function projectNbaPlayerMinutes(input: NbaMinutesProjectionInput): NbaMinutesProjection {
  const profile = input.profile;
  const role = roleFrom(profile);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const status = statusPenalty(input.playerStatus ?? null);
  const lineup = lineupRiskBlockers(input.lineupTruth);
  const playerSpecificInjuryRisk = affectedPlayerRisk(profile, input.lineupTruth);
  const blowoutRisk = blowoutRiskFromSpread(input.teamSpread);
  const foulRisk = clamp(profile.attributes.foulRisk, 0, 1);
  const injuryRisk = clamp(Math.max(status.risk, lineup.injuryRisk, playerSpecificInjuryRisk), 0, 1);
  const roleConfidenceValue = roleConfidence(profile, role);
  const starterConfidenceValue = starterConfidence(profile, role, input.lineupTruth);
  const rotationStabilityValue = rotationStability(profile, input.lineupTruth);
  const restAdj = restAdjustment(input.backToBack);
  const roleAdj = roleAdjustment(profile, role, starterConfidenceValue);
  const blowoutAdj = blowoutAdjustment(role, blowoutRisk);
  const injuryAdj = injuryAdjustment(injuryRisk, status.risk);

  if (status.blocker) blockers.push(status.blocker);
  if (status.warning) warnings.push(status.warning);
  blockers.push(...lineup.blockers);
  warnings.push(...lineup.warnings);
  if (profile.sampleSize < 5) warnings.push("low minutes sample");
  if (profile.minutes.stdDev >= 6) warnings.push("high recent minutes volatility");
  if (rotationStabilityValue < 0.45) warnings.push("rotation stability below 0.45");
  if (roleConfidenceValue < 0.45) warnings.push("role confidence below 0.45");
  if (input.backToBack) warnings.push("back-to-back rest adjustment applied");
  if (blowoutRisk >= 0.35) warnings.push("elevated blowout minutes risk");

  let projected = projectedBaseline(profile, role);
  projected *= roleAdj * restAdj * blowoutAdj * injuryAdj;
  projected *= 1 - foulRisk * 0.08;

  if (role === "starter") projected = clamp(projected, 18, 39.5);
  else if (role === "bench") projected = clamp(projected, 8, 31.5);
  else if (role === "fringe") projected = clamp(projected, 0, 18.5);
  else projected = clamp(projected, 0, 24);

  if (input.playerStatus === "OUT") projected = 0;
  if (input.playerStatus === "DOUBTFUL") projected = Math.min(projected, 10);

  const minutesVolatility = clamp(
    0.22
    + profile.minutes.stdDev / Math.max(36, (profile.minutes.average || 1) * 2.2)
    + blowoutRisk * 0.22
    + injuryRisk * 0.28
    + (1 - rotationStabilityValue) * 0.24
    + (input.backToBack ? 0.04 : 0),
    0,
    1
  );
  const volatilityBand = 2.5 + profile.minutes.stdDev * 0.72 + blowoutRisk * 5.5 + injuryRisk * 7.5 + (1 - rotationStabilityValue) * 4.5 + (input.backToBack ? 1.25 : 0);
  const floorMinutes = clamp(projected - volatilityBand, 0, 42);
  const ceilingMinutes = clamp(projected + volatilityBand, 0, 44);
  const rawConfidence = clamp(
    profile.reliability * 0.26
    + roleConfidenceValue * 0.22
    + rotationStabilityValue * 0.22
    + starterConfidenceValue * 0.1
    + (input.lineupTruth?.status === "GREEN" ? 0.12 : input.lineupTruth?.status === "YELLOW" ? 0.04 : 0)
    + (input.lineupTruth?.injuryReportFresh === true ? 0.06 : 0)
    + (1 - injuryRisk) * 0.08
    + (1 - minutesVolatility) * 0.08,
    0,
    1
  );
  const confidence = blockers.length ? Math.min(rawConfidence, 0.49) : rawConfidence;

  return {
    projectedMinutes: round(projected, 2),
    floorMinutes: round(floorMinutes, 2),
    ceilingMinutes: round(ceilingMinutes, 2),
    confidence: round(confidence, 3),
    roleConfidence: round(roleConfidenceValue, 3),
    starterConfidence: round(starterConfidenceValue, 3),
    rotationStability: round(rotationStabilityValue, 3),
    minutesVolatility: round(minutesVolatility, 3),
    role,
    starterLikely: role === "starter" && projected >= 24 && starterConfidenceValue >= 0.65,
    closingLineupLikely: role === "starter" && projected >= 29 && injuryRisk < 0.25 && blowoutRisk < 0.35 && rotationStabilityValue >= 0.65,
    blowoutRisk: round(blowoutRisk, 3),
    foulRisk: round(foulRisk, 3),
    injuryRisk: round(injuryRisk, 3),
    restAdjustment: round(restAdj, 3),
    blowoutAdjustment: round(blowoutAdj, 3),
    injuryAdjustment: round(injuryAdj, 3),
    roleAdjustment: round(roleAdj, 3),
    blockers: unique(blockers),
    warnings: unique(warnings),
    drivers: unique([
      `baseline ${round(projectedBaseline(profile, role), 2)} minutes`,
      `role ${role} confidence ${round(roleConfidenceValue, 3)}`,
      `starter confidence ${round(starterConfidenceValue, 3)}`,
      `rotation stability ${round(rotationStabilityValue, 3)}`,
      `rest adjustment ${round(restAdj, 3)}`,
      `blowout adjustment ${round(blowoutAdj, 3)}`,
      `injury adjustment ${round(injuryAdj, 3)}`,
      `role adjustment ${round(roleAdj, 3)}`
    ])
  };
}
