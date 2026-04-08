import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { OpportunityExecutionContextView, OpportunityTimingCorrectness, OpportunityView } from "@/lib/types/opportunity";
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

function favorableOddsDelta(bestAvailable: number | null, actual: number | null) {
  if (typeof bestAvailable !== "number" || typeof actual !== "number") {
    return null;
  }

  return bestAvailable - actual;
}

function buildTimingCorrectness(args: {
  clvPct: number | null;
  slippageAmerican: number | null;
  staleCopyExpected: boolean;
}) {
  if (args.staleCopyExpected && typeof args.slippageAmerican === "number" && args.slippageAmerican >= 8) {
    return "MISSED" as OpportunityTimingCorrectness;
  }

  if (typeof args.clvPct !== "number") {
    return "UNKNOWN" as OpportunityTimingCorrectness;
  }

  if (args.clvPct >= 1) {
    return "CORRECT" as OpportunityTimingCorrectness;
  }

  if (args.clvPct <= -1.25) {
    return "EARLY" as OpportunityTimingCorrectness;
  }

  if (typeof args.slippageAmerican === "number" && args.slippageAmerican >= 6) {
    return "LATE" as OpportunityTimingCorrectness;
  }

  return "UNKNOWN" as OpportunityTimingCorrectness;
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
  bestAvailableOddsAmerican?: number | null;
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
  const bestAvailableOddsAmerican = args.bestAvailableOddsAmerican ?? null;
  const slippageAmerican = favorableOddsDelta(bestAvailableOddsAmerican, actualOddsAmerican);
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
  const staleCopyCaptured =
    args.staleCopyExpected && typeof slippageAmerican === "number"
      ? slippageAmerican <= 0
      : null;
  const timingCorrectness = buildTimingCorrectness({
    clvPct: truth.clvPct,
    slippageAmerican,
    staleCopyExpected: args.staleCopyExpected === true
  });

  let executionScore = 58;
  const reasons: string[] = [];

  if (typeof slippageAmerican === "number") {
    executionScore -= clamp(slippageAmerican * 1.2, 0, 28);
    if (slippageAmerican >= 8) {
      reasons.push(`Available market was ${slippageAmerican > 0 ? "+" : ""}${slippageAmerican} cents better than the price taken.`);
    }
  }

  if (typeof truth.clvPct === "number") {
    executionScore += clamp(truth.clvPct * 3, -25, 24);
    reasons.push(
      truth.clvPct >= 0
        ? `Entry beat the close by ${truth.clvPct.toFixed(2)}% CLV.`
        : `Close beat entry by ${Math.abs(truth.clvPct).toFixed(2)}% CLV.`
    );
  }

  if (staleCopyCaptured === true) {
    executionScore += 8;
    reasons.push("Captured the stale copy before the board fully repriced.");
  } else if (args.staleCopyExpected && staleCopyCaptured === false) {
    executionScore -= 10;
    reasons.push("Stale-copy window was not captured cleanly.");
  }

  if (timingCorrectness === "EARLY") {
    executionScore -= 6;
    reasons.push("Waiting would likely have improved the entry.");
  } else if (timingCorrectness === "CORRECT") {
    executionScore += 4;
  } else if (timingCorrectness === "MISSED") {
    executionScore -= 12;
  }

  executionScore = Math.round(clamp(executionScore, 0, 100));
  const { classification, entryQualityLabel } = buildClassification(executionScore);

  return {
    status: "HISTORICAL",
    classification,
    executionScore,
    entryQualityLabel,
    bestAvailableOddsAmerican,
    actualOddsAmerican,
    actualLine: args.actualLine ?? null,
    closingOddsAmerican: args.closingOddsAmerican ?? null,
    closingLine: args.closingLine ?? null,
    slippageAmerican,
    clvPct: truth.clvPct,
    timeToCloseMinutes,
    staleCopyCaptured,
    missedEdge:
      (typeof slippageAmerican === "number" && slippageAmerican >= 8) ||
      classification === "MISSED_OPPORTUNITY",
    timingCorrectness,
    reasons: reasons.slice(0, 3)
  };
}

export function createOpportunityExecutionResolver(args?: {
  entries?: ExecutionEntry[];
}): OpportunityExecutionResolver {
  const entries = args?.entries ?? [];
  const byExactKey = new Map<string, ExecutionEntry>();

  for (const entry of entries) {
    const key = [
      entry.eventId ?? "",
      normalizeLabel(entry.marketType),
      normalizeLabel(entry.selection)
    ].join("|");

    if (!byExactKey.has(key)) {
      byExactKey.set(key, entry);
      continue;
    }

    const existing = byExactKey.get(key);
    if (
      existing &&
      new Date(entry.placedAt).getTime() > new Date(existing.placedAt).getTime()
    ) {
      byExactKey.set(key, entry);
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

      return buildExecutionQualityAssessment({
        bestAvailableOddsAmerican: opportunity.displayOddsAmerican,
        actualOddsAmerican: match.oddsAmerican,
        actualLine: match.line,
        closingOddsAmerican: match.closingOddsAmerican,
        closingLine: match.closingLine,
        marketType: opportunity.marketType,
        selectionLabel: opportunity.selectionLabel,
        placedAt: match.placedAt,
        settledAt: match.settledAt,
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
    const bets = await prisma.bet.findMany({
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
    });

    return createOpportunityExecutionResolver({
      entries: bets.map((bet) => ({
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
      }))
    });
  } catch {
    return createOpportunityExecutionResolver();
  }
}
