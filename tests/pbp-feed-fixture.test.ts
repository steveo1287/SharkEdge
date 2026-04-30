import assert from "node:assert/strict";

import { normalizeSportsDataverseEventId } from "@/services/events/sportsdataverse-client";

assert.equal(normalizeSportsDataverseEventId("401585601"), 401585601);
assert.equal(normalizeSportsDataverseEventId("espn__401585601"), 401585601);
assert.equal(normalizeSportsDataverseEventId("custom-id"), "custom-id");

console.log("pbp-feed-fixture tests passed");
