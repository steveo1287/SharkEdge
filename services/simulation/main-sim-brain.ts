import type { LeagueKey } from "@/lib/types/domain";
import { applySimAccuracyGuardrail, getSimAccuracyGuardrails } from "@/services/simulation/sim-accuracy-guardrail";
import { buildGuardedSimProjection } from "@/services/simulation/guarded-sim-projection-engine";
import { buildMlbIntelV7Probability, type MlbIntelV7Tier } from "@/services/simulation/mlb-intel-v7-probability";
import { buildMlbPremiumFormulaStack } from "@/services/simulation/mlb-premium-formula-stack";
import { getActiveMlbPremiumFormulaProfile } from "@/services/simulation/mlb-premium-formula-profile";
import { applyMlbPremiumPickPolicy } from "@/services/simulation/mlb-premium-pick-policy";
import { applyMlbV8PlayerImpactModel } from "@/services/simulation/mlb-v8-player-impact-model";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

type SimProjectionInput = Parameters<typeof buildSimProjection>[0];
type SimProjection = Awaited<ReturnType<typeof buildSimProjection>>;

type MlbIntel = NonNullable<SimProjection["mlbIntel"]>;
type MlbGovernor = NonNullable<MlbIntel["governor"]>;
type MlbIntelWithGovernor = MlbIntel & { governor: MlbGovernor; playerImpact?: unknown; premiumPolicy?: unknown; premiumFormulaStack?: unknown };

