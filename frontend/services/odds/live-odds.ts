import { calculateEdgeScore } from "@/lib/utils/edge-score";
import { calculateMarketExpectedValuePct } from "@/lib/utils/bet-intelligence";
import { americanToImpliedProbability } from "@/lib/utils/odds";
import { formatAmericanOdds, formatLine } from "@/lib/formatters/odds";
import { prisma } from "@/lib/db/prisma";
import { buildMatchupHref } from "@/lib/utils/matchups";
import type {
  BoardFilters,
  BoardMarketView,
  BoardPageData,
  GameCardView,
  GameDetailView,
  GameOddsRow,
  LeagueKey,
  LeagueRecord,
  PlayerRecord,
  PropCardView,
  PropFilters,
  SportsbookRecord,
  TeamRecord
} from "@/lib/types/domain";
import { mockDatabase } from "@/prisma/seed-data";
import { backendCurrentOddsProvider } from "@/services/current-odds/backend-provider";
import { getProviderRegistryEntry } from "@/services/providers/registry";
import { getPropTrendSummaries } from "@/services/trends/trends-service";
import type {
  CurrentOddsBoardResponse,
  CurrentOddsGame,
  CurrentOddsSport
} from "@/services/current-odds/provider-types";
import {
  buildBoardSportSections,
  getBoardSupportSummary,
  getBoardVisibleLeagues
} from "@/services/events/live-score-service";
import { getLeagueSnapshots } from "@/services/stats/stats-service";
const LIVE_PROPS_EVENT_LIMIT = 3;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const LIVE_SPORT_TO_LEAGUE: Record<string, LeagueKey | null> = {
  basketball_nba: "NBA",
  basketball_ncaab: "NCAAB",
  baseball_mlb: "MLB",
  icehockey_nhl: "NHL",
  americanfootball_nfl: "NFL",
  americanfootball_ncaaf: "NCAAF"
};

const LIVE_PROP_SPORT_KEYS: Partial<Record<LeagueKey, string>> = {
  NBA: "basketball_nba",
  NCAAB: "basketball_ncaab"
};

const PROP_COVERAGE_ORDER: LeagueKey[] = [
  "NBA",
  "NCAAB",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF",
  "UFC",
  "BOXING"
];

const leagueByKey = new Map(
  mockDatabase.leagues.map((league) => [league.key, league] as const)
);
const teamLookup = mockDatabase.teams.map((team) => ({
  team,
  leagueKey: mockDatabase.leagues.find((league) => league.id === team.leagueId)?.key as
    | LeagueKey
    | undefined
}));

type LiveOffer = {
  name: string;
  best_price: number | null;
  best_bookmakers: string[];
  average_price: number | null;
  book_count: number;
  consensus_point: number | null;
  point_frequency: number;
};

type LiveMarketStatMap = {
  moneyline: LiveOffer[];
  spread: LiveOffer[];
  total: LiveOffer[];
};

type LiveBookOutcome = {
  name: string;
  price: number | null;
  point: number | null;
};

type LiveBookmaker = {
  key: string;
  title: string;
  last_update?: string;
  markets: {
    moneyline: LiveBookOutcome[];
    spread: LiveBookOutcome[];
    total: LiveBookOutcome[];
  };
};

type LiveGame = CurrentOddsGame;
type LiveSport = CurrentOddsSport;
type LiveBoardResponse = CurrentOddsBoardResponse;

type LiveTeamFormSummary = {
  games: number;
  record: string;
  avg_points_for: number | null;
  avg_points_against: number | null;
  avg_margin: number | null;
  avg_total: number | null;
};

type LiveTeamContext = {
  recent_results: Array<{
    id: string;
    commence_time: string;
    opponent: string;
    location: string;
    result: string;
    team_score: number;
    opponent_score: number;
    margin: number;
    game_total: number;
  }>;
  summary: LiveTeamFormSummary;
};

type LiveStatEntry = {
  key: string;
  label: string;
  display_value: string;
  description?: string;
  rank?: number | null;
};

type LiveRange = {
  min: number;
  max: number;
  span: number;
};

type LiveGameDetailResponse = {
  configured: boolean;
  generated_at: string;
  sport: {
    key: string;
    title: string;
    short_title: string;
  };
  game: LiveGame;
  line_analytics: {
    spread_range: Record<string, LiveRange | null>;
    total_range: {
      over: LiveRange | null;
      under: LiveRange | null;
    };
  };
  team_form: Record<string, LiveTeamContext>;
  team_stats: Record<string, LiveStatEntry[]>;
  team_live_stats?: Record<string, Array<{
    label: string;
    display_value: string;
    source?: string;
  }>>;
  player_leaders: {
    available: boolean;
    message: string;
    teams?: Record<string, Array<{
      athlete_name?: string | null;
      display_value?: string | null;
      label?: string | null;
    }>>;
  };
  player_spotlights?: {
    available: boolean;
    source?: string;
    message?: string;
    teams?: Record<string, Array<{
      category?: string | null;
      athlete_name?: string | null;
      display_value?: string | null;
      position?: string | null;
    }>>;
  };
  provider_contract?: Record<string, unknown>;
  verified_user_stats: {
    available: boolean;
    message: string;
  };
  props: LiveProp[];
  notes: string[];
};

type LiveProp = {
  id: string;
  event_id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmaker_key: string;
  bookmaker_title: string;
  market_key: Extract<
    PropCardView["marketType"],
    "player_points" | "player_rebounds" | "player_assists" | "player_threes"
  >;
  player_name: string;
  player_external_id?: string | null;
  player_position?: string | null;
  team_name?: string | null;
  opponent_name?: string | null;
  team_resolved: boolean;
  side: string;
  line: number;
  price: number;
  last_update?: string;
};

type LivePropsSport = {
  key: string;
  title: string;
  short_title: string;
  event_count: number;
  game_count: number;
  prop_count: number;
  event_limit: number;
  events_scanned: number;
  partial: boolean;
  props: LiveProp[];
  errors: string[];
};

type LivePropsBoardResponse = {
  configured: boolean;
  generated_at: string;
  bookmakers: string;
  errors: string[];
  prop_count: number;
  event_limit: number;
  partial: boolean;
  quota_note?: string;
  sports: LivePropsSport[];
};

type EspnBoardOdds = {
  source: "the-odds-api" | "espn";
  bookmakers: string[];
  spread: string | null;
  spreadPoint: number | null;
  overUnder: number | null;
  overPrice: number | null;
  underPrice: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
};

type EspnBoardGame = {
  id: string | null;
  oddsEventId: string | null;
  league: "nba" | "ncaab";
  name: string | null;
  shortName: string | null;
  date: string | null;
  status: {
    state: string | null;
    detail: string | null;
    completed: boolean;
  };
  home: {
    id: string | null;
    name: string | null;
    abbreviation: string | null;
    logo: string | null;
    score: string | null;
    record: string | null;
    winner: boolean | null;
  };
  away: {
    id: string | null;
    name: string | null;
    abbreviation: string | null;
    logo: string | null;
    score: string | null;
    record: string | null;
    winner: boolean | null;
  };
  venue: string | null;
  broadcast: string | null;
  odds: EspnBoardOdds | null;
};

