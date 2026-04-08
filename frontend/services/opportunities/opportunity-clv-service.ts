import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { LeagueKey } from "@/lib/types/domain";
import type { OpportunityView } from "@/lib/types/opportunity";

export type OpportunitySurfaceContext =
  | "home_command"
  | "matchup_for_you"
  | "board"
  | "props"
  | "watchlist"
  | "unknown";

export type OpportunitySurfaceRank = "PRIMARY" | "SECONDARY" | "SUPPORTING";

export type OpportunityCloseState = "UNRESOLVED" | "AVAILABLE" | "UNAVAILABLE";

export type OpportunityClvResult =
  | "BEAT_CLOSE"
  | "LOST_CLOSE"
  | "PUSH_CLOSE"
  | "NO_CLOSE_DATA";

export type TruthSummaryGroup =
  | "league"
  | "market"
  | "sportsbook"
  | "timing"
  | "action"
  | "confidence"
  | "trap_flag"
  | "source_health";

export type RecordSurfacedOpportunityInput = {
  opportunity: OpportunityView;
  surfaceContext: OpportunitySurfaceContext;
  surfaceRank?: OpportunitySurfaceRank;
  isPrimarySurface?: boolean;
  surfacedAt?: Date;
  surfaceWindowMinutes?: number;
  metadata?: Record<string, unknown>;
};

export type RecordSurfacedOpportunitiesOptions = {
  metadata?: Record<string, unknown>;
  primaryCount?: number;
  surfaceWindowMinutes?: number;
};

export type UpdateOpportunityCloseInput = {
  surfaceKey: string;
  closeOddsAmerican?: number | null;
  closeLine?: number | null;
  closeCapturedAt?: Date;
  closeSportsbookKey?: string | null;
  closeSportsbookName?: string | null;
  closeSource?: string | null;
};

export type MarkOpportunityCloseUnavailableInput = {
  surfaceKey: string;
  reason: string;
  capturedAt?: Date;
  closeSource?: string | null;
};

export type UpdateOpportunityOutcomeInput = {
  surfaceKey: string;
  finalOutcome: "WIN" | "LOSS" | "PUSH" | "VOID" | "UNKNOWN";
  capturedAt?: Date;
};

export type OpportunityTruthMetrics = {
  oddsDeltaAmerican: number | null;
  lineDelta: number | null;
  clvPct: number | null;
  clvResult: OpportunityClvResult;
  closeBeatEntry: boolean | null;
  entryBeatCloseMaterially: boolean | null;
  normalizedTruthScore: number | null;
};

export type TruthCalibrationSummaryRow = {
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
  averageLineDelta: number | null;
  averageTruthScore: number | null;
  averageSurfaceScore: number | null;
  averageExpectedValuePct: number | null;
};

export type CalibrationSampleState = "INSUFFICIENT_SAMPLE" | "QUALIFIED";

export type TruthCalibrationFeedback = {
  sampleState: CalibrationSampleState;
  label: string;
  groupBy: TruthSummaryGroup;
  surfaced: number;
  closed: number;
  beatClosePct: number | null;
  averageTruthScore: number | null;
  scoringNudge: number;
  sportsbookWeightNudge: number;
  timingConfidenceNudge: number;
  trapEscalation: boolean;
  note: string;
};

type OpportunitySurfaceRecordRow = {
  surfaceKey: string;
  marketType: string;
  selection: string;
  displayedOddsAmerican: number | null;
  displayedLine: number | null;
};

const DEFAULT_SURFACE_WINDOW_MINUTES = 15;
const MATERIAL_ODDS_CLV_PCT = 1;
const MATERIAL_LINE_CLV = 0.25;
export const TRUTH_CALIBRATION_MIN_SURFACED = 40;
export const TRUTH_CALIBRATION_MIN_CLOSED = 20;

function toJsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toNumericLine(value: OpportunityView["displayLine"]) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function toDisplayLineLabel(value: OpportunityView["displayLine"]) {
  if (typeof value === "number") {
    return String(value);
  }

  return typeof value === "string" && value.trim().length ? value.trim() : null;
}

