import { Prisma } from "@prisma/client";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { LeagueKey } from "@/lib/types/domain";
import type {
  MarketEfficiencyClass,
  OpportunityActionState,
  OpportunityCloseDestinationLabel,
  OpportunityExecutionCapacityLabel,
  OpportunityReasonCalibrationTrace,
  OpportunityReasonCalibrationView,
  OpportunityReasonLaneCategory,
  OpportunityReasonLaneView,
  OpportunityTimingState,
  OpportunityTrapFlag,
  TruthCalibrationStatus
} from "@/lib/types/opportunity";

type ReasonHistoryRow = {
  league: string | null;
  marketType: string;
  marketEfficiency: string | null;
  actionState: string | null;
  timingState: string | null;
  trapFlagsJson: unknown;
  clvResult: string | null;
  clvPct: number | null;
  normalizedTruthScore: number | null;
  opportunityScore: number | null;
  expectedValuePct: number | null;
  metadataJson: unknown;
};

export type OpportunityReasonCalibrationSummaryRow = {
  key: string;
  category: OpportunityReasonLaneCategory;
  label: string;
  surfaced: number;
  closed: number;
  beatClose: number;
  lostClose: number;
  pushClose: number;
  closeDataRate: number | null;
  beatClosePct: number | null;
  lostClosePct: number | null;
  averageClvPct: number | null;
  averageTruthScore: number | null;
  averageSurfaceScore: number | null;
  averageExpectedValuePct: number | null;
};

export type OpportunityReasonCalibrationContext = {
  league: LeagueKey;
  marketType: string;
  marketEfficiency: MarketEfficiencyClass;
  bestPriceFlag: boolean;
  bookCount: number;
  marketDisagreementScore: number | null;
  sourceQualityScore: number;
  trapFlags: OpportunityTrapFlag[];
  actionState: OpportunityActionState;
  timingState: OpportunityTimingState;
  marketPathRegime: string | null;
  staleCopyConfidence: number | null;
  closeDestinationLabel: OpportunityCloseDestinationLabel;
  executionCapacityLabel: OpportunityExecutionCapacityLabel;
  baseScore: number;
  baseTimingQuality: number;
};

export type OpportunityReasonCalibrationResolver = {
  resolve: (
    context: OpportunityReasonCalibrationContext
  ) => OpportunityReasonCalibrationView;
};

const DEFAULT_LOOKBACK_DAYS = 180;
const MIN_SURFACED = 24;
const MIN_CLOSED = 12;
const MAX_SCORE_DELTA = 5;
const MIN_SCORE_DELTA = -5;
const MAX_TIMING_DELTA = 5;
const MIN_TIMING_DELTA = -5;
const MAX_SOURCE_WEIGHT_DELTA = 0.06;
const MIN_SOURCE_WEIGHT_DELTA = -0.06;

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

function humanizeLabel(value: string) {
  return value.replace(/_/g, " ");
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function parseTrapFlags(value: unknown): OpportunityTrapFlag[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is OpportunityTrapFlag =>
          typeof item === "string" && item.trim().length > 0
      )
    : [];
}

function sameNumber(left: number | null, right: number | null) {
  if (left === null && right === null) {
    return true;
  }

  if (typeof left !== "number" || typeof right !== "number") {
    return false;
  }

  return Math.abs(left - right) <= 0.001;
}

function laneView(args: {
  key: string;
  category: OpportunityReasonLaneCategory;
  label: string;
  description: string;
}): OpportunityReasonLaneView {
  return {
    key: normalizeLabel(args.key),
    category: args.category,
    label: args.label,
    description: args.description
  };
}

