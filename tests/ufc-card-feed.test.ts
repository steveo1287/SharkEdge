import assert from "node:assert/strict";

import { buildUfcCardSummaries, ufcCardIdFromDate } from "@/services/ufc/card-feed";
import type { UfcOperationalFeedCard } from "@/services/ufc/operational-feed";

function fight(overrides: Partial<UfcOperationalFeedCard>): UfcOperationalFeedCard {
  const hasPrediction = overrides.hasPrediction ?? true;
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
    hasPrediction,
    sourceStatus: overrides.sourceStatus ?? (hasPrediction ? "OFFICIAL_CONFIRMED" : "OFFICIAL_PARTIAL"),
    cardSection: overrides.cardSection ?? null,
    boutOrder: overrides.boutOrder ?? null,
    pickFighterId: overrides.pickFighterId ?? (hasPrediction ? "a" : null),
    pickName: overrides.pickName ?? (hasPrediction ? "A" : null),
    fighterAWinProbability: overrides.fighterAWinProbability ?? (hasPrediction ? 0.6 : null),
    fighterBWinProbability: overrides.fighterBWinProbability ?? (hasPrediction ? 0.4 : null),
    fairOddsAmerican: overrides.fairOddsAmerican ?? (hasPrediction ? -150 : null),
    sportsbookOddsAmerican: overrides.sportsbookOddsAmerican ?? null,
    edgePct: overrides.edgePct ?? null,
    methodProbabilities: overrides.methodProbabilities ?? { KO_TKO: hasPrediction ? 0.2 : null, SUBMISSION: hasPrediction ? 0.1 : null, DECISION: hasPrediction ? 0.7 : null },
    dataQualityGrade: overrides.dataQualityGrade ?? (hasPrediction ? "B" : null),
    confidenceGrade: overrides.confidenceGrade ?? (hasPrediction ? "MEDIUM" : null),
    simulationCount: overrides.simulationCount ?? (hasPrediction ? 25_000 : null),
    generatedAt: overrides.generatedAt ?? "2026-05-31T20:00:00.000Z",
    pathSummary: overrides.pathSummary ?? [],
    dangerFlags: overrides.dangerFlags ?? [],
    shadowStatus: overrides.shadowStatus ?? (hasPrediction ? "PENDING" : null)
  };
}

assert.equal(ufcCardIdFromDate("2026-06-01T02:00:00.000Z"), "2026-06-01");
assert.equal(ufcCardIdFromDate("bad-date"), "unknown-card");

const cards = buildUfcCardSummaries([
  fight({ fightId: "fight-1", eventId: "ufcev-main", eventName: "UFC Main Card", eventDate: "2026-06-01T01:00:00.000Z", fightDate: "2026-06-01T02:00:00.000Z", dataQualityGrade: "A", shadowStatus: "PENDING" }),
  fight({ fightId: "fight-2", eventId: "ufcev-main", eventName: "UFC Main Card", eventDate: "2026-06-01T01:00:00.000Z", fightDate: "2026-06-01T03:00:00.000Z", dataQualityGrade: "C", shadowStatus: "RESOLVED" }),
  fight({ fightId: "fight-3", fightDate: "2026-06-08T02:00:00.000Z", dataQualityGrade: "B", simulationCount: null }),
  fight({ fightId: "fight-4", eventId: "ufcev-upcoming", eventName: "UFC Upcoming", eventDate: "2026-06-15T01:00:00.000Z", fightDate: "2026-06-15T02:00:00.000Z", hasPrediction: false, sourceStatus: "OFFICIAL_PARTIAL" })
]);

assert.equal(cards.length, 3);
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

const upcoming = cards.find((card) => card.eventId === "ufcev-upcoming");
assert.equal(upcoming?.fightCount, 1);
assert.equal(upcoming?.simulatedFightCount, 0);
assert.equal(upcoming?.providerStatus, "event-linked");

console.log("ufc-card-feed tests passed");
