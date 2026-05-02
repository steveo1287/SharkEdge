import type { NbaFourFactorsControl } from "@/services/simulation/nba-four-factors-control";
import type { NbaRotationLock } from "@/services/simulation/nba-rotation-lock";
import type { NbaScheduleContextControl } from "@/services/simulation/nba-schedule-context-control";
import type { NbaWinnerConfidence } from "@/services/simulation/nba-winner-confidence";

export type NbaPregameLockStatus = "LOCKED" | "WATCH" | "WAIT" | "PASS";
export type NbaPregameLockGrade = "A" | "B" | "C" | "D" | "F";
export type NbaMarketMoveFlag = "NO_MARKET" | "MARKET_ABSORBED_EDGE" | "MARKET_SUPPORTS_MODEL" | "STEAM_AGAINST_MODEL" | "EDGE_STABLE";

export type NbaPregameLock = {
  modelVersion: "nba-pregame-lock-v1";
  status: NbaPregameLockStatus;
  lockScore: number;
  lockGrade: NbaPregameLockGrade;
  minutesToTip: number | null;
  lockWindow: {
    opensMinutesBeforeTip: number;
    hardCheckMinutesBeforeTip: number;
    isInLockWindow: boolean;
    isPastHardCheck: boolean;
  };
  marketMoveFlag: NbaMarketMoveFlag;
  confidenceReady: boolean;
  rotationReady: boolean;
  factorsReady: boolean;
  scheduleReady: boolean;
  marketReady: boolean;
  reasons: string[];
  blockers: string[];
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function gradeFor(score: number): NbaPregameLockGrade {
  if (score >= 86) return "A";
  if (score >= 74) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
}

function parseGameTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function minutesToTip(value: string | null | undefined, now = new Date()) {
  const gameTime = parseGameTime(value);
  if (!gameTime) return null;
  return Math.round((gameTime.getTime() - now.getTime()) / 60000);
}

function marketMoveFlag(confidence: NbaWinnerConfidence | null): NbaMarketMoveFlag {
  if (!confidence || confidence.marketProbability == null || confidence.edgePct == null) return "NO_MARKET";
  if (confidence.edgePct < -1.5) return "STEAM_AGAINST_MODEL";
  if (confidence.edgePct >= 2.5) return "MARKET_SUPPORTS_MODEL";
  if (Math.abs(confidence.edgePct) < 0.75) return "MARKET_ABSORBED_EDGE";
  return "EDGE_STABLE";
}

export function buildNbaPregameLock(args: {
  gameTime: string | null;
  rotationLock: NbaRotationLock | null;
  fourFactors: NbaFourFactorsControl | null;
  scheduleContext: NbaScheduleContextControl | null;
  winnerConfidence: NbaWinnerConfidence | null;
  now?: Date;
}): NbaPregameLock {
  const minutes = minutesToTip(args.gameTime, args.now ?? new Date());
  const isInLockWindow = minutes != null ? minutes <= 90 && minutes >= -5 : false;
  const isPastHardCheck = minutes != null ? minutes <= 30 : false;
  const confidence = args.winnerConfidence;
  const rotation = args.rotationLock;
  const factors = args.fourFactors;
  const schedule = args.scheduleContext;
  const marketFlag = marketMoveFlag(confidence);

  const confidenceReady = Boolean(confidence && !confidence.noPlay && (confidence.confidenceGrade === "A" || confidence.confidenceGrade === "B" || confidence.confidenceScore >= 62));
  const rotationReady = Boolean(rotation && rotation.lineupCertaintyScore >= 0.78 && rotation.usageRedistributionScore <= 0.26);
  const factorsReady = Boolean(factors && factors.confidenceScore >= 0.55);
  const scheduleReady = Boolean(schedule && schedule.confidenceScore >= 0.45);
  const marketReady = Boolean(confidence?.marketProbability != null && marketFlag !== "NO_MARKET" && marketFlag !== "STEAM_AGAINST_MODEL");
  const timingReady = minutes == null ? false : isInLockWindow || minutes <= 0;

  const blockers = [
    minutes == null ? "missing-tip-time" : null,
    minutes != null && minutes > 180 ? "too-early-for-pregame-lock" : null,
    !confidence ? "missing-winner-confidence" : null,
    confidence?.noPlay ? "confidence-gate-hold" : null,
    confidence && confidence.confidenceGrade === "D" ? "weak-confidence-grade" : null,
    confidence && confidence.confidenceGrade === "F" ? "failed-confidence-grade" : null,
    ...(confidence?.blockers ?? []).map((blocker) => `confidence-${blocker}`),
    !rotation ? "missing-rotation-lock" : null,
    rotation && rotation.lineupCertaintyScore < 0.68 ? "low-lineup-certainty" : null,
    rotation && rotation.usageRedistributionScore > 0.34 ? "high-usage-redistribution" : null,
    !factors ? "missing-four-factors" : null,
    factors && factors.confidenceScore < 0.45 ? "weak-four-factors-confidence" : null,
    !schedule ? "missing-schedule-context" : null,
    schedule && schedule.confidenceScore < 0.35 ? "weak-schedule-confidence" : null,
    marketFlag === "NO_MARKET" ? "missing-market-baseline" : null,
    marketFlag === "STEAM_AGAINST_MODEL" ? "market-against-model" : null,
    marketFlag === "MARKET_ABSORBED_EDGE" ? "market-absorbed-edge" : null,
    !timingReady ? "outside-lock-window" : null
  ].filter(Boolean) as string[];

  const score = clamp(
    (confidence?.confidenceScore ?? 0) * 0.34 +
    (rotation?.lineupCertaintyScore ?? 0) * 24 +
    (1 - (rotation?.usageRedistributionScore ?? 0.5)) * 12 +
    (factors?.confidenceScore ?? 0) * 12 +
    (schedule?.confidenceScore ?? 0) * 8 +
    (marketReady ? 10 : 0) +
    (isPastHardCheck ? 6 : isInLockWindow ? 3 : 0) -
    blockers.length * 3.5,
    0,
    100
  );

  let status: NbaPregameLockStatus = "WATCH";
  if (blockers.includes("confidence-gate-hold") || blockers.includes("failed-confidence-grade") || blockers.includes("market-against-model")) status = "PASS";
  else if (minutes != null && minutes > 180) status = "WAIT";
  else if (!rotationReady || !timingReady || blockers.includes("market-absorbed-edge")) status = "WAIT";
  else if (score >= 74 && confidenceReady && rotationReady && factorsReady && scheduleReady && marketReady && blockers.length <= 2) status = "LOCKED";
  else if (score < 45 || blockers.length >= 6) status = "PASS";
  else status = "WATCH";

  const grade = gradeFor(score);
  const reasons = [
    `Pregame lock status ${status} with score ${round(score, 1)} and grade ${grade}.`,
    minutes == null ? "Tip time unavailable." : `Minutes to tip: ${minutes}.`,
    confidence ? `Confidence grade ${confidence.confidenceGrade}, score ${confidence.confidenceScore}, selected output ${confidence.pick}.` : "Winner confidence is unavailable.",
    rotation ? `Rotation certainty ${(rotation.lineupCertaintyScore * 100).toFixed(1)}%; usage risk ${(rotation.usageRedistributionScore * 100).toFixed(1)}%.` : "Rotation lock is unavailable.",
    factors ? `Four Factors confidence ${(factors.confidenceScore * 100).toFixed(1)}%; margin adjustment ${factors.projectedMarginAdjustment}.` : "Four Factors control is unavailable.",
    schedule ? `Schedule confidence ${(schedule.confidenceScore * 100).toFixed(1)}%; margin adjustment ${schedule.projectedMarginAdjustment}.` : "Schedule context is unavailable.",
    `Market movement flag: ${marketFlag}.`,
    blockers.length ? `Blockers: ${blockers.join(", ")}.` : "No major pregame lock blockers detected."
  ];

  return {
    modelVersion: "nba-pregame-lock-v1",
    status,
    lockScore: round(score, 1),
    lockGrade: status === "PASS" && grade !== "F" ? "D" : grade,
    minutesToTip: minutes,
    lockWindow: {
      opensMinutesBeforeTip: 90,
      hardCheckMinutesBeforeTip: 30,
      isInLockWindow,
      isPastHardCheck
    },
    marketMoveFlag: marketFlag,
    confidenceReady,
    rotationReady,
    factorsReady,
    scheduleReady,
    marketReady,
    reasons,
    blockers
  };
}
