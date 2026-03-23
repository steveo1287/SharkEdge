export type MarketOutcome = {
  name: string;
  price: number | null;
  point: number | null;
};

export type MarketOffer = {
  name: string;
  best_price: number | null;
  best_bookmakers: string[];
  average_price: number | null;
  book_count: number;
  consensus_point: number | null;
  point_frequency: number;
};

export type Bookmaker = {
  key: string;
  title: string;
  last_update: string | null;
  markets: {
    moneyline: MarketOutcome[];
    spread: MarketOutcome[];
    total: MarketOutcome[];
  };
};

export type GameCard = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers_available: number;
  bookmakers: Bookmaker[];
  market_stats: {
    moneyline: MarketOffer[];
    spread: MarketOffer[];
    total: MarketOffer[];
  };
};

export type SportBoard = {
  key: string;
  title: string;
  short_title: string;
  game_count: number;
  games: GameCard[];
  error?: string;
};

export type OddsBoardResponse = {
  configured: boolean;
  generated_at: string;
  regions?: string;
  bookmakers?: string;
  message?: string;
  sport_count?: number;
  game_count?: number;
  bookmaker_count?: number;
  split_stats_supported?: boolean;
  split_stats_note?: string;
  errors?: string[];
  sports: SportBoard[];
};

export type PointRange = {
  min: number;
  max: number;
  span: number;
};

export type RecentResult = {
  id: string;
  commence_time: string;
  opponent: string;
  location: string;
  result: "W" | "L" | "T";
  team_score: number;
  opponent_score: number;
  margin: number;
  game_total: number;
};

export type TeamSummary = {
  games: number;
  record: string;
  avg_points_for: number | null;
  avg_points_against: number | null;
  avg_margin: number | null;
  avg_total: number | null;
};

export type TeamForm = {
  recent_results: RecentResult[];
  summary: TeamSummary;
};

export type GameDetailResponse = {
  configured: boolean;
  generated_at: string;
  sport: {
    key: string;
    title: string;
    short_title: string;
  };
  game: GameCard;
  line_analytics: {
    spread_range: Record<string, PointRange | null>;
    total_range: {
      over: PointRange | null;
      under: PointRange | null;
    };
  };
  team_form: Record<string, TeamForm>;
  verified_user_stats: {
    available: boolean;
    message: string;
    features: string[];
  };
  notes: string[];
};

export const BASE_URL = "https://shark-odds-1.onrender.com";

export async function getOddsBoard(): Promise<OddsBoardResponse> {
  const response = await fetch(`${BASE_URL}/api/odds/board`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to load the multi-sport odds board.");
  }

  return response.json();
}

export async function getGameDetails(
  sportKey: string,
  gameId: string
): Promise<GameDetailResponse> {
  const response = await fetch(`${BASE_URL}/api/games/${sportKey}/${gameId}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to load game analytics.");
  }

  return response.json();
}

export function formatAmericanOdds(price: number | null) {
  if (price === null || price === undefined) {
    return "--";
  }

  const rounded = Math.round(price);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export function formatPoint(point: number | null) {
  if (point === null || point === undefined) {
    return "--";
  }

  return point > 0 ? `+${point}` : `${point}`;
}

export function formatTimeInZone(
  value: string,
  timeZone: string,
  suffix: string
) {
  return `${new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone
  }).format(new Date(value))} ${suffix}`;
}

export function formatCommenceTime(value: string) {
  try {
    const dateLabel = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "America/New_York"
    }).format(new Date(value));

    return `${dateLabel} | ${formatTimeInZone(
      value,
      "America/New_York",
      "ET"
    )} | ${formatTimeInZone(value, "America/Chicago", "CT")} | ${formatTimeInZone(
      value,
      "America/Denver",
      "MT"
    )} | ${formatTimeInZone(value, "America/Los_Angeles", "PT")}`;
  } catch {
    return value;
  }
}

export function formatBoardUpdatedTime(value: string) {
  try {
    return `${new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Chicago"
    }).format(new Date(value))} CT`;
  } catch {
    return value;
  }
}

export function summarizeBookmakers(bookmakers: string[]) {
  if (!bookmakers.length) {
    return "No book";
  }

  if (bookmakers.length <= 2) {
    return bookmakers.join(", ");
  }

  return `${bookmakers.slice(0, 2).join(", ")} +${bookmakers.length - 2} more`;
}

export function findOutcome(outcomes: MarketOutcome[], name: string) {
  return outcomes.find((outcome) => outcome.name === name);
}

export function formatBookmakerMarket(
  outcomes: MarketOutcome[],
  type: "moneyline" | "spread" | "total",
  homeTeam: string,
  awayTeam: string
) {
  if (!outcomes.length) {
    return "No line";
  }

  if (type === "moneyline") {
    const away = findOutcome(outcomes, awayTeam);
    const home = findOutcome(outcomes, homeTeam);
    return `${awayTeam} ${formatAmericanOdds(
      away?.price ?? null
    )} | ${homeTeam} ${formatAmericanOdds(home?.price ?? null)}`;
  }

  if (type === "spread") {
    const away = findOutcome(outcomes, awayTeam);
    const home = findOutcome(outcomes, homeTeam);
    return `${awayTeam} ${formatPoint(away?.point ?? null)} (${formatAmericanOdds(
      away?.price ?? null
    )}) | ${homeTeam} ${formatPoint(home?.point ?? null)} (${formatAmericanOdds(
      home?.price ?? null
    )})`;
  }

  const over = findOutcome(outcomes, "Over");
  const under = findOutcome(outcomes, "Under");
  return `Over ${formatPoint(over?.point ?? null)} (${formatAmericanOdds(
    over?.price ?? null
  )}) | Under ${formatPoint(under?.point ?? null)} (${formatAmericanOdds(
    under?.price ?? null
  )})`;
}

export function getBestOfferText(
  offers: MarketOffer[],
  fallbackLabel: string
) {
  const best = offers[0];
  if (!best) {
    return fallbackLabel;
  }

  return `${best.name} ${formatAmericanOdds(best.best_price)}`;
}

function formatPlainNumber(value: number) {
  return Number.isInteger(value) ? `${value}` : `${value}`;
}

export function formatRange(range: PointRange | null, signed = true) {
  if (!range) {
    return "No range";
  }

  if (range.min === range.max) {
    return signed ? formatPoint(range.min) : formatPlainNumber(range.min);
  }

  return signed
    ? `${formatPoint(range.min)} to ${formatPoint(range.max)}`
    : `${formatPlainNumber(range.min)} to ${formatPlainNumber(range.max)}`;
}
