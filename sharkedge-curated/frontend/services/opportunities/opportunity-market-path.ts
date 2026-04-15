import type { LeagueKey, MarketPathView } from "@/lib/types/domain";
import type {
  MarketEfficiencyClass,
  OpportunityActionState,
  OpportunityDecayRiskBucket,
  OpportunityMarketMicrostructureView,
  OpportunityTimingState,
  OpportunityTrapFlag
} from "@/lib/types/opportunity";
import { getMarketPathBookDebug } from "@/services/market/market-path-service";
import { normalizeSportsbookIdentity } from "@/services/opportunities/opportunity-market-model";
import {
  TRUTH_CALIBRATION_MIN_CLOSED,
  buildTruthCalibrationFeedback,
  summarizeTruthCalibration,
  type TruthCalibrationFeedback,
  type TruthCalibrationSummaryRow,
  type TruthSummaryGroup
} from "@/services/opportunities/opportunity-clv-service";

type MarketPathRowsByGroup = Partial<
  Record<Extract<TruthSummaryGroup, "league" | "market" | "sportsbook" | "timing" | "action">, TruthCalibrationSummaryRow[]>
>;

type FeedbackMaps = Partial<
  Record<Extract<TruthSummaryGroup, "league" | "market" | "sportsbook" | "timing" | "action">, Map<string, TruthCalibrationFeedback>>
>;

export type OpportunityMarketPathContext = {
  league: LeagueKey;
  marketType: string;
  sportsbookKey: string | null;
  sportsbookName: string | null;
  actionState: OpportunityActionState;
  timingState: OpportunityTimingState;
  marketEfficiency: MarketEfficiencyClass;
  bookCount: number;
  bestPriceFlag: boolean;
  marketDisagreementScore: number | null;
  providerFreshnessMinutes: number | null;
  lineMovement: number | null;
  trapFlags: OpportunityTrapFlag[];
  marketPath: MarketPathView | null;
};

export type OpportunityMarketPathResolver = {
  resolve: (
    context: OpportunityMarketPathContext
  ) => OpportunityMarketMicrostructureView;
};

const MICROSTRUCTURE_GROUPS = [
  "league",
  "market",
  "sportsbook",
  "timing",
  "action"
] as const;
const MARKET_PATH_MIN_QUALIFIED_SIGNALS = 2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number | null | undefined, digits = 2) {
  return typeof value === "number" ? Number(value.toFixed(digits)) : null;
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, "_");
}

function getBaseHalfLifeMinutes(regime: OpportunityMarketMicrostructureView["regime"]) {
  switch (regime) {
    case "STALE_COPY":
      return 6;
    case "LEADER_CONFIRMED":
      return 12;
    case "BROAD_REPRICE":
      return 7;
    case "FRAGMENTED":
      return 24;
    case "NO_SIGNAL":
    case "NO_PATH":
      return 18;
  }
}

function getBaseUrgencyScore(regime: OpportunityMarketMicrostructureView["regime"]) {
  switch (regime) {
    case "STALE_COPY":
      return 76;
    case "LEADER_CONFIRMED":
      return 60;
    case "BROAD_REPRICE":
      return 46;
    case "FRAGMENTED":
      return 24;
    case "NO_SIGNAL":
    case "NO_PATH":
      return 18;
  }
}

function getBaseWaitImprovementLikelihood(
  regime: OpportunityMarketMicrostructureView["regime"]
) {
  switch (regime) {
    case "STALE_COPY":
      return 14;
    case "LEADER_CONFIRMED":
      return 28;
    case "BROAD_REPRICE":
      return 36;
    case "FRAGMENTED":
      return 58;
    case "NO_SIGNAL":
    case "NO_PATH":
      return 48;
  }
}

function getHistoryWeight(groupBy: keyof FeedbackMaps) {
  switch (groupBy) {
    case "market":
      return 1;
    case "timing":
      return 0.85;
    case "action":
      return 0.7;
    case "sportsbook":
      return 0.55;
    case "league":
      return 0.45;
  }
}

function buildFeedbackMaps(rowsByGroup: MarketPathRowsByGroup): FeedbackMaps {
  const maps: FeedbackMaps = {};

  for (const groupBy of MICROSTRUCTURE_GROUPS) {
    const rows = rowsByGroup[groupBy] ?? [];
    maps[groupBy] = new Map(
      rows.map((row) => [
        normalizeLabel(row.label),
        buildTruthCalibrationFeedback({ groupBy, row })
      ])
    );
  }

  return maps;
}

