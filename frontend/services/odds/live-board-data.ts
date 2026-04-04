import { formatAmericanOdds, formatLine } from "@/lib/formatters/odds";
import type {
  BoardFilters,
  BoardMarketView,
  BoardPageData,
  GameCardView,
  LeagueKey,
  SportsbookRecord
} from "@/lib/types/domain";
import { calculateEdgeScore } from "@/lib/utils/edge-score";
import { americanToImpliedProbability } from "@/lib/utils/odds";
import { buildMatchupHref } from "@/lib/utils/matchups";
import { backendCurrentOddsProvider } from "@/services/current-odds/backend-provider";
import { therundownCurrentOddsProvider } from "@/services/current-odds/therundown-provider";
import type {
  CurrentOddsBoardResponse,
  CurrentOddsBookOutcome,
  CurrentOddsBookmaker,
  CurrentOddsGame,
  CurrentOddsOffer,
  CurrentOddsSport
} from "@/services/current-odds/provider-types";
import { buildBoardSportSections, getBoardSupportSummary, getBoardVisibleLeagues } from "@/services/events/live-score-service";
import { analyzeMarket } from "@/services/market/market-analysis-service";
import type { MarketPriceSample } from "@/services/market/market-truth-service";
import { buildProviderHealth } from "@/services/providers/provider-health";

import {
  buildLiveSportsbookRecord,
  buildNameTokens,
  getLeagueForSportKey,
  getLeagueRecord,
  getLiveTeamRecord,
  normalizeName
} from "./live-reference";

const LIVE_BOARD_SOFT_STALE_MINUTES = 15;
const LIVE_BOARD_HARD_STALE_MINUTES = 45;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

type CurrentOddsSourceCandidate = {
  providerKey: string;
  response: CurrentOddsBoardResponse;
};

function numericValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasUsableOdds(value: number | null | undefined) {
  return typeof value === "number" && value !== 0;
}

function getResponseAgeMinutes(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, (Date.now() - parsed) / 60000);
}

function isHardStale(value: string | null | undefined, thresholdMinutes: number) {
  const ageMinutes = getResponseAgeMinutes(value);
  return typeof ageMinutes === "number" && ageMinutes >= thresholdMinutes;
}

function scoreBoardCandidate(candidate: CurrentOddsSourceCandidate) {
  const ageMinutes = getResponseAgeMinutes(candidate.response.generated_at);

  if (isHardStale(candidate.response.generated_at, LIVE_BOARD_HARD_STALE_MINUTES)) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;

  if (ageMinutes === null) {
    score -= 8;
  } else if (ageMinutes <= 5) {
    score += 16;
  } else if (ageMinutes <= LIVE_BOARD_SOFT_STALE_MINUTES) {
    score += 10;
  } else {
    score += 2;
  }

  score -= candidate.response.errors.length * 8;
  score += candidate.response.sports.length * 2;
  score += Math.min(
    12,
    candidate.response.sports.reduce((total, sport) => total + sport.games.length, 0)
  );

  if (candidate.providerKey === backendCurrentOddsProvider.key) {
    score += 2;
  }

  return score;
}

function selectPreferredBoardResponse(candidates: Array<CurrentOddsSourceCandidate | null>) {
  const viableCandidates = candidates
    .filter((candidate): candidate is CurrentOddsSourceCandidate => Boolean(candidate?.response?.configured))
    .filter((candidate) => !isHardStale(candidate.response.generated_at, LIVE_BOARD_HARD_STALE_MINUTES));

  if (!viableCandidates.length) {
    return null;
  }

  return [...viableCandidates].sort((left, right) => scoreBoardCandidate(right) - scoreBoardCandidate(left))[0]?.response ?? null;
}

async function fetchLiveBoardResponse() {
  const [backendResponse, theRundownResponse] = await Promise.all([
    backendCurrentOddsProvider.fetchBoard(),
    therundownCurrentOddsProvider.fetchBoard()
  ]);

  const response = selectPreferredBoardResponse([
    backendResponse
      ? { providerKey: backendCurrentOddsProvider.key, response: backendResponse }
      : null,
    theRundownResponse
      ? { providerKey: therundownCurrentOddsProvider.key, response: theRundownResponse }
      : null
  ]);

  if (!response?.configured) {
    return null;
  }

  return response;
}

