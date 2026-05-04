import type { NbaFourFactorsControl } from "@/services/simulation/nba-four-factors-control";
import type { NbaPregameLock } from "@/services/simulation/nba-pregame-lock";
import type { NbaRotationLock } from "@/services/simulation/nba-rotation-lock";
import type { NbaScheduleContextControl } from "@/services/simulation/nba-schedule-context-control";
import type { NbaWinnerConfidence } from "@/services/simulation/nba-winner-confidence";

export type NbaInputQualityStatus = "GREEN" | "YELLOW" | "RED";
export type NbaInputQualityAction = "TRUST" | "WATCH" | "PASS";

export type NbaInputQualityGate = {
  modelVersion: "nba-input-quality-gate-v1";
  status: NbaInputQualityStatus;
  action: NbaInputQualityAction;
  score: number;
  trusted: boolean;
  readyChecks: {
    realityIntel: boolean;
    guardedProjection: boolean;
    marketBaseline: boolean;
    rotation: boolean;
    fourFactors: boolean;
    schedule: boolean;
    pregameLock: boolean;
  };
  sourceMap: {
    rotation: string | null;
    fourFactors: string | null;
    schedule: string | null;
    market: string;
    projectionPolicy: string;
  };
  blockers: string[];
  warnings: string[];
  reasons: string[];
};

type NbaInputQualityProjection = {
  realityIntel?: unknown | null;
  nbaIntel?: {
    noBet?: boolean | null;
    tier?: string | null;
    reasons?: string[] | null;
  } | null;
};

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function projectionPolicyBlocksAction(projection: NbaInputQualityProjection) {
  return Boolean(projection.nbaIntel?.noBet || projection.nbaIntel?.tier === "pass");
}

function projectionPolicyReasons(projection: NbaInputQualityProjection) {
  return (projection.nbaIntel?.reasons ?? []).filter((reason) =>
    /NBA health policy|accuracy guard|failed|required|capped|forced PASS/i.test(reason)
  ).slice(0, 5);
}

function hasNoRealRows(source: string | null | undefined) {
  return !source || /placeholder|fallback|league-average/i.test(source);
}

