import type { GameCardView } from "@/lib/types/domain";
import type { DecisionMemorySummary } from "@/lib/types/decision-memory";
import {
  getDecisionMemoryEventSelectionKey,
  getDecisionMemorySummaryForEventSelections
} from "@/services/decision/decision-memory";

const BOARD_MARKET_KEYS = ["spread", "moneyline", "total"] as const;
const BOARD_SUMMARY_STALE_MINUTES = 180;

type BoardMarketKey = (typeof BOARD_MARKET_KEYS)[number];

export type BoardGameIntelligenceView = {
  focusMarket: BoardMarketKey;
  summary: DecisionMemorySummary | null;
  stale: boolean;
  renderable: boolean;
};

export function getBoardGameIdentityKey(game: Pick<GameCardView, "leagueKey" | "externalEventId" | "id">) {
  return `${game.leagueKey}::${game.externalEventId || game.id}`;
}

function getMarketFocusScore(game: GameCardView, marketKey: BoardMarketKey) {
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

export function getBoardFocusMarket(game: GameCardView): BoardMarketKey {
  return [...BOARD_MARKET_KEYS]
    .map((marketKey) => ({
      marketKey,
      score: getMarketFocusScore(game, marketKey)
    }))
    .sort((left, right) => right.score - left.score)[0]?.marketKey ?? "spread";
}

export function isDecisionMemorySummaryRenderable(
  summary: DecisionMemorySummary | null | undefined
) {
  return Boolean(
    summary &&
      summary.lastChangeSeverity &&
      summary.lastChangeSeverity !== "none" &&
      summary.lastChangeDirection &&
      typeof summary.shortExplanation === "string" &&
      summary.shortExplanation.trim().length > 0
  );
}

export function isDecisionMemorySummaryStale(
  summary: DecisionMemorySummary | null | undefined,
  maxAgeMinutes = BOARD_SUMMARY_STALE_MINUTES
) {
  if (!summary) {
    return true;
  }

  const updatedAt = Date.parse(summary.updatedAt);
  if (Number.isNaN(updatedAt)) {
    return true;
  }

  return Date.now() - updatedAt > maxAgeMinutes * 60 * 1000;
}

export function getBoardGameIntelligenceKey(game: GameCardView, focusMarket = getBoardFocusMarket(game)) {
  return getDecisionMemoryEventSelectionKey({
    league: game.leagueKey,
    eventExternalId: game.externalEventId,
    marketType: focusMarket,
    selection: game[focusMarket].label
  });
}

export async function getBoardGameIntelligenceMap(games: GameCardView[]) {
  if (!games.length) {
    return new Map<string, BoardGameIntelligenceView>();
  }

  const selections = games.map((game) => {
    const focusMarket = getBoardFocusMarket(game);
    return {
      game,
      focusMarket,
      key: getBoardGameIntelligenceKey(game, focusMarket)
    };
  });
  const summaries = await getDecisionMemorySummaryForEventSelections({
    selections: selections.map(({ game, focusMarket }) => ({
      league: game.leagueKey,
      eventExternalId: game.externalEventId,
      marketType: focusMarket,
      selection: game[focusMarket].label
    }))
  });

  return new Map<string, BoardGameIntelligenceView>(
    selections.map(({ game, focusMarket, key }) => {
      const summary = summaries.get(key) ?? null;
      const stale = isDecisionMemorySummaryStale(summary);
      return [
        getBoardGameIdentityKey(game),
        {
          focusMarket,
          summary,
          stale,
          renderable: isDecisionMemorySummaryRenderable(summary) && !stale
        }
      ];
    })
  );
}
