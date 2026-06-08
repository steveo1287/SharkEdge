import type { MlbProjectionRating } from "@/services/simulation/mlb-player-stat-inning-engine";
import type { MlbEliteRatingBuild } from "@/services/simulation/mlb-elite-rating-system";
import type {
  MlbBatterMicroTendency,
  MlbMicroOutcomeRates,
  MlbPitcherMicroTendency,
  MlbPitchMix,
  MlbPitchType,
  MlbSprayProfile
} from "@/services/simulation/mlb-micro-tendency-model";

export type MlbEliteIntelligenceTier = "ELITE" | "BETTABLE" | "WATCH" | "THIN" | "MISSING";

export type MlbElitePlayerUpgrade = {
  playerId: string;
  playerName: string;
  team: string | null;
  role: "hitter" | "pitcher";
  tier: MlbEliteIntelligenceTier;
  ratingTrust: number;
  tendencyTrust: number;
  combinedTrust: number;
  originalOverall: number;
  upgradedOverall: number;
  microCoverage: number;
  sampleScore: number;
  skillShapeScore: number;
  warningCount: number;
  warnings: string[];
};

export type MlbEliteIntelligenceUpgradeReport = {
  modelVersion: "mlb-elite-intelligence-upgrade-v1";
  generatedAt: string;
  ratingModelVersion: MlbEliteRatingBuild["modelVersion"];
  hitterCount: number;
  pitcherCount: number;
  batterMicroCount: number;
  pitcherMicroCount: number;
  hitterCoverage: number;
  pitcherCoverage: number;
  averageRatingTrust: number;
  averageTendencyTrust: number;
  averageCombinedTrust: number;
  elitePlayers: number;
  bettablePlayers: number;
  thinPlayers: number;
  gates: Array<{ key: string; label: string; passed: boolean; detail: string }>;
  warnings: string[];
  playerUpgrades: MlbElitePlayerUpgrade[];
};

export type MlbEliteIntelligenceUpgradeResult = {
  ratings: MlbEliteRatingBuild;
  report: MlbEliteIntelligenceUpgradeReport;
};

type Numberish = number | string | null | undefined;

const PITCH_TYPES: MlbPitchType[] = ["FF", "SI", "FC", "SL", "ST", "CU", "KC", "CH", "FS", "SPL", "KN", "OTHER"];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function asNumber(value: Numberish, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function percent(value: Numberish, fallback = 0) {
  const parsed = asNumber(value, fallback);
  return parsed > 1.5 ? parsed / 100 : parsed;
}

function mean(values: number[], fallback = 0) {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : fallback;
}

function weightedMean(values: Array<{ value: number; weight: number }>, fallback = 0) {
  const usable = values.filter((row) => Number.isFinite(row.value) && row.weight > 0);
  const denom = usable.reduce((sum, row) => sum + row.weight, 0);
  return denom > 0 ? usable.reduce((sum, row) => sum + row.value * row.weight, 0) / denom : fallback;
}

function nameKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function lookupKey(id: unknown, name: unknown) {
  const playerId = String(id ?? "").trim();
  return playerId || `name:${nameKey(name)}`;
}

function metricNumber(rating: MlbProjectionRating, key: string, fallback = 0) {
  return asNumber(rating.metrics_json?.[key] as Numberish, fallback);
}

function sampleNumber(rating: MlbProjectionRating, key: string, fallback = 0) {
  const sample = rating.metrics_json?.sample;
  if (!sample || typeof sample !== "object" || Array.isArray(sample)) return fallback;
  return asNumber((sample as Record<string, unknown>)[key] as Numberish, fallback);
}

function mapByIdAndName<T extends { mlbId: string | number; name: string }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const row of rows) {
    map.set(lookupKey(row.mlbId, row.name), row);
    map.set(`name:${nameKey(row.name)}`, row);
  }
  return map;
}

