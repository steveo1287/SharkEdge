import assert from "node:assert/strict";

import { fetchUfcStatsSnapshotWithDiagnostics } from "@/services/ufc/ufcstats-fetcher";

const eventUrl = "http://ufcstats.com/event-details/card-hardening";
const fightOk = "http://ufcstats.com/fight-details/fight-ok";
const fightBroken = "http://ufcstats.com/fight-details/fight-broken";
const fighterA = "http://ufcstats.com/fighter-details/fighter-a";
const fighterB = "http://ufcstats.com/fighter-details/fighter-b";

const pages = new Map<string, string>([
  [eventUrl, `
    <span class="b-content__title-highlight">Hardening Card</span>
    <li class="b-list__box-list-item"><i>DATE:</i> 2026-06-01T02:00:00.000Z</li>
    <tr class="b-fight-details__table-row" data-link="${fightOk}">
      <td><a href="${fighterA}">Fighter A</a></td>
      <td><a href="${fighterB}">Fighter B</a></td>
    </tr>
    <tr class="b-fight-details__table-row" data-link="${fightBroken}">
      <td><a href="http://ufcstats.com/fighter-details/missing-a">Missing A</a></td>
      <td><a href="http://ufcstats.com/fighter-details/missing-b">Missing B</a></td>
    </tr>`],
  [fightOk, `<a href="${fighterA}">Fighter A</a><a href="${fighterB}">Fighter B</a><i>METHOD:</i> Decision <i>ROUND:</i> 3 <i>TIME:</i> 5:00`],
  [fighterA, `<span class="b-content__title-highlight">Fighter A</span><i class="b-list__box-item-title">SLpM:</i> 4.00<i class="b-list__box-item-title">SApM:</i> 3.00<i class="b-list__box-item-title">TD Avg:</i> 1.00<i class="b-list__box-item-title">TD Def:</i> 60%`],
  [fighterB, `<span class="b-content__title-highlight">Fighter B</span><i class="b-list__box-item-title">SLpM:</i> 3.20<i class="b-list__box-item-title">SApM:</i> 3.80<i class="b-list__box-item-title">TD Avg:</i> 0.50<i class="b-list__box-item-title">TD Def:</i> 55%`]
]);

const fetchImpl = async (url: RequestInfo | URL) => {
  const body = pages.get(String(url));
  return body ? new Response(body, { status: 200 }) : new Response("missing", { status: 404 });
};

const result = await fetchUfcStatsSnapshotWithDiagnostics({
  eventUrl,
  snapshotAt: "2026-05-31T18:00:00.000Z",
  fetchImpl: fetchImpl as typeof fetch
});

assert.equal(result.event.eventName, "Hardening Card");
assert.equal(result.diagnostics.fightLinksFound, 2);
assert.equal(result.diagnostics.fightDetailsParsed, 1);
assert.equal(result.diagnostics.fighterProfilesRequested, 2);
assert.equal(result.diagnostics.fighterProfilesParsed, 2);
assert.equal(result.diagnostics.warnings.length, 1);
assert.equal(result.diagnostics.fatalErrors.length, 0);
assert.equal(result.diagnostics.dataQualityGrade, "C");
assert.equal(result.snapshot.fights.length, 2);
assert.equal(result.snapshot.fights[0].fighterA.name, "Fighter A");

const fatalFetch = async () => new Response("missing", { status: 500 });
const fatal = await fetchUfcStatsSnapshotWithDiagnostics({ eventUrl, fetchImpl: fatalFetch as typeof fetch });
assert.equal(fatal.diagnostics.dataQualityGrade, "D");
assert.equal(fatal.diagnostics.fatalErrors.length, 1);
assert.equal(fatal.snapshot.fights.length, 0);

console.log("ufcstats-hardening tests passed");