function getBestPrice(offer: CurrentOddsOffer | null | undefined) {
  if (!offer) {
    return 0;
  }

  return numericValue(offer.best_price) ?? numericValue(offer.average_price) ?? 0;
}

function getConsensusPoint(offer: CurrentOddsOffer | null | undefined) {
  return numericValue(offer?.consensus_point);
}

function formatBookLabel(bookmakers: string[]) {
  if (!bookmakers.length) {
    return "Market";
  }

  if (bookmakers.length <= 2) {
    return bookmakers.join(", ");
  }

  return `${bookmakers[0]}, ${bookmakers[1]} +${bookmakers.length - 2}`;
}

function getLiveBestOffer(game: CurrentOddsGame, marketType: "spread" | "moneyline" | "total") {
  const offers = game.market_stats[marketType] ?? [];

  if (!offers.length) {
    return null;
  }

  if (marketType === "total") {
    return [...offers].sort((left, right) => {
      const leftBooks = left.book_count ?? 0;
      const rightBooks = right.book_count ?? 0;
      if (rightBooks !== leftBooks) {
        return rightBooks - leftBooks;
      }

      return getBestPrice(right) - getBestPrice(left);
    })[0] ?? null;
  }

  if (marketType === "moneyline") {
    return [...offers].sort((left, right) => {
      const leftPrice = numericValue(left.average_price) ?? getBestPrice(left);
      const rightPrice = numericValue(right.average_price) ?? getBestPrice(right);
      if (rightPrice !== leftPrice) {
        return rightPrice - leftPrice;
      }

      return (right.book_count ?? 0) - (left.book_count ?? 0);
    })[0] ?? null;
  }

  return [...offers].sort((left, right) => {
    const pointDelta = (getConsensusPoint(right) ?? -999) - (getConsensusPoint(left) ?? -999);
    if (pointDelta !== 0) {
      return pointDelta;
    }

    return getBestPrice(right) - getBestPrice(left);
  })[0] ?? null;
}

function findBook(game: CurrentOddsGame, sportsbookKey: string) {
  return game.bookmakers.find((bookmaker) => bookmaker.key === sportsbookKey) ?? null;
}

function findBookOutcome(
  bookmaker: CurrentOddsBookmaker,
  marketType: "moneyline" | "spread" | "total",
  outcomeName: string
) {
  const normalizedOutcome = normalizeName(outcomeName);
  const outcomeTokens = buildNameTokens(outcomeName);

  return (
    bookmaker.markets[marketType].find((outcome) => {
      const normalizedName = normalizeName(outcome.name);
      if (normalizedName === normalizedOutcome) {
        return true;
      }

      return outcomeTokens.includes(normalizedName);
    }) ?? null
  );
}

function buildLiveMarketSamples(
  game: CurrentOddsGame,
  marketType: "spread" | "moneyline" | "total",
  outcomeName: string
): MarketPriceSample[] {
  const samples: MarketPriceSample[] = [];

  for (const bookmaker of game.bookmakers) {
    const outcome = findBookOutcome(bookmaker, marketType, outcomeName);
    if (!outcome || !hasUsableOdds(outcome.price)) {
      continue;
    }

    samples.push({
        bookKey: bookmaker.key,
        bookName: bookmaker.title,
        price: numericValue(outcome.price),
        line: numericValue(outcome.point),
        updatedAt: bookmaker.last_update ?? null
      });
  }

  return samples;
}

function getOppositeOutcomeName(game: CurrentOddsGame, outcomeName: string, marketType: "spread" | "moneyline" | "total") {
  if (marketType === "total") {
    return normalizeName(outcomeName) === "over" ? "under" : "over";
  }

  return normalizeName(outcomeName) === normalizeName(game.home_team) ? game.away_team : game.home_team;
}

