import assert from "node:assert/strict";

import {
  buildUfcOperationalCardRunPlan,
  ufcWarehouseFightIdForSource
} from "@/services/ufc/card-runner";

const snapshot = {
  sourceKey: "fixture-card",
  modelVersion: "ufc-fight-iq-v1",
  snapshotAt: "2026-05-31T18:00:00.000Z",
  fights: [
    {
      sourceFightId: "fight-a-b",
      eventLabel: "A vs B",
      fightDate: "2026-06-01T02:00:00.000Z",
      marketOddsAOpen: -120,
      marketOddsBOpen: 105,
      fighterA: { sourceId: "a", name: "A" },
      fighterB: { sourceId: "b", name: "B" }
    },
    {
      sourceFightId: "fight-c-d",
      eventLabel: "C vs D",
      fightDate: "2026-06-01T03:00:00.000Z",
      fighterA: { sourceId: "c", name: "C" },
      fighterB: { sourceId: "d", name: "D" }
    }
  ]
};

const plan = buildUfcOperationalCardRunPlan(snapshot);
assert.equal(plan.length, 2);
assert.equal(plan[0].warehouseFightId, ufcWarehouseFightIdForSource("fight-a-b", "A vs B", "2026-06-01T02:00:00.000Z"));
assert.equal(plan[0].marketOddsAOpen, -120);
assert.equal(plan[0].marketOddsBOpen, 105);
assert.equal(plan[1].modelVersion, "ufc-fight-iq-v1");

console.log("ufc-card-runner tests passed");
