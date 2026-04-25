import assert from "node:assert/strict";

import { getLeagueForSportKey } from "@/services/odds/live-reference";

assert.equal(getLeagueForSportKey("baseball_mlb"), "MLB");
assert.equal(getLeagueForSportKey("MLB"), "MLB");
assert.equal(getLeagueForSportKey("mlb"), "MLB");
assert.equal(getLeagueForSportKey("NBA"), "NBA");
assert.equal(getLeagueForSportKey("NCAA Men's Basketball"), "NBA");
assert.equal(getLeagueForSportKey("College Football"), "NCAAF");
assert.equal(getLeagueForSportKey("unknown_sport"), null);

console.log("live-reference tests passed");
