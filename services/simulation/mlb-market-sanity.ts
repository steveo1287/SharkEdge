import { getBoardFeed } from "@/services/market-data/market-data-service";
import { readLatestOddsApiSnapshot } from "@/services/odds/the-odds-api-budget-service";

export type MlbNoVigMarket = {
  available: boolean;
  source: string;
  awayTeam: string;
  homeTeam: string;
  awayOddsAmerican: number | null;
  homeOddsAmerican: number | null;
  awayNoVigProbability: number | null;
  homeNoVigProbability: number | null;
  hold: number | null;
};

type BoardEvent = {
  id: string;
  eventKey?: string | null;
  name?: string | null;
  participants?: Array<{ role?: string | null; competitor?: string | null }>;
  markets?: any[];
};

type OddsSnapshotEvent = {
  id?: string;
  sport_key?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: Array<{
    key?: string;
    title?: string;
    markets?: Array<{ key?: string; outcomes?: Array<{ name?: string; price?: number; point?: number | null }> }>;
  }>;
};

function normalizeTeam(value: string | null | undefined) {
  const normalized = String(value ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "").trim();
  const aliases: Record<string, string> = {
    athletics: "sacramentoathletics",
    oaklandathletics: "sacramentoathletics",
    whitesox: "chicagowhitesox",
    redsox: "bostonredsox",
    bluejays: "torontobluejays",
    dbacks: "arizonadiamondbacks",
    diamondbacks: "arizonadiamondbacks"
  };
  return aliases[normalized] ?? normalized;
}

function looseTeamMatch(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeTeam(left);
  const b = normalizeTeam(right);
  if (!a || !b) return false;
  return a === b || a.endsWith(b) || b.endsWith(a) || a.includes(b) || b.includes(a);
}

function gameKey(awayTeam: string, homeTeam: string) {
  return `${normalizeTeam(awayTeam)}@${normalizeTeam(homeTeam)}`;
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value !== 0 ? value : null;
}

function americanToImplied(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function noVig(homeOdds: number | null | undefined, awayOdds: number | null | undefined) {
  const home = americanToImplied(homeOdds);
  const away = americanToImplied(awayOdds);
  if (home == null || away == null) return null;
  const total = home + away;
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    homeNoVigProbability: Number((home / total).toFixed(4)),
    awayNoVigProbability: Number((away / total).toFixed(4)),
    hold: Number((total - 1).toFixed(4))
  };
}

function marketTypeOf(market: any) {
  return String(market?.marketType ?? market?.type ?? market?.key ?? "").toLowerCase();
}

function bestNumeric(values: unknown[]) {
  const numbers = values.map(numeric).filter((value): value is number => value !== null);
  if (!numbers.length) return null;
  return [...numbers].sort((left, right) => right - left)[0] ?? null;
}

function moneylineFor(markets: any[], side: "home" | "away") {
  const typed = (markets ?? []).filter((market) => marketTypeOf(market).includes("moneyline") || marketTypeOf(market) === "h2h");
  const explicit = bestNumeric(typed.flatMap((market) => side === "home"
    ? [market.bestHomeOddsAmerican, market.homeOddsAmerican, market.homeOdds, market.currentHomeOdds]
    : [market.bestAwayOddsAmerican, market.awayOddsAmerican, market.awayOdds, market.currentAwayOdds]
  ));
  if (explicit !== null) return explicit;

  return bestNumeric(typed
    .filter((market) => String(market.side ?? market.selectionSide ?? market.participantRole ?? "").toLowerCase().includes(side))
    .flatMap((market) => [market.currentOdds, market.oddsAmerican, market.bestOddsAmerican]));
}

function namesForBoardEvent(event: BoardEvent) {
  const away = event.participants?.find((participant) => String(participant.role ?? "").toUpperCase() === "AWAY")?.competitor;
  const home = event.participants?.find((participant) => String(participant.role ?? "").toUpperCase() === "HOME")?.competitor;
  if (away && home) return { away, home };
  const [fallbackAway, fallbackHome] = String(event.name ?? "").split(" @ ").map((part) => part.trim());
  return { away: away ?? fallbackAway ?? "", home: home ?? fallbackHome ?? "" };
}

async function fromBoardFeed(awayTeam: string, homeTeam: string): Promise<MlbNoVigMarket | null> {
  try {
    const board = await getBoardFeed("MLB", { skipCache: true }) as { events?: BoardEvent[] };
    for (const event of board.events ?? []) {
      const names = namesForBoardEvent(event);
      if (gameKey(names.away, names.home) !== gameKey(awayTeam, homeTeam)) continue;
      const homeOddsAmerican = moneylineFor(event.markets ?? [], "home");
      const awayOddsAmerican = moneylineFor(event.markets ?? [], "away");
      const priced = noVig(homeOddsAmerican, awayOddsAmerican);
      if (!priced) continue;
      return { available: true, source: "board-markets", awayTeam, homeTeam, awayOddsAmerican, homeOddsAmerican, ...priced };
    }
  } catch {
    return null;
  }
  return null;
}

async function fromOddsSnapshot(awayTeam: string, homeTeam: string): Promise<MlbNoVigMarket | null> {
  try {
    const snapshot = await readLatestOddsApiSnapshot();
    const events = ((snapshot?.events ?? []) as OddsSnapshotEvent[]).filter((event) => event.sport_key === "baseball_mlb");
    for (const event of events) {
      if (!looseTeamMatch(event.away_team, awayTeam) || !looseTeamMatch(event.home_team, homeTeam)) continue;
      for (const bookmaker of event.bookmakers ?? []) {
        const h2h = bookmaker.markets?.find((market) => market.key === "h2h")?.outcomes ?? [];
        const homeOddsAmerican = h2h.find((outcome) => looseTeamMatch(outcome.name, homeTeam))?.price ?? null;
        const awayOddsAmerican = h2h.find((outcome) => looseTeamMatch(outcome.name, awayTeam))?.price ?? null;
        const priced = noVig(homeOddsAmerican, awayOddsAmerican);
        if (!priced) continue;
        return { available: true, source: bookmaker.title || bookmaker.key || "odds-api-snapshot", awayTeam, homeTeam, awayOddsAmerican, homeOddsAmerican, ...priced };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function getMlbNoVigMarket(awayTeam: string, homeTeam: string): Promise<MlbNoVigMarket> {
  const board = await fromBoardFeed(awayTeam, homeTeam);
  if (board) return board;
  const snapshot = await fromOddsSnapshot(awayTeam, homeTeam);
  if (snapshot) return snapshot;
  return {
    available: false,
    source: "missing",
    awayTeam,
    homeTeam,
    awayOddsAmerican: null,
    homeOddsAmerican: null,
    awayNoVigProbability: null,
    homeNoVigProbability: null,
    hold: null
  };
}
