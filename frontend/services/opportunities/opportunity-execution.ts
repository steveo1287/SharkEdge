import { Prisma } from "@prisma/client";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type {
  OpportunityDecisionSnapshotView,
  OpportunityExecutionContextView,
  OpportunityTimingCorrectness,
  OpportunityView
} from "@/lib/types/opportunity";
import { computeClvDelta } from "@/services/opportunities/opportunity-clv-service";
import { DEFAULT_USER_ID } from "@/services/account/user-service";

type ExecutionEntry = {
  id: string;
  eventId: string | null;
  marketType: string;
  selection: string;
  oddsAmerican: number;
  line: number | null;
  closingOddsAmerican: number | null;
  closingLine: number | null;
  placedAt: string;
  settledAt: string | null;
  sportsbookKey: string | null;
  sportsbookName: string | null;
};

type SurfaceRecord = {
  surfaceKey: string;
  eventId: string;
  marketType: string;
  selection: string;
  surfaceContext: string;
  surfacedAt: string;
  displayedOddsAmerican: number | null;
  displayedLine: number | null;
  closeOddsAmerican: number | null;
  closeLine: number | null;
  metadataJson: unknown;
};

type ExecutionMatch = {
  entry: ExecutionEntry;
  surfaceRecord: SurfaceRecord | null;
};

export type OpportunityExecutionSurfaceRecord = SurfaceRecord;

export type OpportunityExecutionResolver = {
  resolve: (opportunity: OpportunityView) => OpportunityExecutionContextView | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function favorableOddsDelta(benchmark: number | null, actual: number | null) {
  if (typeof benchmark !== "number" || typeof actual !== "number") {
    return null;
  }

  return benchmark - actual;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length ? value : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function asReasonLaneArray(value: unknown): OpportunityDecisionSnapshotView["reasonLanes"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const lane = asObject(item);
      const key = asString(lane?.key);
      const category = asString(lane?.category);
      const label = asString(lane?.label);
      const description = asString(lane?.description);
      if (!key || !category || !label || !description) {
        return null;
      }

      return {
        key,
        category: category as OpportunityDecisionSnapshotView["reasonLanes"][number]["category"],
        label,
        description
      };
    })
    .filter(
      (
        item
      ): item is OpportunityDecisionSnapshotView["reasonLanes"][number] => Boolean(item)
    );
}

function buildFallbackDecisionSnapshot(
  surfaceRecord: SurfaceRecord
): OpportunityDecisionSnapshotView {
  const metadata = asObject(surfaceRecord.metadataJson);
  const marketPath = asObject(metadata?.marketPath);
  return {
    surfaceKey: surfaceRecord.surfaceKey,
    surfaceContext: surfaceRecord.surfaceContext,
    surfacedAt: surfaceRecord.surfacedAt,
    displayedOddsAmerican: surfaceRecord.displayedOddsAmerican,
    displayedLine: surfaceRecord.displayedLine,
    bestAvailableOddsAmerican: surfaceRecord.displayedOddsAmerican,
    bestAvailableLine: surfaceRecord.displayedLine,
    bestPriceTiedSportsbookKeys: [],
    bestPriceTiedSportsbookNames: [],
    marketPathRegime:
      (asString(marketPath?.regime) as OpportunityDecisionSnapshotView["marketPathRegime"]) ??
      "NO_PATH",
    leaderCandidates: [],
    confirmerBooks: [],
    followerBooks: [],
    laggingBooks: asStringArray(marketPath?.laggingBooks),
    outlierBooks: [],
    offeredBookRole: "UNCLASSIFIED",
    staleCopyConfidence: asNumber(marketPath?.staleCopyConfidence),
    confirmationCount: asNumber(marketPath?.confirmationCount),
    confirmationQuality: null,
    leaderFollowerConfidence: null,
    moveCoherenceScore: null,
    synchronizationState: null,
    providerFreshnessMinutes: null,
    sourceHealthState: "HEALTHY" as OpportunityDecisionSnapshotView["sourceHealthState"],
    actionState: "WATCH",
    timingState: "MONITOR_ONLY",
    opportunityScore: 0,
    confidenceTier: "C",
    recommendedStake: null,
    bankrollPct: null,
    capitalPriorityScore: null,
    reasonLanes: [],
    closeDestinationLabel: null,
    closeDestinationConfidence: null,
    executionCapacityLabel: null,
    executionCapacityConfidence: null,
    executionCapacityScore: null
  };
}

