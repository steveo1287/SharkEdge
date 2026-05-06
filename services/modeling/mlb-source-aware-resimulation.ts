import type { MlbSourceNativeContext } from "@/services/modeling/mlb-source-native-context";
import type { MlbSimulationInput, MlbSimulationSummary } from "@/services/modeling/mlb-game-sim-service";

type LockStatus = "CONFIRMED" | "PROBABLE" | "INFERRED" | "UNKNOWN";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

type TierTeamContext = MlbSourceNativeContext["home"] & {
  lineupStatus?: LockStatus;
  lineupLockScore?: number;
  starterStatus?: LockStatus;
  starterLockScore?: number;
  bullpenLeverageScore?: number;
  lateInningRisk?: RiskLevel;
  longReliefCoverage?: number;
  platoonEdge?: number;
  pitchTypeMatchupEdge?: number;
  pitchTypeCoverageScore?: number;
  defensiveRunPreventionScore?: number;
  infieldDefenseScore?: number;
  outfieldDefenseScore?: number;
  catcherFramingScore?: number;
  catcherRunGameScore?: number;
  travelFatigueScore?: number;
  restRecoveryScore?: number;
  umpireZoneRunImpact?: number;
  umpireStrikeoutImpact?: number;
  weatherTrajectoryRunImpact?: number;
  weatherTrajectoryConfidence?: number;
};

type TierThreeContext = MlbSourceNativeContext & {
  market?: {
    openHomeProbability?: number | null;
    currentHomeProbability?: number | null;
    sharpBookHomeProbability?: number | null;
    consensusHomeProbability?: number | null;
    closingHomeProbability?: number | null;
    marketImpliedHomeProbability?: number | null;
    marketMoveEdge?: number | null;
    sharpBookWeight?: number | null;
    closingLineValueScore?: number | null;
    steamMoveScore?: number | null;
    reverseLineMoveScore?: number | null;
    liquidityScore?: number | null;
    modelAgreementScore?: number | null;
    ensembleHomeProbability?: number | null;
    bayesianPriorHomeProbability?: number | null;
    marketCoverageScore?: number | null;
  } | null;
};

type TierOneProfile = {
  lineupStatus: LockStatus;
  lineupLockScore: number;
  starterStatus: LockStatus;
  starterLockScore: number;
  bullpenLeverageScore: number;
  lateInningRisk: RiskLevel;
  longReliefCoverage: number;
  platoonEdge: number;
  pitchTypeMatchupEdge: number;
  pitchTypeCoverageScore: number;
  trustScore: number;
};

type TierTwoProfile = {
  defensiveRunPreventionScore: number;
  infieldDefenseScore: number;
  outfieldDefenseScore: number;
  catcherFramingScore: number;
  catcherRunGameScore: number;
  travelFatigueScore: number;
  restRecoveryScore: number;
  umpireZoneRunImpact: number;
  umpireStrikeoutImpact: number;
  weatherTrajectoryRunImpact: number;
  weatherTrajectoryConfidence: number;
  contextRisk: RiskLevel;
  trustAdjustment: number;
};

type TierThreeProfile = {
  openHomeProbability: number | null;
  currentHomeProbability: number | null;
  sharpBookHomeProbability: number | null;
  consensusHomeProbability: number | null;
  closingHomeProbability: number | null;
  marketImpliedHomeProbability: number | null;
  marketMoveEdge: number;
  sharpBookWeight: number;
  closingLineValueScore: number;
  steamMoveScore: number;
  reverseLineMoveScore: number;
  liquidityScore: number;
  modelAgreementScore: number;
  ensembleHomeProbability: number | null;
  bayesianPriorHomeProbability: number | null;
  marketCoverageScore: number;
  marketTrustAdjustment: number;
  marketRisk: RiskLevel;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function probability(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value > 1 && value <= 100) return clamp(value / 100, 0.01, 0.99);
  return clamp(value, 0.01, 0.99);
}

function certaintyMultiplier(certainty: "HIGH" | "MEDIUM" | "LOW") {
  if (certainty === "HIGH") return 1.015;
  if (certainty === "MEDIUM") return 1;
  return 0.975;
}