function toDecimalOdds(american: number | null | undefined) {
  if (typeof american !== "number" || american === 0) {
    return null;
  }

  return american > 0 ? american / 100 + 1 : 100 / Math.abs(american) + 1;
}

function inferLineDirection(args: {
  marketType: string;
  selectionLabel: string;
}) {
  const market = args.marketType.toLowerCase();
  const selection = args.selectionLabel.toLowerCase();

  if (selection.includes("under") || /\bu\s*\d/.test(selection)) {
    return "UNDER" as const;
  }

  if (selection.includes("over") || /\bo\s*\d/.test(selection)) {
    return "OVER" as const;
  }

  if (market === "total" || market.includes("total")) {
    return "UNKNOWN_TOTAL" as const;
  }

  return "SPREAD_OR_SIDE" as const;
}

function computeEntryPerspectiveLineDelta(args: {
  marketType: string;
  selectionLabel: string;
  entryLine?: number | null;
  closeLine?: number | null;
}) {
  if (typeof args.entryLine !== "number" || typeof args.closeLine !== "number") {
    return null;
  }

  const direction = inferLineDirection({
    marketType: args.marketType,
    selectionLabel: args.selectionLabel
  });

  if (direction === "OVER") {
    return Number((args.closeLine - args.entryLine).toFixed(3));
  }

  if (direction === "UNDER" || direction === "SPREAD_OR_SIDE") {
    return Number((args.entryLine - args.closeLine).toFixed(3));
  }

  return Number((args.closeLine - args.entryLine).toFixed(3));
}

export function computeOpportunityTruthMetrics(args: {
  marketType: string;
  selectionLabel: string;
  entryOddsAmerican?: number | null;
  closeOddsAmerican?: number | null;
  entryLine?: number | null;
  closeLine?: number | null;
}): OpportunityTruthMetrics {
  const entryDecimal = toDecimalOdds(args.entryOddsAmerican);
  const closeDecimal = toDecimalOdds(args.closeOddsAmerican);
  const clvPct =
    entryDecimal !== null && closeDecimal !== null
      ? Number(((entryDecimal / closeDecimal - 1) * 100).toFixed(3))
      : null;
  const oddsDeltaAmerican =
    typeof args.entryOddsAmerican === "number" &&
    typeof args.closeOddsAmerican === "number"
      ? args.entryOddsAmerican - args.closeOddsAmerican
      : null;
  const lineDelta = computeEntryPerspectiveLineDelta({
    marketType: args.marketType,
    selectionLabel: args.selectionLabel,
    entryLine: args.entryLine,
    closeLine: args.closeLine
  });

  if (clvPct === null && lineDelta === null) {
    return {
      oddsDeltaAmerican,
      lineDelta,
      clvPct,
      clvResult: "NO_CLOSE_DATA",
      closeBeatEntry: null,
      entryBeatCloseMaterially: null,
      normalizedTruthScore: null
    };
  }

  const normalizedTruthScore = Number(
    clamp((clvPct ?? 0) + (lineDelta ?? 0) * 3, -100, 100).toFixed(3)
  );
  const clvResult =
    Math.abs(normalizedTruthScore) <= 0.15
      ? "PUSH_CLOSE"
      : normalizedTruthScore > 0
        ? "BEAT_CLOSE"
        : "LOST_CLOSE";
  const entryBeatCloseMaterially =
    clvResult === "BEAT_CLOSE" &&
    ((clvPct !== null && clvPct >= MATERIAL_ODDS_CLV_PCT) ||
      (lineDelta !== null && lineDelta >= MATERIAL_LINE_CLV) ||
      normalizedTruthScore >= 1);

  return {
    oddsDeltaAmerican,
    lineDelta,
    clvPct,
    clvResult,
    closeBeatEntry: clvResult === "LOST_CLOSE",
    entryBeatCloseMaterially,
    normalizedTruthScore
  };
}

