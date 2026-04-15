import { resolveEntitiesJob } from "@/services/jobs/resolve-entities-job";
import { logStep } from "./_runtime-utils";

async function main() {
  logStep("worker:resolve-entities:start");
  const result = await resolveEntitiesJob();
  logStep("worker:resolve-entities:done", result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
