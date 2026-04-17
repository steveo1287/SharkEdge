import { calibrateProbabilityAgainstMarket } from "@/services/modeling/probability-calibration";

export type FightProjectionInput = {
  sportKey: "UFC" | "BOXING";
  rounds: number;
  fighterA: {
    name: string;
    record: string | null;
    recentWinRate?: number | null;
    recentMargin?: number | null;
    daysRest?: number | null;
    metadata?: Record<string, unknown> | null;
  };
  fighterB: {
    name: string;
    record: string | null;
    recentWinRate?: number | null;
    recentMargin?: number | null;
    daysRest?: number | null;
    metadata?: Record<string, unknown> | null;
  };
  marketProbabilityA?: number | null;
};

export type FightProjectionView = {
  projectedHomeScore: number;
  projectedAwayScore: number;
  projectedTotal: number;
  projectedSpreadHome: number;
  winProbHome: number;
  winProbAway: number;
  metadata: {
    confidenceLabel: "HIGH" | "MEDIUM" | "LOW";
    confidenceScore: number;
    uncertaintyScore: number;
    confidencePenalty: number;
    paceScore: number;
    methodProbabilities: {
      decision: number;
      finish: number;
    };
    finishRoundExpectation: number;
    diagnostics: {
      fighterARecordWinPct: number;
      fighterBRecordWinPct: number;
      fighterAStyleScore: number;
      fighterBStyleScore: number;
      fighterAControlScore: number;
      fighterBControlScore: number;
      fighterAQualityScore: number;
      fighterBQualityScore: number;
      grapplingMatchEdge: number;
      campEdge: number;
      pedigreeEdge: number;
    };
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseRecord(record: string | null | undefined) {
  const match = (record ?? "").match(/(\d+)-(\d+)(?:-(\d+))?/);
  if (!match) {
    return { wins: 0, losses: 0, draws: 0, winPct: 0.5, sampleSize: 0 };
  }
  const wins = Number(match[1] ?? 0);
  const losses = Number(match[2] ?? 0);
  const draws = Number(match[3] ?? 0);
  const sampleSize = wins + losses + draws;
  const winPct = sampleSize ? (wins + draws * 0.5) / sampleSize : 0.5;
  return { wins, losses, draws, winPct, sampleSize };
}

function getMetadataNumber(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = asNumber(metadata?.[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function getFightFeatureSet(sportKey: "UFC" | "BOXING", fighter: FightProjectionInput["fighterA"], record: ReturnType<typeof parseRecord>) {
  const strikingStyle =
    getMetadataNumber(fighter.metadata, sportKey === "UFC"
      ? ["strikingEfficiencyScore", "sigStrikeDiff", "sigStrikeRate", "strikes_landed", "strikesLandedPerMin"]
      : ["powerScore", "knockdownRate", "jabScore", "counterScore", "strikes_landed"]) ?? record.winPct * 10;

  const controlThreat =
    getMetadataNumber(fighter.metadata, sportKey === "UFC"
      ? ["grapplingControlScore", "controlScore", "takedownScore", "grapplingScore", "control_time"]
      : ["ringControlScore", "pressureScore", "defenseScore", "counterScore"]) ?? ((fighter.recentMargin ?? 0) * 0.3 + 5);

  const antiWrestling =
    getMetadataNumber(fighter.metadata, ["antiWrestlingScore", "takedownDefenseScore", "tdDef", "takedownDefense"]) ?? (sportKey === "UFC" ? 6 : 5.8);

  const durability =
    getMetadataNumber(fighter.metadata, ["durabilityTrendScore", "durabilityScore", "chinScore", "defenseScore", "damageAbsorption"]) ?? clamp(8 - record.losses * 0.12, 4.5, 9.5);

  const schedule =
    getMetadataNumber(fighter.metadata, ["strengthOfScheduleScore", "averageOpponentQuality", "averageOpponentWinPct"]) ?? 5.6;

  const winQuality =
    getMetadataNumber(fighter.metadata, ["winQualityScore", "opponentAdjustedQualityScore", "compositeQualityScore"]) ?? (record.winPct * 6 + 2);

  const fraudCheck =
    getMetadataNumber(fighter.metadata, ["fraudCheckScore"]) ?? 5.2;

  const pedigree =
    getMetadataNumber(fighter.metadata, ["pedigreeScore", "wrestlingScore", "grapplingPedigreeScore"]) ?? 5.5;

  const campQuality =
    getMetadataNumber(fighter.metadata, ["campQualityScore", "trainingPartnerScore"]) ?? 5.7;

  const finishPressure =
    clamp(getMetadataNumber(fighter.metadata, ["finishingPressureScore", "finishRate", "finish_score", "koRate", "submissionRate"]) ?? 0.42, sportKey === "UFC" ? 0.2 : 0.12, sportKey === "UFC" ? 9.8 : 9.2);

  const submissionThreat =
    getMetadataNumber(fighter.metadata, ["submissionThreatScore", "subAvg", "submissionsPer15"]) ?? (sportKey === "UFC" ? 5.4 : 4.2);

  const roundWinning =
    getMetadataNumber(fighter.metadata, ["roundWinningScore", "efficiencyScore", "roundControlScore"]) ?? (record.winPct * 6 + 1.8);

  const physicality =
    getMetadataNumber(fighter.metadata, ["physicalityScore", "reachInches", "reach", "heightInches", "height"]) ?? 70;

  const opponentGraph = getMetadataNumber(fighter.metadata, ["opponentGraphScore"]) ?? 5.4;
  const sourceCompleteness = getMetadataNumber(fighter.metadata, ["sourceCompletenessScore"]) ?? 5.2;
  const commonOpponentEdge = getMetadataNumber(fighter.metadata, ["ufcCommonOpponentEdgeScore"]) ?? 0;

  const age = getMetadataNumber(fighter.metadata, ["age"]) ?? 30;
  const reach = getMetadataNumber(fighter.metadata, ["reachInches", "reach", "heightInches", "height"]) ?? 70;

  return {
    strikingStyle,
    controlThreat,
    antiWrestling,
    durability,
    schedule,
    winQuality,
    fraudCheck,
    pedigree,
    campQuality,
    finishPressure,
    submissionThreat,
    roundWinning,
    physicality,
    opponentGraph,
    sourceCompleteness,
    commonOpponentEdge,
    age,
    reach
  };
}

export function buildFightProjection(input: FightProjectionInput): FightProjectionView {
  const recordA = parseRecord(input.fighterA.record);
  const recordB = parseRecord(input.fighterB.record);
  const fighterA = getFightFeatureSet(input.sportKey, input.fighterA, recordA);
  const fighterB = getFightFeatureSet(input.sportKey, input.fighterB, recordB);

  const recordEdge = (recordA.winPct - recordB.winPct) * 18.5;
  const recentFormEdge = ((input.fighterA.recentWinRate ?? 50) - (input.fighterB.recentWinRate ?? 50)) * 0.11;
  const marginEdge = ((input.fighterA.recentMargin ?? 0) - (input.fighterB.recentMargin ?? 0)) * 0.16;
  const strikingEdge = (fighterA.strikingStyle - fighterB.strikingStyle) * (input.sportKey === "UFC" ? 0.34 : 0.3);
  const roundWinningEdge = (fighterA.roundWinning - fighterB.roundWinning) * (input.sportKey === "UFC" ? 0.3 : 0.26);
  const qualityEdge = ((fighterA.schedule + fighterA.winQuality + fighterA.fraudCheck) - (fighterB.schedule + fighterB.winQuality + fighterB.fraudCheck)) * (input.sportKey === "UFC" ? 0.18 : 0.16);
  const controlEdge = (fighterA.controlThreat - fighterB.controlThreat) * (input.sportKey === "UFC" ? 0.25 : 0.12);
  const antiWrestlingEdge = (fighterA.antiWrestling - fighterB.antiWrestling) * (input.sportKey === "UFC" ? 0.14 : 0);
  const grapplingMatchEdge = input.sportKey === "UFC"
    ? ((fighterA.controlThreat - fighterB.antiWrestling) - (fighterB.controlThreat - fighterA.antiWrestling)) * 0.24
    : 0;
  const submissionMatchEdge = input.sportKey === "UFC"
    ? ((fighterA.submissionThreat - fighterB.durability) - (fighterB.submissionThreat - fighterA.durability)) * 0.11
    : 0;
  const durabilityEdge = (fighterA.durability - fighterB.durability) * 0.28;
  const finishEdge = (fighterA.finishPressure - fighterB.finishPressure) * (input.sportKey === "UFC" ? 0.22 : 0.18);
  const graphEdge = (fighterA.opponentGraph - fighterB.opponentGraph) * (input.sportKey === "UFC" ? 0.16 : 0);
  const sourceEdge = (fighterA.sourceCompleteness - fighterB.sourceCompleteness) * (input.sportKey === "UFC" ? 0.06 : 0);
  const commonOpponentEdge = input.sportKey === "UFC" ? (fighterA.commonOpponentEdge - fighterB.commonOpponentEdge) * 0.28 : 0;
  const campEdge = (fighterA.campQuality - fighterB.campQuality) * 0.11;
  const pedigreeEdge = (fighterA.pedigree - fighterB.pedigree) * (input.sportKey === "UFC" ? 0.12 : 0.06);
  const reachEdge = (fighterA.reach - fighterB.reach) * 0.08;
  const restEdge = ((input.fighterA.daysRest ?? 42) - (input.fighterB.daysRest ?? 42)) * 0.008;
  const agePenaltyEdge = clamp((fighterB.age - fighterA.age) * 0.07, -1.3, 1.3);

  const rawScoreEdge =
    recordEdge +
    recentFormEdge +
    marginEdge +
    strikingEdge +
    roundWinningEdge +
    qualityEdge +
    graphEdge +
    sourceEdge +
    commonOpponentEdge +
    controlEdge +
    antiWrestlingEdge +
    grapplingMatchEdge +
    submissionMatchEdge +
    durabilityEdge +
    finishEdge +
    campEdge +
    pedigreeEdge +
    reachEdge +
    restEdge +
    agePenaltyEdge;

  const paceScore = clamp(
    input.rounds * (input.sportKey === "UFC" ? 0.92 : 0.7) + ((fighterA.finishPressure + fighterB.finishPressure) / 2) * 0.42 + ((fighterA.controlThreat + fighterB.controlThreat) / 2) * 0.22,
    2.8,
    input.sportKey === "UFC" ? 10.8 : 9.6
  );

  const finishProbabilityRaw =
    (fighterA.finishPressure + fighterB.finishPressure) * 0.055 +
    ((fighterA.submissionThreat + fighterB.submissionThreat) * (input.sportKey === "UFC" ? 0.02 : 0)) +
    ((9.8 - fighterA.durability) + (9.8 - fighterB.durability)) * 0.03 -
    input.rounds * (input.sportKey === "UFC" ? 0.03 : 0.018);
  const finishProbability = clamp(finishProbabilityRaw, input.sportKey === "UFC" ? 0.18 : 0.16, input.sportKey === "UFC" ? 0.78 : 0.68);
  const finishRoundExpectation = round(clamp(input.rounds * (1 - finishProbability * 0.6), 1.3, input.rounds), 2);

  const sampleSize = Math.min(recordA.sampleSize, recordB.sampleSize);
  const missingCount = [
    fighterA.schedule,
    fighterA.winQuality,
    fighterA.campQuality,
    fighterA.pedigree,
    fighterB.schedule,
    fighterB.winQuality,
    fighterB.campQuality,
    fighterB.pedigree
  ].filter((value) => value <= 5.75).length;
  const closenessPenalty = Math.abs(rawScoreEdge) < 2.2 ? 9 : Math.abs(rawScoreEdge) < 4.4 ? 4 : 0;
  const uncertaintyScore = clamp(
    Math.round((sampleSize < 8 ? 30 : sampleSize < 14 ? 22 : sampleSize < 20 ? 15 : 10) + missingCount * 2 + closenessPenalty + Math.abs(fighterA.age - fighterB.age) * 0.3 + (input.sportKey === "BOXING" ? 4 : 0)),
    10,
    78
  );

  const baseProbability = 1 / (1 + Math.exp(-rawScoreEdge / (input.sportKey === "UFC" ? 7.1 : 7.8)));
  const calibrated = calibrateProbabilityAgainstMarket({
    modelProbability: baseProbability,
    marketProbability: input.marketProbabilityA ?? null,
    sampleSize,
    sourceConfidence: clamp(1 - uncertaintyScore / 100, 0.26, 0.88),
    uncertaintyScore
  });
  const confidenceScore = clamp(Math.round(92 - calibrated.confidencePenalty * 2.2 - uncertaintyScore * 0.24 + Math.abs(rawScoreEdge) * 0.7), 18, 95);
  const confidenceLabel = confidenceScore >= 74 ? "HIGH" : confidenceScore >= 52 ? "MEDIUM" : "LOW";
  const projectedHomeScore = round(50 + rawScoreEdge * 1.38, 3);
  const projectedAwayScore = round(50 - rawScoreEdge * 1.38, 3);

  return {
    projectedHomeScore,
    projectedAwayScore,
    projectedTotal: round(projectedHomeScore + projectedAwayScore, 3),
    projectedSpreadHome: round(projectedHomeScore - projectedAwayScore, 3),
    winProbHome: round(calibrated.posteriorProbability ?? 0.5, 4),
    winProbAway: round(1 - (calibrated.posteriorProbability ?? 0.5), 4),
    metadata: {
      confidenceLabel,
      confidenceScore,
      uncertaintyScore,
      confidencePenalty: calibrated.confidencePenalty,
      paceScore: round(paceScore, 3),
      methodProbabilities: {
        decision: round(1 - finishProbability, 4),
        finish: round(finishProbability, 4)
      },
      finishRoundExpectation,
      diagnostics: {
        fighterARecordWinPct: round(recordA.winPct, 4),
        fighterBRecordWinPct: round(recordB.winPct, 4),
        fighterAStyleScore: round(fighterA.strikingStyle, 3),
        fighterBStyleScore: round(fighterB.strikingStyle, 3),
        fighterAControlScore: round(fighterA.controlThreat, 3),
        fighterBControlScore: round(fighterB.controlThreat, 3),
        fighterAQualityScore: round((fighterA.schedule + fighterA.winQuality + fighterA.fraudCheck + fighterA.opponentGraph) / 4, 3),
        fighterBQualityScore: round((fighterB.schedule + fighterB.winQuality + fighterB.fraudCheck + fighterB.opponentGraph) / 4, 3),
        grapplingMatchEdge: round(grapplingMatchEdge, 3),
        campEdge: round(campEdge, 3),
        pedigreeEdge: round(pedigreeEdge, 3)
      }
    }
  };
}
