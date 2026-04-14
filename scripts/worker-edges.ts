import { prisma } from "@/lib/db/prisma";
import { edgeRecomputeJob } from "@/services/jobs/edge-recompute-job";
import { getBooleanArg, getStringArg, logStep, parseArgs } from "./_runtime-utils";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const eventId = getStringArg(args, "eventId");
  const leagueKey = getStringArg(args, "leagueKey");
  const liveOnly = getBooleanArg(args, "liveOnly");

  if (eventId) {
    logStep("worker:edges:start", { eventId });
    const result = await edgeRecomputeJob(eventId);
    logStep("worker:edges:done", result);
    return;
  }

  const events = await prisma.event.findMany({
    where: {
      ...(leagueKey ? { league: { key: leagueKey } } : {}),
      ...(liveOnly ? { status: "LIVE" } : {}),
      startTime: {
        gte: new Date(Date.now() - 1000 * 60 * 60 * 8),
        lte: new Date(Date.now() + 1000 * 60 * 60 * 24)
      }
    },
    select: { id: true }
  });

  logStep("worker:edges:batch", { count: events.length, leagueKey: leagueKey ?? null, liveOnly });
  for (const event of events) {
    await edgeRecomputeJob(event.id);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