type EspnBoardResponse = {
  league: "nba" | "ncaab";
  date: string;
  count: number;
  gamesWithOdds: number;
  oddsSource: string;
  oddsApiActive: boolean;
  games: EspnBoardGame[];
  fetchedAt: string;
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function buildNameTokens(value: string) {
  const normalized = normalizeName(value);
  const parts = value
    .split(/\s+/)
    .map((part) => normalizeName(part))
    .filter(Boolean);

  return Array.from(new Set([normalized, ...parts, parts.at(-1) ?? ""])).filter(Boolean);
}

function getLeagueForSportKey(sportKey: string): LeagueKey | null {
  return LIVE_SPORT_TO_LEAGUE[sportKey] ?? null;
}

function getBoardLeagueRecords(leagueKeys: readonly LeagueKey[]) {
  return leagueKeys
    .map((leagueKey) => leagueByKey.get(leagueKey))
    .filter((league): league is LeagueRecord => Boolean(league));
}

function getLeagueRecord(leagueKey: LeagueKey): LeagueRecord {
  return leagueByKey.get(leagueKey) ?? mockDatabase.leagues[0];
}

function deriveAbbreviation(teamName: string) {
  const parts = teamName
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);

  if (parts.length >= 2) {
    return parts
      .slice(0, 3)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  return teamName.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
}

function getLiveTeamRecord(leagueKey: LeagueKey, teamName: string): TeamRecord {
  const normalized = normalizeName(teamName);
  const existing = teamLookup.find(
    (entry) =>
      entry.leagueKey === leagueKey &&
      normalizeName(entry.team.name) === normalized
  )?.team;

  if (existing) {
    return existing;
  }

  const league = getLeagueRecord(leagueKey);

  return {
    id: `live_${leagueKey.toLowerCase()}_${normalized}`,
    leagueId: league.id,
    name: teamName,
    abbreviation: deriveAbbreviation(teamName),
    externalIds: {
      source: "live-backend"
    }
  };
}

function getLiveSourceNote(response: LiveBoardResponse) {
  const providerLabel =
    response.provider === "odds_api"
        ? "The Odds API"
        : "the live backend";

  if (response.errors.length) {
    return `${providerLabel} is connected for the board, with partial fetch warnings still reported by the backend.`;
  }

  return `${providerLabel} is powering the live pregame board. Basketball props are still the only live prop feed today, while the ledger and performance stack remain sport-agnostic.`;
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

function numericValue(value: number | null | undefined) {
  return typeof value === "number" ? value : null;
}

function hasUsableOdds(value: number | null | undefined) {
  return typeof value === "number" && value !== 0;
}

function formatOddsOrDash(value: number | null | undefined) {
  return hasUsableOdds(value) ? formatAmericanOdds(value as number) : "–";
}

function formatBestBookOrDash(value: string | null | undefined) {
  return value && value.trim() ? value : "–";
}

function isGameInCurrentBoardWindow(leagueKey: LeagueKey, startTime: string) {
  const start = Date.parse(startTime);
  if (!Number.isFinite(start)) {
    return true;
  }

  const diff = start - Date.now();

  if (leagueKey === "NFL") {
    return Math.abs(diff) <= DAY_IN_MS * 7;
  }

  if (leagueKey === "NCAAF") {
    const eventMonth = new Date(start).getUTCMonth();
    const seasonMonth = eventMonth === 0 || eventMonth >= 7;
    return seasonMonth && diff <= DAY_IN_MS * 14;
  }

  return true;
}

function countRenderedRows(sections: BoardPageData["sportSections"]) {
  return sections.reduce((total, section) => {
    if (section.adapterState === "BOARD") {
      return total + section.games.length;
    }

    if (section.adapterState === "SCORES_ONLY") {
      return total + section.scoreboard.length;
    }

    return total;
  }, 0);
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function buildLiveSportsbookRecord(key: string, name: string): SportsbookRecord {
  return {
    id: `live_${key}`,
    key,
    name,
    region: "US"
  };
}

function buildUnknownTeamRecord(
  leagueKey: LeagueKey,
  label: string,
  suffix: string
): TeamRecord {
  const league = getLeagueRecord(leagueKey);

  return {
    id: `live_${leagueKey.toLowerCase()}_${suffix}`,
    leagueId: league.id,
    name: label,
    abbreviation: label
      .split(/\s+/)
      .map((part) => part[0] ?? "")
      .join("")
      .slice(0, 3)
      .toUpperCase()
      .padEnd(3, "D"),
    externalIds: {
      source: "live-backend"
    }
  };
}

function buildLivePlayerRecord(
  leagueKey: LeagueKey,
  prop: LiveProp,
  team: TeamRecord
): PlayerRecord {
  const league = getLeagueRecord(leagueKey);

  return {
    id:
      prop.player_external_id && prop.player_external_id.trim().length
        ? `live_${leagueKey.toLowerCase()}_${prop.player_external_id}`
        : `live_${leagueKey.toLowerCase()}_${normalizeName(prop.player_name)}`,
    leagueId: league.id,
    teamId: team.id,
    name: prop.player_name,
    position: prop.player_position?.trim() || "--",
    externalIds: {
      source: "live-backend",
      ...(prop.player_external_id ? { espn: prop.player_external_id } : {})
    },
    status: "ACTIVE"
  };
}

function buildLivePropGroupKey(prop: LiveProp) {
  return [
    prop.sport_key,
    prop.event_id,
    normalizeName(prop.player_name),
    prop.market_key,
    prop.side.toUpperCase(),
    String(prop.line),
    normalizeName(prop.team_name ?? "")
  ].join("|");
}

function buildLivePropCard(props: LiveProp[]): PropCardView | null {
  const prop = props[0];
  if (!prop) {
    return null;
  }

  const leagueKey = getLeagueForSportKey(prop.sport_key);
  if (!leagueKey) {
    return null;
  }

  const awayTeam = getLiveTeamRecord(leagueKey, prop.away_team);
  const homeTeam = getLiveTeamRecord(leagueKey, prop.home_team);
  const teamResolved = Boolean(prop.team_resolved && prop.team_name && prop.opponent_name);
  const team = teamResolved
    ? getLiveTeamRecord(leagueKey, prop.team_name ?? prop.home_team)
    : buildUnknownTeamRecord(leagueKey, "Team TBD", `team_tbd_${normalizeName(prop.id)}`);
  const opponent = teamResolved
    ? getLiveTeamRecord(leagueKey, prop.opponent_name ?? prop.away_team)
    : buildUnknownTeamRecord(
        leagueKey,
        "Opponent TBD",
        `opponent_tbd_${normalizeName(prop.id)}`
      );
  const player = buildLivePlayerRecord(leagueKey, prop, team);
  const uniqueBooks = Array.from(
    new Map(props.map((entry) => [`${entry.bookmaker_key}:${entry.side}:${entry.line}`, entry] as const)).values()
  );
  const sortedByPrice = [...uniqueBooks].sort((left, right) => right.price - left.price);
  const best = sortedByPrice[0];
  if (!best) {
    return null;
  }
  const averageOdds =
    uniqueBooks.length > 0
      ? Number(
          (
            uniqueBooks.reduce((total, entry) => total + entry.price, 0) / uniqueBooks.length
          ).toFixed(2)
        )
      : null;
  const averageProbability =
    typeof averageOdds === "number"
      ? americanToImpliedProbability(averageOdds)
      : americanToImpliedProbability(best.price);
  const bestProbability = americanToImpliedProbability(best.price);
  const priceDelta =
    typeof averageOdds === "number" ? Number((best.price - averageOdds).toFixed(2)) : 0;
  const registryEntry = getProviderRegistryEntry(leagueKey);
  const valueFlag =
    uniqueBooks.length > 1 && priceDelta >= 12
      ? "MARKET_PLUS"
      : uniqueBooks.length > 1
        ? "BEST_PRICE"
        : "NONE";

  const edgeScore = calculateEdgeScore({
    impliedProbability: bestProbability,
    modelProbability: Math.min(0.92, averageProbability + Math.max(0, (best.price - (averageOdds ?? best.price)) / 1000)),
    lineMovementSupport: Math.min(0.45, Math.max(0, priceDelta / 25)),
    volatility: uniqueBooks.length >= 3 ? 0.28 : 0.36
  });

  return {
    id: buildLivePropGroupKey(prop),
    gameId: prop.event_id,
    leagueKey,
    sportsbook: buildLiveSportsbookRecord(best.bookmaker_key, best.bookmaker_title),
    player,
    team,
    opponent,
    marketType: prop.market_key,
    side: prop.side,
    line: prop.line,
    oddsAmerican: best.price,
    recentHitRate: null,
    matchupRank: null,
    gameLabel: `${awayTeam.abbreviation} vs ${homeTeam.abbreviation}`,
    teamResolved,
    sportsbookCount: uniqueBooks.length,
    bestAvailableOddsAmerican: best.price,
    bestAvailableSportsbookName: best.bookmaker_title,
    averageOddsAmerican: averageOdds,
    marketDeltaAmerican: typeof averageOdds === "number" ? priceDelta : null,
    expectedValuePct: calculateMarketExpectedValuePct(best.price, averageOdds),
    lineMovement: null,
    valueFlag,
    supportStatus: registryEntry.propsStatus,
    supportNote: registryEntry.propsNote,
    gameHref: buildMatchupHref(leagueKey, prop.event_id),
    source: "live",
    edgeScore
  };
}

function buildLivePropCards(props: LiveProp[]) {
  const groups = props.reduce<Map<string, LiveProp[]>>((map, prop) => {
    const key = buildLivePropGroupKey(prop);
    map.set(key, [...(map.get(key) ?? []), prop]);
    return map;
  }, new Map());

  return Array.from(groups.values())
    .map((group) => buildLivePropCard(group))
    .filter(Boolean) as PropCardView[];
}

function getBestPrice(offer: LiveOffer | null) {
  return numericValue(offer?.best_price) ?? 0;
}

function getConsensusPoint(offer: LiveOffer | null) {
  return numericValue(offer?.consensus_point);
}

function aggregateBookOffer(
  game: LiveGame,
  marketType: "spread" | "moneyline" | "total"
): LiveOffer | null {
  const outcomes = game.bookmakers.flatMap((bookmaker) => {
    if (marketType === "total") {
      const over = findBookOutcome(bookmaker, "total", "over");
      return over
        ? [
            {
              bookmakerTitle: bookmaker.title,
              name: "Over",
              price: numericValue(over.price),
              point: numericValue(over.point)
            }
          ]
        : [];
    }

    return bookmaker.markets[marketType]
      .map((outcome) => ({
        bookmakerTitle: bookmaker.title,
        name: outcome.name,
        price: numericValue(outcome.price),
        point: numericValue(outcome.point)
      }))
      .filter((outcome) => outcome.price !== null || outcome.point !== null);
  });

  if (!outcomes.length) {
    return null;
  }

  const sortedByPrice = [...outcomes]
    .filter((outcome) => outcome.price !== null)
    .sort((left, right) => (right.price ?? -999) - (left.price ?? -999));
  const best = sortedByPrice[0] ?? outcomes[0];
  const points = outcomes.map((outcome) => outcome.point).filter((point): point is number => point !== null);
  const consensusPoint =
    points.length > 0
      ? Number((points.reduce((total, point) => total + point, 0) / points.length).toFixed(1))
      : null;
  const averagePrice =
    sortedByPrice.length > 0
      ? Number(
          (
            sortedByPrice.reduce((total, outcome) => total + (outcome.price ?? 0), 0) /
            sortedByPrice.length
          ).toFixed(1)
        )
      : null;

  return {
    name: best.name,
    best_price: best.price,
    best_bookmakers: Array.from(new Set(outcomes.map((outcome) => outcome.bookmakerTitle))),
    average_price: averagePrice,
    book_count: outcomes.length,
    consensus_point: consensusPoint,
    point_frequency: points.length
  };
}

function getLiveBestOffer(game: LiveGame, marketType: "spread" | "moneyline" | "total") {
  const offers = game.market_stats[marketType] ?? [];

  if (!offers.length) {
    return aggregateBookOffer(game, marketType);
  }

  if (marketType === "total") {
    return [...offers].sort((left, right) => {
      const leftBooks = left.book_count ?? 0;
      const rightBooks = right.book_count ?? 0;
      if (rightBooks !== leftBooks) {
        return rightBooks - leftBooks;
      }

      return getBestPrice(right) - getBestPrice(left);
    })[0];
  }

  if (marketType === "moneyline") {
    return [...offers].sort((left, right) => {
      const leftPrice = numericValue(left.average_price) ?? getBestPrice(left);
      const rightPrice = numericValue(right.average_price) ?? getBestPrice(right);
      if (rightPrice !== leftPrice) {
        return rightPrice - leftPrice;
      }

      return (right.book_count ?? 0) - (left.book_count ?? 0);
    })[0];
  }

  return [...offers].sort(
    (left, right) => {
      const pointDelta = (getConsensusPoint(right) ?? -999) - (getConsensusPoint(left) ?? -999);
      if (pointDelta !== 0) {
        return pointDelta;
      }

      return getBestPrice(right) - getBestPrice(left);
    }
  )[0];
}

function findBook(game: LiveGame, sportsbookKey: string) {
  return game.bookmakers.find((bookmaker) => bookmaker.key === sportsbookKey) ?? null;
}

function findBookOutcome(
  bookmaker: LiveBookmaker,
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

      const bookTokens = buildNameTokens(outcome.name);
      return (
        outcomeTokens.some((token) => bookTokens.includes(token)) ||
        bookTokens.some((token) => outcomeTokens.includes(token))
      );
    }) ?? null
  );
}

