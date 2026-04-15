import { Prisma } from "@prisma/client";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { LeagueKey } from "@/lib/types/domain";
import type {
  OpportunityActionState,
  OpportunityCloseDestinationConfidence,
  OpportunityReasonLaneView,
  OpportunityTimingReplayBias,
  OpportunityTimingReplayStatus,
  OpportunityTimingReplayView,
  OpportunityTimingReviewClassification,
  OpportunityTimingReviewVerdict,
  OpportunityTimingReviewView,
  OpportunityTimingState,
  OpportunityView
} from "@/lib/types/opportunity";
import { buildOpportunityReasonLanes } from "@/services/opportunities/opportunity-reason-calibration";

type TimingReviewHistoryRow = {
  surfaceKey: string;
  surfacedOpportunityId: string;
  eventId: string;
  league: string | null;
  marketType: string;
  selection: string;
  surfaceContext: string;
  surfacedAt: Date;
  sportsbookKey: string | null;
  sportsbookName: string | null;
  displayedOddsAmerican: number | null;
  displayedLine: number | null;
  closeOddsAmerican: number | null;
  closeLine: number | null;
  closeState: string | null;
  closeCapturedAt: Date | null;
  clvPct: number | null;
  clvResult: string | null;
  normalizedTruthScore: number | null;
  actionState: string | null;
  timingState: string | null;
  confidenceTier: string | null;
  finalOutcome: string | null;
  metadataJson: unknown;
};

type ParsedTimingSnapshot = {
  surfaceKey: string;
  surfacedAt: string;
  surfaceContext: string | null;
  actionState: OpportunityActionState | null;
  timingState: OpportunityTimingState | null;
  marketPathRegime: string;
  staleCopyConfidence: number | null;
  closeDestinationLabel: OpportunityView["closeDestination"]["label"] | null;
  executionCapacityLabel: OpportunityView["executionCapacity"]["label"] | null;
  reasonLanes: OpportunityReasonLaneView[];
};

export type OpportunityTimingReviewSummaryGroup =
  | "league"
  | "market"
  | "market_path_regime"
  | "reason_lane"
  | "stale_copy"
  | "timing"
  | "action"
  | "confidence";

export type OpportunityTimingReviewSummaryRow = {
  groupBy: OpportunityTimingReviewSummaryGroup;
  key: string;
  label: string;
  surfaced: number;
  replayQualified: number;
  hitNowCorrect: number;
  waitWasBetter: number;
  windowHeld: number;
  edgeDiedFast: number;
  staleCopyCaptureWindow: number;
  averageTimingReviewScore: number | null;
  averageClvPct: number | null;
};

export type OpportunityTimingReplayContext = {
  league: LeagueKey;
  marketType: string;
  marketPathRegime: string | null;
  staleCopyConfidence: number | null;
  actionState: OpportunityActionState;
  timingState: OpportunityTimingState;
  confidenceTier: OpportunityView["confidenceTier"];
  reasonLanes: OpportunityReasonLaneView[];
};

export type OpportunityTimingReplayResolver = {
  resolve: (context: OpportunityTimingReplayContext) => OpportunityTimingReplayView;
};

const DEFAULT_LOOKBACK_DAYS = 180;
const MIN_SURFACED = 20;
const MIN_REPLAY_QUALIFIED = 10;

type SummaryMaps = Partial<
  Record<OpportunityTimingReviewSummaryGroup, Map<string, OpportunityTimingReviewSummaryRow>>
>;

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

function parseReasonLanes(value: unknown): OpportunityReasonLaneView[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const lane = asObject(item);
      const key = asString(lane?.key);
      const category = asString(lane?.category) as OpportunityReasonLaneView["category"] | null;
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
}

