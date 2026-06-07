import assert from "node:assert/strict";

import { extractMlbCandidatePickFromSnapshot } from "@/services/simulation/mlb-candidate-pick-ledger";

const attackHome = extractMlbCandidatePickFromSnapshot({
  model_home_win_pct: 0.61,
  model_away_win_pct: 0.39,
  market_home_win_pct: 0.55,
  prediction_json: {
    topSignal: {
      market: "home_ml",
      takeAction: { action: "ATTACK", roiEligible: true }
    },
    mlbIntel: {
      calibration: { calibratedHomeWinPct: 0.6 },
      market: { homeOddsAmerican: -135, homeNoVigProbability: 0.55 }
    }
  }
});

assert.equal(attackHome.eligible, true);
assert.equal(attackHome.market, "moneyline");
assert.equal(attackHome.side, "HOME");
assert.equal(attackHome.action, "ATTACK");
assert.equal(attackHome.calibratedProbability, 0.6);
assert.equal(attackHome.marketNoVigProbability, 0.55);
assert.equal(attackHome.edge, 0.05);
assert.equal(attackHome.currentAmericanOdds, -135);

const playAway = extractMlbCandidatePickFromSnapshot({
  model_home_win_pct: 0.44,
  model_away_win_pct: 0.56,
  market_home_win_pct: 0.51,
  prediction_json: {
    topSignal: {
      market: "away_ml",
      takeAction: { action: "PLAY", roiEligible: true }
    },
    mlbIntel: {
      calibration: { calibratedHomeWinPct: 0.43 },
      market: { awayOddsAmerican: +120, homeNoVigProbability: 0.51 }
    }
  }
});

assert.equal(playAway.eligible, true);
assert.equal(playAway.side, "AWAY");
assert.ok(Math.abs((playAway.calibratedProbability ?? 0) - 0.57) < 1e-9);
assert.ok(Math.abs((playAway.marketNoVigProbability ?? 0) - 0.49) < 1e-9);
assert.equal(playAway.currentAmericanOdds, 120);

const watch = extractMlbCandidatePickFromSnapshot({
  model_home_win_pct: 0.54,
  prediction_json: {
    topSignal: {
      market: "home_ml",
      takeAction: { action: "WATCH", roiEligible: false }
    }
  }
});

assert.equal(watch.eligible, false);
assert.match(watch.reason ?? "", /not ATTACK\/PLAY/);

console.log("mlb-candidate-pick-ledger.test.ts passed");
