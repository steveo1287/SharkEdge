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
assert.equal(dashboard.cards.length, 0);
assert.ok(Array.isArray(dashboard.metrics));
assert.ok(dashboard.metrics.length > 0);
assert.ok(Array.isArray(dashboard.movementRows));
assert.ok(dashboard.movementRows.length > 0);
assert.ok(Array.isArray(dashboard.segmentRows));
assert.ok(dashboard.segmentRows.length > 0);
assert.ok(dashboard.sourceNote.includes("No fake fallback cards"));
assert.ok(dashboard.sampleNote?.includes("Static fallback trend cards are disabled"));
assert.ok(dashboard.explanation?.headline.includes("No real trend data"));
assert.ok(dashboard.metrics.some((metric) => metric.label === "Fallback cards" && metric.value === "Disabled"));
assert.ok(dashboard.movementRows.some((row) => row.href === "/api/trends?mode=signals&debug=true"));

const totalOnly = buildFallbackTrendDashboard({ ...filters, market: "total" });
assert.equal(totalOnly.cards.length, 0);
assert.ok(totalOnly.explanation?.queryLogic.includes("total"));

console.log("trends-page-fallback tests passed");
