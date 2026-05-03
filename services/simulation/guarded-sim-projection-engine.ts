import {
  buildNbaSimHealthPolicy,
  enforceNbaSimHealthPolicy,
  type NbaSimHealthStatus,
  type NbaSimRecommendationTier
} from "@/services/simulation/nba-sim-health-policy";
import { applySimAccuracyGuardrail, getSimAccuracyGuardrails } from "@/services/simulation/sim-accuracy-guardrail";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

type SimProjectionInput = Parameters<typeof buildSimProjection>[0];
type SimProjection = Awaited<ReturnType<typeof buildSimProjection>>;

function leadingProbability(projection: SimProjection) {
  return Math.max(projection.distribution.homeWinPct, projection.distribution.awayWinPct);
}

function nbaRuntimeSourceHealth(projection: SimProjection): NbaSimHealthStatus {
  const source = projection.realityIntel?.sourceHealth;
  const marketAvailable = projection.realityIntel?.market?.available === true;
  const allCoreFeedsReady = Boolean(source?.team && source.player && source.rating && source.history);

  if (!source?.requiredModulesReady || !source.team || !source.player) return "RED";
  if (allCoreFeedsReady && source.realModules >= 4 && marketAvailable) return "GREEN";
  if (source.realModules >= 3 && marketAvailable) return "YELLOW";
  return "RED";
}

function nbaRuntimeInjuryFresh(projection: SimProjection) {
  const source = projection.realityIntel?.sourceHealth;
  const modules = projection.realityIntel?.modules ?? [];
  const playerModuleReal = modules.some((module) =>
    /player|injury|availability|rotation/i.test(module.label) && module.status === "real"
  );
  return Boolean(source?.player && source.requiredModulesReady && playerModuleReal);
}

function nbaRuntimeStarQuestionable(projection: SimProjection) {
  const intel = projection.realityIntel;
  if (!intel?.sourceHealth?.player) return null;
  return intel.volatilityIndex >= 1.75;
}

function nbaRuntimeCalibrationHealthy(projection: SimProjection) {
  const intel = projection.realityIntel;
  if (!intel) return false;
  if (intel.historyAdjustment?.shouldPass) return false;
  if (intel.learnedAdjustment?.shouldPass) return false;
  if (!intel.market?.available) return false;
  return true;
}

function nbaHasDocumentedLineupReason(projection: SimProjection) {
  const factors = projection.realityIntel?.factors ?? [];
  const reasons = projection.nbaIntel?.reasons ?? [];
  const modules = projection.realityIntel?.modules ?? [];
  const factorSignal = factors.some((factor) =>
    /availability|injury|star|player|rotation|usage/i.test(factor.label) && Math.abs(factor.value * factor.weight) >= 0.12
  );
  const reasonSignal = reasons.some((reason) => /injury|availability|rotation|usage|star|player/i.test(reason));
  const moduleSignal = modules.some((module) => /injury|availability|rotation|player/i.test(module.label) && module.status === "real");
  return factorSignal || reasonSignal || moduleSignal;
}

function nbaSpreadConflict(projection: SimProjection) {
  const marketSpreadHome = projection.realityIntel?.market?.spreadLine;
  if (typeof marketSpreadHome !== "number" || !Number.isFinite(marketSpreadHome)) return null;
  const projectedHomeMargin = projection.distribution.avgHome - projection.distribution.avgAway;
  const homeCoverThreshold = -marketSpreadHome;
  const spreadEdge = projectedHomeMargin - homeCoverThreshold;
  if (Math.abs(spreadEdge) <= 6) return null;
  if (nbaHasDocumentedLineupReason(projection)) return null;
  return {
    projectedHomeMargin,
    marketSpreadHome,
    homeCoverThreshold,
    spreadEdge
  };
}

function applyNbaSpreadConflictGate(args: {
  projection: SimProjection;
  tier: NbaSimRecommendationTier;
  noBet: boolean;
  confidence: number;
  reasons: string[];
}) {
  const conflict = nbaSpreadConflict(args.projection);
  if (!conflict) return { tier: args.tier, noBet: args.noBet, confidence: args.confidence, reasons: args.reasons };
  return {
    tier: "pass" as NbaSimRecommendationTier,
    noBet: true,
    confidence: Math.min(args.confidence, 0.49),
    reasons: [
      `NBA spread conflict gate forced PASS: projected home margin ${conflict.projectedHomeMargin.toFixed(1)} vs market home spread ${conflict.marketSpreadHome.toFixed(1)} creates ${conflict.spreadEdge.toFixed(1)} points of model-market conflict without a documented lineup/injury reason.`,
      ...args.reasons
    ]
  };
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
    const guardedTier = guarded.tier === "attack" || guarded.tier === "watch" ? guarded.tier : "pass";
    const guardedReasons = guarded.downgraded
      ? [`${guarded.originalTier.toUpperCase()} downgraded to ${guarded.tier.toUpperCase()} by accuracy guard.`, ...guarded.reasons]
      : guarded.reasons;
    const policy = buildNbaSimHealthPolicy({
      diagnostics: null,
      diagnosticsRequired: false,
      sourceHealth: nbaRuntimeSourceHealth(projection),
      injuryReportFresh: nbaRuntimeInjuryFresh(projection),
      starQuestionable: nbaRuntimeStarQuestionable(projection),
      calibrationBucketHealthy: nbaRuntimeCalibrationHealthy(projection)
    });
    const policyGuarded = enforceNbaSimHealthPolicy({
      tier: guardedTier,
      confidence: guarded.confidence ?? projection.nbaIntel.confidence,
      noBet: guarded.noBet,
      reasons: guardedReasons,
      policy
    });
    const spreadGuarded = applyNbaSpreadConflictGate({
      projection,
      tier: policyGuarded.tier,
      noBet: policyGuarded.noBet,
      confidence: policyGuarded.confidence,
      reasons: policyGuarded.reasons
    });

    return {
      ...projection,
      nbaIntel: {
        ...projection.nbaIntel,
        tier: spreadGuarded.tier,
        confidence: spreadGuarded.confidence,
        noBet: spreadGuarded.noBet,
        reasons: spreadGuarded.reasons
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
