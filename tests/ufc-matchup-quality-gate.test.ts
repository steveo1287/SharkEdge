import assert from "node:assert/strict";

import { evaluateUfcMatchupQuality } from "@/services/ufc/matchup-quality-gate";

const realFight = evaluateUfcMatchupQuality({
  sourceKey: "ufcstats",
  eventName: "UFC Fight Night",
  eventLabel: "Song Yadong vs Deiveson Figueiredo",
  fighterAName: "Song Yadong",
  fighterBName: "Deiveson Figueiredo",
  combatSport: "MMA",
  sourceStatus: "OFFICIAL_CONFIRMED"
});

assert.equal(realFight.status, "VALID");

const leaguePollution = evaluateUfcMatchupQuality({
  sourceKey: "ufc.com",
  eventName: "Events",
  eventLabel: "NBA vs MLB",
  fighterAName: "NBA",
  fighterBName: "MLB",
  combatSport: "MMA",
  sourceStatus: "OFFICIAL_PARTIAL"
});

assert.equal(leaguePollution.status, "FAKE_NAVIGATION");
assert.equal(leaguePollution.fakeNavigation, true);

const crossSportPollution = evaluateUfcMatchupQuality({
  sourceKey: "ufc.com",
  eventName: "Events",
  eventLabel: "WNBA vs Golf",
  fighterAName: "WNBA",
  fighterBName: "Golf",
  combatSport: "MMA",
  sourceStatus: "OFFICIAL_PARTIAL"
});

assert.equal(crossSportPollution.status, "FAKE_NAVIGATION");

const fightcenterPollution = evaluateUfcMatchupQuality({
  sourceKey: "ufc.com",
  eventName: "Events",
  eventLabel: "Home vs Fightcenter",
  fighterAName: "Home",
  fighterBName: "Fightcenter",
  combatSport: "MMA",
  sourceStatus: "OFFICIAL_PARTIAL"
});

assert.equal(fightcenterPollution.status, "FAKE_NAVIGATION");

console.log("ufc-matchup-quality-gate tests passed");
