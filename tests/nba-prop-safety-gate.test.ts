import assert from "node:assert/strict";

import { applyNbaPropSafetyGate } from "@/services/props/nba-prop-safety-gate";
import type { PropCardView } from "@/lib/types/domain";
import type { NbaFullStatProjectionView } from "@/services/simulation/nba-full-stat-projection-view";

const baseProp: PropCardView = {
  id: "prop-1",
  gameId: "game-1",
  leagueKey: "NBA",
  sportsbook: { id: "book-1", key: "dk", name: "DraftKings", region: "US" },
  player: { id: "player-1", leagueId: "nba", teamId: "team-1", name: "Blocked Player", position: "G", externalIds: {}, status: "ACTIVE" },
  team: { id: "team-1", leagueId: "nba", name: "Home", abbreviation: "HME", externalIds: {} },
  opponent: { id: "team-2", leagueId: "nba", name: "Away", abbreviation: "AWY", externalIds: {} },
  marketType: "player_points",
  side: "OVER",
  line: 21.5,
  oddsAmerican: -110,
  sportsbookCount: 4,
  expectedValuePct: 6.5,
  valueFlag: "MARKET_PLUS",
  confidenceBand: "high",
  confidenceScore: 82,
  evProfile: {
    edgePct: 5.4,
    evPerUnit: 0.065,
    minimumBeProb: 0.524,
    fairLineGap: 18,
    rankScore: 88,
    kellyFraction: 0.012
  },
  analyticsSummary: {
    tags: ["ORIGINAL"],
    reason: "Original model liked the price.",
    sampleSize: 12,
    bookCount: 4
  },
  edgeScore: { score: 86, label: "Elite" }
};

const blockedView: NbaFullStatProjectionView = {
  ok: true,
  generatedAt: new Date().toISOString(),
  hasDatabase: true,
  eventId: null,
  playerCount: 1,
  statTileCount: 1,
  warnings: [],
  players: [
    {
      playerId: "player-1",
      playerName: "Blocked Player",
      teamName: "Home",
      projectedMinutes: 31.2,
      minutes: {
        projectedMinutes: 31.2,
        floorMinutes: 21.4,
        ceilingMinutes: 36.8,
        confidence: 0.43,
        role: "starter",
        roleConfidence: 0.7,
        starterConfidence: 0.77,
        rotationStability: 0.4,
        minutesVolatility: 0.71,
        starterLikely: true,
        closingLineupLikely: false,
        blowoutRisk: 0.22,
        foulRisk: 0.16,
        injuryRisk: 0.67,
        restAdjustment: 1,
        blowoutAdjustment: 0.96,
        injuryAdjustment: 0.84,
        roleAdjustment: 1,
        blockers: ["stale injury report"],
        warnings: ["rotation stability below 0.45"],
        drivers: ["baseline 32 minutes"]
      },
      stats: [
        {
          statKey: "player_points",
          label: "PTS",
          meanValue: 22.1,
          medianValue: 22.1,
          stdDev: 5.2,
          marketLine: 21.5,
          overProbability: 0.54,
          underProbability: 0.46,
          confidence: 0.41,
          modelOnly: false,
          noBet: true,
          blockers: ["lineup truth RED"],
          warnings: []
        }
      ]
    }
  ]
};

const gated = applyNbaPropSafetyGate({ props: [baseProp], fullStatProjectionView: blockedView });
assert.equal(gated.summary.gatedCount, 1);
assert.ok(gated.summary.reasonCounts.some((entry) => entry.reason === "lineup truth RED"));
assert.ok(gated.summary.reasonCounts.some((entry) => entry.reason === "stale injury report"));

const prop = gated.props[0];
assert.equal(prop.expectedValuePct, 0);
assert.equal(prop.valueFlag, "NONE");
assert.equal(prop.confidenceBand, "pass");
assert.equal(prop.confidenceScore, 35);
assert.equal(prop.edgeScore.score, 45);
assert.equal(prop.edgeScore.label, "Pass");
assert.equal(prop.evProfile?.kellyFraction, 0);
assert.equal(prop.evProfile?.edgePct, 0);
assert.equal(prop.evProfile?.evPerUnit, 0);
assert.ok(prop.supportNote?.includes("NBA safety gate forced PASS/WATCH"));
assert.ok(prop.analyticsSummary?.tags.includes("NBA_SAFETY_GATE"));
assert.ok(prop.analyticsSummary?.tags.includes("PASS_ONLY"));
assert.equal(prop.reasons?.[0]?.label, "NBA safety gate");
assert.equal(prop.reasons?.[0]?.tone, "danger");

const cleanView: NbaFullStatProjectionView = {
  ...blockedView,
  players: [
    {
      ...blockedView.players[0],
      minutes: {
        ...blockedView.players[0].minutes!,
        confidence: 0.82,
        rotationStability: 0.75,
        minutesVolatility: 0.32,
        injuryAdjustment: 0.98,
        blockers: [],
        warnings: []
      },
      stats: [
        {
          ...blockedView.players[0].stats[0],
          noBet: false,
          blockers: [],
          confidence: 0.74
        }
      ]
    }
  ]
};
const clean = applyNbaPropSafetyGate({ props: [baseProp], fullStatProjectionView: cleanView });
assert.equal(clean.summary.gatedCount, 0);
assert.equal(clean.props[0].expectedValuePct, 6.5);
assert.equal(clean.props[0].valueFlag, "MARKET_PLUS");
assert.equal(clean.props[0].edgeScore.label, "Elite");

console.log("nba-prop-safety-gate.test.ts passed");
