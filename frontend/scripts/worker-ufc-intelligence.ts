import { getNumberArg, getStringArg, logStep, parseArgs } from "./_runtime-utils";
import { refreshCombatParticipantProfiles } from "@/services/modeling/fighter-history-service";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const eventIdsArg = getStringArg(args, "eventIds");
  const limit = getNumberArg(args, "limit", 25);
  const eventIds = eventIdsArg ? eventIdsArg.split(",").map((value) => value.trim()).filter(Boolean) : undefined;

  logStep("worker:ufc-intelligence:start", { eventIds, limit });
  const result = await refreshCombatParticipantProfiles({ eventIds, limit, leagues: ["UFC"] });
  logStep("worker:ufc-intelligence:done", result);
}

main().catch((error) => {
  console.error("[runtime] worker:ufc-intelligence:error", error);
  process.exitCode = 1;
});
