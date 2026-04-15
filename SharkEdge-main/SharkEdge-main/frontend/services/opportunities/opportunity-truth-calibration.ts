import type { LeagueKey, ProviderHealthState } from "@/lib/types/domain";
import type {
  OpportunityActionState,
  OpportunityConfidenceTier,
  OpportunityTruthCalibrationView,
  OpportunityTimingState,
  OpportunityTrapFlag,
  TruthCalibrationDimension,
  TruthCalibrationStatus
} from "@/lib/types/opportunity";
import { normalizeSportsbookIdentity } from "@/services/opportunities/opportunity-market-model";
import {
  TRUTH_CALIBRATION_MIN_CLOSED,
  TRUTH_CALIBRATION_MIN_SURFACED,
  buildTruthCalibrationFeedback,
  summarizeTruthCalibration,
  type TruthCalibrationFeedback,
  type TruthCalibrationSummaryRow,
  type TruthSummaryGroup
} from "@/services/opportunities/opportunity-clv-service";

const DEFAULT_LOOKBACK_DAYS = 180;
const MAX_SCORE_DELTA = 6;
const MIN_SCORE_DELTA = -8;
const MAX_TIMING_DELTA = 5;
const MIN_TIMING_DELTA = -8;
const MAX_SOURCE_WEIGHT_DELTA = 0.08;
const MIN_SOURCE_WEIGHT_DELTA = -0.12;

type CalibrationRowsByGroup = Partial<
  Record<TruthSummaryGroup, TruthCalibrationSummaryRow[]>
>;

type CalibrationFeedbackMaps = Partial<
  Record<TruthSummaryGroup, Map<string, TruthCalibrationFeedback>>
>;

export type OpportunityTruthCalibrationContext = {
  league: LeagueKey;
  marketType: string;
  sportsbookKey: string | null;
  sportsbookName: string | null;
  timingState: OpportunityTimingState;
  actionState: OpportunityActionState;
  confidenceTier: OpportunityConfidenceTier;
  trapFlags: OpportunityTrapFlag[];
  sourceHealthState: ProviderHealthState;
  baseScore: number;
  baseTimingQuality: number;
};

export type OpportunityTruthCalibrationResolver = {
  resolve: (
    context: OpportunityTruthCalibrationContext
  ) => OpportunityTruthCalibrationView;
};

const CALIBRATION_GROUPS: TruthSummaryGroup[] = [
  "league",
  "market",
  "sportsbook",
  "timing",
  "action",
  "confidence",
  "trap_flag",
  "source_health"
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, "_");
}

function toStatusSummary(status: TruthCalibrationStatus) {
  switch (status) {
    case "APPLIED":
      return "Calibration applied";
    case "SKIPPED_INSUFFICIENT_SAMPLE":
      return "Calibration skipped";
    case "SKIPPED_NEUTRAL":
      return "Calibration neutral";
    default:
      return "Calibration skipped";
  }
}

function buildNeutralCalibration(args: {
  baseScore: number;
  baseTimingQuality: number;
  status?: TruthCalibrationStatus;
  summary?: string;
}): OpportunityTruthCalibrationView {
  return {
    status: args.status ?? "SKIPPED_NO_DATA",
    scoreDelta: 0,
    timingDelta: 0,
    sourceWeightDelta: 0,
    trapEscalation: false,
    trapDeEscalation: false,
    baseScore: args.baseScore,
    calibratedScore: args.baseScore,
    baseTimingQuality: args.baseTimingQuality,
    calibratedTimingQuality: args.baseTimingQuality,
    sampleGate: {
      requiredSurfaced: TRUTH_CALIBRATION_MIN_SURFACED,
      requiredClosed: TRUTH_CALIBRATION_MIN_CLOSED,
      qualifiedSignals: 0,
      insufficientSignals: 0
    },
    summary:
      args.summary ??
      "Calibration skipped: no close-history sample is available for this lane yet.",
    applied: [],
    skipped: []
  };
}

