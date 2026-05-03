import * as legacy from "./player-prop-sim";
import { projectNbaPlayerStat, type NbaPlayerStatProjection } from "./nba-player-stat-projection";
import { getNbaLineupTruth, type NbaLineupTruth } from "./nba-lineup-truth";
import {
  lookupNbaPropCalibration,
  normalizeNbaPropStatKey,
  type NbaPropCalibrationBucket,
  type NbaPropCalibrationLookup
} from "./nba-prop-calibration";
import { getActiveNbaPropCalibrationBuckets } from "./nba-prop-calibration-context";
import type { PlayerPropSimulationInput, PlayerPropSimulationSummary } from "./player-prop-sim";
import type { NbaStatKey } from "./nba-player-stat-profile";

export type { PlayerPropSimulationInput, PlayerPropSimulationSummary } from "./player-prop-sim";

export type NbaPropSafetyMetadata = {
  modelHealthGreen: boolean;
  sourceHealthGreen: boolean;
  injuryReportFresh: boolean;
  calibrationBucketHealthy: boolean;
  noVigMarketAvailable: boolean;
  noBet: boolean;
  blockerReasons: string[];
  confidence: number;
  minutesConfidence: number;
  lineupTruthStatus: "GREEN" | "YELLOW" | "RED" | "MISSING";
  playerStatus: "ACTIVE" | "PROBABLE" | "QUESTIONABLE" | "DOUBTFUL" | "OUT" | "UNKNOWN" | "MISSING";
  propCalibrationStatus: NbaPropCalibrationLookup["status"];
  propCalibrationBucket: string | null;
};

export type NbaElitePlayerPropSimulationSummary = PlayerPropSimulationSummary & {
  nbaPropSafety?: NbaPropSafetyMetadata;
};

type EliteInput = PlayerPropSimulationInput & {
  nbaLineupTruth?: NbaLineupTruth | null;
  lineupTruth?: NbaLineupTruth | null;
  playerStatus?: "ACTIVE" | "PROBABLE" | "QUESTIONABLE" | "DOUBTFUL" | "OUT" | "UNKNOWN" | null;
  teamSpread?: number | null;
  backToBack?: boolean;
  teammateOutUsageImpact?: number;
  teammateQuestionableUsageImpact?: number;
  nbaPropCalibrationBuckets?: NbaPropCalibrationBucket[];
};

type ProjectablePlayerStatus = Exclude<NbaPropSafetyMetadata["playerStatus"], "MISSING">;

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function buildPropSafety(args: {
  projection: NbaPlayerStatProjection;
  lineupTruth: NbaLineupTruth | null;
  playerStatus: NbaPropSafetyMetadata["playerStatus"];
  marketOddsOver?: number | null;
  marketOddsUnder?: number | null;
  calibration: NbaPropCalibrationLookup;
}): NbaPropSafetyMetadata {
  const projection = args.projection;
  const lineupTruthStatus = args.lineupTruth?.status ?? "MISSING";
  const noVigMarketAvailable = args.marketOddsOver !== null && args.marketOddsOver !== undefined && args.marketOddsUnder !== null && args.marketOddsUnder !== undefined;
  const calibrationHealthy = args.calibration.status === "HEALTHY";
  const blockerReasons = [
    ...projection.blockers,
    ...(lineupTruthStatus === "MISSING" ? ["lineup truth missing"] : []),
    ...(!noVigMarketAvailable ? ["no two-sided prop market odds"] : []),
    ...(!calibrationHealthy ? args.calibration.blockerReasons.map((reason) => `prop calibration ${reason}`) : [])
  ];
  const hardPlayerStatus = args.playerStatus === "QUESTIONABLE" || args.playerStatus === "DOUBTFUL" || args.playerStatus === "OUT" || args.playerStatus === "UNKNOWN" || args.playerStatus === "MISSING";

  return {
    modelHealthGreen: projection.confidence >= 0.7 && !projection.noBet && calibrationHealthy,
    sourceHealthGreen: lineupTruthStatus === "GREEN",
    injuryReportFresh: args.lineupTruth?.injuryReportFresh === true,
    calibrationBucketHealthy: calibrationHealthy,
    noVigMarketAvailable,
    noBet: projection.noBet || blockerReasons.length > 0 || hardPlayerStatus || !calibrationHealthy,
    blockerReasons: [...new Set(blockerReasons)],
    confidence: projection.confidence,
    minutesConfidence: projection.minutes.confidence,
    lineupTruthStatus,
    playerStatus: args.playerStatus,
    propCalibrationStatus: args.calibration.status,
    propCalibrationBucket: args.calibration.bucket?.bucket ?? null
  };
}

