import assert from "node:assert/strict";

import {
  DEFAULT_UFC_ENSEMBLE_WEIGHTS,
  normalizeUfcEnsembleWeights,
  parseLearnedUfcEnsembleWeights,
  parseManualUfcEnsembleWeights
} from "@/services/ufc/ensemble-weight-store";

assert.deepEqual(normalizeUfcEnsembleWeights({ skillMarkov: 0, exchangeMonteCarlo: 0 }), DEFAULT_UFC_ENSEMBLE_WEIGHTS);
assert.deepEqual(normalizeUfcEnsembleWeights({ skillMarkov: 2, exchangeMonteCarlo: 1 }), { skillMarkov: 0.6667, exchangeMonteCarlo: 0.3333 });

assert.equal(parseManualUfcEnsembleWeights(null), null);
assert.deepEqual(parseManualUfcEnsembleWeights({ skillMarkovWeight: 0.6, exchangeMonteCarloWeight: 0.4 }), { skillMarkov: 0.6, exchangeMonteCarlo: 0.4 });
assert.deepEqual(parseManualUfcEnsembleWeights({ skillMarkovWeight: 0.7 }), { skillMarkov: 0.6087, exchangeMonteCarlo: 0.3913 });
assert.deepEqual(parseManualUfcEnsembleWeights({ exchangeMonteCarloWeight: 0.7 }), { skillMarkov: 0.44, exchangeMonteCarlo: 0.56 });

const learned = parseLearnedUfcEnsembleWeights({
  id: "cal-1",
  generated_at: "2026-06-01T00:00:00.000Z",
  metrics_json: {
    sampleCount: 64,
    shrinkage: 1,
    recommendedWeights: { skillMarkov: 0.35, exchangeMonteCarlo: 0.65 }
  }
});
assert.equal(learned?.source, "learned");
assert.deepEqual(learned?.weights, { skillMarkov: 0.35, exchangeMonteCarlo: 0.65 });
assert.equal(learned?.calibrationSnapshotId, "cal-1");
assert.equal(learned?.sampleCount, 64);
assert.equal(learned?.shrinkage, 1);

assert.equal(parseLearnedUfcEnsembleWeights(null), null);
assert.equal(parseLearnedUfcEnsembleWeights({ id: "bad", generated_at: "2026-06-01T00:00:00.000Z", metrics_json: {} }), null);
assert.equal(parseLearnedUfcEnsembleWeights({ id: "bad", generated_at: "2026-06-01T00:00:00.000Z", metrics_json: { recommendedWeights: { skillMarkov: "nope", exchangeMonteCarlo: 0.5 } } }), null);

console.log("ufc-ensemble-weight-store tests passed");
