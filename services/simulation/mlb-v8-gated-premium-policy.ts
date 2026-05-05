import type { MlbPremiumPickPolicyResult } from "@/services/simulation/mlb-premium-pick-policy";
import type { MlbV8PromotionGate } from "@/services/simulation/mlb-v8-promotion-gate";

export type GatedMlbPremiumPickPolicyResult = MlbPremiumPickPolicyResult & {
  v8PromotionGate: {
    mode: MlbV8PromotionGate["mode"];
    sourceStatus: MlbV8PromotionGate["sourceStatus"];
    allowOfficialV8Promotion: boolean;
    allowAttackPicks: boolean;
    allowWatchPicks: boolean;
    requireShadowCapture: boolean;
    allowedBuckets: MlbV8PromotionGate["allowedBuckets"];
  };
};

function downgradeForGate(policy: MlbPremiumPickPolicyResult, gate: MlbV8PromotionGate): Pick<MlbPremiumPickPolicyResult, "tier" | "noBet" | "confidence" | "pickSide"> {
  if (gate.mode === "broad_promotion") {
    return {
      tier: policy.tier,
      noBet: policy.noBet,
      confidence: policy.confidence,
      pickSide: policy.pickSide
    };
  }

  if (gate.mode === "bucket_promotion") {
    return {
      tier: policy.tier === "attack" ? "watch" : policy.tier,
      noBet: policy.noBet,
      confidence: Math.min(policy.confidence, 0.6),
      pickSide: policy.pickSide
    };
  }

  return {
    tier: "pass",
    noBet: true,
    confidence: Math.min(policy.confidence, 0.5),
    pickSide: null
  };
}

export function applyMlbV8PromotionGateToPremiumPolicy(
  policy: MlbPremiumPickPolicyResult,
  gate: MlbV8PromotionGate
): GatedMlbPremiumPickPolicyResult {
  const downgraded = downgradeForGate(policy, gate);
  const gateReasons = [
    `MLB V8 promotion gate mode ${gate.mode}; source status ${gate.sourceStatus}.`,
    ...gate.hardRules.map((rule) => `V8 gate rule: ${rule}`),
    ...gate.blockers.map((blocker) => `V8 gate blocker: ${blocker}`),
    ...gate.warnings.map((warning) => `V8 gate warning: ${warning}`)
  ];

  const blockers = [
    ...policy.blockers,
    ...(gate.mode === "blocked" ? ["V8 promotion gate blocked official-pick promotion."] : []),
    ...(gate.mode === "shadow_only" ? ["V8 promotion gate requires shadow capture only."] : [])
  ];

  const warnings = [
    ...policy.warnings,
    ...(gate.mode === "bucket_promotion" ? ["V8 promotion gate allows only restricted bucket/watch promotion; ATTACK is capped."] : []),
    ...(gate.requireShadowCapture ? ["V8 promotion gate requires continued shadow capture."] : [])
  ];

  return {
    ...policy,
    ...downgraded,
    downgraded: policy.downgraded || downgraded.tier !== policy.tier || downgraded.noBet !== policy.noBet || downgraded.confidence < policy.confidence,
    blockers,
    warnings,
    reasons: [
      `MLB gated premium policy final tier ${downgraded.tier.toUpperCase()}, confidence ${(downgraded.confidence * 100).toFixed(1)}%.`,
      ...policy.reasons,
      ...gateReasons,
      ...blockers,
      ...warnings
    ],
    v8PromotionGate: {
      mode: gate.mode,
      sourceStatus: gate.sourceStatus,
      allowOfficialV8Promotion: gate.allowOfficialV8Promotion,
      allowAttackPicks: gate.allowAttackPicks,
      allowWatchPicks: gate.allowWatchPicks,
      requireShadowCapture: gate.requireShadowCapture,
      allowedBuckets: gate.allowedBuckets
    }
  };
}
