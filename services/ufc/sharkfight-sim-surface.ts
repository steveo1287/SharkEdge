import type { UfcCardDetail, UfcFightIqDetail } from "@/services/ufc/card-feed";
import type { UfcOperationalFeedCard } from "@/services/ufc/operational-feed";

export type SharkFightCardSimSurface = {
  fightCount: number;
  simulatedFightCount: number;
  simulationCoveragePct: number;
  edgeFightCount: number;
  dangerFlagCount: number;
  highConfidenceCount: number;
  pendingShadowCount: number;
  resolvedShadowCount: number;
  dominantMethod: string | null;
  averagePickProbability: number | null;
};

export type SharkFightMetricPair = {
  fighterA: number | null;
  fighterB: number | null;
};

export type SharkFightDetailSimSurface = {
  pickProbability: number | null;
  pickSide: "A" | "B" | null;
  engineAgreement: "agreement" | "disagreement" | "unknown";
  engineVoteCount: number;
  engineSpreadPct: number | null;
  methodLean: string | null;
  methodLeanProbability: number | null;
  finishProbability: number | null;
  topRoundOutcome: string | null;
  topRoundProbability: number | null;
  averageFightLengthSeconds: number | null;
  averageDamage: SharkFightMetricPair;
  averageControlSeconds: SharkFightMetricPair;
  averageKnockdowns: SharkFightMetricPair;
  topDangerFlag: string | null;
  dataCompletenessPct: number;
  dataMissingCount: number;
};

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickProbability(fight: UfcOperationalFeedCard) {
  if (!fight.hasPrediction || !fight.pickFighterId) return null;
  return fight.pickFighterId === fight.fighterAId ? fight.fighterAWinProbability : fight.fighterBWinProbability;
}

function topMethod(fight: UfcOperationalFeedCard) {
  if (!fight.hasPrediction) return null;
  const entries = Object.entries(fight.methodProbabilities).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]));
  return entries.sort((a, b) => b[1] - a[1])[0] ?? null;
}

function confidenceRank(value: string | null | undefined) {
  if (!value) return 0;
  if (value.includes("HIGH")) return 3;
  if (value.includes("MEDIUM")) return 2;
  return 1;
}

export function buildSharkFightCardSimSurface(card: Pick<UfcCardDetail, "fights" | "shadowPendingCount" | "shadowResolvedCount">): SharkFightCardSimSurface {
  const fights = card.fights;
  const simulated = fights.filter((fight) => fight.hasPrediction && fight.simulationCount != null);
  const pickProbabilities = simulated.map(pickProbability).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const methodCounts = new Map<string, number>();
  for (const fight of simulated) {
    const method = topMethod(fight)?.[0]?.replace("_", "/") ?? null;
    if (method) methodCounts.set(method, (methodCounts.get(method) ?? 0) + 1);
  }
  const dominantMethod = [...methodCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    fightCount: fights.length,
    simulatedFightCount: simulated.length,
    simulationCoveragePct: fights.length ? round((simulated.length / fights.length) * 100, 1) : 0,
    edgeFightCount: fights.filter((fight) => typeof fight.edgePct === "number" && fight.edgePct > 0).length,
    dangerFlagCount: fights.reduce((sum, fight) => sum + fight.dangerFlags.length, 0),
    highConfidenceCount: fights.filter((fight) => confidenceRank(fight.confidenceGrade) >= 3).length,
    pendingShadowCount: card.shadowPendingCount,
    resolvedShadowCount: card.shadowResolvedCount,
    dominantMethod,
    averagePickProbability: pickProbabilities.length ? round(pickProbabilities.reduce((sum, value) => sum + value, 0) / pickProbabilities.length, 4) : null
  };
}

function topRound(rounds: Record<string, number>) {
  const entries = Object.entries(rounds).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]));
  return entries.sort((a, b) => b[1] - a[1])[0] ?? null;
}

function enginePick(probability: unknown) {
  if (typeof probability !== "number" || !Number.isFinite(probability)) return null;
  return probability >= 0.5 ? "A" : "B";
}

function sourceOutputProbability(sourceOutputs: unknown, engine: string) {
  return num(asRecord(asRecord(sourceOutputs)[engine]).fighterAWinProbability);
}