export function buildOpportunityReasonLanes(args: {
  marketPathRegime: string | null;
  staleCopyConfidence?: number | null;
  bestPriceFlag: boolean;
  bookCount?: number | null;
  marketDisagreementScore?: number | null;
  closeDestinationLabel: OpportunityCloseDestinationLabel | null;
  executionCapacityLabel: OpportunityExecutionCapacityLabel | null;
  marketEfficiency: MarketEfficiencyClass | string | null;
  sourceQualityScore?: number | null;
  trapFlags: OpportunityTrapFlag[];
  actionState: OpportunityActionState;
  timingState: OpportunityTimingState;
}): OpportunityReasonLaneView[] {
  const lanes: OpportunityReasonLaneView[] = [];
  const add = (item: OpportunityReasonLaneView | null) => {
    if (item && !lanes.some((lane) => lane.key === item.key)) {
      lanes.push(item);
    }
  };

  const regime = args.marketPathRegime ?? "NO_PATH";
  const staleCopyConfidence = clamp(args.staleCopyConfidence ?? 0, 0, 100);
  const disagreement = args.marketDisagreementScore ?? null;
  const bookCount = args.bookCount ?? null;
  const marketEfficiency = normalizeLabel(args.marketEfficiency ?? "UNKNOWN");
  const sourceQualityScore = args.sourceQualityScore ?? null;

  if (regime === "STALE_COPY" && staleCopyConfidence >= 64) {
    add(
      laneView({
        key: "path_stale_copy_confirmed",
        category: "path_regime",
        label: "Stale copy confirmed",
        description: "Leader books repriced while a lagger still hangs the old number."
      })
    );
  } else if (regime === "LEADER_CONFIRMED") {
    add(
      laneView({
        key: "path_leader_confirmed",
        category: "path_regime",
        label: "Leader confirmed",
        description: "Leader books moved and the board showed meaningful confirmation."
      })
    );
  } else if (regime === "BROAD_REPRICE") {
    add(
      laneView({
        key: "path_broad_reprice",
        category: "path_regime",
        label: "Broad reprice",
        description: "Books were already repricing together instead of leaving a lagger window."
      })
    );
  } else if (regime === "FRAGMENTED") {
    add(
      laneView({
        key: "path_fragmented",
        category: "path_regime",
        label: "Fragmented path",
        description: "The board looked noisy and fragmented rather than cleanly led."
      })
    );
  }

  if (args.bestPriceFlag) {
    const confirmed = (bookCount ?? 0) >= 4 && (disagreement ?? 0) <= 0.1;
    add(
      laneView({
        key: confirmed ? "price_best_confirmed" : "price_best_unconfirmed",
        category: "price_confirmation",
        label: confirmed ? "Best price confirmed" : "Best price unconfirmed",
        description: confirmed
          ? "The displayed best price was supported by enough market depth to matter."
          : "The displayed best price existed, but confirmation depth was still light."
      })
    );
  }

  if (args.closeDestinationLabel === "DECAY") {
    add(
      laneView({
        key: "destination_decay",
        category: "destination",
        label: "Destination decay",
        description: "Similar spots usually decay or get copied before close."
      })
    );
  } else if (args.closeDestinationLabel === "IMPROVE") {
    add(
      laneView({
        key: "destination_improve",
        category: "destination",
        label: "Destination improve",
        description: "Similar spots often improve before close instead of disappearing."
      })
    );
  } else if (args.closeDestinationLabel === "MOSTLY_PRICED") {
    add(
      laneView({
        key: "destination_mostly_priced",
        category: "destination",
        label: "Mostly priced",
        description: "Similar spots are usually mature by the time they surface."
      })
    );
  }

  if (args.executionCapacityLabel === "FULLY_ACTIONABLE") {
    add(
      laneView({
        key: "capacity_fully_actionable",
        category: "capacity",
        label: "Fully actionable",
        description: "This edge profile has enough market depth to be meaningfully deployable."
      })
    );
  } else if (args.executionCapacityLabel === "FRAGILE_STALE") {
    add(
      laneView({
        key: "capacity_fragile_stale",
        category: "capacity",
        label: "Fragile stale",
        description: "The edge can be real, but it is fragile and likely short-lived."
      })
    );
  } else if (args.executionCapacityLabel === "SCREEN_VALUE_ONLY") {
    add(
      laneView({
        key: "capacity_screen_value_only",
        category: "capacity",
        label: "Screen value only",
        description: "The edge reads more like screen value than scalable execution."
      })
    );
  }

  if (marketEfficiency === "high_efficiency") {
    add(
      laneView({
        key: "market_high_efficiency",
        category: "market_efficiency",
        label: "High-efficiency market",
        description: "This lane behaves like a mature efficient market."
      })
    );
  } else if (marketEfficiency === "fragmented_prop") {
    add(
      laneView({
        key: "market_fragmented_prop",
        category: "market_efficiency",
        label: "Fragmented prop market",
        description: "This lane behaves like a fragmented prop environment."
      })
    );
  } else if (marketEfficiency === "thin_specialty") {
    add(
      laneView({
        key: "market_thin_specialty",
        category: "market_efficiency",
        label: "Thin specialty market",
        description: "This lane behaves like a thin specialty market."
      })
    );
  }

  if (typeof sourceQualityScore === "number") {
    if (sourceQualityScore >= 72) {
      add(
        laneView({
          key: "source_strong",
          category: "source_quality",
          label: "Strong source quality",
          description: "The offered book and path context looked reliable at surface time."
        })
      );
    } else if (sourceQualityScore <= 52) {
      add(
        laneView({
          key: "source_weak",
          category: "source_quality",
          label: "Weak source quality",
          description: "The offered book and path context looked weak at surface time."
        })
      );
    }
  }

  for (const trap of args.trapFlags) {
    const key = normalizeLabel(`trap_${trap}`);
    add(
      laneView({
        key,
        category: "trap",
        label: `Trap ${humanizeLabel(normalizeLabel(trap))}`,
        description: `The setup carried the ${humanizeLabel(normalizeLabel(trap))} trap flag at surface time.`
      })
    );
  }

  add(
    laneView({
      key: `action_${normalizeLabel(args.actionState)}`,
      category: "action",
      label: `Action ${humanizeLabel(normalizeLabel(args.actionState))}`,
      description: `The opportunity surfaced with ${humanizeLabel(normalizeLabel(args.actionState))} posture.`
    })
  );
  add(
    laneView({
      key: `timing_${normalizeLabel(args.timingState)}`,
      category: "timing",
      label: `Timing ${humanizeLabel(normalizeLabel(args.timingState))}`,
      description: `The opportunity surfaced with ${humanizeLabel(normalizeLabel(args.timingState))} timing.`
    })
  );

  return lanes;
}

