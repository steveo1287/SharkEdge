import { getNumberArg, getStringArg, logStep, parseArgs } from "./_runtime-utils";
import { refreshEventIntelligence, refreshUpcomingEventIntelligence } from "@/services/intelligence/intelligence-orchestrator";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const eventId = getStringArg(args, "eventId");
  const leaguesArg = getStringArg(args, "leagues");
  const limit = getNumberArg(args, "limit", 20);

  if (eventId) {
    logStep("worker:intelligence-orchestrator:event:start", { eventId });
    const result = await refreshEventIntelligence(eventId);
    logStep("worker:intelligence-orchestrator:event:done", result);
    return;
  }

  const leagues = leaguesArg ? leaguesArg.split(",").map((value) => value.trim()).filter(Boolean) : undefined;
  logStep("worker:intelligence-orchestrator:start", { leagues, limit });
  const result = await refreshUpcomingEventIntelligence({ leagues, limit });
  logStep("worker:intelligence-orchestrator:done", result);
}

main().catch((error) => {
  console.error("[runtime] worker:intelligence-orchestrator:error", error);
  process.exitCode = 1;
});
