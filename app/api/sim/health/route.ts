import { NextResponse } from "next/server";

import { readNbaWarehouseFeed, type NbaWarehouseKind } from "@/services/data/nba/warehouse-feed";
import {
  readSimCache,
  SIM_CACHE_KEYS,
  type SimHubSnapshot,
  type SimMarketSnapshot,
  type SimPrioritySnapshot,
  type SimRefreshStatusSnapshot
} from "@/services/simulation/sim-snapshot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NBA_KINDS: NbaWarehouseKind[] = ["team", "player", "history", "rating"];
const SIM_MAX_AGE_MINUTES = 20;
const MARKET_MAX_AGE_MINUTES = 10;

function dateFrom(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ageMinutes(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
}

function freshness(value: string | null | undefined, maxAgeMinutes: number) {
  const age = ageMinutes(value);
  return {
    generatedAt: value ?? null,
    ageMinutes: age,
    maxAgeMinutes,
    fresh: typeof age === "number" && age <= maxAgeMinutes
  };
}

function statusFromFreshness(item: { fresh: boolean; ageMinutes: number | null }) {
  if (item.ageMinutes === null) return "missing";
  return item.fresh ? "fresh" : "stale";
}

function rowsStatus(rows: number) {
  return rows > 0 ? "ready" : "missing";
}

export async function GET() {
  try {
    const [hub, priority, market, refreshStatus, ...warehouseFeeds] = await Promise.all([
      readSimCache<SimHubSnapshot>(SIM_CACHE_KEYS.hub),
      readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority),
      readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market),
      readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus),
      ...NBA_KINDS.map((kind) => readNbaWarehouseFeed(kind).catch(() => null))
    ]);

    const simFreshness = freshness(priority?.generatedAt ?? hub?.generatedAt ?? null, SIM_MAX_AGE_MINUTES);
    const marketFreshness = freshness(market?.generatedAt ?? null, MARKET_MAX_AGE_MINUTES);
    const warehouse = Object.fromEntries(NBA_KINDS.map((kind, index) => {
      const feed = warehouseFeeds[index];
      const rows = feed?.rows.length ?? 0;
      return [kind, {
        status: rowsStatus(rows),
        rows,
        filePath: feed?.filePath ?? null,
        warnings: feed?.warnings ?? [`NBA warehouse ${kind} feed unavailable.`]
      }];
    }));
    const nbaWarehouseReady = NBA_KINDS.every((kind) => (warehouse[kind] as { rows: number }).rows > 0);
    const simStatus = statusFromFreshness(simFreshness);
    const marketStatus = statusFromFreshness(marketFreshness);
    const refreshFailed = refreshStatus?.ok === false;
    const ok = simFreshness.fresh && marketFreshness.fresh && nbaWarehouseReady && !refreshFailed;

    return NextResponse.json({
      ok,
      generatedAt: new Date().toISOString(),
      status: ok ? "ready" : "degraded",
      sim: {
        status: simStatus,
        freshness: simFreshness,
        hub: hub ? {
          stale: hub.stale,
          warnings: hub.warnings,
          summary: hub.summary
        } : null,
        priority: priority ? {
          stale: priority.stale,
          warnings: priority.warnings,
          summary: priority.summary,
          rows: priority.rows.length
        } : null
      },
      market: {
        status: marketStatus,
        freshness: marketFreshness,
        lineCount: market?.lineCount ?? 0,
        edgeCount: market?.edges.length ?? 0,
        gameCount: market?.gameCount ?? 0,
        warnings: market?.warnings ?? []
      },
      nbaWarehouse: {
        status: nbaWarehouseReady ? "ready" : "degraded",
        requiredReady: nbaWarehouseReady,
        feeds: warehouse
      },
      refresh: refreshStatus ? {
        status: refreshStatus.running ? "running" : refreshStatus.ok ? "ok" : "failed",
        generatedAt: refreshStatus.generatedAt,
        lastSuccessAt: refreshStatus.lastSuccessAt,
        lastFailureAt: refreshStatus.lastFailureAt,
        reason: refreshStatus.reason ?? null,
        warnings: refreshStatus.warnings
      } : {
        status: "missing",
        generatedAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        reason: "No sim refresh status snapshot found.",
        warnings: []
      },
      nextAction: ok
        ? "Sim product health is ready."
        : nbaWarehouseReady
          ? "Sim cache or market overlay is stale; check cron refresh status."
          : "NBA warehouse is not fully ready; run Refresh NBA Warehouse and inspect player/team row counts."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      status: "error",
      error: error instanceof Error ? error.message : "Sim health check failed."
    }, { status: 500 });
  }
}