export function parseStoredOpportunityTimingSnapshot(
  row: Pick<
    TimingReviewHistoryRow,
    | "surfaceKey"
    | "surfaceContext"
    | "surfacedAt"
    | "actionState"
    | "timingState"
    | "metadataJson"
    | "displayedOddsAmerican"
    | "displayedLine"
  >
): ParsedTimingSnapshot | null {
  const metadata = asObject(row.metadataJson);
  const snapshot = asObject(metadata?.executionSnapshot);
  const reasonLanes = parseReasonLanes(snapshot?.reasonLanes);

  if (snapshot) {
    return {
      surfaceKey: asString(snapshot.surfaceKey) ?? row.surfaceKey,
      surfacedAt: asString(snapshot.surfacedAt) ?? row.surfacedAt.toISOString(),
      surfaceContext: asString(snapshot.surfaceContext) ?? row.surfaceContext,
      actionState:
        (asString(snapshot.actionState) as OpportunityActionState | null) ??
        (asString(row.actionState) as OpportunityActionState | null),
      timingState:
        (asString(snapshot.timingState) as OpportunityTimingState | null) ??
        (asString(row.timingState) as OpportunityTimingState | null),
      marketPathRegime: asString(snapshot.marketPathRegime) ?? "NO_PATH",
      staleCopyConfidence: asNumber(snapshot.staleCopyConfidence),
      closeDestinationLabel:
        (asString(snapshot.closeDestinationLabel) as OpportunityView["closeDestination"]["label"] | null) ??
        null,
      executionCapacityLabel:
        (asString(snapshot.executionCapacityLabel) as OpportunityView["executionCapacity"]["label"] | null) ??
        null,
      reasonLanes:
        reasonLanes.length > 0
          ? reasonLanes
          : buildOpportunityReasonLanes({
              marketPathRegime:
                asString(snapshot.marketPathRegime) ??
                asString(asObject(metadata?.marketPath)?.regime),
              staleCopyConfidence:
                asNumber(snapshot.staleCopyConfidence) ??
                asNumber(asObject(metadata?.marketPath)?.staleCopyConfidence),
              bestPriceFlag: true,
              closeDestinationLabel:
                (asString(snapshot.closeDestinationLabel) as OpportunityView["closeDestination"]["label"] | null) ??
                null,
              executionCapacityLabel:
                (asString(snapshot.executionCapacityLabel) as OpportunityView["executionCapacity"]["label"] | null) ??
                null,
              marketEfficiency: asString(asObject(metadata)?.marketEfficiency),
              sourceQualityScore: asNumber(snapshot.sourceQualityScore),
              trapFlags: [],
              actionState:
                (asString(snapshot.actionState) as OpportunityActionState | null) ??
                "WATCH",
              timingState:
                (asString(snapshot.timingState) as OpportunityTimingState | null) ??
                "MONITOR_ONLY"
            })
    };
  }

  return {
    surfaceKey: row.surfaceKey,
    surfacedAt: row.surfacedAt.toISOString(),
    surfaceContext: row.surfaceContext,
    actionState: (asString(row.actionState) as OpportunityActionState | null) ?? null,
    timingState: (asString(row.timingState) as OpportunityTimingState | null) ?? null,
    marketPathRegime: asString(asObject(metadata?.marketPath)?.regime) ?? "NO_PATH",
    staleCopyConfidence: asNumber(asObject(metadata?.marketPath)?.staleCopyConfidence),
    closeDestinationLabel: null,
    executionCapacityLabel: null,
    reasonLanes: []
  };
}

function buildReviewReasonCodes(classification: OpportunityTimingReviewClassification) {
  switch (classification) {
    case "STALE_COPY_CAPTURE_WINDOW":
      return ["STALE_COPY_CAPTURE_WINDOW", "HIT_NOW_VALIDATED"];
    case "EDGE_DIED_FAST":
      return ["EDGE_DIED_FAST", "HIT_NOW_VALIDATED"];
    case "HIT_NOW_CORRECT":
      return ["HIT_NOW_VALIDATED"];
    case "WAIT_WAS_BETTER":
      return ["WAIT_VALIDATED"];
    case "WINDOW_HELD":
      return ["WINDOW_HELD"];
    default:
      return ["NO_REPLAY_CONFIDENCE"];
  }
}

