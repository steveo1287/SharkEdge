import assert from "node:assert/strict";

import { fetchUfcStatsSnapshot } from "@/services/ufc/ufcstats-fetcher";

const fetchImpl = async () => new Response(`
  <span class="b-content__title-highlight">Sample Card</span>
  <li class="b-list__box-list-item"><i>DATE:</i> 2026-06-01T02:00:00.000Z</li>
`, { status: 200 });

const snapshot = await fetchUfcStatsSnapshot({
  eventUrl: "http://ufcstats.com/event-details/sample",
  snapshotAt: "2026-05-31T18:00:00.000Z",
  fetchImpl: fetchImpl as typeof fetch
});

assert.equal(snapshot.sourceKey, "ufcstats");
assert.equal(snapshot.fights.length, 0);
assert.equal(snapshot.modelVersion, "ufc-fight-iq-v1");

console.log("ufcstats-fetcher tests passed");
