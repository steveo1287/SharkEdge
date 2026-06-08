import assert from "node:assert/strict";

import { qualityGateMlbBatterPropQuotes } from "@/services/simulation/mlb-batter-prop-quote-quality";
import type { MlbBatterBookPropQuoteWithPlayer } from "@/services/simulation/mlb-batter-prop-edge-board";
import type { MlbHitterPerGameProjection, MlbPlayerStatProjectionGame } from "@/services/simulation/mlb-player-stat-inning-engine";

function hitter(id: string, name: string, team: string): MlbHitterPerGameProjection {
  return {
    playerId: id,
    playerName: name,
    team,
    battingOrder: 1,
    expectedPlateAppearances: 4.6,
    hitProbability: 0.68,
    expectedHits: 1.05,
    expectedTotalBases: 1.75,
    expectedHomeRuns: 0.14,
    expectedRuns: 0.62,
    expectedRbi: 0.58,
    expectedWalks: 0.4,
    expectedStrikeouts: 0.88,
    stealAttemptProbability: 0.04,
    stolenBaseProbability: 0.02,
    confidence: 0.78,
    batterStatProfile: {
      plateAppearances: 520,
      xAvg: 0.276,
      xSlug: 0.48,
      xWoba: 0.36,
      iso: 0.205,
      hitRate: 0.25,
      walkRate: 0.09,
      strikeoutRate: 0.2,
      hrRate: 0.036,
      barrelRate: 0.105,
      hardHitRate: 0.46,
      avgExitVelocity: 90.1,
      tbPerHit: 1.72,
      confidence: 0.81,
      drivers: ["test-profile"]
    },
    advancedMatchup: {} as MlbHitterPerGameProjection["advancedMatchup"],
    plateAppearanceOutcome: {} as MlbHitterPerGameProjection["plateAppearanceOutcome"],
    eliteContext: {} as MlbHitterPerGameProjection["eliteContext"],
    statDistribution: {
      hit0Probability: 0.32,
      hit1PlusProbability: 0.68,
      hit2PlusProbability: 0.29,
      hit3PlusProbability: 0.08,
      totalBases1PlusProbability: 0.72,
      totalBases2PlusProbability: 0.49,
      totalBases3PlusProbability: 0.31,
      totalBases4PlusProbability: 0.18,
      homeRunProbability: 0.12,
      walk1PlusProbability: 0.33,
      strikeout0Probability: 0.41,
      strikeout1PlusProbability: 0.59,
      strikeout2PlusProbability: 0.24,
      strikeout3PlusProbability: 0.07,
      volatility: 1.08,
      marketVolatility: { hits: 1, totalBases: 1.1, homeRun: 1.2, walks: 1, strikeouts: 1 },
      distributionConfidence: 0.76,
      notes: []
    },
    propSurface: { modelVersion: "mlb-batter-prop-surface-v1", outcomes: [], strongest: [], notes: [] },
    reasons: []
  };
}

const projection: MlbPlayerStatProjectionGame = {
  modelVersion: "mlb-player-stat-projection-v1",
  awayTeam: "CHC",
  homeTeam: "STL",
  awayHitters: [hitter("p1", "Test Hitter Jr.", "CHC")],
  homeHitters: [hitter("p2", "Power Bat", "STL")],
  awayStarter: null,
  homeStarter: null,
  warnings: []
};

const quotes: MlbBatterBookPropQuoteWithPlayer[] = [
  { book: "DraftKings", playerName: "Test Hitter", team: "CHC", market: "HITS", line: 0.5, side: "OVER", americanOdds: -140, updatedAt: "2026-06-08T12:00:00Z" },
  { book: "DraftKings", playerName: "Test Hitter", team: "CHC", market: "HITS", line: 0.5, side: "OVER", americanOdds: -138, updatedAt: "2026-06-08T12:02:00Z" },
  { book: "FanDuel", playerId: "p1", playerName: "Test Hitter Jr.", team: "CHC", market: "HITS", line: 0.5, side: "UNDER", americanOdds: 110, updatedAt: "2026-06-08T12:01:00Z" },
  { book: "FanDuel", playerName: "Power Bat", team: "STL", market: "TOTAL_BASES", line: 1.5, side: "OVER", americanOdds: 120, updatedAt: "2026-06-08T11:00:00Z" },
  { book: "BadBook", playerName: "Unknown Guy", team: "CHC", market: "HITS", line: 0.5, side: "OVER", americanOdds: 100, updatedAt: "2026-06-08T12:00:00Z" }
];

const report = qualityGateMlbBatterPropQuotes({
  projection,
  quotes,
  config: {
    now: "2026-06-08T12:10:00Z",
    maxQuoteAgeMinutes: 20,
    requirePlayerMapping: true,
    minBooksPerPlayerMarket: 2
  }
});

assert.equal(report.modelVersion, "mlb-batter-prop-quote-quality-v1");
assert.equal(report.inputCount, 5);
assert.equal(report.acceptedCount, 2);
assert.equal(report.mappedCount, 3);
assert.equal(report.duplicateCount, 1);
assert.equal(report.staleCount, 1);
assert.equal(report.unmatchedCount, 1);
assert.equal(report.minQualityScore, 70);
assert.equal(report.qualityGatePassed, false);
assert.ok(report.qualityGateReason?.includes("below required"));
assert.ok(report.qualityScore < 70);
assert.ok(report.warnings.some((warning) => warning.includes("stale")));
assert.ok(report.warnings.some((warning) => warning.includes("could not be mapped")));
assert.ok(report.warnings.some((warning) => warning.includes("below required")));
assert.ok(report.issues.some((issue) => issue.reason.includes("Duplicate quote collapsed")));
assert.ok(report.issues.some((issue) => issue.reason.includes("Thin prop market")) === false);

const acceptedOver = report.quotes.find((quote) => quote.book === "DraftKings" && quote.side === "OVER");
assert.ok(acceptedOver);
assert.equal(acceptedOver!.playerId, "p1");
assert.equal(acceptedOver!.playerName, "Test Hitter Jr.");
assert.equal(acceptedOver!.team, "CHC");
assert.equal(acceptedOver!.americanOdds, -138);

const permissive = qualityGateMlbBatterPropQuotes({
  projection,
  quotes: [quotes[4]],
  config: { now: "2026-06-08T12:10:00Z", requirePlayerMapping: false, minQualityScore: 1 }
});
assert.equal(permissive.acceptedCount, 1);
assert.equal(permissive.unmatchedCount, 1);
assert.ok(permissive.issues.some((issue) => issue.severity === "WARN"));
assert.equal(permissive.qualityGatePassed, true);

const cleanReport = qualityGateMlbBatterPropQuotes({
  projection,
  quotes: [quotes[1], quotes[2]],
  config: { now: "2026-06-08T12:10:00Z", minQualityScore: 70 }
});
assert.equal(cleanReport.qualityGatePassed, true);
assert.equal(cleanReport.qualityGateReason, null);
assert.equal(cleanReport.qualityScore, 100);

console.log("mlb-batter-prop-quote-quality.test.ts passed");
