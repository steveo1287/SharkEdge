import Link from "next/link";
import type { ReactNode } from "react";

import { MarketSparkline } from "@/components/charts/market-sparkline";
import {
  ChangeSummaryBadge,
  getChangeSummaryExplanation
} from "@/components/intelligence/change-intelligence";
import {
  getOpportunityTrapLine,
  OpportunityBadgeRow
} from "@/components/intelligence/opportunity-badges";
import {
  getPrioritizationExplanation,
  PrioritizationBadge
} from "@/components/intelligence/prioritization";
import { IdentityTile } from "@/components/media/identity-tile";
import { formatGameDateTime } from "@/lib/formatters/date";
import { formatAmericanOdds } from "@/lib/formatters/odds";
import type { GameCardView } from "@/lib/types/domain";
import type { PrioritizationView } from "@/lib/types/prioritization";
import { getTeamLogoUrl, resolveMatchupHref } from "@/lib/utils/entity-routing";
import type { BoardGameIntelligenceView } from "@/services/decision/board-memory-summary";
import { getBoardFocusMarket } from "@/services/decision/board-memory-summary";
import { buildGameMarketOpportunity } from "@/services/opportunities/opportunity-service";

function formatFocusLabel(value: "spread" | "moneyline" | "total") {
  return value === "moneyline" ? "moneyline" : value;
}

function buildSparklineValues(game: GameCardView, focus: "spread" | "moneyline" | "total") {
  const market = game[focus];
  const lineMovement = market.marketIntelligence?.lineMovement;
  const values = [
    lineMovement?.openLine,
    lineMovement?.currentLine,
    lineMovement?.openPrice,
    lineMovement?.currentPrice,
    market.movement
  ];

  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

type GameCardProps = {
  game: GameCardView;
  focusMarket: string;
  intelligence?: BoardGameIntelligenceView | null;
  prioritization?: PrioritizationView | null;
  actions?: ReactNode;
};

export function GameCard({
  game,
  focusMarket,
  intelligence,
  prioritization,
  actions
}: GameCardProps) {
  const matchupHref = resolveMatchupHref({
    leagueKey: game.leagueKey,
    externalEventId: game.externalEventId,
    fallbackHref: game.detailHref ?? null
  }) ?? "/board";
  const marketKeys = ["spread", "moneyline", "total"] as const;
  const focus =
    focusMarket === "best" || !marketKeys.includes(focusMarket as (typeof marketKeys)[number])
      ? getBoardFocusMarket(game)
      : (focusMarket as (typeof marketKeys)[number]);
  const focusView = game[focus];
  const focusOpportunity = buildGameMarketOpportunity(game, focus);
  const trapLine = getOpportunityTrapLine(focusOpportunity);
  const boardSummary = intelligence?.focusMarket === focus ? intelligence.summary : null;
  const boardChangeExplanation =
    intelligence?.focusMarket === focus && intelligence.renderable
      ? getChangeSummaryExplanation(boardSummary)
      : null;
  const explanation =
    boardChangeExplanation ??
    getPrioritizationExplanation(prioritization) ??
    focusOpportunity.reasonSummary ??
    focusView.marketTruth?.note ??
    "No forced narrative.";
  const awayLogo = getTeamLogoUrl(game.leagueKey, game.awayTeam);
  const homeLogo = getTeamLogoUrl(game.leagueKey, game.homeTeam);

  return (
    <Link href={matchupHref} className="concept-board-row">
      <div className="flex min-w-0 items-start gap-3 md:gap-4">
        <div className="flex shrink-0 items-center gap-2">
          <IdentityTile
            label={game.awayTeam.name}
            shortLabel={game.awayTeam.abbreviation}
            imageUrl={awayLogo}
            size="sm"
            subtle
          />
          <IdentityTile
            label={game.homeTeam.name}
            shortLabel={game.homeTeam.abbreviation}
            imageUrl={homeLogo}
            size="sm"
            subtle
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-[0.98rem] font-semibold text-white">
              {game.awayTeam.name} at {game.homeTeam.name}
            </div>
            <ChangeSummaryBadge summary={boardSummary} />
            <PrioritizationBadge prioritization={prioritization} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>{game.leagueKey}</span>
            <span>{formatGameDateTime(game.startTime)}</span>
            <span>{formatFocusLabel(focus)}</span>
            <span>{game.bestBookCount} books</span>
          </div>
          <div className="mt-3 text-sm leading-6 text-slate-400">{explanation}</div>
          <div className="mt-3 hidden md:block">
            <OpportunityBadgeRow opportunity={focusOpportunity} />
          </div>
          {trapLine ? (
            <div className="mt-3 text-sm leading-6 text-rose-100">
              <span className="text-rose-200/75">Trap:</span> {trapLine}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid items-center gap-3 md:grid-cols-[170px_1fr_112px] xl:min-w-[490px] xl:grid-cols-[185px_1fr_128px]">
        <div className="grid gap-1">
          <div className="concept-meta">Focus market</div>
          <div className="text-sm font-semibold text-white">{focusView.lineLabel}</div>
          <div className="text-sm text-slate-300">
            {formatAmericanOdds(focusView.bestOdds)} at {focusView.bestBook}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="concept-chip concept-chip-accent">
            {focusOpportunity.actionState.replace(/_/g, " ")}
          </span>
          <span className="concept-chip concept-chip-muted">
            {focusOpportunity.confidenceTier} confidence
          </span>
          <span className={`concept-chip ${trapLine ? "concept-chip-danger" : "concept-chip-muted"}`}>
            {trapLine ? "trap raised" : focusOpportunity.timingState.replace(/_/g, " ").toLowerCase()}
          </span>
          {actions ? <span className="hidden xl:inline-flex">{actions}</span> : null}
        </div>

        <div className="flex items-center justify-end gap-3">
          <MarketSparkline
            values={buildSparklineValues(game, focus)}
            compact
            accent={boardSummary?.lastChangeDirection === "downgraded" ? "rose" : "cyan"}
          />
        </div>
      </div>
    </Link>
  );
}