function getBookSpecificOffer(
  leagueKey: LeagueKey,
  game: LiveGame,
  marketType: "spread" | "moneyline" | "total",
  sportsbookKey: string
) {
  const bookmaker = findBook(game, sportsbookKey);
  if (!bookmaker) {
    return null;
  }

  if (marketType === "total") {
    const over = findBookOutcome(bookmaker, "total", "over");
    if (!over) {
      return null;
    }

    return {
      label: `O/U ${formatLine(over.point, false)}`,
      lineLabel: `O/U ${formatLine(over.point, false)}`,
      bestBook: bookmaker.title,
      bestOdds: numericValue(over.price) ?? 0,
      movement: 0
    } satisfies BoardMarketView;
  }

  if (marketType === "moneyline") {
    const outcomes = bookmaker.markets.moneyline.filter(
      (outcome) => typeof outcome.price === "number"
    );
    const primary = [...outcomes].sort(
      (left, right) => (right.price ?? -999) - (left.price ?? -999)
    )[0];
    if (!primary) {
      return null;
    }

    const team = getLiveTeamRecord(leagueKey, primary.name);

    return {
      label: `${team.abbreviation} ${formatAmericanOdds(primary.price ?? 0)}`,
      lineLabel: `${team.abbreviation} ${formatAmericanOdds(primary.price ?? 0)}`,
      bestBook: bookmaker.title,
      bestOdds: primary.price ?? 0,
      movement: 0
    } satisfies BoardMarketView;
  }

  const outcomes = bookmaker.markets.spread.filter(
    (outcome) => typeof outcome.point === "number"
  );
  const primary = [...outcomes].sort(
    (left, right) => (right.point ?? -999) - (left.point ?? -999)
  )[0];
  if (!primary) {
    return null;
  }

  const team = getLiveTeamRecord(leagueKey, primary.name);

  return {
    label: `${team.abbreviation} ${formatLine(primary.point)}`,
    lineLabel: `${team.abbreviation} ${formatLine(primary.point)}`,
    bestBook: bookmaker.title,
    bestOdds: numericValue(primary.price) ?? 0,
    movement: 0
  } satisfies BoardMarketView;
}

