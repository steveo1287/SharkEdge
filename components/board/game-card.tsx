import Link from "next/link";
import type { ReactNode } from "react";

import {
  getOpportunityScoreBand,
  getOpportunityTrapLine,
  OpportunityBadgeRow
} from "@/components/intelligence/opportunity-badges";
import { TeamBadge } from "@/components/identity/team-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatGameDateTime } from "@/lib/formatters/date";
import { formatAmericanOdds } from "@/lib/formatters/odds";
import type { GameCardView } from "@/lib/types/domain";
import { buildGameMarketOpportunity } from "@/services/opportunities/opportunity-service";

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
            const movementBonus = Math.min(
              12,
              Math.abs(market.movement) * (marketKey === "moneyline" ? 0.35 : 2.5)
            );
            const qualityBonus = market.marketTruth?.qualityScore ?? 0;
            const bestPriceBonus = market.marketIntelligence?.bestPriceFlag ? 8 : 0;

            return {
              marketKey,
              score:
                rankScore +
                confidenceScore * 0.45 +
                qualityBonus * 0.2 +
                movementBonus +
                bestPriceBonus
            };
          })
          .sort((left, right) => right.score - left.score)[0]?.marketKey ?? "spread"
      : (focusMarket as (typeof marketKeys)[number]);

  const focusView = game[focus];
  const focusOpportunity = buildGameMarketOpportunity(game, focus);
  const scoreBand = getOpportunityScoreBand(focusOpportunity.opportunityScore);
  const trapLine = getOpportunityTrapLine(focusOpportunity);
  const movement = focusView.movement;

  const focusReason =
    focusOpportunity.reasonSummary ??
    focusView.reasons?.[0]?.detail ??
    focusView.marketTruth?.note ??
    "Open the matchup to see whether this market still deserves first attention.";

  const reasonTags = focusView.reasons?.slice(0, 1) ?? [];

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">
            {game.leagueKey} <span className="text-bone/25">·</span> <span className="font-mono tabular-nums">{formatGameDateTime(game.startTime)}</span>
          </div>

          <div className="mt-4 grid gap-4">
            <div className="flex items-center gap-3">
              <TeamBadge
                name={game.awayTeam.name}
                abbreviation={game.awayTeam.abbreviation}
                size="md"
              />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">
                  Away
                </div>
                <div className="truncate font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
                  {game.awayTeam.name}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <TeamBadge
                name={game.homeTeam.name}
                abbreviation={game.homeTeam.abbreviation}
                size="md"
              />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">
                  Home
                </div>
                <div className="truncate font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
                  {game.homeTeam.name}
                </div>
              </div>
            </div>

            <div className="text-[13px] leading-[1.55] text-bone/70">
              Lead with <span className="font-medium text-text-primary">{formatFocusLabel(focus)}</span>:{" "}
              {focusReason}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Badge tone={getStatusTone(game.status)}>{game.status}</Badge>
          <Badge tone={scoreBand.tone}>
            {scoreBand.label} {focusOpportunity.opportunityScore}
          </Badge>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">
            {movement === 0
              ? "No move"
              : (
                <span className="font-mono tabular-nums text-aqua">
                  {`${movement > 0 ? "+" : ""}${movement.toFixed(1)} ${
                    focus === "moneyline" ? "c" : "pts"
                  }`}
                </span>
              )}
          </div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/50">
            {focusOpportunity.timingState.replace(/_/g, " ")}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-bone/[0.08] bg-surface p-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">Spread</div>
          <div className="mt-3 font-display text-[19px] font-semibold tracking-[-0.01em] text-text-primary">
            {formatMarketLine(game.spread.label)}
          </div>
          <div className="mt-2 font-mono text-[12.5px] tabular-nums text-bone/65">
            <span className="text-bone/50">{game.spread.bestBook !== "Unavailable" ? formatMarketLine(game.spread.bestBook) : "-"}</span>
            <span className="mx-1.5 text-bone/25">·</span>
            <span className="text-text-primary">{formatOddsValue(game.spread.bestOdds)}</span>
          </div>
        </div>

        <div className="rounded-md border border-bone/[0.08] bg-surface p-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">Moneyline</div>
          <div className="mt-3 font-display text-[19px] font-semibold tracking-[-0.01em] text-text-primary">
            {formatMarketLine(game.moneyline.label)}
          </div>
          <div className="mt-2 font-mono text-[12.5px] tabular-nums text-bone/65">
            <span className="text-bone/50">{game.moneyline.bestBook !== "Unavailable" ? formatMarketLine(game.moneyline.bestBook) : "-"}</span>
            <span className="mx-1.5 text-bone/25">·</span>
            <span className="text-text-primary">{formatOddsValue(game.moneyline.bestOdds)}</span>
          </div>
        </div>

        <div className="rounded-md border border-bone/[0.08] bg-surface p-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">Total</div>
          <div className="mt-3 font-display text-[19px] font-semibold tracking-[-0.01em] text-text-primary">
            {formatMarketLine(game.total.label)}
          </div>
          <div className="mt-2 font-mono text-[12.5px] tabular-nums text-bone/65">
            <span className="text-bone/50">{game.total.bestBook !== "Unavailable" ? formatMarketLine(game.total.bestBook) : "-"}</span>
            <span className="mx-1.5 text-bone/25">·</span>
            <span className="text-text-primary">{formatOddsValue(game.total.bestOdds)}</span>
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

      <div className="mt-4">
        <OpportunityBadgeRow opportunity={focusOpportunity} />
      </div>

      {trapLine ? (
        <div className="mt-4 rounded-md border border-crimson/25 bg-crimson/[0.06] px-4 py-3 text-[13px] leading-[1.55] text-crimson">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-crimson/75">Trap line</span>
          <div className="mt-1 text-bone/85">{trapLine}</div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12.5px] text-bone/55">
          {focusOpportunity.sportsbookName
            ? `${focusOpportunity.sportsbookName} · ${focusOpportunity.actionState
                .replace(/_/g, " ")
                .toLowerCase()}`
            : focusView.fairPrice
              ? `${focusView.fairPrice.pricingMethod.replace(/_/g, " ")} · confidence ${
                  focusView.fairPrice.pricingConfidenceScore
                }`
              : game.selectedBook
                ? `Locked to ${game.selectedBook.name}`
                : `${game.bestBookCount} books compared`}
        </div>

        <div className="flex flex-wrap gap-3">
          {actions}
          <Link
            href={game.detailHref ?? `/game/${game.id}`}
            className="rounded-sm border border-aqua/30 bg-aqua/[0.08] px-4 py-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-aqua transition-colors hover:border-aqua/50 hover:bg-aqua/[0.14]"
          >
            Open matchup
          </Link>
        </div>
      </div>
    </Card>
  );
}