import { Prisma } from "@prisma/client";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { LeagueKey, MarketPathView } from "@/lib/types/domain";
import type {
  MarketEfficiencyClass,
  OpportunityBookLeadershipView
} from "@/lib/types/opportunity";
import { getMarketPathBookDebug } from "@/services/market/market-path-service";
import { normalizeSportsbookIdentity } from "@/services/opportunities/opportunity-market-model";

type LeadershipHistoryRow = {
  league: string;
  marketType: string;
  marketEfficiency: string | null;
  sportsbookKey: string | null;
  sportsbookName: string | null;
  clvResult: string | null;
  normalizedTruthScore: number | null;
  metadataJson: unknown;
};

type LeadershipSnapshot = {
  marketPathRegime: string;
  leaderCandidates: string[];
  confirmerBooks: string[];
  followerBooks: string[];
  laggingBooks: string[];
  outlierBooks: string[];
  staleCopyConfidence: number | null;
};

export type OpportunityBookLeadershipContext = {
  league: LeagueKey;
  marketType: string;
  marketEfficiency: MarketEfficiencyClass;
  sportsbookKey: string | null;
  sportsbookName: string | null;
  marketPath: MarketPathView | null;
};

export type OpportunityBookLeadershipSummaryRow = {
  laneKey: string;
  laneLabel: string;
  sportsbookIdentity: string;
  surfaced: number;
  closed: number;
  beatClose: number;
  leaderCount: number;
  confirmerCount: number;
  followerCount: number;
  lagCount: number;
  outlierCount: number;
  staleCopyCount: number;
  truthScoreTotal: number;
  truthScoreSamples: number;
};

