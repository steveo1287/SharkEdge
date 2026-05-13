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
assert.equal(unresolved.filters.travelSpot, "home_to_road");
assert.ok(unresolved.unresolved.some((value) => value.includes("bullpen")));

const deepContext = parseSharkTrendQuery("home favorites with Elo edge 25+ and starter game score 58+ after allowing 8+");
assert.equal(deepContext.filters.side, "FAVORITE");
assert.equal(deepContext.filters.homeAway, "HOME");
assert.equal(deepContext.filters.eloDiffMin, 25);
assert.equal(deepContext.filters.starterRollingGameScoreMin, 58);
assert.equal(deepContext.filters.previousRunsAllowedMin, 8);

const seriesContext = parseSharkTrendQuery("gm 2 interleague matchup unders with total under 8.5");
assert.equal(seriesContext.filters.gameNumber, 2);
assert.equal(seriesContext.filters.interleagueGame, true);
assert.equal(seriesContext.filters.side, "UNDER");
assert.equal(seriesContext.filters.totalMax, 8.5);
console.log("sharktrends-query-parser tests passed");