export function parseStoredOpportunityDecisionSnapshot(
  surfaceRecord: SurfaceRecord | null
): OpportunityDecisionSnapshotView | null {
  if (!surfaceRecord) {
    return null;
  }

  const metadata = asObject(surfaceRecord.metadataJson);
  const snapshot = asObject(metadata?.executionSnapshot);
  if (!snapshot) {
    return buildFallbackDecisionSnapshot(surfaceRecord);
  }

  return {
    surfaceKey: asString(snapshot.surfaceKey) ?? surfaceRecord.surfaceKey,
    surfaceContext: asString(snapshot.surfaceContext) ?? surfaceRecord.surfaceContext,
    surfacedAt: asString(snapshot.surfacedAt) ?? surfaceRecord.surfacedAt,
    displayedOddsAmerican:
      asNumber(snapshot.displayedOddsAmerican) ?? surfaceRecord.displayedOddsAmerican,
    displayedLine: asNumber(snapshot.displayedLine) ?? surfaceRecord.displayedLine,
    bestAvailableOddsAmerican:
      asNumber(snapshot.bestAvailableOddsAmerican) ?? surfaceRecord.displayedOddsAmerican,
    bestAvailableLine:
      asNumber(snapshot.bestAvailableLine) ?? surfaceRecord.displayedLine,
    bestPriceTiedSportsbookKeys: asStringArray(snapshot.bestPriceTiedSportsbookKeys),
    bestPriceTiedSportsbookNames: asStringArray(snapshot.bestPriceTiedSportsbookNames),
    marketPathRegime:
      (asString(snapshot.marketPathRegime) as OpportunityDecisionSnapshotView["marketPathRegime"]) ??
      "NO_PATH",
    leaderCandidates: asStringArray(snapshot.leaderCandidates),
    confirmerBooks: asStringArray(snapshot.confirmerBooks),
    followerBooks: asStringArray(snapshot.followerBooks),
    laggingBooks: asStringArray(snapshot.laggingBooks),
    outlierBooks: asStringArray(snapshot.outlierBooks),
    offeredBookRole:
      (asString(snapshot.offeredBookRole) as OpportunityDecisionSnapshotView["offeredBookRole"]) ??
      "UNCLASSIFIED",
    staleCopyConfidence: asNumber(snapshot.staleCopyConfidence),
    confirmationCount: asNumber(snapshot.confirmationCount),
    confirmationQuality: asNumber(snapshot.confirmationQuality),
    leaderFollowerConfidence: asNumber(snapshot.leaderFollowerConfidence),
    moveCoherenceScore: asNumber(snapshot.moveCoherenceScore),
    synchronizationState:
      (asString(snapshot.synchronizationState) as OpportunityDecisionSnapshotView["synchronizationState"]) ??
      null,
    providerFreshnessMinutes: asNumber(snapshot.providerFreshnessMinutes),
    sourceHealthState:
      (asString(snapshot.sourceHealthState) as OpportunityDecisionSnapshotView["sourceHealthState"]) ??
      "HEALTHY",
    actionState: (asString(snapshot.actionState) as OpportunityDecisionSnapshotView["actionState"]) ?? "WATCH",
    timingState: (asString(snapshot.timingState) as OpportunityDecisionSnapshotView["timingState"]) ?? "MONITOR_ONLY",
    opportunityScore: asNumber(snapshot.opportunityScore) ?? 0,
    confidenceTier: (asString(snapshot.confidenceTier) as OpportunityDecisionSnapshotView["confidenceTier"]) ?? "C",
    recommendedStake: asNumber(snapshot.recommendedStake),
    bankrollPct: asNumber(snapshot.bankrollPct),
    capitalPriorityScore: asNumber(snapshot.capitalPriorityScore),
    reasonLanes: asReasonLaneArray(snapshot.reasonLanes),
    closeDestinationLabel:
      (asString(snapshot.closeDestinationLabel) as OpportunityDecisionSnapshotView["closeDestinationLabel"]) ??
      null,
    closeDestinationConfidence:
      (asString(snapshot.closeDestinationConfidence) as OpportunityDecisionSnapshotView["closeDestinationConfidence"]) ??
      null,
    executionCapacityLabel:
      (asString(snapshot.executionCapacityLabel) as OpportunityDecisionSnapshotView["executionCapacityLabel"]) ??
      null,
    executionCapacityConfidence:
      (asString(snapshot.executionCapacityConfidence) as OpportunityDecisionSnapshotView["executionCapacityConfidence"]) ??
      null,
    executionCapacityScore: asNumber(snapshot.executionCapacityScore)
  };
}

