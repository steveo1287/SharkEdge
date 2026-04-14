import Link from "next/link";

import { Badge } from "@/components/ui/badge";

type SlateCommandHeroProps = {
  verifiedGames: number;
  liveGames: number;
  trackedProps: number;
  trackedPlayers: number;
  sourceNote: string;
  providerLabel: string;
};

export function SlateCommandHero({
  verifiedGames,
  liveGames,
  trackedProps,
  trackedPlayers,
  sourceNote,
  providerLabel
}: SlateCommandHeroProps) {
  return (
    <section className="surface-panel-strong overflow-hidden px-6 py-6 xl:px-8 xl:py-8">
      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr] xl:items-end">
        <div className="grid gap-4">
          <div className="section-kicker">SharkEdge command</div>
          <div className="max-w-5xl font-display text-4xl font-semibold tracking-tight text-white xl:text-6xl xl:leading-[1.02]">
            One place for odds, trends, scores, player markets, and matchup history.
          </div>
          <div className="max-w-3xl text-base leading-8 text-slate-300">
            The homepage should feel like a decision engine. Start with the slate, move into the matchup, then open props and trend context without losing the market thread.
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/board" className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400">
              Open board
            </Link>
            <Link href="/games" className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25">
              Open games
            </Link>
            <Link href="/props" className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25">
              Hunt props
            </Link>
          </div>
        </div>

        <div className="grid gap-3 rounded-[1.65rem] border border-white/8 bg-[#09131f]/90 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Current command state</div>
            <Badge tone="brand">{providerLabel}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 p-4">
              <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">Verified games</div>
              <div className="mt-2 text-3xl font-semibold text-white">{verifiedGames}</div>
            </div>
            <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 p-4">
              <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">Live now</div>
              <div className="mt-2 text-3xl font-semibold text-white">{liveGames}</div>
            </div>
            <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 p-4">
              <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">Tracked props</div>
              <div className="mt-2 text-3xl font-semibold text-white">{trackedProps}</div>
            </div>
            <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 p-4">
              <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">Players surfaced</div>
              <div className="mt-2 text-3xl font-semibold text-white">{trackedPlayers}</div>
            </div>
          </div>

          <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-300">
            {sourceNote}
          </div>
        </div>
      </div>
    </section>
  );
}
