import assert from "node:assert/strict";

import { buildFranchiseEliteBatters, scoreFranchiseEliteBatter } from "@/services/simulation/mlb-franchise-elite-batter-board";
import type { HitterProjection } from "@/services/simulation/mlb-franchise-game-stats";

function hitter(overrides: Partial<HitterProjection>): HitterProjection {
  return {
    playerId: "p",
    name: "Player",
    team: "Team",
    teamSide: "home",
    battingOrder: 8,
    plateAppearances: 3.8,
    hits: 0.7,
    totalBases: 1,
    homeRuns: 0.03,
    runs: 0.35,
    rbi: 0.35,
    strikeouts: 1,
    stolenBaseChance: 0.05,
    actual: null,
    ...overrides
  };
}

const elitePower = hitter({
  playerId: "power",
  name: "Power Bat",
  battingOrder: 2,
  plateAppearances: 4.7,
  hits: 1.45,
  totalBases: 3.2,
  homeRuns: 0.36,
  runs: 0.75,
  rbi: 0.85,
  strikeouts: 0.9,
  stolenBaseChance: 0.18
});

const contactFloor = hitter({
  playerId: "contact",
  name: "Contact Bat",
  battingOrder: 1,
  plateAppearances: 4.8,
  hits: 1.35,
  totalBases: 1.9,
  homeRuns: 0.08,
  runs: 0.7,
  rbi: 0.55,
  strikeouts: 0.45,
  stolenBaseChance: 0.24
});

const lowSignal = hitter({
  playerId: "low",
  name: "Low Signal",
  battingOrder: 9,
  plateAppearances: 3.5,
  hits: 0.55,
  totalBases: 0.8,
  homeRuns: 0.01,
  runs: 0.25,
  rbi: 0.25,
  strikeouts: 1.25,
  stolenBaseChance: 0.02
});

const riskTrap = hitter({
  playerId: "risk",
  name: "Risk Trap",
  battingOrder: 4,
  plateAppearances: 4.2,
  hits: 0.75,
  totalBases: 1.9,
  homeRuns: 0.28,
  runs: 0.55,
  rbi: 0.65,
  strikeouts: 1.55,
  stolenBaseChance: 0.03
});

for (const row of [elitePower, contactFloor, lowSignal, riskTrap]) {
  const score = scoreFranchiseEliteBatter(row);
  assert.ok(score >= 0 && score <= 100, `${row.name} score out of bounds`);
}

const board = buildFranchiseEliteBatters([lowSignal, riskTrap, contactFloor, elitePower]);

assert.equal(board[0].playerId, "power");
assert.ok(board.find((row) => row.playerId === "contact")!.eliteScore > board.find((row) => row.playerId === "low")!.eliteScore);
assert.ok(board.find((row) => row.playerId === "risk")!.tags.includes("Risk trap"));
assert.ok(board.find((row) => row.playerId === "power")!.tags.includes("Power ceiling"));
assert.ok(["A+", "A", "B+", "B", "Watch", "Fade"].includes(board[0].grade));
assert.ok(new Set(board.map((row) => row.eliteScore)).size > 2, "elite board should not saturate every bat to the same score");

console.log("mlb-franchise-elite-batter-board.test.ts passed");
