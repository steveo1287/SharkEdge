import { computeWilsonInterval } from "../statistical-guardrails";
import type { CandidateTrendSystem, TrendDiscoveryConfig } from "../types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function erf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normalCdf(value: number) {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

function computeEffectiveHypothesisCount(hypothesesTested: number, candidateCount: number) {
  const raw = Math.max(1, Math.floor(hypothesesTested));
  const correlatedCompression = Math.max(1, Math.log2(raw + 1));
  return Math.max(candidateCount, Math.ceil(raw / correlatedCompression));
}

export function computeOneSidedDiscoveryPValue(input: {
  wins: number;
  losses: number;
  nullRate?: number;
}) {
  const wins = Math.max(0, Math.floor(input.wins));
  const losses = Math.max(0, Math.floor(input.losses));
  const sampleSize = wins + losses;
  if (sampleSize <= 0) {
    return 1;
  }

  const nullRate = clamp(
    typeof input.nullRate === "number" && Number.isFinite(input.nullRate) ? input.nullRate : 0.5,
    0.01,
    0.99
  );
  const observedRate = wins / sampleSize;
  if (observedRate <= nullRate) {
    return 1;
  }

  const continuity = 0.5 / sampleSize;
  const variance = Math.max((nullRate * (1 - nullRate)) / sampleSize, 1e-9);
  const z = (observedRate - nullRate - continuity) / Math.sqrt(variance);
  return clamp(1 - normalCdf(z), 1e-12, 1);
}

export function applyMultipleTestingControl(
  systems: CandidateTrendSystem[],
  hypothesesTested: number,
  config: TrendDiscoveryConfig
) {
  if (!systems.length) {
    return [];
  }

  const effectiveHypothesisCount = computeEffectiveHypothesisCount(hypothesesTested, systems.length);
  const ranked = systems
    .map((system) => ({
      system,
      pValue: computeOneSidedDiscoveryPValue({
        wins: system.wins,
        losses: system.losses
      })
    }))
    .sort((left, right) => left.pValue - right.pValue || right.system.validationScore - left.system.validationScore);

  const qValues = new Array<number>(ranked.length);
  let runningMinimum = 1;

  for (let index = ranked.length - 1; index >= 0; index -= 1) {
    const rawQ = (ranked[index].pValue * effectiveHypothesisCount) / (index + 1);
    runningMinimum = Math.min(runningMinimum, rawQ);
    qValues[index] = clamp(runningMinimum, 0, 1);
  }

  return ranked.map(({ system, pValue }, index) => {
    const qValue = qValues[index];
    const interval = computeWilsonInterval({ wins: system.wins, losses: system.losses });
    const lowerEdge = typeof interval.lower === "number" ? Math.max(interval.lower - 0.5, 0) : 0;
    const searchPenaltyBase =
      Math.log1p(effectiveHypothesisCount) *
      config.multipleTestingPenaltyWeight *
      (0.9 + Math.max(0, system.conditions.length - 1) * 0.15);
    const evidenceRelief = lowerEdge * 26 + Math.min(system.sampleSize, 120) / 55;
    const qPenalty = qValue * 24 + Math.max(0, qValue - config.maxFalseDiscoveryRate) * 32;
    const complexityPenalty = Math.max(0, system.conditions.length - 1) * 1.5;
    const multipleTestingPenalty = Math.max(0, searchPenaltyBase - evidenceRelief) + qPenalty + complexityPenalty;
    const discoveryAdjustedScore = system.validationScore - multipleTestingPenalty;
    const warnings = [...system.warnings];

    if (qValue > config.maxFalseDiscoveryRate) {
      warnings.push("Search-burden adjustment flags this system as likely overstated.");
    } else if (qValue > config.maxFalseDiscoveryRate * 0.7) {
      warnings.push("Search-burden adjustment reduces confidence in this edge.");
    }
    if (effectiveHypothesisCount >= 25 && lowerEdge < 0.03) {
      warnings.push("Edge is being asked to survive a wide search space with only a thin confidence cushion.");
    }

    return {
      ...system,
      score: round(discoveryAdjustedScore),
      validationScore: round(discoveryAdjustedScore),
      discoveryAdjustedScore: round(discoveryAdjustedScore),
      multipleTestingPenalty: round(multipleTestingPenalty),
      hypothesesTested: Math.max(1, Math.floor(hypothesesTested)),
      effectiveHypothesisCount,
      discoveryPValue: round(pValue),
      falseDiscoveryRate: round(qValue),
      warnings: Array.from(new Set(warnings))
    } satisfies CandidateTrendSystem;
  });
}
