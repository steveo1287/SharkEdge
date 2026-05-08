import { NextResponse } from "next/server";

import { readSimCache, SIM_CACHE_KEYS, type SimHubSnapshot, type SimMarketSnapshot, type SimPrioritySnapshot, type SimRefreshStatusSnapshot } from "@/services/simulation/sim-snapshot-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const [hub, priority, market, status] = await Promise.all([
    readSimCache<SimHubSnapshot>(SIM_CACHE_KEYS.hub).catch((error) => ({ error: error instanceof Error ? error.message : String(error) } as any)),
    readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority).catch((error) => ({ error: error instanceof Error ? error.message : String(error) } as any)),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market).catch((error) => ({ error: error instanceof Error ? error.message : String(error) } as any)),
    readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus).catch((error) => ({ error: error instanceof Error ? error.message : String(error) } as any))
  ]);

  const edges = Array.isArray((market as any)?.edges) ? (market as any).edges : [];
  const rows = Array.isArray((priority as any)?.rows) ? (priority as any).rows : [];
  const totalEdges = edges.filter((edge: any) => edge?.market?.total != null || edge?.totalsAction);
  const pricedTotals = edges.filter((edge: any) => edge?.market?.total != null && edge?.market?.overPrice != null && edge?.market?.underPrice != null);

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    cacheKeys: SIM_CACHE_KEYS,
    hub: {
      exists: Boolean(hub && !(hub as any).error),
      generatedAt: (hub as any)?.generatedAt ?? null,
      expiresAt: (hub as any)?.expiresAt ?? null,
      stale: (hub as any)?.stale ?? null,
      summary: (hub as any)?.summary ?? null,
      warnings: (hub as any)?.warnings ?? [],
      error: (hub as any)?.error ?? null
    },
    priority: {
      exists: Boolean(priority && !(priority as any).error),
      generatedAt: (priority as any)?.generatedAt ?? null,
      expiresAt: (priority as any)?.expiresAt ?? null,
      stale: (priority as any)?.stale ?? null,
      rows: rows.length,
      sample: rows.slice(0, 3),
      warnings: (priority as any)?.warnings ?? [],
      error: (priority as any)?.error ?? null
    },
    market: {
      exists: Boolean(market && !(market as any).error),
      generatedAt: (market as any)?.generatedAt ?? null,
      expiresAt: (market as any)?.expiresAt ?? null,
      stale: (market as any)?.stale ?? null,
      lineCount: (market as any)?.lineCount ?? 0,
      gameCount: (market as any)?.gameCount ?? 0,
      edges: edges.length,
      edgesWithMarket: edges.filter((edge: any) => Boolean(edge?.market)).length,
      totalEdges: totalEdges.length,
      pricedTotals: pricedTotals.length,
      totalsAction: edges.filter((edge: any) => Boolean(edge?.totalsAction)).length,
      takeAction: edges.filter((edge: any) => Boolean(edge?.signal?.takeAction)).length,
      warnings: (market as any)?.warnings ?? [],
      sourceStatus: (market as any)?.sourceStatus ?? null,
      sample: edges.slice(0, 5).map((edge: any) => ({
        gameId: edge?.gameId,
        startTime: edge?.startTime,
        matchup: edge?.matchup,
        sportsbook: edge?.sportsbook,
        hasMarket: Boolean(edge?.market),
        marketTotal: edge?.market?.total ?? null,
        overPrice: edge?.market?.overPrice ?? null,
        underPrice: edge?.market?.underPrice ?? null,
        homeMoneyline: edge?.market?.homeMoneyline ?? null,
        awayMoneyline: edge?.market?.awayMoneyline ?? null,
        signalMarket: edge?.signal?.market ?? null,
        signalAction: edge?.signal?.takeAction?.action ?? edge?.signal?.action ?? null,
        totalsAction: edge?.totalsAction?.action ?? null,
        totalRunEdge: edge?.edges?.totalRuns ?? null
      })),
      error: (market as any)?.error ?? null
    },
    refreshStatus: {
      exists: Boolean(status && !(status as any).error),
      generatedAt: (status as any)?.generatedAt ?? null,
      ok: (status as any)?.ok ?? null,
      running: (status as any)?.running ?? null,
      lastSuccessAt: (status as any)?.lastSuccessAt ?? null,
      lastFailureAt: (status as any)?.lastFailureAt ?? null,
      reason: (status as any)?.reason ?? null,
      warnings: (status as any)?.warnings ?? [],
      sourceStatus: (status as any)?.sourceStatus ?? null,
      error: (status as any)?.error ?? null
    }
  });
}