function buildMarketViewFromSamples(args: {
  leagueKey: LeagueKey;
  game: CurrentOddsGame;
  marketType: "spread" | "moneyline" | "total";
  outcomeName: string;
  label: string;
  line: number | null;
  sportsbookKey?: string | null;
  sportsbookLabel: string;
  oddsAmerican: number | null;
}): BoardMarketView {
  const sideSamples = buildLiveMarketSamples(args.game, args.marketType, args.outcomeName);
  const oppositeSamples = buildLiveMarketSamples(
    args.game,
    args.marketType,
    getOppositeOutcomeName(args.game, args.outcomeName, args.marketType)
  );
  const analysis = analyzeMarket({
    marketLabel: args.marketType === "total" ? "Total" : args.marketType === "moneyline" ? "Moneyline" : "Spread",
    sport: getLeagueRecord(args.leagueKey).sport,
    league: args.leagueKey,
    eventId: args.game.id,
    providerEventId: args.game.id,
    marketType: args.marketType,
    marketScope: "game",
    side: args.marketType === "total" ? args.outcomeName.toUpperCase() : args.outcomeName,
    oppositeSide: args.marketType === "total" ? getOppositeOutcomeName(args.game, args.outcomeName, args.marketType).toUpperCase() : getOppositeOutcomeName(args.game, args.outcomeName, args.marketType),
    line: args.line,
    participantTeamId:
      args.marketType === "total"
        ? null
        : getLiveTeamRecord(args.leagueKey, args.outcomeName).id,
    offeredSportsbookKey: args.sportsbookKey ?? null,
    offeredOddsAmerican: args.oddsAmerican,
    sideSamples,
    oppositeSamples,
    supportNote: args.sportsbookKey ? "Live board comparison" : "Live best-price board",
    sourceName: "Live board feed",
    sourceType: "api",
    isLive: false
  });

  return {
    label: args.label,
    lineLabel: args.label,
    bestBook: args.sportsbookLabel,
    bestOdds: args.oddsAmerican ?? 0,
    movement: 0,
    canonicalMarketKey: analysis.canonicalMarketKey,
    marketTruth: analysis.marketTruth,
    fairPrice: analysis.fairPrice,
    evProfile: analysis.ev,
    marketIntelligence: analysis.marketIntelligence,
    reasons: analysis.reasons,
    confidenceBand: analysis.confidenceBand,
    confidenceScore: analysis.confidenceScore,
    hidden: analysis.hidden
  };
}

function buildBestMarketView(
  leagueKey: LeagueKey,
  game: CurrentOddsGame,
  marketType: "spread" | "moneyline" | "total"
): BoardMarketView {
  const offer = getLiveBestOffer(game, marketType);
  if (!offer) {
    return {
      label: "No market",
      lineLabel: "No market",
      bestBook: "Unavailable",
      bestOdds: 0,
      movement: 0
    } satisfies BoardMarketView;
  }

  if (marketType === "total") {
    return buildMarketViewFromSamples({
      leagueKey,
      game,
      marketType,
      outcomeName: "over",
      label: `O/U ${formatLine(offer.consensus_point, false)}`,
      line: getConsensusPoint(offer),
      sportsbookLabel: formatBookLabel(offer.best_bookmakers),
      oddsAmerican: getBestPrice(offer)
    });
  }

  const team = getLiveTeamRecord(leagueKey, offer.name);
  const lineValue =
    marketType === "moneyline"
      ? formatAmericanOdds(getBestPrice(offer))
      : formatLine(getConsensusPoint(offer));

  return buildMarketViewFromSamples({
    leagueKey,
    game,
    marketType,
    outcomeName: offer.name,
    label: `${team.abbreviation} ${lineValue}`,
    line: getConsensusPoint(offer),
    sportsbookLabel: formatBookLabel(offer.best_bookmakers),
    oddsAmerican: getBestPrice(offer)
  });
}

function buildBookSpecificMarketView(
  leagueKey: LeagueKey,
  game: CurrentOddsGame,
  marketType: "spread" | "moneyline" | "total",
  sportsbookKey: string
): BoardMarketView | null {
  const bookmaker = findBook(game, sportsbookKey);
  if (!bookmaker) {
    return null;
  }

  if (marketType === "total") {
    const over = findBookOutcome(bookmaker, "total", "over");
    if (!over) {
      return null;
    }

    return buildMarketViewFromSamples({
      leagueKey,
      game,
      marketType,
      outcomeName: "over",
      label: `O/U ${formatLine(over.point, false)}`,
      line: numericValue(over.point),
      sportsbookKey: bookmaker.key,
      sportsbookLabel: bookmaker.title,
      oddsAmerican: numericValue(over.price)
    });
  }

  const preferredOutcomeName = getLiveBestOffer(game, marketType)?.name ?? game.away_team;
  const outcome = findBookOutcome(bookmaker, marketType, preferredOutcomeName);
  if (!outcome) {
    return null;
  }

  const team = getLiveTeamRecord(leagueKey, outcome.name);
  const lineValue =
    marketType === "moneyline"
      ? formatAmericanOdds(numericValue(outcome.price) ?? 0)
      : formatLine(outcome.point);

  return buildMarketViewFromSamples({
    leagueKey,
    game,
    marketType,
    outcomeName: outcome.name,
    label: `${team.abbreviation} ${lineValue}`,
    line: numericValue(outcome.point),
    sportsbookKey: bookmaker.key,
    sportsbookLabel: bookmaker.title,
    oddsAmerican: numericValue(outcome.price)
  });
}

