import type { MlbSourceNativeContext } from "@/services/modeling/mlb-source-native-context";
import type { MlbSimulationInput, MlbSimulationSummary } from "@/services/modeling/mlb-game-sim-service";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function certaintyMultiplier(certainty: "HIGH" | "MEDIUM" | "LOW") {
  if (certainty === "HIGH") return 1.015;
  if (certainty === "MEDIUM") return 1;
  return 0.975;
}

type DerivedTierOneTeamProfile = {
  lineupStatus: "CONFIRMED" | "PROBABLE" | "INFERRED" | "UNKNOWN";
  lineupLockScore: number;
  starterStatus: "CONFIRMED" | "PROBABLE" | "INFERRED" | "UNKNOWN";
  starterLockScore: number;
  bullpenLeverageScore: number;
  lateInningRisk: "LOW" | "MEDIUM" | "HIGH";
  longReliefCoverage: number;
  platoonEdge: number;
  pitchTypeMatchupEdge: number;
  pitchTypeCoverageScore: number;
  trustScore: number;
};

type DerivedTierTwoTeamProfile = {
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
  contextRisk: "LOW" | "MEDIUM" | "HIGH";
  trustAdjustment: number;
};

type MlbContextWithTierOne = MlbSourceNativeContext["home"] & {
  lineupStatus?: DerivedTierOneTeamProfile["lineupStatus"];
  lineupLockScore?: number;
  starterStatus?: DerivedTierOneTeamProfile["starterStatus"];
  starterLockScore?: number;
  bullpenLeverageScore?: number;
  lateInningRisk?: DerivedTierOneTeamProfile["lateInningRisk"];
  longReliefCoverage?: number;
  platoonEdge?: number;
  pitchTypeMatchupEdge?: number;
  pitchTypeCoverageScore?: number;
};