function selectSurfaceRecord(records: SurfaceRecord[], placedAt: string) {
  if (!records.length) {
    return null;
  }

  const placedAtMs = new Date(placedAt).getTime();
  if (!Number.isFinite(placedAtMs)) {
    return records[0] ?? null;
  }

  const before = records
    .filter((record) => new Date(record.surfacedAt).getTime() <= placedAtMs + 5 * 60_000)
    .sort(
      (left, right) =>
        new Date(right.surfacedAt).getTime() - new Date(left.surfacedAt).getTime()
    );

  if (before.length) {
    return before[0];
  }

  const nearest = [...records].sort((left, right) => {
    const leftDelta = Math.abs(new Date(left.surfacedAt).getTime() - placedAtMs);
    const rightDelta = Math.abs(new Date(right.surfacedAt).getTime() - placedAtMs);
    return leftDelta - rightDelta;
  })[0];

  if (!nearest) {
    return null;
  }

  const nearestDelta = Math.abs(new Date(nearest.surfacedAt).getTime() - placedAtMs);
  return nearestDelta <= 6 * 60 * 60_000 ? nearest : null;
}

function buildTimingCorrectness(args: {
  clvPct: number | null;
  slippageAmerican: number | null;
  staleCopyExpected: boolean;
  shouldHaveWaited: boolean;
  shouldHaveHitNow: boolean;
}): OpportunityTimingCorrectness {
  if (args.staleCopyExpected && typeof args.slippageAmerican === "number" && args.slippageAmerican >= 8) {
    return "MISSED";
  }

  if (args.shouldHaveWaited && typeof args.slippageAmerican === "number") {
    if (args.slippageAmerican <= -4) {
      return "CORRECT";
    }

    if (args.slippageAmerican >= 6) {
      return "MISSED";
    }
  }

  if (args.shouldHaveHitNow && typeof args.slippageAmerican === "number") {
    if (args.slippageAmerican <= 1) {
      return "CORRECT";
    }

    if (args.slippageAmerican >= 6) {
      return args.staleCopyExpected ? "MISSED" : "LATE";
    }
  }

  if (typeof args.clvPct !== "number") {
    return "UNKNOWN";
  }

  if (args.clvPct >= 1) {
    return "CORRECT";
  }

  if (args.clvPct <= -1.25) {
    return args.shouldHaveWaited ? "CORRECT" : "EARLY";
  }

  if (typeof args.slippageAmerican === "number" && args.slippageAmerican >= 6) {
    return "LATE";
  }

  return "UNKNOWN";
}

function buildClassification(score: number) {
  if (score >= 82) {
    return {
      classification: "EXCELLENT_ENTRY" as const,
      entryQualityLabel: "Excellent entry"
    };
  }

  if (score >= 60) {
    return {
      classification: "ACCEPTABLE" as const,
      entryQualityLabel: "Acceptable execution"
    };
  }

  if (score >= 40) {
    return {
      classification: "POOR_ENTRY" as const,
      entryQualityLabel: "Poor execution"
    };
  }

  return {
    classification: "MISSED_OPPORTUNITY" as const,
    entryQualityLabel: "Missed opportunity"
  };
}

