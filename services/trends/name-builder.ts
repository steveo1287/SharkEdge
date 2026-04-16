import type { TrendCondition } from "./types";

function compactLabel(condition: TrendCondition) {
  return condition.label
    .replace(/^Team /i, "")
    .replace(/^Opponent /i, "Opp ")
    .replace(/^Recent /i, "")
    .replace(/^Days rest /i, "Rest ")
    .trim();
}

export function buildTrendSystemName(args: {
  league: string;
  marketType: string;
  side: string;
  conditions: TrendCondition[];
}) {
  const head = args.conditions.slice(0, 3).map(compactLabel).join(" • ");
  const market = `${args.marketType} ${args.side}`.replace(/^moneyline /, "ML ").replace(/^spread /, "Spread ").replace(/^total /, "Total ");
  return head ? `${head} ${market}` : `${args.league} ${market}`;
}