type MainBrainMetadata = {
  modelVersion: "main-sim-brain-v1";
  primaryMlbBrain: "mlb-intel-v8-player-impact+learned-formula-profile+mlb-intel-v7-calibration+premium-policy";
  rawHomeWinPct: number;
  v8HomeWinPct: number;
  v7HomeWinPct: number;
  formulaHomeWinPct: number;
  finalHomeWinPct: number;
  finalAwayWinPct: number;
  v7Tier: string;
  v7NoBet: boolean;
  v7Confidence: number;
  formulaProfileStatus: string;
  formulaProfileSampleSize: number;
  formulaTier: string;
  formulaConfidence: number;
  premiumTier: string;
  premiumNoBet: boolean;
  premiumConfidence: number;
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

function hasMlbGovernor(projection: SimProjection): projection is SimProjection & { mlbIntel: MlbIntelWithGovernor } {
  return Boolean(projection.mlbIntel?.governor);
}

function tierForFormula(edgeHomePct: number | null, confidence: number, minEdgePct: number): MlbIntelV7Tier {
  if (edgeHomePct == null || Math.abs(edgeHomePct) < minEdgePct || confidence < 0.5) return "pass";
  if (Math.abs(edgeHomePct) >= 0.055 && confidence >= 0.62) return "attack";
  return "watch";
}

export async function buildMlbMainSimBrainProjection(input: SimProjectionInput): Promise<SimProjection> {
  const rawProjection = await buildSimProjection(input);
  if (input.leagueKey !== "MLB" || !hasMlbGovernor(rawProjection)) return rawProjection;

  const [v8Projection, formulaProfile] = await Promise.all([
    applyMlbV8PlayerImpactModel({
      gameId: input.id,
      awayTeam: rawProjection.matchup.away,
      homeTeam: rawProjection.matchup.home,
      projection: rawProjection
    }),
    getActiveMlbPremiumFormulaProfile()
  ]);
  if (!hasMlbGovernor(v8Projection)) return rawProjection;

  const mlbIntel = v8Projection.mlbIntel;
  const governor = mlbIntel.governor;
  const v7 = buildMlbIntelV7Probability({
    rawHomeWinPct: v8Projection.distribution.homeWinPct,
    marketHomeNoVigProbability: mlbIntel.market?.homeNoVigProbability ?? null,
    existingConfidence: governor.confidence ?? null,
    existingTier: governor.tier ?? null
  });
  const premiumFormulaStack = buildMlbPremiumFormulaStack({
    rawHomeWinPct: rawProjection.distribution.homeWinPct,
    v8HomeWinPct: v8Projection.distribution.homeWinPct,
    v7HomeWinPct: v7.finalHomeWinPct,
    marketHomeNoVigProbability: v7.marketHomeNoVigProbability,
    homeRuns: v8Projection.distribution.avgHome,
    awayRuns: v8Projection.distribution.avgAway,
    profile: formulaProfile
  });
  const formulaConfidence = Math.min(v7.confidence, premiumFormulaStack.confidenceCap);
  const formulaTier = tierForFormula(premiumFormulaStack.edgeHomePct, formulaConfidence, v7.minEdgePct);
  const formulaPickSide = premiumFormulaStack.edgeHomePct == null || formulaTier === "pass"
    ? null
    : premiumFormulaStack.edgeHomePct >= 0 ? "HOME" as const : "AWAY" as const;
  const formulaAdjustedV7 = {
    ...v7,
    finalHomeWinPct: premiumFormulaStack.finalHomeWinPct,
    finalAwayWinPct: premiumFormulaStack.finalAwayWinPct,
    edgeHomePct: premiumFormulaStack.edgeHomePct,
    confidence: round(formulaConfidence, 3),
    tier: formulaTier,
    pickSide: formulaPickSide,
    noBet: formulaTier === "pass",
    reasons: [...v7.reasons, ...premiumFormulaStack.reasons]
  };
  const premiumPolicy = applyMlbPremiumPickPolicy({
    v7: formulaAdjustedV7,
    playerImpact: mlbIntel.playerImpact,
    lock: mlbIntel.lock,
    marketSource: mlbIntel.market?.source ?? null
  });
  const guardrails = await getSimAccuracyGuardrails();
  const v8Reasons = (mlbIntel.playerImpact as { reasons?: string[] } | null | undefined)?.reasons ?? [];
  const brainReasons = [
    "Main sim brain active for MLB: v8 player-impact model feeds learned formula profile, v7 shrinkage, no-vig market anchoring, premium pick policy, and accuracy guardrails.",
    ...v8Reasons,
    ...premiumFormulaStack.reasons,
    ...v7.reasons,
    ...premiumPolicy.reasons,
    ...previousMlbReasons(rawProjection)
  ];
  const guarded = applySimAccuracyGuardrail({
    league: "MLB",
    tier: premiumPolicy.tier,
    probability: leadingProbability({
      ...v8Projection.distribution,
      homeWinPct: premiumFormulaStack.finalHomeWinPct,
      awayWinPct: premiumFormulaStack.finalAwayWinPct
    }),
    confidence: premiumPolicy.confidence,
    noBet: premiumPolicy.noBet,
    reasons: brainReasons,
    guardrails
  });
  const finalTier = asMlbTier(guarded.tier);
  const reasons = guarded.downgraded
    ? [`${guarded.originalTier.toUpperCase()} downgraded to ${guarded.tier.toUpperCase()} by accuracy guard.`, ...guarded.reasons]
    : guarded.reasons;
  const mainBrain: MainBrainMetadata = {
    modelVersion: "main-sim-brain-v1",
    primaryMlbBrain: "mlb-intel-v8-player-impact+learned-formula-profile+mlb-intel-v7-calibration+premium-policy",
    rawHomeWinPct: round(rawProjection.distribution.homeWinPct),
    v8HomeWinPct: round(v8Projection.distribution.homeWinPct),
    v7HomeWinPct: v7.finalHomeWinPct,
    formulaHomeWinPct: premiumFormulaStack.finalHomeWinPct,
    finalHomeWinPct: premiumFormulaStack.finalHomeWinPct,
    finalAwayWinPct: premiumFormulaStack.finalAwayWinPct,
    v7Tier: v7.tier,
    v7NoBet: v7.noBet,
    v7Confidence: v7.confidence,
    formulaProfileStatus: formulaProfile.status,
    formulaProfileSampleSize: formulaProfile.sampleSize,
    formulaTier,
    formulaConfidence: round(formulaConfidence, 3),
    premiumTier: premiumPolicy.tier,
    premiumNoBet: premiumPolicy.noBet,
    premiumConfidence: premiumPolicy.confidence
  };

  return {
    ...v8Projection,
    distribution: {
      ...v8Projection.distribution,
      homeWinPct: premiumFormulaStack.finalHomeWinPct,
      awayWinPct: premiumFormulaStack.finalAwayWinPct
    },
    mlbIntel: {
      ...mlbIntel,
      governor: {
        ...governor,
        source: "main-sim-brain-v1",
        confidence: guarded.confidence ?? premiumPolicy.confidence,
        tier: finalTier,
        noBet: guarded.noBet,
        reasons
      },
      mainBrain,
      premiumFormulaStack,
      premiumPolicy,
      v7: formulaAdjustedV7
    } as SimProjection["mlbIntel"] & { mainBrain: MainBrainMetadata; premiumFormulaStack: typeof premiumFormulaStack; premiumPolicy: typeof premiumPolicy; v7: typeof formulaAdjustedV7 }
  };
}

export async function buildMainSimProjection(input: SimProjectionInput): Promise<SimProjection> {
  if (input.leagueKey === "MLB") return buildMlbMainSimBrainProjection(input);
  return buildGuardedSimProjection(input);
}

export function mainBrainLabel(leagueKey: LeagueKey) {
  if (leagueKey === "MLB") return "mlb-intel-v8-player-impact+learned-formula-profile+mlb-intel-v7-calibration+premium-policy";
  if (leagueKey === "NBA") return "nba-guarded-winner-anchor";
  return "base-sim-projection";
}