function buildBestMarketView(
  leagueKey: LeagueKey,
  game: LiveGame,
  marketType: "spread" | "moneyline" | "total"
) {
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
    return {
      label: `O/U ${formatLine(offer.consensus_point, false)}`,
      lineLabel: `O/U ${formatLine(offer.consensus_point, false)}`,
      bestBook: formatBookLabel(offer.best_bookmakers),
      bestOdds: getBestPrice(offer),
      movement: 0
    } satisfies BoardMarketView;
  }

  const team = getLiveTeamRecord(leagueKey, offer.name);
  const lineValue =
    marketType === "moneyline"
      ? formatAmericanOdds(getBestPrice(offer))
      : formatLine(offer.consensus_point);

  return {
    label: `${team.abbreviation} ${lineValue}`,
    lineLabel: `${team.abbreviation} ${lineValue}`,
    bestBook: formatBookLabel(offer.best_bookmakers),
    bestOdds: getBestPrice(offer),
    movement: 0
  } satisfies BoardMarketView;
}

function buildLiveMarketView(
  leagueKey: LeagueKey,
  game: LiveGame,
  marketType: "spread" | "moneyline" | "total",
  sportsbookKey: string
) {
  if (sportsbookKey === "best") {
    return buildBestMarketView(leagueKey, game, marketType);
  }

  return (
    getBookSpecificOffer(leagueKey, game, marketType, sportsbookKey) ??
    buildBestMarketView(leagueKey, game, marketType)
  );
}

function buildLiveEdgeScore(game: LiveGame) {
  const moneylineOffer = getLiveBestOffer(game, "moneyline");
  const consensusStrength = Math.min(0.18, game.bookmakers_available * 0.02);
  const volatility = Math.max(0.2, 1 - game.bookmakers_available / 8);

  return calculateEdgeScore({
    impliedProbability:
      getBestPrice(moneylineOffer) !== 0
        ? americanToImpliedProbability(getBestPrice(moneylineOffer))
        : null,
    recentHitRate: 0.5 + consensusStrength,
    lineMovementSupport: 0.35,
    volatility
  });
}

function buildLiveBookRow(
  leagueKey: LeagueKey,
  game: LiveGame,
  sportsbook: SportsbookRecord
) {
  const bookmaker = findBook(game, sportsbook.key);
  if (!bookmaker) {
    return {
      sportsbook,
      spread: "–",
      moneyline: "–",
      total: "–"
    } satisfies GameOddsRow;
  }

  const awayTeam = getLiveTeamRecord(leagueKey, game.away_team);
  const homeTeam = getLiveTeamRecord(leagueKey, game.home_team);
  const awaySpread = findBookOutcome(bookmaker, "spread", game.away_team);
  const homeSpread = findBookOutcome(bookmaker, "spread", game.home_team);
  const awayMoneyline = findBookOutcome(bookmaker, "moneyline", game.away_team);
  const homeMoneyline = findBookOutcome(bookmaker, "moneyline", game.home_team);
  const over = findBookOutcome(bookmaker, "total", "over");
  const under = findBookOutcome(bookmaker, "total", "under");

  return {
    sportsbook,
    spread:
      awaySpread || homeSpread
        ? `${awayTeam.abbreviation} ${formatLine(awaySpread?.point ?? null)} (${formatOddsOrDash(awaySpread?.price)}) | ${homeTeam.abbreviation} ${formatLine(homeSpread?.point ?? null)} (${formatOddsOrDash(homeSpread?.price)})`
        : "–",
    moneyline:
      awayMoneyline || homeMoneyline
        ? `${awayTeam.abbreviation} ${formatOddsOrDash(awayMoneyline?.price)} | ${homeTeam.abbreviation} ${formatOddsOrDash(homeMoneyline?.price)}`
        : "–",
    total:
      over || under
        ? `O ${formatLine(over?.point ?? null, false)} (${formatOddsOrDash(over?.price)}) | U ${formatLine(under?.point ?? null, false)} (${formatOddsOrDash(under?.price)})`
        : "–"
  } satisfies GameOddsRow;
}

function buildLiveSportsbooks(sports: LiveSport[]) {
  const books = new Map<string, SportsbookRecord>();

  for (const sport of sports) {
    for (const game of sport.games) {
      for (const bookmaker of game.bookmakers) {
        if (!books.has(bookmaker.key)) {
          books.set(
            bookmaker.key,
            buildLiveSportsbookRecord(bookmaker.key, bookmaker.title)
          );
        }
      }
    }
  }

  return [
    { id: "best", key: "best", name: "Best available", region: "US" } satisfies SportsbookRecord,
    ...Array.from(books.values())
  ];
}

function formatRangeValue(range: LiveRange | null, signed = true) {
  if (!range) {
    return "No range yet";
  }

  if (range.min === range.max) {
    return formatLine(range.min, signed);
  }

  return `${formatLine(range.min, signed)} to ${formatLine(range.max, signed)}`;
}

