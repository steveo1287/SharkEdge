import { currentMarketStateJob } from "@/services/jobs/current-market-state-job";
import { edgeRecomputeJob } from "@/services/jobs/edge-recompute-job";
import { lineMovementJob } from "@/services/jobs/line-movement-job";
import { alertDispatchJob } from "@/services/jobs/alert-dispatch-job";
import { refreshActiveEventCaches, refreshBoardCache, refreshEdgesCache } from "@/services/feed/cache-refresh";
import { syncPropWarehouse } from "@/services/props/warehouse-service";
import { ingestBackendCurrentOdds } from "@/services/current-odds/backend-ingestion-service";
import { prisma } from "@/lib/db/prisma";
import { getBooleanArg, getNumberArg, getStringArg, logStep, parseArgs } from "./_runtime-utils";
import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";

async function logInventory() {
  const [events, markets, states, edges] = await Promise.all([
    prisma.event.count({
      where: {
        startTime: {
          gte: new Date(Date.now() - 1000 * 60 * 60 * 8),
          lte: new Date(Date.now() + 1000 * 60 * 60 * 24)
        }
      }
    }),
    prisma.eventMarket.count({
      where: {
        updatedAt: {
          gte: new Date(Date.now() - 1000 * 60 * 5)
        }
      }
    }),
    prisma.currentMarketState.count({
      where: {
        updatedAt: {
          gte: new Date(Date.now() - 1000 * 60 * 5)
        }
      }
    }),
    prisma.edgeSignal.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 1000 * 60 * 5)
        }
      }
    })
  ]);

  logStep("runtime:inventory", {
    activeEvents: events,
    freshEventMarkets: markets,
    freshCurrentMarketStates: states,
    recentEdgeSignals: edges
  });

  return { events, markets, states, edges };
}

async function runScrape(dryRun: boolean) {
  if (dryRun) {
    logStep("runtime:scrape:dry-run");
    return { ok: true, reason: null, eventCount: 0, marketIngestions: 0 };
  }

  // Ingest from backend (OddsHarvester or SportsDataverse sourced)
  try {
    logStep("runtime:scrape:start", { method: "backend" });
    const result = await ingestBackendCurrentOdds();

    if (result.ok) {
      logStep("runtime:scrape:success", {
        method: "backend",
        eventCount: result.eventCount,
        marketIngestions: result.marketIngestions,
        leagues: result.leagues,
        provider: result.provider,
        source: result.source
      });
      return result;
    }

    logStep("runtime:scrape:failed", {
      method: "backend",
      reason: result.reason
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("runtime:scrape:error", { method: "backend", error: msg });
  }

  return { ok: false, reason: "backend_ingest_failed", eventCount: 0, marketIngestions: 0 };
}

async function runCycle(leagueKey?: string, dryRun = false) {
  logStep("runtime:cycle:start", { leagueKey: leagueKey ?? null, dryRun });

  // Ingest live odds
  const scrapeResult = await runScrape(dryRun);

  // Sync props if applicable
  if (!dryRun && (!leagueKey || leagueKey === "NBA")) {
    await syncPropWarehouse({
      league:
        !leagueKey || leagueKey !== "NBA"
          ? "ALL"
          : (leagueKey as "NBA"),
      maxEvents: 2,
      lookaheadHours: 18,
      dryRun: false
    });
  }

  // Fetch events and run derivative jobs
  const events = await prisma.event.findMany({
    where: {
      ...(leagueKey ? { league: { key: leagueKey } } : {}),
      startTime: {
        gte: new Date(Date.now() - 1000 * 60 * 60 * 8),
        lte: new Date(Date.now() + 1000 * 60 * 60 * 24)
      }
    },
    select: { id: true }
  });

  if (!dryRun) {
    for (const event of events) {
      await currentMarketStateJob(event.id);
      await lineMovementJob(event.id);
      await edgeRecomputeJob(event.id);
    }

    await alertDispatchJob();
    await refreshBoardCache(leagueKey);
    await refreshEdgesCache();
    await refreshActiveEventCaches(leagueKey);
  }

  // Log current inventory
  const inventory = await logInventory();

  logStep("runtime:cycle:done", {
    eventCount: events.length,
    ingestedEvents: scrapeResult.eventCount,
    ingestedMarkets: scrapeResult.marketIngestions,
    currentState: {
      activeEvents: inventory.events,
      freshMarkets: inventory.markets,
      freshStates: inventory.states,
      recentEdges: inventory.edges
    }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const loop = getBooleanArg(args, "loop");
  const dryRun = getBooleanArg(args, "dryRun");
  const leagueKey = getStringArg(args, "leagueKey");
  const intervalSeconds = getNumberArg(
    args,
    "pollInterval",
    Number(process.env.POLL_INTERVAL_SECONDS || 60)
  );

  do {
    await runCycle(leagueKey, dryRun);
    if (!loop) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  } while (loop);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