function buildLiveMarketView(
  leagueKey: LeagueKey,
  game: CurrentOddsGame,
  marketType: "spread" | "moneyline" | "total",
  sportsbookKey: string
) {
  if (sportsbookKey === "best") {
    return buildBestMarketView(leagueKey, game, marketType);
  }

  return buildBookSpecificMarketView(leagueKey, game, marketType, sportsbookKey) ?? buildBestMarketView(leagueKey, game, marketType);
}

function buildLiveEdgeScore(game: CurrentOddsGame) {
  const moneylineOffer = getLiveBestOffer(game, "moneyline");
  const consensusStrength = Math.min(0.18, game.bookmakers_available * 0.02);
  const volatility = Math.max(0.2, 1 - game.bookmakers_available / 8);

  return calculateEdgeScore({
    impliedProbability:
      getBestPrice(moneylineOffer) !== 0 ? americanToImpliedProbability(getBestPrice(moneylineOffer)) : null,
    recentHitRate: 0.5 + consensusStrength,
    lineMovementSupport: 0.35,
    volatility
  });
}

function buildLiveSportsbooks(sports: CurrentOddsSport[]) {
  const books = new Map<string, SportsbookRecord>();

  for (const sport of sports) {
    for (const game of sport.games) {
      for (const bookmaker of game.bookmakers) {
        if (!books.has(bookmaker.key)) {
          books.set(bookmaker.key, buildLiveSportsbookRecord(bookmaker.key, bookmaker.title));
        }
      }
    }
  }

  return [
    { id: "best", key: "best", name: "Best available", region: "US" } satisfies SportsbookRecord,
    ...Array.from(books.values())
  ];
}

function isGameInCurrentBoardWindow(leagueKey: LeagueKey, startTime: string) {
  const start = Date.parse(startTime);
  if (!Number.isFinite(start)) {
    return true;
  }

  const now = Date.now();
  const diff = start - now;

  if (leagueKey === "NFL") {
    return Math.abs(diff) <= DAY_IN_MS * 7;
  }

  if (leagueKey === "NCAAF") {
    const eventDate = new Date(start);
    const eventMonth = eventDate.getUTCMonth();
    const seasonMonth = eventMonth === 0 || eventMonth >= 7;
    return seasonMonth && diff <= DAY_IN_MS * 14;
  }

  return true;
}

function countRenderedRows(sections: BoardPageData["sportSections"]) {
  return sections.reduce((total, section) => total + section.games.length + section.scoreboard.length, 0);
}

function getLiveSourceNote(response: CurrentOddsBoardResponse) {
  const providerLabel =
    response.provider === "odds_api"
      ? "The Odds API"
      : response.provider === "therundown"
        ? "The Rundown"
        : "the live backend";

  if (response.errors.length) {
    return `${providerLabel} is connected for the board, with partial fetch warnings still reported by the backend.`;
  }

  return `${providerLabel} is powering the live pregame board. Basketball props are still the only live prop feed today, while the ledger and performance stack remain sport-agnostic.`;
}

