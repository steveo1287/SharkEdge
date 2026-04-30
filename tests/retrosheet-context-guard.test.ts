import assert from "node:assert/strict";

import { getRetrosheetExternalId } from "@/services/data/retrosheet/mlb-retrosheet-context";

assert.equal(getRetrosheetExternalId({}, ["teamId", "retrosheetTeamId"]), null);
assert.equal(getRetrosheetExternalId({ mlb: "BOS" }, ["teamId", "retrosheetTeamId"]), null);
assert.equal(
  getRetrosheetExternalId({ retrosheet: { teamId: "BOS" } }, ["teamId", "retrosheetTeamId"]),
  "BOS"
);
assert.equal(
  getRetrosheetExternalId({ retrosheetTeamId: "NYY" }, ["teamId", "retrosheetTeamId"]),
  "NYY"
);

console.log("retrosheet-context-guard tests passed");
