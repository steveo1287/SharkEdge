import Link from "next/link";

import { GameCard } from "@/components/board/game-card";
import { BoardHero } from "@/components/board/board-hero";
import { BoardSummaryStrip } from "@/components/board/board-summary-strip";
import { VerifiedBoardGrid } from "@/components/board/verified-board-grid";
import { MarketMoversPanel } from "@/components/board/market-movers-panel";
import { LeagueDeskGrid } from "@/components/board/league-desk-grid";
import { ScoreboardContextGrid } from "@/components/board/scoreboard-context-grid";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { formatGameDateTime } from "@/lib/formatters/date";
import { formatAmericanOdds } from "@/lib/formatters/odds";
import type {
  BoardMarketView,
  BoardSportSectionView,
  GameCardView,
  LeagueKey,
  ScoreboardPreviewView
} from "@/lib/types/domain";
import { buildGameMarketOpportunity } from "@/services/opportunities/opportunity-service";

export const dynamic = "force-dynamic";

type BoardLeagueScope = LeagueKey | "ALL";
type BoardDateScope = "today" | "tomorrow" | "upcoming";
type BoardMarketKey = "spread" | "moneyline" | "total";

type BoardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const LEAGUE_ITEMS = [
  "ALL",
  "NBA",
  "NCAAB",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF",
  "UFC",
  "BOXING"
] as const;

const DATE_ITEMS = ["today", "tomorrow", "upcoming"] as const;
const MARKET_KEYS: BoardMarketKey[] = ["spread", "moneyline", "total"];

function readValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getSelectedLeague(value: string | undefined): BoardLeagueScope {
  const candidate = value?.toUpperCase();
  return (LEAGUE_ITEMS.find((league) => league === candidate) ?? "ALL") as BoardLeagueScope;
}

function getSelectedDate(value: string | undefined): BoardDateScope {
  return DATE_ITEMS.find((item) => item === value) ?? "today";
}