export async function getLiveBoardPageData(filters: BoardFilters): Promise<BoardPageData | null> {
  const response = await fetchLiveBoardResponse();
  const supportedSports = (response?.sports ?? []).filter((sport) => {
    const leagueKey = getLeagueForSportKey(sport.key);
    return leagueKey && (filters.league === "ALL" || filters.league === leagueKey);
  });

  const liveSportsbooks = supportedSports.length
    ? buildLiveSportsbooks(supportedSports)
    : ([{ id: "best", key: "best", name: "Best available", region: "US" }] satisfies SportsbookRecord[]);

  const games = supportedSports
    .flatMap((sport) => {
      const leagueKey = getLeagueForSportKey(sport.key);
      if (!leagueKey) {
        return [];
      }

      return sport.games.map((game) => ({ sport, game, leagueKey }));
    })
    .filter(({ game }) => (filters.date === "all" || filters.date === "today" ? true : game.commence_time.startsWith(filters.date)))
    .filter(({ game }) =>
      filters.sportsbook === "best"
        ? true
        : game.bookmakers.some((bookmaker) => bookmaker.key === filters.sportsbook)
    )
    .map(({ game, leagueKey }) => {
      const awayTeam = getLiveTeamRecord(leagueKey, game.away_team);
      const homeTeam = getLiveTeamRecord(leagueKey, game.home_team);
      const selectedBook =
        filters.sportsbook === "best"
          ? null
          : liveSportsbooks.find((book) => book.key === filters.sportsbook) ?? null;

      return {
        id: game.id,
        externalEventId: game.id,
        leagueKey,
        awayTeam,
        homeTeam,
        startTime: game.commence_time,
        status: "PREGAME",
        venue: "Live market feed",
        selectedBook,
        bestBookCount: game.bookmakers_available,
        spread: buildLiveMarketView(leagueKey, game, "spread", filters.sportsbook),
        moneyline: buildLiveMarketView(leagueKey, game, "moneyline", filters.sportsbook),
        total: buildLiveMarketView(leagueKey, game, "total", filters.sportsbook),
        edgeScore: buildLiveEdgeScore(game),
        detailHref: buildMatchupHref(leagueKey, game.id)
      } satisfies GameCardView;
    });

  const filteredGames = games.filter((game) => isGameInCurrentBoardWindow(game.leagueKey, game.startTime));
  const gamesByLeague = filteredGames.reduce<Partial<Record<LeagueKey, GameCardView[]>>>((groups, game) => {
    groups[game.leagueKey] = [...(groups[game.leagueKey] ?? []), game];
    return groups;
  }, {});

  const availableDates = Array.from(
    new Set(
      supportedSports.flatMap((sport) =>
        sport.games
          .map((game) => {
            const leagueKey = getLeagueForSportKey(sport.key);
            return leagueKey && isGameInCurrentBoardWindow(leagueKey, game.commence_time)
              ? game.commence_time.slice(0, 10)
              : null;
          })
          .filter(Boolean) as string[]
      )
    )
  ).sort();

  const sportSections = await buildBoardSportSections({
    selectedLeague: filters.league,
    gamesByLeague
  });
  const sectionDates = Array.from(
    new Set(sportSections.flatMap((section) => section.scoreboard.map((event) => event.startTime.slice(0, 10))))
  ).sort();
  const supportSummary = getBoardSupportSummary();
  const livePropSports = sportSections.filter((section) => section.propsStatus === "LIVE").length;

  return {
    filters,
    availableDates: Array.from(new Set([...availableDates, ...sectionDates])).sort(),
    leagues: getBoardVisibleLeagues(filters.league),
    sportsbooks: liveSportsbooks,
    games: filteredGames,
    sportSections,
    snapshots: [],
    summary: {
      totalGames: countRenderedRows(sportSections),
      totalProps: livePropSports,
      totalSportsbooks: Math.max(0, liveSportsbooks.length - 1)
    },
    liveMessage:
      filters.status === "live"
        ? "Live state is rendering league by league now. Sports without full odds coverage stay visible with adapter-pending states instead of disappearing behind empty board counts."
        : null,
    source: "live",
    sourceNote: response
      ? `${getLiveSourceNote(response)} ${supportSummary.live} sports are live, ${supportSummary.partial} are partial, and ${supportSummary.comingSoon} are still coming soon.`
      : `Current odds are temporarily unavailable, but the support model is still rendering honestly: ${supportSummary.live} sports live, ${supportSummary.partial} partial, ${supportSummary.comingSoon} coming soon.`,
    providerHealth: buildProviderHealth({
      supportStatus: response?.errors.length ? "PARTIAL" : "LIVE",
      source: "live",
      generatedAt: response?.generated_at ?? null,
      warnings: response?.errors ?? [],
      healthySummary: "The live board feed is connected and powering verified pregame comparisons.",
      degradedSummary:
        "The live board feed is connected, but warnings or timestamp drift mean this board should be treated as partially degraded.",
      fallbackSummary:
        "The board is leaning on support-aware fallback behavior while live pricing coverage is only partially connected.",
      offlineSummary:
        "The board feed is offline in this runtime, so only fallback scoreboard context is available."
    })
  };
}
