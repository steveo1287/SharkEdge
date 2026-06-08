import assert from "node:assert/strict";

import { buildMlbDailySimPickBoard } from "@/services/simulation/mlb-sim-pick-selector";
import type { CachedSimGameProjection, SimMarketSnapshot } from "@/services/simulation/sim-snapshot-service";

function game(id: string, away: string, home: string, avgAway: number, avgHome: number): CachedSimGameProjection {
  return {
    game: { id, label: `${away} @ ${home}`, startTime: "2026-06-09T23:00:00.000Z", status: "PREGAME", leagueKey: "MLB", leagueLabel: "MLB" },
    projection: {
      matchup: { away, home },
      distribution: { awayWinPct: avgAway > avgHome ? 0.58 : 0.42, homeWinPct: avgHome >= avgAway ? 0.58 : 0.42, avgAway, avgHome } as any,
      read: "test read",
      statSheet: {} as any,
      nbaIntel: null,
      mlbIntel: {
        projectedTotal: avgAway + avgHome,
        confidence: 0.62,
        volatilityIndex: 1.1,
        governor: { confidence: 0.66, noBet: false, tier: "watch", reasons: [] },
        calibration: { ece: 0.04 },
        runModel: { awayExpectedRuns: avgAway, homeExpectedRuns: avgHome }
      } as any
    }
  };
}

function edge(gameId: string, total: number, overPrice = -110, underPrice = -110): SimMarketSnapshot["edges"][number] {
  return {
    gameId,
    sportsbook: "consensus",
    market: {
      total,
      overPrice,
      underPrice,
      homeMoneyline: -120,
      awayMoneyline: +105,
      homeNoVigProbability: 0.53,
      awayNoVigProbability: 0.47
    },
    marketQuality: { totalSourceCount: 8, moneylineSourceCount: 8, totalHold: 0.045, moneylineHold: 0.045, warnings: [] },
    edges: { totalRuns: 2.4, homeMoneyline: 0.04, awayMoneyline: -0.04 },
    signal: null,
    projection: game(gameId, "A", "B", 5, 5).projection
  } as any;
}

const games = [
  game("g1", "Red Sox", "Rays", 5.9, 4.7),
  game("g2", "Yankees", "Guardians", 5.1, 4.4),
  game("g3", "Phillies", "Blue Jays", 5.6, 3.6),
  game("g4", "Astros", "Angels", 6.5, 4.3)
];
const edges = [edge("g1", 8), edge("g2", 7.5), edge("g3", 7.5), edge("g4", 8.5)];

const board = buildMlbDailySimPickBoard({ games, edges, generatedAt: "2026-06-09T00:00:00.000Z" });

assert.equal(board.modelVersion, "mlb-sim-pick-selector-v1");
assert.equal(board.summary.gameCount, 4);
assert.ok(board.allPicks.some((pick) => pick.market === "MONEYLINE"));
assert.ok(board.allPicks.some((pick) => pick.market === "OVER_UNDER"));
assert.ok(board.allPicks.some((pick) => pick.market === "F5_MONEYLINE"));
assert.ok(board.allPicks.some((pick) => pick.market === "F5_TOTAL"));
assert.ok(board.allPicks.some((pick) => pick.market === "NRFI"));
assert.ok(board.officialPlays.length + board.qualifiedLeans.length + board.watchlist.length > 0);
assert.ok(board.pick3Parlays.length > 0);
assert.equal(board.pick3Parlays[0].legs.length, 3);
assert.equal(new Set(board.pick3Parlays[0].legs.map((leg) => leg.gameId)).size, 3);
assert.ok(board.pick3Parlays[0].modelProbability > 0 && board.pick3Parlays[0].modelProbability < 1);
assert.ok(Number.isFinite(board.pick3Parlays[0].fairAmericanOdds));

console.log("mlb-sim-pick-selector.test.ts passed");
