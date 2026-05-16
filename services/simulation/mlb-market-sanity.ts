import { getBoardFeed } from "@/services/market-data/market-data-service";
import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
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

type MarketLineHistoryRow = {
  event_id: string;
  event_name: string;
  start_time: Date | string;
  market_type: string;
  side: string | null;
  selection: string | null;
  sportsbook_name: string | null;
  price: number | null;
  point: number | null;
};

type HistoryLine = {
  awayTeam: string;
  homeTeam: string;
  awayOddsAmerican: number | null;
  homeOddsAmerican: number | null;
  totalLine: number | null;
  overOddsAmerican: number | null;
  underOddsAmerican: number | null;
  sportsbook: string;
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

function namesForBoardEvent(event: BoardEvent) {
  const away = event.participants?.find((participant) => String(participant.role ?? "").toUpperCase() === "AWAY")?.competitor;
  const home = event.participants?.find((participant) => String(participant.role ?? "").toUpperCase() === "HOME")?.competitor;
  if (away && home) return { away, home };
  const [fallbackAway, fallbackHome] = String(event.name ?? "").split(" @ ").map((part) => part.trim());
  return { away: away ?? fallbackAway ?? "", home: home ?? fallbackHome ?? "" };
}

function namesForEventName(eventName: string | null | undefined) {
  const raw = String(eventName ?? "").trim();
  const atSplit = raw.split(/\s+@\s+|\s+at\s+/i);
  if (atSplit.length === 2) return { away: atSplit[0]?.trim() ?? "", home: atSplit[1]?.trim() ?? "" };
  const vsSplit = raw.split(" vs ");
  if (vsSplit.length === 2) return { away: vsSplit[0]?.trim() ?? "", home: vsSplit[1]?.trim() ?? "" };
  return { away: "", home: "" };
}

function emptyMarket(awayTeam: string, homeTeam: string): MlbNoVigMarket {
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
  totalLine: number | null;
  overOddsAmerican: number | null;
  underOddsAmerican: number | null;
}) {
  const moneyline = noVig(args.homeOddsAmerican, args.awayOddsAmerican);
  const total = noVigTotal(args.overOddsAmerican, args.underOddsAmerican);
  if (!moneyline && !total && args.totalLine == null) return null;
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
    totalLine: args.totalLine,
    overOddsAmerican: args.overOddsAmerican,
    underOddsAmerican: args.underOddsAmerican,
    overNoVigProbability: total?.overNoVigProbability ?? null,
    underNoVigProbability: total?.underNoVigProbability ?? null,
    totalHold: total?.totalHold ?? null
  } satisfies MlbNoVigMarket;
}

