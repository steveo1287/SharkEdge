import { buildOpportunityEvidenceBalance } from "@/services/opportunities/opportunity-evidence-balance";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function testBalancedCase() {
  const view = buildOpportunityEvidenceBalance({
    truthCalibration: {
      status: "SKIPPED_NO_DATA",
      scoreDelta: 0,
      timingDelta: 0,
      sourceWeightDelta: 0,
      trapEscalation: false,
      trapDeEscalation: false,
      baseScore: 72,
      calibratedScore: 72,
      baseTimingQuality: 68,
      calibratedTimingQuality: 68,
      sampleGate: {
        requiredSurfaced: 40,
        requiredClosed: 20,
        qualifiedSignals: 0,
        insufficientSignals: 0
      },
      summary: "No calibration data.",
      applied: [],
      skipped: []
    },
    marketMicrostructure: {
      status: "SKIPPED_NO_PATH",
      regime: "NO_PATH",
      pathTrusted: false,
      historyQualified: false,
      staleCopyConfidence: 0,
      decayRiskBucket: "UNKNOWN",
      estimatedHalfLifeMinutes: null,
      urgencyScore: 0,
      repricingLikelihood: 0,
      waitImprovementLikelihood: 0,
      scoreDelta: 0,
      timingDelta: 0,
      sourceWeightDelta: 0,
      trapEscalation: false,
      adjustments: {
        pathScoreDelta: 0,
        historyScoreDelta: 0,
        pathTimingDelta: 0,
        historyTimingDelta: 0,
        pathSourceWeightDelta: 0,
        historySourceWeightDelta: 0
      },
      sampleGate: {
        requiredClosed: 20,
        qualifiedSignals: 0,
        insufficientSignals: 0
      },
      summary: "No path.",
      reasons: []
    },
    sourceQuality: {
      score: 62,
      label: "Neutral source quality",
      influenceTier: "MAJOR_RETAIL",
      baseInfluenceWeight: 0.72,
      influenceWeight: 0.72,
      truthAdjustment: 0,
      marketPathAdjustment: 0,
      marketPathRole: "UNCLASSIFIED",
      sharpBookPresent: false,
      notes: []
    }
  });

  assert(view.status === "BALANCED", `expected BALANCED, got ${view.status}`);
  assert(view.overlapPenalty === 0, `expected 0 penalty, got ${view.overlapPenalty}`);
  assert(view.warning === null, `expected null warning, got ${view.warning}`);
}

function testMinorOverlapCase() {
  const view = buildOpportunityEvidenceBalance({
    truthCalibration: {
      status: "APPLIED",
      scoreDelta: 2,
      timingDelta: 1,
      sourceWeightDelta: 0.02,
      trapEscalation: false,
      trapDeEscalation: false,
      baseScore: 74,
      calibratedScore: 76,
      baseTimingQuality: 68,
      calibratedTimingQuality: 69,
      sampleGate: {
        requiredSurfaced: 40,
        requiredClosed: 20,
        qualifiedSignals: 5,
        insufficientSignals: 0
      },
      summary: "Applied.",
      applied: [],
      skipped: []
    },
    marketMicrostructure: {
      status: "SKIPPED_WEAK_PATH",
      regime: "NO_SIGNAL",
      pathTrusted: false,
      historyQualified: false,
      staleCopyConfidence: 0,
      decayRiskBucket: "UNKNOWN",
      estimatedHalfLifeMinutes: null,
      urgencyScore: 0,
      repricingLikelihood: 0,
      waitImprovementLikelihood: 0,
      scoreDelta: 0,
      timingDelta: 0,
      sourceWeightDelta: 0,
      trapEscalation: false,
      adjustments: {
        pathScoreDelta: 0,
        historyScoreDelta: 0,
        pathTimingDelta: 0,
        historyTimingDelta: 0,
        pathSourceWeightDelta: 0,
        historySourceWeightDelta: 0
      },
      sampleGate: {
        requiredClosed: 20,
        qualifiedSignals: 0,
        insufficientSignals: 1
      },
      summary: "Weak path.",
      reasons: []
    },
    sourceQuality: {
      score: 68,
      label: "Strong source quality",
      influenceTier: "MARKET_MAKER",
      baseInfluenceWeight: 1,
      influenceWeight: 1.04,
      truthAdjustment: 0.04,
      marketPathAdjustment: 0,
      marketPathRole: "UNCLASSIFIED",
      sharpBookPresent: true,
      notes: []
    }
  });

  assert(
    view.status === "MINOR_OVERLAP",
    `expected MINOR_OVERLAP, got ${view.status}`
  );
  assert(
    view.overlapPenalty > 0 && view.overlapPenalty < 4,
    `expected minor penalty, got ${view.overlapPenalty}`
  );
  assert(view.warning !== null, "expected warning for minor overlap");
}

function testStackedOverlapCase() {
  const view = buildOpportunityEvidenceBalance({
    truthCalibration: {
      status: "APPLIED",
      scoreDelta: 4,
      timingDelta: 2,
      sourceWeightDelta: 0.04,
      trapEscalation: false,
      trapDeEscalation: false,
      baseScore: 76,
      calibratedScore: 80,
      baseTimingQuality: 70,
      calibratedTimingQuality: 72,
      sampleGate: {
        requiredSurfaced: 40,
        requiredClosed: 20,
        qualifiedSignals: 2,
        insufficientSignals: 0
      },
      summary: "Applied.",
      applied: [],
      skipped: []
    },
    marketMicrostructure: {
      status: "APPLIED",
      regime: "FRAGMENTED",
      pathTrusted: false,
      historyQualified: false,
      staleCopyConfidence: 44,
      decayRiskBucket: "ELEVATED",
      estimatedHalfLifeMinutes: 8,
      urgencyScore: 61,
      repricingLikelihood: 57,
      waitImprovementLikelihood: 20,
      scoreDelta: 4,
      timingDelta: 2,
      sourceWeightDelta: 0.05,
      trapEscalation: false,
      adjustments: {
        pathScoreDelta: 2,
        historyScoreDelta: 2,
        pathTimingDelta: 1,
        historyTimingDelta: 1,
        pathSourceWeightDelta: 0.03,
        historySourceWeightDelta: 0.02
      },
      sampleGate: {
        requiredClosed: 20,
        qualifiedSignals: 1,
        insufficientSignals: 0
      },
      summary: "Applied.",
      reasons: []
    },
    sourceQuality: {
      score: 74,
      label: "Strong source quality",
      influenceTier: "MARKET_MAKER",
      baseInfluenceWeight: 1,
      influenceWeight: 1.08,
      truthAdjustment: 0.06,
      marketPathAdjustment: 0.05,
      marketPathRole: "FOLLOWER",
      sharpBookPresent: true,
      notes: []
    }
  });

  assert(
    view.status === "STACKED_OVERLAP",
    `expected STACKED_OVERLAP, got ${view.status}`
  );
  assert(
    view.overlapPenalty >= 4,
    `expected stacked penalty >= 4, got ${view.overlapPenalty}`
  );
  assert(view.warning !== null, "expected stacked warning");
  assert(view.reasons.length > 0, "expected overlap reasons");
}

function run() {
  testBalancedCase();
  testMinorOverlapCase();
  testStackedOverlapCase();
  console.log("Opportunity evidence balance tests passed.");
}

run();