type ResultMarket = {
  id: string;
  marketType: string;
  side: string | null;
  line: number | null;
  selectionCompetitorId?: string | null;
};

type SideResult = "WIN" | "LOSS" | "PUSH";

function numericScore(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function summarizeSideResults(results: SideResult[]) {
  const wins = results.filter((result) => result === "WIN").length;
  const losses = results.filter((result) => result === "LOSS").length;
  const pushes = results.filter((result) => result === "PUSH").length;

  if (wins === losses && losses === pushes) {
    return null;
  }

  if (wins >= losses && wins >= pushes) {
    return "WIN";
  }

  if (losses >= wins && losses >= pushes) {
    return "LOSS";
  }

  return "PUSH";
}

export function deriveCoverResult(args: {
  markets: ResultMarket[];
  homeCompetitorId?: string | null;
  awayCompetitorId?: string | null;
  homeScore: number | string | null | undefined;
  awayScore: number | string | null | undefined;
}) {
  const homeScore = numericScore(args.homeScore);
  const awayScore = numericScore(args.awayScore);

  if (homeScore === null || awayScore === null) {
    return null;
  }

  const relevantMarkets = args.markets.filter(
    (market) => market.marketType === "spread" && typeof market.line === "number"
  );

  if (!relevantMarkets.length) {
    return null;
  }

  const byMarket: Record<string, SideResult> = {};
  const bySideBuckets: Record<string, SideResult[]> = {
    HOME: [],
    AWAY: [],
    COMPETITOR_A: [],
    COMPETITOR_B: []
  };

  for (const market of relevantMarkets) {
    let selectedScore: number | null = null;
    let opponentScore: number | null = null;

    if (
      market.side === "HOME" ||
      (args.homeCompetitorId && market.selectionCompetitorId === args.homeCompetitorId)
    ) {
      selectedScore = homeScore;
      opponentScore = awayScore;
    } else if (
      market.side === "AWAY" ||
      (args.awayCompetitorId && market.selectionCompetitorId === args.awayCompetitorId)
    ) {
      selectedScore = awayScore;
      opponentScore = homeScore;
    } else {
      continue;
    }

    const adjustedMargin = selectedScore + market.line! - opponentScore;
    const result: SideResult =
      adjustedMargin > 0 ? "WIN" : adjustedMargin < 0 ? "LOSS" : "PUSH";

    byMarket[market.id] = result;

    if (market.side && market.side in bySideBuckets) {
      bySideBuckets[market.side].push(result);
    }
  }

  const homeSummary = summarizeSideResults(bySideBuckets.HOME);
  const awaySummary = summarizeSideResults(bySideBuckets.AWAY);
  const competitorASummary = summarizeSideResults(bySideBuckets.COMPETITOR_A);
  const competitorBSummary = summarizeSideResults(bySideBuckets.COMPETITOR_B);

  if (
    !homeSummary &&
    !awaySummary &&
    !competitorASummary &&
    !competitorBSummary &&
    !Object.keys(byMarket).length
  ) {
    return null;
  }

  return {
    ...(homeSummary ? { HOME: homeSummary } : {}),
    ...(awaySummary ? { AWAY: awaySummary } : {}),
    ...(competitorASummary ? { COMPETITOR_A: competitorASummary } : {}),
    ...(competitorBSummary ? { COMPETITOR_B: competitorBSummary } : {}),
    byMarket
  };
}

export function deriveOuResult(args: {
  markets: ResultMarket[];
  totalPoints: number | string | null | undefined;
}) {
  const totalPoints = numericScore(args.totalPoints);
  if (totalPoints === null) {
    return null;
  }

  const relevantMarkets = args.markets
    .filter((market) => market.marketType === "total" && typeof market.line === "number")
    .sort((left, right) => (left.line ?? 0) - (right.line ?? 0));

  if (!relevantMarkets.length) {
    return null;
  }

  const median = relevantMarkets[Math.floor(relevantMarkets.length / 2)]?.line;
  if (typeof median !== "number") {
    return null;
  }

  if (totalPoints > median) {
    return "OVER";
  }

  if (totalPoints < median) {
    return "UNDER";
  }

  return "PUSH";
}
