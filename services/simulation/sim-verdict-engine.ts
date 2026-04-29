/**
 * SharkEdge Simulation Verdict Engine
 *
 * Takes the output of the contextual game sim and player prop sim and
 * produces a structured, human-readable verdict for every market:
 *
 *   - Moneyline: sim win probability vs market implied probability
 *   - Spread:    sim projected spread vs market spread
 *   - Total:     sim projected total vs market total
 *   - Player props: sim mean vs market line with hit probability
 *
 * The verdict includes:
 *   - A STRONG_BET / LEAN / NEUTRAL / FADE / TRAP rating
 *   - An edge score (0-100)
 *   - A plain-English explanation of WHY the bet is good or bad
 *   - The top 3 sim drivers that most influenced the verdict
 *   - A confidence tier based on sample quality and model agreement
 */

import type { ContextualGameSimulationSummary } from "./contextual-game-sim";
import type { PlayerPropSimulationSummary } from "./player-prop-sim";
import { estimateOverUnderProbabilities } from "@/services/modeling/market-distribution";
import {
  calibratePropHitProbability,
  calibrateSpreadDelta,
  calibrateTotalDelta,
  calibrateWinProbability
} from "./sim-calibration";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type VerdictRating = "STRONG_BET" | "LEAN" | "NEUTRAL" | "FADE" | "TRAP";
export type VerdictConfidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
export type VerdictSide = "HOME" | "AWAY" | "OVER" | "UNDER" | "NONE";
export type TrapFlag =
  | "STALE_EDGE"
  | "THIN_MARKET"
  | "ONE_BOOK_OUTLIER"
  | "FAKE_MOVE_RISK"
  | "LOW_CONFIDENCE_FAIR_PRICE"
  | "INJURY_UNCERTAINTY"
  | "HIGH_MARKET_DISAGREEMENT"
  | "LOW_PROVIDER_HEALTH"
  | "MODEL_MARKET_CONFLICT";
export type ActionState = "BET_NOW" | "WAIT" | "WATCH" | "PASS";
export type TimingState = "WINDOW_OPEN" | "WAIT_FOR_PULLBACK" | "WAIT_FOR_CONFIRMATION" | "MONITOR_ONLY" | "PASS_ON_PRICE";

export type MarketVerdict = {
  market: "moneyline" | "spread" | "total" | "player_prop";
  side: VerdictSide;
  rating: VerdictRating;
  edgeScore: number;          // 0-100
  edgePct: number | null;     // EV percentage
  confidence: VerdictConfidence;
  headline: string;           // One-line verdict
  explanation: string;        // 2-3 sentence why
  topDrivers: string[];       // Top 3 sim factors
  simValue: number | null;    // Sim projected value
  marketValue: number | null; // Market line/price
  delta: number | null;       // simValue - marketValue
  trapFlags: TrapFlag[];      // Comprehensive trap detection
  trapExplanation: string | null;
  actionState: ActionState;   // BET_NOW, WAIT, WATCH, PASS
  timingState: TimingState;   // Window, pullback, confirmation, etc.
  kellyPct: number;           // Kelly criterion stake (%)
};

export type GameSimVerdict = {
  generatedAt: string;
  leagueKey: string;
  homeTeam: string;
  awayTeam: string;
  simSummary: {
    projectedScore: string;
    winProbHome: number;
    winProbAway: number;
    projectedTotal: number;
    projectedSpreadHome: number;
    totalStdDev: number;
    p10Total: number;
    p90Total: number;
  };
  verdicts: MarketVerdict[];
  overallVerdict: {
    bestBet: MarketVerdict | null;
    rating: VerdictRating;
    summary: string;
    actionNote: string;
  };
};

export type PlayerPropVerdict = {
  playerId: string;
  playerName: string;
  statKey: string;
  marketLine: number;
  verdict: MarketVerdict;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function erf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return sign * y;
}

function normalCdf(value: number) {
  return 0.5 * (1 + erf(value / Math.sqrt(2)));
}

