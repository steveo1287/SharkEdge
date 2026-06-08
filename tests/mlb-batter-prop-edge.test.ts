import assert from "node:assert/strict";

import { evaluateMlbBatterPropEdges, type MlbBatterBookPropQuote } from "@/services/simulation/mlb-batter-prop-edge";
import type { MlbBatterPropSurface } from "@/services/simulation/mlb-batter-prop-surface";

const surface: MlbBatterPropSurface = {
  modelVersion: "mlb-batter-prop-surface-v1",
  outcomes: [
    { market: "HITS", line: 0.5, side: "OVER", probability: 0.68, fairAmerican: -213, confidence: 0.72 },
    { market: "HITS", line: 0.5, side: "UNDER", probability: 0.32, fairAmerican: 213, confidence: 0.72 },
    { market: "TOTAL_BASES", line: 1.5, side: "OVER", probability: 0.46, fairAmerican: 117, confidence: 0.69 },
    { market: "TOTAL_BASES", line: 1.5, side: "UNDER", probability: 0.54, fairAmerican: -117, confidence: 0.69 },
    { market: "HOME_RUN", line: 0.5, side: "OVER", probability: 0.09, fairAmerican: 1011, confidence: 0.44 },
    { market: "HOME_RUN", line: 0.5, side: "UNDER", probability: 0.91, fairAmerican: -1011, confidence: 0.44 }
  ],
  strongest: [],
  notes: ["test surface"]
};

const quotes: MlbBatterBookPropQuote[] = [
  { book: "DraftKings", market: "HITS", line: 0.5, side: "OVER", americanOdds: -145 },
  { book: "FanDuel", market: "HITS", line: 0.5, side: "UNDER", americanOdds: 110 },
  { book: "DraftKings", market: "TOTAL_BASES", line: 1.5, side: "OVER", americanOdds: 150 },
  { book: "FanDuel", market: "HOME_RUN", line: 0.5, side: "OVER", americanOdds: 1200 },
  { book: "BadBook", market: "STRIKEOUTS", line: 1.5, side: "OVER", americanOdds: 120 }
];

const report = evaluateMlbBatterPropEdges({
  surface,
  quotes,
  config: {
    minProbabilityEdge: 0.025,
    minExpectedValue: 0.025,
    minConfidence: 0.42
  }
});

assert.equal(report.modelVersion, "mlb-batter-prop-edge-v1");
assert.equal(report.candidates.length, 4);
assert.ok(report.warnings.some((warning) => warning.includes("No model surface outcome")));

const hitsOver = report.candidates.find((candidate) => candidate.book === "DraftKings" && candidate.market === "HITS" && candidate.side === "OVER");
assert.ok(hitsOver);
assert.equal(hitsOver!.fairAmerican, -213);
assert.equal(hitsOver!.bookAmerican, -145);
assert.ok(hitsOver!.probabilityEdge > 0.08);
assert.ok(hitsOver!.expectedValuePerUnit > 0.14);
assert.ok(["EDGE", "STRONG_EDGE"].includes(hitsOver!.grade));
assert.ok(hitsOver!.reasons.some((reason) => reason.includes("Model probability")));

const totalBasesOver = report.candidates.find((candidate) => candidate.book === "DraftKings" && candidate.market === "TOTAL_BASES");
assert.ok(totalBasesOver);
assert.ok(totalBasesOver!.expectedValuePerUnit > 0.1);
assert.ok(totalBasesOver!.grade !== "PASS");

const hrOver = report.candidates.find((candidate) => candidate.market === "HOME_RUN");
assert.ok(hrOver);
assert.ok(hrOver!.confidence < 0.5);
assert.ok(["WATCH", "EDGE", "PASS"].includes(hrOver!.grade));

assert.ok(report.passes.length >= 2);
assert.ok(report.passes.every((candidate) => candidate.grade !== "PASS"));
assert.ok(report.passes.every((candidate) => candidate.probabilityEdge >= 0.025));
assert.ok(report.passes.every((candidate) => candidate.expectedValuePerUnit >= 0.025));
assert.ok(report.passes.every((candidate) => candidate.confidence >= 0.42));

const emptyReport = evaluateMlbBatterPropEdges({ surface, quotes: [] });
assert.equal(emptyReport.candidates.length, 0);
assert.ok(emptyReport.warnings.some((warning) => warning.includes("No book quotes supplied")));

console.log("mlb-batter-prop-edge.test.ts passed");
