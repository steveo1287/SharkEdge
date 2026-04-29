import assert from "node:assert/strict";

import { buildFallbackTrendDashboard } from "@/services/trends/fallback-dashboard";
import type { TrendFilters } from "@/lib/types/domain";

const filters: TrendFilters = {
  sport: "ALL",
  league: "ALL",
  market: "ALL",
  sportsbook: "all",
  side: "ALL",
  subject: "",
  team: "",
  player: "",
  fighter: "",
  opponent: "",
  window: "90d",
  sample: 10
};

const dashboard = buildFallbackTrendDashboard(filters);

assert.equal(dashboard.setup, null);
assert.ok(Array.isArray(dashboard.cards));
assert.ok(dashboard.cards.length > 0);
assert.ok(Array.isArray(dashboard.metrics));
assert.ok(dashboard.metrics.length > 0);
assert.ok(Array.isArray(dashboard.movementRows));
assert.ok(dashboard.movementRows.length > 0);
assert.ok(Array.isArray(dashboard.segmentRows));
assert.ok(dashboard.segmentRows.length > 0);
assert.ok(dashboard.sourceNote.includes("Fallback trend renderer"));

for (const card of dashboard.cards) {
  assert.ok(card.id);
  assert.ok(card.title);
  assert.ok(card.value);
  assert.ok(typeof card.sampleSize === "number");
  assert.ok(card.note.includes("Action Gate:"));
  assert.ok(card.caution.includes("Kill switches:"));
  assert.ok(["success", "brand", "premium", "muted"].includes(card.tone));
  assert.ok(Array.isArray(card.todayMatches));
}

const totalOnly = buildFallbackTrendDashboard({ ...filters, market: "total" });
assert.ok(totalOnly.cards.length > 0);
assert.ok(totalOnly.cards.every((card) => card.dateRange.toLowerCase().includes("total")));

console.log("trends-page-fallback tests passed");
