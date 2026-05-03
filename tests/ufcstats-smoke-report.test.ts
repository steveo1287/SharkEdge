import assert from "node:assert/strict";

import { buildUfcStatsSmokeReport } from "@/services/ufc/ufcstats-smoke-report";

const report = buildUfcStatsSmokeReport({
  event: {
    sourceEventId: "event-1",
    eventName: "Smoke Card",
    eventDate: "2026-06-01T02:00:00.000Z",
    fights: [{ sourceFightId: "fight-1", url: "fight-url", fighterAName: "A", fighterBName: "B" }]
  },
  fights: [],
  fighters: [],
  diagnostics: {
    eventUrl: "event-url",
    eventName: "Smoke Card",
    eventDate: "2026-06-01T02:00:00.000Z",
    fightLinksFound: 1,
    fightDetailsParsed: 1,
    fighterProfilesRequested: 2,
    fighterProfilesParsed: 2,
    warnings: [],
    fatalErrors: [],
    dataQualityGrade: "B"
  },
  snapshot: {
    sourceKey: "ufcstats",
    modelVersion: "ufc-fight-iq-v1",
    snapshotAt: "2026-05-31T18:00:00.000Z",
    fights: [{
      sourceFightId: "fight-1",
      eventLabel: "A vs B",
      fightDate: "2026-06-01T02:00:00.000Z",
      fighterA: {
        sourceId: "a",
        name: "A",
        sigStrikesLandedPerMin: 4.2,
        sigStrikesAbsorbedPerMin: 3.1,
        takedownsPer15: 1.3,
        takedownDefensePct: 66,
        submissionAttemptsPer15: 0.4,
        feature: { sigStrikeAccuracyPct: 48, sigStrikeDefensePct: 59, takedownAccuracyPct: 41 }
      },
      fighterB: {
        sourceId: "b",
        name: "B",
        sigStrikesLandedPerMin: 3.5,
        sigStrikesAbsorbedPerMin: 4.1,
        takedownsPer15: 0.7,
        takedownDefensePct: 52,
        submissionAttemptsPer15: 0.2,
        feature: { sigStrikeAccuracyPct: 42, sigStrikeDefensePct: 51, takedownAccuracyPct: 30 }
      }
    }]
  }
});

assert.equal(report.ok, true);
assert.equal(report.eventName, "Smoke Card");
assert.equal(report.fightLinksFound, 1);
assert.equal(report.fightsInSnapshot, 1);
assert.equal(report.wouldIngest, true);
assert.equal(report.wouldSimulateCount, 1);
assert.equal(report.wouldSkipCount, 0);
assert.deepEqual(report.missingFieldCounts, {});
assert.equal(report.fights[0].wouldSimulate, true);

const weakReport = buildUfcStatsSmokeReport({
  ...report as any,
  event: { sourceEventId: "event-2", eventName: "Weak Card", eventDate: "2026-06-01T02:00:00.000Z", fights: [] },
  fights: [],
  fighters: [],
  diagnostics: { ...report as any, eventUrl: "event-url", eventName: "Weak Card", eventDate: "2026-06-01T02:00:00.000Z", fightLinksFound: 1, fightDetailsParsed: 0, fighterProfilesRequested: 2, fighterProfilesParsed: 1, warnings: ["missing profile"], fatalErrors: [], dataQualityGrade: "C" },
  snapshot: {
    sourceKey: "ufcstats",
    modelVersion: "ufc-fight-iq-v1",
    snapshotAt: "2026-05-31T18:00:00.000Z",
    fights: [{
      sourceFightId: "fight-2",
      eventLabel: "C vs D",
      fightDate: "2026-06-01T02:00:00.000Z",
      fighterA: { sourceId: "c", name: "C", sigStrikesLandedPerMin: 4.2, feature: {} },
      fighterB: { sourceId: "d", name: "D", feature: {} }
    }]
  }
});

assert.equal(weakReport.ok, true);
assert.equal(weakReport.wouldSimulateCount, 0);
assert.equal(weakReport.wouldSkipCount, 1);
assert.equal(weakReport.fights[0].skipReason, "missing-required-feature-fields");
assert.ok(weakReport.missingFieldCounts["fighterB.sigStrikesLandedPerMin"] >= 1);

const fatalReport = buildUfcStatsSmokeReport({
  ...report as any,
  event: { sourceEventId: "event-3", eventName: "Fatal Card", eventDate: null as any, fights: [] },
  fights: [],
  fighters: [],
  diagnostics: { eventUrl: "event-url", eventName: "Fatal Card", eventDate: null, fightLinksFound: 0, fightDetailsParsed: 0, fighterProfilesRequested: 0, fighterProfilesParsed: 0, warnings: [], fatalErrors: ["event fetch failed"], dataQualityGrade: "D" },
  snapshot: { sourceKey: "ufcstats", modelVersion: "ufc-fight-iq-v1", snapshotAt: "2026-05-31T18:00:00.000Z", fights: [] }
});

assert.equal(fatalReport.ok, false);
assert.equal(fatalReport.wouldIngest, false);
assert.equal(fatalReport.dataQualityGrade, "D");

console.log("ufcstats-smoke-report tests passed");
