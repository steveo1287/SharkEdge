import {
  buildNbaSimHealthPolicy,
  enforceNbaSimHealthPolicy,
  type NbaSimHealthStatus
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

    return {
      ...projection,
      nbaIntel: {
        ...projection.nbaIntel,
        tier: policyGuarded.tier,
        confidence: policyGuarded.confidence,
        noBet: policyGuarded.noBet,
        reasons: policyGuarded.reasons
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
