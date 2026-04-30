import assert from "node:assert/strict";

import {
  RETROSHEET_ATTRIBUTION,
  requiresRetrosheetAttribution
} from "@/services/data/retrosheet/retrosheet-attribution";

assert.ok(RETROSHEET_ATTRIBUTION.includes("copyrighted by Retrosheet"));
assert.ok(requiresRetrosheetAttribution(["internal", "retrosheet"]));
assert.ok(requiresRetrosheetAttribution(["Retrosheet_Game_Log"]));
assert.equal(requiresRetrosheetAttribution(["fangraphs", "statcast"]), false);

console.log("retrosheet-attribution tests passed");
