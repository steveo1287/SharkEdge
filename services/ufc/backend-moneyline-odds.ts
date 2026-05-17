import { getCurrentOddsBackendBaseUrl, hasCurrentOddsBackendBaseUrl } from "@/services/current-odds/backend-url";
import { ingestUfcMarketOdds, type UfcMarketOddsIngestionResult, type UfcMarketOddsItem } from "@/services/ufc/market-odds-ingestion";

type BackendMoneylineOffer = {
  name?: string | null;
  best_price?: number | null;
  best_bookmakers?: string[];
  average_price?: number | null;
  book_count?: number;
};

type BackendBookOutcome = {
  name?: string | null;
  price?: number | null;
  point?: number | null;
};

type BackendBookmaker = {
  key?: string | null;
  title?: string | null;
  last_update?: string | null;
  markets?: {
    moneyline?: BackendBookOutcome[];
  };
};

type BackendGame = {
  id?: string | null;
  commence_time?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  bookmakers?: BackendBookmaker[];
  market_stats?: {
    moneyline?: BackendMoneylineOffer[];
  };
};

type BackendSport = {
  key?: string | null;
  title?: string | null;
  short_title?: string | null;
  game_count?: number;
  games?: BackendGame[];
};

type BackendBoard = {
  configured?: boolean;
  generated_at?: string;
  provider?: string | null;
  provider_mode?: string | null;
  message?: string | null;
  errors?: string[];
  sports?: BackendSport[];
  provider_resolution?: unknown;
};

export type BackendUfcMoneylineOddsResult = UfcMarketOddsIngestionResult & {
  fetched: boolean;
  endpoint: string | null;
  backendProvider: string | null;
  backendProviderMode: string | null;
  backendMessage: string | null;
  providerResolution: unknown;
};

function emptyResult(args: { ok: boolean; error: string; dryRun?: boolean; endpoint?: string | null }): BackendUfcMoneylineOddsResult {
  return {
    ok: args.ok,
    mode: args.dryRun ? "dry-run" : "write",
    source: "backend-ufc-moneyline",
    inputItems: 0,
    candidateFights: 0,
    matched: 0,
    updated: 0,
    unmatchedItems: [],
    matches: [],
    errors: [args.error],
    fetched: false,
    endpoint: args.endpoint ?? null,
    backendProvider: null,
    backendProviderMode: null,
    backendMessage: null,
    providerResolution: null
  };
}

function normalizeName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameScore(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  const common = [...aTokens].filter((token) => bTokens.has(token)).length;
  return common / Math.max(aTokens.size, bTokens.size, 1);
}

function validAmerican(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value !== 0 && Math.abs(value) >= 100 && Math.abs(value) <= 5000;
}

