import Link from "next/link";

import { SharkScoreRing } from "@/components/branding/shark-score-ring";
import type { BoardMarketView, GameCardView } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";

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

function MarketColumn({ label, market }: { label: string; market: BoardMarketView }) {
  return (
    <div className="rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
        <span>{label}</span>
        <span>{market.bestBook}</span>
      </div>
      <div className="mt-2 text-sm font-semibold tracking-tight text-white">{market.lineLabel}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-sky-300">{formatMovementValue(market.movement)}</div>
    </div>
  );
}

export function LiveEdgeBoardCard({
  game,
  inspectHref,
  selected = false
}: {
  game: GameCardView;
  inspectHref?: string;
  selected?: boolean;
}) {
  const leadMover = getLeadMover(game);
  const primaryBook = getPrimaryBook(game);

  return (
    <div
      className={cn(
        "mobile-board-card transition",
        selected
          ? "border-sky-400/28 bg-[#0d1726] shadow-[0_16px_34px_rgba(8,145,255,0.12)]"
          : "hover:border-sky-400/18 hover:bg-[#0e1725]"
      )}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr),minmax(0,1.6fr),auto] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>{game.leagueKey}</span>
            <span>•</span>
            <span>{game.status}</span>
            <span>•</span>
            <span>{formatStartTime(game.startTime)}</span>
          </div>
          <div className="mt-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[1.05rem] font-semibold tracking-tight text-white">
                {game.awayTeam.abbreviation} <span className="text-slate-500">@</span> {game.homeTeam.abbreviation}
              </div>
              <div className="mt-1 truncate text-sm text-slate-400">{game.venue}</div>
            </div>
            <SharkScoreRing
              score={game.edgeScore.score}
              size="sm"
              tone={game.edgeScore.score >= 65 ? "success" : game.edgeScore.score >= 45 ? "warning" : "brand"}
            />
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <MarketColumn label="Moneyline" market={game.moneyline} />
          <MarketColumn label="Spread" market={game.spread} />
          <MarketColumn label="Total" market={game.total} />
        </div>

        <div className="grid gap-2 xl:justify-items-end">
          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-400 xl:justify-end">
            <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-slate-200">{primaryBook}</div>
            <div className="rounded-full border border-white/8 px-3 py-1.5">{game.bestBookCount} books</div>
          </div>
          <div className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">
            {leadMover.label} {formatMovementValue(leadMover.movement)}
          </div>
          <div className="flex gap-2 xl:justify-end">
            <div className="rounded-full border border-white/8 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
              {game.edgeScore.label}
            </div>
            <Link
              href={inspectHref ?? game.detailHref ?? `/game/${game.id}`}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition",
                selected
                  ? "border-sky-300/50 bg-sky-500/16 text-sky-100"
                  : "border-white/10 bg-white/[0.03] text-white hover:border-sky-400/25 hover:bg-sky-500/10"
              )}
            >
              {selected ? "Inspecting" : "Inspect"}
            </Link>
            <Link
              href={game.detailHref ?? `/game/${game.id}`}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200 transition hover:border-white/18 hover:bg-white/[0.06]"
            >
              Game page
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
