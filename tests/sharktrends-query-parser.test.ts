import assert from "node:assert/strict";

import { parseSharkTrendQuery } from "../src/server/sharktrends/query-parser";

const wrigley = parseSharkTrendQuery("Cubs at Wrigley as favorites of -165 or higher with wind blowing out");
assert.equal(wrigley.filters.team, "Chicago Cubs");
assert.equal(wrigley.filters.homeAway, "HOME");
assert.equal(wrigley.filters.side, "FAVORITE");
assert.equal(wrigley.filters.favoriteMinAbsPrice, 165);
assert.equal(wrigley.filters.windOut, true);
assert.equal(wrigley.filters.venue, "Wrigley");

const roadDog = parseSharkTrendQuery("road underdogs after scoring 2 or fewer runs last game");
assert.equal(roadDog.filters.homeAway, "AWAY");
assert.equal(roadDog.filters.side, "UNDERDOG");
assert.equal(roadDog.filters.previousRunsScoredMax, 2);

const unresolved = parseSharkTrendQuery("teams with 3 bullpen innings yesterday and travel next day");
assert.ok(unresolved.unresolved.length >= 2);
console.log("sharktrends-query-parser tests passed");
