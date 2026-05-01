import { NextResponse } from "next/server";

import { buildOfficialNbaLiveFeed } from "@/services/data/nba/official-live-feed";
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
const REQUIRED_NBA_KINDS: NbaWarehouseKind[] = ["team", "player"];
const SIM_MAX_AGE_MINUTES = 20;
const MARKET_MAX_AGE_MINUTES = 10;

type NbaFeedHealth = {
  status: "ready" | "missing";
  source: "warehouse" | "official-nba-stats-live" | "missing";
  rows: number;
  warehouseRows: number;
  officialFallbackRows: number;
  filePath: string | null;
  fallbackEnabled: boolean;
  warnings: string[];
  officialError: string | null;
};

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

async function nbaFeedStatus(kind: NbaWarehouseKind): Promise<NbaFeedHealth> {
  const warehouse = await readNbaWarehouseFeed(kind).catch(() => null);
  const warehouseRows = warehouse?.rows.length ?? 0;
  if (warehouseRows > 0) {
    return {
      status: "ready",
      source: "warehouse",
      rows: warehouseRows,
      warehouseRows,
      officialFallbackRows: 0,
      filePath: warehouse?.filePath ?? null,
      fallbackEnabled: process.env.NBA_DISABLE_OFFICIAL_LIVE_FALLBACK !== "1",
      warnings: warehouse?.warnings ?? [],
      officialError: null
    };
  }

  const fallbackEnabled = process.env.NBA_DISABLE_OFFICIAL_LIVE_FALLBACK !== "1";
  let officialFallbackRows = 0;
  let officialError: string | null = null;
  if (fallbackEnabled) {
    try {
      officialFallbackRows = (await buildOfficialNbaLiveFeed(kind)).length;
    } catch (error) {
      officialError = error instanceof Error ? error.message : "Official NBA live fallback failed.";
    }
  }

  const rows = Math.max(warehouseRows, officialFallbackRows);
  return {
    status: rows > 0 ? "ready" : "missing",
    source: warehouseRows > 0 ? "warehouse" : officialFallbackRows > 0 ? "official-nba-stats-live" : "missing",
    rows,
    warehouseRows,
    officialFallbackRows,
    filePath: warehouse?.filePath ?? null,
    fallbackEnabled,
    warnings: warehouse?.warnings ?? [`NBA ${kind} feed unavailable.`],
    officialError
  };
}

export async function GET() {
  try {
    const [hub, priority, market, refreshStatus, ...nbaFeeds] = await Promise.all([
      readSimCache<SimHubSnapshot>(SIM_CACHE_KEYS.hub),
      readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority),
      readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market),
      readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus),
      ...NBA_KINDS.map((kind) => nbaFeedStatus(kind))
    ]);

    const simFreshness = freshness(priority?.generatedAt ?? hub?.generatedAt ?? null, SIM_MAX_AGE_MINUTES);
    const marketFreshness = freshness(market?.generatedAt ?? null, MARKET_MAX_AGE_MINUTES);
    const warehouse = Object.fromEntries(NBA_KINDS.map((kind, index) => [kind, nbaFeeds[index] as NbaFeedHealth]));
    const requiredNbaDataReady = REQUIRED_NBA_KINDS.every((kind) => (warehouse[kind] as NbaFeedHealth).rows > 0);
    const allNbaDataReady = NBA_KINDS.every((kind) => (warehouse[kind] as NbaFeedHealth).rows > 0);
    const simStatus = statusFromFreshness(simFreshness);
    const marketStatus = statusFromFreshness(marketFreshness);
    const refreshFailed = refreshStatus?.ok === false;
    const ok = simFreshness.fresh && marketFreshness.fresh && requiredNbaDataReady && !refreshFailed;

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
      nbaData: {
        status: requiredNbaDataReady ? "ready" : "degraded",
        requiredReady: requiredNbaDataReady,
        allOptionalFeedsReady: allNbaDataReady,
        requiredFeeds: REQUIRED_NBA_KINDS,
        feeds: warehouse
      },
      nbaWarehouse: {
        status: allNbaDataReady ? "ready" : requiredNbaDataReady ? "usable-with-live-fallback" : "degraded",
        requiredReady: allNbaDataReady,
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
        : requiredNbaDataReady
          ? "NBA real data is usable. Sim cache or market overlay is stale; check cron refresh status."
          : "NBA team/player rows are not available from warehouse or official live fallback; inspect /api/simulation/nba/data-health."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      status: "error",
      error: error instanceof Error ? error.message : "Sim health check failed."
    }, { status: 500 });
  }
}
