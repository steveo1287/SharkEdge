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

function cappedMatchupFactor(edge: number, weight: number, coverage = 100) {
  const coverageMultiplier = clamp(coverage / 100, 0, 1);
  return clamp(1 + edge * weight * coverageMultiplier, 0.96, 1.04);
}

export function applyMlbSourceAwareResimulation(
  input: MlbSimulationInput,
  context: MlbSourceNativeContext
): MlbSimulationInput {
  const homeTierOne = buildTierOneProfile(context.home as MlbContextWithTierOne);
  const awayTierOne = buildTierOneProfile(context.away as MlbContextWithTierOne);

  const homeLineupFactor =
    certaintyMultiplier(context.home.lineupCertainty) *
    statusBoost(homeTierOne.lineupStatus) *
    (1 + (context.home.lineupStrength - 50) * 0.0025) *
    cappedMatchupFactor(homeTierOne.platoonEdge, 0.025) *
    cappedMatchupFactor(homeTierOne.pitchTypeMatchupEdge, 0.02, homeTierOne.pitchTypeCoverageScore);

  const awayLineupFactor =
    certaintyMultiplier(context.away.lineupCertainty) *
    statusBoost(awayTierOne.lineupStatus) *
    (1 + (context.away.lineupStrength - 50) * 0.0025) *
    cappedMatchupFactor(awayTierOne.platoonEdge, 0.025) *
    cappedMatchupFactor(awayTierOne.pitchTypeMatchupEdge, 0.02, awayTierOne.pitchTypeCoverageScore);

  const homeStarterConfidenceFactor = clamp(
    0.96 + context.home.starterConfidence / 100 * 0.08 + (homeTierOne.starterLockScore - 50) * 0.00045,
    0.925,
    1.055
  );
  const awayStarterConfidenceFactor = clamp(
    0.96 + context.away.starterConfidence / 100 * 0.08 + (awayTierOne.starterLockScore - 50) * 0.00045,
    0.925,
    1.055
  );

  const homeBullpenAvailabilityFactor = clamp(
    1 -
      (context.home.bullpenFreshness - 50) * 0.002 -
      (context.home.bullpenCoverage - 50) * 0.0015 -
      (homeTierOne.bullpenLeverageScore - 50) * 0.0012 -
      (homeTierOne.longReliefCoverage - 50) * 0.00055,
    0.9,
    1.1
  );
  const awayBullpenAvailabilityFactor = clamp(
    1 -
      (context.away.bullpenFreshness - 50) * 0.002 -
      (context.away.bullpenCoverage - 50) * 0.0015 -
      (awayTierOne.bullpenLeverageScore - 50) * 0.0012 -
      (awayTierOne.longReliefCoverage - 50) * 0.00055,
    0.9,
    1.1
  );

  return {
    ...input,
    home: {
      ...input.home,
      offenseFactor: clamp(input.home.offenseFactor * homeLineupFactor, 0.72, 1.5),
      starter: {
        ...input.home.starter,
        expectedOuts: clamp(Math.round(input.home.starter.expectedOuts * homeStarterConfidenceFactor), 9, 24),
        runsAllowedPer9: clamp(input.home.starter.runsAllowedPer9 / homeStarterConfidenceFactor, 1.8, 8),
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
        runsAllowedPer9: clamp(input.away.starter.runsAllowedPer9 / awayStarterConfidenceFactor, 1.8, 8),
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
  const tierOneTrust = (homeTierOne.trustScore + awayTierOne.trustScore) / 2;
  const uncertaintyPenalty =
    (homeTierOne.lineupStatus === "UNKNOWN" ? 10 : homeTierOne.lineupStatus === "INFERRED" ? 5 : 0) +
    (awayTierOne.lineupStatus === "UNKNOWN" ? 10 : awayTierOne.lineupStatus === "INFERRED" ? 5 : 0) +
    (homeTierOne.starterStatus === "UNKNOWN" ? 14 : homeTierOne.starterStatus === "INFERRED" ? 7 : 0) +
    (awayTierOne.starterStatus === "UNKNOWN" ? 14 : awayTierOne.starterStatus === "INFERRED" ? 7 : 0);

  const certaintyScore =
    context.home.starterConfidence * 0.16 +
    context.away.starterConfidence * 0.16 +
    context.home.bullpenCoverage * 0.1 +
    context.away.bullpenCoverage * 0.1 +
    tierOneTrust * 0.34 +
    (context.home.lineupCertainty === "HIGH" ? 8 : context.home.lineupCertainty === "MEDIUM" ? 5 : 1) +
    (context.away.lineupCertainty === "HIGH" ? 8 : context.away.lineupCertainty === "MEDIUM" ? 5 : 1) -
    uncertaintyPenalty * 0.35;

  const shrink = clamp(0.2 - certaintyScore / 1000, 0.055, 0.2);
  const baselineTotal = 8.7 * context.venue.baselineRunFactor;
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
      weatherFactor: round(summary.diagnostics.weatherFactor * (1 - shrink * 0.2)),
      tierOne: {
        home: homeTierOne,
        away: awayTierOne,
        averageTrustScore: round(tierOneTrust, 1),
        recalibrationShrink: round(shrink, 4)
      }
    } as MlbSimulationSummary["diagnostics"] & {
      tierOne: {
        home: DerivedTierOneTeamProfile;
        away: DerivedTierOneTeamProfile;
        averageTrustScore: number;
        recalibrationShrink: number;
      };
    }
  };
}
