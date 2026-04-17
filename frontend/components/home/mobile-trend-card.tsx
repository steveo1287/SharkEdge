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

function formatAmericanOdds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return value > 0 ? `+${value}` : `${value}`;
}

function edgeToneClass(edgeBand: string | null | undefined) {
  if (edgeBand === "elite") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (edgeBand === "strong") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (edgeBand === "watch") return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  return "border-white/8 text-slate-400";
}

export function MobileTrendCard({ card, featured = false }: MobileTrendCardProps) {
  const liveMatch = ({
    edgePct: card.liveEdgePct ?? ((card.todayMatches?.[0] as any)?.edgePct ?? null),
    currentOdds: (card.todayMatches?.[0] as any)?.currentOdds ?? null,
    fairOdds: card.liveFairOdds ?? ((card.todayMatches?.[0] as any)?.fairOdds ?? null),
    playableOdds: card.livePlayableOdds ?? ((card.todayMatches?.[0] as any)?.playableOdds ?? null),
    edgeBand: card.liveEdgeBand ?? ((card.todayMatches?.[0] as any)?.edgeBand ?? null),
    flags: card.liveFlags?.length ? card.liveFlags : ((card.todayMatches?.[0] as any)?.flags ?? null)
  } ?? null) as
    | {
        edgePct?: number | null;
        currentOdds?: number | null;
        fairOdds?: number | null;
        playableOdds?: number | null;
        edgeBand?: string | null;
        flags?: string[] | null;
      }
    | null;

  return (
    <Link
      href={card.href}
      className={cn(
        "mobile-trend-card",
        featured ? "min-w-[248px] max-w-[248px]" : "min-w-[218px] max-w-[218px]"
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

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-[2.25rem] font-black leading-none text-[#2dd36f]">
            {card.primaryMetricLabel === "RECORD" ? card.record : card.primaryMetricValue}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">
            {card.primaryMetricLabel === "RECORD" ? "Record" : card.primaryMetricLabel}
          </div>
        </div>
        {typeof liveMatch?.edgePct === "number" ? (
          <div className={cn("rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em]", edgeToneClass(liveMatch.edgeBand))}>
            {liveMatch.edgePct > 0 ? "+" : ""}
            {liveMatch.edgePct.toFixed(1)}% edge
          </div>
        ) : null}
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

      {liveMatch ? (
        <div className="mt-4 rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-2.5 text-[11px]">
          <div className="grid grid-cols-3 gap-2 text-slate-300">
            <div>
              <div className="uppercase tracking-[0.14em] text-slate-500">Current</div>
              <div className="mt-1 font-semibold text-white">{formatAmericanOdds(liveMatch.currentOdds)}</div>
            </div>
            <div>
              <div className="uppercase tracking-[0.14em] text-slate-500">Fair</div>
              <div className="mt-1 font-semibold text-white">{formatAmericanOdds(liveMatch.fairOdds)}</div>
            </div>
            <div>
              <div className="uppercase tracking-[0.14em] text-slate-500">Playable</div>
              <div className="mt-1 font-semibold text-white">{formatAmericanOdds(liveMatch.playableOdds)}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-2 text-[11px]">
        <div className="flex items-center gap-2 text-[#2dd36f]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2dd36f]" />
          <span>Active on {card.todayMatches.length || 1} game</span>
        </div>
        <div className="flex flex-wrap gap-2 text-slate-400">
          {(liveMatch?.flags ?? []).slice(0, 2).map((flag) => (
            <span key={flag} className="rounded-full border border-white/8 px-2 py-0.5">
              {flag}
            </span>
          ))}
          {!liveMatch?.flags?.length ? (
            <span className="text-[#ff9b3f]">{Math.max(card.todayMatches.length, 1)} tailing today</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
