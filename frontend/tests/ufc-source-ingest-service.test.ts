import assert from "node:assert/strict";

import { normalizeCombatSourceProfile } from "@/services/modeling/ufc-source-ingest-service";

const normalized = normalizeCombatSourceProfile({
  source: "tapology",
  sourceUrl: "https://example.com/fighter",
  name: "Merab Dvalishvili",
  nickname: "The Machine",
  aliases: ["Merab"],
  record: "19-4-0",
  amateurRecord: "3-1-0",
  camp: "Serra-Longo",
  trainingPartners: ["Aljamain Sterling"],
  wrestlingLevel: "collegiate",
  bjjBelt: "brown belt",
  kickboxingRecord: "4-0-0",
  stance: "Orthodox",
  age: 34,
  reachInches: 68,
  heightInches: 66
});

assert.equal(normalized.name, "Merab Dvalishvili");
assert.equal(normalized.metadata.camp, "Serra-Longo");
assert.equal(Array.isArray(normalized.metadata.trainingPartners), true);
assert.equal(typeof normalized.metadata.sourceCompletenessScore, "number");
assert.equal((normalized.metadata.aliases ?? undefined), undefined);

console.log("ufc-source-ingest-service.test.ts passed");
