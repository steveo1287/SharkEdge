import assert from "node:assert/strict";

import { simulateContextualGame } from "@/services/simulation/contextual-game-sim";

const baseInput = {
  leagueKey: "NBA",
  home: {
    teamName: "Home Regression Team",
    offense: 112,
    defense: 110,
    pace: 99
  },
  away: {
    teamName: "Away Regression Team",
    offense: 112,
    defense: 110,
    pace: 99
  },
  marketAnchor: {
    spreadHome: 0,
    total: 224
  },
  samples: 1200,
  seed: 9001
};

const baseline = simulateContextualGame(baseInput);
const wired = simulateContextualGame({
  ...baseInput,
  linearWinExpectancyWeight: 0.12,
  home: {
    ...baseInput.home,
    linearWinExpectancy: {
      scored: 9400,
      allowed: 9000,
      actualWins: 48,
      actualLosses: 34
    }
  },
  away: {
    ...baseInput.away,
    linearWinExpectancy: {
      scored: 8900,
      allowed: 9250,
      actualWins: 34,
      actualLosses: 48
    }
  }
});

assert.ok(wired.winProbHome > baseline.winProbHome, "Linear prior should move home win probability toward stronger scoring differential.");
assert.ok(wired.winProbAway < baseline.winProbAway, "Away win probability should mirror the adjusted home probability.");
assert.ok(
  wired.drivers.some((driver) => driver.includes("Linear win expectancy prior")),
  "Sim drivers should expose the linear win expectancy prior when active."
);
assert.ok(Math.abs(wired.winProbHome + wired.winProbAway - 1) < 0.001, "Win probabilities should still sum to 1.");

const unsupportedLeague = simulateContextualGame({
  ...baseInput,
  leagueKey: "NHL",
  home: {
    ...baseInput.home,
    linearWinExpectancy: {
      scored: 260,
      allowed: 240
    }
  },
  away: {
    ...baseInput.away,
    linearWinExpectancy: {
      scored: 240,
      allowed: 260
    }
  }
});

assert.ok(
  !unsupportedLeague.drivers.some((driver) => driver.includes("Linear win expectancy prior")),
  "Unsupported leagues should ignore the linear prior."
);

console.log("contextual-linear-win-prior tests passed");
