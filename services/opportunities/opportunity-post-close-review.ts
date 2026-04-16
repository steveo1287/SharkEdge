import { Prisma } from "@prisma/client";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { LeagueKey, MarketPathRegime } from "@/lib/types/domain";
import type {
  OpportunityPostCloseReviewView,
  OpportunityReasonLaneView
} from "@/lib/types/opportunity";
import {
  buildExecutionQualityAssessment,
  parseStoredOpportunityDecisionSnapshot
} from "@/services/opportunities/opportunity-execution";
import { buildOpportunityTimingReview } from "@/services/opportunities/opportunity-timing-review";
import { DEFAULT_USER_ID } from "@/services/account/user-service";

type PostCloseReviewRow = {
  surfaceKey: string;
  surfacedOpportunityId: string;
  eventId: string;
  league: string | null;
  marketType: string;
  selection: string;
  surfaceContext: string;
  surfacedAt: Date;
  displayedOddsAmerican: number | null;
  displayedLine: number | null;
  closeOddsAmerican: number | null;
  closeLine: number | null;
  metadataJson: unknown;
  actionState: string | null;
  timingState: string | null;
  confidenceTier: string | null;
  closeState: string | null;
  closeCapturedAt: Date | null;
  clvPct: number | null;
  clvResult: string | null;
  normalizedTruthScore: number | null;
  finalOutcome: string | null;
  sportsbookKey: string | null;
  sportsbookName: string | null;
};

