export type BankrollProfile = {
  bankroll: number;
  unitPct?: number;
  maxBetPct?: number;
  maxKellyFraction?: number;
  riskMode?: "conservative" | "standard" | "aggressive";
};

export type BetSizingInput = {
  bankroll: number;
  oddsAmerican: number;
  probability: number;
  confidence: number;
  edgePct: number;
  decision: "ATTACK" | "WATCH" | "PASS";
  riskFlags?: string[];
  profile?: Omit<BankrollProfile, "bankroll">;
};

export type BetSizingOutput = {
  unitSize: number;
  recommendedStake: number;
  recommendedUnits: number;
  kellyFraction: number;
  cappedKellyFraction: number;
  expectedValuePerDollar: number;
  maxStake: number;
  riskTier: "NO_BET" | "SMALL" | "STANDARD" | "STRONG";
  sizingReason: string;
  warnings: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function decimalOdds(american: number) {
  if (!Number.isFinite(american) || american === 0) return 1.91;
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function riskMultiplier(mode: BankrollProfile["riskMode"]) {
  if (mode === "aggressive") return 0.75;
  if (mode === "standard") return 0.5;
  return 0.25;
}

export function buildBetSizingRecommendation(input: BetSizingInput): BetSizingOutput {
  const bankroll = Math.max(0, input.bankroll);
  const unitPct = input.profile?.unitPct ?? 0.01;
  const maxBetPct = input.profile?.maxBetPct ?? 0.03;
  const maxKellyFraction = input.profile?.maxKellyFraction ?? 0.25;
  const mode = input.profile?.riskMode ?? "conservative";
  const unitSize = roundMoney(bankroll * unitPct);
  const maxStake = roundMoney(bankroll * maxBetPct);
  const warnings: string[] = [];

  const probability = clamp(input.probability, 0.001, 0.999);
  const decimal = decimalOdds(input.oddsAmerican);
  const netOdds = decimal - 1;
  const expectedValuePerDollar = probability * netOdds - (1 - probability);
  const fullKelly = netOdds > 0 ? (probability * netOdds - (1 - probability)) / netOdds : 0;
  const kellyFraction = Math.max(0, fullKelly);

  if (input.decision === "PASS") warnings.push("Decision gate is PASS");
  if (input.confidence < 0.62) warnings.push("Confidence below sizing threshold");
  if (input.edgePct < 2) warnings.push("Edge below minimum sizing threshold");
  if ((input.riskFlags ?? []).length) warnings.push(...(input.riskFlags ?? []).slice(0, 3));

  const eligible = input.decision !== "PASS" && input.confidence >= 0.62 && input.edgePct >= 2 && expectedValuePerDollar > 0;
  const fractionalKelly = clamp(kellyFraction * riskMultiplier(mode), 0, maxKellyFraction);
  const cappedKellyFraction = clamp(fractionalKelly, 0, maxBetPct);

  let recommendedStake = eligible ? bankroll * cappedKellyFraction : 0;
  recommendedStake = Math.min(recommendedStake, maxStake);

  let recommendedUnits = unitSize > 0 ? recommendedStake / unitSize : 0;

  if (eligible && recommendedUnits > 0) {
    if (input.decision === "WATCH") recommendedUnits = Math.min(recommendedUnits, 0.5);
    if (input.decision === "ATTACK") recommendedUnits = Math.max(recommendedUnits, 0.5);
  }

  recommendedUnits = roundMoney(recommendedUnits);
  recommendedStake = roundMoney(recommendedUnits * unitSize);

  const riskTier: BetSizingOutput["riskTier"] = !eligible || recommendedUnits <= 0
    ? "NO_BET"
    : recommendedUnits < 0.75
      ? "SMALL"
      : recommendedUnits < 1.5
        ? "STANDARD"
        : "STRONG";

  const sizingReason = riskTier === "NO_BET"
    ? "No stake recommended until edge, confidence, and risk gates clear."
    : `${riskTier.toLowerCase()} stake from capped fractional Kelly with ${mode} risk profile.`;

  return {
    unitSize,
    recommendedStake,
    recommendedUnits,
    kellyFraction: Number(kellyFraction.toFixed(5)),
    cappedKellyFraction: Number(cappedKellyFraction.toFixed(5)),
    expectedValuePerDollar: Number(expectedValuePerDollar.toFixed(5)),
    maxStake,
    riskTier,
    sizingReason,
    warnings
  };
}
