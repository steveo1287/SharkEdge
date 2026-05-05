import { buildMlbIntelV7Probability, type MlbIntelV7ProbabilityResult } from "@/services/simulation/mlb-intel-v7-probability";

export type MlbIntelV7GuardResult = {
  v7: MlbIntelV7ProbabilityResult;
  reasons: string[];
  homeWinPct: number;
  awayWinPct: number;
};

type ProjectionLike = {
  distribution: {
    homeWinPct: number;
    awayWinPct: number;
    avgHome?: number;
    avgAway?: number;
  };
  mlbIntel?: {
    market?: {
      homeNoVigProbability?: number | null;
    } | null;
    governor?: {
      confidence?: number | null;
      tier?: string | null;
      noBet?: boolean | null;
      reasons?: string[] | null;
    } | null;
  } | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

export function buildMlbIntelV7Guard(projection: ProjectionLike): MlbIntelV7GuardResult | null {
  if (!projection.mlbIntel) return null;

  const v7 = buildMlbIntelV7Probability({
    rawHomeWinPct: projection.distribution.homeWinPct,
    marketHomeNoVigProbability: projection.mlbIntel.market?.homeNoVigProbability ?? null,
    existingConfidence: projection.mlbIntel.governor?.confidence ?? null,
    existingTier: projection.mlbIntel.governor?.tier ?? null
  });

  return {
    v7,
    reasons: [
      "MLB v7 guarded projection applied: live sim probability now uses shrinkage plus market anchoring before display/action gates.",
      ...v7.reasons
    ],
    homeWinPct: round(clamp(v7.finalHomeWinPct, 0.02, 0.98)),
    awayWinPct: round(clamp(v7.finalAwayWinPct, 0.02, 0.98))
  };
}

export function applyMlbIntelV7Guard<TProjection extends ProjectionLike>(projection: TProjection): TProjection {
  const guard = buildMlbIntelV7Guard(projection);
  if (!guard || !projection.mlbIntel?.governor) return projection;

  return {
    ...projection,
    distribution: {
      ...projection.distribution,
      homeWinPct: guard.homeWinPct,
      awayWinPct: guard.awayWinPct
    },
    mlbIntel: {
      ...projection.mlbIntel,
      governor: {
        ...projection.mlbIntel.governor,
        source: "mlb-intel-v7-guarded-projection",
        confidence: guard.v7.confidence,
        tier: guard.v7.tier,
        noBet: guard.v7.noBet,
        reasons: guard.reasons
      },
      v7: guard.v7
    }
  } as TProjection;
}
