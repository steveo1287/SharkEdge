import { NextResponse } from "next/server";
import { buildMlbEdges } from "@/services/simulation/mlb-take-action-v2";
import {
  readSimCache,
  SIM_CACHE_KEYS,
  type SimMarketSnapshot
} from "@/services/simulation/sim-cache";

export const runtime = "nodejs";
export const maxDuration = 25;
export const dynamic = "force-dynamic";
export const revalidate = 0;

const LIVE_EDGE_TIMEOUT_MS = 18_000;

function timeoutAfter(ms: number) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`MLB edge rebuild timed out after ${ms}ms`)), ms);
  });
}

function summarize(snapshot: SimMarketSnapshot) {
  const edges = snapshot.edges ?? [];
  const edgesWithMarket = edges.filter((edge) => edge.market).length;
  const totalEdges = edges.filter((edge) => typeof edge.edges?.totalRuns === "number").length;
  const pricedTotals = edges.filter((edge) => typeof edge.market?.total === "number").length;
  const takeAction = edges.filter((edge) => {
    const signal = edge.signal as { takeAction?: { action?: unknown }; action?: unknown } | null | undefined;
    const action = String(signal?.takeAction?.action ?? signal?.action ?? "").toUpperCase();
    return action === "ATTACK" || action === "PLAY" || action === "LEAN" || action === "WATCH";
  }).length;
  return {
    edgeCount: edges.length,
    edgesWithMarket,
    totalEdges,
    pricedTotals,
    takeAction
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const live = url.searchParams.get("live") === "true" || url.searchParams.get("rebuild") === "true";

  // Cache boundary: normal API reads must not rebuild MLB projections/markets.
  // The cron refresh owns expensive edge construction; live rebuild is diagnostics only.
  if (!live) {
    const cached = await readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market);
    if (!cached) {
      return NextResponse.json({
        ok: false,
        source: "sim_market_cache",
        error: "No cached MLB market edge snapshot found. Run /api/sim/refresh or wait for the sim cron.",
        edges: [],
        warnings: ["MLB edge endpoint is cache-first; it did not run a request-time rebuild."]
      }, { status: 503 });
    }

    return NextResponse.json({
      ok: true,
      source: "sim_market_cache",
      generatedAt: cached.generatedAt,
      expiresAt: cached.expiresAt,
      stale: cached.stale,
      lineCount: cached.lineCount,
      gameCount: cached.gameCount,
      summary: summarize(cached),
      warnings: cached.warnings ?? [],
      edges: cached.edges ?? []
    });
  }

  try {
    const data = await Promise.race([buildMlbEdges(), timeoutAfter(LIVE_EDGE_TIMEOUT_MS)]);
    return NextResponse.json({
      ...data,
      ok: true,
      source: "live_rebuild_diagnostics"
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      source: "live_rebuild_diagnostics",
      error: error instanceof Error ? error.message : "MLB edge rebuild failed.",
      edges: []
    }, { status: 504 });
  }
}