export function buildExecutionQualityAssessment(args: {
  decisionSurfaceKey?: string | null;
  decisionSnapshot?: OpportunityDecisionSnapshotView | null;
  bestAvailableOddsAmerican?: number | null;
  bestAvailableLine?: number | null;
  actualOddsAmerican?: number | null;
  actualLine?: number | null;
  closingOddsAmerican?: number | null;
  closingLine?: number | null;
  marketType: string;
  selectionLabel: string;
  placedAt?: string | Date | null;
  settledAt?: string | Date | null;
  staleCopyExpected?: boolean;
}): OpportunityExecutionContextView {
  const actualOddsAmerican = args.actualOddsAmerican ?? null;
  const decisionSnapshot = args.decisionSnapshot ?? null;
  const decisionSnapshotUsed = decisionSnapshot !== null;
  const bestAvailableOddsAmerican =
    decisionSnapshot?.bestAvailableOddsAmerican ?? args.bestAvailableOddsAmerican ?? null;
  const bestAvailableLine =
    decisionSnapshot?.bestAvailableLine ?? args.bestAvailableLine ?? null;
  const slippageAmerican = favorableOddsDelta(bestAvailableOddsAmerican, actualOddsAmerican);
  const slippageVsCloseAmerican = favorableOddsDelta(
    args.closingOddsAmerican ?? null,
    actualOddsAmerican
  );
  const truth = computeClvDelta({
    entryOddsAmerican: actualOddsAmerican,
    closeOddsAmerican: args.closingOddsAmerican ?? null,
    entryLine: args.actualLine ?? null,
    closeLine: args.closingLine ?? null,
    marketType: args.marketType,
    selectionLabel: args.selectionLabel
  });

  const placedAt =
    typeof args.placedAt === "string"
      ? new Date(args.placedAt)
      : args.placedAt ?? null;
  const settledAt =
    typeof args.settledAt === "string"
      ? new Date(args.settledAt)
      : args.settledAt ?? null;
  const timeToCloseMinutes =
    placedAt instanceof Date &&
    settledAt instanceof Date &&
    Number.isFinite(placedAt.getTime()) &&
    Number.isFinite(settledAt.getTime())
      ? Math.max(0, Math.round((settledAt.getTime() - placedAt.getTime()) / 60_000))
      : null;

  const staleCopyExpected =
    args.staleCopyExpected === true ||
    ((decisionSnapshot?.marketPathRegime === "STALE_COPY" || false) &&
      (decisionSnapshot?.staleCopyConfidence ?? 0) >= 64);
  const shouldHaveWaited =
    decisionSnapshot?.actionState === "WAIT" ||
    decisionSnapshot?.timingState === "WAIT_FOR_PULLBACK" ||
    decisionSnapshot?.timingState === "WAIT_FOR_CONFIRMATION";
  const shouldHaveHitNow =
    decisionSnapshot?.actionState === "BET_NOW" || staleCopyExpected;
  const staleCopyCaptured =
    staleCopyExpected && typeof slippageAmerican === "number"
      ? slippageAmerican <= 0
      : null;
  const timingCorrectness = buildTimingCorrectness({
    clvPct: truth.clvPct,
    slippageAmerican,
    staleCopyExpected,
    shouldHaveWaited,
    shouldHaveHitNow
  });

  let executionScore = 55;
  const reasons: string[] = [];
  const reasonCodes: string[] = [];

  if (decisionSnapshotUsed) {
    executionScore += 4;
    reasonCodes.push("USED_DECISION_SNAPSHOT");
    reasons.push("Execution was judged against the stored decision-time market snapshot.");
  } else if (bestAvailableOddsAmerican !== null || bestAvailableLine !== null) {
    reasonCodes.push("FALLBACK_CURRENT_DISPLAY_CONTEXT");
    reasons.push("Decision-time snapshot was unavailable, so the benchmark falls back to the visible screen.");
  }

  if (typeof slippageAmerican === "number") {
    if (slippageAmerican > 0) {
      executionScore -= clamp(slippageAmerican * 1.4, 0, 32);
      reasonCodes.push("DECISION_TIME_SLIPPAGE");
      reasons.push(`Entry gave up ${slippageAmerican > 0 ? "+" : ""}${slippageAmerican} cents versus the stored best screen.`);
    } else if (slippageAmerican < 0) {
      executionScore += clamp(Math.abs(slippageAmerican) * 0.45, 0, 10);
      reasonCodes.push("BEAT_DECISION_SCREEN");
      reasons.push(`Entry improved on the stored screen by ${Math.abs(slippageAmerican)} cents.`);
    }
  }

  if (typeof truth.clvPct === "number") {
    executionScore += clamp(truth.clvPct * 3.2, -24, 24);
    if (truth.clvPct >= 0) {
      reasonCodes.push("BEAT_CLOSE");
      reasons.push(`Entry beat the close by ${truth.clvPct.toFixed(2)}% CLV.`);
    } else {
      reasonCodes.push("LOST_CLOSE");
      reasons.push(`Close beat entry by ${Math.abs(truth.clvPct).toFixed(2)}% CLV.`);
    }
  }

  if (staleCopyCaptured === true) {
    executionScore += 10;
    reasonCodes.push("STALE_COPY_CAPTURED");
    reasons.push("Captured the stale-copy window before the board fully repriced.");
  } else if (staleCopyExpected && staleCopyCaptured === false) {
    executionScore -= 12;
    reasonCodes.push("STALE_COPY_MISSED");
    reasons.push("Stale-copy window was visible, but the entry missed it.");
  }

  if (timingCorrectness === "CORRECT") {
    executionScore += 6;
    reasonCodes.push(shouldHaveWaited ? "WAIT_WAS_CORRECT" : "HIT_NOW_WAS_CORRECT");
  } else if (timingCorrectness === "EARLY") {
    executionScore -= 6;
    reasonCodes.push("SHOULD_HAVE_WAITED");
    reasons.push("Waiting would likely have improved the entry.");
  } else if (timingCorrectness === "LATE") {
    executionScore -= 8;
    reasonCodes.push("SHOULD_HAVE_HIT_NOW");
    reasons.push("The number should have been hit earlier instead of letting it drift.");
  } else if (timingCorrectness === "MISSED") {
    executionScore -= 14;
    reasonCodes.push("MISSED_EXECUTION_WINDOW");
  }

  executionScore = Math.round(clamp(executionScore, 0, 100));
  const { classification, entryQualityLabel } = buildClassification(executionScore);

  return {
    status: "HISTORICAL",
    classification,
    executionScore,
    entryQualityLabel,
    surfaceKey: args.decisionSurfaceKey ?? decisionSnapshot?.surfaceKey ?? null,
    decisionSnapshotUsed,
    decisionSnapshot,
    bestAvailableOddsAmerican,
    bestAvailableLine,
    actualOddsAmerican,
    actualLine: args.actualLine ?? null,
    closingOddsAmerican: args.closingOddsAmerican ?? null,
    closingLine: args.closingLine ?? null,
    slippageAmerican,
    slippageVsCloseAmerican,
    clvPct: truth.clvPct,
    timeToCloseMinutes,
    staleCopyCaptured,
    missedEdge:
      (typeof slippageAmerican === "number" && slippageAmerican >= 8) ||
      classification === "MISSED_OPPORTUNITY",
    timingCorrectness,
    reasonCodes,
    reasons: reasons.slice(0, 4)
  };
}

