import { alertDispatchJob } from "@/services/jobs/alert-dispatch-job";
import { logStep } from "./_runtime-utils";

async function main() {
  logStep("worker:alerts:start");
  const result = await alertDispatchJob();
  logStep("worker:alerts:done", result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
