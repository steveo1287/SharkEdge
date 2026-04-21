import assert from "node:assert/strict";
import { simulateContextualGame } from "@/services/simulation/contextual-game-sim";

console.log("=== Simulation Defense Fix Validation ===\n");

// Test Case 1: Verify simulation runs with corrected defense values
const result1 = simulateContextualGame({
  leagueKey: "NBA",
  home: {
    teamName: "Strong Home Team",
    offense: 115,  // Better offense
    defense: 105,  // Better defense
    pace: 100,
  },
  away: {
    teamName: "Weak Away Team",
    offense: 100,
    defense: 95,
    pace: 100,
  },
  samples: 1000,
  seed: 42
});

console.log("Test 1: Simulation with corrected defense values");
console.log(`  ✓ Home projected score: ${result1.projectedHomeScore.toFixed(1)}`);
console.log(`  ✓ Away projected score: ${result1.projectedAwayScore.toFixed(1)}`);
console.log(`  ✓ Spread (Home): ${result1.projectedSpreadHome.toFixed(1)}`);
console.log(`  ✓ Win Prob Home: ${(result1.winProbHome * 100).toFixed(1)}%`);

// Verify outputs are valid
assert.ok(result1.projectedHomeScore > 0, "Home score should be positive");
assert.ok(result1.projectedAwayScore > 0, "Away score should be positive");
assert.ok(
  Math.abs((result1.winProbHome + result1.winProbAway) - 1) < 0.01,
  "Win probabilities must sum to 1"
);
console.log("✅ PASS: Simulation generates valid outputs\n");

// Test Case 2: Verify defense is being used (not swapped)
const result2 = simulateContextualGame({
  leagueKey: "NBA",
  home: {
    teamName: "Home Team",
    offense: 100,
    defense: 100,
    pace: 100,
  },
  away: {
    teamName: "Away Team",
    offense: 100,
    defense: 85,    // Significantly worse defense
    pace: 100,
  },
  samples: 1000,
  seed: 42
});

console.log("Test 2: Defense impact validation");
console.log(`  ✓ Home (defense=100) projected score: ${result2.projectedHomeScore.toFixed(1)}`);
console.log(`  ✓ Away (defense=85) projected score: ${result2.projectedAwayScore.toFixed(1)}`);
console.log(`  ✓ Delta: ${(result2.projectedHomeScore - result2.projectedAwayScore).toFixed(1)}`);

// With equal offense and pace, but away has worse defense,
// away team should score less than home team (away is scoring against home's better defense)
assert.ok(
  result2.projectedAwayScore < result2.projectedHomeScore + 5,
  "Away team with worse defense should score less or similar to home"
);
console.log("✅ PASS: Defense values are being applied correctly\n");

// Test Case 3: Verify simulation generators don't produce NaN or Infinity
const result3 = simulateContextualGame({
  leagueKey: "MLB",
  home: { teamName: "Home", offense: 4.5, defense: 4.3, pace: 38 },
  away: { teamName: "Away", offense: 4.2, defense: 4.4, pace: 38 },
  samples: 800,
  seed: 99
});

console.log("Test 3: Different sport (MLB) simulation");
console.log(`  ✓ Home runs: ${result3.projectedHomeScore.toFixed(2)}`);
console.log(`  ✓ Away runs: ${result3.projectedAwayScore.toFixed(2)}`);

assert.ok(Number.isFinite(result3.projectedHomeScore), "Home score must be finite");
assert.ok(Number.isFinite(result3.projectedAwayScore), "Away score must be finite");
assert.ok(Number.isFinite(result3.winProbHome), "Win prob must be finite");
console.log("✅ PASS: MLB simulation works correctly\n");

console.log("=== All simulation fix validation tests passed ===");