function buildLiveStatMap(stats: LiveStatEntry[], summary: LiveTeamFormSummary) {
  const values: Record<string, number | string> = {
    "Last 5": summary.games ? summary.record : "No sample yet",
    "Avg PF": summary.avg_points_for ?? "--",
    "Avg PA": summary.avg_points_against ?? "--",
    "Avg Margin": summary.avg_margin ?? "--"
  };

  for (const stat of stats.slice(0, 6)) {
    values[stat.label] = stat.display_value;
  }

  return values;
}

function buildLiveStatMapWithBoxscore(
  stats: LiveStatEntry[],
  summary: LiveTeamFormSummary,
  liveStats: Array<{ label: string; display_value: string }> = []
) {
  const values = buildLiveStatMap(stats, summary);

  for (const stat of liveStats.slice(0, 4)) {
    values[stat.label] = stat.display_value;
  }

  return values;
}

function buildSpotlightInsightLines(
  detail: LiveGameDetailResponse,
  awayTeam: string,
  homeTeam: string
) {
  const lines: string[] = [];
  const spotlightTeams = detail.player_spotlights?.teams ?? {};

  for (const teamName of [awayTeam, homeTeam]) {
    const spotlights = spotlightTeams[teamName] ?? [];
    if (!spotlights.length) {
      continue;
    }

    const top = spotlights[0];
    const prefix = top.category ? `${top.category}: ` : "";
    const athlete = top.athlete_name ?? "Live spotlight";
    const statLine = top.display_value ?? "Stat line pending";
    lines.push(`${teamName} spotlight: ${prefix}${athlete} ${statLine}`.trim());
  }

  if (!lines.length && detail.player_leaders?.message) {
    lines.push(detail.player_leaders.message);
  }

  return lines;
}

function buildLiveInsights(
  awayTeam: string,
  awaySummary: LiveTeamFormSummary,
  homeTeam: string,
  homeSummary: LiveTeamFormSummary,
  notes: string[],
  spotlightLines: string[] = []
) {
  const insights = [
    `${awayTeam} recent form: ${awaySummary.record} across ${awaySummary.games} games, averaging ${awaySummary.avg_points_for ?? "--"} points for and ${awaySummary.avg_points_against ?? "--"} against.`,
    `${homeTeam} recent form: ${homeSummary.record} across ${homeSummary.games} games, averaging ${homeSummary.avg_points_for ?? "--"} points for and ${homeSummary.avg_points_against ?? "--"} against.`
  ];

  return [...insights, ...spotlightLines, ...notes].slice(0, 5);
}

function getInternalApiBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  return "http://localhost:3000";
}

