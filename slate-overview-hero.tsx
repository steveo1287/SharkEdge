import Link from "next/link";

import type { BoardSportSectionView, GameCardView, ProviderHealthView } from "@/lib/types/domain";
import { formatCompactDate, getLeagueGradient } from "@/lib/utils/team-branding";

type SlateOverviewHeroProps = {
  league: string;
  verifiedGames: GameCardView[];
  sections: BoardSportSectionView[];
  providerHealth: ProviderHealthView;
  sourceNote: string;
};

function countLiveGames(games: GameCardView[]) {
  return games.filter((game) => game.status === "LIVE").length;
}

function averageEdge(games: GameCardView[]) {
  if (!games.length) return 0;
  return Math.round(games.reduce((total, game) => total + game.edgeScore.score, 0) / games.length);
}

function earliestDate(games: GameCardView[]) {
  if (!games.length) return null;
  return [...games].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))[0]?.startTime ?? null;
}

export function SlateOverviewHero({
  league,
  verifiedGames,
  sections,
  providerHealth,
  sourceNote
}: SlateOverviewHeroProps) {
  const liveCount = countLiveGames(verifiedGames);
  const activeSections = sections.filter((section) => section.games.length || section.scoreboard.length);
  const leadLeague = verifiedGames[0]?.leagueKey ?? sections[0]?.leagueKey ?? "NBA";
  const slateDate = earliestDate(verifiedGames);

  return (
    <section className={`surface-panel-strong overflow-hidden p-5 md:p-7 bg-gradient-to-br ${getLeagueGradient(leadLeague)}`}>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-sky-200/90">
            <span>Board command</span>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[0.62rem] text-slate-300">
              {league === "ALL" ? "Multi-league" : league}
            </span>
            {slateDate ? (
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[0.62rem] text-slate-300">
                {formatCompactDate(slateDate)} slate
              </span>
            ) : null}
          </div>

          <div>
            <h1 className="max-w-4xl text-[2rem] font-semibold tracking-tight text-white md:text-[3.2rem] md:leading-[1.02]">
              Live odds, scores, trend context, and matchup depth in one decision surface.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
              SharkEdge should feel like an operating system, not a stack of disconnected pages. This desk keeps prices,
              movement, standings, history, and trend intelligence on the same screen.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/trends" className="rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-300">
              Open trends
            </Link>
            <Link href="/props" className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25">
              Open props
            </Link>
            <Link href="/performance" className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25">
              Performance
            </Link>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-2">
          <div className="metric-tile">
            <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">Verified games</div>
            <div className="mt-2 text-3xl font-semibold text-white">{verifiedGames.length}</div>
            <div className="mt-2 text-sm text-slate-300">{liveCount} live now · {activeSections.length} active league desks</div>
          </div>
          <div className="metric-tile">
            <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">Average edge</div>
            <div className="mt-2 text-3xl font-semibold text-white">{averageEdge(verifiedGames)}</div>
            <div className="mt-2 text-sm text-slate-300">Composite signal strength across surfaced cards</div>
          </div>
          <div className="metric-tile md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">Provider health</div>
              <div className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-200">
                {providerHealth.label}
              </div>
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-300">{providerHealth.summary}</div>
            <div className="mt-2 text-xs leading-6 text-slate-500">{sourceNote}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
