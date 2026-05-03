/**
 * NBA-safe simulation verdict engine.
 *
 * This module keeps the public sim-verdict-engine API, but tightens the math
 * and risk policy used by production imports through the tsconfig path alias.
 */

import type { ContextualGameSimulationSummary } from "./contextual-game-sim";
import type { PlayerPropSimulationSummary } from "./player-prop-sim";
import {
  calibratePropHitProbability,
  calibrateSpreadDelta,
  calibrateTotalDelta,
  calibrateWinProbability
} from "./sim-calibration";

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
  edgeScore: number;
  edgePct: number | null;
  confidence: VerdictConfidence;
  headline: string;
  explanation: string;
  topDrivers: string[];
  simValue: number | null;
  marketValue: number | null;
  delta: number | null;
  trapFlags: TrapFlag[];
  trapExplanation: string | null;
  actionState: ActionState;
  timingState: TimingState;
  kellyPct: number;
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

type GameVerdictArgs = {
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
};

type RiskGateInput = {
  leagueKey: string;
  confidence: VerdictConfidence;
  rating: VerdictRating;
  side: VerdictSide;
  drivers: string[];
  hasMarketBaseline: boolean;
  modelMarketDelta?: number | null;
};

const MAX_KELLY_FRACTION = 0.005;

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

