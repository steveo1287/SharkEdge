import { runOddsApiSnapshotPull } from "@/services/odds/the-odds-api-budget-service";

async function main() {
  const result = await runOddsApiSnapshotPull({ mode: "manual", sportsCsv: "mma_mixed_martial_arts" });
  console.log(JSON.stringify({
    ok: result.ok,
    skipped: result.skipped,
    reason: result.reason,
    budget: result.budget,
    daily: result.daily,
    ingest: result.ingest,
    ufcMarketOdds: result.ufcMarketOdds,
    sports: result.snapshot?.meta?.sports ?? []
  }, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error("[worker-ufc-odds-refresh]", error instanceof Error ? error.message : error);
  process.exit(1);
});
