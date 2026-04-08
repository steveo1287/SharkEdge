import type { LeagueKey } from "@/lib/types/domain";
import type { PerformanceDashboardView } from "@/lib/types/ledger";
import type {
  OpportunityPersonalizationAdjustment,
  OpportunityProfile,
  OpportunityView
} from "@/lib/types/opportunity";

const SAMPLE_THRESHOLDS = {
  league: 20,
  market: 18,
  sportsbook: 12,
  timing: 16
} as const;

function labelSetFromSegments(segments: string[], matcher: RegExp) {
  return new Set(
    segments
      .map((segment) => {
        const match = segment.match(matcher);
        return match?.[1]?.trim() ?? null;
      })
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizeLabel(value))
  );
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeMarketType(marketType: string) {
  return normalizeLabel(marketType);
}

function normalizeSportsbookName(name: string | null | undefined) {
  return normalizeLabel(name ?? "");
}

function normalizeTimingState(timingState: string) {
  return normalizeLabel(timingState);
}

function buildSampleMap(rows: Array<{ label: string; bets: number }>) {
  return new Map(rows.map((row) => [normalizeLabel(row.label), row.bets] as const));
}

function clampAdjustmentTotal(
  adjustments: OpportunityPersonalizationAdjustment[],
  min = -4,
  max = 4
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

function passedSampleGate(sampleSize: number | null, threshold: number) {
  return typeof sampleSize === "number" && sampleSize >= threshold;
}

function makeAdjustment(args: {
  kind: OpportunityPersonalizationAdjustment["kind"];
  delta: number;
  note: string;
  sampleSize: number | null;
  threshold: number;
}) {
  if (!passedSampleGate(args.sampleSize, args.threshold)) {
    return null;
  }

  return {
    kind: args.kind,
    delta: args.delta,
    note: args.note,
    sampleSize: args.sampleSize,
    qualityGate: "PASSED"
  } satisfies OpportunityPersonalizationAdjustment;
}

export function buildOpportunityProfile(
  performance: PerformanceDashboardView | null | undefined
): OpportunityProfile | null {
  if (!performance || performance.setup) {
    return null;
  }

  const leagueSamples = buildSampleMap(performance.byLeague);
  const marketSamples = buildSampleMap(performance.byMarket);
  const sportsbookSamples = buildSampleMap(performance.bySportsbook);

  const preferredLeagues = new Set<LeagueKey>(
    performance.byLeague
      .filter(
        (row) =>
          row.bets >= SAMPLE_THRESHOLDS.league &&
          row.roi > 0 &&
          (row.clv ?? 0) >= -1
      )
      .map((row) => row.label as LeagueKey)
  );

  const weakLeagues = new Set<LeagueKey>(
    performance.byLeague
      .filter((row) => row.bets >= SAMPLE_THRESHOLDS.league && row.roi < 0)
      .map((row) => row.label as LeagueKey)
  );

  const preferredMarkets = new Set(
    performance.byMarket
      .filter((row) => row.bets >= SAMPLE_THRESHOLDS.market && row.roi > 0)
      .map((row) => normalizeMarketType(row.label))
  );

  const weakMarkets = new Set(
    performance.byMarket
      .filter((row) => row.bets >= SAMPLE_THRESHOLDS.market && row.roi < 0)
      .map((row) => normalizeMarketType(row.label))
  );

  const preferredSportsbooks = new Set(
    performance.bySportsbook
      .filter((row) => row.bets >= SAMPLE_THRESHOLDS.sportsbook && row.roi > 0)
      .map((row) => normalizeSportsbookName(row.label))
      .filter(Boolean)
  );

  const weakSportsbooks = new Set(
    performance.bySportsbook
      .filter((row) => row.bets >= SAMPLE_THRESHOLDS.sportsbook && row.roi < 0)
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
    ),
    sampleSizes: {
      leagues: leagueSamples,
      markets: marketSamples,
      sportsbooks: sportsbookSamples,
      timing: buildSampleMap(performance.byTiming)
    }
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
  const leagueLabel = args.opportunity.league;
  const marketLabel = normalizeMarketType(args.opportunity.marketType);
  const sportsbookLabel = normalizeSportsbookName(args.opportunity.sportsbookName);
  const timingLabel = normalizeTimingState(args.opportunity.timingState);
  const leagueSample = profile.sampleSizes.leagues.get(normalizeLabel(leagueLabel)) ?? null;
  const marketSample = profile.sampleSizes.markets.get(marketLabel) ?? null;
  const sportsbookSample = sportsbookLabel
    ? profile.sampleSizes.sportsbooks.get(sportsbookLabel) ?? null
    : null;
  const timingSample = profile.sampleSizes.timing.get(timingLabel) ?? null;

  if (profile.preferredLeagues.has(args.opportunity.league)) {
    const adjustment = makeAdjustment({
      kind: "league",
      delta: 2,
      note: `${args.opportunity.league} has cleared the personalization sample gate with positive tracked ROI.`,
      sampleSize: leagueSample,
      threshold: SAMPLE_THRESHOLDS.league
    });
    if (adjustment) adjustments.push(adjustment);
  } else if (profile.weakLeagues.has(args.opportunity.league)) {
    const adjustment = makeAdjustment({
      kind: "league",
      delta: -2,
      note: `${args.opportunity.league} has cleared the sample gate as a weaker tracked league.`,
      sampleSize: leagueSample,
      threshold: SAMPLE_THRESHOLDS.league
    });
    if (adjustment) adjustments.push(adjustment);
  }

  if (profile.preferredMarkets.has(marketLabel)) {
    const adjustment = makeAdjustment({
      kind: "market",
      delta: 1.5,
      note: `${args.opportunity.marketType} has cleared the market sample gate with positive tracked ROI.`,
      sampleSize: marketSample,
      threshold: SAMPLE_THRESHOLDS.market
    });
    if (adjustment) adjustments.push(adjustment);
  } else if (profile.weakMarkets.has(marketLabel)) {
    const adjustment = makeAdjustment({
      kind: "market",
      delta: -1.5,
      note: `${args.opportunity.marketType} has cleared the market sample gate as a weaker lane.`,
      sampleSize: marketSample,
      threshold: SAMPLE_THRESHOLDS.market
    });
    if (adjustment) adjustments.push(adjustment);
  }

  if (sportsbookLabel && profile.preferredSportsbooks.has(sportsbookLabel)) {
    const adjustment = makeAdjustment({
      kind: "sportsbook",
      delta: 1,
      note: `${args.opportunity.sportsbookName} has cleared the book sample gate with positive tracked ROI.`,
      sampleSize: sportsbookSample,
      threshold: SAMPLE_THRESHOLDS.sportsbook
    });
    if (adjustment) adjustments.push(adjustment);
  } else if (sportsbookLabel && profile.weakSportsbooks.has(sportsbookLabel)) {
    const adjustment = makeAdjustment({
      kind: "sportsbook",
      delta: -1,
      note: `${args.opportunity.sportsbookName} has cleared the book sample gate as a weaker source.`,
      sampleSize: sportsbookSample,
      threshold: SAMPLE_THRESHOLDS.sportsbook
    });
    if (adjustment) adjustments.push(adjustment);
  }

  if (profile.preferredTimingLabels.has(timingLabel)) {
    const adjustment = makeAdjustment({
      kind: "timing",
      delta: 1,
      note: `${args.opportunity.timingState.replace(/_/g, " ")} has cleared the timing sample gate.`,
      sampleSize: timingSample,
      threshold: SAMPLE_THRESHOLDS.timing
    });
    if (adjustment) adjustments.push(adjustment);
  } else if (profile.weakTimingLabels.has(timingLabel)) {
    const adjustment = makeAdjustment({
      kind: "timing",
      delta: -1,
      note: `${args.opportunity.timingState.replace(/_/g, " ")} has cleared the timing sample gate as a weaker lane.`,
      sampleSize: timingSample,
      threshold: SAMPLE_THRESHOLDS.timing
    });
    if (adjustment) adjustments.push(adjustment);
  }

  return clampAdjustmentTotal(adjustments);
}