function statusBoost(status: LockStatus) {
  if (status === "CONFIRMED") return 1.035;
  if (status === "PROBABLE") return 1.018;
  if (status === "INFERRED") return 0.988;
  return 0.955;
}

function inferLineupStatus(team: TierTeamContext): LockStatus {
  if (team.lineupStatus) return team.lineupStatus;
  if (team.lineupCertainty === "HIGH" && team.topBats.length >= 5) return "PROBABLE";
  if (team.lineupCertainty === "MEDIUM") return "INFERRED";
  return team.topBats.length ? "INFERRED" : "UNKNOWN";
}

function inferStarterStatus(team: TierTeamContext): LockStatus {
  if (team.starterStatus) return team.starterStatus;
  if (!team.starterName) return "UNKNOWN";
  if (team.starterConfidence >= 76) return "PROBABLE";
  return "INFERRED";
}

function cappedMatchupFactor(edge: number, weight: number, coverage = 100) {
  return clamp(1 + clamp(edge, -1, 1) * weight * clamp(coverage / 100, 0, 1), 0.96, 1.04);
}

function centeredScoreFactor(score: number, weight: number, min = 0.96, max = 1.04) {
  return clamp(1 + (clamp(score, 0, 100) - 50) * weight, min, max);
}

function buildTierOneProfile(team: TierTeamContext): TierOneProfile {
  const lineupStatus = inferLineupStatus(team);
  const starterStatus = inferStarterStatus(team);
  const lineupLockScore = clamp(
    team.lineupLockScore ??
      (lineupStatus === "CONFIRMED" ? 92 : lineupStatus === "PROBABLE" ? 78 : lineupStatus === "INFERRED" ? team.lineupCertainty === "MEDIUM" ? 58 : 48 : 25),
    0,
    100
  );
  const starterLockScore = clamp(
    team.starterLockScore ??
      (starterStatus === "CONFIRMED" ? 94 : starterStatus === "PROBABLE" ? clamp(team.starterConfidence + 8, 62, 86) : starterStatus === "INFERRED" ? clamp(team.starterConfidence - 8, 34, 64) : 18),
    0,
    100
  );
  const bullpenLeverageScore = clamp(
    team.bullpenLeverageScore ?? Math.round(team.bullpenFreshness * 0.55 + team.bullpenCoverage * 0.3 + (team.bullpenRisk === "LOW" ? 12 : team.bullpenRisk === "MEDIUM" ? 4 : -8)),
    0,
    100
  );
  const longReliefCoverage = clamp(team.longReliefCoverage ?? Math.round(team.bullpenCoverage * 0.72 + team.bullpenFreshness * 0.28), 0, 100);
  const pitchTypeCoverageScore = clamp(team.pitchTypeCoverageScore ?? 0, 0, 100);
  const trustScore = clamp(
    Math.round(lineupLockScore * 0.28 + starterLockScore * 0.32 + bullpenLeverageScore * 0.18 + longReliefCoverage * 0.08 + pitchTypeCoverageScore * 0.06 + (team.lineupCertainty === "HIGH" ? 8 : team.lineupCertainty === "MEDIUM" ? 4 : 0)),
    0,
    100
  );

  return {
    lineupStatus,
    lineupLockScore,
    starterStatus,
    starterLockScore,
    bullpenLeverageScore,
    lateInningRisk: team.lateInningRisk ?? (bullpenLeverageScore >= 68 ? "LOW" : bullpenLeverageScore >= 48 ? "MEDIUM" : "HIGH"),
    longReliefCoverage,
    platoonEdge: clamp(team.platoonEdge ?? 0, -1, 1),
    pitchTypeMatchupEdge: clamp(team.pitchTypeMatchupEdge ?? 0, -1, 1),
    pitchTypeCoverageScore,
    trustScore
  };
}

