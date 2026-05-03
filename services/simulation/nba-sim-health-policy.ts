import type { NbaBacktestDiagnostics } from "./nba-sim-backtest-diagnostics";

export type NbaSimHealthStatus = "GREEN" | "YELLOW" | "RED";
export type NbaSimPolicyActionState = "BET_NOW" | "WAIT" | "WATCH" | "PASS";
export type NbaSimRecommendationTier = "attack" | "watch" | "pass";

export type NbaSimHealthChecklistItem = {
  key:
    | "diagnostics_available"
    | "sample_size"
    | "roi"
    | "clv"
    | "brier_vs_market"
    | "logloss_vs_market"
    | "source_health"
    | "injury_freshness"
    | "star_uncertainty"
    | "calibration_bucket";
  label: string;
  passed: boolean;
  observed: number | string | boolean | null;
  required: string;
  critical: boolean;
};

export type NbaSimHealthPolicyInput = {
  diagnostics: NbaBacktestDiagnostics | null;
  diagnosticsRequired?: boolean;
  sourceHealth?: NbaSimHealthStatus | null;
  injuryReportFresh?: boolean | null;
  starQuestionable?: boolean | null;
  calibrationBucketHealthy?: boolean | null;
};

export type NbaSimHealthPolicy = {
  status: NbaSimHealthStatus;
  canBetNow: boolean;
  maxActionState: NbaSimPolicyActionState;
  maxKellyPct: number;
  blockers: string[];
  checklist: NbaSimHealthChecklistItem[];
};

export type NbaSimPolicyRecommendationInput = {
  tier: NbaSimRecommendationTier;
  noBet: boolean;
  confidence: number;
  reasons: string[];
  policy: NbaSimHealthPolicy;
};

export type NbaSimPolicyRecommendationResult = {
  tier: NbaSimRecommendationTier;
  noBet: boolean;
  confidence: number;
  reasons: string[];
  capped: boolean;
};

function addCheck(
  checklist: NbaSimHealthChecklistItem[],
  item: NbaSimHealthChecklistItem
) {
  checklist.push(item);
}

function observedBoolean(value: boolean | null | undefined) {
  return value ?? null;
}

function diagnosticMetricPassed(args: {
  value: number | null | undefined;
  baseline: number | null | undefined;
  mode: "less_than_baseline" | "greater_than_zero";
}) {
  if (typeof args.value !== "number" || !Number.isFinite(args.value)) return false;
  if (args.mode === "greater_than_zero") return args.value > 0;
  if (typeof args.baseline !== "number" || !Number.isFinite(args.baseline)) return false;
  return args.value < args.baseline;
}

function capConfidence(value: number, cap: number) {
  if (!Number.isFinite(value)) return cap;
  return Math.min(value, cap);
}

