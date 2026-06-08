import type { UfcDeepDangerType, UfcDeepProfileMatchup, UfcDeepMatchupPhase, UfcRoundLeverage } from "@/services/ufc/deep-profile-matchup-engine";
import type { UfcDeepProfileWinCondition } from "@/services/ufc/deep-fighter-profile-v2";

export type UfcCalibrationMethod = "KO_TKO" | "SUBMISSION" | "DECISION" | "DQ" | "NO_CONTEST" | "UNKNOWN";
export type UfcCalibrationSide = "A" | "B" | "DRAW" | "NO_CONTEST";
export type UfcCalibrationSeverity = "LOW" | "MEDIUM" | "HIGH";
export type UfcCalibrationAdjustmentType = "PHASE_WEIGHT" | "METHOD_PRIOR" | "ROUND_PRIOR" | "CONFIDENCE_CAP" | "RISK_FLAG_WEIGHT" | "PROFILE_RATING_WEIGHT";

export type UfcActualFightResult = {
  fightId: string;
  winner: UfcCalibrationSide;
  method: UfcCalibrationMethod;
  round: number | null;
  time?: string | null;
  scheduledRounds?: number | null;
  notes?: string[];
  observedPhases?: Partial<Record<UfcDeepMatchupPhase, "A" | "B" | "EVEN">>;
  triggeredDangerZones?: UfcDeepDangerType[];
};

export type UfcCalibrationSignal = {
  key: string;
  severity: UfcCalibrationSeverity;
  predicted: string | number | null;
  actual: string | number | null;
  error: number;
  recommendation: string;
};

export type UfcCalibrationAdjustment = {
  type: UfcCalibrationAdjustmentType;
  target: string;
  direction: "UP" | "DOWN" | "HOLD";
  magnitude: number;
  reason: string;
};

export type UfcDeepProfileCalibrationReport = {
  modelVersion: "ufc-deep-profile-calibration-v1";
  fightId: string;
  generatedAt: string;
  predictionSummary: string;
  actualSummary: string;
  correct: {
    winner: boolean | null;
    methodFamily: boolean | null;
    roundBand: boolean | null;
    topPath: boolean | null;
    dangerZone: boolean | null;
  };
  scores: {
    calibrationError: number;
    winnerError: number;
    methodError: number;
    roundError: number;
    phaseError: number;
    dangerError: number;
    confidencePenalty: number;
  };
  signals: UfcCalibrationSignal[];
  adjustments: UfcCalibrationAdjustment[];
  summary: string;
};