function findMicro<T extends { mlbId: string | number; name: string }>(rating: MlbProjectionRating, map: Map<string, T>) {
  return map.get(lookupKey(rating.id, rating.name)) ?? map.get(`name:${nameKey(rating.name)}`) ?? null;
}

function valueCompleteness(values: unknown[]) {
  if (!values.length) return 0;
  return values.filter((value) => typeof value === "number" && Number.isFinite(value)).length / values.length;
}

function outcomeCompleteness(outcome: Partial<MlbMicroOutcomeRates> | undefined | null) {
  if (!outcome) return 0;
  return valueCompleteness([
    outcome.walkRate,
    outcome.strikeoutRate,
    outcome.homeRunRate,
    outcome.extraBaseHitRate,
    outcome.groundballRate,
    outcome.lineDriveRate,
    outcome.flyballRate,
    outcome.hardHitRate,
    outcome.expectedWoba,
    outcome.expectedSlug
  ]);
}

function sprayCompleteness(spray: Partial<MlbSprayProfile> | undefined | null) {
  if (!spray) return 0;
  return valueCompleteness([spray.pull, spray.center, spray.opposite, spray.groundball, spray.lineDrive, spray.flyball, spray.popup]);
}

function pitchMixCompleteness(mix: MlbPitchMix | undefined | null) {
  if (!mix) return 0;
  const usable = PITCH_TYPES.filter((pitch) => typeof mix[pitch] === "number" && Number.isFinite(mix[pitch] as number));
  return usable.length / PITCH_TYPES.length;
}

function entropy(mix: MlbPitchMix | undefined | null) {
  if (!mix) return 0;
  const total = PITCH_TYPES.reduce((sum, pitch) => sum + Math.max(0, asNumber(mix[pitch] as Numberish, 0)), 0);
  if (total <= 0) return 0;
  const normalized = PITCH_TYPES.map((pitch) => Math.max(0, asNumber(mix[pitch] as Numberish, 0)) / total).filter((value) => value > 0);
  const raw = normalized.reduce((sum, value) => sum - value * Math.log(value), 0);
  return clamp(raw / Math.log(Math.min(PITCH_TYPES.length, Math.max(2, normalized.length || 2))), 0, 1);
}

function hitterMicroCoverage(row: MlbBatterMicroTendency | null) {
  if (!row) return 0;
  const countOutcomeCoverage = row.outcomeByCount ? Object.keys(row.outcomeByCount).length / 12 : 0;
  const baseCoverage = row.outcomeByBaseState ? Object.keys(row.outcomeByBaseState).length / 8 : 0;
  const pitchCoverage = valueCompleteness([
    ...PITCH_TYPES.map((pitch) => row.pitchTypeRunValue?.[pitch]),
    ...PITCH_TYPES.map((pitch) => row.pitchTypeWhiffRate?.[pitch]),
    ...PITCH_TYPES.map((pitch) => row.pitchTypeHardHitRate?.[pitch])
  ]);
  const runnersCoverage = row.runnersOnBase ? Object.keys(row.runnersOnBase).length / 6 : 0;
  return clamp(weightedMean([
    { value: countOutcomeCoverage, weight: 1.2 },
    { value: baseCoverage, weight: 1.0 },
    { value: pitchCoverage, weight: 1.4 },
    { value: runnersCoverage, weight: 0.8 },
    { value: sprayCompleteness(row.sprayOverall), weight: 1.0 },
    { value: valueCompleteness([row.outcomeByPitcherHand?.L?.expectedWoba, row.outcomeByPitcherHand?.R?.expectedWoba]), weight: 0.8 }
  ], 0), 0, 1);
}