function estimateSpreadCoverProbabilities(args: {
  meanSpreadHome: number | null | undefined;
  lineHome: number | null | undefined;
  marginStdDev: number | null | undefined;
}) {
  if (
    typeof args.meanSpreadHome !== "number" ||
    typeof args.lineHome !== "number" ||
    typeof args.marginStdDev !== "number" ||
    !Number.isFinite(args.meanSpreadHome) ||
    !Number.isFinite(args.lineHome) ||
    !Number.isFinite(args.marginStdDev) ||
    args.marginStdDev <= 0
  ) {
    return null;
  }

  const roundedLine = Math.round(args.lineHome * 2) / 2;
  const isHalfLine = Math.abs(roundedLine % 1) === 0.5;
  const homeThreshold = -roundedLine;
  const homeCoverProbRaw = 1 - normalCdf((homeThreshold - args.meanSpreadHome) / args.marginStdDev);
  const homeCoverProb = clamp(homeCoverProbRaw, 0.001, 0.999);
  const pushProb = isHalfLine
    ? 0
    : clamp(
        1 - homeCoverProb - normalCdf((homeThreshold - 0.5 - args.meanSpreadHome) / args.marginStdDev),
        0,
        0.08
      );
  const awayCoverProb = clamp(1 - homeCoverProb - pushProb, 0.001, 0.999);

  return {
    homeCoverProb,
    awayCoverProb,
    pushProb
  };
}

function actionStateForSide(side: VerdictSide, edgeScore: number): ActionState {
  if (side === "NONE") {
    return "PASS";
  }
  if (edgeScore >= 72) {
    return "BET_NOW";
  }
  if (edgeScore >= 55) {
    return "WAIT";
  }
  return "WATCH";
}

