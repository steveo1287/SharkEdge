import Link from "next/link";

import { SharkScoreRing } from "@/components/branding/shark-score-ring";
import type { BoardMarketView, GameCardView } from "@/lib/types/domain";

function formatStartTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatMovementValue(movement: number) {
  const absolute = Math.abs(movement);

  if (!absolute) {
    return "Flat";
  }

  return `${movement > 0 ? "↑" : "↓"} ${absolute >= 10 ? absolute.toFixed(0) : absolute.toFixed(1)}`;
}

function getLeadMover(game: GameCardView) {
  const candidates = [
    { label: "ML", movement: game.moneyline.movement },
    { label: "SPR", movement: game.spread.movement },
    { label: "TOT", movement: game.total.movement }
  ];

  return [...candidates].sort((left, right) => Math.abs(right.movement) - Math.abs(left.movement))[0];
}

function getPrimaryBook(game: GameCardView) {
  return (
    game.selectedBook?.name ||
    game.moneyline.bestBook ||
    game.spread.bestBook ||
    game.total.bestBook ||
    "Awaiting book"
  );
}

function MarketCell({ label, market }: { label: string; market: BoardMarketView }) {
  return (
    <div className="rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{market.bestBook}</div>
      </div>
      <div className="mt-2 text-[0.96rem] font-semibold tracking-tight text-white">{market.lineLabel}</div>
      <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-sky-300">Move {formatMovementValue(market.movement)}</div>
    </div>
  );
}

export function LiveEdgeBoardCard({ game }: { game: GameCardView }) {
  const leadMover = getLeadMover(game);
  const primaryBook = getPrimaryBook(game);

  return (
    <Link href={game.detailHref ?? `/game/${game.id}`} className="mobile-board-card transition hover:border-sky-400/20 hover:bg-[#0e1725]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>{game.leagueKey}</span>
            <span>•</span>
            <span>{game.status}</span>
            <span>•</span>
            <span>{formatStartTime(game.startTime)}</span>
          </div>
          <div className="mt-3 grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-[1rem] font-semibold tracking-tight text-white">{game.awayTeam.abbreviation}</div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Away</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-[1rem] font-semibold tracking-tight text-white">{game.homeTeam.abbreviation}</div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Home</div>
            </div>
          </div>
          <div className="mt-3 text-sm text-slate-400">{game.venue}</div>
        </div>

        <div className="flex flex-col items-end gap-3">
          <SharkScoreRing
            score={game.edgeScore.score}
            size="sm"
            tone={game.edgeScore.score >= 65 ? "success" : game.edgeScore.score >= 45 ? "warning" : "brand"}
          />
          <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
            {game.edgeScore.label}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <MarketCell label="Moneyline" market={game.moneyline} />
        <MarketCell label="Spread" market={game.spread} />
        <MarketCell label="Total" market={game.total} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
        <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-slate-200">{primaryBook}</div>
        <div className="rounded-full border border-white/8 px-3 py-1.5">{game.bestBookCount} books</div>
        <div className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-sky-300">
          {leadMover.label} {formatMovementValue(leadMover.movement)}
        </div>
      </div>
    </Link>
  );
}
