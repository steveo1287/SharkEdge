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
