import type { MarketType } from "@/lib/types/domain";

export function formatAmericanOdds(odds: number) {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function formatLine(line: number | null, signed = true) {
  if (line === null || line === undefined) {
    return "--";
  }

  if (!signed) {
    return Number.isInteger(line) ? `${line}` : line.toFixed(1);
  }

  if (line > 0) {
    return `+${line}`;
  }

  return `${line}`;
}

export function formatMarketType(marketType: MarketType) {
  switch (marketType) {
    case "player_points":
      return "Points";
    case "player_rebounds":
      return "Rebounds";
    case "player_assists":
      return "Assists";
    case "player_threes":
      return "3PM";
    case "moneyline":
      return "Moneyline";
    case "spread":
      return "Spread";
    case "total":
      return "Total";
    default:
      return marketType;
  }
}

export function formatProbability(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatUnits(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}u`;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}
