export type GamePickGateDecision = "PLAY" | "LEAN" | "WATCH" | "PASS";
export type GamePickGateSide = "HOME" | "AWAY" | "NONE";

type MarketAnchorLike = {
  homeNoVigProbability: number;
  awayNoVigProbability: number;
  hold: number | null;
  bookCount: number;
  source: string;
} | null;

type CalibrationLike = {
  sample?: number;
  rules?: {
    action?: "TRUST" | "STANDARD" | "CAUTION" | "PASS_ONLY";
    maxModelDeviationFromMarket?: number;
    confidenceScale?: number;
  };
  warnings?: string[];
} | null;

type StarterLockLike = {
  status?: "LOCKED" | "PARTIAL" | "STALE" | "CHANGED" | "UNKNOWN";
  confidence?: number;
  homeLineupLocked?: boolean;
  awayLineupLocked?: boolean;
  openerRisk?: boolean;
  bullpenGameRisk?: boolean;
  staleProbables?: boolean;
} | null;

export type GamePickGate = {
  decision: GamePickGateDecision;
  side: GamePickGateSide;
  edgePct: number | null;
  confidenceScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  stakeTier: "NONE" | "TINY" | "SMALL" | "STANDARD";
  riskFlags: string[];
  drivers: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function calibrationScale(action: string | undefined) {
  if (action === "TRUST") return 1.08;
  if (action === "CAUTION") return 0.78;
  if (action === "PASS_ONLY") return 0.35;
  return 1;
}

function starterScale(lock: StarterLockLike) {
  if (!lock) return 0.72;
  if (lock.status === "LOCKED") return 1;
  if (lock.status === "PARTIAL") return 0.82;
  if (lock.status === "STALE") return 0.58;
  if (lock.status === "CHANGED") return 0.35;
  return 0.5;
}

function riskLevel(flags: string[]) {
  if (flags.some((flag) => ["CALIBRATION_PASS_ONLY", "STARTER_CHANGED", "NO_MARKET_ANCHOR"].includes(flag))) return "HIGH" as const;
  if (flags.some((flag) => ["STALE_PROBABLES", "LINEUPS_UNLOCKED", "OPENER_RISK", "LOW_SAMPLE_CALIBRATION"].includes(flag))) return "MEDIUM" as const;
  return "LOW" as const;
}

export function buildGamePickGate(args: {
  leagueKey: string;
  finalWinProbHome: number;
  marketAnchor: MarketAnchorLike;
  calibration: CalibrationLike;
  starterLock: StarterLockLike;
  powerConfidence: number;
  eloConfidence: number;
  playerLockConfidence: number;
  modelPlusEloWinProbHome: number;
}) : GamePickGate {
  const flags: string[] = [];
  const drivers: string[] = [];
  const calibrationAction = args.calibration?.rules?.action ?? "STANDARD";
  const calibrationSample = args.calibration?.sample ?? 0;
  const starterConfidence = args.leagueKey === "MLB" ? (args.starterLock?.confidence ?? 0.35) : 0.8;
  const starterTrust = args.leagueKey === "MLB" ? starterScale(args.starterLock) : 1;

  if (!args.marketAnchor) flags.push("NO_MARKET_ANCHOR");
  if (calibrationAction === "PASS_ONLY") flags.push("CALIBRATION_PASS_ONLY");
  if (calibrationAction === "CAUTION") flags.push("CALIBRATION_CAUTION");
  if (calibrationSample > 0 && calibrationSample < 80) flags.push("LOW_SAMPLE_CALIBRATION");
  if (args.starterLock?.status === "CHANGED") flags.push("STARTER_CHANGED");
  if (args.starterLock?.status === "STALE" || args.starterLock?.staleProbables) flags.push("STALE_PROBABLES");
  if (args.starterLock && (!args.starterLock.homeLineupLocked || !args.starterLock.awayLineupLocked)) flags.push("LINEUPS_UNLOCKED");
  if (args.starterLock?.openerRisk || args.starterLock?.bullpenGameRisk) flags.push("OPENER_RISK");

  const modelConfidence = clamp(
    args.powerConfidence * 0.22 +
    args.eloConfidence * 0.2 +
    args.playerLockConfidence * 0.14 +
    starterConfidence * 0.22 +
    calibrationScale(calibrationAction) * 0.22,
    0,
    1.15
  );
  const confidenceScore = clamp(modelConfidence * starterTrust, 0, 1);

  let side: GamePickGateSide = "NONE";
  let edgePct: number | null = null;

  if (args.marketAnchor) {
    const homeEdge = args.finalWinProbHome - args.marketAnchor.homeNoVigProbability;
    const awayEdge = (1 - args.finalWinProbHome) - args.marketAnchor.awayNoVigProbability;
    if (homeEdge > awayEdge && homeEdge > 0) {
      side = "HOME";
      edgePct = homeEdge;
    } else if (awayEdge > 0) {
      side = "AWAY";
      edgePct = awayEdge;
    } else {
      edgePct = Math.max(homeEdge, awayEdge);
    }
    drivers.push(`Market edge ${edgePct === null ? "none" : `${round(edgePct * 100, 2)}%`} on ${side}.`);
  } else {
    const rawEdge = Math.abs(args.finalWinProbHome - 0.5);
    edgePct = rawEdge;
    side = args.finalWinProbHome > 0.5 ? "HOME" : "AWAY";
    drivers.push("No market anchor; gate cannot issue full PLAY confidence.");
  }

  const modelMarketGap = Math.abs(args.finalWinProbHome - args.modelPlusEloWinProbHome);
  if (modelMarketGap > 0.1) flags.push("HIGH_MODEL_MARKET_TENSION");

  let decision: GamePickGateDecision = "PASS";
  const edge = edgePct ?? -1;
  const risk = riskLevel(flags);

  if (calibrationAction === "PASS_ONLY" || flags.includes("STARTER_CHANGED")) {
    decision = "PASS";
  } else if (!args.marketAnchor) {
    decision = confidenceScore >= 0.72 && edge >= 0.14 ? "WATCH" : "PASS";
  } else if (edge >= 0.04 && confidenceScore >= 0.78 && risk !== "HIGH") {
    decision = "PLAY";
  } else if (edge >= 0.025 && confidenceScore >= 0.62 && risk !== "HIGH") {
    decision = "LEAN";
  } else if (edge >= 0.01 && confidenceScore >= 0.48) {
    decision = "WATCH";
  }

  const stakeTier = decision === "PLAY" && confidenceScore >= 0.84 && edge >= 0.055
    ? "STANDARD"
    : decision === "PLAY"
      ? "SMALL"
      : decision === "LEAN"
        ? "TINY"
        : "NONE";

  drivers.push(`Gate decision ${decision}; confidence ${round(confidenceScore, 3)}; risk ${risk}.`);
  if (flags.length) drivers.push(`Risk flags: ${flags.join(", ")}.`);

  return {
    decision,
    side,
    edgePct: edgePct === null ? null : round(edgePct, 5),
    confidenceScore: round(confidenceScore, 4),
    riskLevel: risk,
    stakeTier,
    riskFlags: flags,
    drivers
  };
}