function americanToImplied(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function stripVig(probs: [number, number]): [number, number] {
  const total = probs[0] + probs[1];
  if (!Number.isFinite(total) || total <= 0) return [0.5, 0.5];
  return [probs[0] / total, probs[1] / total];
}

function noVigProbabilities(leftOdds: number | null, rightOdds: number | null): { left: number; right: number; hold: number } | null {
  if (leftOdds === null || rightOdds === null) return null;
  const left = americanToImplied(leftOdds);
  const right = americanToImplied(rightOdds);
  const [strippedLeft, strippedRight] = stripVig([left, right]);
  return { left: strippedLeft, right: strippedRight, hold: left + right - 1 };
}

function calculateEV(fairProb: number, offeredOdds: number): number {
  const decimal = offeredOdds > 0 ? offeredOdds / 100 + 1 : 100 / Math.abs(offeredOdds) + 1;
  return round(fairProb * decimal - 1, 4);
}

function kellyFraction(winProb: number, odds: number, enabled = true): number {
  if (!enabled) return 0;
  if (!Number.isFinite(winProb) || winProb <= 0 || winProb >= 1) return 0;
  if (!Number.isFinite(odds) || odds === 0) return 0;
  const b = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  const rawKelly = (winProb * b - (1 - winProb)) / b;
  const quarterKelly = rawKelly * 0.25;
  return Math.max(0, Math.min(MAX_KELLY_FRACTION, quarterKelly));
}

function confidenceFromSample(sampleSize: number, stdDev: number, mean: number): VerdictConfidence {
  const cv = mean > 0 ? Math.abs(stdDev / mean) : 1;
  if (sampleSize >= 2000 && cv < 0.15) return "HIGH";
  if (sampleSize >= 800 && cv < 0.25) return "MEDIUM";
  if (sampleSize >= 200) return "LOW";
  return "INSUFFICIENT";
}

function getSimSampleSize(sim: ContextualGameSimulationSummary) {
  const record = sim as ContextualGameSimulationSummary & {
    sampleSize?: number;
    simulationRuns?: number;
    samples?: number;
    historicalCalibrationCount?: number;
  };
  return record.sampleSize ?? record.simulationRuns ?? record.samples ?? record.historicalCalibrationCount ?? 0;
}

function getPropSampleSize(sim: PlayerPropSimulationSummary) {
  return sim.sampleSize ?? sim.minutesSampleSize ?? 0;
}

function hasDriver(drivers: string[], patterns: RegExp[]) {
  const text = drivers.join(" | ").toLowerCase();
  return patterns.some((pattern) => pattern.test(text));
}

function riskGate(args: RiskGateInput) {
  const blockers: string[] = [];
  const trapFlags: TrapFlag[] = [];
  const isNba = args.leagueKey.toUpperCase() === "NBA";

  if (args.confidence === "LOW" || args.confidence === "INSUFFICIENT") {
    blockers.push("low/insufficient confidence sample");
    trapFlags.push("LOW_CONFIDENCE_FAIR_PRICE");
  }

  if (!args.hasMarketBaseline) {
    blockers.push("no no-vig market baseline");
    trapFlags.push("THIN_MARKET");
  }

  if (isNba && hasDriver(args.drivers, [/injur/, /questionable/, /game\s*time/, /minutes restriction/, /star.*uncertain/])) {
    blockers.push("injury or star-availability uncertainty");
    trapFlags.push("INJURY_UNCERTAINTY");
  }

  if (isNba && hasDriver(args.drivers, [/stale/, /source health/, /provider degraded/, /low provider/, /feed.*degraded/])) {
    blockers.push("stale or degraded source health");
    trapFlags.push("LOW_PROVIDER_HEALTH");
  }

  if (isNba && hasDriver(args.drivers, [/uncalibrated/, /calibration red/, /bucket underperform/, /bucket fail/])) {
    blockers.push("uncalibrated or underperforming calibration bucket");
    trapFlags.push("MODEL_MARKET_CONFLICT");
  }

  const hasLineupReason = hasDriver(args.drivers, [/injur/, /lineup/, /rotation/, /availability/, /minutes/]);
  if (isNba && typeof args.modelMarketDelta === "number" && Math.abs(args.modelMarketDelta) > 6 && !hasLineupReason) {
    blockers.push("excessive model-market conflict without lineup reason");
    trapFlags.push("HIGH_MARKET_DISAGREEMENT", "MODEL_MARKET_CONFLICT");
  }

  const blocked = blockers.length > 0;
  const rating: VerdictRating = blocked && args.rating === "STRONG_BET" ? "LEAN" : args.rating;
  const actionState: ActionState = args.side === "NONE" ? "PASS" : blocked ? "WATCH" : actionStateForSide(args.side, rating);
  const timingState: TimingState = blocked ? "MONITOR_ONLY" : rating === "STRONG_BET" ? "WINDOW_OPEN" : rating === "LEAN" ? "WAIT_FOR_CONFIRMATION" : "MONITOR_ONLY";

  return {
    blocked,
    blockers,
    rating,
    actionState,
    timingState,
    trapFlags: Array.from(new Set(trapFlags))
  };
}

function actionStateForSide(side: VerdictSide, ratingOrScore: VerdictRating | number): ActionState {
  if (side === "NONE") return "PASS";
  if (typeof ratingOrScore === "string") {
    if (ratingOrScore === "STRONG_BET") return "BET_NOW";
    if (ratingOrScore === "LEAN") return "WAIT";
    return "WATCH";
  }
  if (ratingOrScore >= 72) return "BET_NOW";
  if (ratingOrScore >= 55) return "WAIT";
  return "WATCH";
}

function ratingFromEdge(edgeScore: number, ev: number | null, confidence: VerdictConfidence): VerdictRating {
  if (confidence === "LOW" || confidence === "INSUFFICIENT") {
    if (edgeScore >= 55 && (ev === null || ev > 0.02)) return "LEAN";
    return edgeScore >= 38 ? "NEUTRAL" : "FADE";
  }
  if (edgeScore >= 72 && (ev === null || ev > 0.04)) return "STRONG_BET";
  if (edgeScore >= 55) return "LEAN";
  if (edgeScore >= 38) return "NEUTRAL";
  return "FADE";
}

function trapExplanation(flags: TrapFlag[], blockers: string[]) {
  if (blockers.length) return blockers.slice(0, 3).join("; ");
  if (flags.includes("INJURY_UNCERTAINTY")) return "Injury status is fluid; model may be stale.";
  if (flags.includes("LOW_CONFIDENCE_FAIR_PRICE")) return "Fair price estimate is unreliable.";
  if (flags.includes("HIGH_MARKET_DISAGREEMENT")) return "Books or model/market are far apart; uncertainty is elevated.";
  if (flags.includes("LOW_PROVIDER_HEALTH")) return "Data freshness or coverage is degraded.";
  return null;
}

function spreadCoverProbabilities(args: { meanHomeMargin: number | null; homeLine: number | null; marginStdDev: number }) {
  if (args.meanHomeMargin === null || args.homeLine === null || !Number.isFinite(args.marginStdDev) || args.marginStdDev <= 0) {
    return null;
  }
  const threshold = -args.homeLine;
  const homeCoverProb = clamp(1 - normalCdf((threshold - args.meanHomeMargin) / args.marginStdDev), 0.001, 0.999);
  return { homeCoverProb, awayCoverProb: clamp(1 - homeCoverProb, 0.001, 0.999) };
}

function overUnderProbabilities(args: { mean: number; line: number | null; stdDev: number }) {
  if (args.line === null || !Number.isFinite(args.stdDev) || args.stdDev <= 0) return null;
  const underProb = clamp(normalCdf((args.line - args.mean) / args.stdDev), 0.001, 0.999);
  return { overProb: clamp(1 - underProb, 0.001, 0.999), underProb };
}

function marketExplanation(args: {
  market: MarketVerdict["market"];
  side: VerdictSide;
  rating: VerdictRating;
  delta: number | null;
  drivers: string[];
  homeTeam: string;
  awayTeam: string;
  blockers: string[];
}) {
  const team = args.side === "HOME" ? args.homeTeam : args.side === "AWAY" ? args.awayTeam : args.side;
  const deltaText = args.delta === null ? "" : ` Delta ${args.delta >= 0 ? "+" : ""}${round(args.delta, 2)}.`;
  const blockerText = args.blockers.length ? ` Blockers: ${args.blockers.slice(0, 3).join("; ")}.` : "";
  const driverText = args.drivers[0] ? ` Primary driver: ${args.drivers[0]}.` : "";
  if (args.side === "NONE") return `No actionable ${args.market} edge.${deltaText}${blockerText}`;
  return `${args.market} leans ${team} with ${args.rating.toLowerCase().replace("_", " ")} conviction.${deltaText}${driverText}${blockerText}`;
}

export function buildMoneylineVerdict(
  sim: ContextualGameSimulationSummary,
  leagueKey: string,
  homeTeam: string,
  awayTeam: string,
  homeOddsAmerican: number | null,
  awayOddsAmerican: number | null
): MarketVerdict[] {
  const noVig = noVigProbabilities(homeOddsAmerican, awayOddsAmerican);
  const confidence = confidenceFromSample(getSimSampleSize(sim), sim.distribution.totalStdDev, sim.projectedTotal);

  return (["HOME", "AWAY"] as const).map((side) => {
    const rawSimProb = side === "HOME" ? sim.winProbHome : sim.winProbAway;
    const offeredOdds = side === "HOME" ? homeOddsAmerican : awayOddsAmerican;
    const marketImplied = noVig
      ? side === "HOME" ? noVig.left : noVig.right
      : offeredOdds !== null ? americanToImplied(offeredOdds) : null;
    const calibratedSimProb = calibrateWinProbability({
      leagueKey,
      rawProb: rawSimProb,
      marketImplied,
      ratingsConfidence: sim.ratingsPrior.confidence,
      totalStdDev: sim.distribution.totalStdDev
    });
    const delta = marketImplied !== null ? round(calibratedSimProb - marketImplied, 4) : null;
    const ev = offeredOdds !== null ? calculateEV(calibratedSimProb, offeredOdds) : null;
    const probEdge = delta !== null ? Math.max(0, delta) : 0;
    const edgeScore = Math.min(100, Math.round(50 + probEdge * 300));
    const sideHasEdge = delta !== null && delta > 0.02;
    const baseRating = sideHasEdge ? ratingFromEdge(edgeScore, ev, confidence) : delta !== null && delta < -0.04 ? "FADE" : "NEUTRAL";
    const gate = riskGate({
      leagueKey,
      confidence,
      rating: baseRating,
      side: sideHasEdge ? side : "NONE",
      drivers: sim.drivers,
      hasMarketBaseline: noVig !== null,
      modelMarketDelta: delta === null ? null : delta * 100
    });
    const kelly = offeredOdds !== null ? kellyFraction(calibratedSimProb, offeredOdds, !gate.blocked) : 0;
    const trapFlags = gate.trapFlags;

    return {
      market: "moneyline",
      side: sideHasEdge ? side : "NONE",
      rating: gate.rating,
      edgeScore,
      edgePct: ev !== null ? round(ev * 100, 2) : null,
      confidence,
      headline: `${side === "HOME" ? homeTeam : awayTeam} ML: sim ${round(calibratedSimProb * 100, 1)}% vs no-vig market ${marketImplied !== null ? round(marketImplied * 100, 1) : "?"}%`,
      explanation: marketExplanation({ market: "moneyline", side: sideHasEdge ? side : "NONE", rating: gate.rating, delta, drivers: sim.drivers, homeTeam, awayTeam, blockers: gate.blockers }),
      topDrivers: sim.drivers.slice(0, 3),
      simValue: round(calibratedSimProb, 4),
      marketValue: marketImplied !== null ? round(marketImplied, 4) : null,
      delta,
      trapFlags,
      trapExplanation: trapExplanation(trapFlags, gate.blockers),
      actionState: gate.actionState,
      timingState: gate.timingState,
      kellyPct: round(kelly * 100, 2)
    } satisfies MarketVerdict;
  });
}

export function buildSpreadVerdict(
  sim: ContextualGameSimulationSummary,
  leagueKey: string,
  homeTeam: string,
  awayTeam: string,
  marketSpreadHome: number | null,
  homeSpreadOdds: number | null,
  awaySpreadOdds: number | null
): MarketVerdict {
  const projectedHomeMargin = sim.projectedSpreadHome;
  const homeCoverThreshold = marketSpreadHome !== null ? -marketSpreadHome : null;
  const rawDelta = homeCoverThreshold !== null ? round(projectedHomeMargin - homeCoverThreshold, 2) : null;
  const calibratedDelta = rawDelta !== null
    ? round(calibrateSpreadDelta({ leagueKey, rawDelta, totalStdDev: sim.distribution.totalStdDev, ratingsConfidence: sim.ratingsPrior.confidence }), 2)
    : null;
  const calibratedHomeMargin = homeCoverThreshold !== null && calibratedDelta !== null ? homeCoverThreshold + calibratedDelta : projectedHomeMargin;
  const side: VerdictSide = calibratedDelta !== null && calibratedDelta > 0.75 ? "HOME" : calibratedDelta !== null && calibratedDelta < -0.75 ? "AWAY" : "NONE";
  const marginStdDev = Math.max(0.75, sim.distribution.spreadStdDev || Math.sqrt((sim.distribution.homeScoreStdDev ?? 0) ** 2 + (sim.distribution.awayScoreStdDev ?? 0) ** 2));
  const probs = spreadCoverProbabilities({ meanHomeMargin: calibratedHomeMargin, homeLine: marketSpreadHome, marginStdDev });
  const relevantProb = side === "HOME" ? probs?.homeCoverProb ?? null : side === "AWAY" ? probs?.awayCoverProb ?? null : null;
  const relevantOdds = side === "HOME" ? homeSpreadOdds : side === "AWAY" ? awaySpreadOdds : null;
  const ev = relevantProb !== null && relevantOdds !== null ? calculateEV(relevantProb, relevantOdds) : null;
  const confidence = confidenceFromSample(getSimSampleSize(sim), marginStdDev, Math.max(1, Math.abs(projectedHomeMargin)));
  const absDelta = Math.abs(calibratedDelta ?? 0);
  const edgeScore = Math.min(100, Math.round(50 + absDelta * 10 + ((relevantProb ?? 0.5) - 0.5) * 35));
  const baseRating = side === "NONE" ? "NEUTRAL" : ratingFromEdge(edgeScore, ev, confidence);
  const gate = riskGate({ leagueKey, confidence, rating: baseRating, side, drivers: sim.drivers, hasMarketBaseline: marketSpreadHome !== null && homeSpreadOdds !== null && awaySpreadOdds !== null, modelMarketDelta: rawDelta });
  const kelly = relevantOdds !== null && relevantProb !== null ? kellyFraction(relevantProb, relevantOdds, !gate.blocked) : 0;

  return {
    market: "spread",
    side,
    rating: gate.rating,
    edgeScore,
    edgePct: ev !== null ? round(ev * 100, 2) : null,
    confidence,
    headline: `Spread: projected home margin ${projectedHomeMargin >= 0 ? "+" : ""}${round(projectedHomeMargin, 1)} vs home line ${marketSpreadHome !== null ? (marketSpreadHome > 0 ? "+" : "") + round(marketSpreadHome, 1) : "?"}`,
    explanation: marketExplanation({ market: "spread", side, rating: gate.rating, delta: calibratedDelta, drivers: sim.drivers, homeTeam, awayTeam, blockers: gate.blockers }),
    topDrivers: sim.drivers.slice(0, 3),
    simValue: round(projectedHomeMargin, 2),
    marketValue: marketSpreadHome,
    delta: calibratedDelta,
    trapFlags: gate.trapFlags,
    trapExplanation: trapExplanation(gate.trapFlags, gate.blockers),
    actionState: gate.actionState,
    timingState: gate.timingState,
    kellyPct: round(kelly * 100, 2)
  };
}

export function buildTotalVerdict(
  sim: ContextualGameSimulationSummary,
  leagueKey: string,
  marketTotal: number | null,
  overOdds: number | null,
  underOdds: number | null
): MarketVerdict {
  const rawDelta = marketTotal !== null ? round(sim.projectedTotal - marketTotal, 2) : null;
  const calibratedDelta = rawDelta !== null
    ? round(calibrateTotalDelta({ leagueKey, rawDelta, totalStdDev: sim.distribution.totalStdDev, ratingsConfidence: sim.ratingsPrior.confidence }), 2)
    : null;
  const calibratedTotal = marketTotal !== null && calibratedDelta !== null ? marketTotal + calibratedDelta : sim.projectedTotal;
  const side: VerdictSide = calibratedDelta !== null && calibratedDelta > 0.75 ? "OVER" : calibratedDelta !== null && calibratedDelta < -0.75 ? "UNDER" : "NONE";
  const probs = overUnderProbabilities({ mean: calibratedTotal, line: marketTotal, stdDev: sim.distribution.totalStdDev });
  const relevantProb = side === "OVER" ? probs?.overProb ?? null : side === "UNDER" ? probs?.underProb ?? null : null;
  const relevantOdds = side === "OVER" ? overOdds : side === "UNDER" ? underOdds : null;
  const ev = relevantProb !== null && relevantOdds !== null ? calculateEV(relevantProb, relevantOdds) : null;
  const confidence = confidenceFromSample(getSimSampleSize(sim), sim.distribution.totalStdDev, sim.projectedTotal);
  const absDelta = Math.abs(calibratedDelta ?? 0);
  const edgeScore = Math.min(100, Math.round(50 + absDelta * 8 + ((relevantProb ?? 0.5) - 0.5) * 35));
  const baseRating = side === "NONE" ? "NEUTRAL" : ratingFromEdge(edgeScore, ev, confidence);
  const gate = riskGate({ leagueKey, confidence, rating: baseRating, side, drivers: sim.drivers, hasMarketBaseline: marketTotal !== null && overOdds !== null && underOdds !== null, modelMarketDelta: rawDelta });
  const kelly = relevantOdds !== null && relevantProb !== null ? kellyFraction(relevantProb, relevantOdds, !gate.blocked) : 0;

  return {
    market: "total",
    side,
    rating: gate.rating,
    edgeScore,
    edgePct: ev !== null ? round(ev * 100, 2) : null,
    confidence,
    headline: `Total: sim ${round(calibratedTotal, 1)} vs market ${marketTotal !== null ? round(marketTotal, 1) : "?"}`,
    explanation: marketExplanation({ market: "total", side, rating: gate.rating, delta: calibratedDelta, drivers: sim.drivers, homeTeam: "", awayTeam: "", blockers: gate.blockers }),
    topDrivers: sim.drivers.slice(0, 3),
    simValue: round(calibratedTotal, 2),
    marketValue: marketTotal,
    delta: calibratedDelta,
    trapFlags: gate.trapFlags,
    trapExplanation: trapExplanation(gate.trapFlags, gate.blockers),
    actionState: gate.actionState,
    timingState: gate.timingState,
    kellyPct: round(kelly * 100, 2)
  };
}

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
  const delta = round(sim.meanValue - marketLine, 3);
  const side: VerdictSide = delta > 0.3 ? "OVER" : delta < -0.3 ? "UNDER" : "NONE";
  const rawOverProb = sim.hitProbOver[String(marketLine)] ?? null;
  const rawUnderProb = sim.hitProbUnder[String(marketLine)] ?? null;
  const relevantRawProb = side === "OVER" ? rawOverProb : side === "UNDER" ? rawUnderProb : null;
  const relevantOdds = side === "OVER" ? overOdds : side === "UNDER" ? underOdds : null;
  const marketImplied = relevantOdds !== null ? americanToImplied(relevantOdds) : null;
  const relevantProb = relevantRawProb !== null
    ? calibratePropHitProbability({ leagueKey, rawProb: relevantRawProb, marketImplied, ratingsConfidence: sim.roleConfidence ?? null, totalStdDev: sim.stdDev })
    : null;
  const ev = relevantProb !== null && relevantOdds !== null ? calculateEV(relevantProb, relevantOdds) : null;
  const confidence = confidenceFromSample(getPropSampleSize(sim), sim.stdDev, Math.max(1, sim.meanValue));
  const edgeScore = Math.min(100, Math.round(50 + Math.abs(delta) * 8 + ((relevantProb ?? 0.5) - 0.5) * 35));
  const baseRating = side === "NONE" ? "NEUTRAL" : ratingFromEdge(edgeScore, ev, confidence);
  const gate = riskGate({ leagueKey, confidence, rating: baseRating, side, drivers: sim.drivers, hasMarketBaseline: overOdds !== null && underOdds !== null, modelMarketDelta: delta });
  const kelly = relevantOdds !== null && relevantProb !== null ? kellyFraction(relevantProb, relevantOdds, !gate.blocked) : 0;

  return {
    playerId,
    playerName,
    statKey,
    marketLine,
    verdict: {
      market: "player_prop",
      side,
      rating: gate.rating,
      edgeScore,
      edgePct: ev !== null ? round(ev * 100, 2) : null,
      confidence,
      headline: `${playerName} ${statKey}: sim ${round(sim.meanValue, 2)} vs line ${marketLine}`,
      explanation: marketExplanation({ market: "player_prop", side, rating: gate.rating, delta, drivers: sim.drivers, homeTeam: "", awayTeam: "", blockers: gate.blockers }),
      topDrivers: sim.drivers.slice(0, 3),
      simValue: round(sim.meanValue, 3),
      marketValue: marketLine,
      delta,
      trapFlags: gate.trapFlags,
      trapExplanation: trapExplanation(gate.trapFlags, gate.blockers),
      actionState: gate.actionState,
      timingState: gate.timingState,
      kellyPct: round(kelly * 100, 2)
    }
  };
}

