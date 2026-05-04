import { getNbaLineupTruth, type NbaLineupTruth } from "@/services/simulation/nba-lineup-truth";
import {
  buildNbaSimHealthPolicy,
  enforceNbaSimHealthPolicy,
  type NbaSimHealthStatus,
  type NbaSimRecommendationTier
} from "@/services/simulation/nba-sim-health-policy";
import { buildNbaWinnerProbability } from "@/services/simulation/nba-winner-probability-engine";
import { getNbaWinnerRuntimeCalibrationGate } from "@/services/simulation/nba-winner-calibration-gate";
import { buildNbaTeamStrengthRosterImpact } from "@/services/simulation/nba-team-strength-roster-impact";
import { applySimAccuracyGuardrail, getSimAccuracyGuardrails } from "@/services/simulation/sim-accuracy-guardrail";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

type SimProjectionInput = Parameters<typeof buildSimProjection>[0];
type SimProjection = Awaited<ReturnType<typeof buildSimProjection>>;

function leadingProbability(projection: SimProjection) {
  return Math.max(projection.distribution.homeWinPct, projection.distribution.awayWinPct);
}

function nbaRuntimeSourceHealth(projection: SimProjection, lineupTruth: NbaLineupTruth | null): NbaSimHealthStatus {
  const source = projection.realityIntel?.sourceHealth;
  const marketAvailable = projection.realityIntel?.market?.available === true;
  const allCoreFeedsReady = Boolean(source?.team && source.player && source.rating && source.history);

  if (lineupTruth?.status === "RED") return "RED";
  if (!source?.requiredModulesReady || !source.team || !source.player) return "RED";
  if (allCoreFeedsReady && source.realModules >= 4 && marketAvailable && lineupTruth?.status === "GREEN") return "GREEN";
  if (source.realModules >= 3 && marketAvailable) return "YELLOW";
  return "RED";
}

function nbaRuntimeInjuryFresh(projection: SimProjection, lineupTruth: NbaLineupTruth | null) {
  if (lineupTruth) return lineupTruth.injuryReportFresh;
  const source = projection.realityIntel?.sourceHealth;
  const modules = projection.realityIntel?.modules ?? [];
  const playerModuleReal = modules.some((module) =>
    /player|injury|availability|rotation/i.test(module.label) && module.status === "real"
  );
  return Boolean(source?.player && source.requiredModulesReady && playerModuleReal);
}

