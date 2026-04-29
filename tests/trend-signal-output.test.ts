import assert from "node:assert/strict";

import {
  filterTrendSignalsForOutput,
  isVisibleTrendSignal,
  summarizeTrendSignalCounts
} from "@/services/trends/trend-signal-output";

const signals = [
  {
    grade: "A" as const,
    qualityTier: "A" as const,
    quality: { actionability: "ACTIONABLE" as const }
  },
  {
    grade: "Watch" as const,
    qualityTier: "C" as const,
    quality: { actionability: "RESEARCH_ONLY" as const }
  },
  {
    grade: "Pass" as const,
    qualityTier: "HIDE" as const,
    quality: { actionability: "HIDE" as const }
  },
  {
    grade: "Pass" as const,
    qualityTier: "B" as const,
    quality: { actionability: "HIDE" as const }
  }
];

assert.equal(isVisibleTrendSignal(signals[0]), true);
assert.equal(isVisibleTrendSignal(signals[1]), true);
assert.equal(isVisibleTrendSignal(signals[2]), false);
assert.equal(isVisibleTrendSignal(signals[3]), false);

const visible = filterTrendSignalsForOutput(signals);
assert.equal(visible.length, 2);
assert.deepEqual(visible.map((signal) => signal.quality.actionability), ["ACTIONABLE", "RESEARCH_ONLY"]);

const debug = filterTrendSignalsForOutput(signals, true);
assert.equal(debug.length, 4);

const counts = summarizeTrendSignalCounts(signals, visible);
assert.equal(counts.total, 2);
assert.equal(counts.totalRaw, 4);
assert.equal(counts.attack, 1);
assert.equal(counts.watch, 1);
assert.equal(counts.pass, 0);
assert.equal(counts.actionable, 1);
assert.equal(counts.researchOnly, 1);
assert.equal(counts.hiddenQuality, 2);

console.log("trend-signal-output tests passed");