function buildTierTwoProfile(team: TierTeamContext, venue: MlbSourceNativeContext["venue"]): TierTwoProfile {
  const defensiveRunPreventionScore = clamp(team.defensiveRunPreventionScore ?? 50, 0, 100);
  const catcherFramingScore = clamp(team.catcherFramingScore ?? 50, 0, 100);
  const travelFatigueScore = clamp(team.travelFatigueScore ?? 50, 0, 100);
  const restRecoveryScore = clamp(team.restRecoveryScore ?? 50, 0, 100);
  const umpireZoneRunImpact = clamp(team.umpireZoneRunImpact ?? 0, -1, 1);
  const weatherTrajectoryRunImpact = clamp(team.weatherTrajectoryRunImpact ?? 0, -1, 1);
  const inferredWeatherConfidence = venue.weatherExposure === "OUTDOOR" || venue.windSensitivity === "HIGH" ? 58 : venue.weatherExposure === "MIXED" ? 46 : 28;
  const weatherTrajectoryConfidence = clamp(team.weatherTrajectoryConfidence ?? inferredWeatherConfidence, 0, 100);
  const contextRiskScore =
    (100 - defensiveRunPreventionScore) * 0.12 +
    (100 - catcherFramingScore) * 0.08 +
    travelFatigueScore * 0.16 +
    (100 - restRecoveryScore) * 0.14 +
    Math.abs(umpireZoneRunImpact) * 8 +
    Math.abs(weatherTrajectoryRunImpact) * (weatherTrajectoryConfidence / 100) * 12;

  return {
    defensiveRunPreventionScore,
    infieldDefenseScore: clamp(team.infieldDefenseScore ?? defensiveRunPreventionScore, 0, 100),
    outfieldDefenseScore: clamp(team.outfieldDefenseScore ?? defensiveRunPreventionScore, 0, 100),
    catcherFramingScore,
    catcherRunGameScore: clamp(team.catcherRunGameScore ?? 50, 0, 100),
    travelFatigueScore,
    restRecoveryScore,
    umpireZoneRunImpact,
    umpireStrikeoutImpact: clamp(team.umpireStrikeoutImpact ?? 0, -1, 1),
    weatherTrajectoryRunImpact,
    weatherTrajectoryConfidence,
    contextRisk: contextRiskScore >= 32 ? "HIGH" : contextRiskScore >= 18 ? "MEDIUM" : "LOW",
    trustAdjustment: clamp(
      Math.round((defensiveRunPreventionScore - 50) * 0.05 + (catcherFramingScore - 50) * 0.04 + (restRecoveryScore - 50) * 0.05 - (travelFatigueScore - 50) * 0.06 - Math.abs(umpireZoneRunImpact) * 3 - Math.abs(weatherTrajectoryRunImpact) * (weatherTrajectoryConfidence / 100) * 4),
      -8,
      8
    )
  };
}