function getContextLabels(context: OpportunityMarketPathContext) {
  return {
    league: normalizeLabel(context.league),
    market: normalizeLabel(context.marketType),
    sportsbook: normalizeLabel(
      context.sportsbookName ||
        context.sportsbookKey ||
        normalizeSportsbookIdentity(context.sportsbookKey, context.sportsbookName)
    ),
    timing: normalizeLabel(context.timingState),
    action: normalizeLabel(context.actionState)
  };
}

function buildNeutralMicrostructure(args: {
  status: OpportunityMarketMicrostructureView["status"];
  summary: string;
}): OpportunityMarketMicrostructureView {
  return {
    status: args.status,
    regime: "NO_PATH",
    pathTrusted: false,
    historyQualified: false,
    staleCopyConfidence: 0,
    decayRiskBucket: "UNKNOWN",
    estimatedHalfLifeMinutes: null,
    urgencyScore: 0,
    repricingLikelihood: 0,
    waitImprovementLikelihood: 0,
    scoreDelta: 0,
    timingDelta: 0,
    sourceWeightDelta: 0,
    trapEscalation: false,
    adjustments: {
      pathScoreDelta: 0,
      historyScoreDelta: 0,
      pathTimingDelta: 0,
      historyTimingDelta: 0,
      pathSourceWeightDelta: 0,
      historySourceWeightDelta: 0
    },
    sampleGate: {
      requiredClosed: TRUTH_CALIBRATION_MIN_CLOSED,
      qualifiedSignals: 0,
      insufficientSignals: 0
    },
    summary: args.summary,
    reasons: [args.summary]
  };
}

