import assert from "node:assert/strict";

import { buildMlbDataReadinessReport } from "@/services/simulation/mlb-data-readiness";
import { buildMlbDailySimPickBoard } from "@/services/simulation/mlb-sim-pick-selector";
import type { CachedSimGameProjection, SimBoardSnapshot, SimMarketSnapshot } from "@/services/simulation/sim-snapshot-service";

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
        dataSource: "player-model:real/estimated+savant+retrosheet",
        projectedTotal: avgAway + avgHome,
        confidence: 0.66,
        volatilityIndex: 1.1,
        governor: { confidence: 0.66, noBet: false, tier: "watch", reasons: [] },
        calibration: { ece: 0.04 },
        runModel: { awayExpectedRuns: avgAway, homeExpectedRuns: avgHome }
      } as any
    }
  };
}

function edge(gameId: string, total: number): SimMarketSnapshot["edges"][number] {
  return {
    gameId,
    sportsbook: "consensus",
    market: { total, overPrice: -110, underPrice: -110, homeMoneyline: -120, awayMoneyline: +105, homeNoVigProbability: 0.53, awayNoVigProbability: 0.47 },
    marketQuality: { totalSourceCount: 8, moneylineSourceCount: 8, totalHold: 0.045, moneylineHold: 0.045, warnings: [] },
    edges: { totalRuns: 2.2, homeMoneyline: 0.04, awayMoneyline: -0.04 },
    signal: null,
    projection: game(gameId, "A", "B", 5, 5).projection
  } as any;
}

const games = [
  game("g1", "Red Sox", "Rays", 5.9, 4.7),
  game("g2", "Yankees", "Guardians", 5.1, 4.4),
  game("g3", "Phillies", "Blue Jays", 5.6, 3.6)
];
const edges = [edge("g1", 8), edge("g2", 7.5), edge("g3", 7.5)];
const board: SimBoardSnapshot = {
  generatedAt: "2026-06-09T22:30:00.000Z",
  expiresAt: "2026-06-10T03:00:00.000Z",
  stale: false,
  games,
  warnings: [],
  sourceStatus: {}
};
const market: SimMarketSnapshot = {
  generatedAt: "2026-06-09T22:35:00.000Z",
  expiresAt: "2026-06-10T03:00:00.000Z",
  stale: false,
  edges,
  lineCount: 18,
  gameCount: 3,
  warnings: [],
  sourceStatus: {}
};
const pickBoard = buildMlbDailySimPickBoard({ games, edges, generatedAt: "2026-06-09T22:40:00.000Z" });

const report = buildMlbDataReadinessReport({ board, market, pickBoard, now: new Date("2026-06-09T23:00:00.000Z") });

assert.equal(report.modelVersion, "mlb-data-readiness-v1");
assert.ok(report.score >= 80);
assert.equal(report.level, "READY");
assert.equal(report.summary.gameCount, 3);
assert.equal(report.summary.projectionCount, 3);
assert.equal(report.summary.marketLineCount, 18);
assert.equal(report.summary.matchedMarketGames, 3);
assert.equal(report.summary.realOrEstimatedPlayerRows, 3);
assert.equal(report.summary.calibratedRows, 3);
assert.equal(report.blockers.length, 0);

const weakReport = buildMlbDataReadinessReport({ board: null, market: null, pickBoard: null, now: new Date("2026-06-09T23:00:00.000Z") });
assert.equal(weakReport.level, "BLOCKED");
assert.ok(weakReport.blockers.includes("No MLB games loaded"));
assert.ok(weakReport.actions.includes("Refresh scoreboard/schedule cache"));

console.log("mlb-data-readiness.test.ts passed");