export function buildOpportunityTimingReview(
  row: TimingReviewHistoryRow
): OpportunityTimingReviewView {
  const snapshot = parseStoredOpportunityTimingSnapshot(row);
  const closeState = normalizeLabel(row.closeState);
  if (!snapshot || closeState === "unresolved" || row.clvResult === "NO_CLOSE_DATA") {
    return {
      status: "NO_REPLAY_CONFIDENCE",
      surfaceKey: row.surfaceKey,
      surfacedAt: row.surfacedAt.toISOString(),
      surfaceContext: row.surfaceContext,
      classification: "NO_REPLAY_CONFIDENCE",
      verdict: "UNKNOWN",
      timingReviewScore: null,
      actionStateAtSurface: snapshot?.actionState ?? null,
      timingStateAtSurface: snapshot?.timingState ?? null,
      marketPathRegimeAtSurface: (snapshot?.marketPathRegime as OpportunityTimingReviewView["marketPathRegimeAtSurface"]) ?? "NO_PATH",
      reasonLanes: snapshot?.reasonLanes ?? [],
      staleCopyExpected: false,
      closeDestinationLabelAtSurface: snapshot?.closeDestinationLabel ?? null,
      executionCapacityLabelAtSurface: snapshot?.executionCapacityLabel ?? null,
      clvPct: row.clvPct,
      normalizedTruthScore: row.normalizedTruthScore,
      timeToCloseMinutes: null,
      validatedOriginalAction: null,
      reasonCodes: ["NO_REPLAY_CONFIDENCE"],
      reasons: ["Replay review stayed neutral because close truth or surface snapshot context is incomplete."]
    };
  }

  const surfacedAtMs = new Date(snapshot.surfacedAt).getTime();
  const closeCapturedAtMs = row.closeCapturedAt?.getTime() ?? NaN;
  const timeToCloseMinutes =
    Number.isFinite(surfacedAtMs) && Number.isFinite(closeCapturedAtMs)
      ? Math.max(0, Math.round((closeCapturedAtMs - surfacedAtMs) / 60_000))
      : null;
  const clvPct = row.clvPct ?? null;
  const truthScore = row.normalizedTruthScore ?? null;
  const staleCopyExpected =
    snapshot.marketPathRegime === "STALE_COPY" &&
    clamp(snapshot.staleCopyConfidence ?? 0, 0, 100) >= 64;
  const shouldWait =
    snapshot.actionState === "WAIT" ||
    snapshot.timingState === "WAIT_FOR_PULLBACK" ||
    snapshot.timingState === "WAIT_FOR_CONFIRMATION" ||
    snapshot.closeDestinationLabel === "IMPROVE";
  const shouldHitNow =
    snapshot.actionState === "BET_NOW" ||
    snapshot.closeDestinationLabel === "DECAY" ||
    staleCopyExpected;
  const materialBeat = (clvPct ?? 0) >= 1 || (truthScore ?? 0) >= 0.7;
  const materialLost = (clvPct ?? 0) <= -1 || (truthScore ?? 0) <= -0.7;
  const windowHeld = !materialBeat && !materialLost;
  const edgeDiedFast = materialBeat && timeToCloseMinutes !== null && timeToCloseMinutes <= 45;

  let classification: OpportunityTimingReviewClassification = "WINDOW_HELD";
  let verdict: OpportunityTimingReviewVerdict = "NEUTRAL";
  let timingReviewScore = 56;
  const reasons: string[] = [];

  if (staleCopyExpected && materialBeat) {
    classification = "STALE_COPY_CAPTURE_WINDOW";
    verdict = shouldHitNow ? "VALIDATED" : "NEUTRAL";
    timingReviewScore = 90;
    reasons.push("Surface snapshot showed a stale-copy window and the number beat close before the board could fully catch up.");
  } else if (edgeDiedFast) {
    classification = "EDGE_DIED_FAST";
    verdict = shouldHitNow ? "VALIDATED" : shouldWait ? "CONTRADICTED" : "NEUTRAL";
    timingReviewScore = 84;
    reasons.push("The edge decayed quickly after surfacing, so passive monitoring would usually have been punished.");
  } else if (materialBeat) {
    classification = "HIT_NOW_CORRECT";
    verdict = shouldHitNow ? "VALIDATED" : shouldWait ? "CONTRADICTED" : "NEUTRAL";
    timingReviewScore = 74;
    reasons.push("Entry-at-surface beat close, which validates immediate action more than waiting.");
  } else if (materialLost) {
    classification = "WAIT_WAS_BETTER";
    verdict = shouldWait ? "VALIDATED" : shouldHitNow ? "CONTRADICTED" : "NEUTRAL";
    timingReviewScore = 28;
    reasons.push("Close improved versus the surfaced number, so waiting would have produced a better entry.");
  } else if (windowHeld) {
    classification = "WINDOW_HELD";
    verdict = shouldWait || shouldHitNow ? "NEUTRAL" : "UNKNOWN";
    timingReviewScore = 58;
    reasons.push("The number held close to flat into the close, so timing posture was not strongly validated either way.");
  }

  if (typeof clvPct === "number") {
    timingReviewScore = Math.round(clamp(timingReviewScore + clvPct * 4, 0, 100));
  }

  return {
    status: "QUALIFIED",
    surfaceKey: row.surfaceKey,
    surfacedAt: row.surfacedAt.toISOString(),
    surfaceContext: row.surfaceContext,
    classification,
    verdict,
    timingReviewScore,
    actionStateAtSurface: snapshot.actionState,
    timingStateAtSurface: snapshot.timingState,
    marketPathRegimeAtSurface: snapshot.marketPathRegime as OpportunityTimingReviewView["marketPathRegimeAtSurface"],
    reasonLanes: snapshot.reasonLanes,
    staleCopyExpected,
    closeDestinationLabelAtSurface: snapshot.closeDestinationLabel,
    executionCapacityLabelAtSurface: snapshot.executionCapacityLabel,
    clvPct,
    normalizedTruthScore: truthScore,
    timeToCloseMinutes,
    validatedOriginalAction:
      verdict === "VALIDATED" ? true : verdict === "CONTRADICTED" ? false : null,
    reasonCodes: buildReviewReasonCodes(classification),
    reasons: reasons.slice(0, 3)
  };
}