function getPathSignals(context: OpportunityMarketPathContext) {
  const marketPath = context.marketPath;
  if (!marketPath) {
    return buildNeutralMicrostructure({
      status: "SKIPPED_NO_PATH",
      summary: "Market-path calibration skipped because no multi-book path read is attached."
    });
  }

  const offeredBook = getMarketPathBookDebug(marketPath, context.sportsbookKey);
  const offeredRole = offeredBook?.role ?? "UNCLASSIFIED";
  const pathTrusted =
    marketPath.moveCoherenceScore >= 45 &&
    marketPath.confirmationCount >= 2 &&
    marketPath.regime !== "NO_SIGNAL" &&
    !marketPath.staleCopySuppressed;

  const pathScoreDelta = clamp(
    Math.round(
      (marketPath.regime === "STALE_COPY"
        ? 4
        : marketPath.regime === "LEADER_CONFIRMED"
          ? 2
          : marketPath.regime === "BROAD_REPRICE"
            ? -1
            : marketPath.regime === "FRAGMENTED"
              ? -4
              : 0) +
        (marketPath.moveCoherenceScore >= 70 ? 1 : 0) +
        (marketPath.staleCopyConfidence >= 75 ? 1 : 0)
    ),
    -5,
    5
  );

  const pathTimingDelta = clamp(
    Math.round(
      (marketPath.executionHint === "HIT_NOW"
        ? 6
        : marketPath.executionHint === "WAIT_FOR_COPY"
          ? -3
          : marketPath.executionHint === "WATCH"
            ? -1
            : -5) +
        (marketPath.staleCopyConfidence >= 80 ? 1 : 0) -
        (marketPath.regime === "FRAGMENTED" ? 1 : 0)
    ),
    -8,
    7
  );

  const pathSourceWeightDelta = round(
    clamp(
      offeredRole === "LEADER"
        ? 0.05
        : offeredRole === "CONFIRMER"
          ? 0.03
          : offeredRole === "LAGGER" && marketPath.staleCopyConfidence >= 68
            ? 0.08
            : offeredRole === "FOLLOWER"
              ? -0.01
              : offeredRole === "OUTLIER"
                ? -0.08
                : 0,
      -0.1,
      0.1
    )
  ) ?? 0;
  const defensivePathPenalty =
    marketPath.regime === "FRAGMENTED" ||
    marketPath.executionHint === "SUPPRESS" ||
    marketPath.moveCoherenceScore < 35;
  const appliedPathScoreDelta =
    pathTrusted || (defensivePathPenalty && pathScoreDelta < 0)
      ? pathScoreDelta
      : 0;
  const appliedPathTimingDelta =
    pathTrusted || (defensivePathPenalty && pathTimingDelta < 0)
      ? pathTimingDelta
      : 0;
  const appliedPathSourceWeightDelta =
    pathTrusted || (defensivePathPenalty && pathSourceWeightDelta < 0)
      ? pathSourceWeightDelta
      : 0;

  const baseUrgency = getBaseUrgencyScore(marketPath.regime);
  const urgencyScore = Math.round(
    clamp(
      baseUrgency +
        marketPath.staleCopyConfidence * 0.18 +
        marketPath.moveCoherenceScore * 0.12 +
        (context.bestPriceFlag ? 6 : -8) -
        (context.providerFreshnessMinutes !== null && context.providerFreshnessMinutes > 12 ? 10 : 0) -
        ((context.marketDisagreementScore ?? 0) >= 0.16 ? 10 : 0),
      0,
      100
    )
  );
  const repricingLikelihood = Math.round(
    clamp(
      urgencyScore +
        (marketPath.regime === "BROAD_REPRICE" ? 8 : 0) +
        (marketPath.regime === "FRAGMENTED" ? -18 : 0),
      0,
      100
    )
  );
  const waitImprovementLikelihood = Math.round(
    clamp(
      getBaseWaitImprovementLikelihood(marketPath.regime) +
        (marketPath.regime === "FRAGMENTED" ? 8 : 0) +
        (marketPath.executionHint === "WAIT_FOR_COPY" ? 12 : 0) -
        (marketPath.executionHint === "HIT_NOW" ? 16 : 0),
      0,
      100
    )
  );

  const halfLifeMultiplier =
    context.marketEfficiency === "HIGH_EFFICIENCY"
      ? 0.82
      : context.marketEfficiency === "LOW_EFFICIENCY"
        ? 1.12
        : context.marketEfficiency === "FRAGMENTED_PROP" ||
            context.marketEfficiency === "THIN_SPECIALTY"
          ? 1.28
          : 1;
  const estimatedHalfLifeMinutes = Math.round(
    clamp(getBaseHalfLifeMinutes(marketPath.regime) * halfLifeMultiplier, 3, 90)
  );

  const decayRiskBucket: OpportunityDecayRiskBucket =
    waitImprovementLikelihood >= 62 && urgencyScore <= 42
      ? "IMPROVEMENT_PRONE"
      : estimatedHalfLifeMinutes <= 8
        ? "FAST"
        : estimatedHalfLifeMinutes <= 16
          ? "ELEVATED"
          : estimatedHalfLifeMinutes <= 30
            ? "MODERATE"
            : "SLOW";

  return {
    status: pathTrusted ? "APPLIED" : "SKIPPED_WEAK_PATH",
    regime: marketPath.regime,
    pathTrusted,
    historyQualified: false,
    staleCopyConfidence: marketPath.staleCopyConfidence,
    decayRiskBucket,
    estimatedHalfLifeMinutes,
    urgencyScore,
    repricingLikelihood,
    waitImprovementLikelihood,
    scoreDelta: appliedPathScoreDelta,
    timingDelta: appliedPathTimingDelta,
    sourceWeightDelta: appliedPathSourceWeightDelta,
    trapEscalation:
      marketPath.regime === "FRAGMENTED" ||
      (marketPath.executionHint === "SUPPRESS" && marketPath.moveCoherenceScore < 45),
    adjustments: {
      pathScoreDelta: appliedPathScoreDelta,
      historyScoreDelta: 0,
      pathTimingDelta: appliedPathTimingDelta,
      historyTimingDelta: 0,
      pathSourceWeightDelta: appliedPathSourceWeightDelta,
      historySourceWeightDelta: 0
    },
    sampleGate: {
      requiredClosed: TRUTH_CALIBRATION_MIN_CLOSED,
      qualifiedSignals: 0,
      insufficientSignals: 0
    },
    summary: pathTrusted
      ? `Market path ${marketPath.regime.toLowerCase().replace(/_/g, " ")} with ${marketPath.confirmationCount} confirming books and ${marketPath.staleCopyConfidence}% stale-copy confidence.`
      : `Market path stayed below the trust gate: ${marketPath.notes[0] ?? "coherence was too weak."}`,
    reasons: [
      ...marketPath.notes.slice(0, 2),
      ...marketPath.staleCopyReasons.slice(0, 2)
    ].filter(Boolean)
  } satisfies OpportunityMarketMicrostructureView;
}