function round(value: number, digits = 3) { return Number(value.toFixed(digits)); }
function clamp(value: number, min = 0, max = 100) { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)); }
function sideLabel(side: UfcCalibrationSide | "A" | "B" | "EVEN") { return side === "A" ? "A" : side === "B" ? "B" : side; }
function severity(error: number): UfcCalibrationSeverity { return error >= 35 ? "HIGH" : error >= 16 ? "MEDIUM" : "LOW"; }
function topPath(matchup: UfcDeepProfileMatchup) { return matchup.winConditionPaths[0] ?? null; }
function conditionMethod(condition: UfcDeepProfileWinCondition | null | undefined): UfcCalibrationMethod {
  if (condition === "KO_TKO") return "KO_TKO";
  if (condition === "SUBMISSION") return "SUBMISSION";
  if (condition === "DECISION_CONTROL" || condition === "DECISION_VOLUME") return "DECISION";
  if (condition === "SCRAMBLE_CHAOS") return "UNKNOWN";
  return "UNKNOWN";
}
function roundBand(round: number | null | undefined, scheduled = 3) {
  if (!round || round < 1) return "UNKNOWN";
  if (round === 1) return "EARLY";
  if (scheduled >= 5 && round >= 4) return "CHAMPIONSHIP";
  if (round >= scheduled) return "LATE";
  return "MID";
}
function leverageWinner(label: UfcRoundLeverage): "A" | "B" | "EVEN" | "VOLATILE" {
  if (label.startsWith("A_")) return "A";
  if (label.startsWith("B_")) return "B";
  if (label === "VOLATILE") return "VOLATILE";
  return "EVEN";
}
function predictionSide(matchup: UfcDeepProfileMatchup): UfcCalibrationSide | null {
  if (matchup.overallEdge.leader === "A" || matchup.overallEdge.leader === "B") return matchup.overallEdge.leader;
  const path = topPath(matchup);
  return path?.fighter ?? null;
}
function confidencePenalty(matchup: UfcDeepProfileMatchup, winnerCorrect: boolean | null) {
  if (winnerCorrect !== false) return 0;
  return clamp(matchup.overallEdge.confidence * 100 - 48, 0, 42);
}
function signal(key: string, error: number, predicted: string | number | null, actual: string | number | null, recommendation: string): UfcCalibrationSignal {
  return { key, severity: severity(error), predicted, actual, error: round(clamp(error), 2), recommendation };
}
function adjustment(type: UfcCalibrationAdjustmentType, target: string, direction: "UP" | "DOWN" | "HOLD", magnitude: number, reason: string): UfcCalibrationAdjustment {
  return { type, target, direction, magnitude: round(clamp(magnitude, 0, 1), 4), reason };
}
function methodError(predicted: UfcCalibrationMethod, actual: UfcCalibrationMethod) {
  if (actual === "UNKNOWN" || actual === "NO_CONTEST") return 0;
  if (predicted === actual) return 0;
  if (predicted === "UNKNOWN") return 22;
  if (actual === "DECISION" && (predicted === "KO_TKO" || predicted === "SUBMISSION")) return 34;
  if (predicted === "DECISION" && (actual === "KO_TKO" || actual === "SUBMISSION")) return 38;
  return 28;
}
function dangerHit(matchup: UfcDeepProfileMatchup, actual: UfcActualFightResult) {
  const predicted = new Set(matchup.dangerZones.map((zone) => zone.type));
  const triggered = actual.triggeredDangerZones ?? [];
  if (!triggered.length) return null;
  return triggered.some((type) => predicted.has(type));
}
function phaseErrors(matchup: UfcDeepProfileMatchup, actual: UfcActualFightResult) {
  const observed = actual.observedPhases ?? {};
  const entries = Object.entries(observed) as Array<[UfcDeepMatchupPhase, "A" | "B" | "EVEN"]>;
  if (!entries.length) return { error: 0, signals: [] as UfcCalibrationSignal[], adjustments: [] as UfcCalibrationAdjustment[] };
  const signals: UfcCalibrationSignal[] = [];
  const adjustments: UfcCalibrationAdjustment[] = [];
  let total = 0;
  for (const [phase, actualLeader] of entries) {
    const predicted = matchup.phaseEdges[phase]?.leader ?? "EVEN";
    const phaseEdge = Math.abs(matchup.phaseEdges[phase]?.edge ?? 0);
    const miss = predicted === actualLeader ? 0 : actualLeader === "EVEN" || predicted === "EVEN" ? 12 + phaseEdge * 0.25 : 24 + phaseEdge * 0.42;
    total += miss;
    if (miss > 0) {
      signals.push(signal(`phase:${phase}`, miss, predicted, actualLeader, `Recheck ${phase} phase weighting and fighter profile ratings.`));
      adjustments.push(adjustment("PHASE_WEIGHT", phase, "DOWN", Math.min(0.24, miss / 180), `Predicted ${phase} leader ${predicted}, actual ${actualLeader}.`));
    }
  }
  return { error: round(total / entries.length, 2), signals, adjustments };
}
function roundError(matchup: UfcDeepProfileMatchup, actual: UfcActualFightResult) {
  if (!actual.round || actual.round < 1) return 0;
  const scheduled = actual.scheduledRounds ?? matchup.roundLeverage.length ?? 3;
  const actualBand = roundBand(actual.round, scheduled);
  const actualRow = matchup.roundLeverage.find((row) => row.round === actual.round);
  const predictedWinner = actualRow ? leverageWinner(actualRow.leverage) : "EVEN";
  const predictedBand = matchup.roundLeverage.reduce((best, row) => row.volatility > best.volatility ? row : best, matchup.roundLeverage[0] ?? { round: 1, volatility: 0, leverage: "EVEN" as UfcRoundLeverage });
  const predBand = roundBand(predictedBand.round, scheduled);
  let error = predBand === actualBand ? 0 : 18;
  if (actual.winner === "A" || actual.winner === "B") {
    if (predictedWinner !== "EVEN" && predictedWinner !== "VOLATILE" && predictedWinner !== actual.winner) error += 16;
  }
  return clamp(error);
}
function buildAdjustments(args: { matchup: UfcDeepProfileMatchup; actual: UfcActualFightResult; winnerCorrect: boolean | null; methodMiss: number; roundMiss: number; dangerCorrect: boolean | null; confPenalty: number }) {
  const out: UfcCalibrationAdjustment[] = [];
  const path = topPath(args.matchup);
  if (args.winnerCorrect === false) {
    out.push(adjustment("PROFILE_RATING_WEIGHT", "overallEdge", "DOWN", Math.min(0.22, Math.abs(args.matchup.overallEdge.edge) / 160 + args.confPenalty / 220), "Winner side missed; reduce overconfident overall profile edge weighting."));
    if (path) out.push(adjustment("PROFILE_RATING_WEIGHT", `winPath:${path.condition}`, "DOWN", Math.min(0.2, path.score / 500), "Top win path belonged to losing side."));
  }
  if (args.methodMiss > 0 && path) {
    out.push(adjustment("METHOD_PRIOR", path.condition, "DOWN", Math.min(0.26, args.methodMiss / 160), "Predicted method family missed actual result."));
    if (args.actual.method !== "UNKNOWN") out.push(adjustment("METHOD_PRIOR", args.actual.method, "UP", Math.min(0.18, args.methodMiss / 220), "Actual method family should gain calibration weight in similar profile clashes."));
  }
  if (args.roundMiss > 0) out.push(adjustment("ROUND_PRIOR", "roundLeverage", "DOWN", Math.min(0.18, args.roundMiss / 160), "Round leverage band missed actual timing."));
  if (args.dangerCorrect === false) out.push(adjustment("RISK_FLAG_WEIGHT", "dangerZones", "DOWN", 0.12, "Stored danger zones did not match triggered result evidence."));
  if (args.confPenalty > 0) out.push(adjustment("CONFIDENCE_CAP", "deepProfileMatchup", "DOWN", Math.min(0.2, args.confPenalty / 200), "High-confidence wrong call; cap future confidence in similar profile states."));
  return out;
}
export function buildUfcDeepProfileCalibrationReport(args: { matchup: UfcDeepProfileMatchup; actual: UfcActualFightResult; generatedAt?: string }): UfcDeepProfileCalibrationReport {
  const matchup = args.matchup;
  const actual = args.actual;
  const predictedWinner = predictionSide(matchup);
  const winnerCorrect = actual.winner === "NO_CONTEST" || actual.winner === "DRAW" ? null : predictedWinner ? predictedWinner === actual.winner : null;
  const path = topPath(matchup);
  const predictedMethod = conditionMethod(path?.condition);
  const mError = methodError(predictedMethod, actual.method);
  const rError = roundError(matchup, actual);
  const dangerCorrect = dangerHit(matchup, actual);
  const phase = phaseErrors(matchup, actual);
  const dError = dangerCorrect == null ? 0 : dangerCorrect ? 0 : 24;
  const wError = winnerCorrect == null ? 0 : winnerCorrect ? 0 : 42 + Math.min(18, Math.abs(matchup.overallEdge.edge));
  const confPenalty = confidencePenalty(matchup, winnerCorrect);
  const methodCorrect = actual.method === "UNKNOWN" || actual.method === "NO_CONTEST" ? null : predictedMethod === actual.method;
  const actualBand = roundBand(actual.round, actual.scheduledRounds ?? matchup.roundLeverage.length);
  const predictedVolRound = matchup.roundLeverage.reduce((best, row) => row.volatility > best.volatility ? row : best, matchup.roundLeverage[0] ?? { round: 1, volatility: 0, leverage: "EVEN" as UfcRoundLeverage });
  const predictedRoundBand = roundBand(predictedVolRound.round, actual.scheduledRounds ?? matchup.roundLeverage.length);
  const roundCorrect = actual.round ? predictedRoundBand === actualBand : null;
  const topPathCorrect = path && actual.winner !== "DRAW" && actual.winner !== "NO_CONTEST" ? path.fighter === actual.winner && (methodCorrect ?? true) : null;
  const signals: UfcCalibrationSignal[] = [
    signal("winner", wError, predictedWinner, actual.winner, winnerCorrect === false ? "Recalibrate overall edge and dominant phase weights." : "Winner side aligned or unavailable."),
    signal("method", mError, predictedMethod, actual.method, mError > 0 ? "Adjust method priors for this profile matchup type." : "Method family aligned or unavailable."),
    signal("roundBand", rError, predictedRoundBand, actualBand, rError > 0 ? "Adjust round leverage and late/early priors." : "Round band aligned or unavailable."),
    ...phase.signals,
    ...(dangerCorrect === false ? [signal("dangerZones", dError, matchup.dangerZones.map((zone) => zone.type).slice(0, 3).join(","), (actual.triggeredDangerZones ?? []).join(","), "Retune danger-zone thresholds against actual trigger evidence.")] : [])
  ].filter((item) => item.error > 0 || item.key === "winner" || item.key === "method" || item.key === "roundBand");
  const adjustments = [
    ...buildAdjustments({ matchup, actual, winnerCorrect, methodMiss: mError, roundMiss: rError, dangerCorrect, confPenalty }),
    ...phase.adjustments
  ];
  const calibrationError = round(clamp(wError * 0.34 + mError * 0.2 + rError * 0.14 + phase.error * 0.16 + dError * 0.08 + confPenalty * 0.08), 2);
  const predictionSummary = `${matchup.overallEdge.summary} Top path: ${path?.fighterName ?? "--"} ${path?.condition ?? "--"}.`;
  const actualSummary = `Actual: winner ${actual.winner}, method ${actual.method}, round ${actual.round ?? "--"}${actual.time ? ` at ${actual.time}` : ""}.`;
  return {
    modelVersion: "ufc-deep-profile-calibration-v1",
    fightId: actual.fightId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    predictionSummary,
    actualSummary,
    correct: { winner: winnerCorrect, methodFamily: methodCorrect, roundBand: roundCorrect, topPath: topPathCorrect, dangerZone: dangerCorrect },
    scores: { calibrationError, winnerError: round(wError, 2), methodError: round(mError, 2), roundError: round(rError, 2), phaseError: phase.error, dangerError: round(dError, 2), confidencePenalty: round(confPenalty, 2) },
    signals,
    adjustments,
    summary: calibrationError >= 35 ? `High calibration miss (${calibrationError}). Prioritize winner/phase/method retune.` : calibrationError >= 16 ? `Moderate calibration miss (${calibrationError}). Apply targeted adjustments.` : `Low calibration miss (${calibrationError}). Keep current weights mostly stable.`
  };
}
