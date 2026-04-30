import { getBoardFeed } from "@/services/market-data/market-data-service";
import { readLatestOddsApiSnapshot } from "@/services/odds/the-odds-api-budget-service";

export type NbaNoVigMarket = {
  available: boolean;
  source: string;
  awayTeam: string;
  homeTeam: string;
  awayOddsAmerican: number | null;
  homeOddsAmerican: number | null;
  awayNoVigProbability: number | null;
  homeNoVigProbability: number | null;
  hold: number | null;
  spreadLine: number | null;
  awaySpreadOddsAmerican: number | null;
  homeSpreadOddsAmerican: number | null;
  totalLine: number | null;
  overOddsAmerican: number | null;
  underOddsAmerican: number | null;
  overNoVigProbability: number | null;
  underNoVigProbability: number | null;
  totalHold: number | null;
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
    sixers: "philadelphia76ers",
    seventysixers: "philadelphia76ers",
    blazers: "portlandtrailblazers",
    trailblazers: "portlandtrailblazers",
    clips: "lacippers",
    clippers: "losangelesclippers",
    la clippers: "losangelesclippers"
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

function noVigTotal(overOdds: number | null | undefined, underOdds: number | null | undefined) {
  const over = americanToImplied(overOdds);
  const under = americanToImplied(underOdds);
  if (over == null || under == null) return null;
  const total = over + under;
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    overNoVigProbability: Number((over / total).toFixed(4)),
    underNoVigProbability: Number((under / total).toFixed(4)),
    totalHold: Number((total - 1).toFixed(4))
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

function totalLineFor(markets: any[]) {
  const typed = (markets ?? []).filter((market) => marketTypeOf(market).includes("total"));
  return bestNumeric(typed.flatMap((market) => [market.consensusLineValue, market.currentLine, market.line, market.point]));
}

function totalOddsFor(markets: any[], side: "over" | "under") {
  const typed = (markets ?? []).filter((market) => marketTypeOf(market).includes("total"));
  const explicit = bestNumeric(typed.flatMap((market) => side === "over"
    ? [market.bestOverOddsAmerican, market.overOddsAmerican, market.overOdds, market.currentOverOdds]
    : [market.bestUnderOddsAmerican, market.underOddsAmerican, market.underOdds, market.currentUnderOdds]
  ));
  if (explicit !== null) return explicit;
  return bestNumeric(typed
    .filter((market) => String(market.side ?? market.selection ?? "").toLowerCase().includes(side))
    .flatMap((market) => [market.currentOdds, market.oddsAmerican, market.bestOddsAmerican]));
}

function spreadLineFor(markets: any[]) {
  const typed = (markets ?? []).filter((market) => marketTypeOf(market).includes("spread") || marketTypeOf(market).includes("handicap"));
  return bestNumeric(typed.flatMap((market) => [market.homeSpread, market.currentHomeSpread, market.consensusLineValue, market.currentLine, market.line, market.point]));
}

function spreadOddsFor(markets: any[], side: "home" | "away") {
  const typed = (markets ?? []).filter((market) => marketTypeOf(market).includes("spread") || marketTypeOf(market).includes("handicap"));
  const explicit = bestNumeric(typed.flatMap((market) => side === "home"
    ? [market.bestHomeOddsAmerican, market.homeOddsAmerican, market.homeSpreadOdds, market.currentHomeOdds]
    : [market.bestAwayOddsAmerican, market.awayOddsAmerican, market.awaySpreadOdds, market.currentAwayOdds]
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

function emptyMarket(awayTeam: string, homeTeam: string): NbaNoVigMarket {
  return {
    available: false,
    source: "missing",
    awayTeam,
    homeTeam,
    awayOddsAmerican: null,
    homeOddsAmerican: null,
    awayNoVigProbability: null,
    homeNoVigProbability: null,
    hold: null,
    spreadLine: null,
    awaySpreadOddsAmerican: null,
    homeSpreadOddsAmerican: null,
    totalLine: null,
    overOddsAmerican: null,
    underOddsAmerican: null,
    overNoVigProbability: null,
    underNoVigProbability: null,
    totalHold: null
  };
}

function mergeMarket(args: {
  source: string;
  awayTeam: string;
  homeTeam: string;
  awayOddsAmerican: number | null;
  homeOddsAmerican: number | null;
  spreadLine: number | null;
  awaySpreadOddsAmerican: number | null;
  homeSpreadOddsAmerican: number | null;
  totalLine: number | null;
  overOddsAmerican: number | null;
  underOddsAmerican: number | null;
}) {
  const moneyline = noVig(args.homeOddsAmerican, args.awayOddsAmerican);
  const total = noVigTotal(args.overOddsAmerican, args.underOddsAmerican);
  if (!moneyline && !total && args.totalLine == null && args.spreadLine == null) return null;
  return {
    available: true,
    source: args.source,
    awayTeam: args.awayTeam,
    homeTeam: args.homeTeam,
    awayOddsAmerican: args.awayOddsAmerican,
    homeOddsAmerican: args.homeOddsAmerican,
    awayNoVigProbability: moneyline?.awayNoVigProbability ?? null,
    homeNoVigProbability: moneyline?.homeNoVigProbability ?? null,
    hold: moneyline?.hold ?? null,
    spreadLine: args.spreadLine,
    awaySpreadOddsAmerican: args.awaySpreadOddsAmerican,
    homeSpreadOddsAmerican: args.homeSpreadOddsAmerican,
    totalLine: args.totalLine,
    overOddsAmerican: args.overOddsAmerican,
    underOddsAmerican: args.underOddsAmerican,
    overNoVigProbability: total?.overNoVigProbability ?? null,
    underNoVigProbability: total?.underNoVigProbability ?? null,
    totalHold: total?.totalHold ?? null
  } satisfies NbaNoVigMarket;
}

async function fromBoardFeed(awayTeam: string, homeTeam: string): Promise<NbaNoVigMarket | null> {
  try {
    const board = await getBoardFeed("NBA", { skipCache: true }) as { events?: BoardEvent[] };
    for (const event of board.events ?? []) {
      const names = namesForBoardEvent(event);
      if (gameKey(names.away, names.home) !== gameKey(awayTeam, homeTeam)) continue;
      const markets = event.markets ?? [];
      const market = mergeMarket({
        source: "board-markets",
        awayTeam,
        homeTeam,
        awayOddsAmerican: moneylineFor(markets, "away"),
        homeOddsAmerican: moneylineFor(markets, "home"),
        spreadLine: spreadLineFor(markets),
        awaySpreadOddsAmerican: spreadOddsFor(markets, "away"),
        homeSpreadOddsAmerican: spreadOddsFor(markets, "home"),
        totalLine: totalLineFor(markets),
        overOddsAmerican: totalOddsFor(markets, "over"),
        underOddsAmerican: totalOddsFor(markets, "under")
      });
      if (market) return market;
    }
  } catch {
    return null;
  }
  return null;
}

async function fromOddsSnapshot(awayTeam: string, homeTeam: string): Promise<NbaNoVigMarket | null> {
  try {
    const snapshot = await readLatestOddsApiSnapshot();
    const events = ((snapshot?.events ?? []) as OddsSnapshotEvent[]).filter((event) => event.sport_key === "basketball_nba");
    for (const event of events) {
      if (!looseTeamMatch(event.away_team, awayTeam) || !looseTeamMatch(event.home_team, homeTeam)) continue;
      for (const bookmaker of event.bookmakers ?? []) {
        const h2h = bookmaker.markets?.find((market) => market.key === "h2h")?.outcomes ?? [];
        const totals = bookmaker.markets?.find((market) => market.key === "totals")?.outcomes ?? [];
        const spreads = bookmaker.markets?.find((market) => market.key === "spreads")?.outcomes ?? [];
        const over = totals.find((outcome) => String(outcome.name ?? "").toLowerCase().includes("over"));
        const under = totals.find((outcome) => String(outcome.name ?? "").toLowerCase().includes("under"));
        const awaySpread = spreads.find((outcome) => looseTeamMatch(outcome.name, awayTeam));
        const homeSpread = spreads.find((outcome) => looseTeamMatch(outcome.name, homeTeam));
        const market = mergeMarket({
          source: bookmaker.title || bookmaker.key || "odds-api-snapshot",
          awayTeam,
          homeTeam,
          awayOddsAmerican: h2h.find((outcome) => looseTeamMatch(outcome.name, awayTeam))?.price ?? null,
          homeOddsAmerican: h2h.find((outcome) => looseTeamMatch(outcome.name, homeTeam))?.price ?? null,
          spreadLine: numeric(homeSpread?.point),
          awaySpreadOddsAmerican: awaySpread?.price ?? null,
          homeSpreadOddsAmerican: homeSpread?.price ?? null,
          totalLine: numeric(over?.point) ?? numeric(under?.point),
          overOddsAmerican: over?.price ?? null,
          underOddsAmerican: under?.price ?? null
        });
        if (market) return market;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function getNbaNoVigMarket(awayTeam: string, homeTeam: string): Promise<NbaNoVigMarket> {
  const board = await fromBoardFeed(awayTeam, homeTeam);
  if (board) return board;
  const snapshot = await fromOddsSnapshot(awayTeam, homeTeam);
  if (snapshot) return snapshot;
  return emptyMarket(awayTeam, homeTeam);
}
