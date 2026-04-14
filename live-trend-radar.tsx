import Link from "next/link";

import type { GameCardView } from "@/lib/types/domain";
import type { PublishedTrendCard } from "@/lib/trends/publisher";
import { formatCompactTime, formatPercent } from "@/lib/utils/team-branding";

type LiveTrendRadarProps = {
  featured: PublishedTrendCard[];
  verifiedGames: GameCardView[];
};

function findSlateMatches(card: PublishedTrendCard, games: GameCardView[]) {
  const haystack = `${card.title} ${card.description} ${card.leagueLabel}`.toLowerCase();
  return games.filter((game) => {
    const away = `${game.awayTeam.name} ${game.awayTeam.abbreviation}`.toLowerCase();
    const home = `${game.homeTeam.name} ${game.homeTeam.abbreviation}`.toLowerCase();
    return haystack.includes(away) || haystack.includes(home) || haystack.includes(game.leagueKey.toLowerCase());
  }).slice(0, 2);
}

export function LiveTrendRadar({ featured, verifiedGames }: LiveTrendRadarProps) {
  if (!featured.length) {
    return (
      <section className="surface-panel p-5">
        <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">Trend radar</div>
        <div className="mt-3 text-lg font-semibold text-white">Trend feed is loading.</div>
        <div className="mt-2 text-sm leading-6 text-slate-300">Keep the live board visible while the historical engine fills in.</div>
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      {featured.slice(0, 4).map((card) => {
        const matches = findSlateMatches(card, verifiedGames);
        return (
          <article key={card.id} className="surface-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">{card.category}</div>
              <div className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-200">
                {card.confidence}
              </div>
            </div>
            <h3 className="mt-3 text-lg font-semibold text-white">{card.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{card.description}</p>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">{card.record}</span>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">ROI {formatPercent(card.roi, 1)}</span>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">Hit {formatPercent(card.hitRate, 0)}</span>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">Sample {card.sampleSize}</span>
            </div>

            {matches.length ? (
              <div className="mt-4 grid gap-2">
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Live slate ties</div>
                {matches.map((game) => (
                  <Link key={game.id} href={game.detailHref ?? `/game/${game.id}`} className="rounded-2xl border border-white/8 bg-slate-950/40 px-3 py-2.5 transition hover:border-sky-400/20">
                    <div className="flex items-center justify-between gap-3 text-sm text-white">
                      <span>{game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}</span>
                      <span className="text-slate-400">{formatCompactTime(game.startTime)}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">Edge {game.edgeScore.score} · ML {game.moneyline.lineLabel}</div>
                  </Link>
                ))}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {card.whyNow.slice(0, 2).map((reason) => (
                <span key={reason} className="rounded-full border border-sky-400/15 bg-sky-400/10 px-2.5 py-1 text-[0.68rem] text-sky-100">
                  {reason}
                </span>
              ))}
            </div>

            <div className="mt-4">
              <Link href={card.href} className="text-sm font-semibold text-sky-300 transition hover:text-sky-200">
                Open trend →
              </Link>
            </div>
          </article>
        );
      })}
    </section>
  );
}
