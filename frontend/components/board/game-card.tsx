import Link from "next/link";
import type { ReactNode } from "react";

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

function formatOddsValue(value: number) {
  return value ? formatAmericanOdds(value) : "-";
}

function formatMarketLine(value: string) {
  return value.startsWith("No ") ? "-" : value;
}

function formatFocusLabel(value: "spread" | "moneyline" | "total") {
  if (value === "moneyline") {
    return "moneyline";
  }

  return value;
}

type GameCardProps = {
  game: GameCardView;
  focusMarket: string;
  actions?: ReactNode;
};

export function GameCard({ game, focusMarket, actions }: GameCardProps) {
  const marketKeys = ["spread", "moneyline", "total"] as const;
  const focus =
    focusMarket === "best" || !marketKeys.includes(focusMarket as (typeof marketKeys)[number])
      ? marketKeys
          .map((marketKey) => {
            const market = game[marketKey];
            const rankScore = market.evProfile?.rankScore ?? 0;
            const confidenceScore = market.confidenceScore ?? 0;
            const movementBonus = Math.min(12, Math.abs(market.movement) * (marketKey === "moneyline" ? 0.35 : 2.5));
            const qualityBonus = market.marketTruth?.qualityScore ?? 0;
            const bestPriceBonus = market.marketIntelligence?.bestPriceFlag ? 8 : 0;

            return {
              marketKey,
              score: rankScore + confidenceScore * 0.45 + qualityBonus * 0.2 + movementBonus + bestPriceBonus
            };
          })
          .sort((left, right) => right.score - left.score)[0]?.marketKey ?? "spread"
      : (focusMarket as (typeof marketKeys)[number]);
  const focusView = game[focus];
  const movement = focusView.movement;
  const focusReason =
    focusView.reasons?.[0]?.detail ??
    focusView.marketTruth?.note ??
    "Open the matchup to see whether this market still deserves first attention.";
  const reasonTags = focusView.reasons?.slice(0, 2) ?? [];
  return (
    <Card className="surface-panel p-5">
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
            <div className="text-sm leading-6 text-slate-300">
              Open on <span className="font-medium text-white">{formatFocusLabel(focus)}</span>: {focusReason}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Badge tone={getStatusTone(game.status)}>{game.status}</Badge>
          <Badge tone={getEdgeTone(game.edgeScore.label)}>
            {game.edgeScore.label} {game.edgeScore.score}
          </Badge>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
            {movement === 0
              ? "No move"
              : `${movement > 0 ? "+" : ""}${movement.toFixed(1)} ${focus === "moneyline" ? "c" : "pts"}`}
          </div>
          {focusView.evProfile ? (
            <div className="text-xs uppercase tracking-[0.18em] text-emerald-300">
              EV {focusView.evProfile.edgePct > 0 ? "+" : ""}
              {focusView.evProfile.edgePct.toFixed(1)}%
            </div>
          ) : null}
          {focusView.confidenceBand ? (
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
              {focusView.confidenceBand} confidence
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-[1.2rem] border border-line bg-slate-950/70 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Spread</div>
          <div className="mt-3 font-display text-xl font-semibold text-white">
            {formatMarketLine(game.spread.label)}
          </div>
          <div className="mt-2 text-sm text-slate-400">
            {game.spread.bestBook !== "Unavailable" ? formatMarketLine(game.spread.bestBook) : "-"} |{" "}
            {formatOddsValue(game.spread.bestOdds)}
          </div>
        </div>
        <div className="rounded-[1.2rem] border border-line bg-slate-950/70 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Moneyline</div>
          <div className="mt-3 font-display text-xl font-semibold text-white">
            {formatMarketLine(game.moneyline.label)}
          </div>
          <div className="mt-2 text-sm text-slate-400">
            {game.moneyline.bestBook !== "Unavailable"
              ? formatMarketLine(game.moneyline.bestBook)
              : "-"}{" "}
            | {formatOddsValue(game.moneyline.bestOdds)}
          </div>
        </div>
        <div className="rounded-[1.2rem] border border-line bg-slate-950/70 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Total</div>
          <div className="mt-3 font-display text-xl font-semibold text-white">
            {formatMarketLine(game.total.label)}
          </div>
          <div className="mt-2 text-sm text-slate-400">
            {game.total.bestBook !== "Unavailable" ? formatMarketLine(game.total.bestBook) : "-"} |{" "}
            {formatOddsValue(game.total.bestOdds)}
          </div>
        </div>
      </div>

      {reasonTags.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {reasonTags.map((reason) => (
            <Badge key={`${game.id}-${focus}-${reason.label}`} tone={reason.tone}>
              {reason.label}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-400">
          {focusView.fairPrice
            ? `${focusView.fairPrice.pricingMethod.replace(/_/g, " ")} | confidence ${focusView.fairPrice.pricingConfidenceScore}`
            : game.selectedBook
              ? `Locked to ${game.selectedBook.name}`
              : `${game.bestBookCount} books compared`}
        </div>
        <div className="flex flex-wrap gap-3">
          {actions}
          <Link
            href={game.detailHref ?? `/game/${game.id}`}
            className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
          >
            Open matchup
          </Link>
        </div>
      </div>
    </Card>
  );
}
