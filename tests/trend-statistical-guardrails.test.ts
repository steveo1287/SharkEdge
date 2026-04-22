import assert from "node:assert/strict";

import { scoreTrendCandidate } from "@/services/trends/discovery/candidate-scorer";
import { getOutOfSampleDiagnostics } from "@/services/trends/validation/out-of-sample";
import type { HistoricalBetOpportunity, TrendCondition } from "@/services/trends/types";

function makeRow(id: string, gameDate: string, won: boolean, profitUnits: number): HistoricalBetOpportunity {
  return {
    rowId: id,
    eventId: `event-${id}`,
    gameDate,
    season: 2025,
    sport: "BASKETBALL",
    league: "NBA",
    marketType: "spread",
    side: "home",
    teamName: "Boston Celtics",
    opponentName: "Miami Heat",
    homeTeam: "Boston Celtics",
    awayTeam: "Miami Heat",
    homeAway: "home",
    favoriteOrDog: "favorite",
    line: -4.5,
    oddsAmerican: -110,
    closeLine: -5,
    closeOddsAmerican: -110,
    won,
    push: false,
    profitUnits,
    clvCents: won ? 6 : -2,
    beatClose: won,
    daysRest: 2,
    opponentRestDays: 1,
    isBackToBack: false,
    recentWinRate: 0.58,
    recentMargin: 5,
    lineBucket: "fav_short",
    totalBucket: "mid",
    metadata: {
      conference: "east"
    }
  };
}

const alwaysMatch: TrendCondition[] = [
  {
    field: "teamName",
    operator: "eq",
    value: "Boston Celtics",
    label: "Boston Celtics",
    group: "team"
  }
];

const thinRows = Array.from({ length: 12 }, (_, index) => {
  const won = index < 9;
  return makeRow(`thin-${index}`, `2025-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`, won, won ? 0.91 : -1);
});

const robustRows = Array.from({ length: 200 }, (_, index) => {
  const won = index < 114;
  const month = Math.floor(index / 28) + 1;
  const day = (index % 28) + 1;
  return makeRow(`robust-${index}`, `2025-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00.000Z`, won, won ? 0.91 : -1);
});

const thinScore = scoreTrendCandidate(thinRows, alwaysMatch).score;
const robustScore = scoreTrendCandidate(robustRows, alwaysMatch).score;
assert.ok(robustScore > thinScore, "robust sample should outscore a tiny hot streak");

const collapseRows = [
  ...Array.from({ length: 60 }, (_, index) => makeRow(`train-${index}`, `2025-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`, true, 0.91)),
  ...Array.from({ length: 20 }, (_, index) => makeRow(`test-${index}`, `2025-04-${String((index % 20) + 1).padStart(2, "0")}T00:00:00.000Z`, index < 6, index < 6 ? 0.91 : -1))
];
const diagnostics = getOutOfSampleDiagnostics(collapseRows, alwaysMatch);
assert.ok(diagnostics.penalty >= 20, "oos collapse should create a material penalty");
assert.ok(diagnostics.score < 0.75, "oos collapse should cap the validation score");

console.log("trend statistical guardrails test passed");
