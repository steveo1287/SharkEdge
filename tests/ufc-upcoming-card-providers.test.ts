import assert from "node:assert/strict";

import { parseGenericUpcomingEventPage, parseMvpEventPage, parseMvpUpcomingEventsList, parseUfcStatsUpcomingEventsList } from "@/services/ufc/upcoming-card-providers";

const listHtml = `
<table>
  <tr><td><a href="http://ufcstats.com/event-details/abc123">UFC Test Card</a></td></tr>
  <tr><td><a href="/event-details/def456">UFC Second Card</a></td></tr>
</table>`;
const listed = parseUfcStatsUpcomingEventsList(listHtml, "http://ufcstats.com/statistics/events/upcoming");
assert.equal(listed.length, 2);
assert.equal(listed[0].url, "http://ufcstats.com/event-details/abc123");
assert.ok(listed[1].url.includes("event-details/def456"));

const jsonLdPage = `
<script type="application/ld+json">
{
  "@type": "Event",
  "name": "UFC Test Card",
  "startDate": "2026-06-01T02:00:00Z",
  "url": "https://www.ufc.com/event/test-card",
  "location": {
    "name": "Test Arena",
    "address": { "addressLocality": "Chicago", "addressRegion": "IL", "addressCountry": "USA" }
  }
}
</script>
<a>Fighter A</a><a>Fighter B</a>
<a>Fighter C</a><a>Fighter D</a>`;
const event = parseGenericUpcomingEventPage(jsonLdPage, "ufc.com", "https://www.ufc.com/event/test-card");
assert.equal(event.eventName, "UFC Test Card");
assert.equal(event.eventDate, "2026-06-01T02:00:00Z");
assert.equal(event.venue, "Test Arena");
assert.equal(event.city, "Chicago");
assert.equal(event.region, "IL");
assert.equal(event.country, "USA");
assert.equal(event.fights.length, 2);
assert.equal(event.fights[0].fighterAName, "Fighter A");
assert.equal(event.fights[0].fighterBName, "Fighter B");
assert.equal(event.fights[0].isMainEvent, true);
assert.equal(event.fights[0].scheduledRounds, 5);
assert.equal(event.fights[1].scheduledRounds, 3);

const mvpList = `
<a href="/event/rousey-vs-carano-16-05-2026/">See Event Info</a>
<a href="https://www.mostvaluablepromotions.com/event/han-vs-holm-30052026/">See Event Info</a>`;
const mvpListed = parseMvpUpcomingEventsList(mvpList, "https://www.mostvaluablepromotions.com/events/?filter=upcoming");
assert.equal(mvpListed.length, 2);
assert.ok(mvpListed[0].url.includes("/event/rousey-vs-carano-16-05-2026/"));

const mvpEventHtml = `
<h1>Rousey vs Carano</h1>
May 16, 2026 at 8:00 PM
Intuit Dome - Los Angeles, CA
Image: Fight Background
Featherweight Bout
5×5 Professional MMA Bout
Ronda
#### Rousey
##### VS
Gina
#### Carano
View Stats
TALE OF THE TAPE
Image: Fight Background
Heavyweight Bout
5×5 Professional MMA Bout
Francis
#### Ngannou
##### VS
Philipe
#### Lins
View Stats`;
const mvpEvent = parseMvpEventPage(mvpEventHtml, "https://www.mostvaluablepromotions.com/event/rousey-vs-carano-16-05-2026/");
assert.equal(mvpEvent.sourceName, "mvp");
assert.equal(mvpEvent.promotionKey, "mvp");
assert.equal(mvpEvent.combatSport, "MMA");
assert.equal(mvpEvent.fights.length, 2);
assert.equal(mvpEvent.fights[0].fighterAName, "Ronda Rousey");
assert.equal(mvpEvent.fights[0].fighterBName, "Gina Carano");
assert.equal(mvpEvent.fights[0].scheduledRounds, 5);
assert.equal(mvpEvent.fights[0].payload?.promotionName, "Most Valuable Promotions");

console.log("ufc-upcoming-card-providers tests passed");
