import { prisma } from "@/lib/db/prisma";
import { refreshCurrentBookFeeds } from "@/services/current-odds/book-feed-refresh-service";
import { recomputeEdgeSignals } from "@/services/edges/edge-engine";
import { currentMarketStateJob } from "@/services/jobs/current-market-state-job";
import { getBooleanArg, getNumberArg, logStep, parseArgs } from "@/scripts/_runtime-utils";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_LOOKBACK_HOURS = 12;
const DEFAULT_LOOKAHEAD_HOURS = 48;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConfiguredNumber(
  args: Map<string, string | boolean>,
  argKey: string,
  envKey: string,
  fallback: number
) {
  const envValue = Number(process.env[envKey] ?? "");
  const envFallback = Number.isFinite(envValue) && envValue > 0 ? envValue : fallback;
  return getNumberArg(args, argKey, envFallback);
}

function shouldRunHeavyWorker() {
  const mode = (process.env.SHARKEDGE_WORKER_MODE ?? "").trim().toLowerCase();
  const allowRailway = (process.env.ALLOW_RAILWAY_HEAVY_WORKER ?? "").trim().toLowerCase();

  if (mode === "local" || mode === "pc" || mode === "windows") {
    return { ok: true as const };
  }

  if (allowRailway === "true" || allowRailway === "1" || allowRailway === "yes") {
    return { ok: true as const };
  }

  return {
    ok: false as const,
    message:
      "Heavy odds refresh is disabled on this worker. Set SHARKEDGE_WORKER_MODE=local on your PC or ALLOW_RAILWAY_HEAVY_WORKER=true if you intentionally want Railway to run it."
  };
}

async function getActiveEventIds(lookbackHours: number, lookaheadHours: number) {
  const now = Date.now();
  const events = await prisma.event.findMany({
    where: {
      startTime: {
        gte: new Date(now - lookbackHours * 60 * 60 * 1000),
        lte: new Date(now + lookaheadHours * 60 * 60 * 1000)
      }
    },
    select: { id: true },
    orderBy: { startTime: "asc" }
  });

  return events.map((event) => event.id);
}

async function runRefreshCycle(lookbackHours: number, lookaheadHours: number) {
  const startedAt = Date.now();
  logStep("worker:odds-refresh:start", {
    lookbackHours,
    lookaheadHours
  });

  const refresh = await refreshCurrentBookFeeds({ force: true });
  const eventIds = await getActiveEventIds(lookbackHours, lookaheadHours);

  logStep("worker:odds-refresh:events", {
    count: eventIds.length
  });

  for (const eventId of eventIds) {
    await currentMarketStateJob(eventId, {
      skipBookFeedRefresh: true
    });
    await recomputeEdgeSignals(eventId);
  }

  logStep("worker:odds-refresh:done", {
    durationMs: Date.now() - startedAt,
    refreshedProviders: refresh.summaries.length,
    activeEvents: eventIds.length
  });
}

async function main() {
  const gate = shouldRunHeavyWorker();
  if (!gate.ok) {
    console.log(`[worker] odds-refresh disabled: ${gate.message}`);
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const runOnce = getBooleanArg(args, "once");
  const intervalMs = getConfiguredNumber(
    args,
    "intervalMs",
    "ODDS_REFRESH_INTERVAL_MS",
    DEFAULT_INTERVAL_MS
  );
  const lookbackHours = getConfiguredNumber(
    args,
    "lookbackHours",
    "ODDS_REFRESH_LOOKBACK_HOURS",
    DEFAULT_LOOKBACK_HOURS
  );
  const lookaheadHours = getConfiguredNumber(
    args,
    "lookaheadHours",
    "ODDS_REFRESH_LOOKAHEAD_HOURS",
    DEFAULT_LOOKAHEAD_HOURS
  );

  do {
    try {
      await runRefreshCycle(lookbackHours, lookaheadHours);
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      console.error(`[worker] odds-refresh cycle failed: ${message}`);
    }

    if (!runOnce) {
      await sleep(intervalMs);
    }
  } while (!runOnce);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