function resolveHistoryFeedback(
  feedbackMaps: FeedbackMaps,
  context: OpportunityMarketPathContext
) {
  const labels = getContextLabels(context);
  const matched = MICROSTRUCTURE_GROUPS
    .map((groupBy) => feedbackMaps[groupBy]?.get(labels[groupBy]) ?? null)
    .filter((feedback): feedback is TruthCalibrationFeedback => Boolean(feedback));

  const qualified = matched.filter((feedback) => feedback.sampleState === "QUALIFIED");
  const insufficient = matched.length - qualified.length;

  if (qualified.length < MARKET_PATH_MIN_QUALIFIED_SIGNALS) {
    return {
      historyQualified: false,
      scoreDelta: 0,
      timingDelta: 0,
      sourceWeightDelta: 0,
      urgencyDelta: 0,
      waitImprovementDelta: 0,
      qualifiedSignals: qualified.length,
      insufficientSignals: insufficient
    };
  }

  const scoreDelta = clamp(
    Math.round(
      qualified.reduce(
        (total, feedback) => total + feedback.scoringNudge * getHistoryWeight(feedback.groupBy as keyof FeedbackMaps),
        0
      )
    ),
    -4,
    4
  );
  const timingDelta = clamp(
    Math.round(
      qualified.reduce(
        (total, feedback) =>
          total + feedback.timingConfidenceNudge * getHistoryWeight(feedback.groupBy as keyof FeedbackMaps),
        0
      )
    ),
    -5,
    4
  );
  const sourceWeightDelta = round(
    clamp(
      qualified.reduce(
        (total, feedback) =>
          total +
          (feedback.groupBy === "sportsbook"
            ? feedback.sportsbookWeightNudge * getHistoryWeight("sportsbook")
            : 0),
        0
      ),
      -0.06,
      0.05
    )
  ) ?? 0;
  const urgencyDelta = clamp(
    Math.round(
      qualified.reduce(
        (total, feedback) => total + feedback.scoringNudge * 2 + feedback.timingConfidenceNudge,
        0
      ) / Math.max(1, qualified.length)
    ),
    -12,
    10
  );
  const waitImprovementDelta = clamp(
    Math.round(
      qualified.reduce(
        (total, feedback) => total - feedback.scoringNudge * 1.5 - feedback.timingConfidenceNudge,
        0
      ) / Math.max(1, qualified.length)
    ),
    -10,
    14
  );

  return {
    historyQualified: true,
    scoreDelta,
    timingDelta,
    sourceWeightDelta,
    urgencyDelta,
    waitImprovementDelta,
    qualifiedSignals: qualified.length,
    insufficientSignals: insufficient
  };
}

function mergeSignals(args: {
  path: OpportunityMarketMicrostructureView;
  history: ReturnType<typeof resolveHistoryFeedback>;
}) {
  const urgencyScore = Math.round(
    clamp(args.path.urgencyScore + args.history.urgencyDelta, 0, 100)
  );
  const rawWaitImprovementLikelihood = Math.round(
    clamp(
      args.path.waitImprovementLikelihood + args.history.waitImprovementDelta,
      0,
      100
    )
  );
  const improvementProneCandidate =
    args.path.pathTrusted &&
    args.path.regime === "BROAD_REPRICE" &&
    args.history.historyQualified &&
    args.path.waitImprovementLikelihood >= 45 &&
    rawWaitImprovementLikelihood >= 55;
  const waitImprovementLikelihood = improvementProneCandidate
    ? Math.max(rawWaitImprovementLikelihood, 62)
    : rawWaitImprovementLikelihood;

  const estimatedHalfLifeMinutes =
    args.path.estimatedHalfLifeMinutes === null
      ? null
      : Math.round(
          clamp(
            args.path.estimatedHalfLifeMinutes *
              (args.history.historyQualified
                ? args.history.urgencyDelta >= 4
                  ? 0.8
                  : args.history.urgencyDelta <= -4
                    ? 1.22
                    : 1
                : 1),
            3,
            90
          )
        );

  const decayRiskBucket: OpportunityDecayRiskBucket =
    waitImprovementLikelihood >= 62 && urgencyScore <= 42
      ? "IMPROVEMENT_PRONE"
      : estimatedHalfLifeMinutes === null
        ? args.path.decayRiskBucket
        : estimatedHalfLifeMinutes <= 8
          ? "FAST"
          : estimatedHalfLifeMinutes <= 16
            ? "ELEVATED"
            : estimatedHalfLifeMinutes <= 30
              ? "MODERATE"
              : "SLOW";

  const scoreDelta = clamp(
    args.path.adjustments.pathScoreDelta + args.history.scoreDelta,
    -6,
    6
  );
  const rawTimingDelta = clamp(
    args.path.adjustments.pathTimingDelta + args.history.timingDelta,
    -9,
    8
  );
  const timingDelta = improvementProneCandidate
    ? Math.max(rawTimingDelta, -2)
    : rawTimingDelta;
  const sourceWeightDelta = round(
    clamp(
      args.path.adjustments.pathSourceWeightDelta + args.history.sourceWeightDelta,
      -0.12,
      0.12
    )
  ) ?? 0;

  return {
    urgencyScore,
    waitImprovementLikelihood,
    estimatedHalfLifeMinutes,
    decayRiskBucket,
    scoreDelta,
    timingDelta,
    sourceWeightDelta
  };
}

