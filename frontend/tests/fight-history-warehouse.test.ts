import assert from "node:assert/strict";

import { buildFightHistoryFeatureView } from "@/services/modeling/fight-history-warehouse";

const view = buildFightHistoryFeatureView({
  sportKey: "UFC",
  rounds: 5,
  fighter: {
    record: "27-1-0",
    recentWinRate: 86,
    recentMargin: 3.1,
    metadata: {
      finishRate: 0.54,
      durabilityScore: 8.6,
      controlScore: 8.4
    }
  },
  opponent: {
    record: "18-5-0",
    recentWinRate: 61,
    recentMargin: 0.8,
    metadata: {
      finishRate: 0.33,
      durabilityScore: 6.9,
      controlScore: 6.1
    }
  }
});

assert.equal(view.fighterQualityBucket === "elite" || view.fighterQualityBucket === "strong", true);
assert.equal(view.finishPressureBucket !== null, true);
assert.equal(view.durabilityEdgeBucket, "fighter_durable_edge");

console.log("fight-history-warehouse.test.ts passed");