function resolveBoardDate(value: BoardDateScope) {
  if (value === "today") {
    return "today";
  }

  if (value === "upcoming") {
    return "all";
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const year = tomorrow.getFullYear();
  const month = `${tomorrow.getMonth() + 1}`.padStart(2, "0");
  const day = `${tomorrow.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

function isVerifiedGame(game: GameCardView) {
  return (
    game.bestBookCount > 0 &&
    (game.spread.bestOdds !== 0 || game.moneyline.bestOdds !== 0 || game.total.bestOdds !== 0)
  );
}

function getProviderHealthTone(state: string) {
  if (state === "HEALTHY") {
    return "success" as const;
  }

  if (state === "DEGRADED" || state === "FALLBACK") {
    return "premium" as const;
  }

  if (state === "OFFLINE") {
    return "danger" as const;
  }

  return "muted" as const;
}

function getSectionStatusTone(status: BoardSportSectionView["status"]) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

function getGameMarketPriority(game: GameCardView, marketKey: BoardMarketKey) {
  const market = game[marketKey];
  const rankScore = market.evProfile?.rankScore ?? 0;
  const confidenceScore = market.confidenceScore ?? 0;
  const movementBonus = Math.min(
    12,
    Math.abs(market.movement) * (marketKey === "moneyline" ? 0.35 : 2.5)
  );
  const qualityBonus = market.marketTruth?.qualityScore ?? 0;
  const bestPriceBonus = market.marketIntelligence?.bestPriceFlag ? 8 : 0;

  return rankScore + confidenceScore * 0.45 + qualityBonus * 0.2 + movementBonus + bestPriceBonus;
}

function getLeadMarket(game: GameCardView): BoardMarketKey {
  return [...MARKET_KEYS].sort(
    (left, right) => getGameMarketPriority(game, right) - getGameMarketPriority(game, left)
  )[0];
}

function getLeadMarketView(game: GameCardView): {
  key: BoardMarketKey;
  market: BoardMarketView;
} {
  const key = getLeadMarket(game);
  return {
    key,
    market: game[key]
  };
}

function getLeadScore(game: GameCardView) {
  return Math.max(
    buildGameMarketOpportunity(game, "spread").opportunityScore,
    buildGameMarketOpportunity(game, "moneyline").opportunityScore,
    buildGameMarketOpportunity(game, "total").opportunityScore
  );
}

function formatMovement(marketKey: BoardMarketKey, movement: number) {
  if (!movement) {
    return "No move";
  }

  const unit = marketKey === "moneyline" ? "c" : "pts";
  return `${movement > 0 ? "+" : ""}${movement.toFixed(1)} ${unit}`;
}

function formatOdds(value: number) {
  return value ? formatAmericanOdds(value) : "-";
}

function formatMarketLabel(value: string) {
  return value.startsWith("No ") ? "-" : value;
}

function formatMarketName(value: BoardMarketKey) {
  if (value === "moneyline") {
    return "Moneyline";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getBoardHref(league: BoardLeagueScope, date: BoardDateScope) {
  return `/board?league=${league}&date=${date}`;
}

function getLeagueHref(section: BoardSportSectionView) {
  return `/leagues/${section.leagueKey}`;
}

function buildScoreboardItems(sections: BoardSportSectionView[]) {
  return sections
    .flatMap((section) =>
      section.scoreboard.slice(0, 3).map((item) => ({
        section,
        item
      }))
    )
    .slice(0, 12);
}

function getScoreboardTone(item: ScoreboardPreviewView["status"]) {
  if (item === "LIVE") {
    return "success" as const;
  }

  if (item === "FINAL") {
    return "neutral" as const;
  }

  if (item === "POSTPONED" || item === "CANCELED") {
    return "danger" as const;
  }

  return "muted" as const;
}

export default async function BoardPage({ searchParams }: BoardPageProps) {
  const resolvedSearch = (await searchParams) ?? {};
  const selectedLeague = getSelectedLeague(readValue(resolvedSearch, "league"));
  const selectedDate = getSelectedDate(readValue(resolvedSearch, "date"));

  const oddsService = await import("@/services/odds/board-service");
  const filters = oddsService.parseBoardFilters({
    league: selectedLeague,
    date: resolveBoardDate(selectedDate),
    sportsbook: "best",
    market: "all",
    status: "pregame"
  });

  const boardData = await oddsService.getBoardPageData(filters);

  const verifiedGames = boardData.games
    .filter(isVerifiedGame)
    .sort((left, right) => getLeadScore(right) - getLeadScore(left));

  const movers = [...verifiedGames]
    .sort((left, right) => {
      const leftLead = getLeadMarketView(left);
      const rightLead = getLeadMarketView(right);

      const leftMovement = Math.abs(leftLead.market.movement);
      const rightMovement = Math.abs(rightLead.market.movement);

      if (rightMovement !== leftMovement) {
        return rightMovement - leftMovement;
      }

      return getLeadScore(right) - getLeadScore(left);
    })
    .slice(0, 6);

  const leagueSections = [...boardData.sportSections].sort((left, right) => {
    const liveRank = left.status === "LIVE" ? 0 : left.status === "PARTIAL" ? 1 : 2;
    const rightRank = right.status === "LIVE" ? 0 : right.status === "PARTIAL" ? 1 : 2;

    if (liveRank !== rightRank) {
      return liveRank - rightRank;
    }

    return right.games.length - left.games.length;
  });

  const scoreboardItems = buildScoreboardItems(leagueSections);

  return (
    <div className="grid gap-8">
     <BoardHero
    selectedLeague={selectedLeague}
    selectedDate={selectedDate}
    leagues={LEAGUE_ITEMS}
    dates={DATE_ITEMS}
  />

  <BoardSummaryStrip
    verifiedCount={verifiedGames.length}
    totalGames={boardData.summary.totalGames}
    sportsbooks={boardData.summary.totalSportsbooks}
    freshness={boardData.providerHealth.freshnessLabel}
  />

  <VerifiedBoardGrid games={verifiedGames} />

  <MarketMoversPanel games={movers} />

  <LeagueDeskGrid sections={leagueSections} />

  <ScoreboardContextGrid items={scoreboardItems} />
    </div>
  );
}