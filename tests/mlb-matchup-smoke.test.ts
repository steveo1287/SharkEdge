import assert from "node:assert/strict";

import { compareMlbProfiles } from "@/services/simulation/mlb-team-analytics";

async function main() {
  const comparison = await compareMlbProfiles("Boston Red Sox", "New York Yankees");

  assert.ok(Number.isFinite(comparison.offensiveEdge));
  assert.ok(Number.isFinite(comparison.startingPitchingEdge));
  assert.ok(Number.isFinite(comparison.runEnvironment));
  assert.ok(Number.isFinite(comparison.volatilityIndex));
  assert.ok(comparison.home.teamName.length > 0);
  assert.ok(comparison.away.teamName.length > 0);

  console.log("mlb-matchup-smoke tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
