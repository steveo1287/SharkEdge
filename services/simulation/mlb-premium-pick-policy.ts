import type { MlbIntelV7ProbabilityResult, MlbIntelV7Tier } from "@/services/simulation/mlb-intel-v7-probability";

export type MlbPremiumPickPolicyInput = {
  v7: MlbIntelV7ProbabilityResult;
  playerImpact?: unknown;
  lock?: unknown;
  marketSource?: string | null;
};

export type MlbPremiumPickPolicyResult = {
  tier: MlbIntelV7Tier;
  noBet: boolean;
  confidence: number;
  pickSide: "HOME" | "AWAY" | null;
  policyVersion: "mlb-premium-pick-policy-v1";
  downgraded: boolean;
  originalTier: MlbIntelV7Tier;
  originalNoBet: boolean;
  originalConfidence: number;
  blockers: string[];
  warnings: string[];
  reasons: string[];
  gates: {
    hasMarket: boolean;
    edgeAbs: number | null;
    playerImpactApplied: boolean;
    playerImpactConfidence: number | null;
    profileStatus: string;
    profileSampleSize: number | null;
    startersConfirmed: boolean;
    lineupsConfirmed: boolean;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numberFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function boolFrom(value: unknown) {
  return value === true;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rank(tier: MlbIntelV7Tier) {
  if (tier === "attack") return 3;
  if (tier === "watch") return 2;
  return 1;
}

function capTier(current: MlbIntelV7Tier, maxTier: MlbIntelV7Tier) {
  return rank(current) > rank(maxTier) ? maxTier : current;
}

function finalNoBet(tier: MlbIntelV7Tier, blockers: string[], v7NoBet: boolean) {
  return tier === "pass" || blockers.length > 0 || v7NoBet;
}

export function applyMlbPremiumPickPolicy(input: MlbPremiumPickPolicyInput): MlbPremiumPickPolicyResult {
  const playerImpact = isRecord(input.playerImpact) ? input.playerImpact : null;
  const lock = isRecord(input.lock) ? input.lock : null;
  const edgeAbs = typeof input.v7.edgeHomePct === "number" ? Math.abs(input.v7.edgeHomePct) : null;
  const hasMarket = typeof input.v7.marketHomeNoVigProbability === "number" && Number.isFinite(input.v7.marketHomeNoVigProbability);
  const playerImpactApplied = playerImpact?.applied === true;
  const playerImpactConfidence = numberFrom(playerImpact?.confidence);
  const profileStatus = String(playerImpact?.profileStatus ?? "unknown");
  const profileSampleSize = numberFrom(playerImpact?.profileSampleSize);
  const startersConfirmed = boolFrom(lock?.startersConfirmed);
  const lineupsConfirmed = boolFrom(lock?.lineupsConfirmed);
  const blockers: string[] = [];
  const warnings: string[] = [];

  let tier = input.v7.tier;
  let confidence = input.v7.confidence;

  if (!hasMarket) blockers.push("Premium policy blocked pick: no-vig market anchor is missing.");
  if (input.v7.noBet || !input.v7.pickSide) blockers.push("Premium policy blocked pick: v7 official-pick gate did not qualify a side.");
  if (edgeAbs == null || edgeAbs < input.v7.minEdgePct) blockers.push("Premium policy blocked pick: calibrated edge is below the minimum gate.");

  if (!playerImpactApplied) {
    tier = capTier(tier, "watch");
    confidence = Math.min(confidence, 0.56);
    warnings.push("Player-impact model did not apply; maximum tier capped at WATCH.");
  }

  if (playerImpactConfidence != null && playerImpactConfidence < 0.5) {
    tier = capTier(tier, "watch");
    confidence = Math.min(confidence, 0.57);
    warnings.push(`Player-impact confidence is low at ${(playerImpactConfidence * 100).toFixed(1)}%; maximum tier capped at WATCH.`);
  }

  if (profileStatus === "DEFAULT" || profileStatus === "unknown") {
    tier = capTier(tier, "watch");
    confidence = Math.min(confidence, 0.58);
    warnings.push("Learned player-impact profile is not active; maximum tier capped at WATCH.");
  }

  if (profileStatus === "SAMPLE_TOO_SMALL") {
    tier = capTier(tier, "watch");
    confidence = Math.min(confidence, 0.6);
    warnings.push(`Player-impact profile sample is too small${profileSampleSize == null ? "" : ` (${profileSampleSize} rows)`}; maximum tier capped at WATCH.`);
  }

  if (!startersConfirmed) {
    tier = capTier(tier, "watch");
    confidence = Math.min(confidence, 0.6);
    warnings.push("Starting pitchers are not fully confirmed; maximum tier capped at WATCH.");
  }

  if (!lineupsConfirmed) {
    confidence = Math.min(confidence, 0.62);
    warnings.push("Confirmed batting orders are not fully locked; confidence capped.");
  }

  if (tier === "attack") {
    if ((edgeAbs ?? 0) < 0.055) {
      tier = "watch";
      warnings.push("ATTACK downgraded: premium attack requires at least 5.5% calibrated edge.");
    }
    if (confidence < 0.62) {
      tier = "watch";
      warnings.push("ATTACK downgraded: premium attack requires at least 62% confidence.");
    }
    if (!playerImpactApplied || profileStatus !== "LEARNED") {
      tier = "watch";
      warnings.push("ATTACK downgraded: premium attack requires applied player impact with LEARNED profile.");
    }
  }

  if (blockers.length) {
    tier = "pass";
    confidence = Math.min(confidence, 0.52);
  }

  confidence = Number(clamp(confidence, 0.36, 0.74).toFixed(3));
  const noBet = finalNoBet(tier, blockers, input.v7.noBet);
  const downgraded = tier !== input.v7.tier || noBet !== input.v7.noBet || confidence < input.v7.confidence;
  const reasons = [
    `MLB premium policy v1 final tier ${tier.toUpperCase()}, confidence ${(confidence * 100).toFixed(1)}%.`,
    ...blockers,
    ...warnings
  ];

  return {
    tier,
    noBet,
    confidence,
    pickSide: noBet ? null : input.v7.pickSide,
    policyVersion: "mlb-premium-pick-policy-v1",
    downgraded,
    originalTier: input.v7.tier,
    originalNoBet: input.v7.noBet,
    originalConfidence: input.v7.confidence,
    blockers,
    warnings,
    reasons,
    gates: {
      hasMarket,
      edgeAbs,
      playerImpactApplied,
      playerImpactConfidence,
      profileStatus,
      profileSampleSize,
      startersConfirmed,
      lineupsConfirmed
    }
  };
}
