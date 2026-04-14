import Link from "next/link";

import { SharkScoreRing } from "@/components/branding/shark-score-ring";
import type { BoardMarketView, GameCardView } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";

function formatStartTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatMovementValue(movement: number) {
  const absolute = Math.abs(movement);
  if (!absolute) return "Flat";
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
  return game.selectedBook?.name || game.moneyline.bestBook || game.spread.bestBook || game.total.bestBook || "Awaiting book";
}

function MarketColumn({ label, market }: { label: string; market: BoardMarketView }) {
  return (
    <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-3">
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        <span>{label}</span>
        <span className="truncate">{market.bestBook}</span>
      </div>
      <div className="mt-2 text-base font-semibold tracking-tight text-white">{market.lineLabel}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">{formatMovementValue(market.movement)}</div>
    </div>
  );
}

export function LiveEdgeBoardCard({
  game,
  inspectHref,
  gameHref,
  workflowLabel,
  selected = false
}: {
  game: GameCardView;
  inspectHref?: string;
  gameHref?: string;
  workflowLabel?: string;
  selected?: boolean;
}) {
  const leadMover = getLeadMover(game);
  const primaryBook = getPrimaryBook(game);

  return (
    <div
      className={cn(
        "hard-card-frame mobile-board-card transition",
        selected ? "border-cyan-300/30 shadow-[0_18px_38px_rgba(18,184,255,0.12)]" : "hover:border-cyan-300/18"
      )}
    >
      <div className="grid gap-4 xl:grid-cols-[108px_minmax(0,1fr)_290px] xl:items-center">
        <div className="grid justify-items-start gap-3 xl:justify-items-center">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 xl:justify-center">
            <span>{game.leagueKey}</span>
            <span>•</span>
            <span>{game.status}</span>
          </div>
          <SharkScoreRing
            score={game.edgeScore.score}
            size="sm"
            tone={game.edgeScore.score >= 65 ? "success" : game.edgeScore.score >= 45 ? "warning" : "brand"}
          />
          <div className="rounded-full border border-cyan-400/18 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
            {leadMover.label} {formatMovementValue(leadMover.movement)}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>{formatStartTime(game.startTime)}</span>
            <span>•</span>
            <span>{game.venue}</span>
          </div>
          <div className="mt-3 text-[1.32rem] font-semibold tracking-[-0.04em] text-white xl:text-[1.5rem]">
            {game.awayTeam.abbreviation} <span className="text-slate-500">@</span> {game.homeTeam.abbreviation}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <MarketColumn label="Moneyline" market={game.moneyline} />
            <MarketColumn label="Spread" market={game.spread} />
            <MarketColumn label="Total" market={game.total} />
          </div>
        </div>

        <div className="grid gap-3 xl:justify-items-end">
          <div className="grid w-full gap-2 xl:justify-items-end">
            <div className="hard-chip">{primaryBook}</div>
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <div className="hard-chip">{game.bestBookCount} books</div>
              <div className="hard-chip hard-chip--success">{game.edgeScore.label}</div>
            </div>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto">
            <Link
              href={inspectHref ?? game.detailHref ?? `/game/${game.id}`}
              className={cn(
                "hard-card-action",
                selected ? "hard-card-action--primary" : "hard-card-action--secondary"
              )}
            >
              {selected ? "Inspecting" : "Inspect"}
            </Link>
            <Link
              href={gameHref ?? game.detailHref ?? `/game/${game.id}`}
              className="hard-card-action hard-card-action--primary"
            >
              {workflowLabel ? `Open ${workflowLabel}` : "Game page"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