function pitcherMicroCoverage(row: MlbPitcherMicroTendency | null) {
  if (!row) return 0;
  const countPitchMixCoverage = row.pitchMixByCount ? Object.keys(row.pitchMixByCount).length / 12 : 0;
  const basePitchMixCoverage = row.pitchMixByBaseState ? Object.keys(row.pitchMixByBaseState).length / 8 : 0;
  const pitchMetricCoverage = valueCompleteness([
    ...PITCH_TYPES.map((pitch) => row.pitchRunValueAllowed?.[pitch]),
    ...PITCH_TYPES.map((pitch) => row.whiffRateByPitch?.[pitch]),
    ...PITCH_TYPES.map((pitch) => row.calledStrikeRateByPitch?.[pitch]),
    ...PITCH_TYPES.map((pitch) => row.groundballRateByPitch?.[pitch]),
    ...PITCH_TYPES.map((pitch) => row.hardHitRateAllowedByPitch?.[pitch])
  ]);
  return clamp(weightedMean([
    { value: pitchMixCompleteness(row.pitchMixOverall), weight: 1.0 },
    { value: countPitchMixCoverage, weight: 1.25 },
    { value: basePitchMixCoverage, weight: 0.8 },
    { value: pitchMetricCoverage, weight: 1.4 },
    { value: valueCompleteness([row.outcomeByBatterHand?.L?.expectedWoba, row.outcomeByBatterHand?.R?.expectedWoba]), weight: 0.9 },
    { value: entropy(row.pitchMixOverall), weight: 0.45 }
  ], 0), 0, 1);
}

function hitterSkillShape(rating: MlbProjectionRating, micro: MlbBatterMicroTendency | null) {
  const contact = asNumber(rating.contact, 70);
  const power = asNumber(rating.power, 70);
  const discipline = asNumber(rating.discipline, 70);
  const current = asNumber(rating.current_form, 70);
  const pitchValue = micro ? mean(PITCH_TYPES.map((pitch) => asNumber(micro.pitchTypeRunValue?.[pitch], 0)), 0) : 0;
  const hardHit = micro ? mean(PITCH_TYPES.map((pitch) => percent(micro.pitchTypeHardHitRate?.[pitch], 0.39)), 0.39) : 0.39;
  const whiff = micro ? mean(PITCH_TYPES.map((pitch) => percent(micro.pitchTypeWhiffRate?.[pitch], 0.245)), 0.245) : 0.245;
  const risp = micro ? asNumber(micro.runnersOnBase?.risp?.expectedWoba, asNumber(micro.runnersOnBase?.any?.expectedWoba, 0.32)) : 0.32;
  const sprayAir = micro ? (asNumber(micro.sprayOverall?.pull, 0.39) * (asNumber(micro.sprayOverall?.flyball, 0.28) + asNumber(micro.sprayOverall?.lineDrive, 0.24))) : 0.203;
  return clamp(weightedMean([
    { value: contact, weight: 1.0 },
    { value: power, weight: 1.05 },
    { value: discipline, weight: 0.85 },
    { value: current, weight: 0.65 },
    { value: 70 + pitchValue * 1.4, weight: 0.7 },
    { value: 70 + (hardHit - 0.39) * 90, weight: 0.75 },
    { value: 70 + (0.245 - whiff) * 80, weight: 0.7 },
    { value: 70 + (risp - 0.32) * 80, weight: 0.45 },
    { value: 70 + (sprayAir - 0.203) * 90, weight: 0.35 }
  ], 70), 35, 98);
}

