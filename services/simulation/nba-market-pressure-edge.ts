import type { NbaNoVigMarket } from "@/services/simulation/nba-market-sanity";

export type NbaMarketPressureEdge = {
  modelVersion: "nba-market-pressure-edge-v1";
  available: boolean;
  marketHomeNoVig: number | null;
  marketAwayNoVig: number | null;
  marketImpliedHomeMargin: number | null;
  projectedHomeMargin: number;
  modelMarketMarginGap: number | null;
  moneylineSpreadAlignment: number;
  totalVolatilityPressure: number;
  holdQuality: number;
  favoritePressure: number;
  dogVolatilityPressure: number;
  staleRiskProxy: number;
  marketTrustScore: number;
  marketConflictScore: number;
  homeMarketPressureEdge: number;
  marginDelta: number;
  totalDelta: number;
  probabilityDelta: number;
  confidence: number;
  warnings: string[];
  drivers: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function logit(probability: number) {
  const p = clamp(probability, 0.01, 0.99);
  return Math.log(p / (1 - p));
}

function probabilityToNbaMargin(probability: number) {
  return clamp(logit(probability) * 7.5, -18, 18);
}

function marketHomeProbability(market: NbaNoVigMarket | null | undefined) {
  const home = market?.homeNoVigProbability;
  const away = market?.awayNoVigProbability;
  if (typeof home !== "number" || typeof away !== "number") return null;
  const total = home + away;
  if (!Number.isFinite(total) || total <= 0) return null;
  return clamp(home / total, 0.01, 0.99);
}

function spreadAlignment(marketMargin: number | null, spreadLine: number | null | undefined) {
  if (marketMargin == null || typeof spreadLine !== "number" || !Number.isFinite(spreadLine)) return 0.5;
  const marketSpreadHomeMargin = -spreadLine;
  const gap = Math.abs(marketMargin - marketSpreadHomeMargin);
  return clamp(1 - gap / 8, 0, 1);
}

function holdQuality(hold: number | null | undefined) {
  if (typeof hold !== "number" || !Number.isFinite(hold)) return 0.42;
  return clamp(1 - Math.max(0, hold - 0.025) / 0.075, 0, 1);
}

function totalPressure(totalLine: number | null | undefined) {
  if (typeof totalLine !== "number" || !Number.isFinite(totalLine)) return 0.35;
  return clamp((totalLine - 219) / 28, -0.65, 1);
}

export function buildNbaMarketPressureEdge(args: {
  market: NbaNoVigMarket | null | undefined;
  projectedHomeMargin: number;
  projectedTotal: number | null | undefined;
}): NbaMarketPressureEdge {
  const homeProbability = marketHomeProbability(args.market);
  const marketMargin = homeProbability == null ? null : probabilityToNbaMargin(homeProbability);
  const modelMarketMarginGap = marketMargin == null ? null : args.projectedHomeMargin - marketMargin;
  const alignment = spreadAlignment(marketMargin, args.market?.spreadLine);
  const hold = holdQuality(args.market?.hold);
  const totalVolatilityPressure = totalPressure(args.market?.totalLine ?? args.projectedTotal);
  const favoritePressure = homeProbability == null ? 0 : clamp(Math.abs(homeProbability - 0.5) / 0.22, 0, 1);
  const dogVolatilityPressure = clamp((1 - favoritePressure) * 0.5 + Math.max(0, totalVolatilityPressure) * 0.35 + (1 - alignment) * 0.3, 0, 1.25);
  const staleRiskProxy = clamp((1 - alignment) * 0.48 + (1 - hold) * 0.28 + Math.abs(modelMarketMarginGap ?? 0) / 18 * 0.24, 0, 1);
  const marketTrustScore = clamp(hold * 0.34 + alignment * 0.34 + (1 - staleRiskProxy) * 0.2 + (args.market?.available ? 0.12 : 0), 0, 1);
  const marketConflictScore = clamp((1 - alignment) * 0.38 + staleRiskProxy * 0.36 + Math.abs(modelMarketMarginGap ?? 0) / 11 * 0.26, 0, 1.35);
  const homeMarketPressureEdge = modelMarketMarginGap == null
    ? 0
    : clamp(-modelMarketMarginGap / 12 * marketTrustScore, -1, 1);

  // This edge intentionally pushes lightly toward market when model-market gap is large
  // and market quality is decent. If the market looks conflicted/stale, it mostly caps
  // confidence through warnings instead of forcing a side.
  const marginDelta = clamp(homeMarketPressureEdge * 1.6 * marketTrustScore, -1.8, 1.8);
  const totalDelta = clamp(totalVolatilityPressure * 2.4 * marketTrustScore - staleRiskProxy * 1.4, -5.5, 5.5);
  const probabilityDelta = clamp(marginDelta * 0.0105, -0.014, 0.014);
  const confidence = clamp(marketTrustScore * 0.72 + hold * 0.16 + alignment * 0.12, 0.08, 0.94);
  const warnings: string[] = [];
  if (!args.market?.available) warnings.push("NBA market pressure edge missing usable market");
  if (alignment < 0.45) warnings.push("NBA moneyline/spread alignment is weak");
  if (hold < 0.45) warnings.push("NBA market hold quality is weak");
  if (marketConflictScore > 0.75) warnings.push("NBA market conflict score is elevated");
  if (Math.abs(modelMarketMarginGap ?? 0) > 7) warnings.push("NBA model-market margin gap exceeds 7 points");

  return {
    modelVersion: "nba-market-pressure-edge-v1",
    available: Boolean(args.market?.available && homeProbability != null),
    marketHomeNoVig: homeProbability == null ? null : round(homeProbability),
    marketAwayNoVig: homeProbability == null ? null : round(1 - homeProbability),
    marketImpliedHomeMargin: marketMargin == null ? null : round(marketMargin, 3),
    projectedHomeMargin: round(args.projectedHomeMargin, 3),
    modelMarketMarginGap: modelMarketMarginGap == null ? null : round(modelMarketMarginGap, 3),
    moneylineSpreadAlignment: round(alignment),
    totalVolatilityPressure: round(totalVolatilityPressure),
    holdQuality: round(hold),
    favoritePressure: round(favoritePressure),
    dogVolatilityPressure: round(dogVolatilityPressure),
    staleRiskProxy: round(staleRiskProxy),
    marketTrustScore: round(marketTrustScore),
    marketConflictScore: round(marketConflictScore),
    homeMarketPressureEdge: round(homeMarketPressureEdge),
    marginDelta: round(marginDelta),
    totalDelta: round(totalDelta),
    probabilityDelta: round(probabilityDelta),
    confidence: round(confidence),
    warnings,
    drivers: [
      homeProbability == null ? "market no-vig unavailable" : `market home ${(homeProbability * 100).toFixed(1)}%`,
      marketMargin == null ? "market margin unavailable" : `market implied margin ${marketMargin.toFixed(2)}`,
      `projected margin ${args.projectedHomeMargin.toFixed(2)}`,
      modelMarketMarginGap == null ? "model-market gap unavailable" : `model-market gap ${modelMarketMarginGap.toFixed(2)}`,
      `moneyline/spread alignment ${(alignment * 100).toFixed(1)}%`,
      `hold quality ${(hold * 100).toFixed(1)}%`,
      `market trust ${(marketTrustScore * 100).toFixed(1)}%`,
      `market conflict ${(marketConflictScore * 100).toFixed(1)}%`,
      `stale risk proxy ${(staleRiskProxy * 100).toFixed(1)}%`,
      `market pressure margin delta ${marginDelta.toFixed(2)}`,
      `market pressure probability delta ${(probabilityDelta * 100).toFixed(1)}%`
    ]
  };
}
