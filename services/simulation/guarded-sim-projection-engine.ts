import { applySimAccuracyGuardrail, getSimAccuracyGuardrails } from "@/services/simulation/sim-accuracy-guardrail";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

type SimProjectionInput = Parameters<typeof buildSimProjection>[0];
type SimProjection = Awaited<ReturnType<typeof buildSimProjection>>;

function leadingProbability(projection: SimProjection) {
  return Math.max(projection.distribution.homeWinPct, projection.distribution.awayWinPct);
}

export async function buildGuardedSimProjection(input: SimProjectionInput): Promise<SimProjection> {
  const projection = await buildSimProjection(input);

  if (input.leagueKey !== "NBA" && input.leagueKey !== "MLB") return projection;

  const guardrails = await getSimAccuracyGuardrails();
  const probability = leadingProbability(projection);

  if (input.leagueKey === "NBA" && projection.nbaIntel) {
    const guarded = applySimAccuracyGuardrail({
      league: "NBA",
      tier: projection.nbaIntel.tier,
      probability,
      confidence: projection.nbaIntel.confidence,
      noBet: projection.nbaIntel.noBet,
      reasons: projection.nbaIntel.reasons,
      guardrails
    });

    return {
      ...projection,
      nbaIntel: {
        ...projection.nbaIntel,
        tier: guarded.tier === "attack" || guarded.tier === "watch" ? guarded.tier : "pass",
        confidence: guarded.confidence ?? projection.nbaIntel.confidence,
        noBet: guarded.noBet,
        reasons: guarded.downgraded
          ? [`${guarded.originalTier.toUpperCase()} downgraded to ${guarded.tier.toUpperCase()} by accuracy guard.`, ...guarded.reasons]
          : guarded.reasons
      }
    };
  }

  if (input.leagueKey === "MLB" && projection.mlbIntel?.governor) {
    const guarded = applySimAccuracyGuardrail({
      league: "MLB",
      tier: projection.mlbIntel.governor.tier,
      probability,
      confidence: projection.mlbIntel.governor.confidence,
      noBet: projection.mlbIntel.governor.noBet,
      reasons: projection.mlbIntel.governor.reasons,
      guardrails
    });

    return {
      ...projection,
      mlbIntel: {
        ...projection.mlbIntel,
        governor: {
          ...projection.mlbIntel.governor,
          tier: guarded.tier,
          confidence: guarded.confidence ?? projection.mlbIntel.governor.confidence,
          noBet: guarded.noBet,
          reasons: guarded.downgraded
            ? [`${guarded.originalTier.toUpperCase()} downgraded to ${guarded.tier.toUpperCase()} by accuracy guard.`, ...guarded.reasons]
            : guarded.reasons
        }
      }
    };
  }

  return projection;
}
