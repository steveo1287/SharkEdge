import type { LeagueKey } from "@/lib/types/domain";
import { applySimAccuracyGuardrail, getSimAccuracyGuardrails } from "@/services/simulation/sim-accuracy-guardrail";
import { buildGuardedSimProjection } from "@/services/simulation/guarded-sim-projection-engine";
import { buildMlbIntelV7Probability } from "@/services/simulation/mlb-intel-v7-probability";
import { applyMlbV8PlayerImpactModel } from "@/services/simulation/mlb-v8-player-impact-model";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

type SimProjectionInput = Parameters<typeof buildSimProjection>[0];
type SimProjection = Awaited<ReturnType<typeof buildSimProjection>>;

type MlbGovernor = NonNullable<NonNullable<SimProjection["mlbIntel"]>["governor"]>;

type MainBrainMetadata = {
  modelVersion: "main-sim-brain-v1";
  primaryMlbBrain: "mlb-intel-v8-player-impact+mlb-intel-v7-calibration";
  rawHomeWinPct: number;
  v8HomeWinPct: number;
  finalHomeWinPct: number;
  finalAwayWinPct: number;
  v7Tier: string;
  v7NoBet: boolean;
  v7Confidence: number;
};

function leadingProbability(distribution: SimProjection["distribution"]) {
  return Math.max(distribution.homeWinPct, distribution.awayWinPct);
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function asMlbTier(value: string): MlbGovernor["tier"] {
  if (value === "attack" || value === "watch" || value === "pass") return value;
  return "pass";
}

function previousMlbReasons(projection: SimProjection) {
  return projection.mlbIntel?.governor?.reasons ?? [];
}

export async function buildMlbMainSimBrainProjection(input: SimProjectionInput): Promise<SimProjection> {
  const rawProjection = await buildSimProjection(input);
  if (input.leagueKey !== "MLB" || !rawProjection.mlbIntel?.governor) return rawProjection;

  const v8Projection = await applyMlbV8PlayerImpactModel({
    gameId: input.id,
    awayTeam: rawProjection.matchup.away,
    homeTeam: rawProjection.matchup.home,
    projection: rawProjection
  });
  if (!v8Projection.mlbIntel?.governor) return rawProjection;

  const mlbIntel = v8Projection.mlbIntel;
  const v7 = buildMlbIntelV7Probability({
    rawHomeWinPct: v8Projection.distribution.homeWinPct,
    marketHomeNoVigProbability: mlbIntel.market?.homeNoVigProbability ?? null,
    existingConfidence: mlbIntel.governor.confidence ?? null,
    existingTier: mlbIntel.governor.tier ?? null
  });
  const guardrails = await getSimAccuracyGuardrails();
  const v8Reasons = (mlbIntel.playerImpact as { reasons?: string[] } | null | undefined)?.reasons ?? [];
  const brainReasons = [
    "Main sim brain active for MLB: v8 player-impact model feeds v7 shrinkage, no-vig market anchoring, and accuracy guardrails.",
    ...v8Reasons,
    ...v7.reasons,
    ...previousMlbReasons(rawProjection)
  ];
  const guarded = applySimAccuracyGuardrail({
    league: "MLB",
    tier: v7.tier,
    probability: leadingProbability({
      ...v8Projection.distribution,
      homeWinPct: v7.finalHomeWinPct,
      awayWinPct: v7.finalAwayWinPct
    }),
    confidence: v7.confidence,
    noBet: v7.noBet,
    reasons: brainReasons,
    guardrails
  });
  const finalTier = asMlbTier(guarded.tier);
  const reasons = guarded.downgraded
    ? [`${guarded.originalTier.toUpperCase()} downgraded to ${guarded.tier.toUpperCase()} by accuracy guard.`, ...guarded.reasons]
    : guarded.reasons;
  const mainBrain: MainBrainMetadata = {
    modelVersion: "main-sim-brain-v1",
    primaryMlbBrain: "mlb-intel-v8-player-impact+mlb-intel-v7-calibration",
    rawHomeWinPct: round(rawProjection.distribution.homeWinPct),
    v8HomeWinPct: round(v8Projection.distribution.homeWinPct),
    finalHomeWinPct: v7.finalHomeWinPct,
    finalAwayWinPct: v7.finalAwayWinPct,
    v7Tier: v7.tier,
    v7NoBet: v7.noBet,
    v7Confidence: v7.confidence
  };

  return {
    ...v8Projection,
    distribution: {
      ...v8Projection.distribution,
      homeWinPct: v7.finalHomeWinPct,
      awayWinPct: v7.finalAwayWinPct
    },
    mlbIntel: {
      ...mlbIntel,
      governor: {
        ...mlbIntel.governor,
        source: "main-sim-brain-v1",
        confidence: guarded.confidence ?? v7.confidence,
        tier: finalTier,
        noBet: guarded.noBet,
        reasons
      },
      mainBrain,
      v7
    } as SimProjection["mlbIntel"] & { mainBrain: MainBrainMetadata; v7: typeof v7 }
  };
}

export async function buildMainSimProjection(input: SimProjectionInput): Promise<SimProjection> {
  if (input.leagueKey === "MLB") return buildMlbMainSimBrainProjection(input);
  return buildGuardedSimProjection(input);
}

export function mainBrainLabel(leagueKey: LeagueKey) {
  if (leagueKey === "MLB") return "mlb-intel-v8-player-impact+mlb-intel-v7-calibration";
  if (leagueKey === "NBA") return "nba-guarded-winner-anchor";
  return "base-sim-projection";
}
