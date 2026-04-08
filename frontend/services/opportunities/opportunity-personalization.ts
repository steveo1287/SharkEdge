import type { LeagueKey } from "@/lib/types/domain";
import type { PerformanceDashboardView } from "@/lib/types/ledger";
import type {
  OpportunityPersonalizationAdjustment,
  OpportunityProfile,
  OpportunityView
} from "@/lib/types/opportunity";

function labelSetFromSegments(segments: string[], matcher: RegExp) {
  return new Set(
    segments
      .map((segment) => {
        const match = segment.match(matcher);
        return match?.[1]?.trim() ?? null;
      })
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase())
  );
}

function normalizeMarketType(marketType: string) {
  return marketType.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeSportsbookName(name: string | null | undefined) {
  return (name ?? "").trim().toLowerCase();
}

function normalizeTimingState(timingState: string) {
  return timingState.trim().toLowerCase();
}

function clampAdjustmentTotal(
  adjustments: OpportunityPersonalizationAdjustment[],
  min = -8,
  max = 8
) {
  let running = 0;
  const result: OpportunityPersonalizationAdjustment[] = [];

  for (const adjustment of adjustments) {
    const next = running + adjustment.delta;

    if (next > max) {
      const clipped = max - running;
      if (clipped !== 0) {
        result.push({ ...adjustment, delta: clipped });
        running = max;
      }
      continue;
    }

    if (next < min) {
      const clipped = min - running;
      if (clipped !== 0) {
        result.push({ ...adjustment, delta: clipped });
        running = min;
      }
      continue;
    }

    result.push(adjustment);
    running = next;
  }

  return result.filter((adjustment) => adjustment.delta !== 0);
}

export function buildOpportunityProfile(
  performance: PerformanceDashboardView | null | undefined
): OpportunityProfile | null {
  if (!performance || performance.setup) {
    return null;
  }

  const preferredLeagues = new Set<LeagueKey>(
    performance.byLeague
      .filter((row) => row.bets >= 6 && row.roi > 0 && (row.clv ?? 0) >= -1)
      .map((row) => row.label as LeagueKey)
  );

  const weakLeagues = new Set<LeagueKey>(
    performance.byLeague
      .filter((row) => row.bets >= 6 && row.roi < 0)
      .map((row) => row.label as LeagueKey)
  );

  const preferredMarkets = new Set(
    performance.byMarket
      .filter((row) => row.bets >= 6 && row.roi > 0)
      .map((row) => normalizeMarketType(row.label))
  );

  const weakMarkets = new Set(
    performance.byMarket
      .filter((row) => row.bets >= 6 && row.roi < 0)
      .map((row) => normalizeMarketType(row.label))
  );

  const preferredSportsbooks = new Set(
    performance.bySportsbook
      .filter((row) => row.bets >= 6 && row.roi > 0)
      .map((row) => normalizeSportsbookName(row.label))
      .filter(Boolean)
  );

  const weakSportsbooks = new Set(
    performance.bySportsbook
      .filter((row) => row.bets >= 6 && row.roi < 0)
      .map((row) => normalizeSportsbookName(row.label))
      .filter(Boolean)
  );

  return {
    preferredLeagues,
    weakLeagues,
    preferredMarkets,
    weakMarkets,
    preferredSportsbooks,
    weakSportsbooks,
    preferredTimingLabels: labelSetFromSegments(
      performance.bestSegments,
      /^Timing:\s*(.+)$/i
    ),
    weakTimingLabels: labelSetFromSegments(
      performance.worstSegments,
      /^Timing:\s*(.+)$/i
    )
  };
}

export function buildOpportunityPersonalization(args: {
  opportunity: Pick<
    OpportunityView,
    "league" | "marketType" | "sportsbookName" | "timingState"
  >;
  profile?: OpportunityProfile | null;
}): OpportunityPersonalizationAdjustment[] {
  const profile = args.profile;

  if (!profile) {
    return [];
  }

  const adjustments: OpportunityPersonalizationAdjustment[] = [];
  const marketLabel = normalizeMarketType(args.opportunity.marketType);
  const sportsbookLabel = normalizeSportsbookName(args.opportunity.sportsbookName);
  const timingLabel = normalizeTimingState(args.opportunity.timingState);

  if (profile.preferredLeagues.has(args.opportunity.league)) {
    adjustments.push({
      kind: "league",
      delta: 4,
      note: `You have performed better in ${args.opportunity.league} than your baseline.`
    });
  } else if (profile.weakLeagues.has(args.opportunity.league)) {
    adjustments.push({
      kind: "league",
      delta: -4,
      note: `${args.opportunity.league} has been a weaker league in your tracked results.`
    });
  }

  if (profile.preferredMarkets.has(marketLabel)) {
    adjustments.push({
      kind: "market",
      delta: 3,
      note: `${args.opportunity.marketType} has been one of your stronger tracked markets.`
    });
  } else if (profile.weakMarkets.has(marketLabel)) {
    adjustments.push({
      kind: "market",
      delta: -3,
      note: `${args.opportunity.marketType} has underperformed in your tracked history.`
    });
  }

  if (sportsbookLabel && profile.preferredSportsbooks.has(sportsbookLabel)) {
    adjustments.push({
      kind: "sportsbook",
      delta: 2,
      note: `${args.opportunity.sportsbookName} has been a stronger book for your tracked entries.`
    });
  } else if (sportsbookLabel && profile.weakSportsbooks.has(sportsbookLabel)) {
    adjustments.push({
      kind: "sportsbook",
      delta: -2,
      note: `${args.opportunity.sportsbookName} has been a weaker book for your tracked results.`
    });
  }

  if (profile.preferredTimingLabels.has(timingLabel)) {
    adjustments.push({
      kind: "timing",
      delta: 2,
      note: `${args.opportunity.timingState.replace(/_/g, " ")} has been a stronger timing lane for you.`
    });
  } else if (profile.weakTimingLabels.has(timingLabel)) {
    adjustments.push({
      kind: "timing",
      delta: -2,
      note: `${args.opportunity.timingState.replace(/_/g, " ")} has been a weaker timing lane for you.`
    });
  }

  return clampAdjustmentTotal(adjustments);
}