import assert from "node:assert/strict";

import { GET } from "@/app/api/simulation/nba/lineup-truth/route";

const response = await GET(new Request("http://localhost/api/simulation/nba/lineup-truth?team=Boston%20Celtics"));
assert.equal(response.status, 200);

const body = await response.json();
assert.equal(body.ok, true);
assert.equal(typeof body.generatedAt, "string");
assert.equal(typeof body.feed.hasFeedUrl, "boolean");
assert.equal(typeof body.feed.feedFlowing, "boolean");
assert.equal(typeof body.feed.teamCount, "number");
assert.equal(typeof body.feed.playerCount, "number");
assert.equal(body.query.team, "Boston Celtics");
assert.ok(typeof body.verdict === "string");
assert.ok(body.instructions.exampleTeamCheck.includes("/api/simulation/nba/lineup-truth"));

console.log("nba-lineup-truth-route-contract.test.ts passed");
