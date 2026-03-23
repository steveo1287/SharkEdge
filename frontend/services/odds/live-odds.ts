import { calculateEdgeScore } from "@/lib/utils/edge-score";
import { americanToImpliedProbability } from "@/lib/utils/odds";
import { formatAmericanOdds, formatLine } from "@/lib/formatters/odds";
import type {
  BoardFilters,
  BoardMarketView,
  BoardPageData,
  GameCardView,
  GameDetailView,
  GameOddsRow,
  LeagueKey,
  LeagueRecord,
  SportsbookRecord,
  TeamRecord
} from "@/lib/types/domain";
import { mockDatabase } from "@/prisma/seed-data";
import { getLeagueSnapshots } from "@/services/stats/stats-service";

const LIVE_BACKEND_URL =
  process.env.SHARKEDGE_BACKEND_URL?.trim() || "https://shark-odds-1.onrender.com";

const LIVE_SPORT_TO_LEAGUE: Record<string, LeagueKey | null> = {
  basketball_nba: "NBA",
  basketball_ncaab: "NCAAB",
  baseball_mlb: null,
  icehockey_nhl: null
};

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

type LiveGame = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers_available: number;
  bookmakers: LiveBookmaker[];
  market_stats: LiveMarketStatMap;
};

type LiveSport = {
  key: string;
  title: string;
  short_title: string;
  game_count: number;
  games: LiveGame[];
};

