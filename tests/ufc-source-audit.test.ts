import assert from "node:assert/strict";

import { summarizeUfcSourceAudit } from "@/services/ufc/source-audit";

const audit = summarizeUfcSourceAudit("event-1", [
  { fightId: "fight-2", eventId: "event-1", sourceName: "tapology", sourceUrl: null, sourceFighterA: "C", sourceFighterB: "D", sourceWeightClass: "Welterweight", sourceBoutOrder: 2, sourceCardSection: "PRELIMS", sourceStatus: "EARLY_REPORTED", confidence: "EARLY_REPORTED", seenAt: "2026-05-03T12:00:00.000Z" },
  { fightId: "fight-1", eventId: "event-1", sourceName: "ufcstats", sourceUrl: "https://ufcstats.com/fight", sourceFighterA: "A", sourceFighterB: "B", sourceWeightClass: "Lightweight", sourceBoutOrder: 1, sourceCardSection: "MAIN_CARD", sourceStatus: "OFFICIAL_CONFIRMED", confidence: "OFFICIAL_CONFIRMED", seenAt: "2026-05-03T13:00:00.000Z" },
  { fightId: "fight-1", eventId: "event-1", sourceName: "espn", sourceUrl: null, sourceFighterA: "A", sourceFighterB: "B", sourceWeightClass: "Lightweight", sourceBoutOrder: 1, sourceCardSection: "MAIN_CARD", sourceStatus: "CROSS_CHECKED", confidence: "CROSS_CHECKED", seenAt: "2026-05-03T14:00:00.000Z" }
]);

assert.equal(audit.eventId, "event-1");
assert.equal(audit.sourceCount, 3);
assert.deepEqual(audit.sourceNames, ["espn", "tapology", "ufcstats"]);
assert.equal(audit.officialCount, 1);
assert.equal(audit.crossCheckedCount, 1);
assert.equal(audit.earlyReportedCount, 1);
assert.equal(audit.manualReviewCount, 0);
assert.equal(audit.lastSeenAt, "2026-05-03T14:00:00.000Z");
assert.equal(audit.rows[0].sourceName, "ufcstats");
assert.equal(audit.rows[1].sourceName, "espn");
assert.equal(audit.rows[2].sourceName, "tapology");

console.log("ufc-source-audit tests passed");
