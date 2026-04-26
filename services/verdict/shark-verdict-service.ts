/**
 * Shark Verdict Service
 *
 * Produces a unified "Shark Verdict" for any event that has been ingested,
 * regardless of whether a Monte Carlo simulation has run yet.
 *
 * Signal priority (highest → lowest confidence):
 *   1. Monte Carlo sim + market odds → GameSimVerdict (full engine)
 *   2. No-vig market consensus → EdgeSignal records (edge engine fallback)
 *
 * The verdict is always clearly labeled with its source so users know exactly
 * what they're reading. No fake precision.
 */

import { prisma } from "@/lib/db/prisma";
import type { GameSimVerdict, MarketVerdict, VerdictRating, ActionState } from "@/services/simulation/sim-verdict-engine";

export type SharkSignalSource = "model+market" | "market-only";

export type SharkEdgeSignal = {
  marketType: "moneyline" | "spread" | "total";
  side: string;
  evPercent: number;
  modelProb: number;
  noVigProb: number | null;
  offeredOddsAmerican: number;
  fairOddsAmerican: number | null;
  edgeScore: number | null;
  kellyHalf: number | null;
  flags: string[];
  sportsbookName: string | null;
  lineValue: number | null;
};

export type SharkMarketSignal = {
  marketType: "moneyline" | "spread" | "total";
  bestSide: "home" | "away" | "over" | "under" | null;
  bestEv: number | null;
  bestEdgeScore: number | null;
  bestKelly: number | null;
  fairOdds: number | null;
  offeredOdds: number | null;
  lineValue: number | null;
  rating: VerdictRating;
  actionState: ActionState;
  headline: string;
  signals: SharkEdgeSignal[];
};

export type SharkVerdict = {
  source: SharkSignalSource;
  sourceLabel: string;
  homeTeam: string;
  awayTeam: string;
  leagueKey: string;
  bestBet: {
    marketType: "moneyline" | "spread" | "total";
    side: string;
    sideLabel: string;
    ev: number;
    kelly: number;
    offeredOdds: number;
    rating: VerdictRating;
    actionState: ActionState;
    headline: string;
  } | null;
  markets: SharkMarketSignal[];
  // Populated only when Monte Carlo sim ran
  simSummary: GameSimVerdict["simSummary"] | null;
  simDrivers: string[];
  // Full verdicts from sim engine (populated when source is model+market)
  simVerdicts: MarketVerdict[];
  overallRating: VerdictRating;
  summary: string;
  booksCount: number;
  freshness: "fresh" | "stale" | "unknown";
  updatedAt: string | null;
};

function normMarketType(raw: string): "moneyline" | "spread" | "total" | null {
  const lower = raw.toLowerCase();
  if (lower === "moneyline") return "moneyline";
  if (lower === "spread") return "spread";
  if (lower === "total") return "total";
  return null;
}

function ratingFromEv(ev: number): VerdictRating {
  if (ev >= 6) return "STRONG_BET";
  if (ev >= 2.5) return "LEAN";
  if (ev >= -1) return "NEUTRAL";
  if (ev >= -5) return "FADE";
  return "TRAP";
}

function actionFromEdge(edgeScore: number | null, ev: number): ActionState {
  if (edgeScore !== null && edgeScore >= 72) return "BET_NOW";
  if (ev >= 4) return "BET_NOW";
  if (ev >= 2) return "WAIT";
  if (ev >= 0) return "WATCH";
  return "PASS";
}