export type OpportunityBookLeadershipResolver = {
  resolve: (context: OpportunityBookLeadershipContext) => OpportunityBookLeadershipView;
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

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseLeadershipSnapshot(row: LeadershipHistoryRow): LeadershipSnapshot | null {
  const metadata = asObject(row.metadataJson);
  const snapshot = asObject(metadata?.executionSnapshot);
  if (!snapshot) {
    return null;
  }

  return {
    marketPathRegime: asString(snapshot.marketPathRegime) ?? "NO_PATH",
    leaderCandidates: asStringArray(snapshot.leaderCandidates),
    confirmerBooks: asStringArray(snapshot.confirmerBooks),
    followerBooks: asStringArray(snapshot.followerBooks),
    laggingBooks: asStringArray(snapshot.laggingBooks),
    outlierBooks: asStringArray(snapshot.outlierBooks),
    staleCopyConfidence: asNumber(snapshot.staleCopyConfidence)
  };
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

function getRole(snapshot: LeadershipSnapshot, sportsbookIdentity: string) {
  if (snapshot.leaderCandidates.some((item) => normalizeLabel(item) === sportsbookIdentity)) {
    return "LEADER" as const;
  }

  if (snapshot.confirmerBooks.some((item) => normalizeLabel(item) === sportsbookIdentity)) {
    return "CONFIRMER" as const;
  }

  if (snapshot.followerBooks.some((item) => normalizeLabel(item) === sportsbookIdentity)) {
    return "FOLLOWER" as const;
  }

  if (snapshot.laggingBooks.some((item) => normalizeLabel(item) === sportsbookIdentity)) {
    return "LAGGER" as const;
  }

  if (snapshot.outlierBooks.some((item) => normalizeLabel(item) === sportsbookIdentity)) {
    return "OUTLIER" as const;
  }

  return "UNCLASSIFIED" as const;
}

function createEmptySummary(args: {
  laneKey: string;
  laneLabel: string;
  sportsbookIdentity: string;
}): OpportunityBookLeadershipSummaryRow {
  return {
    laneKey: args.laneKey,
    laneLabel: args.laneLabel,
    sportsbookIdentity: args.sportsbookIdentity,
    surfaced: 0,
    closed: 0,
    beatClose: 0,
    leaderCount: 0,
    confirmerCount: 0,
    followerCount: 0,
    lagCount: 0,
    outlierCount: 0,
    staleCopyCount: 0,
    truthScoreTotal: 0,
    truthScoreSamples: 0
  };
}

function summarizeLeadershipRows(rows: LeadershipHistoryRow[]) {
  const summaryByKey = new Map<string, OpportunityBookLeadershipSummaryRow>();

  for (const row of rows) {
    const sportsbookIdentity = normalizeLabel(
      row.sportsbookName || row.sportsbookKey || normalizeSportsbookIdentity(row.sportsbookKey, row.sportsbookName)
    );
    if (!sportsbookIdentity) {
      continue;
    }

    const snapshot = parseLeadershipSnapshot(row);
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
      const existing =
        summaryByKey.get(`${laneKey}::${sportsbookIdentity}`) ??
        createEmptySummary({
          laneKey,
          laneLabel: buildLaneLabel({
            league: row.league,
            marketType: row.marketType,
            marketEfficiency,
            regime: snapshot.marketPathRegime
          }),
          sportsbookIdentity
        });

      existing.surfaced += 1;
      if (row.clvResult && row.clvResult !== "NO_CLOSE_DATA") {
        existing.closed += 1;
      }
      if (row.clvResult === "BEAT_CLOSE") {
        existing.beatClose += 1;
      }

      const role = getRole(snapshot, sportsbookIdentity);
      if (role === "LEADER") {
        existing.leaderCount += 1;
      } else if (role === "CONFIRMER") {
        existing.confirmerCount += 1;
      } else if (role === "FOLLOWER") {
        existing.followerCount += 1;
      } else if (role === "LAGGER") {
        existing.lagCount += 1;
      } else if (role === "OUTLIER") {
        existing.outlierCount += 1;
      }

      if (role === "LAGGER" && (snapshot.staleCopyConfidence ?? 0) >= 65) {
        existing.staleCopyCount += 1;
      }

      if (typeof row.normalizedTruthScore === "number") {
        existing.truthScoreTotal += row.normalizedTruthScore;
        existing.truthScoreSamples += 1;
      }

      summaryByKey.set(`${laneKey}::${sportsbookIdentity}`, existing);
    }
  }

  return summaryByKey;
}

function buildNeutralLeadership(args: {
  status: OpportunityBookLeadershipView["status"];
  role: OpportunityBookLeadershipView["role"];
  sportsbookIdentity: string | null;
  notes: string[];
}): OpportunityBookLeadershipView {
  return {
    status: args.status,
    laneKey: null,
    laneLabel: null,
    sportsbookIdentity: args.sportsbookIdentity,
    role: args.role,
    surfaced: 0,
    closed: 0,
    requiredSurfaced: MIN_SURFACED,
    requiredClosed: MIN_CLOSED,
    leaderFrequency: null,
    confirmerFrequency: null,
    lagFrequency: null,
    staleCopyFrequency: null,
    beatClosePct: null,
    averageTruthScore: null,
    influenceAdjustment: 0,
    pathConfidenceAdjustment: 0,
    staleCopyConfidenceAdjustment: 0,
    notes: args.notes
  };
}

function resolveFromSummary(
  summaryByKey: Map<string, OpportunityBookLeadershipSummaryRow>,
  context: OpportunityBookLeadershipContext
): OpportunityBookLeadershipView {
  const sportsbookIdentity = normalizeLabel(
    context.sportsbookName ||
      context.sportsbookKey ||
      normalizeSportsbookIdentity(context.sportsbookKey, context.sportsbookName)
  );
  const role = getMarketPathBookDebug(context.marketPath, context.sportsbookKey)?.role ?? "UNCLASSIFIED";

  if (!sportsbookIdentity) {
    return buildNeutralLeadership({
      status: "SKIPPED_NO_HISTORY",
      role,
      sportsbookIdentity: null,
      notes: ["Book leadership stayed neutral because no sportsbook identity is attached."]
    });
  }

  const regime = context.marketPath?.regime ?? "NO_PATH";
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

  const summary =
    summaryByKey.get(`${exactLaneKey}::${sportsbookIdentity}`) ??
    summaryByKey.get(`${broadLaneKey}::${sportsbookIdentity}`);

  if (!summary) {
    return buildNeutralLeadership({
      status: "SKIPPED_NO_HISTORY",
      role,
      sportsbookIdentity,
      notes: ["Lane leadership stayed neutral because this book has no lane-specific close history yet."]
    });
  }

  const insufficient = summary.surfaced < MIN_SURFACED || summary.closed < MIN_CLOSED;
  const leaderFrequency = summary.surfaced ? round((summary.leaderCount / summary.surfaced) * 100, 1) : null;
  const confirmerFrequency = summary.surfaced ? round((summary.confirmerCount / summary.surfaced) * 100, 1) : null;
  const lagFrequency = summary.surfaced ? round((summary.lagCount / summary.surfaced) * 100, 1) : null;
  const staleCopyFrequency = summary.surfaced ? round((summary.staleCopyCount / summary.surfaced) * 100, 1) : null;
  const beatClosePct = summary.closed ? round((summary.beatClose / summary.closed) * 100, 1) : null;
  const averageTruthScore =
    summary.truthScoreSamples > 0 ? round(summary.truthScoreTotal / summary.truthScoreSamples, 3) : null;

  if (insufficient) {
    return {
      ...buildNeutralLeadership({
        status: "SKIPPED_INSUFFICIENT_SAMPLE",
        role,
        sportsbookIdentity,
        notes: [
          `Lane leadership stayed neutral because ${summary.surfaced}/${summary.closed} surfaced/closed samples is below the ${MIN_SURFACED}/${MIN_CLOSED} gate.`
        ]
      }),
      laneKey: summary.laneKey,
      laneLabel: summary.laneLabel,
      surfaced: summary.surfaced,
      closed: summary.closed,
      leaderFrequency,
      confirmerFrequency,
      lagFrequency,
      staleCopyFrequency,
      beatClosePct,
      averageTruthScore
    };
  }

  const truthTilt = ((beatClosePct ?? 50) - 50) / 100 + (averageTruthScore ?? 0) * 0.04;
  const influenceAdjustment = round(
    clamp(
      role === "LEADER"
        ? 0.02 + (leaderFrequency ?? 0) * 0.0013 + truthTilt
        : role === "CONFIRMER"
          ? 0.01 + (confirmerFrequency ?? 0) * 0.0011 + truthTilt * 0.8
          : role === "FOLLOWER"
            ? -0.015 + truthTilt * 0.35
            : role === "LAGGER"
              ? -0.04 + truthTilt * 0.2
              : role === "OUTLIER"
                ? -0.08 + truthTilt * 0.1
                : truthTilt * 0.25,
      -0.12,
      0.1
    ),
    3
  ) ?? 0;

  const pathConfidenceAdjustment = round(
    clamp(
      role === "LEADER" || role === "CONFIRMER"
        ? 0.02 + ((beatClosePct ?? 50) - 50) * 0.0015
        : role === "LAGGER" || role === "OUTLIER"
          ? -0.02 + ((beatClosePct ?? 50) - 50) * 0.0008
          : ((beatClosePct ?? 50) - 50) * 0.0008,
      -0.08,
      0.08
    ),
    3
  ) ?? 0;

  const staleCopyConfidenceAdjustment = Math.round(
    clamp(
      role === "LAGGER"
        ? ((staleCopyFrequency ?? 0) - 18) * 0.18 + ((beatClosePct ?? 50) - 50) * 0.12
        : role === "OUTLIER"
          ? -8 + ((beatClosePct ?? 50) - 50) * 0.06
          : 0,
      -12,
      12
    )
  );

  const notes = [
    `Lane sample ${summary.surfaced}/${summary.closed} surfaced/closed in ${summary.laneLabel}.`,
    role === "LEADER" || role === "CONFIRMER"
      ? `This book behaves like a ${role.toLowerCase()} in this lane often enough to move source trust ${influenceAdjustment >= 0 ? "up" : "down"}.`
      : role === "LAGGER"
        ? "This book behaves like a lagger in this lane, which helps execution reads more than source trust."
        : role === "OUTLIER"
          ? "This book looks noisy in this lane and gets less respect as a source."
          : "Lane history is present but not strong enough to materially reclassify the book.",
    staleCopyConfidenceAdjustment !== 0
      ? `Lane history moves stale-copy confidence ${staleCopyConfidenceAdjustment >= 0 ? "+" : ""}${staleCopyConfidenceAdjustment} points.`
      : "Lane history left stale-copy confidence neutral."
  ];

  return {
    status: "APPLIED",
    laneKey: summary.laneKey,
    laneLabel: summary.laneLabel,
    sportsbookIdentity,
    role,
    surfaced: summary.surfaced,
    closed: summary.closed,
    requiredSurfaced: MIN_SURFACED,
    requiredClosed: MIN_CLOSED,
    leaderFrequency,
    confirmerFrequency,
    lagFrequency,
    staleCopyFrequency,
    beatClosePct,
    averageTruthScore,
    influenceAdjustment,
    pathConfidenceAdjustment,
    staleCopyConfidenceAdjustment,
    notes
  };
}

async function loadLeadershipRows(args?: {
  league?: LeagueKey | "ALL";
  since?: Date;
}) {
  if (!hasUsableServerDatabaseUrl()) {
    return [] as LeadershipHistoryRow[];
  }

  const leagueFilter =
    args?.league && args.league !== "ALL"
      ? Prisma.sql`AND "league" = ${args.league}`
      : Prisma.empty;
  const sinceFilter = args?.since
    ? Prisma.sql`AND "surfacedAt" >= ${args.since}`
    : Prisma.sql`AND "surfacedAt" >= NOW() - INTERVAL '${LOOKBACK_DAYS} days'`;

  return prisma.$queryRaw<LeadershipHistoryRow[]>`
    SELECT
      "league",
      "marketType",
      "marketEfficiency",
      "sportsbookKey",
      "sportsbookName",
      "clvResult",
      "normalizedTruthScore",
      "metadataJson"
    FROM "opportunity_surface_records"
    WHERE 1 = 1
    ${leagueFilter}
    ${sinceFilter}
      AND COALESCE("sportsbookKey", "sportsbookName") IS NOT NULL
      AND "metadataJson" IS NOT NULL
    ORDER BY "surfacedAt" DESC
    LIMIT 6000
  `;
}

export function createOpportunityBookLeadershipResolver(args?: {
  summaries?: OpportunityBookLeadershipSummaryRow[];
}): OpportunityBookLeadershipResolver {
  const summaryByKey = new Map(
    (args?.summaries ?? []).map((summary) => [`${summary.laneKey}::${summary.sportsbookIdentity}`, summary])
  );

  return {
    resolve(context) {
      return resolveFromSummary(summaryByKey, context);
    }
  };
}

export async function getOpportunityBookLeadershipResolver(args?: {
  league?: LeagueKey | "ALL";
  since?: Date;
}) {
  const rows = await loadLeadershipRows(args).catch(() => []);
  const summaryByKey = summarizeLeadershipRows(rows);

  return {
    resolve(context) {
      return resolveFromSummary(summaryByKey, context);
    }
  } satisfies OpportunityBookLeadershipResolver;
}

export function buildOpportunityBookLeadershipSummary(view: OpportunityBookLeadershipView) {
  if (view.status === "APPLIED") {
    return `Book lane ${view.role.toLowerCase()} with ${view.surfaced}/${view.closed} samples and ${view.influenceAdjustment >= 0 ? "+" : ""}${view.influenceAdjustment.toFixed(2)} influence.`;
  }

  return view.notes[0] ?? "Book leadership stayed neutral.";
}