export function buildNbaSimHealthPolicy(input: NbaSimHealthPolicyInput): NbaSimHealthPolicy {
  const diagnostics = input.diagnostics;
  const diagnosticsRequired = input.diagnosticsRequired ?? true;
  const checklist: NbaSimHealthChecklistItem[] = [];

  addCheck(checklist, {
    key: "diagnostics_available",
    label: "NBA diagnostics available",
    passed: diagnostics !== null,
    observed: diagnostics ? "available" : null,
    required: diagnosticsRequired ? "diagnostics object from graded NBA picks" : "not required for runtime action gate",
    critical: diagnosticsRequired
  });

  addCheck(checklist, {
    key: "sample_size",
    label: "Graded NBA sample size",
    passed: (diagnostics?.gradedCount ?? 0) >= 100,
    observed: diagnostics?.gradedCount ?? 0,
    required: diagnosticsRequired ? ">= 100 graded picks" : "not required for runtime action gate",
    critical: diagnosticsRequired
  });

  addCheck(checklist, {
    key: "roi",
    label: "NBA ROI after vig",
    passed: diagnosticMetricPassed({ value: diagnostics?.roiPct, baseline: null, mode: "greater_than_zero" }),
    observed: diagnostics?.roiPct ?? null,
    required: diagnosticsRequired ? "> 0%" : "not required for runtime action gate",
    critical: diagnosticsRequired
  });

  addCheck(checklist, {
    key: "clv",
    label: "Average closing-line value",
    passed: diagnosticMetricPassed({ value: diagnostics?.clvPct, baseline: null, mode: "greater_than_zero" }),
    observed: diagnostics?.clvPct ?? null,
    required: diagnosticsRequired ? "> 0%" : "not required for runtime action gate",
    critical: diagnosticsRequired
  });

  addCheck(checklist, {
    key: "brier_vs_market",
    label: "Brier score beats no-vig market",
    passed: diagnosticMetricPassed({
      value: diagnostics?.brierScore,
      baseline: diagnostics?.marketBaselineBrierScore,
      mode: "less_than_baseline"
    }),
    observed: diagnostics?.marketBaselineBrierScore == null || diagnostics?.brierScore == null
      ? null
      : `${diagnostics.brierScore} vs ${diagnostics.marketBaselineBrierScore}`,
    required: diagnosticsRequired ? "model Brier < no-vig market Brier" : "not required for runtime action gate",
    critical: diagnosticsRequired
  });

  addCheck(checklist, {
    key: "logloss_vs_market",
    label: "Log loss beats no-vig market",
    passed: diagnosticMetricPassed({
      value: diagnostics?.logLoss,
      baseline: diagnostics?.marketBaselineLogLoss,
      mode: "less_than_baseline"
    }),
    observed: diagnostics?.marketBaselineLogLoss == null || diagnostics?.logLoss == null
      ? null
      : `${diagnostics.logLoss} vs ${diagnostics.marketBaselineLogLoss}`,
    required: diagnosticsRequired ? "model log loss < no-vig market log loss" : "not required for runtime action gate",
    critical: diagnosticsRequired
  });

  addCheck(checklist, {
    key: "source_health",
    label: "NBA source health",
    passed: input.sourceHealth === "GREEN",
    observed: input.sourceHealth ?? "unknown",
    required: "GREEN",
    critical: true
  });

  addCheck(checklist, {
    key: "injury_freshness",
    label: "NBA injury report freshness",
    passed: input.injuryReportFresh === true,
    observed: observedBoolean(input.injuryReportFresh),
    required: "fresh/current injury report",
    critical: true
  });

  addCheck(checklist, {
    key: "star_uncertainty",
    label: "Star/questionable blocker",
    passed: input.starQuestionable === false,
    observed: observedBoolean(input.starQuestionable),
    required: "no unresolved high-usage questionable player",
    critical: true
  });

  addCheck(checklist, {
    key: "calibration_bucket",
    label: "Calibration bucket health",
    passed: input.calibrationBucketHealthy === true,
    observed: observedBoolean(input.calibrationBucketHealthy),
    required: "current confidence bucket healthy",
    critical: true
  });

  const blockers = checklist
    .filter((item) => item.critical && !item.passed)
    .map((item) => `${item.label} failed: required ${item.required}, observed ${item.observed ?? "missing"}`);

  const criticalFailures = checklist.filter((item) => item.critical && !item.passed).length;
  const status: NbaSimHealthStatus = criticalFailures === 0
    ? "GREEN"
    : criticalFailures <= 2 && input.sourceHealth !== "RED" && input.starQuestionable !== true
      ? "YELLOW"
      : "RED";

  return {
    status,
    canBetNow: status === "GREEN",
    maxActionState: status === "GREEN" ? "BET_NOW" : status === "YELLOW" ? "WATCH" : "PASS",
    maxKellyPct: status === "GREEN" ? 0.5 : 0,
    blockers,
    checklist
  };
}

export function summarizeNbaSimHealthPolicy(policy: NbaSimHealthPolicy) {
  if (policy.status === "GREEN") {
    return "NBA sim health is GREEN: BET_NOW can be allowed with max 0.5% Kelly.";
  }
  if (policy.status === "YELLOW") {
    return "NBA sim health is YELLOW: analysis can show, but action should stay WATCH with zero Kelly.";
  }
  return "NBA sim health is RED: force PASS until blockers clear.";
}

export function enforceNbaSimHealthPolicy(input: NbaSimPolicyRecommendationInput): NbaSimPolicyRecommendationResult {
  const summary = summarizeNbaSimHealthPolicy(input.policy);
  if (input.policy.status === "GREEN") {
    return {
      tier: input.tier,
      noBet: input.noBet,
      confidence: input.confidence,
      reasons: [summary, ...input.reasons],
      capped: false
    };
  }

  if (input.policy.status === "YELLOW") {
    return {
      tier: input.tier === "attack" ? "watch" : input.tier,
      noBet: true,
      confidence: capConfidence(input.confidence, 0.57),
      reasons: [
        "NBA health policy capped this output to WATCH with zero Kelly.",
        summary,
        ...input.policy.blockers,
        ...input.reasons
      ],
      capped: true
    };
  }

  return {
    tier: "pass",
    noBet: true,
    confidence: capConfidence(input.confidence, 0.49),
    reasons: [
      "NBA health policy forced PASS with zero Kelly.",
      summary,
      ...input.policy.blockers,
      ...input.reasons
    ],
    capped: true
  };
}