function createEmptySummary(args: {
  groupBy: OpportunityTimingReviewSummaryGroup;
  key: string;
  label: string;
}): OpportunityTimingReviewSummaryRow {
  return {
    groupBy: args.groupBy,
    key: args.key,
    label: args.label,
    surfaced: 0,
    replayQualified: 0,
    hitNowCorrect: 0,
    waitWasBetter: 0,
    windowHeld: 0,
    edgeDiedFast: 0,
    staleCopyCaptureWindow: 0,
    averageTimingReviewScore: null,
    averageClvPct: null
  };
}

function accumulateAverage(current: number | null, count: number, next: number | null, digits = 2) {
  if (typeof next !== "number") {
    return current;
  }

  const currentTotal = (current ?? 0) * count;
  return round((currentTotal + next) / (count + 1), digits);
}

function groupLabelsForRow(row: TimingReviewHistoryRow, review: OpportunityTimingReviewView) {
  const labels: Array<{ groupBy: OpportunityTimingReviewSummaryGroup; key: string; label: string }> = [
    {
      groupBy: "league",
      key: normalizeLabel(row.league ?? "UNKNOWN"),
      label: row.league ?? "UNKNOWN"
    },
    {
      groupBy: "market",
      key: normalizeLabel(row.marketType),
      label: row.marketType
    },
    {
      groupBy: "market_path_regime",
      key: normalizeLabel(review.marketPathRegimeAtSurface),
      label: humanizeLabel(normalizeLabel(review.marketPathRegimeAtSurface))
    },
    {
      groupBy: "stale_copy",
      key: review.staleCopyExpected ? "stale_copy_present" : "no_stale_copy",
      label: review.staleCopyExpected ? "Stale copy present" : "No stale copy"
    },
    {
      groupBy: "timing",
      key: normalizeLabel(review.timingStateAtSurface ?? row.timingState ?? "UNKNOWN"),
      label: review.timingStateAtSurface ?? row.timingState ?? "UNKNOWN"
    },
    {
      groupBy: "action",
      key: normalizeLabel(review.actionStateAtSurface ?? row.actionState ?? "UNKNOWN"),
      label: review.actionStateAtSurface ?? row.actionState ?? "UNKNOWN"
    },
    {
      groupBy: "confidence",
      key: normalizeLabel(row.confidenceTier ?? "UNKNOWN"),
      label: row.confidenceTier ?? "UNKNOWN"
    }
  ];

  for (const lane of review.reasonLanes) {
    labels.push({
      groupBy: "reason_lane",
      key: normalizeLabel(lane.key),
      label: lane.label
    });
  }

  return labels;
}

