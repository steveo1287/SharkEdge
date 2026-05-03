import assert from "node:assert/strict";

import { buildUfcCardSummaries } from "@/services/ufc/card-feed";
import { buildSharkFightCardSimSurface, buildSharkFightDetailSimSurface } from "@/services/ufc/sharkfight-sim-surface";
import type { UfcFightIqDetail } from "@/services/ufc/card-feed";
import type { UfcOperationalFeedCard } from "@/services/ufc/operational-feed";

const pendingFight: UfcOperationalFeedCard = {
  fightId: "pending-1",
  eventId: "event-upcoming",
  eventName: "UFC Upcoming Card",
  eventDate: "2026-07-01T01:00:00.000Z",
  eventLabel: "Fighter A vs Fighter B",
  fightDate: "2026-07-01T02:00:00.000Z",
  scheduledRounds: 3,
  fighterAId: "fighter-a",
  fighterBId: "fighter-b",
  fighterAName: "Fighter A",
  fighterBName: "Fighter B",
  hasPrediction: false,
  sourceStatus: "OFFICIAL_PARTIAL",
  cardSection: "MAIN_CARD",
  boutOrder: 2,
  pickFighterId: null,
  pickName: null,
  fighterAWinProbability: null,
  fighterBWinProbability: null,
  fairOddsAmerican: null,
  sportsbookOddsAmerican: null,
  edgePct: null,
  methodProbabilities: { KO_TKO: null, SUBMISSION: null, DECISION: null },
  dataQualityGrade: null,
  confidenceGrade: null,
  simulationCount: null,
  generatedAt: "2026-06-15T12:00:00.000Z",
  pathSummary: [],
  dangerFlags: [],
  shadowStatus: null
};

const cards = buildUfcCardSummaries([pendingFight]);
assert.equal(cards.length, 1);
assert.equal(cards[0].eventId, "event-upcoming");
assert.equal(cards[0].eventLabel, "UFC Upcoming Card");
assert.equal(cards[0].fightCount, 1);
assert.equal(cards[0].simulatedFightCount, 0);
assert.equal(cards[0].lastSimulatedAt, null);
assert.equal(cards[0].providerStatus, "event-linked");

const cardSurface = buildSharkFightCardSimSurface({ fights: [pendingFight], shadowPendingCount: 0, shadowResolvedCount: 0 });
assert.equal(cardSurface.fightCount, 1);
assert.equal(cardSurface.simulatedFightCount, 0);
assert.equal(cardSurface.simulationCoveragePct, 0);
assert.equal(cardSurface.averagePickProbability, null);
assert.equal(cardSurface.dominantMethod, null);

const detail: UfcFightIqDetail = {
  fightId: pendingFight.fightId,
  eventId: pendingFight.eventId!,
  eventLabel: pendingFight.eventName!,
  fightDate: pendingFight.fightDate,
  scheduledRounds: pendingFight.scheduledRounds,
  fighters: { fighterA: { id: pendingFight.fighterAId, name: pendingFight.fighterAName }, fighterB: { id: pendingFight.fighterBId, name: pendingFight.fighterBName } },
  prediction: pendingFight,
  featureComparison: [],
  methodProbabilities: pendingFight.methodProbabilities,
  roundFinishProbabilities: {},
  pathSummary: [],
  dangerFlags: [],
  activeEnsembleWeights: null,
  sourceOutputs: null,
  dataQualityGrade: null,
  confidenceGrade: null,
  shadowStatus: null
};

const detailSurface = buildSharkFightDetailSimSurface(detail);
assert.equal(detailSurface.pickProbability, null);
assert.equal(detailSurface.pickSide, null);
assert.equal(detailSurface.methodLean, null);
assert.equal(detailSurface.dataCompletenessPct, 0);

console.log("ufc-upcoming-card-feed tests passed");