function parseStoredReasonLanes(row: ReasonHistoryRow): OpportunityReasonLaneView[] {
  const metadata = asObject(row.metadataJson);
  const snapshot = asObject(metadata?.executionSnapshot);
  const rawReasonLanes = Array.isArray(snapshot?.reasonLanes)
    ? (snapshot?.reasonLanes as unknown[])
    : [];

  const parsed = rawReasonLanes
    .map((item) => {
      const lane = asObject(item);
      const key = asString(lane?.key);
      const category = asString(lane?.category) as OpportunityReasonLaneCategory | null;
      const label = asString(lane?.label);
      const description = asString(lane?.description);
      if (!key || !category || !label || !description) {
        return null;
      }

      return {
        key,
        category,
        label,
        description
      } satisfies OpportunityReasonLaneView;
    })
    .filter((item): item is OpportunityReasonLaneView => Boolean(item));

  if (parsed.length) {
    return parsed;
  }

  const displayedOddsAmerican = asNumber(snapshot?.displayedOddsAmerican);
  const displayedLine = asNumber(snapshot?.displayedLine);
  const bestAvailableOddsAmerican = asNumber(snapshot?.bestAvailableOddsAmerican);
  const bestAvailableLine = asNumber(snapshot?.bestAvailableLine);

  return buildOpportunityReasonLanes({
    marketPathRegime:
      asString(snapshot?.marketPathRegime) ?? asString(asObject(metadata?.marketPath)?.regime),
    staleCopyConfidence:
      asNumber(snapshot?.staleCopyConfidence) ??
      asNumber(asObject(metadata?.marketPath)?.staleCopyConfidence),
    bestPriceFlag:
      sameNumber(displayedOddsAmerican, bestAvailableOddsAmerican) &&
      sameNumber(displayedLine, bestAvailableLine),
    bookCount: asNumber(snapshot?.confirmationCount),
    marketDisagreementScore: null,
    closeDestinationLabel:
      (asString(snapshot?.closeDestinationLabel) as OpportunityCloseDestinationLabel | null) ?? null,
    executionCapacityLabel:
      (asString(snapshot?.executionCapacityLabel) as OpportunityExecutionCapacityLabel | null) ?? null,
    marketEfficiency: row.marketEfficiency,
    sourceQualityScore: asNumber(snapshot?.sourceQualityScore),
    trapFlags: parseTrapFlags(row.trapFlagsJson),
    actionState:
      (asString(snapshot?.actionState) as OpportunityActionState | null) ??
      (asString(row.actionState) as OpportunityActionState | null) ??
      "WATCH",
    timingState:
      (asString(snapshot?.timingState) as OpportunityTimingState | null) ??
      (asString(row.timingState) as OpportunityTimingState | null) ??
      "MONITOR_ONLY"
  });
}

