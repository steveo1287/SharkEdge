import assert from "node:assert/strict";

import { normalizeUpcomingUfcProviderResults } from "@/services/ufc/upcoming-card-normalizer";
import type { UfcUpcomingProviderResult } from "@/services/ufc/upcoming-card-types";

const providerResult: UfcUpcomingProviderResult = {
  provider: "ufc.com",
  fetchedAt: "2026-05-03T12:00:00.000Z",
  warnings: [],
  errors: [],
  events: [{
    sourceName: "ufc.com",
    sourceEventId: "ufccom-card-1",
    sourceUrl: "https://www.ufc.com/event/test-card",
    eventName: "UFC Test Card",
    eventDate: "2026-06-01T02:00:00.000Z",
    venue: "Test Arena",
    city: "Chicago",
    region: "IL",
    country: "USA",
    broadcastInfo: "ESPN+",
    mainCardTime: "2026-06-01T02:00:00.000Z",
    sourceStatus: "OFFICIAL_PARTIAL",
    sourceUrls: { "ufc.com": "https://www.ufc.com/event/test-card" },
    fights: [{
      sourceName: "ufc.com",
      sourceUrl: "https://www.ufc.com/event/test-card",
      sourceEventId: "ufccom-card-1",
      sourceFightId: "bout-1",
      fighterAName: " Fighter A ",
      fighterBName: "Fighter B",
      weightClass: "Lightweight",
      scheduledRounds: 5,
      boutOrder: 1,
      cardSection: "MAIN_CARD",
      sourceStatus: "OFFICIAL_PARTIAL",
      confidence: "OFFICIAL_PARTIAL",
      isMainEvent: true,
      isTitleFight: false,
      payload: { row: 1 }
    }]
  }]
};

const payload = normalizeUpcomingUfcProviderResults([providerResult], "2026-05-03T12:00:00.000Z");

assert.equal(payload.events.length, 1);
assert.equal(payload.events[0].externalEventId, "ufc.com-ufccom-card-1");
assert.equal(payload.events[0].eventName, "UFC Test Card");
assert.equal(payload.events[0].venue, "Test Arena");
assert.equal(payload.events[0].broadcastInfo, "ESPN+");
assert.equal(payload.events[0].sourceStatus, "OFFICIAL_PARTIAL");
assert.equal(payload.events[0].lastSeenAt, "2026-05-03T12:00:00.000Z");

assert.equal(payload.fighters.length, 2);
assert.equal(payload.fighters[0].externalKey, "ufc-name-fighter-a");
assert.equal(payload.fights.length, 1);
assert.equal(payload.fights[0].externalFightId, "bout-1");
assert.equal(payload.fights[0].eventKey, "ufc.com-ufccom-card-1");
assert.equal(payload.fights[0].eventLabel, "Fighter A vs Fighter B");
assert.equal(payload.fights[0].scheduledRounds, 5);
assert.equal(payload.fights[0].boutOrder, 1);
assert.equal(payload.fights[0].cardSection, "MAIN_CARD");
assert.equal(payload.fights[0].isMainEvent, true);
assert.equal(payload.fights[0].lastSeenAt, "2026-05-03T12:00:00.000Z");

assert.equal(payload.fightSources.length, 1);
assert.equal(payload.fightSources[0].fightKey, "bout-1");
assert.equal(payload.fightSources[0].sourceName, "ufc.com");
assert.equal(payload.fightSources[0].sourceFighterA, "Fighter A");
assert.equal(payload.fightSources[0].sourceFighterB, "Fighter B");
assert.equal(payload.fightSources[0].confidence, "OFFICIAL_PARTIAL");

console.log("ufc-upcoming-card-normalizer tests passed");
