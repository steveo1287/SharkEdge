import assert from "node:assert/strict";

function pct(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

assert.equal(pct(0, 0), "0%");
assert.equal(pct(3, 10), "30%");
assert.equal(pct(2, 3), "67%");

function tone(status: { ok: boolean; upcomingFightCount: number; pendingSimCount: number }) {
  if (!status.ok) return "error";
  if (status.upcomingFightCount === 0) return "needs-load";
  if (status.pendingSimCount > 0) return "pending";
  return "complete";
}

assert.equal(tone({ ok: false, upcomingFightCount: 0, pendingSimCount: 0 }), "error");
assert.equal(tone({ ok: true, upcomingFightCount: 0, pendingSimCount: 0 }), "needs-load");
assert.equal(tone({ ok: true, upcomingFightCount: 5, pendingSimCount: 2 }), "pending");
assert.equal(tone({ ok: true, upcomingFightCount: 5, pendingSimCount: 0 }), "complete");

console.log("ufc-pipeline-status-panel tests passed");