export function computeClvDelta(args: {
  entryOddsAmerican?: number | null;
  closeOddsAmerican?: number | null;
  entryLine?: number | null;
  closeLine?: number | null;
  marketType?: string;
  selectionLabel?: string;
}) {
  return computeOpportunityTruthMetrics({
    marketType: args.marketType ?? "moneyline",
    selectionLabel: args.selectionLabel ?? "selection",
    entryOddsAmerican: args.entryOddsAmerican,
    closeOddsAmerican: args.closeOddsAmerican,
    entryLine: args.entryLine,
    closeLine: args.closeLine
  });
}

function getSurfaceBucket(timestamp: Date, windowMinutes: number) {
  const bucketMs = Math.max(1, windowMinutes) * 60_000;
  return Math.floor(timestamp.getTime() / bucketMs) * bucketMs;
}

export function buildOpportunitySurfaceKey(args: {
  opportunity: Pick<OpportunityView, "id" | "eventId" | "marketType" | "selectionLabel">;
  surfaceContext: OpportunitySurfaceContext;
  surfacedAt?: Date;
  surfaceWindowMinutes?: number;
}) {
  const surfacedAt = args.surfacedAt ?? new Date();
  const bucket = getSurfaceBucket(
    surfacedAt,
    args.surfaceWindowMinutes ?? DEFAULT_SURFACE_WINDOW_MINUTES
  );

  return [
    args.surfaceContext,
    args.opportunity.eventId,
    args.opportunity.id,
    args.opportunity.marketType,
    args.opportunity.selectionLabel,
    bucket
  ]
    .map((part) => String(part).trim().toLowerCase().replace(/\s+/g, "_"))
    .join(":");
}