function summarizeReasonRows(rows: ReasonHistoryRow[]) {
  const summaryByKey = new Map<
    string,
    OpportunityReasonCalibrationSummaryRow & {
      clvTotal: number;
      clvSamples: number;
      truthTotal: number;
      truthSamples: number;
      surfaceScoreTotal: number;
      surfaceScoreSamples: number;
      expectedValueTotal: number;
      expectedValueSamples: number;
    }
  >();

  for (const row of rows) {
    const lanes = parseStoredReasonLanes(row);
    if (!lanes.length) {
      continue;
    }

    for (const lane of lanes) {
      const summary = summaryByKey.get(lane.key) ?? {
        key: lane.key,
        category: lane.category,
        label: lane.label,
        surfaced: 0,
        closed: 0,
        beatClose: 0,
        lostClose: 0,
        pushClose: 0,
        closeDataRate: null,
        beatClosePct: null,
        lostClosePct: null,
        averageClvPct: null,
        averageTruthScore: null,
        averageSurfaceScore: null,
        averageExpectedValuePct: null,
        clvTotal: 0,
        clvSamples: 0,
        truthTotal: 0,
        truthSamples: 0,
        surfaceScoreTotal: 0,
        surfaceScoreSamples: 0,
        expectedValueTotal: 0,
        expectedValueSamples: 0
      };

      summary.surfaced += 1;
      if (row.clvResult && row.clvResult !== "NO_CLOSE_DATA") {
        summary.closed += 1;
      }
      if (row.clvResult === "BEAT_CLOSE") {
        summary.beatClose += 1;
      }
      if (row.clvResult === "LOST_CLOSE") {
        summary.lostClose += 1;
      }
      if (row.clvResult === "PUSH_CLOSE") {
        summary.pushClose += 1;
      }

      if (typeof row.clvPct === "number") {
        summary.clvTotal += row.clvPct;
        summary.clvSamples += 1;
      }
      if (typeof row.normalizedTruthScore === "number") {
        summary.truthTotal += row.normalizedTruthScore;
        summary.truthSamples += 1;
      }
      if (typeof row.opportunityScore === "number") {
        summary.surfaceScoreTotal += row.opportunityScore;
        summary.surfaceScoreSamples += 1;
      }
      if (typeof row.expectedValuePct === "number") {
        summary.expectedValueTotal += row.expectedValuePct;
        summary.expectedValueSamples += 1;
      }

      summaryByKey.set(lane.key, summary);
    }
  }

  for (const summary of summaryByKey.values()) {
    summary.closeDataRate =
      summary.surfaced > 0 ? round((summary.closed / summary.surfaced) * 100, 1) : null;
    summary.beatClosePct =
      summary.closed > 0 ? round((summary.beatClose / summary.closed) * 100, 1) : null;
    summary.lostClosePct =
      summary.closed > 0 ? round((summary.lostClose / summary.closed) * 100, 1) : null;
    summary.averageClvPct =
      summary.clvSamples > 0 ? round(summary.clvTotal / summary.clvSamples, 3) : null;
    summary.averageTruthScore =
      summary.truthSamples > 0 ? round(summary.truthTotal / summary.truthSamples, 3) : null;
    summary.averageSurfaceScore =
      summary.surfaceScoreSamples > 0
        ? round(summary.surfaceScoreTotal / summary.surfaceScoreSamples, 1)
        : null;
    summary.averageExpectedValuePct =
      summary.expectedValueSamples > 0
        ? round(summary.expectedValueTotal / summary.expectedValueSamples, 3)
        : null;
  }

  return Array.from(summaryByKey.values())
    .map(
      ({
        clvTotal: _clvTotal,
        clvSamples: _clvSamples,
        truthTotal: _truthTotal,
        truthSamples: _truthSamples,
        surfaceScoreTotal: _surfaceScoreTotal,
        surfaceScoreSamples: _surfaceScoreSamples,
        expectedValueTotal: _expectedValueTotal,
        expectedValueSamples: _expectedValueSamples,
        ...summary
      }) => summary
    )
    .sort((left, right) => right.closed - left.closed || right.surfaced - left.surfaced);
}