function buildTierThreeProfile(context: TierThreeContext): TierThreeProfile {
  const market = context.market ?? null;
  const openHomeProbability = probability(market?.openHomeProbability);
  const currentHomeProbability = probability(market?.currentHomeProbability);
  const sharpBookHomeProbability = probability(market?.sharpBookHomeProbability);
  const consensusHomeProbability = probability(market?.consensusHomeProbability);
  const closingHomeProbability = probability(market?.closingHomeProbability);
  const marketImpliedHomeProbability = probability(market?.marketImpliedHomeProbability) ?? currentHomeProbability ?? consensusHomeProbability;
  const marketMoveEdge = clamp(market?.marketMoveEdge ?? (openHomeProbability != null && currentHomeProbability != null ? currentHomeProbability - openHomeProbability : 0), -0.12, 0.12);
  const sharpBookWeight = clamp(market?.sharpBookWeight ?? (sharpBookHomeProbability != null ? 0.62 : 0.2), 0, 1);
  const closingLineValueScore = clamp(market?.closingLineValueScore ?? 50, 0, 100);
  const steamMoveScore = clamp(market?.steamMoveScore ?? Math.round(50 + marketMoveEdge * 500), 0, 100);
  const reverseLineMoveScore = clamp(market?.reverseLineMoveScore ?? 50, 0, 100);
  const liquidityScore = clamp(market?.liquidityScore ?? (marketImpliedHomeProbability != null ? 55 : 25), 0, 100);
  const modelAgreementScore = clamp(market?.modelAgreementScore ?? (consensusHomeProbability != null || sharpBookHomeProbability != null ? 62 : 42), 0, 100);
  const ensembleHomeProbability = probability(market?.ensembleHomeProbability);
  const bayesianPriorHomeProbability = probability(market?.bayesianPriorHomeProbability) ?? marketImpliedHomeProbability;
  const marketCoverageScore = clamp(
    market?.marketCoverageScore ??
      Math.round(
        (marketImpliedHomeProbability != null ? 24 : 0) +
          (sharpBookHomeProbability != null ? 22 : 0) +
          (consensusHomeProbability != null ? 14 : 0) +
          (openHomeProbability != null ? 10 : 0) +
          liquidityScore * 0.18 +
          modelAgreementScore * 0.12
      ),
    0,
    100
  );
  const marketRiskScore =
    (100 - marketCoverageScore) * 0.16 +
    (100 - liquidityScore) * 0.12 +
    (100 - modelAgreementScore) * 0.1 +
    Math.abs(marketMoveEdge) * 80 +
    Math.max(0, reverseLineMoveScore - 62) * 0.12;

  return {
    openHomeProbability,
    currentHomeProbability,
    sharpBookHomeProbability,
    consensusHomeProbability,
    closingHomeProbability,
    marketImpliedHomeProbability,
    marketMoveEdge: round(marketMoveEdge, 4),
    sharpBookWeight: round(sharpBookWeight, 3),
    closingLineValueScore,
    steamMoveScore,
    reverseLineMoveScore,
    liquidityScore,
    modelAgreementScore,
    ensembleHomeProbability,
    bayesianPriorHomeProbability,
    marketCoverageScore,
    marketTrustAdjustment: clamp(Math.round((marketCoverageScore - 50) * 0.05 + (liquidityScore - 50) * 0.04 + (modelAgreementScore - 50) * 0.06 + (closingLineValueScore - 50) * 0.04 - Math.abs(marketMoveEdge) * 22), -8, 8),
    marketRisk: marketRiskScore >= 32 ? "HIGH" : marketRiskScore >= 18 ? "MEDIUM" : "LOW"
  };
}

function tierTwoRunPreventionFactor(profile: TierTwoProfile) {
  return clamp(
    centeredScoreFactor(profile.defensiveRunPreventionScore, -0.00075, 0.955, 1.045) *
      centeredScoreFactor(profile.catcherFramingScore, -0.00035, 0.975, 1.025) *
      centeredScoreFactor(profile.catcherRunGameScore, -0.00022, 0.985, 1.015) *
      centeredScoreFactor(profile.travelFatigueScore, 0.0005, 0.975, 1.035) *
      centeredScoreFactor(profile.restRecoveryScore, -0.00038, 0.975, 1.025),
    0.94,
    1.06
  );
}

function tierTwoOffenseEnvironmentFactor(profile: TierTwoProfile) {
  return clamp(
    cappedMatchupFactor(profile.umpireZoneRunImpact, 0.018) *
      cappedMatchupFactor(profile.weatherTrajectoryRunImpact, 0.025, profile.weatherTrajectoryConfidence) *
      centeredScoreFactor(profile.travelFatigueScore, -0.00035, 0.98, 1.02) *
      centeredScoreFactor(profile.restRecoveryScore, 0.00028, 0.985, 1.018),
    0.955,
    1.045
  );
}

function tierTwoStarterCommandFactor(profile: TierTwoProfile) {
  return clamp(
    centeredScoreFactor(profile.catcherFramingScore, 0.00045, 0.975, 1.03) *
      cappedMatchupFactor(profile.umpireStrikeoutImpact, 0.018) *
      centeredScoreFactor(profile.travelFatigueScore, -0.00032, 0.98, 1.015),
    0.96,
    1.04
  );
}

function blendProbability(base: number, signal: number | null, weight: number) {
  if (signal == null) return base;
  return clamp(base * (1 - weight) + signal * weight, 0.01, 0.99);
}