function summarizeTimingReviewRows(rows: TimingReviewHistoryRow[]) {
  const maps: SummaryMaps = {};

  for (const row of rows) {
    const review = buildOpportunityTimingReview(row);
    const labels = groupLabelsForRow(row, review);

    for (const item of labels) {
      const map = maps[item.groupBy] ?? new Map<string, OpportunityTimingReviewSummaryRow>();
      const summary = map.get(item.key) ?? createEmptySummary(item);
      const qualifiedBefore = summary.replayQualified;

      summary.surfaced += 1;
      if (review.status === "QUALIFIED") {
        summary.replayQualified += 1;
        if (review.classification === "HIT_NOW_CORRECT") {
          summary.hitNowCorrect += 1;
        } else if (review.classification === "WAIT_WAS_BETTER") {
          summary.waitWasBetter += 1;
        } else if (review.classification === "WINDOW_HELD") {
          summary.windowHeld += 1;
        } else if (review.classification === "EDGE_DIED_FAST") {
          summary.edgeDiedFast += 1;
        } else if (review.classification === "STALE_COPY_CAPTURE_WINDOW") {
          summary.staleCopyCaptureWindow += 1;
        }

        summary.averageTimingReviewScore = accumulateAverage(
          summary.averageTimingReviewScore,
          qualifiedBefore,
          review.timingReviewScore,
          2
        );
        summary.averageClvPct = accumulateAverage(
          summary.averageClvPct,
          qualifiedBefore,
          review.clvPct,
          3
        );
      }

      map.set(item.key, summary);
      maps[item.groupBy] = map;
    }
  }

  return maps;
}

