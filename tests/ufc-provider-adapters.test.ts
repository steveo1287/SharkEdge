import assert from "node:assert/strict";

import {
  getUfcProviderReadiness,
  mergeFightMatrixStrengthIntoSnapshot,
  mergeManualProspectsIntoSnapshot,
  mergeUfcStatsIntoSnapshot,
  normalizeOddsApiMmaEvents,
  validateProviderSnapshot
} from "@/services/ufc/provider-adapters";
import { buildUfcCompositeProviderSnapshot } from "@/services/ufc/provider-ingestion";

const snapshot = normalizeOddsApiMmaEvents({
  snapshotAt: "2026-05-31T18:00:00.000Z",
  events: [{
    id: "event-1",
    commence_time: "2026-06-01T02:00:00.000Z",
    away_team: "Fighter A",
    home_team: "Fighter B",
    bookmakers: [{ markets: [{ key: "h2h", outcomes: [{ name: "Fighter A", price: -125 }, { name: "Fighter B", price: 105 }] }] }]
  }]
});

assert.equal(snapshot.sourceKey, "odds-api");
assert.equal(snapshot.fights.length, 1);
assert.equal(snapshot.fights[0].fighterA.sourceId, "fighter-a");
assert.equal(snapshot.fights[0].marketOddsAOpen, -125);
assert.equal(snapshot.fights[0].marketOddsBOpen, 105);

const withStats = mergeUfcStatsIntoSnapshot(snapshot, [{ sourceId: "fighter-a", name: "Fighter A", sigStrikesLandedPerMin: 4.2, ufcFights: 4 }]);
assert.equal(withStats.fights[0].fighterA.sigStrikesLandedPerMin, 4.2);
assert.equal(withStats.fights[0].fighterA.ufcFights, 4);

const withStrength = mergeFightMatrixStrengthIntoSnapshot(withStats, [{ fighterSourceId: "fighter-a", opponentAdjustedStrength: 64, sourceRank: 15 }]);
assert.equal(withStrength.fights[0].fighterA.opponentAdjustedStrength, 64);
assert.equal(withStrength.fights[0].fighterA.feature?.fightMatrixRank, 15);

const withProspect = mergeManualProspectsIntoSnapshot(withStrength, [{ fighterSourceId: "fighter-b", coldStartActive: true, amateurSignal: 71, scoutingTags: ["wrestling"] }]);
assert.equal(withProspect.fights[0].fighterB.coldStartActive, true);
assert.equal(withProspect.fights[0].fighterB.feature?.amateurSignal, 71);

const validation = validateProviderSnapshot(withProspect);
assert.equal(validation.ok, true);

const composite = buildUfcCompositeProviderSnapshot({
  snapshotAt: "2026-05-31T18:00:00.000Z",
  oddsApiEvents: [{ id: "event-2", commence_time: "2026-06-01T02:00:00.000Z", away_team: "A", home_team: "B" }],
  ufcStatsFighters: [{ sourceId: "a", name: "A", proFights: 10 }],
  fightMatrixStrengths: [{ fighterSourceId: "a", opponentAdjustedStrength: 59 }],
  manualProspects: [{ fighterSourceId: "b", coldStartActive: true }]
});
assert.equal(composite.fights[0].fighterA.proFights, 10);
assert.equal(composite.fights[0].fighterA.opponentAdjustedStrength, 59);
assert.equal(composite.fights[0].fighterB.coldStartActive, true);

const bad = validateProviderSnapshot({ ...snapshot, snapshotAt: "2026-06-02T00:00:00.000Z" });
assert.equal(bad.ok, false);

const noOddsKey = getUfcProviderReadiness({});
assert.equal(noOddsKey.find((item) => item.provider === "odds-api")?.ready, false);
const hasOddsKey = getUfcProviderReadiness({ ODDS_API_KEY: "x" });
assert.equal(hasOddsKey.find((item) => item.provider === "odds-api")?.ready, true);

console.log("ufc-provider-adapters tests passed");