function pitcherSkillShape(rating: MlbProjectionRating, micro: MlbPitcherMicroTendency | null) {
  const xera = asNumber(rating.xera_quality, 70);
  const fip = asNumber(rating.fip_quality, 70);
  const kbb = asNumber(rating.k_bb, 70);
  const hrRiskAvoid = 100 - asNumber(rating.hr_risk, 30);
  const groundball = asNumber(rating.groundball_rate, 70);
  const arsenal = asNumber(rating.arsenal_quality, 70);
  const runValueAllowed = micro ? mean(PITCH_TYPES.map((pitch) => asNumber(micro.pitchRunValueAllowed?.[pitch], 0)), 0) : 0;
  const whiff = micro ? mean(PITCH_TYPES.map((pitch) => percent(micro.whiffRateByPitch?.[pitch], 0.245)), 0.245) : 0.245;
  const hardHitAllowed = micro ? mean(PITCH_TYPES.map((pitch) => percent(micro.hardHitRateAllowedByPitch?.[pitch], 0.39)), 0.39) : 0.39;
  const calledStrike = micro ? mean(PITCH_TYPES.map((pitch) => percent(micro.calledStrikeRateByPitch?.[pitch], 0.17)), 0.17) : 0.17;
  return clamp(weightedMean([
    { value: xera, weight: 1.0 },
    { value: fip, weight: 0.9 },
    { value: kbb, weight: 1.05 },
    { value: hrRiskAvoid, weight: 0.75 },
    { value: groundball, weight: 0.55 },
    { value: arsenal, weight: 0.85 },
    { value: 70 - runValueAllowed * 1.25, weight: 0.7 },
    { value: 70 + (whiff - 0.245) * 85, weight: 0.7 },
    { value: 70 + (0.39 - hardHitAllowed) * 85, weight: 0.65 },
    { value: 70 + (calledStrike - 0.17) * 75, weight: 0.35 },
    { value: 70 + entropy(micro?.pitchMixOverall) * 8, weight: 0.3 }
  ], 70), 35, 98);
}

function ratingTrust(rating: MlbProjectionRating, role: "hitter" | "pitcher") {
  const baseReliability = metricNumber(rating, "eliteReliability", metricNumber(rating, "reliability", 0.45));
  const uncertainty = metricNumber(rating, "eliteUncertainty", metricNumber(rating, "uncertainty", 0.55));
  const dataQuality = metricNumber(rating, "dataQuality", 70) / 100;
  const sample = role === "hitter" ? sampleNumber(rating, "plateAppearances", 0) : sampleNumber(rating, "battersFaced", 0);
  const sampleScore = role === "hitter" ? clamp(sample / 500, 0.12, 1) : clamp(sample / 650, 0.12, 1);
  return clamp(baseReliability * 0.5 + (1 - uncertainty) * 0.22 + dataQuality * 0.14 + sampleScore * 0.14, 0.05, 0.98);
}

function tierFromTrust(combinedTrust: number, microCoverage: number, skillShapeScore: number, warnings: string[]): MlbEliteIntelligenceTier {
  if (combinedTrust >= 0.82 && microCoverage >= 0.72 && skillShapeScore >= 76 && warnings.length === 0) return "ELITE";
  if (combinedTrust >= 0.68 && microCoverage >= 0.55 && skillShapeScore >= 68) return "BETTABLE";
  if (combinedTrust >= 0.52 && microCoverage >= 0.35) return "WATCH";
  if (combinedTrust > 0.15 || microCoverage > 0.1) return "THIN";
  return "MISSING";
}