function engineProbabilities(sourceOutputs: unknown) {
  return [
    sourceOutputProbability(sourceOutputs, "skillMarkov"),
    sourceOutputProbability(sourceOutputs, "exchangeMonteCarlo"),
    sourceOutputProbability(sourceOutputs, "roundByRound"),
    sourceOutputProbability(sourceOutputs, "styleMatchup")
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function pairFrom(value: unknown): SharkFightMetricPair | null {
  const record = asRecord(value);
  const fighterA = num(record.fighterA);
  const fighterB = num(record.fighterB);
  if (fighterA == null && fighterB == null) return null;
  return { fighterA, fighterB };
}

function pairMetric(fight: UfcFightIqDetail, key: "averageDamage" | "averageControlSeconds" | "averageKnockdowns"): SharkFightMetricPair {
  const predictionJson = asRecord(fight.prediction?.predictionJson);
  const sourceOutputs = asRecord(fight.sourceOutputs);
  const exchange = asRecord(sourceOutputs.exchangeMonteCarlo);
  const roundEngine = asRecord(sourceOutputs.roundByRound);
  return pairFrom(predictionJson[key]) ?? pairFrom(exchange[key]) ?? pairFrom(roundEngine[key]) ?? { fighterA: null, fighterB: null };
}

function averageFightLength(fight: UfcFightIqDetail) {
  const predictionJson = asRecord(fight.prediction?.predictionJson);
  const sourceOutputs = asRecord(fight.sourceOutputs);
  return num(predictionJson.averageFightLengthSeconds)
    ?? num(asRecord(sourceOutputs.exchangeMonteCarlo).averageFightLengthSeconds)
    ?? num(asRecord(sourceOutputs.roundByRound).averageFightLengthSeconds);
}

function finishProbability(fight: UfcFightIqDetail) {
  const ko = fight.methodProbabilities?.KO_TKO;
  const sub = fight.methodProbabilities?.SUBMISSION;
  if (typeof ko !== "number" || !Number.isFinite(ko) || typeof sub !== "number" || !Number.isFinite(sub)) return null;
  return round(ko + sub, 4);
}

export function buildSharkFightDetailSimSurface(fight: UfcFightIqDetail): SharkFightDetailSimSurface {
  const prediction = fight.prediction;
  const probability = prediction ? pickProbability(prediction) : null;
  const pickSide = prediction?.hasPrediction && prediction.pickFighterId ? (prediction.pickFighterId === prediction.fighterAId ? "A" : "B") : null;
  const probabilities = engineProbabilities(fight.sourceOutputs);
  const picks = probabilities.map(enginePick).filter((value): value is "A" | "B" => value === "A" || value === "B");
  const method = prediction ? topMethod(prediction) : null;
  const roundOutcome = topRound(fight.roundFinishProbabilities);
  const missingFields = fight.featureComparison.filter((row) => row.fighterA == null || row.fighterB == null).length;
  const totalCells = Math.max(1, fight.featureComparison.length * 2);
  const missingCells = fight.featureComparison.reduce((sum, row) => sum + (row.fighterA == null ? 1 : 0) + (row.fighterB == null ? 1 : 0), 0);
  const engineAgreement = picks.length >= 2 ? (new Set(picks).size === 1 ? "agreement" : "disagreement") : "unknown";
  const engineVoteCount = pickSide ? picks.filter((value) => value === pickSide).length : 0;
  const engineSpreadPct = probabilities.length >= 2 ? round(Math.max(...probabilities) - Math.min(...probabilities), 4) : null;
  return {
    pickProbability: probability,
    pickSide,
    engineAgreement,
    engineVoteCount,
    engineSpreadPct,
    methodLean: method?.[0]?.replace("_", "/") ?? null,
    methodLeanProbability: method?.[1] ?? null,
    finishProbability: finishProbability(fight),
    topRoundOutcome: roundOutcome?.[0] ?? null,
    topRoundProbability: roundOutcome?.[1] ?? null,
    averageFightLengthSeconds: averageFightLength(fight),
    averageDamage: pairMetric(fight, "averageDamage"),
    averageControlSeconds: pairMetric(fight, "averageControlSeconds"),
    averageKnockdowns: pairMetric(fight, "averageKnockdowns"),
    topDangerFlag: fight.dangerFlags[0] ?? null,
    dataCompletenessPct: fight.featureComparison.length ? round(((totalCells - missingCells) / totalCells) * 100, 1) : 0,
    dataMissingCount: missingFields
  };
}
