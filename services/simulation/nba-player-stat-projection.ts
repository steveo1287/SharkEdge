import { buildNbaUsageRedistribution, type NbaUsageRedistribution } from "./nba-usage-redistribution";
import { projectNbaPlayerMinutes, type NbaMinutesProjection } from "./nba-minutes-projection";
import { buildNbaPlayerStatProfile, type NbaPlayerBoxScoreRow, type NbaPlayerStatProfile, type NbaStatKey } from "./nba-player-stat-profile";
import type { NbaLineupTruth } from "./nba-lineup-truth";

export type NbaPlayerStatProjection = {
  playerId: string;
  playerName: string;
  statKey: NbaStatKey;
  mean: number;
  median: number;
  stdDev: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  marketLine: number | null;
  overProbability: number | null;
  underProbability: number | null;
  confidence: number;
  noBet: boolean;
  blockers: string[];
  warnings: string[];
  drivers: string[];
  profile: NbaPlayerStatProfile;
  minutes: NbaMinutesProjection;
  usage: NbaUsageRedistribution;
};

export type NbaPlayerStatProjectionInput = {
  playerId: string;
  playerName: string;
  team?: string | null;
  position?: string | null;
  statKey: NbaStatKey;
  recentStats: NbaPlayerBoxScoreRow[];
  lineupTruth?: NbaLineupTruth | null;
  marketLine?: number | null;
  marketOddsOver?: number | null;
  marketOddsUnder?: number | null;
  teamSpread?: number | null;
  backToBack?: boolean;
  playerStatus?: "ACTIVE" | "PROBABLE" | "QUESTIONABLE" | "DOUBTFUL" | "OUT" | "UNKNOWN" | null;
  teammateOutUsageImpact?: number;
  teammateQuestionableUsageImpact?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function erf(x: number) {
  const sign = x >= 0 ? 1 : -1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

function normalCdf(x: number, mean: number, sd: number) {
  if (!Number.isFinite(sd) || sd <= 0) return x >= mean ? 1 : 0;
  const z = (x - mean) / (sd * Math.sqrt(2));
  return 0.5 * (1 + erf(z));
}

function poissonCdf(k: number, lambda: number) {
  if (lambda <= 0) return 1;
  let sum = 0;
  let term = Math.exp(-lambda);
  sum += term;
  for (let i = 1; i <= Math.max(0, Math.floor(k)); i += 1) {
    term *= lambda / i;
    sum += term;
  }
  return clamp(sum, 0, 1);
}

function distributionStd(statKey: NbaStatKey, mean: number, profileStd: number, volatilityMultiplier: number) {
  const baseline = statKey === "points" ? 3.8 : statKey === "rebounds" ? 2.1 : statKey === "assists" ? 1.7 : statKey === "threes" ? 0.9 : statKey === "pra" ? 5.2 : 0.85;
  const meanDriven = statKey === "points" ? Math.sqrt(Math.max(1, mean)) * 1.35
    : statKey === "rebounds" || statKey === "assists" || statKey === "pra" ? Math.sqrt(Math.max(1, mean)) * 1.1
      : Math.sqrt(Math.max(0.25, mean)) * 0.95;
  return clamp(Math.max(baseline, profileStd * 0.72, meanDriven) * volatilityMultiplier, 0.45, 16);
}

function statMultiplier(statKey: NbaStatKey, usage: NbaUsageRedistribution) {
  if (statKey === "points" || statKey === "threes" || statKey === "turnovers") return usage.usageMultiplier;
  if (statKey === "assists") return usage.assistMultiplier;
  if (statKey === "rebounds" || statKey === "blocks") return usage.reboundMultiplier;
  if (statKey === "pra") return (usage.usageMultiplier + usage.assistMultiplier + usage.reboundMultiplier) / 3;
  return 1;
}

function marketBlendWeight(args: { line: number | null | undefined; profile: NbaPlayerStatProfile; minutes: NbaMinutesProjection; lineupTruth?: NbaLineupTruth | null }) {
  if (typeof args.line !== "number" || !Number.isFinite(args.line)) return 0;
  const uncertainty = (1 - args.profile.reliability) * 0.25 + (1 - args.minutes.confidence) * 0.3 + (args.lineupTruth?.status === "GREEN" ? 0 : 0.25);
  return clamp(0.35 + uncertainty, 0.35, 0.72);
}

function quantile(mean: number, sd: number, z: number) {
  return Math.max(0, mean + z * sd);
}

function overProb(statKey: NbaStatKey, line: number | null | undefined, mean: number, sd: number) {
  if (typeof line !== "number" || !Number.isFinite(line)) return null;
  if (statKey === "steals" || statKey === "blocks" || statKey === "threes") {
    return round(1 - poissonCdf(line, Math.max(0.01, mean)), 4);
  }
  return round(1 - normalCdf(line, mean, sd), 4);
}

export function projectNbaPlayerStat(input: NbaPlayerStatProjectionInput): NbaPlayerStatProjection {
  const profile = buildNbaPlayerStatProfile({
    playerId: input.playerId,
    playerName: input.playerName,
    team: input.team,
    position: input.position,
    recentStats: input.recentStats
  });
  const minutes = projectNbaPlayerMinutes({
    profile,
    lineupTruth: input.lineupTruth,
    marketLine: input.marketLine,
    teamSpread: input.teamSpread,
    backToBack: input.backToBack,
    playerStatus: input.playerStatus
  });
  const usage = buildNbaUsageRedistribution({
    profile,
    lineupTruth: input.lineupTruth,
    teammateOutUsageImpact: input.teammateOutUsageImpact,
    teammateQuestionableUsageImpact: input.teammateQuestionableUsageImpact
  });
  const baseRate = profile.statRatesPerMinute[input.statKey] ?? 0;
  const multiplier = statMultiplier(input.statKey, usage);
  const rawMean = baseRate * minutes.projectedMinutes * multiplier;
  const marketBlend = marketBlendWeight({ line: input.marketLine, profile, minutes, lineupTruth: input.lineupTruth });
  const marketLineMean = typeof input.marketLine === "number" ? input.marketLine : rawMean;
  const mean = clamp(rawMean * (1 - marketBlend) + marketLineMean * marketBlend, 0, 80);
  const stdDev = distributionStd(input.statKey, mean, profile.statStdDev[input.statKey] ?? 0, usage.volatilityMultiplier);
  const overProbability = overProb(input.statKey, input.marketLine, mean, stdDev);
  const underProbability = overProbability === null ? null : round(1 - overProbability, 4);
  const blockers = [...minutes.blockers];
  const warnings = [...profile.warnings, ...minutes.warnings];

  if (input.lineupTruth?.status !== "GREEN") blockers.push(`lineup truth ${input.lineupTruth?.status ?? "missing"}`);
  if (minutes.confidence < 0.65) blockers.push("minutes confidence below 0.65");
  if (profile.sampleSize < 5) blockers.push("low player stat sample");
  if (input.playerStatus === "QUESTIONABLE" || input.playerStatus === "DOUBTFUL" || input.playerStatus === "OUT" || input.playerStatus === "UNKNOWN") blockers.push(`player status ${input.playerStatus}`);
  if (typeof input.marketLine !== "number") warnings.push("missing market line");

  const confidence = clamp(
    minutes.confidence * 0.28
    + profile.reliability * 0.24
    + usage.confidence * 0.14
    + (input.lineupTruth?.status === "GREEN" ? 0.18 : 0)
    + (typeof input.marketLine === "number" ? 0.08 : 0.02)
    + (1 - profile.attributes.volatility) * 0.08,
    0,
    1
  );

  return {
    playerId: input.playerId,
    playerName: input.playerName,
    statKey: input.statKey,
    mean: round(mean, 3),
    median: round(mean, 3),
    stdDev: round(stdDev, 3),
    p10: round(quantile(mean, stdDev, -1.2816), 3),
    p25: round(quantile(mean, stdDev, -0.6745), 3),
    p75: round(quantile(mean, stdDev, 0.6745), 3),
    p90: round(quantile(mean, stdDev, 1.2816), 3),
    marketLine: typeof input.marketLine === "number" ? input.marketLine : null,
    overProbability,
    underProbability,
    confidence: round(confidence, 3),
    noBet: blockers.length > 0,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    drivers: [
      `${round(minutes.projectedMinutes, 1)} projected minutes`,
      `${round(baseRate, 4)} ${input.statKey}/minute baseline`,
      `${round(multiplier, 3)} stat multiplier`,
      `${round(marketBlend, 3)} market blend`,
      ...usage.reasons
    ],
    profile,
    minutes,
    usage
  };
}
