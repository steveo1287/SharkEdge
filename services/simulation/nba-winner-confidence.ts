import type { NbaRotationLock } from "@/services/simulation/nba-rotation-lock";
import type { RealitySimIntel } from "@/services/simulation/reality-sim-engine";

export type NbaWinnerConfidenceGrade = "A" | "B" | "C" | "D" | "F";

export type NbaWinnerConfidence = {
  modelVersion: "nba-winner-confidence-v1";
  pick: "HOME" | "AWAY" | "PASS";
  modelProbability: number;
  marketProbability: number | null;
  calibratedProbability: number;
  confidenceScore: number;
  confidenceGrade: NbaWinnerConfidenceGrade;
  edgePct: number | null;
  noPlay: boolean;
  reasons: string[];
  blockers: string[];
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function gradeFor(score: number): NbaWinnerConfidenceGrade {
  if (score >= 82) return "A";
  if (score >= 70) return "B";
  if (score >= 58) return "C";
  if (score >= 44) return "D";
  return "F";
}

function marketForPick(realityIntel: RealitySimIntel, pick: "HOME" | "AWAY") {
  const home = realityIntel.market?.homeNoVigProbability;
  if (typeof home !== "number" || !Number.isFinite(home)) return null;
  return pick === "HOME" ? home : 1 - home;
}

function learnedProbabilityForPick(realityIntel: RealitySimIntel, pick: "HOME" | "AWAY") {
  const home = realityIntel.learnedAdjustment?.calibratedHomeWinPct;
  if (typeof home !== "number" || !Number.isFinite(home)) return null;
  return pick === "HOME" ? home : 1 - home;
}

function historyProbabilityForPick(realityIntel: RealitySimIntel, pick: "HOME" | "AWAY") {
  const home = realityIntel.historyAdjustment?.tunedHomeWinPct;
  if (typeof home !== "number" || !Number.isFinite(home)) return null;
  return pick === "HOME" ? home : 1 - home;
}

export function buildNbaWinnerConfidence(args: {
  homeWinPct: number;
  awayWinPct: number;
  realityIntel: RealitySimIntel;
  rotationLock: NbaRotationLock;
}): NbaWinnerConfidence {
  const pick: "HOME" | "AWAY" = args.homeWinPct >= args.awayWinPct ? "HOME" : "AWAY";
  const modelProbability = pick === "HOME" ? args.homeWinPct : args.awayWinPct;
  const marketProbability = marketForPick(args.realityIntel, pick);
  const marketAvailable = typeof marketProbability === "number" && Number.isFinite(marketProbability);
  const edgePct = marketAvailable ? round((modelProbability - marketProbability) * 100, 2) : null;
  const learnedPass = Boolean(args.realityIntel.learnedAdjustment?.shouldPass);
  const historyPass = Boolean(args.realityIntel.historyAdjustment?.shouldPass);
  const lineupCertainty = args.rotationLock.lineupCertaintyScore;
  const usageRisk = args.rotationLock.usageRedistributionScore;
  const volatility = args.realityIntel.volatilityIndex;
  const moduleCount = args.realityIntel.sourceHealth?.realModules ?? args.realityIntel.modules.filter((module) => module.status === "real").length;

  const marketShrink = marketAvailable
    ? marketProbability * (lineupCertainty < 0.76 ? 0.5 : 0.38) + modelProbability * (lineupCertainty < 0.76 ? 0.5 : 0.62)
    : modelProbability;
  const learnedProbability = learnedProbabilityForPick(args.realityIntel, pick);
  const historyProbability = historyProbabilityForPick(args.realityIntel, pick);
  const learnedAdjustment = typeof learnedProbability === "number" ? learnedProbability - modelProbability : 0;
  const historyAdjustment = typeof historyProbability === "number" ? historyProbability - (learnedProbability ?? modelProbability) : 0;
  const calibratedProbability = clamp(marketShrink + learnedAdjustment + historyAdjustment, 0.08, 0.92);
  const probabilityEdge = Math.abs(calibratedProbability - 0.5);
  const marketAgreement = marketAvailable ? clamp(1 - Math.abs(modelProbability - marketProbability) / 0.14, 0, 1) : 0.45;
  const sourceScore = clamp(moduleCount / 6, 0, 1);
  const volatilityScore = clamp(1 - (volatility - 0.85) / 1.05, 0, 1);
  const lineupScore = clamp(lineupCertainty - usageRisk * 0.45, 0, 1);
  const calibrationScore = clamp(1 - (learnedPass ? 0.35 : 0) - (historyPass ? 0.35 : 0), 0, 1);
  const edgeScore = clamp(probabilityEdge / 0.18, 0, 1);

  const confidenceScore = round(clamp(
    sourceScore * 20 +
    volatilityScore * 16 +
    lineupScore * 24 +
    calibrationScore * 18 +
    edgeScore * 14 +
    marketAgreement * 8,
    0,
    100
  ), 1);

  const blockers = [
    lineupCertainty < 0.68 ? "low-lineup-certainty" : null,
    usageRisk > 0.34 ? "high-usage-redistribution" : null,
    volatility > 1.72 ? "high-volatility" : null,
    modelProbability - 0.5 < 0.035 ? "thin-probability-edge" : null,
    learnedPass ? "learned-calibrator-pass" : null,
    historyPass ? "graded-history-pass" : null,
    !marketAvailable ? "missing-no-vig-market" : null,
    edgePct != null && edgePct < -1.5 ? "market-disagrees" : null,
    moduleCount < 3 ? "limited-real-data-modules" : null
  ].filter(Boolean) as string[];

  const grade = gradeFor(confidenceScore);
  const noPlay = grade === "F" || grade === "D" || blockers.length >= 3 || (edgePct != null && edgePct < -2.5);
  const reasons = [
    `${pick === "HOME" ? "Home" : "Away"} side has calibrated win probability ${round(calibratedProbability * 100, 1)}%.`,
    marketAvailable ? `No-vig market comparison edge ${edgePct}% for selected side.` : "No-vig market baseline is unavailable; confidence is capped.",
    `Lineup certainty ${round(lineupCertainty * 100, 1)}% with usage redistribution risk ${round(usageRisk * 100, 1)}%.`,
    `Volatility index ${volatility}; real modules ${moduleCount}.`,
    blockers.length ? `Blockers: ${blockers.join(", ")}.` : "No major confidence blockers detected."
  ];

  return {
    modelVersion: "nba-winner-confidence-v1",
    pick: noPlay ? "PASS" : pick,
    modelProbability: round(modelProbability),
    marketProbability: marketAvailable ? round(marketProbability) : null,
    calibratedProbability: round(calibratedProbability),
    confidenceScore,
    confidenceGrade: noPlay && grade !== "F" ? "D" : grade,
    edgePct,
    noPlay,
    reasons,
    blockers
  };
}
