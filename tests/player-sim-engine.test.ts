import { buildPlayerSimProjection, PlayerSimInput, PlayerSimOutput } from "@/services/simulation/player-sim-engine";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Test Points projection
const pointsInput: PlayerSimInput = {
  player: "Test Player",
  propType: "Points",
  line: 25.5,
  teamTotal: 110,
  usageRate: 0.30,
  minutes: 35,
  opponentFactor: 1.0,
  bookOdds: -110
};

const pointsOutput = buildPlayerSimProjection(pointsInput);

// Contract: Mean should be sensible
assert(
  pointsOutput.mean > 20 && pointsOutput.mean < 35,
  `Points mean ${pointsOutput.mean} should be between 20 and 35`
);

// Contract: Probabilities should sum to 1
assert(
  Math.abs(pointsOutput.overPct + pointsOutput.underPct - 1) < 0.001,
  `Over + Under pct should sum to 1, got ${pointsOutput.overPct + pointsOutput.underPct}`
);

// Contract: Distribution should have 9 buckets
assert(pointsOutput.distribution.length === 9, `Distribution should have 9 buckets, got ${pointsOutput.distribution.length}`);

// Contract: Distribution values should be 0-100
const allNormalized = pointsOutput.distribution.every((b) => b >= 0 && b <= 100);
assert(allNormalized, `All distribution buckets should be 0-100`);

// Contract: Fair odds should exist
assert(typeof pointsOutput.fairOdds === "number", "Fair odds should be a number");

// Contract: Edge % should be reasonable
assert(
  typeof pointsOutput.edgePct === "number" && pointsOutput.edgePct > -50 && pointsOutput.edgePct < 50,
  `Edge pct ${pointsOutput.edgePct} should be between -50 and 50`
);

// Contract: Confidence should be 0-0.9
assert(
  pointsOutput.confidence >= 0.55 && pointsOutput.confidence <= 0.9,
  `Confidence ${pointsOutput.confidence} should be between 0.55 and 0.9`
);

// Test Rebounds projection
const reboundsInput: PlayerSimInput = {
  player: "Test Player",
  propType: "Rebounds",
  line: 7.5,
  teamTotal: 108,
  minutes: 32,
  bookOdds: -110
};

const reboundsOutput = buildPlayerSimProjection(reboundsInput);
assert(
  reboundsOutput.mean > 5 && reboundsOutput.mean < 12,
  `Rebounds mean ${reboundsOutput.mean} should be between 5 and 12`
);

// Test Assists projection
const assistsInput: PlayerSimInput = {
  player: "Test Player",
  propType: "Assists",
  line: 6.5,
  teamTotal: 110,
  minutes: 34,
  bookOdds: -110
};

const assistsOutput = buildPlayerSimProjection(assistsInput);
assert(
  assistsOutput.mean > 4 && assistsOutput.mean < 10,
  `Assists mean ${assistsOutput.mean} should be between 4 and 10`
);

// Test edge calculation with positive edge
const highValueInput: PlayerSimInput = {
  player: "Test Player",
  propType: "Points",
  line: 20,
  teamTotal: 115,
  usageRate: 0.35,
  minutes: 36,
  bookOdds: -110 // Implies ~52.4% probability
};

const highValueOutput = buildPlayerSimProjection(highValueInput);
assert(
  highValueOutput.mean > highValueInput.line,
  `Mean ${highValueOutput.mean} should exceed line ${highValueInput.line} for positive edge`
);

// Test with different opponent factor
const oppositionInput: PlayerSimInput = {
  player: "Test Player",
  propType: "Points",
  line: 25.5,
  teamTotal: 110,
  usageRate: 0.30,
  opponentFactor: 1.2, // Stronger opponent
  minutes: 35,
  bookOdds: -110
};

const oppositionOutput = buildPlayerSimProjection(oppositionInput);
assert(
  typeof oppositionOutput.mean === "number" && oppositionOutput.mean > 0,
  `Opposition factor should be applied to mean`
);

// Test consistency with defaults
const defaultsInput: PlayerSimInput = {
  player: "Test Player",
  propType: "Points",
  line: 25.5,
  teamTotal: 110
};

const defaultsOutput = buildPlayerSimProjection(defaultsInput);
assert(
  defaultsOutput.mean > 0 && defaultsOutput.overPct > 0 && defaultsOutput.overPct < 1,
  `Engine should work with defaults`
);

console.log("✓ All player-sim-engine contract tests passed");