function headlineFromSignal(sig: SharkEdgeSignal, homeTeam: string, awayTeam: string): string {
  const team = sig.side === "home" ? homeTeam : sig.side === "away" ? awayTeam : null;
  const isNoModel = sig.flags.includes("NO_MODEL");
  const prefix = isNoModel ? "Market consensus" : "Model";

  if (sig.marketType === "moneyline") {
    return `${prefix} prices ${team ?? sig.side} at ${(sig.modelProb * 100).toFixed(1)}% — market at ${(sig.noVigProb ?? sig.modelProb * 100 / 100) * 100 > 0 ? ((sig.noVigProb ?? sig.modelProb) * 100).toFixed(1) : "—"}%`;
  }
  if (sig.marketType === "total") {
    const lineStr = sig.lineValue != null ? ` ${sig.lineValue}` : "";
    return `${prefix} sees ${sig.side}${lineStr} as ${(sig.modelProb * 100).toFixed(1)}% to hit`;
  }
  if (sig.marketType === "spread") {
    const lineStr = sig.lineValue != null ? ` ${sig.lineValue > 0 ? "+" : ""}${sig.lineValue}` : "";
    return `${prefix} prices ${team ?? sig.side}${lineStr} at ${(sig.modelProb * 100).toFixed(1)}% to cover`;
  }
  return `EV ${sig.evPercent > 0 ? "+" : ""}${sig.evPercent.toFixed(1)}%`;
}

function sideLabel(marketType: string, side: string, homeTeam: string, awayTeam: string): string {
  if (marketType === "moneyline" || marketType === "spread") {
    if (side === "home") return homeTeam;
    if (side === "away") return awayTeam;
  }
  if (marketType === "total") {
    if (side === "over") return "Over";
    if (side === "under") return "Under";
  }
  return side.charAt(0).toUpperCase() + side.slice(1);
}

function overallRatingFromMarkets(markets: SharkMarketSignal[]): VerdictRating {
  const ratings = markets.map((m) => m.rating);
  if (ratings.includes("STRONG_BET")) return "STRONG_BET";
  if (ratings.includes("LEAN")) return "LEAN";
  if (ratings.every((r) => r === "NEUTRAL")) return "NEUTRAL";
  if (ratings.includes("FADE")) return "FADE";
  return "NEUTRAL";
}

function buildSummary(
  verdict: Pick<SharkVerdict, "source" | "bestBet" | "overallRating" | "homeTeam" | "awayTeam">
): string {
  const { source, bestBet, overallRating, homeTeam, awayTeam } = verdict;
  const sourceNote = source === "market-only" ? "Market consensus (no model)" : "Monte Carlo + market";

  if (!bestBet || overallRating === "NEUTRAL") {
    return `${sourceNote}: no material edge detected across moneyline, spread, or total. Market appears fairly priced.`;
  }
  const label = `${bestBet.sideLabel} ${bestBet.marketType}`;
  const evStr = `+${bestBet.ev.toFixed(1)}% EV`;
  return `${sourceNote}: ${label} shows ${evStr}. ${overallRating === "STRONG_BET" ? "Strong signal." : "Lean signal — size accordingly."}`;
}