async function loadReasonHistoryRows(args: {
  league?: LeagueKey | "ALL";
  since?: Date;
}) {
  const since =
    args.since ??
    new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  return prisma.$queryRaw<ReasonHistoryRow[]>`
    SELECT
      "league",
      "marketType",
      "marketEfficiency",
      "actionState",
      "timingState",
      "trapFlagsJson",
      "clvResult",
      "clvPct",
      "normalizedTruthScore",
      "opportunityScore",
      "expectedValuePct",
      "metadataJson"
    FROM "opportunity_surface_records"
    WHERE "surfacedAt" >= ${since}
    ${
      args.league && args.league !== "ALL"
        ? Prisma.sql`AND "league" = ${args.league}`
        : Prisma.empty
    }
  `;
}

export async function summarizeOpportunityReasonCalibration(args: {
  league?: LeagueKey | "ALL";
  since?: Date;
} = {}): Promise<OpportunityReasonCalibrationSummaryRow[]> {
  if (!hasUsableServerDatabaseUrl()) {
    return [];
  }

  const rows = await loadReasonHistoryRows(args);
  return summarizeReasonRows(rows);
}

function getScoreMultiplier(category: OpportunityReasonLaneCategory) {
  switch (category) {
    case "path_regime":
      return 1.15;
    case "price_confirmation":
      return 0.85;
    case "destination":
      return 0.8;
    case "capacity":
      return 0.65;
    case "source_quality":
      return 0.55;
    case "trap":
      return 0.65;
    case "timing":
      return 0.45;
    case "action":
      return 0.35;
    case "market_efficiency":
    default:
      return 0.4;
  }
}

function getTimingMultiplier(category: OpportunityReasonLaneCategory) {
  switch (category) {
    case "path_regime":
      return 1.1;
    case "destination":
      return 1;
    case "trap":
      return 0.9;
    case "timing":
      return 0.8;
    case "action":
      return 0.6;
    case "capacity":
      return 0.5;
    default:
      return 0.3;
  }
}

function buildNeutralReasonCalibration(args: {
  baseScore: number;
  baseTimingQuality: number;
  reasonLanes?: OpportunityReasonLaneView[];
  status?: TruthCalibrationStatus;
  summary?: string;
}): OpportunityReasonCalibrationView {
  return {
    status: args.status ?? "SKIPPED_NO_DATA",
    reasonLanes: args.reasonLanes ?? [],
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
      requiredSurfaced: MIN_SURFACED,
      requiredClosed: MIN_CLOSED,
      qualifiedSignals: 0,
      insufficientSignals: 0
    },
    summary:
      args.summary ??
      "Reason calibration skipped: no structured reason lane has enough close-history yet.",
    applied: [],
    skipped: []
  };
}