async function findSurfaceRecord(surfaceKey: string) {
  const rows = await prisma.$queryRaw<OpportunitySurfaceRecordRow[]>`
    SELECT
      "surfaceKey",
      "marketType",
      "selection",
      "displayedOddsAmerican",
      "displayedLine"
    FROM "opportunity_surface_records"
    WHERE "surfaceKey" = ${surfaceKey}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function recordSurfacedOpportunity(
  input: RecordSurfacedOpportunityInput
) {
  if (!hasUsableServerDatabaseUrl()) {
    return null;
  }

  const surfacedAt = input.surfacedAt ?? new Date();
  const surfaceKey = buildOpportunitySurfaceKey({
    opportunity: input.opportunity,
    surfaceContext: input.surfaceContext,
    surfacedAt,
    surfaceWindowMinutes: input.surfaceWindowMinutes
  });
  const recordId = `osr_${randomUUID().replace(/-/g, "")}`;
  const displayedLine = toNumericLine(input.opportunity.displayLine);
  const displayedLineLabel = toDisplayLineLabel(input.opportunity.displayLine);
  const surfaceRank = input.surfaceRank ?? "SECONDARY";
  const isPrimarySurface = input.isPrimarySurface ?? surfaceRank === "PRIMARY";
  const metadata = {
    ...(input.metadata ?? {}),
    marketPath: input.opportunity.marketPath
      ? {
          regime: input.opportunity.marketPath.regime,
          confirmationCount: input.opportunity.marketPath.confirmationCount,
          staleCopyConfidence: input.opportunity.marketPath.staleCopyConfidence,
          executionHint: input.opportunity.marketPath.executionHint,
          laggingBooks: input.opportunity.marketPath.laggingBooks
        }
      : null,
    microstructure: {
      regime: input.opportunity.marketMicrostructure.regime,
      urgencyScore: input.opportunity.marketMicrostructure.urgencyScore,
      decayRiskBucket: input.opportunity.marketMicrostructure.decayRiskBucket,
      estimatedHalfLifeMinutes:
        input.opportunity.marketMicrostructure.estimatedHalfLifeMinutes,
      summary: input.opportunity.marketMicrostructure.summary
    }
  };

  await prisma.$executeRaw`
    INSERT INTO "opportunity_surface_records" (
      "id",
      "surfaceKey",
      "surfacedOpportunityId",
      "eventId",
      "league",
      "marketType",
      "selection",
      "surfaceContext",
      "surfaceRank",
      "isPrimarySurface",
      "sportsbookKey",
      "sportsbookName",
      "displayedOddsAmerican",
      "displayedLine",
      "displayedLineLabel",
      "fairPriceAmerican",
      "expectedValuePct",
      "surfacedAt",
      "actionState",
      "timingState",
      "opportunityScore",
      "confidenceTier",
      "trapFlagsJson",
      "sourceHealthState",
      "marketEfficiency",
      "sizingRecommendation",
      "providerFreshnessMinutes",
      "metadataJson",
      "updatedAt"
    )
    VALUES (
      ${recordId},
      ${surfaceKey},
      ${input.opportunity.id},
      ${input.opportunity.eventId},
      ${input.opportunity.league},
      ${input.opportunity.marketType},
      ${input.opportunity.selectionLabel},
      ${input.surfaceContext},
      ${surfaceRank},
      ${isPrimarySurface},
      ${input.opportunity.sportsbookKey},
      ${input.opportunity.sportsbookName},
      ${input.opportunity.displayOddsAmerican},
      ${displayedLine},
      ${displayedLineLabel},
      ${input.opportunity.fairPriceAmerican},
      ${input.opportunity.expectedValuePct},
      ${surfacedAt},
      ${input.opportunity.actionState},
      ${input.opportunity.timingState},
      ${input.opportunity.opportunityScore},
      ${input.opportunity.confidenceTier},
      ${toJsonInput(input.opportunity.trapFlags)},
      ${input.opportunity.sourceHealth.state},
      ${input.opportunity.marketEfficiency},
      ${input.opportunity.sizing.recommendation},
      ${input.opportunity.providerFreshnessMinutes},
      ${toJsonInput(metadata)},
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("surfaceKey") DO UPDATE SET
      "surfaceRank" = EXCLUDED."surfaceRank",
      "isPrimarySurface" = EXCLUDED."isPrimarySurface",
      "displayedOddsAmerican" = EXCLUDED."displayedOddsAmerican",
      "displayedLine" = EXCLUDED."displayedLine",
      "displayedLineLabel" = EXCLUDED."displayedLineLabel",
      "fairPriceAmerican" = EXCLUDED."fairPriceAmerican",
      "expectedValuePct" = EXCLUDED."expectedValuePct",
      "opportunityScore" = EXCLUDED."opportunityScore",
      "actionState" = EXCLUDED."actionState",
      "timingState" = EXCLUDED."timingState",
      "confidenceTier" = EXCLUDED."confidenceTier",
      "trapFlagsJson" = EXCLUDED."trapFlagsJson",
      "sourceHealthState" = EXCLUDED."sourceHealthState",
      "marketEfficiency" = EXCLUDED."marketEfficiency",
      "sizingRecommendation" = EXCLUDED."sizingRecommendation",
      "providerFreshnessMinutes" = EXCLUDED."providerFreshnessMinutes",
      "metadataJson" = EXCLUDED."metadataJson",
      "updatedAt" = CURRENT_TIMESTAMP
  `;

  return {
    surfaceKey,
    surfacedAt: surfacedAt.toISOString(),
    surfaceRank
  };
}

export async function recordSurfacedOpportunities(
  opportunities: OpportunityView[],
  surfaceContext: OpportunitySurfaceContext,
  options: RecordSurfacedOpportunitiesOptions = {}
) {
  if (!opportunities.length || !hasUsableServerDatabaseUrl()) {
    return [];
  }

  const surfacedAt = new Date();
  const primaryCount = options.primaryCount ?? 1;
  const records = await Promise.allSettled(
    opportunities.map((opportunity, index) =>
      recordSurfacedOpportunity({
        opportunity,
        surfaceContext,
        surfaceRank: index < primaryCount ? "PRIMARY" : "SECONDARY",
        isPrimarySurface: index < primaryCount,
        surfacedAt,
        surfaceWindowMinutes: options.surfaceWindowMinutes,
        metadata: options.metadata
      })
    )
  );

  return records
    .map((record) => (record.status === "fulfilled" ? record.value : null))
    .filter((record): record is NonNullable<typeof record> => Boolean(record));
}

export async function updateOpportunityCloseValues(
  input: UpdateOpportunityCloseInput
) {
  if (!hasUsableServerDatabaseUrl()) {
    return null;
  }

  const record = await findSurfaceRecord(input.surfaceKey);
  if (!record) {
    return null;
  }

  const closeCapturedAt = input.closeCapturedAt ?? new Date();
  const truth = computeOpportunityTruthMetrics({
    marketType: record.marketType,
    selectionLabel: record.selection,
    entryOddsAmerican: record.displayedOddsAmerican,
    closeOddsAmerican: input.closeOddsAmerican,
    entryLine: record.displayedLine,
    closeLine: input.closeLine
  });

  await prisma.$executeRaw`
    UPDATE "opportunity_surface_records"
    SET
      "closeOddsAmerican" = ${input.closeOddsAmerican ?? null},
      "closeLine" = ${input.closeLine ?? null},
      "closeSportsbookKey" = ${input.closeSportsbookKey ?? null},
      "closeSportsbookName" = ${input.closeSportsbookName ?? null},
      "closeSource" = ${input.closeSource ?? "market_close"},
      "closeState" = 'AVAILABLE',
      "closeCapturedAt" = ${closeCapturedAt},
      "clvAmericanDelta" = ${truth.oddsDeltaAmerican},
      "clvLineDelta" = ${truth.lineDelta},
      "clvPct" = ${truth.clvPct},
      "clvResult" = ${truth.clvResult},
      "closeBeatEntry" = ${truth.closeBeatEntry},
      "entryBeatCloseMaterially" = ${truth.entryBeatCloseMaterially},
      "normalizedTruthScore" = ${truth.normalizedTruthScore},
      "closeUnavailableReason" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "surfaceKey" = ${input.surfaceKey}
  `;

  return {
    surfaceKey: input.surfaceKey,
    closeCapturedAt: closeCapturedAt.toISOString(),
    ...truth
  };
}

export async function markOpportunityCloseUnavailable(
  input: MarkOpportunityCloseUnavailableInput
) {
  if (!hasUsableServerDatabaseUrl()) {
    return null;
  }

  const capturedAt = input.capturedAt ?? new Date();

  await prisma.$executeRaw`
    UPDATE "opportunity_surface_records"
    SET
      "closeState" = 'UNAVAILABLE',
      "closeSource" = ${input.closeSource ?? null},
      "closeCapturedAt" = ${capturedAt},
      "clvResult" = 'NO_CLOSE_DATA',
      "closeBeatEntry" = NULL,
      "entryBeatCloseMaterially" = NULL,
      "normalizedTruthScore" = NULL,
      "closeUnavailableReason" = ${input.reason},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "surfaceKey" = ${input.surfaceKey}
  `;

  return {
    surfaceKey: input.surfaceKey,
    closeState: "UNAVAILABLE" as const,
    reason: input.reason,
    capturedAt: capturedAt.toISOString()
  };
}

export async function updateOpportunityFinalOutcome(
  input: UpdateOpportunityOutcomeInput
) {
  if (!hasUsableServerDatabaseUrl()) {
    return null;
  }

  const capturedAt = input.capturedAt ?? new Date();

  await prisma.$executeRaw`
    UPDATE "opportunity_surface_records"
    SET
      "finalOutcome" = ${input.finalOutcome},
      "finalOutcomeCapturedAt" = ${capturedAt},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "surfaceKey" = ${input.surfaceKey}
  `;

  return {
    surfaceKey: input.surfaceKey,
    finalOutcome: input.finalOutcome,
    capturedAt: capturedAt.toISOString()
  };
}

function groupColumn(groupBy: Exclude<TruthSummaryGroup, "trap_flag">) {
  switch (groupBy) {
    case "league":
      return Prisma.sql`COALESCE("league", 'UNKNOWN')`;
    case "market":
      return Prisma.sql`"marketType"`;
    case "sportsbook":
      return Prisma.sql`COALESCE("sportsbookName", "sportsbookKey", 'UNKNOWN')`;
    case "timing":
      return Prisma.sql`COALESCE("timingState", 'UNKNOWN')`;
    case "action":
      return Prisma.sql`"actionState"`;
    case "confidence":
      return Prisma.sql`"confidenceTier"`;
    case "source_health":
      return Prisma.sql`COALESCE("sourceHealthState", 'UNKNOWN')`;
  }
}

function mapSummaryRows(
  rows: Array<{
    label: string;
    surfaced: bigint;
    closed: bigint;
    beatClose: bigint;
    lostClose: bigint;
    pushClose: bigint;
    averageClvPct: number | null;
    averageLineDelta: number | null;
    averageTruthScore: number | null;
    averageSurfaceScore: number | null;
    averageExpectedValuePct: number | null;
  }>
): TruthCalibrationSummaryRow[] {
  return rows.map((row) => {
    const closed = Number(row.closed);
    const beatClose = Number(row.beatClose);
    const lostClose = Number(row.lostClose);
    const surfaced = Number(row.surfaced);

    return {
      label: row.label,
      surfaced,
      closed,
      beatClose,
      lostClose,
      pushClose: Number(row.pushClose),
      closeDataRate: surfaced
        ? Number(((closed / surfaced) * 100).toFixed(1))
        : null,
      beatClosePct: closed
        ? Number(((beatClose / closed) * 100).toFixed(1))
        : null,
      lostClosePct: closed
        ? Number(((lostClose / closed) * 100).toFixed(1))
        : null,
      averageClvPct:
        typeof row.averageClvPct === "number"
          ? Number(row.averageClvPct.toFixed(3))
          : null,
      averageLineDelta:
        typeof row.averageLineDelta === "number"
          ? Number(row.averageLineDelta.toFixed(3))
          : null,
      averageTruthScore:
        typeof row.averageTruthScore === "number"
          ? Number(row.averageTruthScore.toFixed(3))
          : null,
      averageSurfaceScore:
        typeof row.averageSurfaceScore === "number"
          ? Number(row.averageSurfaceScore.toFixed(1))
          : null,
      averageExpectedValuePct:
        typeof row.averageExpectedValuePct === "number"
          ? Number(row.averageExpectedValuePct.toFixed(3))
          : null
    };
  });
}

export async function summarizeTruthCalibration(args: {
  groupBy: TruthSummaryGroup;
  league?: LeagueKey | "ALL";
  since?: Date;
}): Promise<TruthCalibrationSummaryRow[]> {
  if (!hasUsableServerDatabaseUrl()) {
    return [];
  }

  const leagueFilter =
    args.league && args.league !== "ALL"
      ? Prisma.sql`AND r."league" = ${args.league}`
      : Prisma.empty;
  const sinceFilter = args.since
    ? Prisma.sql`AND r."surfacedAt" >= ${args.since}`
    : Prisma.empty;

  if (args.groupBy === "trap_flag") {
    const rows = await prisma.$queryRaw<Parameters<typeof mapSummaryRows>[0]>`
      SELECT
        COALESCE(flag.value, 'NO_TRAP') AS "label",
        COUNT(*) AS "surfaced",
        COUNT(*) FILTER (WHERE r."clvResult" <> 'NO_CLOSE_DATA') AS "closed",
        COUNT(*) FILTER (WHERE r."clvResult" = 'BEAT_CLOSE') AS "beatClose",
        COUNT(*) FILTER (WHERE r."clvResult" = 'LOST_CLOSE') AS "lostClose",
        COUNT(*) FILTER (WHERE r."clvResult" = 'PUSH_CLOSE') AS "pushClose",
        AVG(r."clvPct") AS "averageClvPct",
        AVG(r."clvLineDelta") AS "averageLineDelta",
        AVG(r."normalizedTruthScore") AS "averageTruthScore",
        AVG(r."opportunityScore") AS "averageSurfaceScore",
        AVG(r."expectedValuePct") AS "averageExpectedValuePct"
      FROM "opportunity_surface_records" r
      LEFT JOIN LATERAL jsonb_array_elements_text(r."trapFlagsJson") AS flag(value) ON true
      WHERE 1 = 1
      ${leagueFilter}
      ${sinceFilter}
      GROUP BY COALESCE(flag.value, 'NO_TRAP')
      ORDER BY "closed" DESC, "surfaced" DESC
      LIMIT 50
    `;

    return mapSummaryRows(rows);
  }

  const column = groupColumn(args.groupBy);
  const rows = await prisma.$queryRaw<Parameters<typeof mapSummaryRows>[0]>`
    SELECT
      ${column} AS "label",
      COUNT(*) AS "surfaced",
      COUNT(*) FILTER (WHERE "clvResult" <> 'NO_CLOSE_DATA') AS "closed",
      COUNT(*) FILTER (WHERE "clvResult" = 'BEAT_CLOSE') AS "beatClose",
      COUNT(*) FILTER (WHERE "clvResult" = 'LOST_CLOSE') AS "lostClose",
      COUNT(*) FILTER (WHERE "clvResult" = 'PUSH_CLOSE') AS "pushClose",
      AVG("clvPct") AS "averageClvPct",
      AVG("clvLineDelta") AS "averageLineDelta",
      AVG("normalizedTruthScore") AS "averageTruthScore",
      AVG("opportunityScore") AS "averageSurfaceScore",
      AVG("expectedValuePct") AS "averageExpectedValuePct"
    FROM "opportunity_surface_records"
    WHERE 1 = 1
    ${
      args.league && args.league !== "ALL"
        ? Prisma.sql`AND "league" = ${args.league}`
        : Prisma.empty
    }
    ${args.since ? Prisma.sql`AND "surfacedAt" >= ${args.since}` : Prisma.empty}
    GROUP BY ${column}
    ORDER BY "closed" DESC, "surfaced" DESC
    LIMIT 50
  `;

  return mapSummaryRows(rows);
}

export const summarizeClvPerformance = summarizeTruthCalibration;

export function buildTruthCalibrationFeedback(args: {
  groupBy: TruthSummaryGroup;
  row: TruthCalibrationSummaryRow;
}): TruthCalibrationFeedback {
  const insufficient =
    args.row.surfaced < TRUTH_CALIBRATION_MIN_SURFACED ||
    args.row.closed < TRUTH_CALIBRATION_MIN_CLOSED ||
    args.row.beatClosePct === null;

  if (insufficient) {
    return {
      sampleState: "INSUFFICIENT_SAMPLE",
      label: args.row.label,
      groupBy: args.groupBy,
      surfaced: args.row.surfaced,
      closed: args.row.closed,
      beatClosePct: args.row.beatClosePct,
      averageTruthScore: args.row.averageTruthScore,
      scoringNudge: 0,
      sportsbookWeightNudge: 0,
      timingConfidenceNudge: 0,
      trapEscalation: false,
      note: "Sample is too small for calibration feedback. Keep market logic neutral."
    };
  }

  const beatClosePct = args.row.beatClosePct ?? 0;
  const averageTruthScore = args.row.averageTruthScore ?? 0;
  const isPositive = beatClosePct >= 56 && averageTruthScore > 0.5;
  const isNegative = beatClosePct <= 44 && averageTruthScore < -0.5;

  return {
    sampleState: "QUALIFIED",
    label: args.row.label,
    groupBy: args.groupBy,
    surfaced: args.row.surfaced,
    closed: args.row.closed,
    beatClosePct: args.row.beatClosePct,
    averageTruthScore: args.row.averageTruthScore,
    scoringNudge: isPositive ? 2 : isNegative ? -4 : 0,
    sportsbookWeightNudge:
      args.groupBy === "sportsbook" ? (isPositive ? 0.05 : isNegative ? -0.08 : 0) : 0,
    timingConfidenceNudge:
      args.groupBy === "timing" ? (isPositive ? 2 : isNegative ? -3 : 0) : 0,
    trapEscalation: args.groupBy === "trap_flag" && isNegative,
    note: isPositive
      ? "Qualified sample is beating close. Future calibration may cautiously reward this lane."
      : isNegative
        ? "Qualified sample is losing to close. Future calibration should downgrade this lane."
        : "Qualified sample is near neutral. Keep calibration nudge flat."
  };
}
