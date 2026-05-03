import assert from "node:assert/strict";

import { parseUfcStatsEventPage, parseUfcStatsFightDetail, parseUfcStatsFighterProfile } from "@/services/ufc/ufcstats-parser";

const fighterHtml = `
<span class="b-content__title-highlight"> Fighter A </span>
<li class="b-list__box-list-item"><i>HEIGHT:</i> 5' 11&quot;</li>
<li class="b-list__box-list-item"><i>REACH:</i> 72&quot;</li>
<li class="b-list__box-list-item"><i>STANCE:</i> Orthodox</li>
<li class="b-list__box-list-item"><i>DOB:</i> Jan 01, 1990</li>
<i class="b-list__box-item-title">SLpM:</i> 4.21
<i class="b-list__box-item-title">Str. Acc:</i> 49%
<i class="b-list__box-item-title">SApM:</i> 3.02
<i class="b-list__box-item-title">Str. Def:</i> 58%
<i class="b-list__box-item-title">TD Avg:</i> 1.75
<i class="b-list__box-item-title">TD Acc:</i> 42%
<i class="b-list__box-item-title">TD Def:</i> 66%
<i class="b-list__box-item-title">Sub. Avg:</i> 0.60
`;

const profile = parseUfcStatsFighterProfile(fighterHtml, "http://ufcstats.com/fighter-details/abc123");
assert.equal(profile.sourceId, "ufcstats-abc123");
assert.equal(profile.name, "Fighter A");
assert.equal(profile.heightInches, 71);
assert.equal(profile.reachInches, 72);
assert.equal(profile.stance, "Orthodox");
assert.equal(profile.slpm, 4.21);
assert.equal(profile.strikeAccuracyPct, 49);
assert.equal(profile.sapm, 3.02);
assert.equal(profile.strikeDefensePct, 58);
assert.equal(profile.takedownsPer15, 1.75);
assert.equal(profile.takedownAccuracyPct, 42);
assert.equal(profile.takedownDefensePct, 66);
assert.equal(profile.submissionAttemptsPer15, 0.6);

const eventHtml = `
<span class="b-content__title-highlight"> UFC Test Night </span>
<li class="b-list__box-list-item"><i>DATE:</i> Jun 01, 2026</li>
<li class="b-list__box-list-item"><i>LOCATION:</i> Chicago, Illinois</li>
<tr class="b-fight-details__table-row" data-link="http://ufcstats.com/fight-details/fight123">
<td><a href="http://ufcstats.com/fighter-details/abc123">Fighter A</a></td>
<td><a href="http://ufcstats.com/fighter-details/def456">Fighter B</a></td>
</tr>`;
const event = parseUfcStatsEventPage(eventHtml, "http://ufcstats.com/event-details/event123");
assert.equal(event.sourceEventId, "ufcstats-event123");
assert.equal(event.eventName, "UFC Test Night");
assert.equal(event.fights.length, 1);
assert.equal(event.fights[0].sourceFightId, "ufcstats-fight123");
assert.equal(event.fights[0].fighterAName, "Fighter A");
assert.equal(event.fights[0].fighterBName, "Fighter B");

const fightHtml = `
<a href="http://ufcstats.com/fighter-details/abc123">Fighter A</a>
<a href="http://ufcstats.com/fighter-details/def456">Fighter B</a>
<i>METHOD:</i> Decision <i>ROUND:</i> 3 <i>TIME:</i> 5:00
`;
const fight = parseUfcStatsFightDetail(fightHtml, "http://ufcstats.com/fight-details/fight123");
assert.equal(fight.sourceFightId, "ufcstats-fight123");
assert.equal(fight.fighterAName, "Fighter A");
assert.equal(fight.fighterBName, "Fighter B");
assert.equal(fight.method, "Decision");
assert.equal(fight.round, 3);
assert.equal(fight.time, "5:00");

console.log("ufcstats-parser tests passed");
