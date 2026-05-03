import assert from "node:assert/strict";

import { buildSharkFightCardSimSurface, buildSharkFightDetailSimSurface } from "@/services/ufc/sharkfight-sim-surface";
import type { UfcCardDetail, UfcFightIqDetail } from "@/services/ufc/card-feed";
import type { UfcOperationalFeedCard } from "@/services/ufc/operational-feed";

function feedFight(overrides: Partial<UfcOperationalFeedCard> = {}): UfcOperationalFeedCard {
  return {
    fightId: overrides.fightId ?? "fight-1",
    eventId: overrides.eventId ?? "event-1",
    eventName: overrides.eventName ?? "UFC Test Card",
    eventDate: overrides.eventDate ?? "2026-06-01T01:00:00.000Z",
    eventLabel: overrides.eventLabel ?? "A vs B",
    fightDate: overrides.fightDate ?? "2026-06-01T02:00:00.000Z",
    scheduledRounds: overrides.scheduledRounds ?? 3,
    fighterAId: overrides.fighterAId ?? "a",
    fighterBId: overrides.fighterBId ?? "b",
    fighterAName: overrides.fighterAName ?? "A",
    fighterBName: overrides.fighterBName ?? "B",
    pickFighterId: overrides.pickFighterId ?? "a",
    pickName: overrides.pickName ?? "A",
    fighterAWinProbability: overrides.fighterAWinProbability ?? 0.64,
    fighterBWinProbability: overrides.fighterBWinProbability ?? 0.36,
    fairOddsAmerican: overrides.fairOddsAmerican ?? -178,
    sportsbookOddsAmerican: overrides.sportsbookOddsAmerican ?? -150,
    edgePct: overrides.edgePct ?? 4.2,
    methodProbabilities: overrides.methodProbabilities ?? { KO_TKO: 0.22, SUBMISSION: 0.18, DECISION: 0.6 },
    dataQualityGrade: overrides.dataQualityGrade ?? "A",
    confidenceGrade: overrides.confidenceGrade ?? "HIGH",
    simulationCount: overrides.simulationCount ?? 25_000,
    generatedAt: overrides.generatedAt ?? "2026-05-31T18:00:00.000Z",
    pathSummary: overrides.pathSummary ?? ["A has the cleaner pressure and control profile."],
    dangerFlags: overrides.dangerFlags ?? [],
    shadowStatus: overrides.shadowStatus ?? "PENDING"
  };
}

const card: UfcCardDetail = {
  eventId: "event-1",
  eventLabel: "UFC Test Card",
  eventDate: "2026-06-01T01:00:00.000Z",
  fightCount: 3,
  simulatedFightCount: 2,
  dataQualityGrade: "B",
  lastSimulatedAt: "2026-05-31T18:00:00.000Z",
  shadowPendingCount: 1,
  shadowResolvedCount: 1,
  providerStatus: "event-linked",
  fights: [
    feedFight({ fightId: "fight-1", confidenceGrade: "HIGH", edgePct: 4.2, dangerFlags: ["finish-volatility"] }),
    feedFight({ fightId: "fight-2", pickFighterId: "b", fighterAWinProbability: 0.45, fighterBWinProbability: 0.55, confidenceGrade: "MEDIUM", edgePct: -1, shadowStatus: "RESOLVED", methodProbabilities: { KO_TKO: 0.55, SUBMISSION: 0.1, DECISION: 0.35 } }),
    feedFight({ fightId: "fight-3", simulationCount: null, edgePct: null, confidenceGrade: "LOW", shadowStatus: null })
  ]
};

const cardSurface = buildSharkFightCardSimSurface(card);
assert.equal(cardSurface.fightCount, 3);
assert.equal(cardSurface.simulatedFightCount, 2);
assert.equal(cardSurface.simulationCoveragePct, 66.7);
assert.equal(cardSurface.edgeFightCount, 1);
assert.equal(cardSurface.dangerFlagCount, 1);
assert.equal(cardSurface.highConfidenceCount, 1);
assert.equal(cardSurface.pendingShadowCount, 1);
assert.equal(cardSurface.resolvedShadowCount, 1);
assert.equal(cardSurface.dominantMethod, "DECISION");
assert.equal(cardSurface.averagePickProbability, 0.5967);

const detail: UfcFightIqDetail = {
  fightId: "fight-1",
  eventId: "event-1",
  eventLabel: "UFC Test Card",
  fightDate: "2026-06-01T02:00:00.000Z",
  scheduledRounds: 3,
  fighters: { fighterA: { id: "a", name: "A" }, fighterB: { id: "b", name: "B" } },
  prediction: feedFight(),
  featureComparison: [
    { label: "SLpM", fighterA: 4.2, fighterB: 3.1 },
    { label: "SApM", fighterA: 2.9, fighterB: null }
  ],
  methodProbabilities: { KO_TKO: 0.22, SUBMISSION: 0.18, DECISION: 0.6 },
  roundFinishProbabilities: { R1: 0.1, R2: 0.14, R3: 0.08 },
  pathSummary: ["A has the stronger decision path."],
  dangerFlags: [],
  activeEnsembleWeights: { source: "learned", weights: { skillMarkov: 0.6, exchangeMonteCarlo: 0.4 } },
  sourceOutputs: { skillMarkov: { fighterAWinProbability: 0.62 }, exchangeMonteCarlo: { fighterAWinProbability: 0.66 } },
  dataQualityGrade: "B",
  confidenceGrade: "HIGH",
  shadowStatus: "PENDING"
};

const detailSurface = buildSharkFightDetailSimSurface(detail);
assert.equal(detailSurface.pickProbability, 0.64);
assert.equal(detailSurface.pickSide, "A");
assert.equal(detailSurface.engineAgreement, "agreement");
assert.equal(detailSurface.methodLean, "DECISION");
assert.equal(detailSurface.methodLeanProbability, 0.6);
assert.equal(detailSurface.topRoundOutcome, "R2");
assert.equal(detailSurface.topRoundProbability, 0.14);
assert.equal(detailSurface.dataCompletenessPct, 75);
assert.equal(detailSurface.dataMissingCount, 1);

console.log("ufc-sharkfight-sim-surface tests passed");