type MlbContextWithTierTwo = MlbContextWithTierOne & {
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

function inferLineupStatus(team: MlbContextWithTierOne): DerivedTierOneTeamProfile["lineupStatus"] {
  if (team.lineupStatus) return team.lineupStatus;
  if (team.lineupCertainty === "HIGH" && team.topBats.length >= 5) return "PROBABLE";
  if (team.lineupCertainty === "MEDIUM") return "INFERRED";
  return team.topBats.length ? "INFERRED" : "UNKNOWN";
}

function inferStarterStatus(team: MlbContextWithTierOne): DerivedTierOneTeamProfile["starterStatus"] {
  if (team.starterStatus) return team.starterStatus;
  if (!team.starterName) return "UNKNOWN";
  if (team.starterConfidence >= 76) return "PROBABLE";
  return "INFERRED";
}

function statusBoost(status: "CONFIRMED" | "PROBABLE" | "INFERRED" | "UNKNOWN") {
  if (status === "CONFIRMED") return 1.035;
  if (status === "PROBABLE") return 1.018;
  if (status === "INFERRED") return 0.988;
  return 0.955;
}

function buildTierOneProfile(team: MlbContextWithTierOne): DerivedTierOneTeamProfile {
  const lineupStatus = inferLineupStatus(team);
  const starterStatus = inferStarterStatus(team);
  const lineupLockScore = clamp(
    team.lineupLockScore ??
      (lineupStatus === "CONFIRMED"
        ? 92
        : lineupStatus === "PROBABLE"
          ? 78
          : lineupStatus === "INFERRED"
            ? team.lineupCertainty === "MEDIUM" ? 58 : 48
            : 25),
    0,
    100
  );
  const starterLockScore = clamp(
    team.starterLockScore ??
      (starterStatus === "CONFIRMED"
        ? 94
        : starterStatus === "PROBABLE"
          ? clamp(team.starterConfidence + 8, 62, 86)
          : starterStatus === "INFERRED"
            ? clamp(team.starterConfidence - 8, 34, 64)
            : 18),
    0,
    100
  );
  const bullpenLeverageScore = clamp(
    team.bullpenLeverageScore ??
      Math.round(team.bullpenFreshness * 0.55 + team.bullpenCoverage * 0.3 + (team.bullpenRisk === "LOW" ? 12 : team.bullpenRisk === "MEDIUM" ? 4 : -8)),
    0,
    100
  );
  const lateInningRisk = team.lateInningRisk ?? (bullpenLeverageScore >= 68 ? "LOW" : bullpenLeverageScore >= 48 ? "MEDIUM" : "HIGH");
  const longReliefCoverage = clamp(team.longReliefCoverage ?? Math.round(team.bullpenCoverage * 0.72 + team.bullpenFreshness * 0.28), 0, 100);
  const platoonEdge = clamp(team.platoonEdge ?? 0, -1, 1);
  const pitchTypeMatchupEdge = clamp(team.pitchTypeMatchupEdge ?? 0, -1, 1);
  const pitchTypeCoverageScore = clamp(team.pitchTypeCoverageScore ?? 0, 0, 100);
  const trustScore = clamp(
    Math.round(
      lineupLockScore * 0.28 +
        starterLockScore * 0.32 +
        bullpenLeverageScore * 0.18 +
        longReliefCoverage * 0.08 +
        pitchTypeCoverageScore * 0.06 +
        (team.lineupCertainty === "HIGH" ? 8 : team.lineupCertainty === "MEDIUM" ? 4 : 0)
    ),
    0,
    100
  );

  return {
    lineupStatus,
    lineupLockScore,
    starterStatus,
    starterLockScore,
    bullpenLeverageScore,
    lateInningRisk,
    longReliefCoverage,
    platoonEdge,
    pitchTypeMatchupEdge,
    pitchTypeCoverageScore,
    trustScore
  };
}

function buildTierTwoProfile(team: MlbContextWithTierTwo, venue: MlbSourceNativeContext["venue"]): DerivedTierTwoTeamProfile {
  const defensiveRunPreventionScore = clamp(team.defensiveRunPreventionScore ?? 50, 0, 100);
  const infieldDefenseScore = clamp(team.infieldDefenseScore ?? defensiveRunPreventionScore, 0, 100);
  const outfieldDefenseScore = clamp(team.outfieldDefenseScore ?? defensiveRunPreventionScore, 0, 100);
  const catcherFramingScore = clamp(team.catcherFramingScore ?? 50, 0, 100);
  const catcherRunGameScore = clamp(team.catcherRunGameScore ?? 50, 0, 100);
  const travelFatigueScore = clamp(team.travelFatigueScore ?? 50, 0, 100);
  const restRecoveryScore = clamp(team.restRecoveryScore ?? 50, 0, 100);
  const umpireZoneRunImpact = clamp(team.umpireZoneRunImpact ?? 0, -1, 1);
  const umpireStrikeoutImpact = clamp(team.umpireStrikeoutImpact ?? 0, -1, 1);
  const weatherTrajectoryRunImpact = clamp(team.weatherTrajectoryRunImpact ?? 0, -1, 1);
  const inferredWeatherConfidence =
    venue.weatherExposure === "HIGH" || venue.windSensitivity === "HIGH"
      ? 58
      : venue.weatherExposure === "MEDIUM"
        ? 46
        : 28;
  const weatherTrajectoryConfidence = clamp(team.weatherTrajectoryConfidence ?? inferredWeatherConfidence, 0, 100);

  const contextRiskScore =
    (100 - defensiveRunPreventionScore) * 0.12 +
    (100 - catcherFramingScore) * 0.08 +
    travelFatigueScore * 0.16 +
    (100 - restRecoveryScore) * 0.14 +
    Math.abs(umpireZoneRunImpact) * 8 +
    Math.abs(weatherTrajectoryRunImpact) * (weatherTrajectoryConfidence / 100) * 12;

  const contextRisk = contextRiskScore >= 32 ? "HIGH" : contextRiskScore >= 18 ? "MEDIUM" : "LOW";
  const trustAdjustment = clamp(
    Math.round(
      (defensiveRunPreventionScore - 50) * 0.05 +
        (catcherFramingScore - 50) * 0.04 +
        (restRecoveryScore - 50) * 0.05 -
        (travelFatigueScore - 50) * 0.06 -
        Math.abs(umpireZoneRunImpact) * 3 -
        Math.abs(weatherTrajectoryRunImpact) * (weatherTrajectoryConfidence / 100) * 4
    ),
    -8,
    8
  );

  return {
    defensiveRunPreventionScore,
    infieldDefenseScore,
    outfieldDefenseScore,
    catcherFramingScore,
    catcherRunGameScore,
    travelFatigueScore,
    restRecoveryScore,
    umpireZoneRunImpact,
    umpireStrikeoutImpact,
    weatherTrajectoryRunImpact,
    weatherTrajectoryConfidence,
    contextRisk,
    trustAdjustment
  };
}

function cappedMatchupFactor(edge: number, weight: number, coverage = 100) {
  const coverageMultiplier = clamp(coverage / 100, 0, 1);
  return clamp(1 + edge * weight * coverageMultiplier, 0.96, 1.04);
}

function centeredScoreFactor(score: number, weight: number, min = 0.96, max = 1.04) {
  return clamp(1 + (score - 50) * weight, min, max);
}

function tierTwoRunPreventionFactor(profile: DerivedTierTwoTeamProfile) {
  const defense = centeredScoreFactor(profile.defensiveRunPreventionScore, -0.00075, 0.955, 1.045);
  const catcher = centeredScoreFactor(profile.catcherFramingScore, -0.00035, 0.975, 1.025);
  const runGame = centeredScoreFactor(profile.catcherRunGameScore, -0.00022, 0.985, 1.015);
  const fatigue = centeredScoreFactor(profile.travelFatigueScore, 0.0005, 0.975, 1.035);
  const rest = centeredScoreFactor(profile.restRecoveryScore, -0.00038, 0.975, 1.025);
  return clamp(defense * catcher * runGame * fatigue * rest, 0.94, 1.06);
}

function tierTwoOffenseEnvironmentFactor(profile: DerivedTierTwoTeamProfile) {
  const umpireRun = cappedMatchupFactor(profile.umpireZoneRunImpact, 0.018);
  const weatherRun = cappedMatchupFactor(profile.weatherTrajectoryRunImpact, 0.025, profile.weatherTrajectoryConfidence);
  const fatigueDrag = centeredScoreFactor(profile.travelFatigueScore, -0.00035, 0.98, 1.02);
  const restBoost = centeredScoreFactor(profile.restRecoveryScore, 0.00028, 0.985, 1.018);
  return clamp(umpireRun * weatherRun * fatigueDrag * restBoost, 0.955, 1.045);
}

function tierTwoStarterCommandFactor(profile: DerivedTierTwoTeamProfile) {
  const framing = centeredScoreFactor(profile.catcherFramingScore, 0.00045, 0.975, 1.03);
  const umpireKs = cappedMatchupFactor(profile.umpireStrikeoutImpact, 0.018);
  const fatigue = centeredScoreFactor(profile.travelFatigueScore, -0.00032, 0.98, 1.015);
  return clamp(framing * umpireKs * fatigue, 0.96, 1.04);
}

export function applyMlbSourceAwareResimulation(
  input: MlbSimulationInput,
  context: MlbSourceNativeContext
): MlbSimulationInput {
  const homeTierOne = buildTierOneProfile(context.home as MlbContextWithTierOne);
  const awayTierOne = buildTierOneProfile(context.away as MlbContextWithTierOne);
  const homeTierTwo = buildTierTwoProfile(context.home as MlbContextWithTierTwo, context.venue);
  const awayTierTwo = buildTierTwoProfile(context.away as MlbContextWithTierTwo, context.venue);

  const homeLineupFactor =
    certaintyMultiplier(context.home.lineupCertainty) *
    statusBoost(homeTierOne.lineupStatus) *
    (1 + (context.home.lineupStrength - 50) * 0.0025) *
    cappedMatchupFactor(homeTierOne.platoonEdge, 0.025) *
    cappedMatchupFactor(homeTierOne.pitchTypeMatchupEdge, 0.02, homeTierOne.pitchTypeCoverageScore) *
    tierTwoOffenseEnvironmentFactor(homeTierTwo);

  const awayLineupFactor =
    certaintyMultiplier(context.away.lineupCertainty) *
    statusBoost(awayTierOne.lineupStatus) *
    (1 + (context.away.lineupStrength - 50) * 0.0025) *
    cappedMatchupFactor(awayTierOne.platoonEdge, 0.025) *
    cappedMatchupFactor(awayTierOne.pitchTypeMatchupEdge, 0.02, awayTierOne.pitchTypeCoverageScore) *
    tierTwoOffenseEnvironmentFactor(awayTierTwo);

  const homeTierTwoCommand = tierTwoStarterCommandFactor(homeTierTwo);
  const awayTierTwoCommand = tierTwoStarterCommandFactor(awayTierTwo);
  const homeRunPreventionFactor = tierTwoRunPreventionFactor(homeTierTwo);
  const awayRunPreventionFactor = tierTwoRunPreventionFactor(awayTierTwo);

  const homeStarterConfidenceFactor = clamp(
    (0.96 + context.home.starterConfidence / 100 * 0.08 + (homeTierOne.starterLockScore - 50) * 0.00045) * homeTierTwoCommand,
    0.915,
    1.065
  );
  const awayStarterConfidenceFactor = clamp(
    (0.96 + context.away.starterConfidence / 100 * 0.08 + (awayTierOne.starterLockScore - 50) * 0.00045) * awayTierTwoCommand,
    0.915,
    1.065
  );

  const homeBullpenAvailabilityFactor = clamp(
    (1 -
      (context.home.bullpenFreshness - 50) * 0.002 -
      (context.home.bullpenCoverage - 50) * 0.0015 -
      (homeTierOne.bullpenLeverageScore - 50) * 0.0012 -
      (homeTierOne.longReliefCoverage - 50) * 0.00055) * homeRunPreventionFactor,
    0.88,
    1.12
  );
  const awayBullpenAvailabilityFactor = clamp(
    (1 -
      (context.away.bullpenFreshness - 50) * 0.002 -
      (context.away.bullpenCoverage - 50) * 0.0015 -
      (awayTierOne.bullpenLeverageScore - 50) * 0.0012 -
      (awayTierOne.longReliefCoverage - 50) * 0.00055) * awayRunPreventionFactor,
    0.88,
    1.12
  );

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
      bullpen: {
        ...input.home.bullpen,
        runsAllowedPer9: clamp(input.home.bullpen.runsAllowedPer9 * homeBullpenAvailabilityFactor, 2.2, 7.8)
      }
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
      bullpen: {
        ...input.away.bullpen,
        runsAllowedPer9: clamp(input.away.bullpen.runsAllowedPer9 * awayBullpenAvailabilityFactor, 2.2, 7.8)
      }
    }
  };
}