export function applyMlbSourceAwareResimulation(
  input: MlbSimulationInput,
  context: MlbSourceNativeContext
): MlbSimulationInput {
  const homeTierOne = buildTierOneProfile(context.home as TierTeamContext);
  const awayTierOne = buildTierOneProfile(context.away as TierTeamContext);
  const homeTierTwo = buildTierTwoProfile(context.home as TierTeamContext, context.venue);
  const awayTierTwo = buildTierTwoProfile(context.away as TierTeamContext, context.venue);

  const homeLineupFactor = certaintyMultiplier(context.home.lineupCertainty) * statusBoost(homeTierOne.lineupStatus) * (1 + (context.home.lineupStrength - 50) * 0.0025) * cappedMatchupFactor(homeTierOne.platoonEdge, 0.025) * cappedMatchupFactor(homeTierOne.pitchTypeMatchupEdge, 0.02, homeTierOne.pitchTypeCoverageScore) * tierTwoOffenseEnvironmentFactor(homeTierTwo);
  const awayLineupFactor = certaintyMultiplier(context.away.lineupCertainty) * statusBoost(awayTierOne.lineupStatus) * (1 + (context.away.lineupStrength - 50) * 0.0025) * cappedMatchupFactor(awayTierOne.platoonEdge, 0.025) * cappedMatchupFactor(awayTierOne.pitchTypeMatchupEdge, 0.02, awayTierOne.pitchTypeCoverageScore) * tierTwoOffenseEnvironmentFactor(awayTierTwo);
  const homeTierTwoCommand = tierTwoStarterCommandFactor(homeTierTwo);
  const awayTierTwoCommand = tierTwoStarterCommandFactor(awayTierTwo);
  const homeRunPreventionFactor = tierTwoRunPreventionFactor(homeTierTwo);
  const awayRunPreventionFactor = tierTwoRunPreventionFactor(awayTierTwo);
  const homeStarterConfidenceFactor = clamp((0.96 + context.home.starterConfidence / 100 * 0.08 + (homeTierOne.starterLockScore - 50) * 0.00045) * homeTierTwoCommand, 0.915, 1.065);
  const awayStarterConfidenceFactor = clamp((0.96 + context.away.starterConfidence / 100 * 0.08 + (awayTierOne.starterLockScore - 50) * 0.00045) * awayTierTwoCommand, 0.915, 1.065);
  const homeBullpenAvailabilityFactor = clamp((1 - (context.home.bullpenFreshness - 50) * 0.002 - (context.home.bullpenCoverage - 50) * 0.0015 - (homeTierOne.bullpenLeverageScore - 50) * 0.0012 - (homeTierOne.longReliefCoverage - 50) * 0.00055) * homeRunPreventionFactor, 0.88, 1.12);
  const awayBullpenAvailabilityFactor = clamp((1 - (context.away.bullpenFreshness - 50) * 0.002 - (context.away.bullpenCoverage - 50) * 0.0015 - (awayTierOne.bullpenLeverageScore - 50) * 0.0012 - (awayTierOne.longReliefCoverage - 50) * 0.00055) * awayRunPreventionFactor, 0.88, 1.12);

  return {
    ...input,
    home: {
      ...input.home,
      offenseFactor: clamp(input.home.offenseFactor * homeLineupFactor, 0.72, 1.5),
      starter: {
        ...input.home.starter,
        expectedOuts: clamp(Math.round(input.home.starter.expectedOuts * homeStarterConfidenceFactor), 9, 24),
        runsAllowedPer9: clamp((input.home.starter.runsAllowedPer9 / homeStarterConfidenceFactor) * homeRunPreventionFactor, 1.8, 8),
        strikeoutsPer9: clamp(input.home.starter.strikeoutsPer9 * homeTierTwoCommand, 4.5, 14)
      },
      bullpen: { ...input.home.bullpen, runsAllowedPer9: clamp(input.home.bullpen.runsAllowedPer9 * homeBullpenAvailabilityFactor, 2.2, 7.8) }
    },
    away: {
      ...input.away,
      offenseFactor: clamp(input.away.offenseFactor * awayLineupFactor, 0.72, 1.5),
      starter: {
        ...input.away.starter,
        expectedOuts: clamp(Math.round(input.away.starter.expectedOuts * awayStarterConfidenceFactor), 9, 24),
        runsAllowedPer9: clamp((input.away.starter.runsAllowedPer9 / awayStarterConfidenceFactor) * awayRunPreventionFactor, 1.8, 8),
        strikeoutsPer9: clamp(input.away.starter.strikeoutsPer9 * awayTierTwoCommand, 4.5, 14)
      },
      bullpen: { ...input.away.bullpen, runsAllowedPer9: clamp(input.away.bullpen.runsAllowedPer9 * awayBullpenAvailabilityFactor, 2.2, 7.8) }
    }
  };
}