function buildTrace(
  lane: OpportunityReasonLaneView,
  row: OpportunityReasonCalibrationSummaryRow
): OpportunityReasonCalibrationTrace {
  const insufficient = row.surfaced < MIN_SURFACED || row.closed < MIN_CLOSED || row.beatClosePct === null;

  if (insufficient) {
    return {
      key: lane.key,
      category: lane.category,
      label: lane.label,
      sampleState: "INSUFFICIENT_SAMPLE",
      surfaced: row.surfaced,
      closed: row.closed,
      beatClosePct: row.beatClosePct,
      averageTruthScore: row.averageTruthScore,
      applied: false,
      scoreDelta: 0,
      timingDelta: 0,
      sourceWeightDelta: 0,
      trapHint: "NEUTRAL",
      note: `Reason lane ${lane.label} has not cleared the ${MIN_SURFACED}/${MIN_CLOSED} surfaced/closed sample gate yet.`
    };
  }

  const performanceEdge =
    ((row.beatClosePct ?? 50) - 50) / 10 +
    (row.averageTruthScore ?? 0) / 1.25 +
    (row.averageClvPct ?? 0) / 1.5;
  const strength = clamp(performanceEdge, -2.2, 2.2);
  const scoreDelta = Math.round(clamp(strength * getScoreMultiplier(lane.category), -2, 2));
  const timingDelta = Math.round(clamp(strength * getTimingMultiplier(lane.category), -2, 2));
  const sourceWeightDelta =
    lane.category === "source_quality"
      ? round(clamp(strength * 0.018, -0.04, 0.04), 3)
      : 0;
  const trapHint =
    lane.category === "trap" || lane.key === "path_fragmented"
      ? strength <= -0.9
        ? "ESCALATE"
        : strength >= 1.1
          ? "DE_ESCALATE"
          : "NEUTRAL"
      : "NEUTRAL";
  const applied =
    scoreDelta !== 0 || timingDelta !== 0 || sourceWeightDelta !== 0 || trapHint !== "NEUTRAL";
  const note =
    applied
      ? `${lane.label} closed at ${row.beatClosePct}% beat-close over ${row.closed} qualified samples.`
      : `${lane.label} qualified but stayed near neutral on closed truth.`;

  return {
    key: lane.key,
    category: lane.category,
    label: lane.label,
    sampleState: "QUALIFIED",
    surfaced: row.surfaced,
    closed: row.closed,
    beatClosePct: row.beatClosePct,
    averageTruthScore: row.averageTruthScore,
    applied,
    scoreDelta,
    timingDelta,
    sourceWeightDelta,
    trapHint,
    note
  };
}

function summarizeReasonCalibration(view: OpportunityReasonCalibrationView) {
  if (view.status === "APPLIED") {
    const appliedLabels = view.applied.slice(0, 3).map((item) => item.label).join(", ");
    return `Reason calibration applied: ${view.scoreDelta >= 0 ? "+" : ""}${view.scoreDelta} score, ${view.timingDelta >= 0 ? "+" : ""}${view.timingDelta} timing from ${appliedLabels}.`;
  }

  if (view.status === "SKIPPED_NEUTRAL") {
    return "Reason calibration qualified but stayed neutral because similar explanation lanes are close to flat.";
  }

  if (view.status === "SKIPPED_INSUFFICIENT_SAMPLE") {
    return `Reason calibration skipped: structured reason lanes have not cleared the ${MIN_SURFACED}/${MIN_CLOSED} surfaced/closed gate yet.`;
  }

  return "Reason calibration skipped: no matching structured reason lane is available yet.";
}