export function createOpportunityMarketPathResolver(args?: {
  rowsByGroup?: MarketPathRowsByGroup;
}): OpportunityMarketPathResolver {
  const feedbackMaps = buildFeedbackMaps(args?.rowsByGroup ?? {});

  return {
    resolve(context) {
      const pathSignals = getPathSignals(context);
      if (pathSignals.status === "SKIPPED_NO_PATH") {
        return pathSignals;
      }

      const history = resolveHistoryFeedback(feedbackMaps, context);
      const merged = mergeSignals({
        path: pathSignals,
        history
      });

      const reasons = [...pathSignals.reasons];
      if (history.historyQualified) {
        reasons.push(
          `Historical close samples qualified ${history.qualifiedSignals} matching calibration lanes for decay guidance.`
        );
      } else {
        reasons.push(
          `History stayed below the close-sample gate for market-path decay nudges.`
        );
      }

      return {
        ...pathSignals,
        historyQualified: history.historyQualified,
        decayRiskBucket: merged.decayRiskBucket,
        estimatedHalfLifeMinutes: merged.estimatedHalfLifeMinutes,
        urgencyScore: merged.urgencyScore,
        repricingLikelihood: Math.round(
          clamp(
            pathSignals.repricingLikelihood + (history.historyQualified ? history.urgencyDelta : 0),
            0,
            100
          )
        ),
        waitImprovementLikelihood: merged.waitImprovementLikelihood,
        scoreDelta: merged.scoreDelta,
        timingDelta: merged.timingDelta,
        sourceWeightDelta: merged.sourceWeightDelta,
        adjustments: {
          pathScoreDelta: pathSignals.adjustments.pathScoreDelta,
          historyScoreDelta: history.scoreDelta,
          pathTimingDelta: pathSignals.adjustments.pathTimingDelta,
          historyTimingDelta:
            merged.timingDelta - pathSignals.adjustments.pathTimingDelta,
          pathSourceWeightDelta: pathSignals.adjustments.pathSourceWeightDelta,
          historySourceWeightDelta: history.sourceWeightDelta
        },
        sampleGate: {
          requiredClosed: TRUTH_CALIBRATION_MIN_CLOSED,
          qualifiedSignals: history.qualifiedSignals,
          insufficientSignals: history.insufficientSignals
        },
        summary:
          pathSignals.status === "APPLIED"
            ? `Market path ${pathSignals.regime.toLowerCase().replace(/_/g, " ")}; urgency ${merged.urgencyScore}; half-life ${merged.estimatedHalfLifeMinutes ?? "n/a"}m${history.historyQualified ? " with qualified close-history decay support." : " without qualified decay history."}`
            : pathSignals.summary,
        reasons
      } satisfies OpportunityMarketMicrostructureView;
    }
  };
}

export async function getOpportunityMarketPathResolver(args?: {
  league?: LeagueKey | "ALL";
  since?: Date;
}): Promise<OpportunityMarketPathResolver> {
  try {
    const since = args?.since ?? new Date(Date.now() - 180 * 24 * 60 * 60 * 1_000);
    const rows = await Promise.all(
      MICROSTRUCTURE_GROUPS.map(async (groupBy) => [
        groupBy,
        await summarizeTruthCalibration({
          groupBy,
          league: args?.league ?? "ALL",
          since
        })
      ] as const)
    );

    return createOpportunityMarketPathResolver({
      rowsByGroup: Object.fromEntries(rows) as MarketPathRowsByGroup
    });
  } catch {
    return createOpportunityMarketPathResolver();
  }
}
