/**
 * Market-Implied Analysis
 *
 * When no team historical data exists for a model simulation, derive probabilities
 * directly from the ingested market odds. This is honest baseline analysis —
 * the market IS the best prior when proprietary model data is unavailable.
 *
 * Clearly labeled "Market Implied" — never presented as a model prediction.
 */

import { prisma } from "@/lib/db/prisma";
import { americanToImplied, stripVig } from "@/lib/odds/index";

function noVig(homeOdds: number | null | undefined, awayOdds: number | null | undefined) {
  if (typeof homeOdds !== "number" || typeof awayOdds !== "number") return null;
  const homeImplied = americanToImplied(homeOdds);
  const awayImplied = americanToImplied(awayOdds);
  if (typeof homeImplied !== "number" || typeof awayImplied !== "number") return null;
  const stripped = stripVig([homeImplied, awayImplied]);
  if (stripped.length !== 2 || stripped[0] == null || stripped[1] == null) return null;
  return { home: stripped[0], away: stripped[1], hold: homeImplied + awayImplied - 1 };
}

function spreadCoverProb(spreadOdds: number | null | undefined, oppositeOdds: number | null | undefined) {
  if (typeof spreadOdds !== "number" || typeof oppositeOdds !== "number") return null;
  const spreadImplied = americanToImplied(spreadOdds);
  const oppositeImplied = americanToImplied(oppositeOdds);
  if (typeof spreadImplied !== "number" || typeof oppositeImplied !== "number") return null;
  const probs = stripVig([spreadImplied, oppositeImplied]);
  const first = probs[0];
  return typeof first === "number" ? first : null;
}

export type MarketImpliedAnalysis = {
  source: "market-implied";
  dataWarning: string;
  moneyline: {
    homeWinProb: number;
    awayWinProb: number;
    hold: number;
    bestHomeOdds: number | null;
    bestAwayOdds: number | null;
  } | null;
  spread: {
    line: number;
    homeCoverProb: number | null;
    awayCoverProb: number | null;
    bestHomeOdds: number | null;
    bestAwayOdds: number | null;
  } | null;
  total: {
    line: number;
    overProb: number | null;
    underProb: number | null;
    bestOverOdds: number | null;
    bestUnderOdds: number | null;
  } | null;
  booksCount: number;
  freshness: "fresh" | "stale" | "unknown";
  updatedAt: string | null;
};

export async function buildMarketImpliedAnalysis(eventId: string): Promise<MarketImpliedAnalysis | null> {
  const markets = await prisma.currentMarketState.findMany({
    where: { eventId },
    include: {
      bestHomeBook: { select: { name: true } },
      bestAwayBook: { select: { name: true } },
      bestOverBook: { select: { name: true } },
      bestUnderBook: { select: { name: true } }
    }
  });

  if (markets.length === 0) return null;

  const moneylineState = markets.find((m) => m.marketType === "moneyline" && m.period === "full_game");
  const spreadState = markets.find((m) => m.marketType === "spread" && m.period === "full_game");
  const totalState = markets.find((m) => m.marketType === "total" && m.period === "full_game");

  // Compute freshness from latest update
  const latestUpdate = markets.reduce<Date | null>((latest, m) => {
    return !latest || m.updatedAt > latest ? m.updatedAt : latest;
  }, null);

  let freshness: MarketImpliedAnalysis["freshness"] = "unknown";
  if (latestUpdate) {
    const ageMinutes = (Date.now() - latestUpdate.getTime()) / (1000 * 60);
    freshness = ageMinutes <= 30 ? "fresh" : "stale";
  }

  // Moneyline analysis
  const mlProbs = moneylineState
    ? noVig(moneylineState.bestHomeOddsAmerican, moneylineState.bestAwayOddsAmerican)
    : null;

  const moneyline = mlProbs && moneylineState
    ? {
        homeWinProb: mlProbs.home,
        awayWinProb: mlProbs.away,
        hold: mlProbs.hold,
        bestHomeOdds: moneylineState.bestHomeOddsAmerican ?? null,
        bestAwayOdds: moneylineState.bestAwayOddsAmerican ?? null
      }
    : null;

  // Spread analysis
  const spread = spreadState?.consensusLineValue != null
    ? {
        line: spreadState.consensusLineValue,
        homeCoverProb: spreadCoverProb(spreadState.bestHomeOddsAmerican, spreadState.bestAwayOddsAmerican),
        awayCoverProb: spreadCoverProb(spreadState.bestAwayOddsAmerican, spreadState.bestHomeOddsAmerican),
        bestHomeOdds: spreadState.bestHomeOddsAmerican ?? null,
        bestAwayOdds: spreadState.bestAwayOddsAmerican ?? null
      }
    : null;

  // Total analysis
  const total = totalState?.consensusLineValue != null
    ? {
        line: totalState.consensusLineValue,
        overProb: spreadCoverProb(totalState.bestOverOddsAmerican, totalState.bestUnderOddsAmerican),
        underProb: spreadCoverProb(totalState.bestUnderOddsAmerican, totalState.bestOverOddsAmerican),
        bestOverOdds: totalState.bestOverOddsAmerican ?? null,
        bestUnderOdds: totalState.bestUnderOddsAmerican ?? null
      }
    : null;

  if (!moneyline && !spread && !total) return null;

  const sportsbooks = new Set<string>();
  markets.forEach((m) => {
    if (m.bestHomeBook?.name) sportsbooks.add(m.bestHomeBook.name);
    if (m.bestAwayBook?.name) sportsbooks.add(m.bestAwayBook.name);
    if (m.bestOverBook?.name) sportsbooks.add(m.bestOverBook.name);
    if (m.bestUnderBook?.name) sportsbooks.add(m.bestUnderBook.name);
  });

  return {
    source: "market-implied",
    dataWarning:
      "Probabilities derived from market consensus odds (no-vig). No proprietary model or historical team stats used. Use as a market baseline only.",
    moneyline,
    spread,
    total,
    booksCount: sportsbooks.size,
    freshness,
    updatedAt: latestUpdate?.toISOString() ?? null
  };
}
