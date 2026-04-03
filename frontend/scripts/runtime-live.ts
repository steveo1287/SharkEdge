import { currentMarketStateJob } from "@/services/jobs/current-market-state-job";
import { edgeRecomputeJob } from "@/services/jobs/edge-recompute-job";
import { lineMovementJob } from "@/services/jobs/line-movement-job";
import { alertDispatchJob } from "@/services/jobs/alert-dispatch-job";
import { refreshActiveEventCaches, refreshBoardCache, refreshEdgesCache } from "@/services/feed/cache-refresh";
import { syncPropWarehouse } from "@/services/props/warehouse-service";
import { prisma } from "@/lib/db/prisma";
import { getBooleanArg, getNumberArg, getStringArg, logStep, parseArgs } from "./_runtime-utils";
import { spawn } from "node:child_process";
import path from "node:path";

async function runScrape(dryRun: boolean) {
  if (dryRun) {
    logStep("runtime:scrape:dry-run");
    return;
  }

  const scriptPath = path.resolve(process.cwd(), "../backend/live_odds_scraper.py");
  const command = process.env.PYTHON_BIN?.trim() || "python";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [scriptPath], {
      cwd: path.resolve(process.cwd(), "../backend"),
      env: { ...process.env, RUN_ONCE: "true" },
      stdio: "inherit"
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Runtime scrape exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function runCycle(leagueKey?: string, dryRun = false) {
  logStep("runtime:cycle:start", { leagueKey: leagueKey ?? null, dryRun });
  await runScrape(dryRun);
  if (!leagueKey || leagueKey === "NBA" || leagueKey === "NCAAB") {
    await syncPropWarehouse({
      league:
        !leagueKey || (leagueKey !== "NBA" && leagueKey !== "NCAAB")
          ? "ALL"
          : (leagueKey as "NBA" | "NCAAB"),
      maxEvents: 2,
      lookaheadHours: 18,
      dryRun
    });
  }

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

  for (const event of events) {
    await currentMarketStateJob(event.id);
    await lineMovementJob(event.id);
    await edgeRecomputeJob(event.id);
  }

  await alertDispatchJob();
  await refreshBoardCache(leagueKey);
  await refreshEdgesCache();
  await refreshActiveEventCaches(leagueKey);
  logStep("runtime:cycle:done", { eventCount: events.length });
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