function nbaRuntimeStarQuestionable(projection: SimProjection, lineupTruth: NbaLineupTruth | null) {
  if (lineupTruth) return lineupTruth.starQuestionable || lineupTruth.lateScratchRisk || lineupTruth.highUsageOut;
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

function nbaHasDocumentedLineupReason(projection: SimProjection, lineupTruth: NbaLineupTruth | null) {
  if (lineupTruth && (lineupTruth.playerFlags.length || lineupTruth.warnings.length || lineupTruth.blockers.length)) return true;
  const factors = projection.realityIntel?.factors ?? [];
  const reasons = projection.nbaIntel?.reasons ?? [];
  const modules = projection.realityIntel?.modules ?? [];
  const factorSignal = factors.some((factor) =>
    /availability|injury|rotation|usage/i.test(factor.label) && Math.abs(factor.value * factor.weight) >= 0.12
  );
  const reasonSignal = reasons.some((reason) => /injury|availability|rotation|usage/i.test(reason));
  const moduleSignal = modules.some((module) => /injury|availability|rotation/i.test(module.label) && module.status === "real");
  return factorSignal || reasonSignal || moduleSignal;
}

function nbaSpreadConflict(projection: SimProjection, lineupTruth: NbaLineupTruth | null) {
  const marketSpreadHome = projection.realityIntel?.market?.spreadLine;
  if (typeof marketSpreadHome !== "number" || !Number.isFinite(marketSpreadHome)) return null;
  const projectedHomeMargin = projection.distribution.avgHome - projection.distribution.avgAway;
  const homeCoverThreshold = -marketSpreadHome;
  const spreadEdge = projectedHomeMargin - homeCoverThreshold;
  if (Math.abs(spreadEdge) <= 6) return null;
  if (nbaHasDocumentedLineupReason(projection, lineupTruth)) return null;
  return {
    projectedHomeMargin,
    marketSpreadHome,
    homeCoverThreshold,
    spreadEdge
  };
}

function applyNbaSpreadConflictGate(args: {
  projection: SimProjection;
  lineupTruth: NbaLineupTruth | null;
  tier: NbaSimRecommendationTier;
  noBet: boolean;
  confidence: number;
  reasons: string[];
}) {
  const conflict = nbaSpreadConflict(args.projection, args.lineupTruth);
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

function lineupReasonSummary(lineupTruth: NbaLineupTruth) {
  const flags = lineupTruth.playerFlags.slice(0, 4).map((flag) => `${flag.playerName} ${flag.status} ${flag.usageTier} risk ${flag.risk}`);
  return [
    `NBA lineup truth ${lineupTruth.status}: starter confidence ${(lineupTruth.projectedStarterConfidence * 100).toFixed(1)}%.`,
    ...lineupTruth.blockers.map((blocker) => `Lineup blocker: ${blocker}.`),
    ...lineupTruth.warnings.map((warning) => `Lineup warning: ${warning}.`),
    ...flags.map((flag) => `Lineup flag: ${flag}.`)
  ];
}

function applyNbaLineupTruthGate(args: {
  lineupTruth: NbaLineupTruth | null;
  tier: NbaSimRecommendationTier;
  noBet: boolean;
  confidence: number;
  reasons: string[];
}) {
  if (!args.lineupTruth) return { tier: args.tier, noBet: args.noBet, confidence: args.confidence, reasons: args.reasons };
  const lineupReasons = lineupReasonSummary(args.lineupTruth);
  if (args.lineupTruth.status === "RED") {
    return {
      tier: "pass" as NbaSimRecommendationTier,
      noBet: true,
      confidence: Math.min(args.confidence, 0.49),
      reasons: ["NBA lineup truth forced PASS with zero Kelly.", ...lineupReasons, ...args.reasons]
    };
  }
  if (args.lineupTruth.status === "YELLOW") {
    return {
      tier: args.tier === "attack" ? "watch" as NbaSimRecommendationTier : args.tier,
      noBet: true,
      confidence: Math.min(args.confidence, 0.57),
      reasons: ["NBA lineup truth capped output to WATCH/noBet.", ...lineupReasons, ...args.reasons]
    };
  }
  return {
    tier: args.tier,
    noBet: args.noBet,
    confidence: args.confidence,
    reasons: [...lineupReasons, ...args.reasons]
  };
}

function confidenceCap(confidence: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT") {
  switch (confidence) {
    case "HIGH": return 0.72;
    case "MEDIUM": return 0.64;
    case "LOW": return 0.56;
    case "INSUFFICIENT": return 0.49;
  }
}

function buildRuntimeRosterImpact(projection: SimProjection) {
  return buildNbaTeamStrengthRosterImpact({
    awayTeam: projection.matchup.away,
    homeTeam: projection.matchup.home,
    projectedHomeMargin: projection.distribution.avgHome - projection.distribution.avgAway,
    projectedTotal: projection.nbaIntel?.projectedTotal ?? null,
    homeWinPct: projection.distribution.homeWinPct,
    awayWinPct: projection.distribution.awayWinPct,
    realityIntel: projection.realityIntel ?? null,
    playerStatProjections: projection.nbaIntel?.playerStatProjections ?? []
  });
}

function applyNbaWinnerAnchorGate(args: {
  projection: SimProjection;
  lineupTruth: NbaLineupTruth | null;
  tier: NbaSimRecommendationTier;
  noBet: boolean;
  confidence: number;
  reasons: string[];
}) {
  const rosterImpact = buildRuntimeRosterImpact(args.projection);
  const winner = buildNbaWinnerProbability({
    rawHomeWinPct: args.projection.distribution.homeWinPct,
    rawAwayWinPct: args.projection.distribution.awayWinPct,
    projectedHomeMargin: args.projection.distribution.avgHome - args.projection.distribution.avgAway,
    projectedTotal: args.projection.nbaIntel?.projectedTotal ?? null,
    market: args.projection.realityIntel?.market ?? null,
    lineupTruth: args.lineupTruth,
    teamStrengthRosterImpact: rosterImpact,
    sourceHealth: args.projection.realityIntel?.sourceHealth ?? null,
    calibrationHealthy: nbaRuntimeCalibrationHealthy(args.projection)
  });
  const winnerReasons = [
    `NBA winner anchor: market home ${winner.marketHomeNoVig == null ? "missing" : `${(winner.marketHomeNoVig * 100).toFixed(1)}%`}, raw sim home ${(winner.rawHomeWinPct * 100).toFixed(1)}%, final home ${(winner.finalHomeWinPct * 100).toFixed(1)}%.`,
    `NBA roster/team impact: margin ${rosterImpact.finalProjectedHomeMargin.toFixed(1)}, delta ${(rosterImpact.boundedProbabilityDelta * 100).toFixed(1)}%, confidence ${(rosterImpact.confidence * 100).toFixed(1)}%.`,
    ...winner.blockers.map((blocker) => `Winner blocker: ${blocker}.`),
    ...winner.warnings.map((warning) => `Winner warning: ${warning}.`),
    ...winner.drivers.map((driver) => `Winner driver: ${driver}.`)
  ];

  if (winner.noBet) {
    return {
      tier: "pass" as NbaSimRecommendationTier,
      noBet: true,
      confidence: Math.min(args.confidence, 0.49),
      reasons: ["NBA winner anchor forced PASS/noBet.", ...winnerReasons, ...args.reasons],
      winner
    };
  }

  const tier = args.tier === "attack" && winner.confidence !== "HIGH" ? "watch" as NbaSimRecommendationTier : args.tier;
  return {
    tier,
    noBet: args.noBet,
    confidence: Math.min(args.confidence, confidenceCap(winner.confidence)),
    reasons: [...winnerReasons, ...args.reasons],
    winner
  };
}

async function applyNbaWinnerCalibrationGate(args: {
  tier: NbaSimRecommendationTier;
  noBet: boolean;
  confidence: number;
  reasons: string[];
  finalHomeWinPct: number;
  finalAwayWinPct: number;
}) {
  const gate = await getNbaWinnerRuntimeCalibrationGate({
    finalHomeWinPct: args.finalHomeWinPct,
    finalAwayWinPct: args.finalAwayWinPct,
    limit: 5000
  });
  const gateReasons = [
    `NBA winner calibration gate: bucket ${gate.bucketKey ?? "missing"}, status ${gate.bucket?.status ?? gate.reportStatus}, sample ${gate.bucket?.sampleSize ?? 0}.`,
    ...gate.blockers.map((blocker) => `Winner calibration blocker: ${blocker}.`),
    ...gate.warnings.map((warning) => `Winner calibration warning: ${warning}.`)
  ];
  if (gate.shouldPass) {
    return {
      tier: "pass" as NbaSimRecommendationTier,
      noBet: true,
      confidence: Math.min(args.confidence, 0.49),
      reasons: ["NBA winner calibration forced PASS/noBet.", ...gateReasons, ...args.reasons]
    };
  }
  if (gate.shouldBlockStrongBet && args.tier === "attack") {
    return {
      tier: "watch" as NbaSimRecommendationTier,
      noBet: true,
      confidence: Math.min(args.confidence, 0.57),
      reasons: ["NBA winner calibration capped ATTACK to WATCH/noBet until bucket proves green.", ...gateReasons, ...args.reasons]
    };
  }
  return {
    tier: args.tier,
    noBet: args.noBet,
    confidence: args.confidence,
    reasons: [...gateReasons, ...args.reasons]
  };
}

async function getRuntimeLineupTruth(input: SimProjectionInput, projection: SimProjection) {
  const modules = projection.realityIntel?.modules ?? [];
  return getNbaLineupTruth({
    awayTeam: projection.matchup.away,
    homeTeam: projection.matchup.home,
    gameTime: input.startTime,
    projectionReasons: projection.nbaIntel?.reasons ?? projection.realityIntel?.factors?.map((factor) => factor.label) ?? [],
    projectionModules: modules,
    volatilityIndex: projection.realityIntel?.volatilityIndex ?? projection.nbaIntel?.volatilityIndex ?? null
  }).catch(() => null);
}

export async function buildGuardedSimProjection(input: SimProjectionInput): Promise<SimProjection> {
  const projection = await buildSimProjection(input);

  if (input.leagueKey !== "NBA" && input.leagueKey !== "MLB") return projection;

  const guardrails = await getSimAccuracyGuardrails();
  const probability = leadingProbability(projection);

  if (input.leagueKey === "NBA" && projection.nbaIntel) {
    const lineupTruth = await getRuntimeLineupTruth(input, projection);
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
      sourceHealth: nbaRuntimeSourceHealth(projection, lineupTruth),
      injuryReportFresh: nbaRuntimeInjuryFresh(projection, lineupTruth),
      starQuestionable: nbaRuntimeStarQuestionable(projection, lineupTruth),
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
      lineupTruth,
      tier: policyGuarded.tier,
      noBet: policyGuarded.noBet,
      confidence: policyGuarded.confidence,
      reasons: policyGuarded.reasons
    });
    const lineupGuarded = applyNbaLineupTruthGate({
      lineupTruth,
      tier: spreadGuarded.tier,
      noBet: spreadGuarded.noBet,
      confidence: spreadGuarded.confidence,
      reasons: spreadGuarded.reasons
    });
    const winnerGuarded = applyNbaWinnerAnchorGate({
      projection,
      lineupTruth,
      tier: lineupGuarded.tier,
      noBet: lineupGuarded.noBet,
      confidence: lineupGuarded.confidence,
      reasons: lineupGuarded.reasons
    });
    const winnerCalibrated = await applyNbaWinnerCalibrationGate({
      tier: winnerGuarded.tier,
      noBet: winnerGuarded.noBet,
      confidence: winnerGuarded.confidence,
      reasons: winnerGuarded.reasons,
      finalHomeWinPct: winnerGuarded.winner.finalHomeWinPct,
      finalAwayWinPct: winnerGuarded.winner.finalAwayWinPct
    });

    return {
      ...projection,
      distribution: {
        ...projection.distribution,
        homeWinPct: winnerGuarded.winner.finalHomeWinPct,
        awayWinPct: winnerGuarded.winner.finalAwayWinPct
      },
      nbaIntel: {
        ...projection.nbaIntel,
        tier: winnerCalibrated.tier,
        confidence: winnerCalibrated.confidence,
        noBet: winnerCalibrated.noBet,
        reasons: winnerCalibrated.reasons
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
