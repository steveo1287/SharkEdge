import assert from "node:assert/strict";

import {
  bucketForProbability,
  computeBrier,
  computeLogLoss,
  gradeWinnerMetadata,
  type NbaWinnerLedgerMetadata
} from "@/services/simulation/nba-winner-ledger";

assert.equal(bucketForProbability(0.501), "50-53");
assert.equal(bucketForProbability(0.54), "53-56");
assert.equal(bucketForProbability(0.58), "56-60");
assert.equal(bucketForProbability(0.62), "60-65");
assert.equal(bucketForProbability(0.66), "65+");
assert.equal(bucketForProbability(0.47), "50-53");
assert.equal(bucketForProbability(null), null);

assert.equal(computeBrier(0.6, 1), 0.16);
assert.equal(computeBrier(0.6, 0), 0.36);
assert.ok(computeLogLoss(0.6, 1) < computeLogLoss(0.4, 1));
assert.ok(computeLogLoss(0.6, 0) > computeLogLoss(0.4, 0));

const metadata: NbaWinnerLedgerMetadata = {
  ledgerType: "NBA_WINNER",
  captureType: "PREDICTION",
  eventId: "event-1",
  capturedAt: new Date().toISOString(),
  gameTime: new Date().toISOString(),
  homeTeam: "Home",
  awayTeam: "Away",
  marketHomeNoVig: 0.55,
  marketAwayNoVig: 0.45,
  rawHomeWinPct: 0.72,
  rawAwayWinPct: 0.28,
  rawModelDelta: 0.17,
  boundedModelDelta: 0.03,
  deltaCap: 0.03,
  finalHomeWinPct: 0.58,
  finalAwayWinPct: 0.42,
  finalProjectedHomeMargin: 3.6,
  pickedSide: "HOME",
  pickedProbability: 0.58,
  bucket: "56-60",
  confidence: "MEDIUM",
  noBet: false,
  blockers: [],
  warnings: ["raw NBA model disagreed with no-vig market by 17 points"],
  drivers: ["market no-vig home 55.0%", "final home 58.0%"],
  predictionHomeOddsAmerican: -120,
  predictionAwayOddsAmerican: 110
};

const gradedWin = gradeWinnerMetadata({
  metadata,
  actualWinner: "HOME",
  closingHomeOddsAmerican: -150,
  closingAwayOddsAmerican: 130
});

assert.equal(gradedWin.captureType, "GRADED");
assert.equal(gradedWin.actualWinner, "HOME");
assert.equal(gradedWin.brier, 0.1764);
assert.ok(typeof gradedWin.logLoss === "number" && gradedWin.logLoss < 0.55);
assert.ok(typeof gradedWin.clvPct === "number" && gradedWin.clvPct < 0, "home close probability should be above model picked probability");
assert.ok(typeof gradedWin.roi === "number" && gradedWin.roi > 0);

const gradedLoss = gradeWinnerMetadata({
  metadata,
  actualWinner: "AWAY",
  closingHomeOddsAmerican: -110,
  closingAwayOddsAmerican: -110
});

assert.equal(gradedLoss.actualWinner, "AWAY");
assert.equal(gradedLoss.roi, -1);
assert.ok(typeof gradedLoss.brier === "number" && gradedLoss.brier > gradedWin.brier);
assert.ok(typeof gradedLoss.logLoss === "number" && gradedLoss.logLoss > gradedWin.logLoss!);

const passMetadata: NbaWinnerLedgerMetadata = {
  ...metadata,
  pickedSide: "PASS",
  pickedProbability: null,
  noBet: true,
  bucket: null
};
const gradedPass = gradeWinnerMetadata({
  metadata: passMetadata,
  actualWinner: "HOME",
  closingHomeOddsAmerican: -120,
  closingAwayOddsAmerican: 110
});
assert.equal(gradedPass.roi, null);
assert.equal(gradedPass.clvPct, null);

console.log("nba-winner-ledger.test.ts passed");
