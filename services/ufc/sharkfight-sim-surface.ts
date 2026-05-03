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

export type SharkFightDetailSimSurface = {
  pickProbability: number | null;
  pickSide: "A" | "B" | null;
  engineAgreement: "agreement" | "disagreement" | "unknown";
  methodLean: string | null;
  methodLeanProbability: number | null;
  topRoundOutcome: string | null;
  topRoundProbability: number | null;
  dataCompletenessPct: number;
  dataMissingCount: number;
};

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function pickProbability(fight: UfcOperationalFeedCard) {
  if (!fight.pickFighterId) return null;
  return fight.pickFighterId === fight.fighterAId ? fight.fighterAWinProbability : fight.fighterBWinProbability;
}

function topMethod(fight: UfcOperationalFeedCard) {
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
  const simulated = fights.filter((fight) => fight.simulationCount != null);
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

export function buildSharkFightDetailSimSurface(fight: UfcFightIqDetail): SharkFightDetailSimSurface {
  const prediction = fight.prediction;
  const probability = prediction ? pickProbability(prediction) : null;
  const pickSide = prediction?.pickFighterId ? (prediction.pickFighterId === prediction.fighterAId ? "A" : "B") : null;
  const skillPick = enginePick(fight.sourceOutputs?.skillMarkov?.fighterAWinProbability);
  const exchangePick = enginePick(fight.sourceOutputs?.exchangeMonteCarlo?.fighterAWinProbability);
  const method = prediction ? topMethod(prediction) : null;
  const roundOutcome = topRound(fight.roundFinishProbabilities);
  const missingFields = fight.featureComparison.filter((row) => row.fighterA == null || row.fighterB == null).length;
  const totalCells = Math.max(1, fight.featureComparison.length * 2);
  const missingCells = fight.featureComparison.reduce((sum, row) => sum + (row.fighterA == null ? 1 : 0) + (row.fighterB == null ? 1 : 0), 0);
  return {
    pickProbability: probability,
    pickSide,
    engineAgreement: skillPick && exchangePick ? (skillPick === exchangePick ? "agreement" : "disagreement") : "unknown",
    methodLean: method?.[0]?.replace("_", "/") ?? null,
    methodLeanProbability: method?.[1] ?? null,
    topRoundOutcome: roundOutcome?.[0] ?? null,
    topRoundProbability: roundOutcome?.[1] ?? null,
    dataCompletenessPct: round(((totalCells - missingCells) / totalCells) * 100, 1),
    dataMissingCount: missingFields
  };
}
