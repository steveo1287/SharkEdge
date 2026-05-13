import assert from "node:assert/strict";

import { getMlbHistoricalOddsCoverage } from "../src/server/sharktrends/coverage";

async function testEmptyCoverage() {
  const responses = [
    [{ event_count: 0, graded_event_count: 0, market_count: 0, snapshot_count: 0, sportsbook_count: 0, min_event_start_time: null, max_event_start_time: null, min_snapshot_captured_at: null, max_snapshot_captured_at: null }],
    [],
    [],
    [],
    [{ markets_without_snapshots: 0, snapshots_without_results: 0 }]
  ];
  let i = 0;
  const coverage = await getMlbHistoricalOddsCoverage({ $queryRawUnsafe: async () => responses[i++] } as any);
  assert.equal(coverage.leagueKey, "MLB");
  assert.equal(coverage.eventCount, 0);
  assert.ok(coverage.warnings.some((warning) => warning.includes("No MLB historical odds")));
}

async function testGroupedCoverage() {
  const responses = [
    [{ event_count: 2, graded_event_count: 1, market_count: 3, snapshot_count: 4, sportsbook_count: 2, min_event_start_time: new Date("2024-04-01T00:00:00Z"), max_event_start_time: new Date("2025-04-01T00:00:00Z"), min_snapshot_captured_at: new Date("2024-03-31T00:00:00Z"), max_snapshot_captured_at: new Date("2025-03-31T00:00:00Z") }],
    [{ key: "moneyline", count: 2 }, { key: "total", count: 1 }],
    [{ key: "sportsbookreview_historical", count: 2 }, { key: "arnavsaraogi_mlb_scraper", count: 1 }],
    [{ key: 2024, count: 1 }, { key: 2025, count: 1 }],
    [{ markets_without_snapshots: 1, snapshots_without_results: 1 }]
  ];
  let i = 0;
  const coverage = await getMlbHistoricalOddsCoverage({ $queryRawUnsafe: async () => responses[i++] } as any);
  assert.deepEqual(coverage.seasonsAvailable, [2024, 2025]);
  assert.equal(coverage.marketsByType.moneyline, 2);
  assert.equal(coverage.rowsBySourceKey.arnavsaraogi_mlb_scraper, 1);
  assert.ok(coverage.warnings.some((warning) => warning.includes("markets have no snapshots")));
}

async function main() {
  await testEmptyCoverage();
  await testGroupedCoverage();
  console.log("sharktrends-coverage tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
