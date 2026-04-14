import Link from "next/link";

import { TeamBadge } from "@/components/identity/team-badge";
import type { EliteGameCardModel } from "@/app/_components/home/home-card-adapter";

function formatStartTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function getStateTone(state: EliteGameCardModel["state"]) {
  switch (state) {
    case "LIVE":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
    case "FINAL":
      return "border-slate-500/20 bg-slate-500/10 text-slate-300";
    default:
      return "border-sky-400/25 bg-sky-500/10 text-sky-200";
  }
}

function getEdgeTone(edgePercent: number | null) {
  if (edgePercent == null) return "text-slate-400";
  if (edgePercent >= 3) return "text-emerald-300";
  if (edgePercent >= 1.5) return "text-sky-300";
  return "text-amber-300";
}

export function EliteGameCard({
  card,
  compact = false
}: {
  card: EliteGameCardModel;
  compact?: boolean;
}) {
  return (
    <Link
      href={card.href}
      className="group rounded-[1.4rem] border border-white/8 bg-[#08111d]/95 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.25)] transition hover:border-sky-400/30 hover:bg-[#0b1524]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            {card.league}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] ${getStateTone(card.state)}`}
            >
              {card.state}
            </span>
            <span className="text-xs text-slate-400">{formatStartTime(card.startTime)}</span>
          </div>
        </div>

        {card.edgePercent != null ? (
          <div className={`text-right text-sm font-semibold ${getEdgeTone(card.edgePercent)}`}>
            {card.edgePercent > 0 ? "+" : ""}
            {card.edgePercent.toFixed(1)}%
            <div className="mt-1 text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">
              Edge
            </div>
          </div>
        ) : (
          <div className="text-right text-sm text-slate-500">No edge</div>
        )}
      </div>

      <div className="mt-4 grid gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <TeamBadge
              name={card.awayTeam.name}
              abbreviation={card.awayTeam.abbreviation}
              logoUrl={card.awayTeam.logoUrl}
              size="md"
              tone="away"
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{card.awayTeam.name}</div>
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                {card.awayTeam.abbreviation}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <TeamBadge
              name={card.homeTeam.name}
              abbreviation={card.homeTeam.abbreviation}
              logoUrl={card.homeTeam.logoUrl}
              size="md"
              tone="home"
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{card.homeTeam.name}</div>
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                {card.homeTeam.abbreviation}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="terminal-rule mt-4" />

      <div className={`mt-4 grid ${compact ? "gap-2" : "gap-3"}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-500">
            Best line
          </div>
          <div className="text-right text-sm font-medium text-white">
            {card.bestLineLabel ?? "Market context loading"}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-500">
            Confidence
          </div>
          <div className="text-sm font-medium text-slate-200">
            {card.confidenceLabel ?? "Unrated"}
          </div>
        </div>

        {card.selectionLabel ? (
          <div className="text-xs uppercase tracking-[0.16em] text-sky-300">
            {card.selectionLabel}
          </div>
        ) : null}

        <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-3 text-sm leading-6 text-slate-300">
          {card.reasonSummary ?? "No clear betting reason surfaced yet."}
        </div>
      </div>
    </Link>
  );
}
