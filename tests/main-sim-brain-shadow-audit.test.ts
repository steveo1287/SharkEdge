import assert from "node:assert/strict";

function delta(newValue: number, oldValue: number) {
  return Number((newValue - oldValue).toFixed(4));
}

assert.equal(delta(0.61, 0.56), 0.05);
assert.equal(delta(0.49, 0.52), -0.03);

const rows = [
  { homeMove: delta(0.61, 0.56), leanChanged: false, tierChanged: true, noBetChanged: false },
  { homeMove: delta(0.48, 0.53), leanChanged: true, tierChanged: false, noBetChanged: true }
];

const avgAbsHomeMove = Number((rows.reduce((sum, row) => sum + Math.abs(row.homeMove), 0) / rows.length).toFixed(4));
assert.equal(avgAbsHomeMove, 0.05);
assert.equal(rows.filter((row) => row.leanChanged).length, 1);
assert.equal(rows.filter((row) => row.tierChanged).length, 1);
assert.equal(rows.filter((row) => row.noBetChanged).length, 1);

console.log("main-sim-brain-shadow-audit.test.ts passed");