export function buildNbaInputQualityGate(args: {
  projection: NbaInputQualityProjection;
  rotationLock: NbaRotationLock | null;
  fourFactors: NbaFourFactorsControl | null;
  scheduleContext: NbaScheduleContextControl | null;
  winnerConfidence: NbaWinnerConfidence | null;
  pregameLock: NbaPregameLock | null;
}): NbaInputQualityGate {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const policyReasons = projectionPolicyReasons(args.projection);
  const projectionBlocked = projectionPolicyBlocksAction(args.projection);
  const rotation = args.rotationLock;
  const factors = args.fourFactors;
  const schedule = args.scheduleContext;
  const confidence = args.winnerConfidence;
  const pregameLock = args.pregameLock;

  if (!args.projection.realityIntel) blockers.push("missing-reality-intel");
  if (projectionBlocked) blockers.push("guarded-projection-policy-pass");
  if (!rotation) blockers.push("missing-rotation-lock");
  if (!factors) blockers.push("missing-four-factors");
  if (!schedule) warnings.push("missing-schedule-context");
  if (!confidence) blockers.push("missing-winner-confidence");
  if (!pregameLock) warnings.push("missing-pregame-lock");

  if (rotation) {
    if (hasNoRealRows(rotation.source)) blockers.push("rotation-using-placeholder-data");
    if (rotation.lineupCertaintyScore < 0.68) blockers.push("low-lineup-certainty");
    else if (rotation.lineupCertaintyScore < 0.78) warnings.push("lineup-certainty-watch");
    if (rotation.usageRedistributionScore > 0.34) blockers.push("high-usage-redistribution");
    else if (rotation.usageRedistributionScore > 0.26) warnings.push("usage-redistribution-watch");
    warnings.push(...rotation.warnings.slice(0, 4).map((warning) => `rotation: ${warning}`));
  }

  if (factors) {
    if (hasNoRealRows(factors.source)) blockers.push("four-factors-using-fallback-data");
    if (factors.confidenceScore < 0.45) blockers.push("weak-four-factors-confidence");
    else if (factors.confidenceScore < 0.55) warnings.push("four-factors-confidence-watch");
    warnings.push(...factors.warnings.slice(0, 4).map((warning) => `four-factors: ${warning}`));
  }

  if (schedule) {
    if (schedule.confidenceScore < 0.35) blockers.push("weak-schedule-confidence");
    else if (schedule.confidenceScore < 0.45) warnings.push("schedule-confidence-watch");
    warnings.push(...schedule.warnings.slice(0, 3).map((warning) => `schedule: ${warning}`));
  }

  if (confidence) {
    if (confidence.marketProbability == null) blockers.push("missing-no-vig-market-baseline");
    if (confidence.noPlay) blockers.push("winner-confidence-no-play");
    if (confidence.confidenceGrade === "F") blockers.push("failed-winner-confidence");
    else if (confidence.confidenceGrade === "D") warnings.push("weak-winner-confidence");
    blockers.push(...confidence.blockers.filter((blocker) => /missing|limited|market-disagrees|lineup|volatility|pass/i.test(blocker)).slice(0, 4).map((blocker) => `confidence-${blocker}`));
  }

  if (pregameLock) {
    if (pregameLock.status === "PASS") blockers.push("pregame-lock-pass");
    if (pregameLock.status === "WAIT") warnings.push("pregame-lock-wait");
    if (!pregameLock.marketReady) warnings.push("pregame-market-not-ready");
    if (!pregameLock.rotationReady) warnings.push("pregame-rotation-not-ready");
  }

  if (policyReasons.length) warnings.push(...policyReasons.map((reason) => `projection-policy: ${reason}`));

  const uniqueBlockers = Array.from(new Set(blockers));
  const uniqueWarnings = Array.from(new Set(warnings));
  const score = Math.max(0, Math.min(100,
    100 -
    uniqueBlockers.length * 11 -
    uniqueWarnings.length * 3 -
    (projectionBlocked ? 18 : 0) -
    (!args.projection.realityIntel ? 18 : 0)
  ));
  const status: NbaInputQualityStatus = uniqueBlockers.length >= 4 || score < 45 ? "RED" : uniqueBlockers.length || uniqueWarnings.length >= 4 || score < 72 ? "YELLOW" : "GREEN";
  const action: NbaInputQualityAction = status === "GREEN" ? "TRUST" : status === "YELLOW" ? "WATCH" : "PASS";

  return {
    modelVersion: "nba-input-quality-gate-v1",
    status,
    action,
    score: round(score),
    trusted: action === "TRUST",
    readyChecks: {
      realityIntel: Boolean(args.projection.realityIntel),
      guardedProjection: !projectionBlocked,
      marketBaseline: Boolean(confidence?.marketProbability != null),
      rotation: Boolean(rotation && !hasNoRealRows(rotation.source) && rotation.lineupCertaintyScore >= 0.68 && rotation.usageRedistributionScore <= 0.34),
      fourFactors: Boolean(factors && !hasNoRealRows(factors.source) && factors.confidenceScore >= 0.45),
      schedule: Boolean(schedule && schedule.confidenceScore >= 0.35),
      pregameLock: Boolean(pregameLock && pregameLock.status !== "PASS")
    },
    sourceMap: {
      rotation: rotation?.source ?? null,
      fourFactors: factors?.source ?? null,
      schedule: schedule?.source ?? null,
      market: confidence?.marketProbability == null ? "missing" : "no-vig-market-baseline",
      projectionPolicy: projectionBlocked ? "blocked" : "clear"
    },
    blockers: uniqueBlockers.slice(0, 12),
    warnings: uniqueWarnings.slice(0, 12),
    reasons: [
      `NBA input quality is ${status} with score ${round(score)} and action ${action}.`,
      `Ready checks: ${Object.entries({
        realityIntel: Boolean(args.projection.realityIntel),
        guardedProjection: !projectionBlocked,
        marketBaseline: Boolean(confidence?.marketProbability != null),
        rotation: Boolean(rotation && !hasNoRealRows(rotation.source)),
        fourFactors: Boolean(factors && !hasNoRealRows(factors.source)),
        schedule: Boolean(schedule),
        pregameLock: Boolean(pregameLock && pregameLock.status !== "PASS")
      }).filter(([, ready]) => ready).map(([key]) => key).join(", ") || "none"}.`,
      uniqueBlockers.length ? `Blockers: ${uniqueBlockers.slice(0, 6).join(", ")}.` : "No hard input-quality blockers detected.",
      uniqueWarnings.length ? `Warnings: ${uniqueWarnings.slice(0, 6).join(", ")}.` : "No major input-quality warnings detected."
    ]
  };
}
