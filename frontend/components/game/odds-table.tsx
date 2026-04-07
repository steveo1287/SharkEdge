import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { formatLongDate } from "@/lib/formatters/date";
import { americanToImplied, stripVig } from "@/lib/odds/index";
import type { MatchupDetailView } from "@/lib/types/domain";

type OddsTableProps = {
  detail: MatchupDetailView;
  spotlight?: {
    marketType: "spread" | "moneyline" | "total";
    sportsbookName: string | null;
  } | null;
};

function isMissingMarket(value: string) {
  return !value || value === "Pending" || value === "No market" || value === "-";
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function formatCell(args: {
  value: string;
  bestHint: string | null;
  decisionTarget?: boolean;
}) {
  const { value, bestHint, decisionTarget = false } = args;

  if (isMissingMarket(value)) {
    return <span className="text-slate-500">-</span>;
  }

  const highlighted = bestHint && value.includes(bestHint);
  const prices = Array.from(value.matchAll(/([+-]\d{2,4})/g))
    .map((match) => Number(match[1]))
    .filter((price) => Number.isFinite(price));
  const noVig =
    prices.length >= 2
      ? stripVig(
          prices
            .map((price) => americanToImplied(price))
            .filter((probability): probability is number => typeof probability === "number")
        )
      : [];

  return (
    <div
      className={
        decisionTarget
          ? "rounded-[0.9rem] border border-sky-400/20 bg-sky-500/10 px-3 py-2"
          : undefined
      }
    >
      <div className="flex flex-col gap-1.5">
        <span
          className={
            decisionTarget || highlighted ? "font-medium text-white" : "text-slate-300"
          }
        >
          {value}
        </span>
        {decisionTarget ? (
          <span className="text-[11px] uppercase tracking-[0.18em] text-sky-200">
            Decision target
          </span>
        ) : highlighted ? (
          <span className="text-[11