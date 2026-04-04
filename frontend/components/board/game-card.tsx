import Link from "next/link";
import type { ReactNode } from "react";

import { IdentityTile } from "@/components/media/identity-tile";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ChangeSummaryBadge,
  getChangeSummaryExplanation
} from "@/components/intelligence/change-intelligence";
import {
  getOpportunityScoreBand,
  getOpportunityTrapLine,
  OpportunityBadgeRow
} from "@/components/intelligence/opportunity-badges";
import { formatGameDateTime } from "@/lib/formatters/date";
import { formatAmericanOdds } from "@/lib/formatters/odds";
import type { GameCardView } from "@/lib/types/domain";
import { getTeamLogoUrl, resolveMatchupHref } from "@/lib/utils/entity-routing";
import type { BoardGameIntelligenceView } from "@/services/decision/board-memory-summary";
import { getBoardFocusMarket } from "@/services/decision/board-memory-summary";
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
  intelligence?: BoardGameIntelligenceView | null;
  actions?: ReactNode;
};

export function GameCard({ game, focusMarket, intelligence, actions }: GameCardProps) {
  const matchupHref = resolveMatchupHref({
    leagueKey: game.leagueKey,
    externalEventId: game.externalEventId,
    fallbackHref: game.detailHref ?? null
  });
  const marketKeys = ["spread", "moneyline", "total"] as const;
  const focus =
    focusMarket === "best" || !marketKeys.includes(focusMarket as (typeof marketKeys)[number])
      ? getBoardFocusMarket(game)
      : (focusMarket as (typeof marketKeys)[number]);
  const focusView = game[focus];
  const focusOpportunity = buildGameMarketOpportunity(game, focus);
  const scoreBand = getOpportunityScoreBand(focusOpportunity.opportunityScore);
  const trapLine = getOpportunityTrapLine(focusOpportunity);
  const boardSummary = intelligence?.focusMarket === focus ? intelligence.summary : null;
  const boardChangeExplanation =
    intelligence?.focusMarket === focus && intelligence.renderable
      ? getChangeSummaryExplanation(boardSummary)
      : null;
  const movement = focusView.movement;
  const focusReason =
    focusOpportunity.reasonSummary ??
    focusView.reasons?.[0]?.detail ??
    focusView.marketTruth?.note ??
    "Open the matchup to see whether this market still deserves first attention.";
  const reasonTags = focusView.reasons?.slice(0, 2) ?? [];
  return (
    <Card className="surface-panel overflow-hidden p-0">
      <div className="border-b border-white/8 bg-[linear-gradient(140deg,rgba(68,164,255,0.16),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent)] px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex items-center gap-2">
            <IdentityTile
              label={game.awayTeam.name}
              shortLabel={game.awayTeam.abbreviation}
              imageUrl={getTeamLogoUrl(game.leagueKey, game.awayTeam)}
              subtle
            />
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.3em] text-slate-500">at</div>
            <IdentityTile
              label={game.homeTeam.name}
              shortLabel={game.homeTeam.abbreviation}
              imageUrl={getTeamLogoUrl(game.leagueKey, game.homeTeam)}
              subtle
            />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              {game.leagueKey} | {formatGameDateTime(game.startTime)}
            </div>
            <div className="mt-3 grid gap-2">
              <div className="font-display text-[1.7rem] font-semibold leading-tight text-white">
                {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
              </div>
              <div className="text-sm text-slate-400">{game.venue}</div>
              <div className="max-w-2xl text-sm leading-6 text-slate-300">
                Lead with <span className="font-medium text-white">{formatFocusLabel(focus)}</span>: {focusReason}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <Badge tone={getStatusTone(game.status)}>{game.status}</Badge>
            <Badge tone={scoreBand.tone}>
              {scoreBand.label} {focusOpportunity.opportunityScore}
            </Badge>
            <ChangeSummaryBadge summary={intelligence?.renderable ? boardSummary : null} />
          </div>
          <div className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-[0.68rem] uppercase tracking-[0.22em] text-slate-300">
            {focusOpportunity.timingState.replace(/_/g, " ")}
          </div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
            {movement === 0
              ? "No move"
              : `${movement > 0 ? "+" : ""}${movement.toFixed(1)} ${focus === "moneyline" ? "c" : "pts"}`}
          </div>
        </div>
      </div>
      </div>

      <div className="px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
          Focus market | {formatFocusLabel(focus)}
        </div>
        <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
          {game.bestBookCount} verified book{game.bestBookCount === 1 ? "" : "s"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
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
          {reasonTags.slice(0, 1).map((reason) => (
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

      {boardChangeExplanation ? (
        <div className="mt-4 rounded-[1.1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
          <span className="text-slate-500">What changed:</span> {boardChangeExplanation}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-400">
          {focusOpportunity.sportsbookName
            ? `${focusOpportunity.sportsbookName} | ${focusOpportunity.actionState.replace(/_/g, " ").toLowerCase()}`
            : focusView.fairPrice
              ? `${focusView.fairPrice.pricingMethod.replace(/_/g, " ")} | confidence ${focusView.fairPrice.pricingConfidenceScore}`
              : game.selectedBook
                ? `Locked to ${game.selectedBook.name}`
                : `${game.bestBookCount} books compared`}
        </div>
        <div className="flex flex-wrap gap-3">
          {actions}
          <Link
            href={matchupHref ?? "/board"}
            className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
          >
            Open matchup
          </Link>
        </div>
      </div>
      </div>
    </Card>
  );
}