type LiveBoardResponse = {
  configured: boolean;
  generated_at: string;
  bookmakers: string;
  errors: string[];
  sports: LiveSport[];
};

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
  player_leaders: {
    available: boolean;
    message: string;
  };
  verified_user_stats: {
    available: boolean;
    message: string;
  };
  notes: string[];
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getLeagueForSportKey(sportKey: string): LeagueKey | null {
  return LIVE_SPORT_TO_LEAGUE[sportKey] ?? null;
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
  if (response.errors.length) {
    return "Live backend connected, with partial sportsbook fetch warnings still reported by the API.";
  }

  return "Live odds are flowing for the full NBA and NCAA men's basketball board. Props, tracker, and performance remain mock-first until their real feeds land.";
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

function getBestPrice(offer: LiveOffer | null) {
  return numericValue(offer?.best_price) ?? 0;
}

function getConsensusPoint(offer: LiveOffer | null) {
  return numericValue(offer?.consensus_point);
}

function getLiveBestOffer(game: LiveGame, marketType: "spread" | "moneyline" | "total") {
  const offers = game.market_stats[marketType] ?? [];

  if (!offers.length) {
    return null;
  }

  if (marketType === "total") {
    return (
      offers.find((offer) => offer.name.toLowerCase() === "over") ?? offers[0]
    );
  }

  if (marketType === "moneyline") {
    return [...offers].sort((left, right) => {
      const leftPrice = numericValue(left.average_price) ?? getBestPrice(left);
      const rightPrice = numericValue(right.average_price) ?? getBestPrice(right);
      return leftPrice - rightPrice;
    })[0];
  }

  return [...offers].sort(
    (left, right) => (getConsensusPoint(left) ?? 999) - (getConsensusPoint(right) ?? 999)
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
  return (
    bookmaker.markets[marketType].find(
      (outcome) => outcome.name.toLowerCase() === outcomeName.toLowerCase()
    ) ?? null
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
      (left, right) => (left.price ?? 999) - (right.price ?? 999)
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
    (left, right) => (left.point ?? 999) - (right.point ?? 999)
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
      spread: "No spread market",
      moneyline: "No moneyline market",
      total: "No total market"
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
    spread: `${awayTeam.abbreviation} ${formatLine(awaySpread?.point ?? null)} (${typeof awaySpread?.price === "number" ? formatAmericanOdds(awaySpread.price) : "--"}) | ${homeTeam.abbreviation} ${formatLine(homeSpread?.point ?? null)} (${typeof homeSpread?.price === "number" ? formatAmericanOdds(homeSpread.price) : "--"})`,
    moneyline: `${awayTeam.abbreviation} ${typeof awayMoneyline?.price === "number" ? formatAmericanOdds(awayMoneyline.price) : "--"} | ${homeTeam.abbreviation} ${typeof homeMoneyline?.price === "number" ? formatAmericanOdds(homeMoneyline.price) : "--"}`,
    total: `O ${formatLine(over?.point ?? null, false)} (${typeof over?.price === "number" ? formatAmericanOdds(over.price) : "--"}) | U ${formatLine(under?.point ?? null, false)} (${typeof under?.price === "number" ? formatAmericanOdds(under.price) : "--"})`
  } satisfies GameOddsRow;
}

function buildLiveSportsbooks(sports: LiveSport[]) {
  const books = new Map<string, SportsbookRecord>();

  for (const sport of sports) {
    for (const game of sport.games) {
      for (const bookmaker of game.bookmakers) {
        if (!books.has(bookmaker.key)) {
          books.set(bookmaker.key, {
            id: `live_${bookmaker.key}`,
            key: bookmaker.key,
            name: bookmaker.title,
            region: "US"
          });
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

function buildLiveInsights(
  awayTeam: string,
  awaySummary: LiveTeamFormSummary,
  homeTeam: string,
  homeSummary: LiveTeamFormSummary,
  notes: string[]
) {
  const insights = [
    `${awayTeam} recent form: ${awaySummary.record} across ${awaySummary.games} games, averaging ${awaySummary.avg_points_for ?? "--"} points for and ${awaySummary.avg_points_against ?? "--"} against.`,
    `${homeTeam} recent form: ${homeSummary.record} across ${homeSummary.games} games, averaging ${homeSummary.avg_points_for ?? "--"} points for and ${homeSummary.avg_points_against ?? "--"} against.`
  ];

  return [...insights, ...notes].slice(0, 4);
}

async function fetchBackendJson<T>(path: string) {
  try {
    const response = await fetch(`${LIVE_BACKEND_URL}${path}`, {
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
  const response = await fetchBackendJson<LiveBoardResponse>("/api/odds/board");

  if (!response?.configured) {
    return null;
  }

  return response;
}

export async function getLiveBoardPageData(
  filters: BoardFilters
): Promise<BoardPageData | null> {
  const response = await fetchLiveBoardResponse();
  if (!response) {
    return null;
  }

  const supportedSports = response.sports.filter((sport) => {
    const leagueKey = getLeagueForSportKey(sport.key);
    return leagueKey && (filters.league === "ALL" || filters.league === leagueKey);
  });

  const liveSportsbooks = buildLiveSportsbooks(supportedSports);

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
        edgeScore: buildLiveEdgeScore(game)
      } satisfies GameCardView;
    });

  const availableDates = Array.from(
    new Set(
      supportedSports.flatMap((sport) =>
        sport.games.map((game) => game.commence_time.slice(0, 10))
      )
    )
  ).sort();

  return {
    filters,
    availableDates,
    leagues: mockDatabase.leagues,
    sportsbooks: liveSportsbooks,
    games,
    snapshots: getLeagueSnapshots(filters.league),
    summary: {
      totalGames: games.length,
      totalProps: mockDatabase.propAngles.length,
      totalSportsbooks: liveSportsbooks.length - 1
    },
    liveMessage:
      filters.status === "live"
        ? "Live tracking is next. The current board is pulling fresh pregame prices from the live backend so you can monitor movement before kickoff."
        : null,
    source: "live",
    sourceNote: getLiveSourceNote(response)
  };
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

  const detail = await fetchBackendJson<LiveGameDetailResponse>(
    `/api/games/${sport.key}/${id}`
  );
  if (!detail?.configured) {
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
        source: "shark-odds-backend"
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
      detail.notes
    ),
    injuries: [],
    props: [],
    matchup: {
      away: {
        team: awayTeam,
        stats: buildLiveStatMap(detail.team_stats[detail.game.away_team] ?? [], awayContext?.summary ?? {
          games: 0,
          record: "0-0",
          avg_points_for: null,
          avg_points_against: null,
          avg_margin: null,
          avg_total: null
        })
      },
      home: {
        team: homeTeam,
        stats: buildLiveStatMap(detail.team_stats[detail.game.home_team] ?? [], homeContext?.summary ?? {
          games: 0,
          record: "0-0",
          avg_points_for: null,
          avg_points_against: null,
          avg_margin: null,
          avg_total: null
        })
      }
    },
    lineMovement: [],
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
      }
    ],
    propsNotice:
      "Live player props are not wired into SharkEdge yet. The live board and matchup context are now real-time; the props layer is still mock-first until a dedicated props feed lands.",
    source: "live"
  };
}
