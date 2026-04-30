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
  log5Weight: 0.12,
  home: {
    ...baseInput.home,
    teamStrengthContext: {
      scored: 9400,
      allowed: 9000,
      actualWins: 48,
      actualLosses: 34
    }
  },
  away: {
    ...baseInput.away,
    teamStrengthContext: {
      scored: 8900,
      allowed: 9250,
      actualWins: 34,
      actualLosses: 48
    }
  }
});

assert.ok(wired.teamStrengthPriors?.log5, "Log5 metadata should be exposed.");
const log5Probability = wired.teamStrengthPriors.log5.homeProbability;
if (log5Probability > baseline.winProbHome) {
  assert.ok(wired.winProbHome > baseline.winProbHome, "Log5 prior above the sim baseline should move home win probability up.");
  assert.ok(wired.winProbAway < baseline.winProbAway, "Away win probability should mirror the adjusted home probability.");
} else {
  assert.ok(wired.winProbHome < baseline.winProbHome, "Log5 prior below the sim baseline should move home win probability down.");
  assert.ok(wired.winProbAway > baseline.winProbAway, "Away win probability should mirror the adjusted home probability.");
}
assert.ok(
  wired.drivers.some((driver) => driver.includes("Log5 Pythagenpat prior")),
  "Sim drivers should expose the Log5 prior when active."
);
assert.ok(Math.abs(wired.winProbHome + wired.winProbAway - 1) < 0.001, "Win probabilities should still sum to 1.");

const unchangedWithoutScoring = simulateContextualGame({
  ...baseInput,
  home: { ...baseInput.home, teamStrengthContext: { scored: 9400 } },
  away: { ...baseInput.away, teamStrengthContext: { allowed: 9250 } }
});
assert.equal(unchangedWithoutScoring.winProbHome, baseline.winProbHome);
assert.ok(!unchangedWithoutScoring.drivers.some((driver) => driver.includes("Log5 Pythagenpat prior")));

const unsupportedLeague = simulateContextualGame({
  ...baseInput,
  leagueKey: "NHL",
  home: {
    ...baseInput.home,
    teamStrengthContext: {
      scored: 260,
      allowed: 240
    }
  },
  away: {
    ...baseInput.away,
    teamStrengthContext: {
      scored: 240,
      allowed: 260
    }
  }
});

assert.ok(
  !unsupportedLeague.drivers.some((driver) => driver.includes("Log5 Pythagenpat prior")),
  "Unsupported leagues should ignore the Log5 prior."
);
assert.ok(
  !unsupportedLeague.drivers.some((driver) => driver.includes("Linear win expectancy prior")),
  "Unsupported leagues should ignore the linear fallback prior."
);

const mlbBase = {
  ...baseInput,
  leagueKey: "MLB",
  home: {
    ...baseInput.home,
    offense: 4.5,
    defense: 4.2,
    pace: 38,
    teamStrengthContext: {
      scored: 720,
      allowed: 680
    }
  },
  away: {
    ...baseInput.away,
    offense: 4.2,
    defense: 4.4,
    pace: 38,
    teamStrengthContext: {
      scored: 690,
      allowed: 710
    }
  }
};

const mlbWithElo = simulateContextualGame({
  ...mlbBase,
  home: {
    ...mlbBase.home,
    mlbPregameEloContext: {
      rating: 1530,
      restDays: 2,
      milesTraveled: 0,
      pitcherRollingGameScore: 56,
      teamRollingGameScore: 51
    }
  },
  away: {
    ...mlbBase.away,
    mlbPregameEloContext: {
      rating: 1490,
      restDays: 1,
      milesTraveled: 1200
    }
  }
});
assert.ok(mlbWithElo.drivers.some((driver) => driver.includes("MLB Elo context prior")), "MLB Elo driver should appear when real ratings exist.");
assert.ok(mlbWithElo.teamStrengthPriors?.mlbElo?.inputsUsed.homePitcher);
assert.ok(mlbWithElo.teamStrengthPriors?.mlbElo?.inputsUsed.awayTravel);

const mlbMissingRating = simulateContextualGame({
  ...mlbBase,
  home: { ...mlbBase.home, mlbPregameEloContext: { restDays: 2 } },
  away: { ...mlbBase.away, mlbPregameEloContext: { milesTraveled: 1200 } }
});
assert.ok(!mlbMissingRating.drivers.some((driver) => driver.includes("MLB Elo context prior")), "Missing ratings should not blend MLB Elo.");
assert.equal(mlbMissingRating.teamStrengthPriors?.mlbElo?.homeProbability, null);

const mlbMissingPitcher = simulateContextualGame({
  ...mlbBase,
  home: { ...mlbBase.home, mlbPregameEloContext: { rating: 1500, pitcherRollingGameScore: 56 } },
  away: { ...mlbBase.away, mlbPregameEloContext: { rating: 1500 } }
});
assert.equal(mlbMissingPitcher.teamStrengthPriors?.mlbElo?.homeAdjustment.pitcherAdjustment, 0);

console.log("contextual-linear-win-prior tests passed");