export function recalibrateMlbMarketOutputs(
  summary: MlbSimulationSummary,
  context: MlbSourceNativeContext
): MlbSimulationSummary {
  const homeTierOne = buildTierOneProfile(context.home as MlbContextWithTierOne);
  const awayTierOne = buildTierOneProfile(context.away as MlbContextWithTierOne);
  const homeTierTwo = buildTierTwoProfile(context.home as MlbContextWithTierTwo, context.venue);
  const awayTierTwo = buildTierTwoProfile(context.away as MlbContextWithTierTwo, context.venue);
  const tierOneTrust = (homeTierOne.trustScore + awayTierOne.trustScore) / 2;
  const tierTwoTrustAdjustment = (homeTierTwo.trustAdjustment + awayTierTwo.trustAdjustment) / 2;
  const tierTwoContextRiskPenalty =
    (homeTierTwo.contextRisk === "HIGH" ? 6 : homeTierTwo.contextRisk === "MEDIUM" ? 3 : 0) +
    (awayTierTwo.contextRisk === "HIGH" ? 6 : awayTierTwo.contextRisk === "MEDIUM" ? 3 : 0);
  const uncertaintyPenalty =
    (homeTierOne.lineupStatus === "UNKNOWN" ? 10 : homeTierOne.lineupStatus === "INFERRED" ? 5 : 0) +
    (awayTierOne.lineupStatus === "UNKNOWN" ? 10 : awayTierOne.lineupStatus === "INFERRED" ? 5 : 0) +
    (homeTierOne.starterStatus === "UNKNOWN" ? 14 : homeTierOne.starterStatus === "INFERRED" ? 7 : 0) +
    (awayTierOne.starterStatus === "UNKNOWN" ? 14 : awayTierOne.starterStatus === "INFERRED" ? 7 : 0) +
    tierTwoContextRiskPenalty;

  const certaintyScore =
    context.home.starterConfidence * 0.16 +
    context.away.starterConfidence * 0.16 +
    context.home.bullpenCoverage * 0.1 +
    context.away.bullpenCoverage * 0.1 +
    tierOneTrust * 0.34 +
    tierTwoTrustAdjustment +
    (context.home.lineupCertainty === "HIGH" ? 8 : context.home.lineupCertainty === "MEDIUM" ? 5 : 1) +
    (context.away.lineupCertainty === "HIGH" ? 8 : context.away.lineupCertainty === "MEDIUM" ? 5 : 1) -
    uncertaintyPenalty * 0.35;

  const weatherTrajectoryImpact = clamp(
    ((homeTierTwo.weatherTrajectoryRunImpact + awayTierTwo.weatherTrajectoryRunImpact) / 2) *
      ((homeTierTwo.weatherTrajectoryConfidence + awayTierTwo.weatherTrajectoryConfidence) / 200),
    -0.035,
    0.035
  );
  const umpireRunImpact = clamp((homeTierTwo.umpireZoneRunImpact + awayTierTwo.umpireZoneRunImpact) / 2 * 0.018, -0.025, 0.025);
  const tierTwoTotalEnvironmentFactor = clamp(1 + weatherTrajectoryImpact + umpireRunImpact, 0.95, 1.05);

  const shrink = clamp(0.2 - certaintyScore / 1000, 0.055, 0.205);
  const baselineTotal = 8.7 * context.venue.baselineRunFactor * tierTwoTotalEnvironmentFactor;
  const calibratedTotal = summary.projectedTotalRuns * (1 - shrink) + baselineTotal * shrink;
  const calibratedSpread = summary.projectedSpreadHome * (1 - shrink * 0.85);
  const calibratedWinProbHome = 0.5 + (summary.winProbHome - 0.5) * (1 - shrink);
  const calibratedHomeRuns = (calibratedTotal + calibratedSpread) / 2;
  const calibratedAwayRuns = calibratedTotal - calibratedHomeRuns;

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
      tierOne: {
        home: homeTierOne,
        away: awayTierOne,
        averageTrustScore: round(tierOneTrust, 1),
        recalibrationShrink: round(shrink, 4)
      },
      tierTwo: {
        home: homeTierTwo,
        away: awayTierTwo,
        averageTrustAdjustment: round(tierTwoTrustAdjustment, 1),
        contextRiskPenalty: round(tierTwoContextRiskPenalty, 1),
        totalEnvironmentFactor: round(tierTwoTotalEnvironmentFactor, 4)
      }
    } as MlbSimulationSummary["diagnostics"] & {
      tierOne: {
        home: DerivedTierOneTeamProfile;
        away: DerivedTierOneTeamProfile;
        averageTrustScore: number;
        recalibrationShrink: number;
      };
      tierTwo: {
        home: DerivedTierTwoTeamProfile;
        away: DerivedTierTwoTeamProfile;
        averageTrustAdjustment: number;
        contextRiskPenalty: number;
        totalEnvironmentFactor: number;
      };
    }
  };
}