async function loadTimingReviewHistory(args: {
  league?: LeagueKey | "ALL";
  since?: Date;
}) {
  const since =
    args.since ??
    new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  return prisma.$queryRaw<TimingReviewHistoryRow[]>`
    SELECT
      "surfaceKey",
      "surfacedOpportunityId",
      "eventId",
      "league",
      "marketType",
      "selection",
      "surfaceContext",
      "surfacedAt",
      "sportsbookKey",
      "sportsbookName",
      "displayedOddsAmerican",
      "displayedLine",
      "closeOddsAmerican",
      "closeLine",
      "closeState",
      "closeCapturedAt",
      "clvPct",
      "clvResult",
      "normalizedTruthScore",
      "actionState",
      "timingState",
      "confidenceTier",
      "finalOutcome",
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

export async function summarizeOpportunityTimingReplay(args: {
  groupBy: OpportunityTimingReviewSummaryGroup;
  league?: LeagueKey | "ALL";
  since?: Date;
}): Promise<OpportunityTimingReviewSummaryRow[]> {
  if (!hasUsableServerDatabaseUrl()) {
    return [];
  }

  const rows = await loadTimingReviewHistory(args);
  return Array.from(summarizeTimingReviewRows(rows)[args.groupBy]?.values() ?? []).sort(
    (left, right) => right.replayQualified - left.replayQualified || right.surfaced - left.surfaced
  );
}

function buildSummaryMaps(
  rowsByGroup: Partial<Record<OpportunityTimingReviewSummaryGroup, OpportunityTimingReviewSummaryRow[]>>
): SummaryMaps {
  const maps: SummaryMaps = {};
  for (const [groupBy, rows] of Object.entries(rowsByGroup) as Array<
    [OpportunityTimingReviewSummaryGroup, OpportunityTimingReviewSummaryRow[] | undefined]
  >) {
    maps[groupBy] = new Map(rows?.map((row) => [normalizeLabel(row.key), row]) ?? []);
  }
  return maps;
}

function confidenceFromCounts(qualifiedSignals: number, strongestQualified: number) {
  if (qualifiedSignals >= 3 && strongestQualified >= 24) {
    return "HIGH" as OpportunityCloseDestinationConfidence;
  }

  if (qualifiedSignals >= 1 && strongestQualified >= 14) {
    return "MEDIUM" as OpportunityCloseDestinationConfidence;
  }

  return "LOW" as OpportunityCloseDestinationConfidence;
}

function buildNeutralTimingReplay(args: {
  summary?: string;
}): OpportunityTimingReplayView {
  return {
    status: "SKIPPED_NO_HISTORY",
    laneKey: null,
    laneLabel: null,
    bias: "NEUTRAL",
    confidence: "LOW",
    surfaced: 0,
    replayQualified: 0,
    requiredSurfaced: MIN_SURFACED,
    requiredQualified: MIN_REPLAY_QUALIFIED,
    hitNowCorrectPct: null,
    waitWasBetterPct: null,
    edgeDiedFastPct: null,
    averageTimingReviewScore: null,
    averageClvPct: null,
    timingDelta: 0,
    trapEscalation: false,
    summary:
      args.summary ??
      "Timing replay stayed neutral because similar surfaced opportunities do not have enough replay-qualified history yet.",
    reasonCodes: ["TIMING_REPLAY_NEUTRAL"],
    notes: []
  };
}

function pushSummary(
  rows: OpportunityTimingReviewSummaryRow[],
  traces: OpportunityTimingReviewSummaryRow[],
  skipped: OpportunityTimingReviewSummaryRow[]
) {
  for (const row of rows) {
    if (row.surfaced < MIN_SURFACED || row.replayQualified < MIN_REPLAY_QUALIFIED) {
      skipped.push(row);
      continue;
    }

    traces.push(row);
  }
}

export function createOpportunityTimingReplayResolver(args?: {
  rowsByGroup?: Partial<Record<OpportunityTimingReviewSummaryGroup, OpportunityTimingReviewSummaryRow[]>>;
}): OpportunityTimingReplayResolver {
  const maps = buildSummaryMaps(args?.rowsByGroup ?? {});

  return {
    resolve(context) {
      const traces: OpportunityTimingReviewSummaryRow[] = [];
      const skipped: OpportunityTimingReviewSummaryRow[] = [];

      pushSummary(
        [maps.market_path_regime?.get(normalizeLabel(context.marketPathRegime ?? "NO_PATH"))].filter(
          (item): item is OpportunityTimingReviewSummaryRow => Boolean(item)
        ),
        traces,
        skipped
      );
      pushSummary(
        [maps.stale_copy?.get((context.staleCopyConfidence ?? 0) >= 64 ? "stale_copy_present" : "no_stale_copy")].filter(
          (item): item is OpportunityTimingReviewSummaryRow => Boolean(item)
        ),
        traces,
        skipped
      );
      pushSummary(
        [maps.timing?.get(normalizeLabel(context.timingState))].filter(
          (item): item is OpportunityTimingReviewSummaryRow => Boolean(item)
        ),
        traces,
        skipped
      );
      pushSummary(
        [maps.action?.get(normalizeLabel(context.actionState))].filter(
          (item): item is OpportunityTimingReviewSummaryRow => Boolean(item)
        ),
        traces,
        skipped
      );
      pushSummary(
        [maps.confidence?.get(normalizeLabel(context.confidenceTier))].filter(
          (item): item is OpportunityTimingReviewSummaryRow => Boolean(item)
        ),
        traces,
        skipped
      );
      pushSummary(
        context.reasonLanes
          .map((lane) => maps.reason_lane?.get(normalizeLabel(lane.key)) ?? null)
          .filter((item): item is OpportunityTimingReviewSummaryRow => Boolean(item)),
        traces,
        skipped
      );

      if (!traces.length) {
        return buildNeutralTimingReplay({
          summary:
            skipped.length > 0
              ? `Timing replay skipped: similar lanes have not cleared the ${MIN_SURFACED}/${MIN_REPLAY_QUALIFIED} surfaced/replay gate yet.`
              : undefined
        });
      }

      const surfaced = traces.reduce((total, row) => total + row.surfaced, 0);
      const replayQualified = traces.reduce((total, row) => total + row.replayQualified, 0);
      const hitNowCorrectPct = round(
        traces.reduce(
          (total, row) => total + (row.replayQualified ? (row.hitNowCorrect / row.replayQualified) * 100 : 0),
          0
        ) / traces.length,
        1
      );
      const waitWasBetterPct = round(
        traces.reduce(
          (total, row) => total + (row.replayQualified ? (row.waitWasBetter / row.replayQualified) * 100 : 0),
          0
        ) / traces.length,
        1
      );
      const edgeDiedFastPct = round(
        traces.reduce(
          (total, row) => total + (row.replayQualified ? (row.edgeDiedFast / row.replayQualified) * 100 : 0),
          0
        ) / traces.length,
        1
      );
      const staleCopyCapturePct = round(
        traces.reduce(
          (total, row) =>
            total + (row.replayQualified ? (row.staleCopyCaptureWindow / row.replayQualified) * 100 : 0),
          0
        ) / traces.length,
        1
      );
      const averageTimingReviewScore = round(
        traces.reduce((total, row) => total + (row.averageTimingReviewScore ?? 0), 0) / traces.length,
        2
      );
      const averageClvPct = round(
        traces.reduce((total, row) => total + (row.averageClvPct ?? 0), 0) / traces.length,
        3
      );

      let bias: OpportunityTimingReplayBias = "NEUTRAL";
      let timingDelta = 0;
      const reasonCodes: string[] = [];

      if (
        context.actionState === "WATCH" &&
        edgeDiedFastPct >= 24 &&
        hitNowCorrectPct >= 42
      ) {
        bias = "DEMOTE_WATCH";
        timingDelta = 4;
        reasonCodes.push("WATCH_MISSES_WINDOW");
      } else if (waitWasBetterPct >= 44 && hitNowCorrectPct <= 34) {
        bias = "STRENGTHEN_WAIT";
        timingDelta = -4;
        reasonCodes.push("WAIT_LANE_VALIDATED");
      } else if (
        hitNowCorrectPct >= 46 ||
        edgeDiedFastPct >= 28 ||
        staleCopyCapturePct >= 16
      ) {
        bias = "STRENGTHEN_BET_NOW";
        timingDelta = 3;
        reasonCodes.push(
          staleCopyCapturePct >= 16 ? "STALE_COPY_REPLAY_SUPPORT" : "BET_NOW_LANE_VALIDATED"
        );
      }

      const strongestQualified = Math.max(...traces.map((row) => row.replayQualified));
      const confidence = confidenceFromCounts(traces.length, strongestQualified);
      const status: OpportunityTimingReplayStatus =
        confidence === "LOW" && bias === "NEUTRAL"
          ? "SKIPPED_LOW_CONFIDENCE"
          : "APPLIED";

      return {
        status,
        laneKey: traces[0]?.key ?? null,
        laneLabel: traces[0]?.label ?? null,
        bias,
        confidence,
        surfaced,
        replayQualified,
        requiredSurfaced: MIN_SURFACED,
        requiredQualified: MIN_REPLAY_QUALIFIED,
        hitNowCorrectPct,
        waitWasBetterPct,
        edgeDiedFastPct,
        averageTimingReviewScore,
        averageClvPct,
        timingDelta,
        trapEscalation: bias === "DEMOTE_WATCH" && confidence !== "LOW",
        summary:
          status === "APPLIED"
            ? bias === "STRENGTHEN_WAIT"
              ? `Replay truth supports waiting: similar lanes improved ${waitWasBetterPct}% of the time.`
              : bias === "DEMOTE_WATCH"
                ? `Replay truth says watch misses the window here: similar lanes died fast ${edgeDiedFastPct}% of the time.`
                : bias === "STRENGTHEN_BET_NOW"
                  ? `Replay truth supports immediate action: similar lanes beat close quickly.`
                  : "Replay truth stayed near neutral."
            : `Timing replay stayed conservative because replay confidence is still limited in this lane.`,
        reasonCodes: reasonCodes.length ? reasonCodes : ["TIMING_REPLAY_NEUTRAL"],
        notes: traces.slice(0, 3).map(
          (row) => `${row.label}: ${row.replayQualified} replay-qualified samples.`
        )
      };
    }
  };
}

export async function getOpportunityTimingReplayResolver(args: {
  league?: LeagueKey | "ALL";
  since?: Date;
} = {}): Promise<OpportunityTimingReplayResolver> {
  if (!hasUsableServerDatabaseUrl()) {
    return createOpportunityTimingReplayResolver();
  }

  try {
    const rows = await loadTimingReviewHistory(args);
    const maps = summarizeTimingReviewRows(rows);
    const rowsByGroup: Partial<Record<OpportunityTimingReviewSummaryGroup, OpportunityTimingReviewSummaryRow[]>> = {};
    for (const [groupBy, map] of Object.entries(maps) as Array<
      [OpportunityTimingReviewSummaryGroup, Map<string, OpportunityTimingReviewSummaryRow> | undefined]
    >) {
      rowsByGroup[groupBy] = Array.from(map?.values() ?? []);
    }

    return createOpportunityTimingReplayResolver({ rowsByGroup });
  } catch {
    return createOpportunityTimingReplayResolver();
  }
}
