import assert from "node:assert/strict";

import { buildUfcCardSourceConsensus, buildUfcFightSourceConsensus } from "@/services/ufc/source-consensus";
import type { UfcSourceAuditSummary } from "@/services/ufc/source-audit";

const now = new Date("2026-05-03T14:00:00.000Z").getTime();

const high = buildUfcFightSourceConsensus("fight-1", [
  { fightId: "fight-1", eventId: "event-1", sourceName: "ufcstats", sourceUrl: null, sourceFighterA: "A", sourceFighterB: "B", sourceWeightClass: "Lightweight", sourceBoutOrder: 1, sourceCardSection: "MAIN_CARD", sourceStatus: "OFFICIAL_CONFIRMED", confidence: "OFFICIAL_CONFIRMED", seenAt: "2026-05-03T12:00:00.000Z" },
  { fightId: "fight-1", eventId: "event-1", sourceName: "espn", sourceUrl: null, sourceFighterA: "B", sourceFighterB: "A", sourceWeightClass: "Lightweight", sourceBoutOrder: 1, sourceCardSection: "MAIN_CARD", sourceStatus: "CROSS_CHECKED", confidence: "CROSS_CHECKED", seenAt: "2026-05-03T12:30:00.000Z" }
], now);
assert.equal(high.confidenceGrade, "HIGH");
assert.equal(high.hasOfficialSource, true);
assert.equal(high.hasCrossCheck, true);
assert.equal(high.nameDisagreement, false);
assert.equal(high.weightClassDisagreement, false);

const review = buildUfcFightSourceConsensus("fight-2", [
  { fightId: "fight-2", eventId: "event-1", sourceName: "tapology", sourceUrl: null, sourceFighterA: "C", sourceFighterB: "D", sourceWeightClass: "Welterweight", sourceBoutOrder: 2, sourceCardSection: "PRELIMS", sourceStatus: "EARLY_REPORTED", confidence: "EARLY_REPORTED", seenAt: "2026-05-03T12:00:00.000Z" },
  { fightId: "fight-2", eventId: "event-1", sourceName: "espn", sourceUrl: null, sourceFighterA: "C", sourceFighterB: "E", sourceWeightClass: "Lightweight", sourceBoutOrder: 2, sourceCardSection: "PRELIMS", sourceStatus: "CROSS_CHECKED", confidence: "CROSS_CHECKED", seenAt: "2026-05-03T12:30:00.000Z" }
], now);
assert.equal(review.confidenceGrade, "REVIEW");
assert.equal(review.nameDisagreement, true);
assert.equal(review.weightClassDisagreement, true);
assert.ok(review.reviewFlags.includes("fighter-name-disagreement"));
assert.ok(review.reviewFlags.includes("weight-class-disagreement"));

const stale = buildUfcFightSourceConsensus("fight-3", [
  { fightId: "fight-3", eventId: "event-1", sourceName: "tapology", sourceUrl: null, sourceFighterA: "F", sourceFighterB: "G", sourceWeightClass: "Middleweight", sourceBoutOrder: 3, sourceCardSection: "PRELIMS", sourceStatus: "EARLY_REPORTED", confidence: "EARLY_REPORTED", seenAt: "2026-04-29T12:00:00.000Z" }
], now);
assert.equal(stale.confidenceGrade, "LOW");
assert.equal(stale.earlyOnly, true);
assert.equal(stale.stale, true);
assert.ok(stale.reviewFlags.includes("single-source"));

const audit: UfcSourceAuditSummary = {
  eventId: "event-1",
  sourceCount: 5,
  sourceNames: ["espn", "tapology", "ufcstats"],
  officialCount: 1,
  crossCheckedCount: 2,
  earlyReportedCount: 2,
  manualReviewCount: 0,
  lastSeenAt: "2026-05-03T12:30:00.000Z",
  rows: [...high.sourceNames.map(() => null)].length ? [
    { fightId: "fight-1", eventId: "event-1", sourceName: "ufcstats", sourceUrl: null, sourceFighterA: "A", sourceFighterB: "B", sourceWeightClass: "Lightweight", sourceBoutOrder: 1, sourceCardSection: "MAIN_CARD", sourceStatus: "OFFICIAL_CONFIRMED", confidence: "OFFICIAL_CONFIRMED", seenAt: "2026-05-03T12:00:00.000Z" },
    { fightId: "fight-1", eventId: "event-1", sourceName: "espn", sourceUrl: null, sourceFighterA: "B", sourceFighterB: "A", sourceWeightClass: "Lightweight", sourceBoutOrder: 1, sourceCardSection: "MAIN_CARD", sourceStatus: "CROSS_CHECKED", confidence: "CROSS_CHECKED", seenAt: "2026-05-03T12:30:00.000Z" },
    { fightId: "fight-2", eventId: "event-1", sourceName: "tapology", sourceUrl: null, sourceFighterA: "C", sourceFighterB: "D", sourceWeightClass: "Welterweight", sourceBoutOrder: 2, sourceCardSection: "PRELIMS", sourceStatus: "EARLY_REPORTED", confidence: "EARLY_REPORTED", seenAt: "2026-05-03T12:00:00.000Z" },
    { fightId: "fight-2", eventId: "event-1", sourceName: "espn", sourceUrl: null, sourceFighterA: "C", sourceFighterB: "E", sourceWeightClass: "Lightweight", sourceBoutOrder: 2, sourceCardSection: "PRELIMS", sourceStatus: "CROSS_CHECKED", confidence: "CROSS_CHECKED", seenAt: "2026-05-03T12:30:00.000Z" }
  ] : []
};
const card = buildUfcCardSourceConsensus(audit, now);
assert.equal(card.fightCount, 2);
assert.equal(card.highCount, 1);
assert.equal(card.reviewCount, 1);
assert.equal(card.overallGrade, "REVIEW");
assert.equal(card.disagreementCount, 1);

console.log("ufc-source-consensus tests passed");