async function fromBoardFeed(awayTeam: string, homeTeam: string): Promise<MlbNoVigMarket | null> {
  try {
    const board = await getBoardFeed("MLB", { skipCache: true }) as { events?: BoardEvent[] };
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

async function fromMarketLineHistory(awayTeam: string, homeTeam: string, gameId?: string | null): Promise<MlbNoVigMarket | null> {
  if (!hasUsableServerDatabaseUrl()) return null;

  try {
    const normalizedGameId = String(gameId ?? "").trim();
    const rows = await prisma.$queryRaw<MarketLineHistoryRow[]>`
      WITH latest AS (
        SELECT DISTINCT ON (mlh.event_id, mlh.sportsbook_name, mlh.market_type, mlh.side, COALESCE(mlh.selection, ''))
          mlh.event_id,
          e.name AS event_name,
          e."startTime" AS start_time,
          mlh.market_type,
          mlh.side,
          mlh.selection,
          mlh.sportsbook_name,
          mlh.price,
          mlh.point
        FROM market_line_history mlh
        JOIN events e ON e.id = mlh.event_id
        JOIN leagues l ON l.id = e."leagueId"
        WHERE l.key = 'MLB'
          AND e."startTime" >= now() - interval '1 day'
          AND e."startTime" <= now() + interval '4 days'
          AND mlh.captured_at >= now() - interval '10 days'
          AND mlh.market_type IN ('moneyline', 'total')
          AND mlh.price IS NOT NULL
          AND (${normalizedGameId} = '' OR mlh.event_id = ${normalizedGameId})
        ORDER BY mlh.event_id, mlh.sportsbook_name, mlh.market_type, mlh.side, COALESCE(mlh.selection, ''), mlh.captured_at DESC
      )
      SELECT *
      FROM latest
      ORDER BY start_time ASC
      LIMIT 800
    `;

    const lines = new Map<string, HistoryLine>();
    for (const row of rows) {
      const names = namesForEventName(row.event_name);
      if (!looseTeamMatch(names.away, awayTeam) || !looseTeamMatch(names.home, homeTeam)) continue;

      const sportsbook = row.sportsbook_name ?? "market-line-history";
      const key = `${row.event_id}:${sportsbook}`;
      const line = lines.get(key) ?? {
        awayTeam,
        homeTeam,
        awayOddsAmerican: null,
        homeOddsAmerican: null,
        totalLine: null,
        overOddsAmerican: null,
        underOddsAmerican: null,
        sportsbook
      };
      const side = String(row.side ?? "").toLowerCase();
      const selection = String(row.selection ?? "").toLowerCase();

      if (row.market_type === "moneyline") {
        if (side.includes("home") || looseTeamMatch(selection, homeTeam)) line.homeOddsAmerican = numeric(row.price);
        if (side.includes("away") || looseTeamMatch(selection, awayTeam)) line.awayOddsAmerican = numeric(row.price);
      }

      if (row.market_type === "total") {
        const point = numeric(row.point);
        if (point != null) line.totalLine = point;
        if (side.includes("over") || selection.includes("over")) line.overOddsAmerican = numeric(row.price);
        if (side.includes("under") || selection.includes("under")) line.underOddsAmerican = numeric(row.price);
      }

      lines.set(key, line);
    }

    if (!lines.size && normalizedGameId !== "") {
      return fromMarketLineHistory(awayTeam, homeTeam, null);
    }

    const markets: MlbNoVigMarket[] = [];
    for (const line of lines.values()) {
      const market = mergeMarket({
        source: `market-line-history:${line.sportsbook}`,
        awayTeam,
        homeTeam,
        awayOddsAmerican: line.awayOddsAmerican,
        homeOddsAmerican: line.homeOddsAmerican,
        totalLine: line.totalLine,
        overOddsAmerican: line.overOddsAmerican,
        underOddsAmerican: line.underOddsAmerican
      });
      if (market) markets.push(market);
    }

    const moneylineMarket = markets
      .filter((market) => market.homeNoVigProbability != null && market.awayNoVigProbability != null)
      .sort((left, right) => (left.hold ?? 1) - (right.hold ?? 1))[0];
    if (moneylineMarket) return moneylineMarket;

    const totalMarket = markets
      .filter((market) => market.totalLine != null)
      .sort((left, right) => (left.totalHold ?? 1) - (right.totalHold ?? 1))[0];
    if (totalMarket) return totalMarket;

    for (const line of lines.values()) {
      const market = mergeMarket({
        source: `market-line-history:${line.sportsbook}`,
        awayTeam,
        homeTeam,
        awayOddsAmerican: line.awayOddsAmerican,
        homeOddsAmerican: line.homeOddsAmerican,
        totalLine: line.totalLine,
        overOddsAmerican: line.overOddsAmerican,
        underOddsAmerican: line.underOddsAmerican
      });
      if (market?.homeNoVigProbability != null || market?.totalLine != null) return market;
    }

    if (normalizedGameId !== "") {
      return fromMarketLineHistory(awayTeam, homeTeam, null);
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
        const totals = bookmaker.markets?.find((market) => market.key === "totals")?.outcomes ?? [];
        const over = totals.find((outcome) => String(outcome.name ?? "").toLowerCase().includes("over"));
        const under = totals.find((outcome) => String(outcome.name ?? "").toLowerCase().includes("under"));
        const market = mergeMarket({
          source: bookmaker.title || bookmaker.key || "odds-api-snapshot",
          awayTeam,
          homeTeam,
          awayOddsAmerican: h2h.find((outcome) => looseTeamMatch(outcome.name, awayTeam))?.price ?? null,
          homeOddsAmerican: h2h.find((outcome) => looseTeamMatch(outcome.name, homeTeam))?.price ?? null,
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

export async function getMlbNoVigMarket(awayTeam: string, homeTeam: string, gameId?: string | null): Promise<MlbNoVigMarket> {
  const history = await fromMarketLineHistory(awayTeam, homeTeam, gameId);
  if (history) return history;
  const board = await fromBoardFeed(awayTeam, homeTeam);
  if (board) return board;
  const snapshot = await fromOddsSnapshot(awayTeam, homeTeam);
  if (snapshot) return snapshot;
  return emptyMarket(awayTeam, homeTeam);
}
