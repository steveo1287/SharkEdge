import type { MlbIntelligenceEnvelope } from "@/lib/types/mlb-intelligence";

export type MlbDecisionGate = {
  decision: "elite" | "strong" | "watchlist" | "pass";
  gatedRankMultiplier: number;
  rationale: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function buildMlbDecisionGate(envelope: MlbIntelligenceEnvelope): MlbDecisionGate {
  const width = envelope.winProbabilityBand.high - envelope.winProbabilityBand.low;
  const stability = envelope.explanationStability;
  const penalty = envelope.uncertaintyPenalty;

  if (stability >= 0.84 && width <= 0.11 && penalty <= 0.06 && envelope.selectiveQualification.qualifies) {
    return {
      decision: "elite",
      gatedRankMultiplier: 1.08,
      rationale: "Tight probability band with strong explanation stability."
    };
  }

  if (stability >= 0.74 && width <= 0.16 && penalty <= 0.1 && envelope.selectiveQualification.qualifies) {
    return {
      decision: "strong",
      gatedRankMultiplier: 1.03,
      rationale: "Actionable edge survives uncertainty gating."
    };
  }

  if (stability >= 0.62 && width <= 0.22) {
    return {
      decision: "watchlist",
      gatedRankMultiplier: 0.94,
      rationale: "Interesting signal, but uncertainty is too wide for top-tier surfacing."
    };
  }

  return {
    decision: "pass",
    gatedRankMultiplier: 0.82,
    rationale: "Prediction band or explanation stability is too weak."
  };
}

export function applyMlbDecisionGate(score: number, gate: MlbDecisionGate) {
  return Number((score * clamp(gate.gatedRankMultiplier, 0.75, 1.1)).toFixed(4));
}
