import type { MlbBatterAdvancedMatchup } from "@/services/simulation/mlb-batter-advanced-matchup";
import type { MlbBatterStatProfile } from "@/services/simulation/mlb-batter-stat-profile";
import type { MlbProjectionRating } from "@/services/simulation/mlb-player-stat-inning-engine";

export type MlbPlateAppearanceOutcomeModel = {
  modelVersion: "mlb-plate-appearance-outcome-v1";
  hitRate: number;
  walkRate: number;
  strikeoutRate: number;
  homeRunRate: number;
  singleRate: number;
  extraBaseHitRate: number;
  ballInPlayOutRate: number;
  expectedTotalBasesPerPa: number;
  expectedTotalBasesPerHit: number;
  qualityOfContactScore: number;
  pitcherSuppressionScore: number;
  outcomeConfidence: number;
  drivers: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function metric(row: MlbProjectionRating | null | undefined, keys: string[]) {
  const metrics = row?.metrics_json ?? {};
  for (const key of keys) {
    const value = numberValue(metrics[key]);
    if (value !== null) return value;
  }
  return null;
}

function rate(value: number | null, fallback: number, min: number, max: number) {
  if (value === null) return fallback;
  return clamp(value > 1.5 ? value / 100 : value, min, max);
}

function safeSkill(value: unknown, fallback = 70) {
  const parsed = numberValue(value);
  return parsed === null ? fallback : parsed;
}

function pitcherSuppression(opponentStarter: MlbProjectionRating | null) {
  if (!opponentStarter) return 0;
  const xera = safeSkill(opponentStarter.xera_quality);
  const fip = safeSkill(opponentStarter.fip_quality);
  const kbb = safeSkill(opponentStarter.k_bb);
  const hrRisk = safeSkill(opponentStarter.hr_risk, 30);
  const groundball = safeSkill(opponentStarter.groundball_rate);
  const arsenal = safeSkill(opponentStarter.arsenal_quality);
  const hardHitAllowed = rate(metric(opponentStarter, ["hardHitAllowed", "hardHitAllowedRate", "hardHitPctAllowed"]), 0.39, 0.22, 0.58);
  const barrelAllowed = rate(metric(opponentStarter, ["barrelAllowed", "barrelAllowedRate", "barrelPctAllowed"]), 0.075, 0.02, 0.19);

  return clamp(
    (xera - 70) * 0.18 +
    (fip - 70) * 0.15 +
    (kbb - 70) * 0.2 +
    (30 - hrRisk) * 0.14 +
    (groundball - 70) * 0.08 +
    (arsenal - 70) * 0.15 -
    (hardHitAllowed - 0.39) * 30 -
    (barrelAllowed - 0.075) * 45,
    -24,
    24
  );
}

function qualityOfContact(profile: MlbBatterStatProfile, advanced: MlbBatterAdvancedMatchup, opponentStarter: MlbProjectionRating | null) {
  const pitcher = pitcherSuppression(opponentStarter);
  const raw =
    (profile.xWoba - 0.315) * 80 +
    (profile.xSlug - 0.405) * 62 +
    (profile.iso - 0.155) * 58 +
    (profile.barrelRate - 0.075) * 115 +
    (profile.hardHitRate - 0.39) * 38 +
    (profile.avgExitVelocity - 88.4) * 0.9 +
    (advanced.rollingFormScore * 0.28) +
    (advanced.pitchTypeScore * 0.34) +
    (advanced.environmentScore * 0.24) +
    (advanced.platoonScore * 0.18) -
    pitcher * 0.35;
  return clamp(raw, -30, 34);
}

function normalizeOutcome(args: {
  hitRate: number;
  walkRate: number;
  strikeoutRate: number;
  homeRunRate: number;
  tbPerHit: number;
}) {
  const walkRate = clamp(args.walkRate, 0.025, 0.22);
  const strikeoutRate = clamp(args.strikeoutRate, 0.06, 0.44);
  const homeRunRate = clamp(args.homeRunRate, 0.0015, 0.13);
  const hitRate = clamp(Math.max(args.hitRate, homeRunRate + 0.055), 0.105, 0.42);
  const nonHrHitRate = clamp(hitRate - homeRunRate, 0.045, 0.35);
  const extraBaseShare = clamp((args.tbPerHit - 1.16) / 1.24, 0.07, 0.58);
  const extraBaseHitRate = nonHrHitRate * extraBaseShare;
  const singleRate = Math.max(0.025, nonHrHitRate - extraBaseHitRate);
  const occupied = walkRate + strikeoutRate + homeRunRate + singleRate + extraBaseHitRate;

  if (occupied <= 0.94) {
    const ballInPlayOutRate = 1 - occupied;
    return { walkRate, strikeoutRate, homeRunRate, singleRate, extraBaseHitRate, ballInPlayOutRate };
  }

  const scale = (0.94 - walkRate - strikeoutRate) / Math.max(0.001, homeRunRate + singleRate + extraBaseHitRate);
  const scaledHr = Math.max(0.0015, homeRunRate * scale);
  const scaledSingle = Math.max(0.025, singleRate * scale);
  const scaledXbh = Math.max(0.01, extraBaseHitRate * scale);
  return {
    walkRate,
    strikeoutRate,
    homeRunRate: scaledHr,
    singleRate: scaledSingle,
    extraBaseHitRate: scaledXbh,
    ballInPlayOutRate: Math.max(0.04, 1 - walkRate - strikeoutRate - scaledHr - scaledSingle - scaledXbh)
  };
}

export function deriveMlbPlateAppearanceOutcomeModel(args: {
  batter: MlbProjectionRating;
  opponentStarter: MlbProjectionRating | null;
  batterStats: MlbBatterStatProfile;
  advancedMatchup: MlbBatterAdvancedMatchup;
  baseHitRate: number;
  baseWalkRate: number;
  baseStrikeoutRate: number;
  baseHomeRunRate: number;
  baseTotalBasesPerHit: number;
}): MlbPlateAppearanceOutcomeModel {
  const profile = args.batterStats;
  const advanced = args.advancedMatchup;
  const suppression = pitcherSuppression(args.opponentStarter);
  const qoc = qualityOfContact(profile, advanced, args.opponentStarter);
  const starterWhiff = rate(metric(args.opponentStarter, ["whiffRate", "swingingStrikeRate", "swStrRate"]), 0.115, 0.06, 0.19);
  const starterZone = rate(metric(args.opponentStarter, ["zoneRate", "strikeZoneRate"]), 0.485, 0.38, 0.58);
  const starterHrPer9 = metric(args.opponentStarter, ["homeRunsPer9", "hrPer9"]);
  const hrSuppression = starterHrPer9 === null ? 0 : clamp((1.05 - starterHrPer9) * 0.045, -0.035, 0.035);

  const hitRate = clamp(
    args.baseHitRate * advanced.contactMultiplier +
    qoc * 0.0013 -
    suppression * 0.0011,
    0.105,
    0.42
  );
  const walkRate = clamp(
    args.baseWalkRate * advanced.walkMultiplier -
    (starterZone - 0.485) * 0.18 -
    suppression * 0.00025,
    0.025,
    0.22
  );
  const strikeoutRate = clamp(
    args.baseStrikeoutRate * advanced.strikeoutMultiplier +
    (starterWhiff - 0.115) * 0.9 +
    suppression * 0.0013 -
    qoc * 0.00045,
    0.06,
    0.44
  );
  const homeRunRate = clamp(
    args.baseHomeRunRate * advanced.powerMultiplier +
    qoc * 0.00055 -
    suppression * 0.00045 +
    hrSuppression,
    0.0015,
    0.13
  );
  const tbPerHit = clamp(
    args.baseTotalBasesPerHit * clamp(advanced.powerMultiplier, 0.84, 1.22) +
    qoc * 0.006 -
    suppression * 0.003,
    1.03,
    2.75
  );
  const normalized = normalizeOutcome({ hitRate, walkRate, strikeoutRate, homeRunRate, tbPerHit });
  const finalHitRate = normalized.singleRate + normalized.extraBaseHitRate + normalized.homeRunRate;
  const expectedTotalBasesPerPa = normalized.singleRate + normalized.extraBaseHitRate * 2.05 + normalized.homeRunRate * 4;
  const expectedTotalBasesPerHit = finalHitRate > 0 ? expectedTotalBasesPerPa / finalHitRate : tbPerHit;
  const confidence = clamp(profile.confidence * 0.48 + advanced.confidence * 0.34 + (args.opponentStarter ? 0.18 : 0.06), 0.2, 0.95);
  const drivers: string[] = [];
  if (qoc >= 8) drivers.push("quality-contact-up");
  if (qoc <= -8) drivers.push("quality-contact-down");
  if (suppression >= 8) drivers.push("starter-suppression");
  if (suppression <= -8) drivers.push("starter-vulnerability");
  if (starterWhiff >= 0.135) drivers.push("starter-whiff-risk");
  if (starterZone <= 0.455) drivers.push("walk-environment");
  if (expectedTotalBasesPerHit >= 1.75) drivers.push("extra-base-shape");
  if (normalized.homeRunRate >= 0.055) drivers.push("hr-shape");

  return {
    modelVersion: "mlb-plate-appearance-outcome-v1",
    hitRate: round(finalHitRate, 4),
    walkRate: round(normalized.walkRate, 4),
    strikeoutRate: round(normalized.strikeoutRate, 4),
    homeRunRate: round(normalized.homeRunRate, 4),
    singleRate: round(normalized.singleRate, 4),
    extraBaseHitRate: round(normalized.extraBaseHitRate, 4),
    ballInPlayOutRate: round(normalized.ballInPlayOutRate, 4),
    expectedTotalBasesPerPa: round(expectedTotalBasesPerPa, 4),
    expectedTotalBasesPerHit: round(expectedTotalBasesPerHit, 3),
    qualityOfContactScore: round(qoc, 3),
    pitcherSuppressionScore: round(suppression, 3),
    outcomeConfidence: round(confidence, 3),
    drivers: drivers.length ? drivers : ["balanced-pa-outcome"]
  };
}