type MatchedBetRow = {
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
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseReasonLanes(metadataJson: unknown): OpportunityReasonLaneView[] {
  const metadata = asObject(metadataJson);
  const snapshot = asObject(metadata?.executionSnapshot);
  if (!Array.isArray(snapshot?.reasonLanes)) {
    return [];
  }

  return snapshot.reasonLanes
    .map((item) => {
      const lane = asObject(item);
      const key = typeof lane?.key === "string" ? lane.key : null;
      const category = typeof lane?.category === "string" ? lane.category : null;
      const label = typeof lane?.label === "string" ? lane.label : null;
      const description = typeof lane?.description === "string" ? lane.description : null;
      if (!key || !category || !label || !description) {
        return null;
      }

      return {
        key,
        category,
        label,
        description
      } as OpportunityReasonLaneView;
    })
    .filter((item): item is OpportunityReasonLaneView => Boolean(item));
}

function buildReviewSummary(review: OpportunityPostCloseReviewView) {
  const timing = review.timingReview.classification.replace(/_/g, " ").toLowerCase();
  const clv =
    typeof review.clvPct === "number"
      ? `${review.clvPct >= 0 ? "+" : ""}${review.clvPct.toFixed(2)}% CLV`
      : "no CLV";
  const execution = review.executionContext
    ? review.executionContext.entryQualityLabel.toLowerCase()
    : "no matched execution";

  return `${timing}; ${clv}; ${execution}.`;
}

export function buildOpportunityPostCloseReviewView(args: {
  row: PostCloseReviewRow;
  matchedBet?: MatchedBetRow | null;
}): OpportunityPostCloseReviewView {
  const { row } = args;
  const matchedBet = args.matchedBet ?? null;
  const decisionSnapshot = parseStoredOpportunityDecisionSnapshot({
    surfaceKey: row.surfaceKey,
    eventId: row.eventId,
    marketType: row.marketType,
    selection: row.selection,
    surfaceContext: row.surfaceContext,
    surfacedAt: row.surfacedAt.toISOString(),
    displayedOddsAmerican: row.displayedOddsAmerican,
    displayedLine: row.displayedLine,
    closeOddsAmerican: row.closeOddsAmerican,
    closeLine: row.closeLine,
    metadataJson: row.metadataJson
  });
  const timingReview = buildOpportunityTimingReview({
    ...row,
    closeState: row.closeState,
    closeCapturedAt: row.closeCapturedAt,
    finalOutcome: row.finalOutcome
  });

  const executionContext = matchedBet
    ? buildExecutionQualityAssessment({
        decisionSurfaceKey: row.surfaceKey,
        decisionSnapshot,
        actualOddsAmerican: matchedBet.oddsAmerican,
        actualLine: matchedBet.line,
        closingOddsAmerican: matchedBet.closingOddsAmerican ?? row.closeOddsAmerican,
        closingLine: matchedBet.closingLine ?? row.closeLine,
        marketType: row.marketType,
        selectionLabel: row.selection,
        placedAt: matchedBet.placedAt,
        settledAt: matchedBet.settledAt,
        staleCopyExpected:
          (decisionSnapshot?.marketPathRegime as MarketPathRegime | "NO_PATH" | null) ===
          "STALE_COPY"
      })
    : null;

  const review: OpportunityPostCloseReviewView = {
    surfaceKey: row.surfaceKey,
    surfacedAt: row.surfacedAt.toISOString(),
    surfaceContext: row.surfaceContext,
    surfacedOpportunityId: row.surfacedOpportunityId,
    eventId: row.eventId,
    league: (row.league ?? "NBA") as LeagueKey,
    marketType: row.marketType,
    selectionLabel: row.selection,
    sportsbookKey: row.sportsbookKey,
    sportsbookName: row.sportsbookName,
    displayedOddsAmerican: row.displayedOddsAmerican,
    displayedLine: row.displayedLine,
    closeOddsAmerican: row.closeOddsAmerican,
    closeLine: row.closeLine,
    clvPct: row.clvPct,
    clvResult: row.clvResult,
    normalizedTruthScore: row.normalizedTruthScore,
    finalOutcome: row.finalOutcome,
    decisionSnapshot,
    reasonLanes:
      decisionSnapshot?.reasonLanes.length
        ? decisionSnapshot.reasonLanes
        : parseReasonLanes(row.metadataJson),
    timingReview,
    executionContext,
    summary: ""
  };

  review.summary = buildReviewSummary(review);
  return review;
}

async function loadSurfaceRecord(surfaceKey: string) {
  const rows = await prisma.$queryRaw<PostCloseReviewRow[]>`
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
      "finalOutcome",
      "actionState",
      "timingState",
      "confidenceTier",
      "metadataJson"
    FROM "opportunity_surface_records"
    WHERE "surfaceKey" = ${surfaceKey}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function loadMatchedBet(row: PostCloseReviewRow): Promise<MatchedBetRow | null> {
  const bets = await prisma.$queryRaw<MatchedBetRow[]>`
    SELECT
      "id",
      "eventId",
      "marketType",
      "selection",
      "oddsAmerican",
      "line",
      "closingOddsAmerican",
      "closingLine",
      "placedAt",
      "settledAt"
    FROM "bets"
    WHERE "userId" = ${DEFAULT_USER_ID}
      AND "eventId" = ${row.eventId}
      AND LOWER("selection") = LOWER(${row.selection})
      AND LOWER(CAST("marketType" AS TEXT)) = LOWER(${row.marketType})
      AND "archivedAt" IS NULL
    ORDER BY ABS(EXTRACT(EPOCH FROM ("placedAt" - ${row.surfacedAt}))) ASC
    LIMIT 3
  `;

  return bets[0] ?? null;
}

export async function getOpportunityPostCloseReview(
  surfaceKey: string
): Promise<OpportunityPostCloseReviewView | null> {
  if (!hasUsableServerDatabaseUrl()) {
    return null;
  }

  const row = await loadSurfaceRecord(surfaceKey);
  if (!row) {
    return null;
  }

  const [matchedBet] = await Promise.all([loadMatchedBet(row).catch(() => null)]);
  return buildOpportunityPostCloseReviewView({
    row,
    matchedBet
  });
}

export async function listOpportunityPostCloseReviews(args: {
  league?: LeagueKey | "ALL";
  since?: Date;
  limit?: number;
} = {}): Promise<OpportunityPostCloseReviewView[]> {
  if (!hasUsableServerDatabaseUrl()) {
    return [];
  }

  const since = args.since ?? new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const rows = await prisma.$queryRaw<PostCloseReviewRow[]>`
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
      "finalOutcome",
      "actionState",
      "timingState",
      "confidenceTier",
      "metadataJson"
    FROM "opportunity_surface_records"
    WHERE "surfacedAt" >= ${since}
      ${
        args.league && args.league !== "ALL"
          ? Prisma.sql`AND "league" = ${args.league}`
          : Prisma.empty
      }
    ORDER BY "surfacedAt" DESC
    LIMIT ${limit}
  `;

  const reviews = await Promise.all(
    rows.map((row) => getOpportunityPostCloseReview(row.surfaceKey).catch(() => null))
  );

  return reviews.filter((item): item is OpportunityPostCloseReviewView => Boolean(item));
}
