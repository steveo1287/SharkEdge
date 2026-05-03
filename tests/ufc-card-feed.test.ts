import assert from "node:assert/strict";

import { buildUfcCardSummaries, ufcCardIdFromDate } from "@/services/ufc/card-feed";
import type { UfcOperationalFeedCard } from "@/services/ufc/operational-feed";

function fight(overrides: Partial<UfcOperationalFeedCard>): UfcOperationalFeedCard {
  return {
    fightId: overrides.fightId ?? "fight-1",
    eventId: overrides.eventId ?? null,
    eventName: overrides.eventName ?? null,
    eventDate: overrides.eventDate ?? null,
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
  fight({ fightId: "fight-1", eventId: "ufcev-main", eventName: "UFC Main Card", eventDate: "2026-06-01T01:00:00.000Z", fightDate: "2026-06-01T02:00:00.000Z", dataQualityGrade: "A", shadowStatus: "PENDING" }),
  fight({ fightId: "fight-2", eventId: "ufcev-main", eventName: "UFC Main Card", eventDate: "2026-06-01T01:00:00.000Z", fightDate: "2026-06-01T03:00:00.000Z", dataQualityGrade: "C", shadowStatus: "RESOLVED" }),
  fight({ fightId: "fight-3", fightDate: "2026-06-08T02:00:00.000Z", dataQualityGrade: "B", simulationCount: null })
]);

assert.equal(cards.length, 2);
const trueEvent = cards.find((card) => card.eventId === "ufcev-main");
assert.equal(trueEvent?.eventLabel, "UFC Main Card");
assert.equal(trueEvent?.eventDate, "2026-06-01T01:00:00.000Z");
assert.equal(trueEvent?.fightCount, 2);
assert.equal(trueEvent?.simulatedFightCount, 2);
assert.equal(trueEvent?.dataQualityGrade, "C");
assert.equal(trueEvent?.shadowPendingCount, 1);
assert.equal(trueEvent?.shadowResolvedCount, 1);
assert.equal(trueEvent?.providerStatus, "event-linked");

const legacy = cards.find((card) => card.eventId === "2026-06-08");
assert.equal(legacy?.fightCount, 1);
assert.equal(legacy?.simulatedFightCount, 0);
assert.equal(legacy?.providerStatus, "legacy-date");

console.log("ufc-card-feed tests passed");
