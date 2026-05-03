import type { NbaLineupTruth } from "./nba-lineup-truth";
import type { NbaPlayerStatProfile } from "./nba-player-stat-profile";

export type NbaUsageRedistribution = {
  usageMultiplier: number;
  assistMultiplier: number;
  reboundMultiplier: number;
  volatilityMultiplier: number;
  vacatedUsage: number;
  confidence: number;
  reasons: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

export function buildNbaUsageRedistribution(args: {
  profile: NbaPlayerStatProfile;
  lineupTruth?: NbaLineupTruth | null;
  teammateOutUsageImpact?: number;
  teammateQuestionableUsageImpact?: number;
}): NbaUsageRedistribution {
  const profile = args.profile;
  const reasons: string[] = [];
  const teammateOut = Math.max(0, args.teammateOutUsageImpact ?? 0);
  const teammateQuestionable = Math.max(0, args.teammateQuestionableUsageImpact ?? 0);
  const lineupVacated = (args.lineupTruth?.playerFlags ?? [])
    .filter((flag) => flag.team === profile.team && (flag.status === "OUT" || flag.status === "DOUBTFUL"))
    .reduce((sum, flag) => sum + Math.max(0, flag.usageImpact), 0);
  const uncertainVacated = (args.lineupTruth?.playerFlags ?? [])
    .filter((flag) => flag.team === profile.team && (flag.status === "QUESTIONABLE" || flag.status === "UNKNOWN"))
    .reduce((sum, flag) => sum + Math.max(0, flag.usageImpact) * 0.35, 0);
  const vacatedUsage = teammateOut + teammateQuestionable * 0.35 + lineupVacated + uncertainVacated;
  const absorptionScore = clamp(
    profile.attributes.usageCeiling * 0.34
    + profile.tendencies.touchesPerMinute * 0.24
    + profile.tendencies.shotAttemptRate * 0.18
    + profile.attributes.passingSkill * 0.12
    + profile.reliability * 0.12,
    0,
    1
  );
  const boost = clamp(vacatedUsage * absorptionScore / 18, 0, 0.22);
  const uncertainPenalty = args.lineupTruth?.starQuestionable ? 0.04 : 0;
  const usageMultiplier = clamp(1 + boost - uncertainPenalty, 0.88, 1.24);
  const assistMultiplier = clamp(1 + boost * (0.35 + profile.attributes.passingSkill * 0.55), 0.9, 1.18);
  const reboundMultiplier = clamp(1 + boost * (0.2 + profile.attributes.reboundingSkill * 0.35), 0.94, 1.12);
  const volatilityMultiplier = clamp(1 + boost * 0.9 + (args.lineupTruth?.status === "GREEN" ? 0 : 0.12), 1, 1.35);

  if (vacatedUsage > 0) reasons.push(`vacated usage ${round(vacatedUsage, 2)} absorbed at score ${round(absorptionScore, 3)}`);
  if (args.lineupTruth?.status && args.lineupTruth.status !== "GREEN") reasons.push(`lineup truth ${args.lineupTruth.status} increases volatility`);
  if (usageMultiplier > 1.04) reasons.push(`usage multiplier ${round(usageMultiplier, 3)}`);

  return {
    usageMultiplier: round(usageMultiplier, 4),
    assistMultiplier: round(assistMultiplier, 4),
    reboundMultiplier: round(reboundMultiplier, 4),
    volatilityMultiplier: round(volatilityMultiplier, 4),
    vacatedUsage: round(vacatedUsage, 3),
    confidence: round(clamp(profile.reliability * 0.55 + (args.lineupTruth?.status === "GREEN" ? 0.35 : 0.12) + (vacatedUsage > 0 ? 0.1 : 0.04), 0, 1), 3),
    reasons
  };
}
