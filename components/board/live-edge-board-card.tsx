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
    <div className="rounded-md border border-bone/[0.08] bg-surface px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">
        <span>{label}</span>
        <span className="text-bone/75">{market.bestBook}</span>
      </div>
      <div className="mt-2 font-mono text-[13px] font-semibold tabular-nums text-text-primary">{market.lineLabel}</div>
      <div className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] tabular-nums text-aqua">{formatMovementValue(market.movement)}</div>
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
        "focusable panel p-4 transition-colors",
        selected
          ? "border-aqua/30 bg-aqua/[0.04]"
          : "hover:border-bone/[0.14] hover:bg-raised/60"
      )}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr),minmax(0,1.6fr),auto] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">
            <span>{game.leagueKey}</span>
            <span className="text-bone/25">·</span>
            <span>{game.status}</span>
            <span className="text-bone/25">·</span>
            <span className="font-mono tabular-nums">{formatStartTime(game.startTime)}</span>
          </div>
          <div className="mt-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
                {game.awayTeam.abbreviation} <span className="text-bone/35">@</span> {game.homeTeam.abbreviation}
              </div>
              <div className="mt-1 truncate text-[12.5px] text-bone/55">{game.venue}</div>
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
          <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] xl:justify-end">
            <div className="rounded-sm border border-bone/[0.10] bg-surface px-2 py-1 text-bone/85">{primaryBook}</div>
            <div className="rounded-sm border border-bone/[0.08] bg-surface px-2 py-1 text-bone/65">{game.bestBookCount} books</div>
          </div>
          <div className="rounded-sm border border-aqua/25 bg-aqua/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-aqua">
            {leadMover.label} <span className="font-mono tabular-nums">{formatMovementValue(leadMover.movement)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 xl:justify-end">
            <div className="rounded-sm border border-bone/[0.10] bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/75">
              {game.edgeScore.label}
            </div>
            <Link
              href={inspectHref ?? game.detailHref ?? `/game/${game.id}`}
              className={cn(
                "rounded-sm border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors",
                selected
                  ? "border-aqua/40 bg-aqua/10 text-aqua"
                  : "border-bone/[0.12] bg-surface text-text-primary hover:border-aqua/30 hover:bg-aqua/[0.05] hover:text-aqua"
              )}
            >
              {selected ? "Inspecting" : "Inspect"}
            </Link>
            <Link
              href={gameHref ?? game.detailHref ?? `/game/${game.id}`}
              className="rounded-sm border border-bone/[0.10] bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/75 transition-colors hover:border-bone/[0.20] hover:text-text-primary"
            >
              {workflowLabel ? `Open ${workflowLabel}` : "Game page"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