function upgradeRating(args: { rating: MlbProjectionRating; role: "hitter" | "pitcher"; micro: MlbBatterMicroTendency | MlbPitcherMicroTendency | null }): { rating: MlbProjectionRating; upgrade: MlbElitePlayerUpgrade } {
  const ratingTrustScore = ratingTrust(args.rating, args.role);
  const microCoverage = args.role === "hitter" ? hitterMicroCoverage(args.micro as MlbBatterMicroTendency | null) : pitcherMicroCoverage(args.micro as MlbPitcherMicroTendency | null);
  const sample = args.role === "hitter" ? sampleNumber(args.rating, "plateAppearances", 0) : sampleNumber(args.rating, "battersFaced", 0);
  const sampleScore = args.role === "hitter" ? clamp(sample / 500, 0, 1) : clamp(sample / 650, 0, 1);
  const tendencyReliability = asNumber((args.micro as { reliability?: Numberish } | null)?.reliability, 0.25);
  const tendencyTrust = clamp(microCoverage * 0.56 + tendencyReliability * 0.28 + sampleScore * 0.16, 0, 0.98);
  const skillShapeScore = args.role === "hitter" ? hitterSkillShape(args.rating, args.micro as MlbBatterMicroTendency | null) : pitcherSkillShape(args.rating, args.micro as MlbPitcherMicroTendency | null);
  const warnings: string[] = [];
  if (!args.micro) warnings.push("Missing micro tendency row.");
  if (sampleScore < 0.25) warnings.push("Small player sample.");
  if (microCoverage < 0.45) warnings.push("Thin count/pitch/base-state tendency coverage.");
  const combinedTrust = clamp(ratingTrustScore * 0.52 + tendencyTrust * 0.36 + clamp(skillShapeScore / 100, 0, 1) * 0.12, 0.03, 0.98);
  const tier = tierFromTrust(combinedTrust, microCoverage, skillShapeScore, warnings);
  const originalOverall = asNumber(args.rating.overall, 70);
  const upgradedOverall = clamp(originalOverall * (1 - combinedTrust * 0.28) + skillShapeScore * combinedTrust * 0.28, 35, 98);
  const upgrade: MlbElitePlayerUpgrade = {
    playerId: args.rating.id,
    playerName: args.rating.name,
    team: args.rating.team ?? null,
    role: args.role,
    tier,
    ratingTrust: round(ratingTrustScore, 4),
    tendencyTrust: round(tendencyTrust, 4),
    combinedTrust: round(combinedTrust, 4),
    originalOverall: round(originalOverall, 2),
    upgradedOverall: round(upgradedOverall, 2),
    microCoverage: round(microCoverage, 4),
    sampleScore: round(sampleScore, 4),
    skillShapeScore: round(skillShapeScore, 2),
    warningCount: warnings.length,
    warnings
  };
  return {
    rating: {
      ...args.rating,
      overall: round(upgradedOverall, 2),
      metrics_json: {
        ...(args.rating.metrics_json ?? {}),
        eliteUpgradeModel: "mlb-elite-intelligence-upgrade-v1",
        eliteTier: tier,
        eliteRatingTrust: upgrade.ratingTrust,
        eliteTendencyTrust: upgrade.tendencyTrust,
        eliteCombinedTrust: upgrade.combinedTrust,
        eliteMicroCoverage: upgrade.microCoverage,
        eliteSampleScore: upgrade.sampleScore,
        eliteSkillShapeScore: upgrade.skillShapeScore,
        highConfidenceEligible: tier === "ELITE" || tier === "BETTABLE",
        eliteWarnings: warnings
      }
    },
    upgrade
  };
}