function projectionToLegacySummary(
  projection: NbaPlayerStatProjection,
  legacySummary: PlayerPropSimulationSummary,
  safety: NbaPropSafetyMetadata
): NbaElitePlayerPropSimulationSummary {
  const hitProbOver = { ...legacySummary.hitProbOver };
  const hitProbUnder = { ...legacySummary.hitProbUnder };
  if (typeof projection.marketLine === "number" && projection.overProbability !== null && projection.underProbability !== null) {
    const key = String(projection.marketLine);
    hitProbOver[key] = projection.overProbability;
    hitProbUnder[key] = projection.underProbability;
  }

  return {
    ...legacySummary,
    meanValue: projection.mean,
    medianValue: projection.median,
    stdDev: projection.stdDev,
    p10: projection.p10,
    p50: projection.median,
    p90: projection.p90,
    hitProbOver,
    hitProbUnder,
    contextualEdgeScore: safety.noBet ? Math.min(legacySummary.contextualEdgeScore, 1) : Math.max(legacySummary.contextualEdgeScore, round(projection.confidence * 10, 2)),
    drivers: [
      "NBA elite player-stat projection active.",
      ...projection.drivers,
      `Prop calibration status: ${safety.propCalibrationStatus}${safety.propCalibrationBucket ? ` bucket ${safety.propCalibrationBucket}` : ""}.`,
      ...safety.blockerReasons.map((blocker) => `Prop blocker: ${blocker}.`),
      ...projection.warnings.map((warning) => `Prop warning: ${warning}.`),
      ...legacySummary.drivers.slice(0, 4)
    ],
    priorWeight: Math.max(legacySummary.priorWeight, safety.noBet ? 0.7 : 0.25),
    sourceSummary: safety.noBet
      ? `Elite NBA prop model blocked action: ${safety.blockerReasons.join("; ") || "insufficient safety context"}.`
      : `Elite NBA prop model: ${round(projection.minutes.projectedMinutes, 1)} minutes, ${projection.statKey} mean ${projection.mean}, confidence ${round(projection.confidence * 100, 1)}%.`,
    projectedMinutes: projection.minutes.projectedMinutes,
    perMinuteRate: projection.profile.statRatesPerMinute[projection.statKey] ?? legacySummary.perMinuteRate ?? null,
    sampleSize: projection.profile.sampleSize,
    minutesSampleSize: projection.profile.sampleSize,
    usageRateProxy: projection.profile.tendencies.usageRate,
    trueShootingPct: projection.profile.attributes.rimFinishingSkill,
    opportunityRate: projection.profile.tendencies.shotAttemptRate,
    roleConfidence: projection.minutes.confidence,
    nbaPropSafety: safety
  };
}

function playerStatusFromContext(input: EliteInput): ProjectablePlayerStatus {
  if (input.playerStatus) return input.playerStatus;
  const text = [input.playerIntangibles, input.interactionContext]
    .map((value) => typeof value === "string" ? value : JSON.stringify(value ?? {}))
    .join(" ")
    .toLowerCase();
  if (text.includes("out") || text.includes("inactive")) return "OUT";
  if (text.includes("doubtful")) return "DOUBTFUL";
  if (text.includes("questionable")) return "QUESTIONABLE";
  if (text.includes("probable")) return "PROBABLE";
  return "ACTIVE";
}

function calibrationBucketsFrom(input: EliteInput) {
  return input.nbaPropCalibrationBuckets ?? getActiveNbaPropCalibrationBuckets();
}

function buildEliteProjection(input: EliteInput, legacySummary: PlayerPropSimulationSummary, lineupTruth: NbaLineupTruth | null): NbaElitePlayerPropSimulationSummary {
  const statKey = normalizeNbaPropStatKey(input.statKey) as NbaStatKey | null;
  if (input.leagueKey !== "NBA" || !statKey) return legacySummary;

  const teamName = input.teamStyle?.teamName ?? null;
  const playerStatus = playerStatusFromContext(input);
  const projection = projectNbaPlayerStat({
    playerId: input.playerId,
    playerName: input.playerName,
    team: teamName,
    position: input.position,
    statKey,
    recentStats: input.recentStats as Record<string, unknown>[],
    lineupTruth,
    marketLine: input.marketLine,
    marketOddsOver: input.marketOddsOver,
    marketOddsUnder: input.marketOddsUnder,
    playerStatus,
    teamSpread: input.teamSpread ?? null,
    backToBack: input.backToBack ?? false,
    teammateOutUsageImpact: input.teammateOutUsageImpact ?? (lineupTruth?.highUsageOut ? 5 : 0),
    teammateQuestionableUsageImpact: input.teammateQuestionableUsageImpact ?? (lineupTruth?.starQuestionable ? 4 : 0)
  });
  const calibration = lookupNbaPropCalibration({
    buckets: calibrationBucketsFrom(input),
    statKey,
    confidence: projection.confidence
  });
  const safety = buildPropSafety({
    projection,
    lineupTruth,
    playerStatus,
    marketOddsOver: input.marketOddsOver,
    marketOddsUnder: input.marketOddsUnder,
    calibration
  });

  return projectionToLegacySummary(projection, legacySummary, safety);
}

export async function simulateNbaElitePlayerPropProjection(input: EliteInput): Promise<NbaElitePlayerPropSimulationSummary> {
  const legacySummary = legacy.simulatePlayerPropProjection(input);
  const statKey = normalizeNbaPropStatKey(input.statKey);
  if (input.leagueKey !== "NBA" || !statKey) return legacySummary;

  const explicitLineupTruth = input.nbaLineupTruth ?? input.lineupTruth ?? null;
  if (explicitLineupTruth) return buildEliteProjection(input, legacySummary, explicitLineupTruth);

  const teamName = input.teamStyle?.teamName ?? null;
  const opponentName = input.opponentStyle?.teamName ?? null;
  const lineupTruth = teamName && opponentName
    ? await getNbaLineupTruth({ awayTeam: teamName, homeTeam: opponentName }).catch(() => null)
    : null;

  return buildEliteProjection(input, legacySummary, lineupTruth);
}

export function simulatePlayerPropProjection(input: EliteInput): NbaElitePlayerPropSimulationSummary {
  const legacySummary = legacy.simulatePlayerPropProjection(input);
  const explicitLineupTruth = input.nbaLineupTruth ?? input.lineupTruth ?? null;
  return buildEliteProjection(input, legacySummary, explicitLineupTruth);
}
