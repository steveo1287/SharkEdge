import Link from "next/link";

import type { BoardMarketView, GameCardView } from "@/lib/types/domain";
import { formatCompactDate, formatCompactTime, formatOdds, formatPercent, getLeagueGradient, getStatusTone, getTeamInitials, getTeamLogoUrl } from "@/lib/utils/team-branding";

type ImmersiveGameCardProps = {
  game: GameCardView;
  trendHref?: string;
};

function TeamAvatar({ game, side }: { game: GameCardView; side: "away" | "home" }) {
  const team = side === "away" ? game.awayTeam : game.homeTeam;
  const logo = getTeamLogoUrl(team, game.leagueKey);
  if (logo) {
    return <img src={logo} alt={team.abbreviation} className="h-11 w-11 rounded-full object-contain" />;
  }

  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-xs font-semibold text-slate-200">
      {getTeamInitials(team)}
    </div>
  );
}

function MarketCell({ label, market }: { label: string; market: BoardMarketView }) {
  const confidence = Math.max(0, Math.min(100, Math.round(market.confidenceScore ?? 0)));
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/45 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">{label}</div>
        <div className="text-xs font-semibold text-slate-300">{market.bestBook || "Market"}</div>
      </div>
      <div className="mt-2 text-lg font-semibold text-white">{market.lineLabel || market.label || "No market"}</div>
      <div className="mt-1 text-sm text-slate-300">
        {formatOdds(market.bestOdds)} · move {market.movement > 0 ? "+" : ""}{market.movement.toFixed(1)}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400" style={{ width: `${confidence}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>{market.confidenceBand ?? "low"} confidence</span>
        <span>edge {formatPercent(market.evProfile?.edgePct, 1)}</span>
      </div>
    </div>
  );
}

export function ImmersiveGameCard({ game, trendHref = "/trends" }: ImmersiveGameCardProps) {
  const detailHref = game.detailHref ?? `/game/${game.id}`;

  return (
    <article className={`surface-panel overflow-hidden p-4 bg-gradient-to-br ${getLeagueGradient(game.leagueKey)}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-slate-400">
            <span>{game.leagueKey}</span>
            <span className={`rounded-full border px-2 py-1 text-[0.62rem] ${getStatusTone(game.status)}`}>{game.status}</span>
          </div>
          <div className="mt-2 text-sm text-slate-400">{formatCompactDate(game.startTime)} · {formatCompactTime(game.startTime)} · {game.venue}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-right">
          <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Edge</div>
          <div className="mt-1 text-2xl font-semibold text-white">{game.edgeScore.score}</div>
          <div className="text-xs text-slate-300">{game.edgeScore.label}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-[1.45rem] border border-white/8 bg-slate-950/30 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <TeamAvatar game={game} side="away" />
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-white">{game.awayTeam.name}</div>
              <div className="text-sm text-slate-400">{game.awayTeam.abbreviation}</div>
            </div>
          </div>
          <div className="text-slate-500">@</div>
          <div className="flex min-w-0 items-center gap-3 text-right">
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-white">{game.homeTeam.name}</div>
              <div className="text-sm text-slate-400">{game.homeTeam.abbreviation}</div>
            </div>
            <TeamAvatar game={game} side="home" />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <MarketCell label="Moneyline" market={game.moneyline} />
        <MarketCell label="Spread" market={game.spread} />
        <MarketCell label="Total" market={game.total} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">{game.bestBookCount} books</span>
          {game.moneyline.marketTruth?.classificationLabel ? (
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">{game.moneyline.marketTruth.classificationLabel}</span>
          ) : null}
          {game.total.marketPath?.executionHint ? (
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">{game.total.marketPath.executionHint}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={trendHref} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-sky-400/20">
            Trend context
          </Link>
          <Link href={detailHref} className="rounded-full bg-sky-400 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-300">
            Open game
          </Link>
        </div>
      </div>
    </article>
  );
}