export function buildGameSimVerdict(args: GameVerdictArgs): GameSimVerdict {
  const moneyline = buildMoneylineVerdict(args.sim, args.leagueKey, args.homeTeam, args.awayTeam, args.homeMoneylineOdds, args.awayMoneylineOdds);
  const spread = buildSpreadVerdict(args.sim, args.leagueKey, args.homeTeam, args.awayTeam, args.marketSpreadHome, args.homeSpreadOdds, args.awaySpreadOdds);
  const total = buildTotalVerdict(args.sim, args.leagueKey, args.marketTotal, args.overOdds, args.underOdds);
  const verdicts = [...moneyline, spread, total];
  const actionable = verdicts.filter((v) => v.side !== "NONE" && v.actionState !== "PASS");
  const bestBet = actionable.sort((a, b) => b.edgeScore - a.edgeScore || (b.edgePct ?? -999) - (a.edgePct ?? -999))[0] ?? null;
  const rating = bestBet?.rating ?? "NEUTRAL";
  return {
    generatedAt: new Date().toISOString(),
    leagueKey: args.leagueKey,
    homeTeam: args.homeTeam,
    awayTeam: args.awayTeam,
    simSummary: {
      projectedScore: `${args.awayTeam} ${round(args.sim.projectedAwayScore, 1)} - ${args.homeTeam} ${round(args.sim.projectedHomeScore, 1)}`,
      winProbHome: args.sim.winProbHome,
      winProbAway: args.sim.winProbAway,
      projectedTotal: args.sim.projectedTotal,
      projectedSpreadHome: args.sim.projectedSpreadHome,
      totalStdDev: args.sim.distribution.totalStdDev,
      p10Total: args.sim.distribution.p10Total,
      p90Total: args.sim.distribution.p90Total
    },
    verdicts,
    overallVerdict: {
      bestBet,
      rating,
      summary: bestBet ? `${bestBet.market} ${bestBet.side} is the top simulated lean.` : "No actionable simulated edge after NBA safety gates.",
      actionNote: bestBet?.actionState === "BET_NOW" ? "Window open only if source health and calibration are green." : "Monitor only until market, injury, source, and calibration gates clear."
    }
  };
}

export const __simVerdictTestHooks = {
  americanToImplied,
  noVigProbabilities,
  kellyFraction,
  spreadCoverProbabilities
};
