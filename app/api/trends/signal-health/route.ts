import { NextResponse } from "next/server";

import type { LeagueKey } from "@/lib/types/domain";
import { buildTrendSignals } from "@/services/trends/trends-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function readLeague(value: string | null): LeagueKey | "ALL" {
  const normalized = value?.trim().toUpperCase();
  if (
    normalized === "NBA" ||
    normalized === "MLB" ||
    normalized === "NHL" ||
    normalized === "NFL" ||
    normalized === "NCAAF" ||
    normalized === "NCAAB" ||
    normalized === "UFC" ||
    normalized === "BOXING"
  ) {
    return normalized as LeagueKey;
  }
  return "ALL";
}

function countBy<T extends string>(items: T[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const league = readLeague(url.searchParams.get("league"));
    const includeHidden = url.searchParams.get("hidden") === "true";
    const includeResearch = url.searchParams.get("research") === "true";
    const payload = await buildTrendSignals({ league, includeHidden, includeResearch });
    const signals = payload.signals;
    const priced = signals.filter((signal) => signal.marketQuality.currentOddsAmerican != null || signal.currentOddsAmerican != null);
    const actionable = signals.filter((signal) => signal.quality.actionability === "ACTIONABLE");
    const watchlist = signals.filter((signal) => signal.quality.actionability === "WATCHLIST");
    const gameIds = new Set(signals.map((signal) => signal.gameId).filter(Boolean));
    const pricedGameIds = new Set(priced.map((signal) => signal.gameId).filter(Boolean));

    return NextResponse.json({
      ok: signals.length > 0,
      generatedAt: new Date().toISOString(),
      league,
      source: payload.counts.source,
      cacheStale: payload.counts.cacheStale,
      cacheHits: payload.counts.cacheHits,
      counts: {
        totalVisible: signals.length,
        totalRaw: payload.counts.totalRaw,
        hidden: payload.counts.hidden,
        live: payload.counts.live,
        research: payload.counts.research,
        gamesCovered: gameIds.size,
        pricedSignals: priced.length,
        pricedGames: pricedGameIds.size,
        actionable: actionable.length,
        watchlist: watchlist.length,
        bySource: countBy(signals.map((signal) => signal.source)),
        byActionability: countBy(signals.map((signal) => signal.quality.actionability)),
        byQualityTier: countBy(signals.map((signal) => signal.qualityTier)),
        byLeague: countBy(signals.map((signal) => signal.league))
      },
      topSignals: signals.slice(0, 12).map((signal) => ({
        id: signal.id,
        league: signal.league,
        gameId: signal.gameId ?? null,
        title: signal.title,
        matchup: signal.matchup ?? null,
        market: signal.market,
        source: signal.source,
        actionability: signal.quality.actionability,
        qualityTier: signal.qualityTier,
        qualityScore: signal.qualityScore,
        confidence: signal.confidence,
        currentOddsAmerican: signal.marketQuality.currentOddsAmerican ?? signal.currentOddsAmerican ?? null,
        fairOddsAmerican: signal.marketQuality.fairOddsAmerican,
        fairProbability: signal.marketQuality.fairProbability ?? signal.fairProbability ?? null,
        edgePercent: signal.marketQuality.edgePercent,
        warning: signal.warnings[0] ?? null,
        href: signal.actionHref
      })),
      nextAction: signals.length === 0
        ? "No trend signals were produced. Warm sim first, then warm trends."
        : actionable.length > 0
          ? "Signal health has actionable priced candidates. Review topSignals and game pages."
          : priced.length > 0
            ? "Priced signals exist but did not clear actionable gates. Inspect warnings and fair-price checkpoints."
            : "Signals are mostly watchlist/context. Market overlay or sportsbook prices are needed before action."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to build trend signal health."
    }, { status: 500 });
  }
}