export function upgradeMlbEliteIntelligence(args: {
  ratings: MlbEliteRatingBuild;
  batterTendencies?: MlbBatterMicroTendency[];
  pitcherTendencies?: MlbPitcherMicroTendency[];
}): MlbEliteIntelligenceUpgradeResult {
  const batterMap = mapByIdAndName(args.batterTendencies ?? []);
  const pitcherMap = mapByIdAndName(args.pitcherTendencies ?? []);
  const hitterRows = args.ratings.hitters.map((rating) => upgradeRating({ rating, role: "hitter", micro: findMicro(rating, batterMap) }));
  const pitcherRows = args.ratings.pitchers.map((rating) => upgradeRating({ rating, role: "pitcher", micro: findMicro(rating, pitcherMap) }));
  const playerUpgrades = [...hitterRows.map((row) => row.upgrade), ...pitcherRows.map((row) => row.upgrade)];
  const hitterCoverage = args.ratings.hitters.length ? hitterRows.filter((row) => row.upgrade.microCoverage > 0).length / args.ratings.hitters.length : 0;
  const pitcherCoverage = args.ratings.pitchers.length ? pitcherRows.filter((row) => row.upgrade.microCoverage > 0).length / args.ratings.pitchers.length : 0;
  const averageRatingTrust = mean(playerUpgrades.map((row) => row.ratingTrust), 0);
  const averageTendencyTrust = mean(playerUpgrades.map((row) => row.tendencyTrust), 0);
  const averageCombinedTrust = mean(playerUpgrades.map((row) => row.combinedTrust), 0);
  const elitePlayers = playerUpgrades.filter((row) => row.tier === "ELITE").length;
  const bettablePlayers = playerUpgrades.filter((row) => row.tier === "ELITE" || row.tier === "BETTABLE").length;
  const thinPlayers = playerUpgrades.filter((row) => row.tier === "THIN" || row.tier === "MISSING").length;
  const gates = [
    {
      key: "rating-trust",
      label: "Average rating trust is betting-grade",
      passed: averageRatingTrust >= 0.62,
      detail: `${round(averageRatingTrust * 100, 1)}/100 average rating trust`
    },
    {
      key: "hitter-micro-coverage",
      label: "Hitter micro tendency coverage",
      passed: hitterCoverage >= 0.75,
      detail: `${round(hitterCoverage * 100, 1)}% hitter micro coverage`
    },
    {
      key: "pitcher-micro-coverage",
      label: "Pitcher micro tendency coverage",
      passed: pitcherCoverage >= 0.75,
      detail: `${round(pitcherCoverage * 100, 1)}% pitcher micro coverage`
    },
    {
      key: "combined-trust",
      label: "Combined rating/tendency trust",
      passed: averageCombinedTrust >= 0.66,
      detail: `${round(averageCombinedTrust * 100, 1)}/100 combined trust`
    },
    {
      key: "thin-player-control",
      label: "Thin/missing player share controlled",
      passed: playerUpgrades.length > 0 && thinPlayers / playerUpgrades.length <= 0.25,
      detail: `${thinPlayers}/${playerUpgrades.length} players thin or missing`
    }
  ];
  const warnings = gates.filter((gate) => !gate.passed).map((gate) => `${gate.label} failed: ${gate.detail}.`);

  return {
    ratings: {
      ...args.ratings,
      hitters: hitterRows.map((row) => row.rating),
      pitchers: pitcherRows.map((row) => row.rating),
      warnings: [...args.ratings.warnings, ...warnings],
      diagnostics: {
        ...args.ratings.diagnostics,
        hitterTendencyCoverage: round(Math.max(args.ratings.diagnostics.hitterTendencyCoverage, hitterCoverage), 4),
        pitcherTendencyCoverage: round(Math.max(args.ratings.diagnostics.pitcherTendencyCoverage, pitcherCoverage), 4),
        dataQuality: round(clamp(args.ratings.diagnostics.dataQuality * 0.62 + averageCombinedTrust * 100 * 0.38, 0, 100), 1)
      },
      sourceSummary: {
        ...args.ratings.sourceSummary,
        hitterTendencyRows: Math.max(args.ratings.sourceSummary.hitterTendencyRows, args.batterTendencies?.length ?? 0),
        pitcherTendencyRows: Math.max(args.ratings.sourceSummary.pitcherTendencyRows, args.pitcherTendencies?.length ?? 0)
      }
    },
    report: {
      modelVersion: "mlb-elite-intelligence-upgrade-v1",
      generatedAt: new Date().toISOString(),
      ratingModelVersion: args.ratings.modelVersion,
      hitterCount: args.ratings.hitters.length,
      pitcherCount: args.ratings.pitchers.length,
      batterMicroCount: args.batterTendencies?.length ?? 0,
      pitcherMicroCount: args.pitcherTendencies?.length ?? 0,
      hitterCoverage: round(hitterCoverage, 4),
      pitcherCoverage: round(pitcherCoverage, 4),
      averageRatingTrust: round(averageRatingTrust, 4),
      averageTendencyTrust: round(averageTendencyTrust, 4),
      averageCombinedTrust: round(averageCombinedTrust, 4),
      elitePlayers,
      bettablePlayers,
      thinPlayers,
      gates,
      warnings,
      playerUpgrades
    }
  };
}
