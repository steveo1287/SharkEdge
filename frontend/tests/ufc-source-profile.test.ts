import assert from "node:assert/strict";

import { buildUfcSourceProfile } from "@/services/modeling/ufc-source-profile";

const profile = buildUfcSourceProfile({
  camp: "American Top Team",
  trainingPartners: ["Dustin Poirier", "Mateusz Gamrot"],
  amateurRecord: "7-1-0",
  wrestlingLevel: "NCAA Division 1",
  bjjBelt: "black belt",
  kickboxingRecord: "12-2-0",
  stance: "Southpaw",
  age: 28,
  reachInches: 72,
  heightInches: 70
});

assert.equal(profile.campKey, "american_top_team");
assert.equal(profile.trainingPartners.length, 2);
assert.equal(profile.sourceCompletenessScore > 7, true);
assert.equal(profile.pedigreeTags.includes("room:known"), true);
assert.equal(profile.pedigreeTags.includes("amateur:known"), true);

console.log("ufc-source-profile.test.ts passed");