export async function buildSharkVerdictFromEdges(
  eventId: string,
  homeTeam: string,
  awayTeam: string,
  leagueKey: string
): Promise<SharkVerdict | null> {
  const signals = await prisma.edgeSignal.findMany({
    where: { eventId, isActive: true },
    include: { sportsbook: { select: { name: true } } },
    orderBy: { edgeScore: "desc" }
  });

  if (signals.length === 0) return null;

  const latestAt = signals.reduce<Date | null>((latest, s) => {
    return !latest || s.createdAt > latest ? s.createdAt : latest;
  }, null);
  const ageMinutes = latestAt ? (Date.now() - latestAt.getTime()) / 60000 : null;
  const freshness: SharkVerdict["freshness"] = ageMinutes == null ? "unknown" : ageMinutes <= 30 ? "fresh" : "stale";

  const booksSet = new Set<string>();
  signals.forEach((s) => {
    if (s.sportsbook?.name) booksSet.add(s.sportsbook.name);
  });

  // Normalize edge signals
  const normalized: SharkEdgeSignal[] = signals
    .map((s) => {
      const mt = normMarketType(s.marketType);
      if (!mt) return null;
      const flags = Array.isArray(s.flagsJson) ? (s.flagsJson as string[]) : [];
      return {
        marketType: mt,
        side: s.side,
        evPercent: s.evPercent,
        modelProb: s.modelProb,
        noVigProb: s.noVigProb ?? null,
        offeredOddsAmerican: s.offeredOddsAmerican,
        fairOddsAmerican: s.fairOddsAmerican ?? null,
        edgeScore: s.edgeScore ?? null,
        kellyHalf: s.kellyHalf ?? null,
        flags,
        sportsbookName: s.sportsbook?.name ?? null,
        lineValue: s.lineValue ?? null
      } satisfies SharkEdgeSignal;
    })
    .filter(Boolean) as SharkEdgeSignal[];

  // Group by market, pick best signal per side
  const byMarket = new Map<string, SharkEdgeSignal[]>();
  for (const sig of normalized) {
    const key = sig.marketType;
    if (!byMarket.has(key)) byMarket.set(key, []);
    byMarket.get(key)!.push(sig);
  }

  const markets: SharkMarketSignal[] = [];
  for (const [marketType, sigs] of byMarket.entries()) {
    const mt = marketType as "moneyline" | "spread" | "total";
    const best = [...sigs].sort((a, b) => (b.edgeScore ?? b.evPercent) - (a.edgeScore ?? a.evPercent))[0];
    if (!best) continue;

    const rating = ratingFromEv(best.evPercent);
    const action = actionFromEdge(best.edgeScore, best.evPercent);
    const headline = headlineFromSignal(best, homeTeam, awayTeam);

    markets.push({
      marketType: mt,
      bestSide: best.side as "home" | "away" | "over" | "under",
      bestEv: best.evPercent,
      bestEdgeScore: best.edgeScore,
      bestKelly: best.kellyHalf,
      fairOdds: best.fairOddsAmerican,
      offeredOdds: best.offeredOddsAmerican,
      lineValue: best.lineValue,
      rating,
      actionState: action,
      headline,
      signals: sigs
    });
  }

  if (markets.length === 0) return null;

  // Best bet: highest EV with LEAN or better
  const playableMarkets = markets.filter((m) =>
    m.bestEv !== null && m.bestEv >= 2 && (m.rating === "STRONG_BET" || m.rating === "LEAN")
  );
  const topMarket = [...playableMarkets].sort((a, b) => (b.bestEv ?? 0) - (a.bestEv ?? 0))[0] ?? null;

  const bestBet = topMarket
    ? {
        marketType: topMarket.marketType,
        side: topMarket.bestSide ?? "none",
        sideLabel: sideLabel(topMarket.marketType, topMarket.bestSide ?? "", homeTeam, awayTeam),
        ev: topMarket.bestEv ?? 0,
        kelly: topMarket.bestKelly ?? 0,
        offeredOdds: topMarket.offeredOdds ?? 0,
        rating: topMarket.rating,
        actionState: topMarket.actionState,
        headline: topMarket.headline
      }
    : null;

  const overallRating = overallRatingFromMarkets(markets);

  const partial: Pick<SharkVerdict, "source" | "bestBet" | "overallRating" | "homeTeam" | "awayTeam"> = {
    source: "market-only",
    bestBet,
    overallRating,
    homeTeam,
    awayTeam
  };

  return {
    source: "market-only",
    sourceLabel: "No-vig market consensus — no proprietary model data available",
    homeTeam,
    awayTeam,
    leagueKey,
    bestBet,
    markets,
    simSummary: null,
    simDrivers: [],
    simVerdicts: [],
    overallRating,
    summary: buildSummary(partial),
    booksCount: booksSet.size,
    freshness,
    updatedAt: latestAt?.toISOString() ?? null
  };
}

