import assert from "node:assert/strict";

import { extractMlbPlayerMarketOpportunitiesFromSnapshots } from "@/services/simulation/mlb-player-market-opportunities";

const now = new Date("2026-06-07T12:00:00.000Z");
const start = new Date("2026-06-07T18:00:00.000Z");

const promoted = {
  source: "player_prop",
  market: "hitter_hits",
  label: "Test Hitter over 0.5 hits",
  gameId: "game-1",
  eventLabel: "AWY @ HME",
  team: "AWY",
  playerId: "p1",
  playerName: "Test Hitter",
  side: "OVER",
  line: 0.5,
  projectedValue: 1.2,
  rawProbability: 0.62,
  calibratedProbability: 0.68,
  confidence: 0.7,
  minEdgeRequired: 0.03,
  edgeVsBaseline: 0.18,
  calibrationStatus: "LEARNED",
  decision: "PROMOTE",
  reason: "clears"
};

const watch = {
  ...promoted,
  market: "nrfi",
  label: "No run first inning",
  source: "inning_market",
  playerId: null,
  playerName: null,
  team: null,
  line: null,
  rawProbability: 0.56,
  calibratedProbability: 0.58,
  confidence: 0.6,
  edgeVsBaseline: 0.08,
  decision: "WATCH"
};

const pass = {
  ...promoted,
  market: "hitter_stolen_bases",
  label: "Test Hitter over 0.5 stolen bases",
  rawProbability: 0.42,
  calibratedProbability: 0.42,
  confidence: 0.35,
  edgeVsBaseline: 0,
  calibrationStatus: "UNTRAINED",
  decision: "PASS"
};

const rows = [
  {
    game_id: "game-1",
    event_label: "AWY @ HME",
    start_time: start,
    captured_at: now,
    model_version: "main-sim-brain-v1+v8-promotion-gate",
    prediction_json: {
      mlbIntel: {
        playerImpact: {
          playerMarketSurface: {
            modelVersion: "mlb-calibrated-player-market-surface-v1",
            profileStatus: "LEARNED",
            profileSampleSize: 500,
            profileTrainedAt: now.toISOString(),
            marketCount: 3,
            promotedCount: 1,
            watchCount: 1,
            passCount: 1,
            markets: [promoted, watch, pass],
            promoted: [promoted],
            warnings: []
          }
        }
      }
    }
  },
  {
    game_id: "game-1",
    event_label: "AWY @ HME",
    start_time: start,
    captured_at: new Date("2026-06-07T11:00:00.000Z"),
    model_version: "main-sim-brain-v1+v8-promotion-gate",
    prediction_json: {
      mlbIntel: {
        playerImpact: {
          playerMarketSurface: {
            modelVersion: "mlb-calibrated-player-market-surface-v1",
            profileStatus: "LEARNED",
            profileSampleSize: 500,
            profileTrainedAt: now.toISOString(),
            marketCount: 1,
            promotedCount: 1,
            watchCount: 0,
            passCount: 0,
            markets: [promoted],
            promoted: [promoted],
            warnings: []
          }
        }
      }
    }
  }
];

const feed = extractMlbPlayerMarketOpportunitiesFromSnapshots(rows, { limit: 10 });
assert.equal(feed.ok, true);
assert.equal(feed.source, "mlb_model_snapshot_ledger");
assert.equal(feed.total, 2);
assert.equal(feed.promotedCount, 1);
assert.equal(feed.watchCount, 1);
assert.equal(feed.passCount, 0);
assert.equal(feed.opportunities[0].decision, "PROMOTE");
assert.equal(feed.opportunities[0].market, "hitter_hits");
assert.equal(feed.opportunities[1].decision, "WATCH");
assert.equal(feed.warnings.length, 0);

const withPass = extractMlbPlayerMarketOpportunitiesFromSnapshots(rows, { limit: 10, includePass: true });
assert.equal(withPass.total, 3);
assert.equal(withPass.passCount, 1);

const missing = extractMlbPlayerMarketOpportunitiesFromSnapshots([{ ...rows[0], game_id: "game-2", prediction_json: {} }], { limit: 10 });
assert.equal(missing.total, 0);
assert.ok(missing.warnings[0].includes("No player market surface"));

console.log("mlb-player-market-opportunities.test.ts passed");
