import assert from "node:assert/strict";

import { resolveCombatCompetitorIdentity, scoreCombatIdentityCandidate } from "@/services/modeling/ufc-identity-resolution";

const source = {
  name: "Alexander Volkanovski",
  nickname: "The Great",
  aliases: ["Alex Volkanovski"],
  record: "26-4-0",
  age: 36,
  reachInches: 71.5,
  heightInches: 66
};

const goodCandidate = {
  id: "c1",
  name: "Alexander Volkanovski",
  shortName: "Alex Volkanovski",
  metadataJson: {
    nickname: "The Great",
    record: "26-4-0",
    age: 36,
    reachInches: 71.5,
    heightInches: 66,
    aliases: ["Alex Volkanovski"]
  }
};

const badCandidate = {
  id: "c2",
  name: "Alexandre Pantoja",
  shortName: "Alex Pantoja",
  metadataJson: {
    nickname: "The Cannibal",
    record: "29-5-0",
    age: 35,
    reachInches: 67,
    heightInches: 65
  }
};

const goodScore = scoreCombatIdentityCandidate(source, goodCandidate);
const resolved = resolveCombatCompetitorIdentity(source, [badCandidate, goodCandidate]);

assert.equal(goodScore.resolutionScore > 70, true);
assert.equal(resolved.competitorId, "c1");
assert.equal(resolved.matchedBy.includes("exact_name"), true);

console.log("ufc-identity-resolution.test.ts passed");
