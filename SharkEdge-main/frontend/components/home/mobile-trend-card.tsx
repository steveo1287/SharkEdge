import Link from "next/link";

import type { PublishedTrendCard } from "@/lib/trends/publisher";
import { cn } from "@/lib/utils/cn";

type MobileTrendCardProps = {
  card: PublishedTrendCard;
  featured?: boolean;
};

function formatUnits(value: number | null) {
  if (typeof value !== "number") {
    return "--";
  }

  return `${value > 0 ? "" : "-"}${Math.abs(value).toFixed(value >= 100 ? 1 : 2)}u`;
}

function formatPct(value: number | null) {
  if (typeof value !== "number") {
    return "--";
  }

  return `${value.toFixed(1)}%`;
}

export function MobileTrendCard({ card, featured = false }: MobileTrendCardProps) {
  const whyNow = card.whyNow[0] ?? card.railReason ?? "Trend is active on today's board.";

  return (
    <Link
      href={card.href}
      className={cn(
        "mobile-trend-card border-white/10 bg-[radial-gradient(circle_at_top,rgba(45,211,111,0.08),transparent_34%),linear-gradient(180deg,rgba(18,20,24,0.96),rgba(12,14,18,0.99))]",
        featured ? "min-w-[260px] max-w-[260px]" : "min-w-[228px] max-w-[228px]"
      )}
    >
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
        <div className="truncate">
          {card.leagueLabel} · {card.marketLabel}
        </div>
        <div className="rounded-full border border-white/8 px-2 py-0.5 text-[9px]">
          {card.confidence}
        </div>
      </div>

      <div className="mt-3 line-clamp-3 min-h-[60px] text-[1.02rem] font-semibold leading-5 text-white">
        {card.title}
      </div>

      <div className="mt-3 rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-2.5 text-[11px] leading-5 text-slate-300">
        {whyNow}
      </div>

      <div className="mt-4 text-[2.2rem] font-black leading-none text-[#2dd36f]">
        {card.primaryMetricLabel === "RECORD" ? card.record : card.primaryMetricValue}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">
        {card.primaryMetricLabel === "RECORD" ? "Record" : card.primaryMetricLabel}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/6 pt-3">
        <div>
          <div className="text-[1rem] font-semibold text-[#2dd36f]">{card.streak ?? "--"}</div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Streak</div>
        </div>
        <div>
          <div className="text-[1rem] font-semibold text-[#2dd36f]">{formatPct(card.hitRate)}</div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Win %</div>
        </div>
        <div>
          <div className="text-[1rem] font-semibold text-[#2dd36f]">{formatUnits(card.profitUnits)}</div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Profit</div>
        </div>
      </div>

      <div className="mt-4 space-y-2 text-[11px]">
        <div className="flex items-center gap-2 text-[#2dd36f]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2dd36f]" />
          <span>Active on {card.todayMatches.length || 1} game</span>
        </div>
        <div className="flex items-center gap-2 text-[#ff9b3f]">
          <span className="text-[12px]">HOT</span>
          <span>{Math.max(card.todayMatches.length, 1)} tailing today</span>
        </div>
      </div>
    </Link>
  );
}