export function createOpportunityExecutionResolver(args?: {
  entries?: ExecutionEntry[];
  surfaceRecords?: SurfaceRecord[];
}): OpportunityExecutionResolver {
  const entries = args?.entries ?? [];
  const surfaceRecords = args?.surfaceRecords ?? [];
  const byExactKey = new Map<string, ExecutionMatch>();
  const surfaceRecordsByKey = new Map<string, SurfaceRecord[]>();

  for (const surfaceRecord of surfaceRecords) {
    const key = [
      surfaceRecord.eventId ?? "",
      normalizeLabel(surfaceRecord.marketType),
      normalizeLabel(surfaceRecord.selection)
    ].join("|");

    const next = surfaceRecordsByKey.get(key) ?? [];
    next.push(surfaceRecord);
    surfaceRecordsByKey.set(key, next);
  }

  for (const records of surfaceRecordsByKey.values()) {
    records.sort(
      (left, right) =>
        new Date(right.surfacedAt).getTime() - new Date(left.surfacedAt).getTime()
    );
  }

  for (const entry of entries) {
    const key = [
      entry.eventId ?? "",
      normalizeLabel(entry.marketType),
      normalizeLabel(entry.selection)
    ].join("|");
    const surfaceRecord = selectSurfaceRecord(surfaceRecordsByKey.get(key) ?? [], entry.placedAt);

    const existing = byExactKey.get(key);
    if (!existing) {
      byExactKey.set(key, {
        entry,
        surfaceRecord
      });
      continue;
    }

    if (new Date(entry.placedAt).getTime() > new Date(existing.entry.placedAt).getTime()) {
      byExactKey.set(key, {
        entry,
        surfaceRecord
      });
    }
  }

  return {
    resolve(opportunity) {
      const key = [
        opportunity.eventId ?? "",
        normalizeLabel(opportunity.marketType),
        normalizeLabel(opportunity.selectionLabel)
      ].join("|");
      const match = byExactKey.get(key);

      if (!match) {
        return null;
      }

      const decisionSnapshot = parseStoredOpportunityDecisionSnapshot(match.surfaceRecord);

      return buildExecutionQualityAssessment({
        decisionSurfaceKey: match.surfaceRecord?.surfaceKey ?? null,
        decisionSnapshot,
        bestAvailableOddsAmerican: opportunity.displayOddsAmerican,
        bestAvailableLine:
          typeof opportunity.displayLine === "number" ? opportunity.displayLine : null,
        actualOddsAmerican: match.entry.oddsAmerican,
        actualLine: match.entry.line,
        closingOddsAmerican:
          match.entry.closingOddsAmerican ?? match.surfaceRecord?.closeOddsAmerican ?? null,
        closingLine: match.entry.closingLine ?? match.surfaceRecord?.closeLine ?? null,
        marketType: opportunity.marketType,
        selectionLabel: opportunity.selectionLabel,
        placedAt: match.entry.placedAt,
        settledAt: match.entry.settledAt,
        staleCopyExpected:
          opportunity.marketMicrostructure.status === "APPLIED" &&
          opportunity.marketMicrostructure.regime === "STALE_COPY"
      });
    }
  };
}

