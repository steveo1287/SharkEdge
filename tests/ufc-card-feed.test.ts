import assert from "node:assert/strict";

import { buildUfcCardSummaries, ufcCardIdFromDate } from "@/services/ufc/card-feed";
import type { UfcOperationalFeedCard } from "@/services/ufc/operational-feed";

function fight(overrides: Partial<UfcOperationalFeedCard>): UfcOperationalFeedCard {
  return {
    fightId: overrides.fightId ?? "fight-1",
    eventLabel: overrides.eventLabel ?? "A vs B",
    fightDate: overrides.fightDate ?? "2026-06-01T02:00:00.000Z",
    scheduledRounds: overrides.scheduledRounds ?? 3,
    fighterAId: overrides.fighterAId ?? "a",
    fighterBId: overrides.fighterBId ?? "b",
    fighterAName: overrides.fighterAName ?? "A",
    fighterBName: overrides.fighterBName ?? "B",
    pickFighterId: overrides.pickFighterId ?? "a",
    pickName: overrides.pickName ?? "A",
    fighterAWinProbability: overrides.fighterAWinProbability ?? 0.6,
    fighterBWinProbability: overrides.fighterBWinProbability ?? 0.4,
    fairOddsAmerican: overrides.fairOddsAmerican ?? -150,
    sportsbookOddsAmerican: overrides.sportsbookOddsAmerican ?? null,
    edgePct: overrides.edgePct ?? null,
    methodProbabilities: overrides.methodProbabilities ?? { KO_TKO: 0.2, SUBMISSION: 0.1, DECISION: 0.7 },
    dataQualityGrade: overrides.dataQualityGrade ?? "B",
    confidenceGrade: overrides.confidenceGrade ?? "MEDIUM",
    simulationCount: overrides.simulationCount ?? 25_000,
    generatedAt: overrides.generatedAt ?? "2026-05-31T20:00:00.000Z",
    pathSummary: overrides.pathSummary ?? [],
    dangerFlags: overrides.dangerFlags ?? [],
    shadowStatus: overrides.shadowStatus ?? "PENDING"
  };
}

assert.equal(ufcCardIdFromDate("2026-06-01T02:00:00.000Z"), "2026-06-01");
assert.equal(ufcCardIdFromDate("bad-date"), "unknown-card");

const cards = buildUfcCardSummaries([
  fight({ fightId: "fight-1", fightDate: "2026-06-01T02:00:00.000Z", dataQualityGrade: "A", shadowStatus: "PENDING" }),
  fight({ fightId: "fight-2", fightDate: "2026-06-01T03:00:00.000Z", dataQualityGrade: "C", shadowStatus: "RESOLVED" }),
  fight({ fightId: "fight-3", fightDate: "2026-06-08T02:00:00.000Z", dataQualityGrade: "B", simulationCount: null })
]);

assert.equal(cards.length, 2);
const juneOne = cards.find((card) => card.eventId === "2026-06-01");
assert.equal(juneOne?.fightCount, 2);
assert.equal(juneOne?.simulatedFightCount, 2);
assert.equal(juneOne?.dataQualityGrade, "C");
assert.equal(juneOne?.shadowPendingCount, 1);
assert.equal(juneOne?.shadowResolvedCount, 1);
assert.equal(juneOne?.providerStatus, "cached");

const juneEight = cards.find((card) => card.eventId === "2026-06-08");
assert.equal(juneEight?.fightCount, 1);
assert.equal(juneEight?.simulatedFightCount, 0);

console.log("ufc-card-feed tests passed");
