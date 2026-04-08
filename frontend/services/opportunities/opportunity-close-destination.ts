import { Prisma } from "@prisma/client";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { LeagueKey, MarketPathView, ProviderHealthState } from "@/lib/types/domain";
import type {
  MarketEfficiencyClass,
  OpportunityBookLeadershipView,
  OpportunityCloseDestinationView,
  OpportunityMarketMicrostructureView
} from "@/lib/types/opportunity";

type DestinationHistoryRow = {
  league: string;
  marketType: string;
  marketEfficiency: string | null;
  clvResult: string | null;
  normalizedTruthScore: number | null;
  clvPct: number | null;
  metadataJson: unknown;
};

type DestinationSnapshot = {
  marketPathRegime: string;
};

export type OpportunityCloseDestinationContext = {
  league: LeagueKey;
  marketType: string;
  marketEfficiency: MarketEfficiencyClass;
  bestPriceFlag: boolean;
  marketDisagreementScore: number | null;
  providerFreshnessMinutes: number | null;
  sourceHealthState: ProviderHealthState;
  marketPath: MarketPathView | null;
  marketMicrostructure: OpportunityMarketMicrostructureView;
  bookLeadership: OpportunityBookLeadershipView;
};

export type OpportunityCloseDestinationSummaryRow = {
  laneKey: string;
  laneLabel: string;
  surfaced: number;
  closed: number;
  beatClose: number;
  lostClose: number;
  truthScoreTotal: number;
  truthScoreSamples: number;
  clvPctTotal: number;
  clvPctSamples: number;
};

export type OpportunityCloseDestinationResolver = {
  resolve: (context: OpportunityCloseDestinationContext) => OpportunityCloseDestinationView;
};

const LOOKBACK_DAYS = 180;
const MIN_SURFACED = 16;
const MIN_CLOSED = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number | null | undefined, digits = 2) {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(digits))
    : null;
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, "_");
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length ? value : null;
}

function buildLaneKey(args: {
  league: string;
  marketType: string;
  marketEfficiency: string;
  regime: string;
}) {
  return [args.league, args.marketType, args.marketEfficiency, args.regime]
    .map((part) => normalizeLabel(part))
    .join("|");
}

function buildLaneLabel(args: {
  league: string;
  marketType: string;
  marketEfficiency: string;
  regime: string;
}) {
  return `${args.league} ${args.marketType} ${args.marketEfficiency.replace(/_/g, " ")} ${args.regime.replace(/_/g, " ")}`;
}

function parseDestinationSnapshot(row: DestinationHistoryRow): DestinationSnapshot | null {
  const metadata = asObject(row.metadataJson);
  const snapshot = asObject(metadata?.executionSnapshot);
  if (!snapshot) {
    return null;
  }

  return {
    marketPathRegime: asString(snapshot.marketPathRegime) ?? "NO_PATH"
  };
}

