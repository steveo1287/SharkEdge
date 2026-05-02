export type TwoSidedAmericanOdds = {
  sideA: number | null | undefined;
  sideB: number | null | undefined;
};

export type NoVigMarket = {
  sideAImplied: number | null;
  sideBImplied: number | null;
  sideANoVig: number | null;
  sideBNoVig: number | null;
  vigPct: number | null;
};

export type ModelMarketComparison = {
  modelProbability: number | null;
  marketProbability: number | null;
  closeProbability: number | null;
  edgePct: number | null;
  closeEdgePct: number | null;
  clvPct: number | null;
  verdict: "MODEL_EDGE" | "MARKET_ALIGNED" | "MARKET_LEAN" | "INSUFFICIENT_DATA";
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function clampProbability(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return null;
  return Math.max(0.001, Math.min(0.999, value));
}

export function americanOddsToImpliedProbability(odds: number | null | undefined) {
  if (!isFiniteNumber(odds) || odds === 0) return null;
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

export function impliedProbabilityToAmericanOdds(probability: number | null | undefined) {
  const p = clampProbability(probability);
  if (p == null) return null;
  if (p >= 0.5) return Math.round((-100 * p) / (1 - p));
  return Math.round((100 * (1 - p)) / p);
}

export function removeVigFromTwoSidedProbabilities(sideA: number | null | undefined, sideB: number | null | undefined): NoVigMarket {
  const a = clampProbability(sideA);
  const b = clampProbability(sideB);
  if (a == null || b == null) {
    return {
      sideAImplied: a,
      sideBImplied: b,
      sideANoVig: null,
      sideBNoVig: null,
      vigPct: null
    };
  }

  const total = a + b;
  if (!Number.isFinite(total) || total <= 0) {
    return {
      sideAImplied: a,
      sideBImplied: b,
      sideANoVig: null,
      sideBNoVig: null,
      vigPct: null
    };
  }

  return {
    sideAImplied: a,
    sideBImplied: b,
    sideANoVig: a / total,
    sideBNoVig: b / total,
    vigPct: total - 1
  };
}

export function removeVigFromAmericanOdds(odds: TwoSidedAmericanOdds): NoVigMarket {
  return removeVigFromTwoSidedProbabilities(
    americanOddsToImpliedProbability(odds.sideA),
    americanOddsToImpliedProbability(odds.sideB)
  );
}

export function probabilityEdgePct(modelProbability: number | null | undefined, marketProbability: number | null | undefined) {
  const model = clampProbability(modelProbability);
  const market = clampProbability(marketProbability);
  if (model == null || market == null) return null;
  return (model - market) * 100;
}

export function closingLineValuePct(modelProbability: number | null | undefined, closeProbability: number | null | undefined) {
  return probabilityEdgePct(modelProbability, closeProbability);
}

export function compareModelToMarket(args: {
  modelProbability: number | null | undefined;
  marketProbability?: number | null;
  closeProbability?: number | null;
}): ModelMarketComparison {
  const modelProbability = clampProbability(args.modelProbability);
  const marketProbability = clampProbability(args.marketProbability);
  const closeProbability = clampProbability(args.closeProbability);
  const edgePct = probabilityEdgePct(modelProbability, marketProbability);
  const closeEdgePct = probabilityEdgePct(modelProbability, closeProbability);
  const clvPct = closingLineValuePct(marketProbability, closeProbability);

  let verdict: ModelMarketComparison["verdict"] = "INSUFFICIENT_DATA";
  if (edgePct != null) {
    if (edgePct >= 2) verdict = "MODEL_EDGE";
    else if (edgePct <= -2) verdict = "MARKET_LEAN";
    else verdict = "MARKET_ALIGNED";
  }

  return {
    modelProbability,
    marketProbability,
    closeProbability,
    edgePct,
    closeEdgePct,
    clvPct,
    verdict
  };
}