function pickOfferFor(moneyline: BackendMoneylineOffer[], name: string | null | undefined) {
  const scored = moneyline
    .map((offer) => ({ offer, score: nameScore(offer.name, name) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 0.78) return null;
  const price = Math.round(best.offer.average_price ?? best.offer.best_price ?? 0);
  if (!validAmerican(price)) return null;
  return { price, score: best.score, bookmakers: best.offer.best_bookmakers ?? [], bookCount: best.offer.book_count ?? 0 };
}

function pickBookmakerOutcome(game: BackendGame, name: string | null | undefined) {
  const bookmakers = Array.isArray(game.bookmakers) ? game.bookmakers : [];
  for (const bookmaker of bookmakers) {
    const outcomes = bookmaker.markets?.moneyline ?? [];
    const scored = outcomes
      .map((outcome) => ({ outcome, score: nameScore(outcome.name, name) }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || best.score < 0.78 || !validAmerican(best.outcome.price)) continue;
    return { price: best.outcome.price, bookmaker: bookmaker.title ?? bookmaker.key ?? null, lastUpdate: bookmaker.last_update ?? null };
  }
  return null;
}

function boardGameToOddsItem(game: BackendGame, provider: string | null): UfcMarketOddsItem | null {
  const fighterA = game.away_team;
  const fighterB = game.home_team;
  if (!fighterA || !fighterB) return null;

  const moneyline = game.market_stats?.moneyline ?? [];
  const consensusA = pickOfferFor(moneyline, fighterA);
  const consensusB = pickOfferFor(moneyline, fighterB);
  const bookmakerA = consensusA ? null : pickBookmakerOutcome(game, fighterA);
  const bookmakerB = consensusB ? null : pickBookmakerOutcome(game, fighterB);
  const oddsA = consensusA?.price ?? bookmakerA?.price ?? null;
  const oddsB = consensusB?.price ?? bookmakerB?.price ?? null;
  if (!validAmerican(oddsA) || !validAmerican(oddsB)) return null;

  const consensusBooks = Array.from(new Set([...(consensusA?.bookmakers ?? []), ...(consensusB?.bookmakers ?? [])])).filter(Boolean);
  return {
    fighterA,
    fighterB,
    oddsA,
    oddsB,
    bookmaker: consensusBooks.length ? `Consensus: ${consensusBooks.slice(0, 3).join(", ")}` : bookmakerA?.bookmaker ?? bookmakerB?.bookmaker ?? provider ?? "SharkEdge odds backend",
    marketKey: "h2h",
    source: "backend-current-odds-mma-ufc",
    eventDate: game.commence_time ?? null,
    fetchedAt: new Date().toISOString(),
    raw: {
      id: game.id ?? null,
      provider,
      consensus: Boolean(consensusA && consensusB),
      moneyline,
      bookmakerCount: game.bookmakers?.length ?? 0
    }
  };
}

function extractUfcSport(board: BackendBoard) {
  const sports = Array.isArray(board.sports) ? board.sports : [];
  return sports.find((sport) => sport.key === "mma_ufc")
    ?? sports.find((sport) => normalizeName(sport.short_title) === "ufc")
    ?? sports.find((sport) => normalizeName(sport.title).includes("ufc"))
    ?? null;
}

async function fetchBackendBoard(endpoint: string, timeoutMs: number): Promise<BackendBoard | null> {
  const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) return null;
  return await response.json() as BackendBoard;
}

export async function fetchAndIngestBackendUfcMoneylineOdds(options: { dryRun?: boolean; horizonDays?: number; minMatchScore?: number; timeoutMs?: number } = {}): Promise<BackendUfcMoneylineOddsResult> {
  if (!hasCurrentOddsBackendBaseUrl()) {
    return emptyResult({ ok: false, error: "SHARKEDGE_BACKEND_URL is not configured for backend UFC moneyline odds.", dryRun: options.dryRun });
  }

  const baseUrl = getCurrentOddsBackendBaseUrl();
  const timeoutMs = Math.max(1500, Math.min(15000, options.timeoutMs ?? 8000));
  const endpoints = [
    `${baseUrl}/api/odds/board?sport_key=mma_ufc`,
    `${baseUrl}/api/odds/board?league=ufc`
  ];

  let board: BackendBoard | null = null;
  let endpoint: string | null = null;
  for (const candidate of endpoints) {
    board = await fetchBackendBoard(candidate, timeoutMs).catch(() => null);
    const sport = board ? extractUfcSport(board) : null;
    if (sport && Array.isArray(sport.games) && sport.games.length > 0) {
      endpoint = candidate;
      break;
    }
    if (board && !endpoint) endpoint = candidate;
  }

  if (!board) {
    return emptyResult({ ok: false, error: "Backend odds board did not return a usable response for mma_ufc.", dryRun: options.dryRun, endpoint });
  }

  const sport = extractUfcSport(board);
  const games = Array.isArray(sport?.games) ? sport.games : [];
  const items = games.map((game) => boardGameToOddsItem(game, board.provider ?? null)).filter((item): item is UfcMarketOddsItem => Boolean(item));
  const ingestion = await ingestUfcMarketOdds(items, {
    dryRun: options.dryRun,
    horizonDays: options.horizonDays,
    minMatchScore: options.minMatchScore,
    source: "backend-current-odds-mma-ufc"
  });

  return {
    ...ingestion,
    fetched: true,
    endpoint,
    backendProvider: board.provider ?? null,
    backendProviderMode: board.provider_mode ?? null,
    backendMessage: board.message ?? null,
    providerResolution: board.provider_resolution ?? null
  };
}