function buildFeedbackMaps(
  rowsByGroup: CalibrationRowsByGroup
): CalibrationFeedbackMaps {
  const maps: CalibrationFeedbackMaps = {};

  for (const groupBy of CALIBRATION_GROUPS) {
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

function getScoreMultiplier(groupBy: TruthCalibrationDimension) {
  switch (groupBy) {
    case "league":
      return 0.75;
    case "market":
      return 1;
    case "sportsbook":
      return 0.5;
    case "timing":
      return 0.5;
    case "action":
      return 0.4;
    case "confidence":
      return 0.3;
    case "source_health":
      return 0.45;
    case "trap_flag":
      return 0.5;
  }
}

function buildTrace(args: {
  groupBy: TruthCalibrationDimension;
  feedback: TruthCalibrationFeedback;
}) {
  const scoreDelta = Math.round(
    args.feedback.scoringNudge * getScoreMultiplier(args.groupBy)
  );
  const timingDelta =
    args.groupBy === "timing"
      ? Math.round(args.feedback.timingConfidenceNudge)
      : args.groupBy === "action"
        ? args.feedback.scoringNudge > 0
          ? 1
          : args.feedback.scoringNudge < 0
            ? -2
            : 0
        : args.groupBy === "source_health"
          ? args.feedback.scoringNudge > 0
            ? 1
            : args.feedback.scoringNudge < 0
              ? -1
              : 0
          : args.groupBy === "trap_flag" && args.feedback.trapEscalation
            ? -2
            : 0;
  const sourceWeightDelta =
    args.groupBy === "sportsbook"
      ? round(args.feedback.sportsbookWeightNudge)
      : 0;
  const trapHint =
    args.groupBy !== "trap_flag"
      ? "NEUTRAL"
      : args.feedback.trapEscalation
        ? "ESCALATE"
        : args.feedback.scoringNudge > 0
          ? "DE_ESCALATE"
          : "NEUTRAL";
  const applied =
    scoreDelta !== 0 ||
    timingDelta !== 0 ||
    sourceWeightDelta !== 0 ||
    trapHint !== "NEUTRAL";

  return {
    groupBy: args.groupBy,
    label: args.feedback.label,
    sampleState: args.feedback.sampleState,
    surfaced: args.feedback.surfaced,
    closed: args.feedback.closed,
    beatClosePct: args.feedback.beatClosePct,
    averageTruthScore: args.feedback.averageTruthScore,
    applied,
    scoreDelta,
    timingDelta,
    sourceWeightDelta,
    trapHint,
    note: args.feedback.note
  } satisfies OpportunityTruthCalibrationView["applied"][number];
}

function buildSummary(view: OpportunityTruthCalibrationView) {
  if (view.status === "APPLIED") {
    const parts = [
      `${toStatusSummary(view.status)}: ${view.scoreDelta >= 0 ? "+" : ""}${view.scoreDelta} score`,
      view.timingDelta !== 0
        ? `${view.timingDelta >= 0 ? "+" : ""}${view.timingDelta} timing`
        : null,
      view.sourceWeightDelta !== 0
        ? `${view.sourceWeightDelta >= 0 ? "+" : ""}${view.sourceWeightDelta.toFixed(
            2
          )} source weight`
        : null
    ].filter(Boolean);

    const appliedLabels = view.applied
      .slice(0, 3)
      .map((item) => `${item.groupBy.replace(/_/g, " ")}:${item.label}`)
      .join(", ");

    return `${parts.join(", ")} from qualified close history (${appliedLabels}).`;
  }

  if (view.status === "SKIPPED_NEUTRAL") {
    return "Calibration qualified but stayed neutral because similar closed samples are close to flat.";
  }

  if (view.status === "SKIPPED_INSUFFICIENT_SAMPLE") {
    return `Calibration skipped: similar spots have not cleared the ${TRUTH_CALIBRATION_MIN_SURFACED}/${TRUTH_CALIBRATION_MIN_CLOSED} surfaced/closed sample gate yet.`;
  }

  return "Calibration skipped: no matching close-history lane is available yet.";
}

function getContextLabels(context: OpportunityTruthCalibrationContext) {
  return {
    league: normalizeLabel(context.league),
    market: normalizeLabel(context.marketType),
    sportsbook: normalizeLabel(
      context.sportsbookName ||
        context.sportsbookKey ||
        normalizeSportsbookIdentity(context.sportsbookKey, context.sportsbookName)
    ),
    timing: normalizeLabel(context.timingState),
    action: normalizeLabel(context.actionState),
    confidence: normalizeLabel(context.confidenceTier),
    source_health: normalizeLabel(context.sourceHealthState),
    trap_flag: context.trapFlags.map((flag) => normalizeLabel(flag))
  };
}

function pushGroupTrace(args: {
  groupBy: Exclude<TruthSummaryGroup, "trap_flag">;
  label: string;
  feedbackMaps: CalibrationFeedbackMaps;
  traces: OpportunityTruthCalibrationView["applied"];
  skipped: OpportunityTruthCalibrationView["skipped"];
}) {
  if (!args.label) {
    return;
  }

  const feedback = args.feedbackMaps[args.groupBy]?.get(args.label);
  if (!feedback) {
    return;
  }

  const trace = buildTrace({
    groupBy: args.groupBy,
    feedback
  });

  if (trace.applied) {
    args.traces.push(trace);
    return;
  }

  args.skipped.push(trace);
}

function resolveFromMaps(
  feedbackMaps: CalibrationFeedbackMaps,
  context: OpportunityTruthCalibrationContext
): OpportunityTruthCalibrationView {
  const labels = getContextLabels(context);
  const applied: OpportunityTruthCalibrationView["applied"] = [];
  const skipped: OpportunityTruthCalibrationView["skipped"] = [];

  pushGroupTrace({
    groupBy: "league",
    label: labels.league,
    feedbackMaps,
    traces: applied,
    skipped
  });
  pushGroupTrace({
    groupBy: "market",
    label: labels.market,
    feedbackMaps,
    traces: applied,
    skipped
  });
  pushGroupTrace({
    groupBy: "sportsbook",
    label: labels.sportsbook,
    feedbackMaps,
    traces: applied,
    skipped
  });
  pushGroupTrace({
    groupBy: "timing",
    label: labels.timing,
    feedbackMaps,
    traces: applied,
    skipped
  });
  pushGroupTrace({
    groupBy: "action",
    label: labels.action,
    feedbackMaps,
    traces: applied,
    skipped
  });
  pushGroupTrace({
    groupBy: "confidence",
    label: labels.confidence,
    feedbackMaps,
    traces: applied,
    skipped
  });
  pushGroupTrace({
    groupBy: "source_health",
    label: labels.source_health,
    feedbackMaps,
    traces: applied,
    skipped
  });

  for (const trapLabel of labels.trap_flag) {
    const feedback = feedbackMaps.trap_flag?.get(trapLabel);
    if (!feedback) {
      continue;
    }

    const trace = buildTrace({
      groupBy: "trap_flag",
      feedback
    });

    if (trace.applied) {
      applied.push(trace);
      continue;
    }

    skipped.push(trace);
  }

  if (!applied.length && !skipped.length) {
    return buildNeutralCalibration({
      baseScore: context.baseScore,
      baseTimingQuality: context.baseTimingQuality,
      status: "SKIPPED_NO_DATA"
    });
  }

  const qualifiedSignals =
    applied.length + skipped.filter((item) => item.sampleState === "QUALIFIED").length;
  const insufficientSignals = skipped.filter(
    (item) => item.sampleState === "INSUFFICIENT_SAMPLE"
  ).length;
  const status: TruthCalibrationStatus = applied.length
    ? "APPLIED"
    : insufficientSignals
      ? "SKIPPED_INSUFFICIENT_SAMPLE"
      : "SKIPPED_NEUTRAL";
  const scoreDelta = clamp(
    applied.reduce((total, item) => total + item.scoreDelta, 0),
    MIN_SCORE_DELTA,
    MAX_SCORE_DELTA
  );
  const timingDelta = clamp(
    applied.reduce((total, item) => total + item.timingDelta, 0),
    MIN_TIMING_DELTA,
    MAX_TIMING_DELTA
  );
  const sourceWeightDelta = round(
    clamp(
      applied.reduce((total, item) => total + item.sourceWeightDelta, 0),
      MIN_SOURCE_WEIGHT_DELTA,
      MAX_SOURCE_WEIGHT_DELTA
    )
  );
  const view: OpportunityTruthCalibrationView = {
    status,
    scoreDelta,
    timingDelta,
    sourceWeightDelta,
    trapEscalation: applied.some((item) => item.trapHint === "ESCALATE"),
    trapDeEscalation: applied.some((item) => item.trapHint === "DE_ESCALATE"),
    baseScore: context.baseScore,
    calibratedScore: clamp(context.baseScore + scoreDelta, 0, 100),
    baseTimingQuality: context.baseTimingQuality,
    calibratedTimingQuality: clamp(
      context.baseTimingQuality + timingDelta,
      0,
      100
    ),
    sampleGate: {
      requiredSurfaced: TRUTH_CALIBRATION_MIN_SURFACED,
      requiredClosed: TRUTH_CALIBRATION_MIN_CLOSED,
      qualifiedSignals,
      insufficientSignals
    },
    summary: "",
    applied,
    skipped
  };

  view.summary = buildSummary(view);
  return view;
}

export function createOpportunityTruthCalibrationResolver(args?: {
  rowsByGroup?: CalibrationRowsByGroup;
}): OpportunityTruthCalibrationResolver {
  const feedbackMaps = buildFeedbackMaps(args?.rowsByGroup ?? {});

  return {
    resolve(context) {
      return resolveFromMaps(feedbackMaps, context);
    }
  };
}

export async function getOpportunityTruthCalibrationResolver(args?: {
  league?: LeagueKey | "ALL";
  since?: Date;
}): Promise<OpportunityTruthCalibrationResolver> {
  try {
    const since =
      args?.since ??
      new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1_000);
    const rows = await Promise.all(
      CALIBRATION_GROUPS.map(async (groupBy) => [
        groupBy,
        await summarizeTruthCalibration({
          groupBy,
          league: args?.league ?? "ALL",
          since
        })
      ] as const)
    );

    return createOpportunityTruthCalibrationResolver({
      rowsByGroup: Object.fromEntries(rows) as CalibrationRowsByGroup
    });
  } catch {
    return createOpportunityTruthCalibrationResolver();
  }
}
