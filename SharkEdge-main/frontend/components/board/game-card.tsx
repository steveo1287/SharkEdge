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
import { getTeamLogoUrl } from "@/lib/utils/entity-routing";
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
  const awayLogo = getTeamLogoUrl(game.leagueKey, game.awayTeam);
  const homeLogo = getTeamLogoUrl(game.leagueKey, game.homeTeam);

  const focusReason =
    focusOpportunity.reasonSummary ??
    focusView.reasons?.[0]?.detail ??
    focusView.marketTruth?.note ??
    "Open the matchup to see whether this market still deserves first attention.";

  const reasonTags = focusView.reasons?.slice(0, 1) ?? [];

  return (
    <Card className="surface-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
            <span>{game.leagueKey}</span>
            <span>•</span>
            <span>{formatGameDateTime(game.startTime)}</span>
            <span>•</span>
            <span>{game.bestBookCount} books</span>
          </div>

          <div className="mt-4 grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-[1.15rem] border border-white/8 bg-slate-950/50 px-4 py-3">
                <TeamBadge
                  name={game.awayTeam.name}
                  abbreviation={game.awayTeam.abbreviation}
                  logoUrl={awayLogo}
                  size="md"
                  tone="away"
                />
                <div className="min-w-0">
                  <div className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
                    Away
                  </div>
                  <div className="truncate text-lg font-semibold text-white">
                    {game.awayTeam.name}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-[1.15rem] border border-white/8 bg-slate-950/50 px-4 py-3">
                <TeamBadge
                  name={game.homeTeam.name}
                  abbreviation={game.homeTeam.abbreviation}
                  logoUrl={homeLogo}
                  size="md"
                  tone="home"
                />
                <div className="min-w-0">
                  <div className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
                    Home
                  </div>
                  <div className="truncate text-lg font-semibold text-white">
                    {game.homeTeam.name}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
              Lead with <span className="font-medium text-white">{formatFocusLabel(focus)}</span>: {focusReason}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Badge tone={getStatusTone(game.status)}>{game.status}</Badge>
          <Badge tone={scoreBand.tone}>
            {scoreBand.label} {focusOpportunity.opportunityScore}
          </Badge>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
            {movement === 0
              ? "No move"
              : `${movement > 0 ? "+" : ""}${movement.toFixed(1)} ${
                  focus === "moneyline" ? "c" : "pts"
                }`}
          </div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
            {focusOpportunity.timingState.replace(/_/g, " ")}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-[1.2rem] border border-line bg-slate-950/70 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Spread</div>
          <div className="mt-3 font-display text-xl font-semibold text-white">
            {formatMarketLine(game.spread.label)}
          </div>
          <div className="mt-2 text-sm text-slate-400">
            {game.spread.bestBook !== "Unavailable" ? formatMarketLine(game.spread.bestBook) : "-"} | {formatOddsValue(game.spread.bestOdds)}
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
            {game.total.bestBook !== "Unavailable" ? formatMarketLine(game.total.bestBook) : "-"} | {formatOddsValue(game.total.bestOdds)}
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
        <div className="mt-4 rounded-[1.1rem] border border-rose-400/20 bg-rose-500/8 px-4 py-3 text-sm leading-6 text-rose-100">
          <span className="text-rose-200/75">Trap line:</span> {trapLine}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-400">
          {focusOpportunity.sportsbookName
            ? `${focusOpportunity.sportsbookName} | ${focusOpportunity.actionState
                .replace(/_/g, " ")
                .toLowerCase()}`
            : focusView.fairPrice
              ? `${focusView.fairPrice.pricingMethod.replace(/_/g, " ")} | confidence ${
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
            className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
          >
            Open matchup
          </Link>
        </div>
      </div>
    </Card>
  );
}
