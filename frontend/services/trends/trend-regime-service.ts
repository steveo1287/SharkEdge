function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function buildTrendRegimeFit(input: {
  marketType: string;
  league: string;
  weatherDelta?: number | null;
  volatility?: number | null;
}) {
  const marketWeight =
    input.marketType.toLowerCase().includes("moneyline") ? 0.68 :
    input.marketType.toLowerCase().includes("total") ? 0.62 :
    0.58;

  const weatherPenalty = Math.abs(input.weatherDelta ?? 0) * 0.22;
  const volatilityPenalty = Math.abs(input.volatility ?? 0) * 0.18;

  return Number(clamp(marketWeight - weatherPenalty - volatilityPenalty + 0.12, 0.18, 0.96).toFixed(4));
}