export function recalibrateMlbMarketOutputs(
  summary: MlbSimulationSummary,
  context: MlbSourceNativeContext
): MlbSimulationSummary {
  const homeTierOne = buildTierOneProfile(context.home as TierTeamContext);
  const awayTierOne = buildTierOneProfile(context.away as TierTeamContext);
  const homeTierTwo = buildTierTwoProfile(context.home as TierTeamContext, context.venue);
  const awayTierTwo = buildTierTwoProfile(context.away as TierTeamContext, context.venue);
  const tierThree = buildTierThreeProfile(context as TierThreeContext);
  const tierOneTrust = (homeTierOne.trustScore + awayTierOne.trustScore) / 2;
  const tierTwoTrustAdjustment = (homeTierTwo.trustAdjustment + awayTierTwo.trustAdjustment) / 2;
  const tierTwoContextRiskPenalty = (homeTierTwo.contextRisk === "HIGH" ? 6 : homeTierTwo.contextRisk === "MEDIUM" ? 3 : 0) + (awayTierTwo.contextRisk === "HIGH" ? 6 : awayTierTwo.contextRisk === "MEDIUM" ? 3 : 0);
  const tierThreeRiskPenalty = tierThree.marketRisk === "HIGH" ? 8 : tierThree.marketRisk === "MEDIUM" ? 4 : 0;
  const uncertaintyPenalty =
    (homeTierOne.lineupStatus === "UNKNOWN" ? 10 : homeTierOne.lineupStatus === "INFERRED" ? 5 : 0) +
    (awayTierOne.lineupStatus === "UNKNOWN" ? 10 : awayTierOne.lineupStatus === "INFERRED" ? 5 : 0) +
    (homeTierOne.starterStatus === "UNKNOWN" ? 14 : homeTierOne.starterStatus === "INFERRED" ? 7 : 0) +
    (awayTierOne.starterStatus === "UNKNOWN" ? 14 : awayTierOne.starterStatus === "INFERRED" ? 7 : 0) +
    tierTwoContextRiskPenalty +
    tierThreeRiskPenalty;

  const certaintyScore =
    context.home.starterConfidence * 0.16 +
    context.away.starterConfidence * 0.16 +
    context.home.bullpenCoverage * 0.1 +
    context.away.bullpenCoverage * 0.1 +
    tierOneTrust * 0.34 +
    tierTwoTrustAdjustment +
    tierThree.marketTrustAdjustment +
    (context.home.lineupCertainty === "HIGH" ? 8 : context.home.lineupCertainty === "MEDIUM" ? 5 : 1) +
    (context.away.lineupCertainty === "HIGH" ? 8 : context.away.lineupCertainty === "MEDIUM" ? 5 : 1) -
    uncertaintyPenalty * 0.35;

  const weatherTrajectoryImpact = clamp(((homeTierTwo.weatherTrajectoryRunImpact + awayTierTwo.weatherTrajectoryRunImpact) / 2) * ((homeTierTwo.weatherTrajectoryConfidence + awayTierTwo.weatherTrajectoryConfidence) / 200), -0.035, 0.035);
  const umpireRunImpact = clamp(((homeTierTwo.umpireZoneRunImpact + awayTierTwo.umpireZoneRunImpact) / 2) * 0.018, -0.025, 0.025);
  const tierTwoTotalEnvironmentFactor = clamp(1 + weatherTrajectoryImpact + umpireRunImpact, 0.95, 1.05);
  const shrink = clamp(0.2 - certaintyScore / 1000, 0.05, 0.21);
  const baselineTotal = 8.7 * context.venue.baselineRunFactor * tierTwoTotalEnvironmentFactor;
  const calibratedTotal = summary.projectedTotalRuns * (1 - shrink) + baselineTotal * shrink;
  const calibratedSpread = summary.projectedSpreadHome * (1 - shrink * 0.85);

  let calibratedWinProbHome = 0.5 + (summary.winProbHome - 0.5) * (1 - shrink);
  const sharpWeight = clamp(tierThree.sharpBookWeight * tierThree.marketCoverageScore / 100 * 0.1, 0, 0.1);
  const ensembleWeight = tierThree.ensembleHomeProbability != null ? clamp(tierThree.modelAgreementScore / 100 * 0.08, 0, 0.08) : 0;
  const bayesianWeight = tierThree.bayesianPriorHomeProbability != null ? clamp(tierThree.marketCoverageScore / 100 * 0.055, 0, 0.055) : 0;
  calibratedWinProbHome = blendProbability(calibratedWinProbHome, tierThree.sharpBookHomeProbability, sharpWeight);
  calibratedWinProbHome = blendProbability(calibratedWinProbHome, tierThree.ensembleHomeProbability, ensembleWeight);
  calibratedWinProbHome = blendProbability(calibratedWinProbHome, tierThree.bayesianPriorHomeProbability, bayesianWeight);
  calibratedWinProbHome = clamp(calibratedWinProbHome + clamp(tierThree.marketMoveEdge, -0.035, 0.035) * clamp(tierThree.liquidityScore / 100, 0, 1) * 0.35, 0.01, 0.99);

  const calibratedHomeRuns = (calibratedTotal + calibratedSpread) / 2;
  const calibratedAwayRuns = calibratedTotal - calibratedHomeRuns;
  const edgePercent = tierThree.marketImpliedHomeProbability == null ? null : round((calibratedWinProbHome - tierThree.marketImpliedHomeProbability) * 100, 2);
  const projectionTrustScore = clamp(Math.round(tierOneTrust * 0.55 + certaintyScore * 0.28 + tierThree.marketCoverageScore * 0.17), 0, 100);
  const projectionTrustGrade = projectionTrustScore >= 82 ? "A" : projectionTrustScore >= 68 ? "B" : projectionTrustScore >= 52 ? "C" : "D";
  const betQuality = edgePercent == null || edgePercent < 2.5 || projectionTrustGrade === "D" ? "PASS" : edgePercent >= 7 && projectionTrustGrade !== "C" && tierThree.marketRisk !== "HIGH" ? "STRONG_PLAY" : edgePercent >= 4 && projectionTrustGrade !== "C" ? "PLAY" : "LEAN";

  return {
    ...summary,
    projectedHomeRuns: round(calibratedHomeRuns),
    projectedAwayRuns: round(calibratedAwayRuns),
    projectedTotalRuns: round(calibratedTotal),
    projectedSpreadHome: round(calibratedSpread),
    winProbHome: round(calibratedWinProbHome, 4),
    winProbAway: round(1 - calibratedWinProbHome, 4),
    diagnostics: {
      ...summary.diagnostics,
      weatherFactor: round(summary.diagnostics.weatherFactor * (1 - shrink * 0.2) * tierTwoTotalEnvironmentFactor),
      tierOne: { home: homeTierOne, away: awayTierOne, averageTrustScore: round(tierOneTrust, 1), recalibrationShrink: round(shrink, 4) },
      tierTwo: { home: homeTierTwo, away: awayTierTwo, averageTrustAdjustment: round(tierTwoTrustAdjustment, 1), contextRiskPenalty: round(tierTwoContextRiskPenalty, 1), totalEnvironmentFactor: round(tierTwoTotalEnvironmentFactor, 4) },
      tierThree: {
        ...tierThree,
        sharpWeight: round(sharpWeight, 4),
        ensembleWeight: round(ensembleWeight, 4),
        bayesianWeight: round(bayesianWeight, 4),
        edgePercent,
        projectionTrustScore,
        projectionTrustGrade,
        betQuality
      }
    } as MlbSimulationSummary["diagnostics"] & {
      tierOne: { home: TierOneProfile; away: TierOneProfile; averageTrustScore: number; recalibrationShrink: number };
      tierTwo: { home: TierTwoProfile; away: TierTwoProfile; averageTrustAdjustment: number; contextRiskPenalty: number; totalEnvironmentFactor: number };
      tierThree: TierThreeProfile & { sharpWeight: number; ensembleWeight: number; bayesianWeight: number; edgePercent: number | null; projectionTrustScore: number; projectionTrustGrade: "A" | "B" | "C" | "D"; betQuality: "PASS" | "LEAN" | "PLAY" | "STRONG_PLAY" };
    }
  };
}