async function fetchInternalJson<T>(path: string) {
  if (process.env.npm_lifecycle_event === "build") {
    return null;
  }

  try {
    const response = await fetch(`${getInternalApiBaseUrl()}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function fetchBackendJson<T>(path: string) {
  try {
    const backendUrl =
      process.env.SHARKEDGE_BACKEND_URL?.trim() || "https://shark-odds-1.onrender.com";
    const response = await fetch(`${backendUrl}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function fetchLiveBoardResponse() {
  const response = await backendCurrentOddsProvider.fetchBoard();

  if (!response?.configured) {
    return null;
  }

  return response;
}

async function fetchEspnBoardResponse(
  league: "nba" | "ncaab",
  date: string
): Promise<EspnBoardResponse | null> {
  const query = new URLSearchParams({
    league
  });

  if (date !== "all") {
    query.set("date", date.replace(/-/g, ""));
  }

  return fetchInternalJson<EspnBoardResponse>(`/api/espn?${query.toString()}`);
}

async function fetchLivePropsBoardResponse(
  sportKey?: string,
  maxEvents = LIVE_PROPS_EVENT_LIMIT
): Promise<LivePropsBoardResponse | null> {
  const query = new URLSearchParams();
  if (sportKey) {
    query.set("sport_key", sportKey);
  }
  query.set("max_events", String(maxEvents));
  const suffix = `?${query.toString()}`;
  const response = await fetchBackendJson<LivePropsBoardResponse>(
    `/api/props/board${suffix}`
  );

  if (!response?.configured) {
    return null;
  }

  return response;
}

async function fetchLiveGameDetailResponse(
  sportKey: string,
  eventId: string
): Promise<LiveGameDetailResponse | null> {
  const detail = await fetchBackendJson<LiveGameDetailResponse>(
    `/api/games/${sportKey}/${eventId}`
  );

  if (!detail?.configured) {
    return null;
  }

  return detail;
}

async function getStoredLineMovement(eventExternalId: string) {
  try {
    const event = await prisma.event.findFirst({
      where: {
        OR: [
          {
            externalEventId: eventExternalId
          },
          {
            externalEventId: `oddsharvester_historical:${eventExternalId}`
          }
        ]
      },
      include: {
        markets: {
          where: {
            marketType: {
              in: ["spread", "total"]
            }
          },
          include: {
            snapshots: {
              orderBy: {
                capturedAt: "asc"
              },
              select: {
                capturedAt: true,
                line: true
              }
            }
          }
        }
      }
    });

    if (!event) {
      return [];
    }

    const representativeSpread =
      event.markets.find((market) => market.marketType === "spread" && market.side === "HOME") ??
      event.markets.find((market) => market.marketType === "spread") ??
      null;
    const representativeTotal =
      event.markets.find((market) => market.marketType === "total" && market.side === "OVER") ??
      event.markets.find((market) => market.marketType === "total") ??
      null;
    const buckets = new Map<
      string,
      { capturedAt: string; spreadLine: number | null; totalLine: number | null }
    >();

    for (const snapshot of representativeSpread?.snapshots ?? []) {
      const key = snapshot.capturedAt.toISOString();
      buckets.set(key, {
        ...(buckets.get(key) ?? { capturedAt: key, spreadLine: null, totalLine: null }),
        spreadLine: snapshot.line ?? null
      });
    }

    for (const snapshot of representativeTotal?.snapshots ?? []) {
      const key = snapshot.capturedAt.toISOString();
      buckets.set(key, {
        ...(buckets.get(key) ?? { capturedAt: key, spreadLine: null, totalLine: null }),
        totalLine: snapshot.line ?? null
      });
    }

    return Array.from(buckets.values())
      .filter((entry) => typeof entry.spreadLine === "number" || typeof entry.totalLine === "number")
      .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt))
      .slice(-12);
  } catch {
    return [];
  }
}

function mapEspnLeagueToLeagueKey(league: EspnBoardResponse["league"]): LeagueKey {
  return league === "nba" ? "NBA" : "NCAAB";
}

function mapEspnStatus(game: EspnBoardGame) {
  const state = game.status.state?.toLowerCase();

  if (state === "in") {
    return "LIVE" as const;
  }

  if (state === "post") {
    return "FINAL" as const;
  }

  if (state === "postponed" || state === "cancelled" || state === "delayed") {
    return "POSTPONED" as const;
  }

  return "PREGAME" as const;
}

function buildEspnSportsbooks(responses: EspnBoardResponse[]) {
  const books = new Map<string, SportsbookRecord>();

  for (const response of responses) {
    for (const game of response.games) {
      for (const bookmakerKey of game.odds?.bookmakers ?? []) {
        if (!bookmakerKey || books.has(bookmakerKey)) {
          continue;
        }

        const matchingSeedBook = mockDatabase.sportsbooks.find(
          (book) => book.key === bookmakerKey
        );

        books.set(
          bookmakerKey,
          buildLiveSportsbookRecord(
            bookmakerKey,
            matchingSeedBook?.name ?? bookmakerKey.replace(/_/g, " ")
          )
        );
      }
    }
  }

  return [
    { id: "best", key: "best", name: "Best available", region: "US" } satisfies SportsbookRecord,
    ...Array.from(books.values())
  ];
}

function buildEspnSpreadView(
  game: EspnBoardGame,
  homeTeam: TeamRecord
): BoardMarketView {
  const label =
    game.odds?.spread ??
    (typeof game.odds?.spreadPoint === "number"
      ? `${homeTeam.abbreviation} ${formatLine(game.odds.spreadPoint)}`
      : "No spread");

  return {
    label,
    lineLabel: label,
    bestBook: game.odds?.source === "the-odds-api" ? "Best market" : "ESPN consensus",
    bestOdds: game.odds?.homeMoneyline ?? game.odds?.awayMoneyline ?? -110,
    movement: 0
  } satisfies BoardMarketView;
}

function buildEspnMoneylineView(
  game: EspnBoardGame,
  awayTeam: TeamRecord,
  homeTeam: TeamRecord
): BoardMarketView {
  const homePrice = game.odds?.homeMoneyline;
  const awayPrice = game.odds?.awayMoneyline;

  const chosen =
    typeof homePrice === "number" && typeof awayPrice === "number"
      ? homePrice <= awayPrice
        ? { team: homeTeam, price: homePrice }
        : { team: awayTeam, price: awayPrice }
      : typeof homePrice === "number"
        ? { team: homeTeam, price: homePrice }
        : typeof awayPrice === "number"
          ? { team: awayTeam, price: awayPrice }
          : null;

  if (!chosen) {
    return {
      label: "No moneyline",
      lineLabel: "No moneyline",
      bestBook: "Unavailable",
      bestOdds: 0,
      movement: 0
    } satisfies BoardMarketView;
  }

  return {
    label: `${chosen.team.abbreviation} ${formatAmericanOdds(chosen.price)}`,
    lineLabel: `${chosen.team.abbreviation} ${formatAmericanOdds(chosen.price)}`,
    bestBook: game.odds?.source === "the-odds-api" ? "Best market" : "ESPN consensus",
    bestOdds: chosen.price,
    movement: 0
  } satisfies BoardMarketView;
}

function buildEspnTotalView(game: EspnBoardGame): BoardMarketView {
  if (typeof game.odds?.overUnder !== "number") {
    return {
      label: "No total",
      lineLabel: "No total",
      bestBook: "Unavailable",
      bestOdds: 0,
      movement: 0
    } satisfies BoardMarketView;
  }

  return {
    label: `O/U ${formatLine(game.odds.overUnder, false)}`,
    lineLabel: `O/U ${formatLine(game.odds.overUnder, false)}`,
    bestBook: game.odds?.source === "the-odds-api" ? "Best market" : "ESPN consensus",
    bestOdds: game.odds?.overPrice ?? -110,
    movement: 0
  } satisfies BoardMarketView;
}

function buildEspnEdgeScore(game: EspnBoardGame) {
  const prices = [game.odds?.homeMoneyline, game.odds?.awayMoneyline].filter(
    (price): price is number => typeof price === "number"
  );
  const anchorPrice = prices.length ? Math.min(...prices) : null;

  return calculateEdgeScore({
    impliedProbability:
      typeof anchorPrice === "number"
        ? americanToImpliedProbability(anchorPrice)
        : null,
    recentHitRate: game.odds?.source === "the-odds-api" ? 0.58 : 0.52,
    lineMovementSupport: game.odds?.source === "the-odds-api" ? 0.25 : 0.05,
    volatility: game.status.completed ? 0.8 : 0.38
  });
}

function getEspnBoardSourceNote(responses: EspnBoardResponse[]) {
  const usesOddsApi = responses.some((response) => response.oddsApiActive);
  if (usesOddsApi) {
    return "Homepage board is using the internal ESPN scoreboard route for schedule/status context with best-available prices layered on top for the selected basketball league.";
  }

  return "Homepage board is using the internal ESPN scoreboard route, with ESPN consensus odds standing in when the live pricing overlay is unavailable.";
}

async function getEspnBoardPageData(
  filters: BoardFilters
): Promise<BoardPageData | null> {
  const requestedLeagues =
    filters.league === "ALL"
      ? (["nba", "ncaab"] as const)
      : ([filters.league === "NBA" ? "nba" : "ncaab"] as const);

  const responses = (
    await Promise.all(
      requestedLeagues.map((league) => fetchEspnBoardResponse(league, filters.date))
    )
  ).filter(Boolean) as EspnBoardResponse[];

  if (!responses.length) {
    return null;
  }

  const liveSportsbooks = buildEspnSportsbooks(responses);
  const games = responses
    .flatMap((response) => response.games)
    .filter((game) => Boolean(game.odds && game.oddsEventId && game.home.name && game.away.name))
    .map((game) => {
      const leagueKey = mapEspnLeagueToLeagueKey(game.league);
      const status = mapEspnStatus(game);
      const awayTeam = getLiveTeamRecord(leagueKey, game.away.name ?? "Away");
      const homeTeam = getLiveTeamRecord(leagueKey, game.home.name ?? "Home");

      return {
        id: game.oddsEventId ?? game.id ?? "",
        leagueKey,
        awayTeam,
        homeTeam,
        startTime: game.date ?? new Date().toISOString(),
        status,
        venue: game.venue ?? game.broadcast ?? "ESPN scoreboard",
        selectedBook: null,
        bestBookCount: game.odds?.bookmakers.length ?? 0,
        spread: buildEspnSpreadView(game, homeTeam),
        moneyline: buildEspnMoneylineView(game, awayTeam, homeTeam),
        total: buildEspnTotalView(game),
        edgeScore: buildEspnEdgeScore(game),
        detailHref: buildMatchupHref(leagueKey, game.id ?? game.oddsEventId ?? "")
      } satisfies GameCardView;
    })
    .filter((game) => isGameInCurrentBoardWindow(game.leagueKey, game.startTime))
    .filter((game) => (filters.status === "live" ? game.status === "LIVE" : game.status === "PREGAME"))
    .sort((left, right) => left.startTime.localeCompare(right.startTime));

  if (!games.length) {
    return null;
  }

  const availableDates = Array.from(
    new Set(
      responses.flatMap((response) =>
        response.games
          .map((game) => game.date?.slice(0, 10))
          .filter(Boolean) as string[]
      )
    )
  ).sort();
  const gamesByLeague = games.reduce<Partial<Record<LeagueKey, GameCardView[]>>>((groups, game) => {
    groups[game.leagueKey] = [...(groups[game.leagueKey] ?? []), game];
    return groups;
  }, {});
  const sportSections = await buildBoardSportSections({
    selectedLeague: filters.league,
    gamesByLeague
  });

  const snapshots = await getLeagueSnapshots(filters.league);
  const livePropSports = sportSections.filter((section) => section.propsStatus === "LIVE").length;

  return {
    filters,
    availableDates,
    leagues: getBoardLeagueRecords(["NBA", "NCAAB"]),
    sportsbooks: liveSportsbooks,
    games,
    sportSections,
    snapshots,
    summary: {
      totalGames: countRenderedRows(sportSections),
      totalProps: livePropSports,
      totalSportsbooks: liveSportsbooks.length - 1
    },
    liveMessage:
      filters.status === "live"
        ? "Live tracking is still limited, but the homepage board now reads from the internal ESPN scoreboard route so status and schedule context stay current."
        : null,
    source: "live",
    sourceNote: getEspnBoardSourceNote(responses)
  };
}

async function getBackendBoardPageData(
  filters: BoardFilters
): Promise<BoardPageData> {
  const response = await fetchLiveBoardResponse();
  const supportedSports = (response?.sports ?? []).filter((sport) => {
    const leagueKey = getLeagueForSportKey(sport.key);
    return leagueKey && (filters.league === "ALL" || filters.league === leagueKey);
  });

  const liveSportsbooks = supportedSports.length
    ? buildLiveSportsbooks(supportedSports)
    : [
        { id: "best", key: "best", name: "Best available", region: "US" } satisfies SportsbookRecord,
        ...mockDatabase.sportsbooks
      ];

  const games = supportedSports
    .flatMap((sport) => {
      const leagueKey = getLeagueForSportKey(sport.key);
      if (!leagueKey) {
        return [];
      }

      return sport.games.map((game) => ({ sport, game, leagueKey }));
    })
    .filter(({ game }) => (filters.date === "all" ? true : game.commence_time.startsWith(filters.date)))
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
  const filteredGames = games.filter((game) =>
    isGameInCurrentBoardWindow(game.leagueKey, game.startTime)
  );

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
    new Set(
      sportSections.flatMap((section) =>
        section.scoreboard.map((event) => event.startTime.slice(0, 10))
      )
    )
  ).sort();
  const supportSummary = getBoardSupportSummary();

  const snapshots = await getLeagueSnapshots(filters.league);
  const livePropSports = sportSections.filter((section) => section.propsStatus === "LIVE").length;

  return {
    filters,
    availableDates: Array.from(new Set([...availableDates, ...sectionDates])).sort(),
    leagues: getBoardVisibleLeagues(filters.league),
    sportsbooks: liveSportsbooks,
    games: filteredGames,
    sportSections,
    snapshots,
    summary: {
      totalGames: countRenderedRows(sportSections),
      totalProps: livePropSports,
      totalSportsbooks: liveSportsbooks.length - 1
    },
    liveMessage:
      filters.status === "live"
        ? "Live state is rendering league by league now. Sports without full odds coverage stay visible with adapter-pending states instead of disappearing behind empty board counts."
        : null,
    source: "live",
    sourceNote: response
      ? `${getLiveSourceNote(response)} ${supportSummary.live} sports are live, ${supportSummary.partial} are partial, and ${supportSummary.comingSoon} are still coming soon.`
      : `Current odds are temporarily unavailable, but the support model is still rendering honestly: ${supportSummary.live} sports live, ${supportSummary.partial} partial, ${supportSummary.comingSoon} coming soon.`
  };
}

