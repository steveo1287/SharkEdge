import type { UfcDeepProfileLearnedWeights } from "@/services/ufc/deep-profile-weight-store";
import type { UfcDeepPhaseEdge, UfcDeepProfileMatchup, UfcDeepWinConditionPath } from "@/services/ufc/deep-profile-matchup-engine";

export type UfcDeepProfileAdjustedSimInput = {
  modelVersion: "ufc-deep-profile-sim-adjuster-v1";
  fightId: string | null;
  learnedWeightVersion: UfcDeepProfileLearnedWeights["modelVersion"];
  learnedWeightConfidence: number;
  rawOverallEdge: UfcDeepProfileMatchup["overallEdge"];
  adjustedOverallEdge: UfcDeepProfileMatchup["overallEdge"];
  adjustedPhaseEdges: UfcDeepPhaseEdge[];
  adjustedWinPaths: UfcDeepWinConditionPath[];
  methodPriors: {
    koTko: number;
    submission: number;
    decision: number;
  };
  confidenceCap: number;
  adjustedConfidence: number;
  simDeltas: {
    standing: number;
    wrestling: number;
    grappling: number;
    finish: number;
    decision: number;
    volatility: number;
    trustPenalty: number;
  };
  warnings: string[];
  summary: string;
};

function round(value: number, digits = 4) { return Number(value.toFixed(digits)); }
function clamp(value: number, min = 0, max = 100) { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)); }
function clamp01(value: number) { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }
function leader(edge: number): "A" | "B" | "EVEN" { return Math.abs(edge) < 3.5 ? "EVEN" : edge > 0 ? "A" : "B"; }
function phaseWeight(weights: UfcDeepProfileLearnedWeights, phase: string) { return weights.phaseWeights[phase as keyof typeof weights.phaseWeights] ?? 1; }
function methodWeight(weights: UfcDeepProfileLearnedWeights, condition: string) { return weights.methodPriors[condition as keyof typeof weights.methodPriors] ?? 1; }
function normalizedEdge(edge: number) { return Math.max(-100, Math.min(100, edge)); }
function sideName(matchup: UfcDeepProfileMatchup, side: "A" | "B" | "EVEN") {
  if (side === "A") return matchup.fighterA.fighterName ?? matchup.fighterA.fighterId;
  if (side === "B") return matchup.fighterB.fighterName ?? matchup.fighterB.fighterId;
  return "No clear side";
}
function adjustedPhase(edge: UfcDeepPhaseEdge, weights: UfcDeepProfileLearnedWeights): UfcDeepPhaseEdge {
  const weight = phaseWeight(weights, edge.phase);
  const nextEdge = round(edge.edge * weight, 2);
  const diff = nextEdge - edge.edge;
  const fighterA = round(clamp(edge.fighterA + diff / 2), 2);
  const fighterB = round(clamp(edge.fighterB - diff / 2), 2);
  const nextLeader = leader(nextEdge);
  const confidenceCap = weights.confidenceCaps.deepProfileMatchup ?? 0.96;
  return {
    ...edge,
    fighterA,
    fighterB,
    edge: nextEdge,
    leader: nextLeader,
    confidence: round(Math.min(edge.confidence, confidenceCap), 3),
    drivers: [...new Set([...edge.drivers, `learned_phase_weight:${weight.toFixed(3)}`])],
    summary: `${edge.phase}: learned weight ${weight.toFixed(2)} adjusted edge to ${Math.abs(nextEdge).toFixed(1)} for ${nextLeader === "EVEN" ? "even" : `side ${nextLeader}`}.`
  };
}
function adjustedPath(path: UfcDeepWinConditionPath, weights: UfcDeepProfileLearnedWeights): UfcDeepWinConditionPath {
  const method = methodWeight(weights, path.condition);
  const phase = phaseWeight(weights, path.phaseLink);
  const blend = 0.68 * method + 0.32 * phase;
  const score = round(clamp(path.score * blend), 2);
  const confidenceCap = weights.confidenceCaps.deepProfileMatchup ?? 0.96;
  return {
    ...path,
    score,
    confidence: round(Math.min(path.confidence, confidenceCap), 3),
    drivers: [...new Set([...path.drivers, `learned_method_weight:${method.toFixed(3)}`, `learned_phase_weight:${phase.toFixed(3)}`])],
    summary: `${path.fighterName ?? path.fighterId} ${path.condition.toLowerCase().replace(/_/g, " ")} path adjusted to ${score.toFixed(1)}.`
  };
}
function methodPriors(paths: UfcDeepWinConditionPath[], weights: UfcDeepProfileLearnedWeights) {
  let koTko = 0;
  let submission = 0;
  let decision = 0;
  for (const path of paths) {
    const weightedScore = path.score * methodWeight(weights, path.condition);
    if (path.condition === "KO_TKO") koTko += weightedScore;
    else if (path.condition === "SUBMISSION") submission += weightedScore;
    else if (path.condition === "DECISION_CONTROL" || path.condition === "DECISION_VOLUME") decision += weightedScore;
    else {
      koTko += weightedScore * 0.34;
      submission += weightedScore * 0.33;
      decision += weightedScore * 0.33;
    }
  }
  const total = Math.max(1, koTko + submission + decision);
  return { koTko: round(koTko / total, 4), submission: round(submission / total, 4), decision: round(decision / total, 4) };
}
function weightedOverall(matchup: UfcDeepProfileMatchup, phases: UfcDeepPhaseEdge[], weights: UfcDeepProfileLearnedWeights) {
  const raw = matchup.overallEdge.edge;
  const phaseBlend = phases.reduce((sum, edge) => sum + edge.edge * phaseWeight(weights, edge.phase), 0) / Math.max(1, phases.length);
  const profileWeight = weights.profileRatingWeights.overallEdge ?? 1;
  return round(normalizedEdge(raw * 0.58 * profileWeight + phaseBlend * 0.42), 2);
}
export function applyUfcDeepProfileLearnedWeights(matchup: UfcDeepProfileMatchup, weights: UfcDeepProfileLearnedWeights): UfcDeepProfileAdjustedSimInput {
  const adjustedPhaseEdges = Object.values(matchup.phaseEdges).map((edge) => adjustedPhase(edge, weights)).sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
  const adjustedWinPaths = matchup.winConditionPaths.map((path) => adjustedPath(path, weights)).sort((a, b) => b.score - a.score);
  const edge = weightedOverall(matchup, adjustedPhaseEdges, weights);
  const edgeLeader = leader(edge);
  const confidenceCap = weights.confidenceCaps.deepProfileMatchup ?? 0.96;
  const adjustedConfidence = round(Math.min(matchup.overallEdge.confidence, confidenceCap) * (0.72 + weights.confidence * 0.28), 3);
  const adjustedOverallEdge = {
    ...matchup.overallEdge,
    leader: edgeLeader,
    edge,
    confidence: adjustedConfidence,
    summary: `${sideName(matchup, edgeLeader)} ${edgeLeader === "EVEN" ? "is near even after learned-weight adjustment" : `leads by ${Math.abs(edge).toFixed(1)} after learned-weight adjustment`}.`
  };
  const priors = methodPriors(adjustedWinPaths, weights);
  const standing = (weights.phaseWeights.standing ?? 1) * (matchup.simModifiers.matchup.standingDelta ?? 0);
  const wrestling = (weights.phaseWeights.wrestling ?? 1) * (matchup.simModifiers.matchup.wrestlingDelta ?? 0);
  const grappling = (weights.phaseWeights.grappling ?? 1) * (matchup.simModifiers.matchup.grapplingDelta ?? 0);
  const finish = (weights.methodPriors.KO_TKO ?? 1) * (matchup.simModifiers.matchup.finishDelta ?? 0);
  const decision = (Math.max(weights.methodPriors.DECISION_CONTROL ?? 1, weights.methodPriors.DECISION_VOLUME ?? 1, weights.methodPriors.DECISION ?? 1)) * (matchup.simModifiers.matchup.decisionDelta ?? 0);
  const trustPenalty = (matchup.simModifiers.matchup.trustPenalty ?? 0) + Math.max(0, 0.82 - confidenceCap);
  const warnings = [
    ...(weights.reportCount < 25 ? ["low learned-weight sample size"] : []),
    ...(confidenceCap < 0.82 ? ["confidence capped by calibration misses"] : []),
    ...(weights.highMissCount > 0 ? [`${weights.highMissCount} high calibration misses in learned set`] : [])
  ];
  return {
    modelVersion: "ufc-deep-profile-sim-adjuster-v1",
    fightId: matchup.fightId,
    learnedWeightVersion: weights.modelVersion,
    learnedWeightConfidence: weights.confidence,
    rawOverallEdge: matchup.overallEdge,
    adjustedOverallEdge,
    adjustedPhaseEdges,
    adjustedWinPaths,
    methodPriors: priors,
    confidenceCap,
    adjustedConfidence,
    simDeltas: {
      standing: round(standing, 4),
      wrestling: round(wrestling, 4),
      grappling: round(grappling, 4),
      finish: round(finish, 4),
      decision: round(decision, 4),
      volatility: round(clamp01((matchup.simModifiers.matchup.volatility ?? 0) * (weights.dangerZoneWeights.dangerZones ?? 1)), 4),
      trustPenalty: round(clamp01(trustPenalty), 4)
    },
    warnings,
    summary: `${adjustedOverallEdge.summary} Method priors: KO/TKO ${(priors.koTko * 100).toFixed(0)}%, SUB ${(priors.submission * 100).toFixed(0)}%, DEC ${(priors.decision * 100).toFixed(0)}%.`
  };
}
