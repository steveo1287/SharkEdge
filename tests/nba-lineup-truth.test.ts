import assert from "node:assert/strict";

import { buildNbaLineupTruth } from "@/services/simulation/nba-lineup-truth";
import type { NbaLineupImpact } from "@/services/simulation/nba-player-impact";

const now = "2026-05-03T18:00:00.000Z";
const fresh = "2026-05-03T17:30:00.000Z";
const stale = "2026-05-03T14:00:00.000Z";
const gameTime = "2026-05-03T20:00:00.000Z";

function cleanImpact(teamName: string): NbaLineupImpact {
  return {
    teamName,
    players: [
      {
        playerName: `${teamName} Starter`,
        teamName,
        status: "available",
        minutesImpact: 32,
        usageImpact: 6,
        netRatingImpact: 3,
        offensiveImpact: 2,
        defensiveImpact: 1,
        volatilityImpact: 0.4,
        source: "real"
      }
    ],
    availabilityPenalty: 0,
    offensivePenalty: 0,
    defensivePenalty: 0,
    usageShock: 0,
    volatilityBoost: 1,
    activeCoreHealth: 100,
    summary: "Lineup impact is light."
  };
}

const green = buildNbaLineupTruth({
  awayTeam: "Away",
  homeTeam: "Home",
  awayImpact: cleanImpact("Away"),
  homeImpact: cleanImpact("Home"),
  feedLastUpdatedAt: fresh,
  now,
  gameTime,
  projectionModules: [{ label: "Rotation availability", status: "real" }],
  projectionReasons: ["rotation minutes confirmed"],
  volatilityIndex: 1.1
});

assert.equal(green.status, "GREEN");
assert.equal(green.injuryReportFresh, true);
assert.equal(green.minutesTrusted, true);
assert.equal(green.starQuestionable, false);
assert.equal(green.highUsageOut, false);
assert.equal(green.lateScratchRisk, false);
assert.equal(green.blockers.length, 0);

const staleTruth = buildNbaLineupTruth({
  awayTeam: "Away",
  homeTeam: "Home",
  awayImpact: cleanImpact("Away"),
  homeImpact: cleanImpact("Home"),
  feedLastUpdatedAt: stale,
  now,
  gameTime,
  projectionModules: [{ label: "Rotation availability", status: "real" }],
  projectionReasons: ["rotation minutes confirmed"],
  volatilityIndex: 1.1
});

assert.equal(staleTruth.status, "RED");
assert.equal(staleTruth.injuryReportFresh, false);
assert.ok(staleTruth.blockers.includes("stale injury report"));

const questionableStarImpact = cleanImpact("Home");
questionableStarImpact.players = [
  {
    playerName: "Home Star",
    teamName: "Home",
    status: "questionable",
    minutesImpact: 36,
    usageImpact: 9,
    netRatingImpact: 5,
    offensiveImpact: 4,
    defensiveImpact: 1,
    volatilityImpact: 2,
    source: "real"
  }
];

const questionableStar = buildNbaLineupTruth({
  awayTeam: "Away",
  homeTeam: "Home",
  awayImpact: cleanImpact("Away"),
  homeImpact: questionableStarImpact,
  feedLastUpdatedAt: fresh,
  now,
  gameTime,
  projectionModules: [{ label: "Rotation availability", status: "real" }],
  projectionReasons: ["rotation minutes confirmed"],
  volatilityIndex: 1.2
});

assert.equal(questionableStar.status, "RED");
assert.equal(questionableStar.starQuestionable, true);
assert.equal(questionableStar.lateScratchRisk, true);
assert.ok(questionableStar.blockers.some((blocker) => blocker.includes("questionable")));
assert.ok(questionableStar.playerFlags.some((flag) => flag.playerName === "Home Star" && flag.usageTier === "STAR" && flag.risk === "HIGH"));

const outHighUsageImpact = cleanImpact("Away");
outHighUsageImpact.players = [
  {
    playerName: "Away High Usage",
    teamName: "Away",
    status: "out",
    minutesImpact: 28,
    usageImpact: 5,
    netRatingImpact: 2.5,
    offensiveImpact: 1.8,
    defensiveImpact: 0.7,
    volatilityImpact: 1.5,
    source: "real"
  }
];

const highUsageOut = buildNbaLineupTruth({
  awayTeam: "Away",
  homeTeam: "Home",
  awayImpact: outHighUsageImpact,
  homeImpact: cleanImpact("Home"),
  feedLastUpdatedAt: fresh,
  now,
  gameTime,
  projectionModules: [{ label: "Player feed", status: "real" }],
  projectionReasons: ["player feed available"],
  volatilityIndex: 1.2
});

assert.equal(highUsageOut.status, "RED");
assert.equal(highUsageOut.highUsageOut, true);
assert.equal(highUsageOut.minutesTrusted, false);
assert.ok(highUsageOut.blockers.some((blocker) => blocker.includes("without trusted minutes")));

const synthetic = buildNbaLineupTruth({
  awayTeam: "Away",
  homeTeam: "Home",
  awayImpact: { ...cleanImpact("Away"), players: [], summary: "No confirmed injury-impact feed available; lineup model is neutral." },
  homeImpact: { ...cleanImpact("Home"), players: [], summary: "No confirmed injury-impact feed available; lineup model is neutral." },
  feedLastUpdatedAt: fresh,
  now,
  gameTime,
  projectionModules: [{ label: "Rotation availability", status: "real" }],
  projectionReasons: ["rotation minutes confirmed"],
  volatilityIndex: 1.1
});

assert.equal(synthetic.status, "YELLOW");
assert.ok(synthetic.blockers.includes("no confirmed injury-impact feed"));
assert.ok(synthetic.projectedStarterConfidence < 0.82);

console.log("nba-lineup-truth.test.ts passed");