export function createOpportunityReasonCalibrationResolver(args?: {
  rows?: OpportunityReasonCalibrationSummaryRow[];
}): OpportunityReasonCalibrationResolver {
  const rows = args?.rows ?? [];
  const byKey = new Map(rows.map((row) => [normalizeLabel(row.key), row] as const));

  return {
    resolve(context) {
      const reasonLanes = buildOpportunityReasonLanes({
        marketPathRegime: context.marketPathRegime,
        staleCopyConfidence: context.staleCopyConfidence,
        bestPriceFlag: context.bestPriceFlag,
        bookCount: context.bookCount,
        marketDisagreementScore: context.marketDisagreementScore,
        closeDestinationLabel: context.closeDestinationLabel,
        executionCapacityLabel: context.executionCapacityLabel,
        marketEfficiency: context.marketEfficiency,
        sourceQualityScore: context.sourceQualityScore,
        trapFlags: context.trapFlags,
        actionState: context.actionState,
        timingState: context.timingState
      });

      if (!reasonLanes.length) {
        return buildNeutralReasonCalibration({
          baseScore: context.baseScore,
          baseTimingQuality: context.baseTimingQuality,
          reasonLanes
        });
      }

      const applied: OpportunityReasonCalibrationTrace[] = [];
      const skipped: OpportunityReasonCalibrationTrace[] = [];

      for (const lane of reasonLanes) {
        const row = byKey.get(normalizeLabel(lane.key));
        if (!row) {
          continue;
        }

        const trace = buildTrace(lane, row);
        if (trace.applied) {
          applied.push(trace);
        } else {
          skipped.push(trace);
        }
      }

      const qualifiedSignals = [...applied, ...skipped].filter(
        (trace) => trace.sampleState === "QUALIFIED"
      ).length;
      const insufficientSignals = skipped.filter(
        (trace) => trace.sampleState === "INSUFFICIENT_SAMPLE"
      ).length;

      if (!applied.length && !skipped.length) {
        return buildNeutralReasonCalibration({
          baseScore: context.baseScore,
          baseTimingQuality: context.baseTimingQuality,
          reasonLanes
        });
      }

      const scoreDelta = clamp(
        applied.reduce((total, trace) => total + trace.scoreDelta, 0),
        MIN_SCORE_DELTA,
        MAX_SCORE_DELTA
      );
      const timingDelta = clamp(
        applied.reduce((total, trace) => total + trace.timingDelta, 0),
        MIN_TIMING_DELTA,
        MAX_TIMING_DELTA
      );
      const sourceWeightDelta = round(
        clamp(
          applied.reduce((total, trace) => total + trace.sourceWeightDelta, 0),
          MIN_SOURCE_WEIGHT_DELTA,
          MAX_SOURCE_WEIGHT_DELTA
        ),
        3
      );
      const trapEscalation = applied.some((trace) => trace.trapHint === "ESCALATE");
      const trapDeEscalation = !trapEscalation && applied.some((trace) => trace.trapHint === "DE_ESCALATE");

      const status: TruthCalibrationStatus =
        applied.length > 0
          ? "APPLIED"
          : insufficientSignals > 0 && qualifiedSignals === 0
            ? "SKIPPED_INSUFFICIENT_SAMPLE"
            : "SKIPPED_NEUTRAL";

      const view: OpportunityReasonCalibrationView = {
        status,
        reasonLanes,
        scoreDelta,
        timingDelta,
        sourceWeightDelta,
        trapEscalation,
        trapDeEscalation,
        baseScore: context.baseScore,
        calibratedScore: clamp(context.baseScore + scoreDelta, 0, 100),
        baseTimingQuality: context.baseTimingQuality,
        calibratedTimingQuality: clamp(context.baseTimingQuality + timingDelta, 0, 100),
        sampleGate: {
          requiredSurfaced: MIN_SURFACED,
          requiredClosed: MIN_CLOSED,
          qualifiedSignals,
          insufficientSignals
        },
        summary: "",
        applied,
        skipped
      };

      view.summary = summarizeReasonCalibration(view);
      return view;
    }
  };
}

export async function getOpportunityReasonCalibrationResolver(args: {
  league?: LeagueKey | "ALL";
  since?: Date;
} = {}): Promise<OpportunityReasonCalibrationResolver> {
  if (!hasUsableServerDatabaseUrl()) {
    return createOpportunityReasonCalibrationResolver();
  }

  try {
    const rows = await summarizeOpportunityReasonCalibration(args);
    return createOpportunityReasonCalibrationResolver({ rows });
  } catch {
    return createOpportunityReasonCalibrationResolver();
  }
}

export function buildOpportunityReasonCalibrationSummary(
  view: OpportunityReasonCalibrationView | null | undefined
) {
  return view?.summary ?? null;
}
