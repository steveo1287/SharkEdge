import assert from "node:assert/strict";

import { parseGenericUpcomingEventPage, parseUfcStatsUpcomingEventsList } from "@/services/ufc/upcoming-card-providers";

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

console.log("ufc-upcoming-card-providers tests passed");