function americanToImplied(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function impliedToAmerican(prob: number): number {
  if (prob <= 0 || prob >= 1) return -110;
  if (prob >= 0.5) return -Math.round((prob / (1 - prob)) * 100);
  return Math.round(((1 - prob) / prob) * 100);
}

function calculateEV(fairProb: number, offeredOdds: number): number {
  const decimal = offeredOdds > 0 ? offeredOdds / 100 + 1 : 100 / Math.abs(offeredOdds) + 1;
  return round((fairProb * decimal) - 1, 4);
}

function stripVig(probs: [number, number]): [number, number] {
  const total = probs[0] + probs[1];
  if (total <= 0) return [0.5, 0.5];
  return [round(probs[0] / total, 4), round(probs[1] / total, 4)];
}

function noVigProbabilities(leftOdds: number | null, rightOdds: number | null): { left: number; right: number; hold: number } | null {
  if (leftOdds === null || rightOdds === null) return null;
  const left = americanToImplied(leftOdds);
  const right = americanToImplied(rightOdds);
  const hold = left + right - 1;
  const stripped = stripVig([left, right]);
  return { left: stripped[0], right: stripped[1], hold };
}

function kellyFraction(winProb: number, odds: number): number {
  if (!Number.isFinite(winProb) || winProb <= 0 || winProb >= 1) return 0;
  if (!Number.isFinite(odds) || odds === 0) return 0;
  // b = net units won per unit staked; works for both positive (+150 → 1.5) and negative (-110 → 0.909)
  const b = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  const p = winProb;
  const q = 1 - winProb;
  const kelly = (p * b - q) / b;
  return Math.max(0, Math.min(0.25, kelly));
}

function confidenceScore(sampleSize: number, edgeMagnitude: number, hold: number): number {
  const sampleBoost = Math.min(50, (sampleSize / 50) * 50);
  const edgeBoost = Math.min(30, Math.abs(edgeMagnitude) * 100);
  const holdPenalty = Math.min(25, hold * 100);
  return Math.max(0, Math.min(100, sampleBoost + edgeBoost - holdPenalty));
}

function ratingFromEdge(edgeScore: number, ev: number | null): VerdictRating {
  if (edgeScore >= 72 && (ev === null || ev > 0.04)) return "STRONG_BET";
  if (edgeScore >= 55) return "LEAN";
  if (edgeScore >= 38) return "NEUTRAL";
  if (edgeScore >= 20) return "FADE";
  return "FADE";
}

function confidenceFromSample(sampleSize: number, stdDev: number, mean: number): VerdictConfidence {
  const cv = mean > 0 ? stdDev / mean : 1; // Coefficient of variation
  if (sampleSize >= 2000 && cv < 0.15) return "HIGH";
  if (sampleSize >= 800 && cv < 0.25) return "MEDIUM";
  if (sampleSize >= 200) return "LOW";
  return "INSUFFICIENT";
}

function detectTrapFlags(args: {
  rating: VerdictRating;
  delta: number | null;
  drivers: string[];
  confidence: VerdictConfidence;
  edgeScore: number;
  freshness?: number; // minutes
  providerHealth?: boolean; // true = healthy
  marketDisagreement?: number; // 0-100, how much books disagree
}): TrapFlag[] {
  const flags: TrapFlag[] = [];

  // STALE_EDGE: consensus is drifting away from the edge
  if (args.rating === "FADE" && args.delta !== null && Math.abs(args.delta) < 0.5) {
    flags.push("STALE_EDGE");
  }

  // THIN_MARKET: confidence is low and edge is small
  if (args.confidence === "LOW" && args.edgeScore < 40) {
    flags.push("THIN_MARKET");
  }

  // ONE_BOOK_OUTLIER: back-to-back or schedule factors
  if (args.drivers.some((d) => d.toLowerCase().includes("back-to-back"))) {
    flags.push("ONE_BOOK_OUTLIER");
  }

  // FAKE_MOVE_RISK: suspicious model market conflict
  if (args.rating === "TRAP" || args.drivers.some((d) => d.toLowerCase().includes("reverse"))) {
    flags.push("FAKE_MOVE_RISK");
  }

  // LOW_CONFIDENCE_FAIR_PRICE: low confidence tier
  if (args.confidence === "INSUFFICIENT" || args.confidence === "LOW") {
    flags.push("LOW_CONFIDENCE_FAIR_PRICE");
  }

  // INJURY_UNCERTAINTY: injury-related drivers
  if (args.drivers.some((d) => d.toLowerCase().includes("injur"))) {
    flags.push("INJURY_UNCERTAINTY");
  }

  // HIGH_MARKET_DISAGREEMENT: high disagreement between books
  if (args.marketDisagreement !== undefined && args.marketDisagreement > 70) {
    flags.push("HIGH_MARKET_DISAGREEMENT");
  }

  // LOW_PROVIDER_HEALTH: stale data
  if (args.providerHealth === false || (args.freshness !== undefined && args.freshness > 20)) {
    flags.push("LOW_PROVIDER_HEALTH");
  }

  // MODEL_MARKET_CONFLICT: rating is TRAP or confidence is insufficient
  if (args.rating === "TRAP" && args.confidence === "INSUFFICIENT") {
    flags.push("MODEL_MARKET_CONFLICT");
  }

  return [...new Set(flags)]; // Deduplicate
}

function getTrapExplanation(flags: TrapFlag[]): string | null {
  if (flags.length === 0) return null;

  const explanations: Record<TrapFlag, string> = {
    STALE_EDGE: "Market and sim have converged; edge may be fading.",
    THIN_MARKET: "Small edge on low confidence; not worth the risk.",
    ONE_BOOK_OUTLIER: "Edge may depend on one outlier book.",
    FAKE_MOVE_RISK: "Price movement looks artificial; buyer beware.",
    LOW_CONFIDENCE_FAIR_PRICE: "Fair price estimate is unreliable.",
    INJURY_UNCERTAINTY: "Injury status is fluid; model may be stale.",
    HIGH_MARKET_DISAGREEMENT: "Books are far apart; uncertainty is real.",
    LOW_PROVIDER_HEALTH: "Data freshness or coverage is degraded.",
    MODEL_MARKET_CONFLICT: "Model and market are in fundamental disagreement."
  };

  const top = flags.slice(0, 2).map((f) => explanations[f]).join(" ");
  return top || null;
}

function buildExplanation(
  market: MarketVerdict["market"],
  side: VerdictSide,
  rating: VerdictRating,
  delta: number | null,
  drivers: string[],
  homeTeam: string,
  awayTeam: string
): string {
  const teamLabel = side === "HOME" ? homeTeam : side === "AWAY" ? awayTeam : side;
  const deltaStr = delta !== null ? ` (delta ${delta > 0 ? "+" : ""}${round(delta, 2)})` : "";

  if (market === "moneyline") {
    if (rating === "STRONG_BET") {
      return `The sim gives ${teamLabel} a materially higher win probability than the market implies${deltaStr}. ${
        drivers[0] ? `The primary driver is: ${drivers[0]}.` : ""
      } This is a clean edge — the number is wrong relative to what the model sees.`;
    }
    if (rating === "LEAN") {
      return `The sim leans toward ${teamLabel}${deltaStr}, but the edge is not large enough to call it a strong play. ${
        drivers[0] ? `Key factor: ${drivers[0]}.` : ""
      } Worth tracking if the line moves further.`;
    }
    if (rating === "FADE") {
      return `The sim does not support ${teamLabel} at this price${deltaStr}. ${
        drivers[0] ? `The model is penalizing this side because: ${drivers[0]}.` : ""
      } Avoid or look for the other side.`;
    }
    return `The sim and market are close on ${teamLabel}${deltaStr}. No clear edge either way right now.`;
  }

  if (market === "spread") {
    if (rating === "STRONG_BET") {
      return `The sim projects ${teamLabel} to cover by a meaningful margin${deltaStr}. ${
        drivers[0] ? `Primary driver: ${drivers[0]}.` : ""
      } The spread looks beatable based on the model’s projection.`;
    }
    if (rating === "LEAN") {
      return `The sim gives ${teamLabel} a slight edge against the spread${deltaStr}. ${
        drivers[0] ? `Key factor: ${drivers[0]}.` : ""
      } Not a strong play, but the number is in the right direction.`;
    }
    return `The sim does not see a clear spread edge${deltaStr}. The projected margin is too close to the market line to act with conviction.`;
  }

  if (market === "total") {
    const direction = side === "OVER" ? "over" : "under";
    if (rating === "STRONG_BET") {
      return `The sim projects the total to go ${direction} the market line${deltaStr}. ${
        drivers[0] ? `Primary driver: ${drivers[0]}.` : ""
      } The model sees a meaningful gap between projected scoring and the posted number.`;
    }
    if (rating === "LEAN") {
      return `The sim leans ${direction}${deltaStr}, but the gap is modest. ${
        drivers[0] ? `Key factor: ${drivers[0]}.` : ""
      } Worth monitoring for line movement.`;
    }
    return `The sim total is close to the market line${deltaStr}. No strong total edge right now.`;
  }

  if (market === "player_prop") {
    const direction = side === "OVER" ? "over" : "under";
    if (rating === "STRONG_BET") {
      return `The sim projects this player to go ${direction} the market line${deltaStr}. ${
        drivers[0] ? `Primary driver: ${drivers[0]}.` : ""
      } The model sees a real gap between projected output and the posted number.`;
    }
    if (rating === "LEAN") {
      return `The sim leans ${direction} for this prop${deltaStr}. ${
        drivers[0] ? `Key factor: ${drivers[0]}.` : ""
      } Not a strong play, but the number is in the right direction.`;
    }
    return `The sim is close to the market line for this prop${deltaStr}. No clear edge.`;
  }

  return "No verdict available.";
}

// ---------------------------------------------------------------------------
// Moneyline verdict
// ---------------------------------------------------------------------------
export function buildMoneylineVerdict(
  sim: ContextualGameSimulationSummary,
  leagueKey: string,
  homeTeam: string,
  awayTeam: string,
  homeOddsAmerican: number | null,
  awayOddsAmerican: number | null
): MarketVerdict[] {
  const verdicts: MarketVerdict[] = [];
  const noVig = noVigProbabilities(homeOddsAmerican, awayOddsAmerican);

  for (const side of ["HOME", "AWAY"] as const) {
    const rawSimProb = side === "HOME" ? sim.winProbHome : sim.winProbAway;
    const offeredOdds = side === "HOME" ? homeOddsAmerican : awayOddsAmerican;
    const marketImplied = offeredOdds !== null ? americanToImplied(offeredOdds) : noVig ? (side === "HOME" ? noVig.left : noVig.right) : null;
    const calibratedSimProb = calibrateWinProbability({
      leagueKey,
      rawProb: rawSimProb,
      marketImplied,
      ratingsConfidence: sim.ratingsPrior.confidence,
      totalStdDev: sim.distribution.totalStdDev
    });
    const delta = marketImplied !== null ? round(calibratedSimProb - marketImplied, 4) : null;
    const ev = offeredOdds !== null ? calculateEV(calibratedSimProb, offeredOdds) : null;

    const probEdge = delta !== null ? Math.abs(delta) : 0;
    const edgeScore = Math.min(100, Math.round(50 + probEdge * 300));
    const leansSide = delta !== null && delta > 0.02;
    const adjustedEdge = leansSide ? edgeScore : Math.max(0, 100 - edgeScore);

    const rating = leansSide ? ratingFromEdge(adjustedEdge, ev) : (delta !== null && delta < -0.04 ? "FADE" : "NEUTRAL");
    const confidence = confidenceFromSample(sim.distribution.totalStdDev > 0 ? 2500 : 800, sim.distribution.totalStdDev, sim.projectedTotal);

    const trapFlags = detectTrapFlags({
      rating,
      delta,
      drivers: sim.drivers,
      confidence,
      edgeScore: adjustedEdge,
      marketDisagreement: 0
    });
    const trapExplanation = getTrapExplanation(trapFlags);

    const actionState: ActionState =
      leansSide && adjustedEdge >= 72 ? "BET_NOW"
      : leansSide && adjustedEdge >= 55 ? "WAIT"
      : leansSide ? "WATCH"
      : "PASS";

    const timingState: TimingState =
      confidence === "HIGH" ? "WINDOW_OPEN"
      : confidence === "MEDIUM" ? "WAIT_FOR_CONFIRMATION"
      : "MONITOR_ONLY";

    const kelly = offeredOdds !== null ? kellyFraction(calibratedSimProb, offeredOdds) : 0;

    verdicts.push({
      market: "moneyline",
      side,
      rating,
      edgeScore: adjustedEdge,
      edgePct: ev !== null ? round(ev * 100, 2) : null,
      confidence,
      headline: `${side === "HOME" ? homeTeam : awayTeam} ML: sim ${round(calibratedSimProb * 100, 1)}% vs market ${marketImplied !== null ? round(marketImplied * 100, 1) : "?"}%`,
      explanation: buildExplanation("moneyline", side, rating, delta, sim.drivers, homeTeam, awayTeam),
      topDrivers: sim.drivers.slice(0, 3),
      simValue: round(calibratedSimProb, 4),
      marketValue: marketImplied !== null ? round(marketImplied, 4) : null,
      delta,
      trapFlags,
      trapExplanation,
      actionState,
      timingState,
      kellyPct: round(kelly * 100, 1)
    });
  }

  return verdicts;
}

// ---------------------------------------------------------------------------
// Spread verdict
// ---------------------------------------------------------------------------
export function buildSpreadVerdict(
  sim: ContextualGameSimulationSummary,
  leagueKey: string,
  homeTeam: string,
  awayTeam: string,
  marketSpreadHome: number | null,
  homeSpreadOdds: number | null,
  awaySpreadOdds: number | null
): MarketVerdict {
  const simSpread = sim.projectedSpreadHome;
  const rawDelta = marketSpreadHome !== null ? round(simSpread - marketSpreadHome, 2) : null;
  const calibratedDelta = rawDelta !== null
    ? round(
        calibrateSpreadDelta({
          leagueKey,
          rawDelta,
          totalStdDev: sim.distribution.totalStdDev,
          ratingsConfidence: sim.ratingsPrior.confidence
        }),
        2
      )
    : null;
  const absDelta = calibratedDelta !== null ? Math.abs(calibratedDelta) : 0;

  const side: VerdictSide = calibratedDelta !== null && calibratedDelta > 0.5 ? "HOME" : calibratedDelta !== null && calibratedDelta < -0.5 ? "AWAY" : "NONE";
  const calibratedSpread = marketSpreadHome !== null && calibratedDelta !== null ? marketSpreadHome + calibratedDelta : simSpread;
  const marginStdDev = Math.max(
    0.75,
    Math.sqrt(
      (sim.distribution.homeScoreStdDev ?? 0) ** 2 +
      (sim.distribution.awayScoreStdDev ?? 0) ** 2
    )
  );
  const spreadProbabilities = estimateSpreadCoverProbabilities({
    meanSpreadHome: calibratedSpread,
    lineHome: marketSpreadHome,
    marginStdDev
  });
  const relevantProb =
    side === "HOME"
      ? spreadProbabilities?.homeCoverProb ?? null
      : side === "AWAY"
        ? spreadProbabilities?.awayCoverProb ?? null
        : null;
  const relevantOdds = side === "HOME" ? homeSpreadOdds : side === "AWAY" ? awaySpreadOdds : null;
  const ev = relevantProb !== null && relevantOdds !== null
    ? calculateEV(relevantProb, relevantOdds)
    : null;
  const edgeScore = Math.min(100, Math.round(50 + absDelta * 12 + ((relevantProb ?? 0.5) - 0.5) * 35));
  const rating = absDelta >= 3 ? ratingFromEdge(edgeScore, ev) : absDelta >= 1.5 ? "LEAN" : "NEUTRAL";
  const confidence = confidenceFromSample(2500, marginStdDev, Math.abs(sim.projectedSpreadHome));

  const trapFlags = detectTrapFlags({
    rating,
    delta: calibratedDelta,
    drivers: sim.drivers,
    confidence,
    edgeScore,
    marketDisagreement: 0
  });
  const trapExplanation = getTrapExplanation(trapFlags);

  const actionState: ActionState = actionStateForSide(side, edgeScore);

  const timingState: TimingState =
    absDelta >= 3 ? "WINDOW_OPEN"
    : absDelta >= 1.5 ? "WAIT_FOR_PULLBACK"
    : "MONITOR_ONLY";

  const kelly = relevantOdds !== null && relevantProb !== null ? kellyFraction(relevantProb, relevantOdds) : 0;

  return {
    market: "spread",
    side,
    rating,
    edgeScore,
    edgePct: ev !== null ? round(ev * 100, 2) : null,
    confidence,
    headline: `Spread: sim ${calibratedSpread > 0 ? "+" : ""}${round(calibratedSpread, 1)} vs market ${marketSpreadHome !== null ? (marketSpreadHome > 0 ? "+" : "") + round(marketSpreadHome, 1) : "?"}`,
    explanation: buildExplanation("spread", side, rating, calibratedDelta, sim.drivers, homeTeam, awayTeam),
    topDrivers: sim.drivers.slice(0, 3),
    simValue: round(calibratedSpread, 2),
    marketValue: marketSpreadHome,
    delta: calibratedDelta,
    trapFlags,
    trapExplanation,
    actionState,
    timingState,
    kellyPct: round(kelly * 100, 1)
  };
}

// ---------------------------------------------------------------------------
// Total verdict
// ---------------------------------------------------------------------------
export function buildTotalVerdict(
  sim: ContextualGameSimulationSummary,
  leagueKey: string,
  marketTotal: number | null,
  overOdds: number | null,
  underOdds: number | null
): MarketVerdict {
  const simTotal = sim.projectedTotal;
  const rawDelta = marketTotal !== null ? round(simTotal - marketTotal, 2) : null;
  const calibratedDelta = rawDelta !== null
    ? round(
        calibrateTotalDelta({
          leagueKey,
          rawDelta,
          totalStdDev: sim.distribution.totalStdDev,
          ratingsConfidence: sim.ratingsPrior.confidence
        }),
        2
      )
    : null;
  const calibratedTotal = marketTotal !== null && calibratedDelta !== null ? marketTotal + calibratedDelta : simTotal;
  const absDelta = calibratedDelta !== null ? Math.abs(calibratedDelta) : 0;
  const side: VerdictSide = calibratedDelta !== null && calibratedDelta > 0.5 ? "OVER" : calibratedDelta !== null && calibratedDelta < -0.5 ? "UNDER" : "NONE";

  const p10 = sim.distribution.p10Total;
  const p90 = sim.distribution.p90Total;
  const marketInRange = marketTotal !== null && marketTotal >= p10 && marketTotal <= p90;
  const totalProbabilities = estimateOverUnderProbabilities({
    mean: calibratedTotal,
    line: marketTotal,
    stdDev: sim.distribution.totalStdDev
  });
  const relevantProb =
    side === "OVER"
      ? totalProbabilities?.overProb ?? null
      : side === "UNDER"
        ? totalProbabilities?.underProb ?? null
        : null;
  const relevantOdds = side === "OVER" ? overOdds : side === "UNDER" ? underOdds : null;
  const edgeScore = Math.min(100, Math.round(50 + absDelta * 10 + ((relevantProb ?? 0.5) - 0.5) * 35));
  const ev = relevantProb !== null && relevantOdds !== null
    ? calculateEV(relevantProb, relevantOdds)
    : null;
  const rating = absDelta >= 4 ? ratingFromEdge(edgeScore, ev) : absDelta >= 2 ? "LEAN" : "NEUTRAL";
  const confidence = confidenceFromSample(2500, sim.distribution.totalStdDev, simTotal);

  const trapFlags = detectTrapFlags({
    rating,
    delta: calibratedDelta,
    drivers: sim.drivers,
    confidence,
    edgeScore,
    marketDisagreement: 0
  });
  const trapExplanation = getTrapExplanation(trapFlags);

  const actionState: ActionState = actionStateForSide(side, edgeScore);

  const timingState: TimingState =
    absDelta >= 4 ? "WINDOW_OPEN"
    : absDelta >= 2 ? "WAIT_FOR_PULLBACK"
    : "MONITOR_ONLY";

  const kelly = relevantOdds !== null && relevantProb !== null ? kellyFraction(relevantProb, relevantOdds) : 0;

  const rangeNote = marketInRange
    ? ` Market line sits inside the sim’s P10–P90 range (${round(p10, 1)}–${round(p90, 1)}), so variance is real.`
    : ` Market line is outside the sim’s P10–P90 range (${round(p10, 1)}–${round(p90, 1)}).`;

  return {
    market: "total",
    side,
    rating,
    edgeScore,
    edgePct: ev !== null ? round(ev * 100, 2) : null,
    confidence,
    headline: `Total: sim ${round(calibratedTotal, 1)} vs market ${marketTotal !== null ? round(marketTotal, 1) : "?"}`,
    explanation: buildExplanation("total", side, rating, calibratedDelta, sim.drivers, "", "") + rangeNote,
    topDrivers: sim.drivers.slice(0, 3),
    simValue: round(calibratedTotal, 2),
    marketValue: marketTotal,
    delta: calibratedDelta,
    trapFlags,
    trapExplanation,
    actionState,
    timingState,
    kellyPct: round(kelly * 100, 1)
  };
}

// ---------------------------------------------------------------------------
// Player prop verdict
// ---------------------------------------------------------------------------
export function buildPlayerPropVerdict(
  sim: PlayerPropSimulationSummary,
  playerId: string,
  playerName: string,
  statKey: string,
  marketLine: number,
  overOdds: number | null,
  underOdds: number | null,
  leagueKey = "NBA"
): PlayerPropVerdict {
  const simMean = sim.meanValue;
  const delta = round(simMean - marketLine, 3);
  const side: VerdictSide = delta > 0.3 ? "OVER" : delta < -0.3 ? "UNDER" : "NONE";

  const rawOverProb = sim.hitProbOver[String(marketLine)] ?? null;
  const rawUnderProb = sim.hitProbUnder[String(marketLine)] ?? null;
  const relevantRawProb = side === "OVER" ? rawOverProb : side === "UNDER" ? rawUnderProb : null;
  const relevantOdds = side === "OVER" ? overOdds : side === "UNDER" ? underOdds : null;
  const marketImplied = relevantOdds !== null ? americanToImplied(relevantOdds) : null;
  const relevantProb = relevantRawProb !== null
    ? calibratePropHitProbability({
        leagueKey,
        rawProb: relevantRawProb,
        marketImplied,
        ratingsConfidence: null,
        totalStdDev: null
      })
    : null;

  const ev = relevantProb !== null && relevantOdds !== null
    ? calculateEV(relevantProb, relevantOdds)
    : null;

  const absDelta = Math.abs(delta);
  const edgeScore = Math.min(100, Math.round(50 + sim.contextualEdgeScore * 2 + absDelta * 8));
  const confidence = sim.priorWeight > 0.05 ? "MEDIUM" : "LOW";
  const rating = absDelta >= 2 && (ev === null || ev > 0.02)
    ? ratingFromEdge(edgeScore, ev)
    : absDelta >= 1 ? "LEAN" : "NEUTRAL";

  const trapFlags = detectTrapFlags({
    rating,
    delta,
    drivers: sim.drivers,
    confidence,
    edgeScore,
    marketDisagreement: 0
  });
  const trapExplanation = getTrapExplanation(trapFlags);

  const actionState: ActionState = actionStateForSide(side, edgeScore);

  const timingState: TimingState = confidence === "MEDIUM" ? "WAIT_FOR_CONFIRMATION" : "MONITOR_ONLY";
  const kelly = relevantOdds !== null && relevantProb !== null ? kellyFraction(relevantProb, relevantOdds) : 0;

  const verdict: MarketVerdict = {
    market: "player_prop",
    side,
    rating,
    edgeScore,
    edgePct: ev !== null ? round(ev * 100, 2) : null,
    confidence,
    headline: `${playerName} ${statKey.replace("player_", "")}: sim ${round(simMean, 1)} vs line ${marketLine}`,
    explanation: buildExplanation("player_prop", side, rating, delta, sim.drivers, "", ""),
    topDrivers: sim.drivers.slice(0, 3),
    simValue: round(simMean, 3),
    marketValue: marketLine,
    delta,
    trapFlags,
    trapExplanation,
    actionState,
    timingState,
    kellyPct: round(kelly * 100, 1)
  };

  return { playerId, playerName, statKey, marketLine, verdict };
}

// ---------------------------------------------------------------------------
// Full game verdict assembler
// ---------------------------------------------------------------------------
export function buildGameSimVerdict(args: {
  sim: ContextualGameSimulationSummary;
  leagueKey: string;
  homeTeam: string;
  awayTeam: string;
  marketTotal: number | null;
  marketSpreadHome: number | null;
  homeMoneylineOdds: number | null;
  awayMoneylineOdds: number | null;
  overOdds: number | null;
  underOdds: number | null;
  homeSpreadOdds: number | null;
  awaySpreadOdds: number | null;
}): GameSimVerdict {
  const { sim, leagueKey, homeTeam, awayTeam } = args;

  const moneylineVerdicts = buildMoneylineVerdict(
    sim, leagueKey, homeTeam, awayTeam,
    args.homeMoneylineOdds, args.awayMoneylineOdds
  );
  const spreadVerdict = buildSpreadVerdict(
    sim, leagueKey, homeTeam, awayTeam,
    args.marketSpreadHome, args.homeSpreadOdds, args.awaySpreadOdds
  );
  const totalVerdict = buildTotalVerdict(sim, leagueKey, args.marketTotal, args.overOdds, args.underOdds);

  const allVerdicts = [...moneylineVerdicts, spreadVerdict, totalVerdict];

  const actionable = allVerdicts
    .filter((v) => v.rating === "STRONG_BET" || v.rating === "LEAN")
    .sort((a, b) => b.edgeScore - a.edgeScore);
  const bestBet = actionable[0] ?? null;

  const overallRating: VerdictRating =
    actionable.some((v) => v.rating === "STRONG_BET") ? "STRONG_BET"
    : actionable.length >= 2 ? "LEAN"
    : actionable.length === 1 ? "LEAN"
    : "NEUTRAL";

  const summary = bestBet
    ? `Best play: ${bestBet.headline}. ${bestBet.explanation.split(".")[0]}.`
    : `No strong edge on this game right now. Sim and market are aligned.`;

  const actionNote = bestBet
    ? bestBet.rating === "STRONG_BET"
      ? "This is a model-backed edge. Execute at the best available price."
      : "Lean only. Monitor for line movement before committing."
    : "Pass or wait for a better number.";

  return {
    generatedAt: new Date().toISOString(),
    leagueKey,
    homeTeam,
    awayTeam,
    simSummary: {
      projectedScore: `${awayTeam} ${round(sim.projectedAwayScore, 1)} · ${homeTeam} ${round(sim.projectedHomeScore, 1)}`,
      winProbHome: sim.winProbHome,
      winProbAway: sim.winProbAway,
      projectedTotal: round(sim.projectedTotal, 1),
      projectedSpreadHome: round(sim.projectedSpreadHome, 1),
      totalStdDev: sim.distribution.totalStdDev,
      p10Total: sim.distribution.p10Total,
      p90Total: sim.distribution.p90Total
    },
    verdicts: allVerdicts,
    overallVerdict: { bestBet, rating: overallRating, summary, actionNote }
  };
}