export function buildSharkVerdictFromSim(
  gameSimVerdict: GameSimVerdict,
  leagueKey: string,
  edgeSignals: SharkEdgeSignal[] = []
): SharkVerdict {
  const { homeTeam, awayTeam, simSummary, verdicts, overallVerdict } = gameSimVerdict;

  const markets: SharkMarketSignal[] = verdicts.map((v) => {
    const side =
      v.side === "HOME" ? "home"
      : v.side === "AWAY" ? "away"
      : v.side === "OVER" ? "over"
      : v.side === "UNDER" ? "under"
      : "none";

    // Find matching edge signals for context
    const matchingEdgeSignals = edgeSignals.filter(
      (es) => es.marketType === v.market && es.side === side
    );

    return {
      marketType: v.market as "moneyline" | "spread" | "total",
      bestSide: side as "home" | "away" | "over" | "under",
      bestEv: v.edgePct,
      bestEdgeScore: v.edgeScore,
      bestKelly: v.kellyPct,
      fairOdds: null,
      offeredOdds: v.marketValue as number | null,
      lineValue: v.marketValue as number | null,
      rating: v.rating,
      actionState: v.actionState,
      headline: v.headline,
      signals: matchingEdgeSignals
    };
  });

  const bestBetVerdict = overallVerdict.bestBet;
  const bestBet = bestBetVerdict
    ? {
        marketType: bestBetVerdict.market as "moneyline" | "spread" | "total",
        side: bestBetVerdict.side.toLowerCase(),
        sideLabel: sideLabel(bestBetVerdict.market, bestBetVerdict.side.toLowerCase(), homeTeam, awayTeam),
        ev: bestBetVerdict.edgePct ?? 0,
        kelly: bestBetVerdict.kellyPct,
        offeredOdds: (bestBetVerdict.marketValue as number | null) ?? 0,
        rating: bestBetVerdict.rating,
        actionState: bestBetVerdict.actionState,
        headline: bestBetVerdict.headline
      }
    : null;

  const drivers = [
    ...gameSimVerdict.simSummary.projectedScore ? [`Projected score: ${gameSimVerdict.simSummary.projectedScore}`] : [],
  ];

  return {
    source: "model+market",
    sourceLabel: "Monte Carlo simulation + market odds consensus",
    homeTeam,
    awayTeam,
    leagueKey,
    bestBet,
    markets,
    simSummary,
    simDrivers: drivers,
    simVerdicts: verdicts,
    overallRating: overallVerdict.rating,
    summary: overallVerdict.summary,
    booksCount: edgeSignals.length > 0 ? new Set(edgeSignals.map((s) => s.sportsbookName)).size : 1,
    freshness: "fresh",
    updatedAt: gameSimVerdict.generatedAt
  };
}

export async function buildSharkVerdict(
  eventId: string,
  homeTeam: string,
  awayTeam: string,
  leagueKey: string,
  gameSimVerdict: GameSimVerdict | null
): Promise<SharkVerdict | null> {
  // Always fetch edge signals — they add context even when sim exists
  const rawSignals = await prisma.edgeSignal.findMany({
    where: { eventId, isActive: true },
    include: { sportsbook: { select: { name: true } } },
    orderBy: { edgeScore: "desc" }
  }).catch(() => []);

  const edgeSignals: SharkEdgeSignal[] = rawSignals
    .map((s) => {
      const mt = normMarketType(s.marketType);
      if (!mt) return null;
      const flags = Array.isArray(s.flagsJson) ? (s.flagsJson as string[]) : [];
      return {
        marketType: mt,
        side: s.side,
        evPercent: s.evPercent,
        modelProb: s.modelProb,
        noVigProb: s.noVigProb ?? null,
        offeredOddsAmerican: s.offeredOddsAmerican,
        fairOddsAmerican: s.fairOddsAmerican ?? null,
        edgeScore: s.edgeScore ?? null,
        kellyHalf: s.kellyHalf ?? null,
        flags,
        sportsbookName: s.sportsbook?.name ?? null,
        lineValue: s.lineValue ?? null
      } satisfies SharkEdgeSignal;
    })
    .filter(Boolean) as SharkEdgeSignal[];

  if (gameSimVerdict) {
    return buildSharkVerdictFromSim(gameSimVerdict, leagueKey, edgeSignals);
  }

  if (edgeSignals.length === 0) return null;

  return buildSharkVerdictFromEdges(eventId, homeTeam, awayTeam, leagueKey);
}