export async function getOpportunityExecutionResolver(): Promise<OpportunityExecutionResolver> {
  if (!hasUsableServerDatabaseUrl()) {
    return createOpportunityExecutionResolver();
  }

  try {
    type DbBetRow = {
      id: string;
      eventId: string | null;
      marketType: string;
      selection: string;
      oddsAmerican: number;
      line: number | null;
      closingOddsAmerican: number | null;
      closingLine: number | null;
      placedAt: Date;
      settledAt: Date | null;
      sportsbook: {
        key: string;
        name: string;
      } | null;
    };

    const [bets, surfaceRecords] = await Promise.all([
      prisma.bet.findMany({
        where: {
          userId: DEFAULT_USER_ID,
          archivedAt: null
        },
        select: {
          id: true,
          eventId: true,
          marketType: true,
          selection: true,
          oddsAmerican: true,
          line: true,
          closingOddsAmerican: true,
          closingLine: true,
          placedAt: true,
          settledAt: true,
          sportsbook: {
            select: {
              key: true,
              name: true
            }
          }
        },
        orderBy: {
          placedAt: "desc"
        },
        take: 250
      }),
      prisma.$queryRaw<
        Array<{
          surfaceKey: string;
          eventId: string;
          marketType: string;
          selection: string;
          surfaceContext: string;
          surfacedAt: Date;
          displayedOddsAmerican: number | null;
          displayedLine: number | null;
          closeOddsAmerican: number | null;
          closeLine: number | null;
          metadataJson: Prisma.JsonValue | null;
        }>
      >`
        SELECT
          "surfaceKey",
          "eventId",
          "marketType",
          "selection",
          "surfaceContext",
          "surfacedAt",
          "displayedOddsAmerican",
          "displayedLine",
          "closeOddsAmerican",
          "closeLine",
          "metadataJson"
        FROM "opportunity_surface_records"
        ORDER BY "surfacedAt" DESC
        LIMIT 800
      `
    ]);

    return createOpportunityExecutionResolver({
      entries: (bets as DbBetRow[]).map((bet) => ({
        id: bet.id,
        eventId: bet.eventId,
        marketType: bet.marketType,
        selection: bet.selection,
        oddsAmerican: bet.oddsAmerican,
        line: bet.line,
        closingOddsAmerican: bet.closingOddsAmerican,
        closingLine: bet.closingLine,
        placedAt: bet.placedAt.toISOString(),
        settledAt: bet.settledAt?.toISOString() ?? null,
        sportsbookKey: bet.sportsbook?.key ?? null,
        sportsbookName: bet.sportsbook?.name ?? null
      })),
      surfaceRecords: surfaceRecords.map((record) => ({
        surfaceKey: record.surfaceKey,
        eventId: record.eventId,
        marketType: record.marketType,
        selection: record.selection,
        surfaceContext: record.surfaceContext,
        surfacedAt: record.surfacedAt.toISOString(),
        displayedOddsAmerican: record.displayedOddsAmerican,
        displayedLine: record.displayedLine,
        closeOddsAmerican: record.closeOddsAmerican,
        closeLine: record.closeLine,
        metadataJson: record.metadataJson
      }))
    });
  } catch {
    return createOpportunityExecutionResolver();
  }
}
