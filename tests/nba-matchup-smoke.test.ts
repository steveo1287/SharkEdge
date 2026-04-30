import assert from "node:assert/strict";

import { compareNbaProfiles } from "@/services/simulation/nba-team-analytics";

const comparison = compareNbaProfiles("Boston Celtics", "New York Knicks");

assert.ok(Number.isFinite(comparison.offensiveEdge));
assert.ok(Number.isFinite(comparison.defensiveEdge));
assert.ok(Number.isFinite(comparison.paceAverage));
assert.ok(comparison.home.teamName.length > 0);
assert.ok(comparison.away.teamName.length > 0);

console.log("nba-matchup-smoke tests passed");