function summarizeDestinationRows(rows: DestinationHistoryRow[]) {
  const summaryByKey = new Map<string, OpportunityCloseDestinationSummaryRow>();

  for (const row of rows) {
    const snapshot = parseDestinationSnapshot(row);
    if (!snapshot) {
      continue;
    }

    const exactLaneKey = buildLaneKey({
      league: row.league,
      marketType: row.marketType,
      marketEfficiency: row.marketEfficiency ?? "UNKNOWN",
      regime: snapshot.marketPathRegime
    });
    const broadLaneKey = buildLaneKey({
      league: row.league,
      marketType: row.marketType,
      marketEfficiency: "ALL",
      regime: snapshot.marketPathRegime
    });

    for (const [laneKey, marketEfficiency] of [
      [exactLaneKey, row.marketEfficiency ?? "UNKNOWN"],
      [broadLaneKey, "ALL"]
    ] as const) {
      const summary =
        summaryByKey.get(laneKey) ?? {
          laneKey,
          laneLabel: buildLaneLabel({
            league: row.league,
            marketType: row.marketType,
            marketEfficiency,
            regime: snapshot.marketPathRegime
          }),
          surfaced: 0,
          closed: 0,
          beatClose: 0,
          lostClose: 0,
          truthScoreTotal: 0,
          truthScoreSamples: 0,
          clvPctTotal: 0,
          clvPctSamples: 0
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
      if (typeof row.normalizedTruthScore === "number") {
        summary.truthScoreTotal += row.normalizedTruthScore;
        summary.truthScoreSamples += 1;
      }
      if (typeof row.clvPct === "number") {
        summary.clvPctTotal += row.clvPct;
        summary.clvPctSamples += 1;
      }

      summaryByKey.set(laneKey, summary);
    }
  }

  return summaryByKey;
}

function getConfidenceBucket(score: number): OpportunityCloseDestinationView["confidence"] {
  if (score >= 75) {
    return "HIGH";
  }

  if (score >= 55) {
    return "MEDIUM";
  }

  return "LOW";
}

function buildNeutralDestination(args: {
  status: OpportunityCloseDestinationView["status"];
  notes: string[];
}): OpportunityCloseDestinationView {
  return {
    status: args.status,
    label: "HOLD",
    confidence: "LOW",
    confidenceScore: 28,
    surfaced: 0,
    closed: 0,
    requiredSurfaced: MIN_SURFACED,
    requiredClosed: MIN_CLOSED,
    timingDelta: 0,
    scoreDelta: 0,
    sizingMultiplier: 1,
    reasonCodes: ["DESTINATION_NEUTRAL"],
    notes: args.notes
  };
}

function resolveFromSummary(
  summaryByKey: Map<string, OpportunityCloseDestinationSummaryRow>,
  context: OpportunityCloseDestinationContext
): OpportunityCloseDestinationView {
  const regime = context.marketPath?.regime ?? context.marketMicrostructure.regime ?? "NO_PATH";
  const exactLaneKey = buildLaneKey({
    league: context.league,
    marketType: context.marketType,
    marketEfficiency: context.marketEfficiency,
    regime
  });
  const broadLaneKey = buildLaneKey({
    league: context.league,
    marketType: context.marketType,
    marketEfficiency: "ALL",
    regime
  });
  const summary = summaryByKey.get(exactLaneKey) ?? summaryByKey.get(broadLaneKey) ?? null;

  if (!context.marketPath && !summary) {
    return buildNeutralDestination({
      status: "SKIPPED_NO_HISTORY",
      notes: ["Close-destination stayed neutral because neither path context nor lane history is available."]
    });
  }

  const beatClosePct = summary?.closed ? (summary.beatClose / summary.closed) * 100 : null;
  const averageTruthScore =
    summary && summary.truthScoreSamples > 0
      ? summary.truthScoreTotal / summary.truthScoreSamples
      : null;
  const averageClvPct =
    summary && summary.clvPctSamples > 0
      ? summary.clvPctTotal / summary.clvPctSamples
      : null;
  const historyQualified =
    Boolean(summary) &&
    summary!.surfaced >= MIN_SURFACED &&
    summary!.closed >= MIN_CLOSED &&
    beatClosePct !== null;

  let destinationBias =
    regime === "STALE_COPY"
      ? 22
      : regime === "LEADER_CONFIRMED"
        ? 10
        : regime === "BROAD_REPRICE"
          ? -4
          : regime === "FRAGMENTED"
            ? -2
            : 0;

  destinationBias += (context.marketMicrostructure.staleCopyConfidence - 50) * 0.18;
  destinationBias += (context.marketMicrostructure.repricingLikelihood - 50) * 0.08;
  destinationBias -= (context.marketMicrostructure.waitImprovementLikelihood - 50) * 0.12;
  destinationBias += context.bookLeadership.staleCopyConfidenceAdjustment * 0.35;
  destinationBias += context.bookLeadership.pathConfidenceAdjustment * 90;
  destinationBias -= (context.marketDisagreementScore ?? 0) * 12;
  destinationBias -= context.providerFreshnessMinutes !== null && context.providerFreshnessMinutes > 12 ? 4 : 0;
  destinationBias -= context.sourceHealthState === "DEGRADED" ? 5 : context.sourceHealthState === "OFFLINE" ? 12 : 0;

  if (historyQualified) {
    destinationBias += ((beatClosePct ?? 50) - 50) * 0.55;
    destinationBias += (averageTruthScore ?? 0) * 8;
    destinationBias += (averageClvPct ?? 0) * 2.4;
  }

  const mostlyPriced =
    context.marketEfficiency === "HIGH_EFFICIENCY" &&
    !context.bestPriceFlag &&
    context.marketMicrostructure.repricingLikelihood >= 72 &&
    context.marketMicrostructure.staleCopyConfidence < 45;

  const confidenceScore = Math.round(
    clamp(
      38 +
        (context.marketPath ? Math.max(context.marketPath.confirmationCount, 1) * 8 : 0) +
        context.marketMicrostructure.urgencyScore * 0.22 +
        (context.marketMicrostructure.pathTrusted ? 12 : 0) +
        (historyQualified ? 14 : summary ? 5 : 0) -
        ((context.marketDisagreementScore ?? 0) * 100 >= 15 ? 12 : 0) -
        (context.sourceHealthState === "OFFLINE" ? 24 : context.sourceHealthState === "DEGRADED" ? 10 : 0),
      0,
      100
    )
  );

  const label = mostlyPriced
    ? "MOSTLY_PRICED"
    : destinationBias >= 20
      ? "DECAY"
      : destinationBias <= -16
        ? "IMPROVE"
        : "HOLD";

  const confidence = getConfidenceBucket(confidenceScore);
  const timingDelta =
    label === "DECAY"
      ? confidence === "HIGH"
        ? 5
        : 3
      : label === "IMPROVE"
        ? confidence === "HIGH"
          ? -5
          : -3
        : label === "MOSTLY_PRICED"
          ? -4
          : 0;
  const scoreDelta =
    label === "DECAY"
      ? confidence === "HIGH"
        ? 4
        : 2
      : label === "IMPROVE"
        ? -2
        : label === "MOSTLY_PRICED"
          ? -4
          : 0;
  const sizingMultiplier =
    label === "DECAY"
      ? confidence === "HIGH"
        ? 1.08
        : 1.04
      : label === "IMPROVE"
        ? 0.72
        : label === "MOSTLY_PRICED"
          ? 0.68
          : 1;

  if (confidenceScore < 42 && !historyQualified && !context.marketPath) {
    return buildNeutralDestination({
      status: "SKIPPED_LOW_CONFIDENCE",
      notes: ["Close-destination stayed neutral because the current path read is too weak and lane history is not qualified."]
    });
  }

  const notes = [
    historyQualified
      ? `Lane ${summary?.laneLabel ?? "history"} is ${summary?.surfaced}/${summary?.closed} surfaced/closed with ${round(beatClosePct, 1)}% beat-close.`
      : summary
        ? `Lane history exists but only at ${summary.surfaced}/${summary.closed}, so current path does more of the work.`
        : "Current path is carrying the destination read because lane history is not available yet.",
    label === "DECAY"
      ? "Market is more likely to move away from the displayed number than improve it."
      : label === "IMPROVE"
        ? "This lane more often offers better entry later than immediate entry."
        : label === "MOSTLY_PRICED"
          ? "This looks mature enough that most of the edge is probably already priced in."
          : "This lane looks more likely to hold than materially improve or collapse right away."
  ];

  return {
    status: "APPLIED",
    label,
    confidence,
    confidenceScore,
    surfaced: summary?.surfaced ?? 0,
    closed: summary?.closed ?? 0,
    requiredSurfaced: MIN_SURFACED,
    requiredClosed: MIN_CLOSED,
    timingDelta,
    scoreDelta,
    sizingMultiplier,
    reasonCodes: [
      `DESTINATION_${label}`,
      historyQualified ? "DESTINATION_HISTORY_QUALIFIED" : "DESTINATION_HISTORY_WEAK"
    ],
    notes
  };
}

async function loadDestinationRows(args?: {
  league?: LeagueKey | "ALL";
  since?: Date;
}) {
  if (!hasUsableServerDatabaseUrl()) {
    return [] as DestinationHistoryRow[];
  }

  const leagueFilter =
    args?.league && args.league !== "ALL"
      ? Prisma.sql`AND "league" = ${args.league}`
      : Prisma.empty;
  const sinceFilter = args?.since
    ? Prisma.sql`AND "surfacedAt" >= ${args.since}`
    : Prisma.sql`AND "surfacedAt" >= NOW() - INTERVAL '${LOOKBACK_DAYS} days'`;

  return prisma.$queryRaw<DestinationHistoryRow[]>`
    SELECT
      "league",
      "marketType",
      "marketEfficiency",
      "clvResult",
      "normalizedTruthScore",
      "clvPct",
      "metadataJson"
    FROM "opportunity_surface_records"
    WHERE 1 = 1
    ${leagueFilter}
    ${sinceFilter}
      AND "metadataJson" IS NOT NULL
    ORDER BY "surfacedAt" DESC
    LIMIT 6000
  `;
}

export function createOpportunityCloseDestinationResolver(args?: {
  summaries?: OpportunityCloseDestinationSummaryRow[];
}): OpportunityCloseDestinationResolver {
  const summaryByKey = new Map((args?.summaries ?? []).map((summary) => [summary.laneKey, summary]));

  return {
    resolve(context) {
      return resolveFromSummary(summaryByKey, context);
    }
  };
}

export async function getOpportunityCloseDestinationResolver(args?: {
  league?: LeagueKey | "ALL";
  since?: Date;
}) {
  const rows = await loadDestinationRows(args).catch(() => []);
  const summaryByKey = summarizeDestinationRows(rows);

  return {
    resolve(context) {
      return resolveFromSummary(summaryByKey, context);
    }
  } satisfies OpportunityCloseDestinationResolver;
}

export function buildOpportunityCloseDestinationSummary(view: OpportunityCloseDestinationView) {
  if (view.status === "APPLIED") {
    return `Close destination ${view.label.toLowerCase().replace(/_/g, " ")} at ${view.confidence.toLowerCase()} confidence.`;
  }

  return view.notes[0] ?? "Close destination stayed neutral.";
}
