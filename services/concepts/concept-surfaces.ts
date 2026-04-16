import type { GameCardView } from "@/lib/types/domain";
import { parseMatchupRouteId } from "@/lib/utils/matchups";
import { getAlertsPageData } from "@/services/alerts/alerts-service";
import { buildAttentionQueue } from "@/services/decision/attention-queue";
import {
  getBoardFocusMarket,
  getBoardGameIdentityKey,
  getBoardGameIntelligenceMap
} from "@/services/decision/board-memory-summary";
import { buildDecisionFromOpportunitySnapshot } from "@/services/decision/decision-engine";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import { getBoardPageData, parseBoardFilters } from "@/services/odds/board-service";
import { buildOpportunitySnapshot } from "@/services/opportunities/opportunity-snapshot";
import { buildGameMarketOpportunity } from "@/services/opportunities/opportunity-service";
import { getWatchlistPageData } from "@/services/watchlist/watchlist-service";

export type ConceptSharedState = Awaited<ReturnType<typeof getConceptSharedState>>;

function isVerifiedGame(game: GameCardView) {
  return (
    game.bestBookCount > 0 &&
    (game.spread.bestOdds !== 0 || game.moneyline.bestOdds !== 0 || game.total.bestOdds !== 0)
  );
}

function getDefaultBoardFilters() {
  return parseBoardFilters({
    league: "ALL",
    date: "today",
    sportsbook: "best",
    market: "all",
    status: "pregame"
  });
}

function getMovementScore(game: GameCardView) {
  const focusMarket = getBoardFocusMarket(game);
  const market = focusMarket === "moneyline" ? game.moneyline : game[focusMarket];
  const lineMovement = market.marketIntelligence?.lineMovement;

  if (typeof lineMovement?.lineDelta === "number") {
    return Math.abs(lineMovement.lineDelta);
  }

  if (typeof lineMovement?.priceDelta === "number") {
    return Math.abs(lineMovement.priceDelta);
  }

  return Math.abs(market.movement ?? 0);
}

export async function getConceptSharedState() {
  const boardData = await getBoardPageData(getDefaultBoardFilters());
  const verifiedGames = boardData.games.filter(isVerifiedGame);
  const boardIntelligence = await getBoardGameIntelligenceMap(verifiedGames);

  const attentionQueue = buildAttentionQueue(
    verifiedGames.map((game) => {
      const intelligence = boardIntelligence.get(getBoardGameIdentityKey(game)) ?? null;
      const focusMarket = intelligence?.focusMarket ?? getBoardFocusMarket(game);
      const opportunity = buildGameMarketOpportunity(game, focusMarket, boardData.providerHealth);
      const snapshot = buildOpportunitySnapshot(opportunity);
      const decision = snapshot ? buildDecisionFromOpportunitySnapshot(snapshot) : null;

      return {
        game,
        focusMarket,
        decision,
        summary: intelligence?.summary ?? null,
        intelligence
      };
    }),
    {
      getSecondarySortValue: (item) => Date.parse(item.game.startTime ?? "") || 0
    }
  );

  const movers = [...verifiedGames].sort((left, right) => getMovementScore(right) - getMovementScore(left)).slice(0, 6);

  const featuredGame = attentionQueue[0]?.game ?? verifiedGames[0] ?? boardData.games[0] ?? null;
  const featuredDetail = featuredGame?.detailHref
    ? await getMatchupDetail(parseMatchupRouteId(featuredGame.detailHref).externalId)
    : null;

  const [watchlistData, alertsData] = await Promise.all([
    getWatchlistPageData({
      sport: "ALL",
      league: "ALL",
      market: "ALL",
      liveStatus: "all",
      status: "ACTIVE"
    }),
    getAlertsPageData()
  ]);

  return {
    boardData,
    verifiedGames,
    boardIntelligence,
    attentionQueue,
    movers,
    featuredGame,
    featuredDetail,
    watchlistData,
    alertsData
  };
}
