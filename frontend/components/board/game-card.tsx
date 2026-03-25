import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatGameDateTime } from "@/lib/formatters/date";
import { formatAmericanOdds } from "@/lib/formatters/odds";
import type { GameCardView } from "@/lib/types/domain";

function getEdgeTone(label: GameCardView["edgeScore"]["label"]) {
  if (label === "Elite") {
    return "success";
  }

  if (label === "Strong") {
    return "brand";
  }

  if (label === "Watchlist") {
    return "premium";
  }

  return "muted";
}

function getStatusTone(status: GameCardView["status"]) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "FINAL") {
    return "neutral" as const;
  }

  if (status === "POSTPONED") {
    return "danger" as const;
  }

  return "muted" as const;
}

type GameCardProps = {
  game: GameCardView;
  focusMarket: string;
};

export function GameCard({ game, focusMarket }: GameCardProps) {
  const focus =
    focusMarket === "spread" || focusMarket === "moneyline" || focusMarket === "total"
      ? focusMarket
      : "spread";
  const movement = game[focus].movement;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
            {game.leagueKey} | {formatGameDateTime(game.startTime)}
          </div>
          <div className="mt-3 grid gap-2">
            <div className="font-display text-2xl font-semibold text-white">
              {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
            </div>
            <div className="text-sm text-slate-400">{game.venue}</div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Badge tone={getStatusTone(game.status)}>{game.status}</Badge>
          <Badge tone={getEdgeTone(game.edgeScore.label)}>
            {game.edgeScore.label} {game.edgeScore.score}
          </Badge>
          <div className="text-sm text-slate-400">
            {movement === 0
              ? "No line move"
              : `${movement > 0 ? "+" : ""}${movement.toFixed(1)} ${focus === "moneyline" ? "c" : "pts"}`}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-line bg-slate-950/70 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Spread</div>
          <div className="mt-3 font-display text-xl font-semibold text-white">{game.spread.label}</div>
          <div className="mt-2 text-sm text-slate-400">
            {game.spread.bestBook} | {formatAmericanOdds(game.spread.bestOdds)}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-slate-950/70 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Moneyline</div>
          <div className="mt-3 font-display text-xl font-semibold text-white">
            {game.moneyline.label}
          </div>
          <div className="mt-2 text-sm text-slate-400">
            {game.moneyline.bestBook} | {formatAmericanOdds(game.moneyline.bestOdds)}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-slate-950/70 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Total</div>
          <div className="mt-3 font-display text-xl font-semibold text-white">{game.total.label}</div>
          <div className="mt-2 text-sm text-slate-400">
            {game.total.bestBook} | {formatAmericanOdds(game.total.bestOdds)}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <div className="text-sm text-slate-400">
          {game.selectedBook ? `Locked to ${game.selectedBook.name}` : `${game.bestBookCount} books compared`}
        </div>
        <Link
          href={`/game/${game.id}`}
          className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
        >
          Open matchup
        </Link>
      </div>
    </Card>
  );
}