export async function getLiveBoardPageData(
  filters: BoardFilters
): Promise<BoardPageData | null> {
  return getBackendBoardPageData(filters);
}

export async function getLiveGameDetail(id: string): Promise<GameDetailView | null> {
  const board = await fetchLiveBoardResponse();
  if (!board) {
    return null;
  }

  const sport = board.sports.find(
    (entry) =>
      getLeagueForSportKey(entry.key) &&
      entry.games.some((game) => game.id === id)
  );
  if (!sport) {
    return null;
  }

  const detail = await fetchLiveGameDetailResponse(sport.key, id);
  if (!detail) {
    return null;
  }

  const leagueKey = getLeagueForSportKey(detail.sport.key);
  if (!leagueKey) {
    return null;
  }

  const league = getLeagueRecord(leagueKey);
  const awayTeam = getLiveTeamRecord(leagueKey, detail.game.away_team);
  const homeTeam = getLiveTeamRecord(leagueKey, detail.game.home_team);
  const sportsbooks = buildLiveSportsbooks([sport]).filter((book) => book.key !== "best");
  const awayContext = detail.team_form[detail.game.away_team];
  const homeContext = detail.team_form[detail.game.home_team];
  const liveProps = buildLivePropCards(detail.props ?? []);
  const propTrendSummaries = await getPropTrendSummaries(liveProps);
  const lineMovement = await getStoredLineMovement(detail.game.id);
  const spotlightLines = buildSpotlightInsightLines(
    detail,
    detail.game.away_team,
    detail.game.home_team
  );

  return {
    game: {
      id: detail.game.id,
      leagueId: league.id,
      externalEventId: detail.game.id,
      startTime: detail.game.commence_time,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      status: "PREGAME",
      venue: "Live market feed",
      scoreJson: null,
      liveStateJson: {
        source: "sharkedge-backend",
        providerContract: detail.provider_contract ?? null,
        playerSpotlights: detail.player_spotlights ?? null
      }
    },
    league,
    awayTeam,
    homeTeam,
    books: sportsbooks.map((sportsbook) => buildLiveBookRow(leagueKey, detail.game, sportsbook)),
    bestMarkets: {
      spread: buildBestMarketView(leagueKey, detail.game, "spread"),
      moneyline: buildBestMarketView(leagueKey, detail.game, "moneyline"),
      total: buildBestMarketView(leagueKey, detail.game, "total")
    },
    edgeScore: buildLiveEdgeScore(detail.game),
    consensus: `${buildBestMarketView(leagueKey, detail.game, "spread").label} | ${buildBestMarketView(leagueKey, detail.game, "total").label}`,
    insights: buildLiveInsights(
      detail.game.away_team,
      awayContext?.summary ?? {
        games: 0,
        record: "0-0",
        avg_points_for: null,
        avg_points_against: null,
        avg_margin: null,
        avg_total: null
      },
      detail.game.home_team,
      homeContext?.summary ?? {
        games: 0,
        record: "0-0",
        avg_points_for: null,
        avg_points_against: null,
        avg_margin: null,
        avg_total: null
      },
      detail.notes,
      spotlightLines
    ),
    injuries: [],
    props: liveProps.map((prop) => ({
      ...prop,
      trendSummary: propTrendSummaries[prop.id] ?? null
    })),
    matchup: {
      away: {
        team: awayTeam,
        stats: buildLiveStatMapWithBoxscore(
          detail.team_stats[detail.game.away_team] ?? [],
          awayContext?.summary ?? {
            games: 0,
            record: "0-0",
            avg_points_for: null,
            avg_points_against: null,
            avg_margin: null,
            avg_total: null
          },
          detail.team_live_stats?.[detail.game.away_team] ?? []
        )
      },
      home: {
        team: homeTeam,
        stats: buildLiveStatMapWithBoxscore(
          detail.team_stats[detail.game.home_team] ?? [],
          homeContext?.summary ?? {
            games: 0,
            record: "0-0",
            avg_points_for: null,
            avg_points_against: null,
            avg_margin: null,
            avg_total: null
          },
          detail.team_live_stats?.[detail.game.home_team] ?? []
        )
      }
    },
    lineMovement,
    marketRanges: [
      {
        label: `${awayTeam.abbreviation} spread range`,
        value: formatRangeValue(detail.line_analytics.spread_range[detail.game.away_team])
      },
      {
        label: `${homeTeam.abbreviation} spread range`,
        value: formatRangeValue(detail.line_analytics.spread_range[detail.game.home_team])
      },
      {
        label: "Over range",
        value: formatRangeValue(detail.line_analytics.total_range.over, false)
      },
      {
        label: "Under range",
        value: formatRangeValue(detail.line_analytics.total_range.under, false)
      },
      ...(detail.player_spotlights?.available
        ? [
            {
              label: "Live spotlights",
              value: detail.player_spotlights.source ?? "ESPN summary boxscore"
            }
          ]
        : [])
    ],
    propsNotice:
      detail.props?.length
        ? undefined
        : "No live player props are posted for this matchup yet. SharkEdge will fill this section as books publish markets.",
    source: "live"
  };
}

export async function getLivePropsExplorerData(filters: PropFilters) {
  const requestedSportKeys =
    filters.league === "ALL"
      ? (Object.values(LIVE_PROP_SPORT_KEYS).filter(Boolean) as string[])
      : LIVE_PROP_SPORT_KEYS[filters.league]
        ? [LIVE_PROP_SPORT_KEYS[filters.league] as string]
        : [];

  const responses = (
    await Promise.all(
      requestedSportKeys.map((sportKey) =>
        fetchLivePropsBoardResponse(sportKey, LIVE_PROPS_EVENT_LIMIT)
      )
    )
  ).filter(Boolean) as LivePropsBoardResponse[];

  const allProps = responses.flatMap((response) =>
    response.sports.flatMap((sport) => sport.props ?? [])
  );
  const mappedProps = buildLivePropCards(allProps);
  const propTrendSummaries = await getPropTrendSummaries(mappedProps);

  const filteredProps = mappedProps
    .map((prop) => ({
      ...prop,
      trendSummary: propTrendSummaries[prop.id] ?? null
    }))
    .filter((prop) =>
      filters.league === "ALL" ? true : prop.leagueKey === filters.league
    )
    .filter((prop) =>
      filters.marketType === "ALL" ? true : prop.marketType === filters.marketType
    )
    .filter((prop) => (filters.team === "all" ? true : prop.team.id === filters.team))
    .filter((prop) =>
      filters.player === "all" ? true : prop.player.id === filters.player
    )
    .filter((prop) =>
      filters.sportsbook === "all"
        ? true
        : prop.sportsbook.key === filters.sportsbook
    )
    .filter((prop) =>
      filters.valueFlag === "all" ? true : prop.valueFlag === filters.valueFlag
    )
    .sort((left, right) => {
      if (filters.sortBy === "league" && left.leagueKey !== right.leagueKey) {
        return left.leagueKey.localeCompare(right.leagueKey);
      }

      if (filters.sortBy === "start_time" && left.gameId !== right.gameId) {
        return left.gameId.localeCompare(right.gameId);
      }

      if (filters.sortBy === "line_movement") {
        return (Math.abs(right.lineMovement ?? -1) - Math.abs(left.lineMovement ?? -1));
      }

      if (filters.sortBy === "market_ev") {
        return (right.expectedValuePct ?? -999) - (left.expectedValuePct ?? -999);
      }

      if (filters.sortBy === "edge_score") {
        return right.edgeScore.score - left.edgeScore.score;
      }

      if (filters.sortBy === "best_price") {
        return (
          (right.bestAvailableOddsAmerican ?? right.oddsAmerican) -
          (left.bestAvailableOddsAmerican ?? left.oddsAmerican)
        );
      }

      if (left.player.name !== right.player.name) {
        return left.player.name.localeCompare(right.player.name);
      }

      return right.edgeScore.score - left.edgeScore.score;
    });

  const sportsbooks = Array.from(
    new Map(
      mappedProps.map((prop) => [prop.sportsbook.key, prop.sportsbook] as const)
    ).values()
  ).sort((left, right) => left.name.localeCompare(right.name));

  const teams = Array.from(
    new Map(
      mappedProps
        .filter((prop) => prop.teamResolved)
        .map((prop) => [prop.team.id, prop.team] as const)
    ).values()
  ).sort((left, right) => left.name.localeCompare(right.name));

  const players = Array.from(
    new Map(mappedProps.map((prop) => [prop.player.id, prop.player] as const)).values()
  ).sort((left, right) => left.name.localeCompare(right.name));

  const coverage = PROP_COVERAGE_ORDER.map((leagueKey) => {
    const registry = getProviderRegistryEntry(leagueKey);
    return {
      leagueKey,
      status: registry.propsStatus,
      providers: registry.propsProviders,
      supportedMarkets: registry.supportedPropMarkets,
      note: registry.propsNote
    };
  });

  const responseErrors = responses.flatMap((response) => response.errors ?? []);
  const quotaNotes = responses
    .map((response) => response.quota_note)
    .filter(Boolean)
    .join(" ");

  return {
    filters,
    props: filteredProps,
    coverage,
    leagues: mockDatabase.leagues,
    sportsbooks,
    teams,
    players,
    source: responses.length ? ("live" as const) : ("catalog" as const),
    sourceNote: responseErrors.length
      ? `Live props are partially connected, but the backend reported provider warnings: ${responseErrors.join(" | ")} ${quotaNotes}`.trim()
      : responses.length
        ? `${quotaNotes || "Live props are connected league-by-league to protect API quota."} Sports without a real props adapter stay visible as PARTIAL or COMING SOON instead of showing fake empty boards.`
        : "No live props adapter responded for the selected league set. SharkEdge is keeping unsupported sports visible and honest instead of backfilling fake prop rows."
  };
}

export async function getLivePropById(propId: string): Promise<PropCardView | null> {
  const responses = (
    await Promise.all(
      Object.values(LIVE_PROP_SPORT_KEYS)
        .filter(Boolean)
        .map((sportKey) =>
          fetchLivePropsBoardResponse(sportKey as string, LIVE_PROPS_EVENT_LIMIT)
        )
    )
  ).filter(Boolean) as LivePropsBoardResponse[];

  const props = buildLivePropCards(
    responses.flatMap((response) =>
      response.sports.flatMap((sport) => sport.props ?? [])
    )
  );
  const propTrendSummaries = await getPropTrendSummaries(props);

  return (
    props
      .map((prop) => ({
        ...prop,
        trendSummary: propTrendSummaries[prop.id] ?? null
      }))
      .find((prop) => prop.id === propId) ?? null
  );
}
