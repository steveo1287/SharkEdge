import { getBoardFeed } from "@/services/market-data/market-data-service";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

type SportsbookLine = {
  gameId?: string;
  awayTeam?: string;
  homeTeam?: string;
  homeMoneyline?: number | null;
  awayMoneyline?: number | null;
  total?: number | null;
  overPrice?: number | null;
  underPrice?: number | null;
  sportsbook?: string;
};

type PersistedBoardFeed = {
  generatedAt: string;
  events: Array<{
    id: string;
    eventKey: string | null;
    league: string;
    name: string;
    startTime: string;
    status: string;
    participants: Array<{ role: string; competitor: string }>;
    markets: any[];
    topSignals: any[];
  }>;
};

function americanToProbability(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function validNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value !== 0 ? value : null;
}

function key(home: string, away: string) {
  return `${away.toLowerCase().replace(/[^a-z0-9]+/g, "")}@${home.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
}

function parseMarketRows(body: any): SportsbookLine[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.games)) return body.games;
  if (Array.isArray(body?.lines)) return body.lines;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

function marketTypeOf(market: any) {
  return String(market?.marketType ?? "").toLowerCase();
}

function marketsByType(markets: any[], marketType: "moneyline" | "spread" | "total") {
  return (markets ?? []).filter((market) => marketTypeOf(market) === marketType);
}

function bestNumeric(values: unknown[]) {
  const numbers = values.map(validNumber).filter((value): value is number => value !== null);
  if (!numbers.length) return null;
  return [...numbers].sort((left, right) => right - left)[0] ?? null;
}

function lineValue(markets: any[], marketType: "spread" | "total") {
  for (const market of marketsByType(markets, marketType)) {
    const value = validNumber(market.consensusLineValue) ?? validNumber(market.currentLine) ?? validNumber(market.line);
    if (value !== null) return value;
  }
  return null;
}

function moneylineFor(markets: any[], side: "home" | "away") {
  const typed = marketsByType(markets, "moneyline");
  const explicit = bestNumeric(
    typed.flatMap((market) => side === "home"
      ? [market.bestHomeOddsAmerican, market.homeOddsAmerican, market.homeOdds, market.currentHomeOdds]
      : [market.bestAwayOddsAmerican, market.awayOddsAmerican, market.awayOdds, market.currentAwayOdds]
    )
  );
  if (explicit !== null) return explicit;

  const selected = typed
    .filter((market) => {
      const rawSide = String(market.side ?? market.selectionSide ?? market.participantRole ?? "").toLowerCase();
      return rawSide.includes(side);
    })
    .flatMap((market) => [market.currentOdds, market.oddsAmerican, market.bestOddsAmerican]);
  return bestNumeric(selected);
}

function totalPrice(markets: any[], side: "over" | "under") {
  const typed = marketsByType(markets, "total");
  const explicit = bestNumeric(
    typed.flatMap((market) => side === "over"
      ? [market.bestOverOddsAmerican, market.overOddsAmerican, market.overOdds, market.currentOverOdds]
      : [market.bestUnderOddsAmerican, market.underOddsAmerican, market.underOdds, market.currentUnderOdds]
    )
  );
  if (explicit !== null) return explicit;

  const selected = typed
    .filter((market) => String(market.side ?? market.selection ?? "").toLowerCase().includes(side))
    .flatMap((market) => [market.currentOdds, market.oddsAmerican, market.bestOddsAmerican]);
  return bestNumeric(selected);
}

function namesForEvent(event: PersistedBoardFeed["events"][number]) {
  const away = event.participants.find((participant) => participant.role === "AWAY")?.competitor;
  const home = event.participants.find((participant) => participant.role === "HOME")?.competitor;
  if (away && home) return { away, home };
  const [fallbackAway, fallbackHome] = String(event.name ?? "").split(" @ ").map((value) => value.trim());
  return { away: away ?? fallbackAway ?? "Away", home: home ?? fallbackHome ?? "Home" };
}

function lineFromPersistedEvent(event: PersistedBoardFeed["events"][number]): SportsbookLine | null {
  const markets = event.markets ?? [];
  if (!markets.length) return null;
  const { away, home } = namesForEvent(event);
  const homeMoneyline = moneylineFor(markets, "home");
  const awayMoneyline = moneylineFor(markets, "away");
  const total = lineValue(markets, "total");
  const overPrice = totalPrice(markets, "over");
  const underPrice = totalPrice(markets, "under");
  if (homeMoneyline === null && awayMoneyline === null && total === null) return null;

  return {
    gameId: event.eventKey ?? event.id,
    awayTeam: away,
    homeTeam: home,
    homeMoneyline,
    awayMoneyline,
    total,
    overPrice,
    underPrice,
    sportsbook: "Best available"
  };
}

async function fetchExternalLines() {
  const url = process.env.MLB_SPORTSBOOK_LINES_URL?.trim() || process.env.ODDS_MARKET_URL?.trim();
  if (!url) return [] as SportsbookLine[];
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    return parseMarketRows(await res.json());
  } catch {
    return [];
  }
}

async function fetchPersistedBoardLines() {
  try {
    const board = (await getBoardFeed("MLB", { skipCache: true })) as PersistedBoardFeed;
    return (board.events ?? []).map(lineFromPersistedEvent).filter((line): line is SportsbookLine => Boolean(line));
  } catch {
    return [] as SportsbookLine[];
  }
}

async function fetchLines() {
  const [persisted, external] = await Promise.all([fetchPersistedBoardLines(), fetchExternalLines()]);
  return [...persisted, ...external];
}

export async function buildMlbEdges() {
  const [sections, lines] = await Promise.all([buildBoardSportSections({ selectedLeague: "ALL", gamesByLeague: {} }), fetchLines()]);
  const lineByGame = new Map<string, SportsbookLine>();
  for (const line of lines) {
    if (line.gameId) lineByGame.set(line.gameId, line);
    if (line.homeTeam && line.awayTeam) lineByGame.set(key(line.homeTeam, line.awayTeam), line);
  }

  const mlbGames = sections.flatMap((section) => section.leagueKey === "MLB" ? section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel })) : []);
  const edges = [];
  for (const game of mlbGames) {
    const projection = await buildSimProjection(game as any);
    const line = lineByGame.get(game.id) ?? lineByGame.get(key(projection.matchup.home, projection.matchup.away));
    const homeMarketProb = americanToProbability(line?.homeMoneyline ?? null);
    const awayMarketProb = americanToProbability(line?.awayMoneyline ?? null);
    const homeEdge = homeMarketProb == null ? null : Number((projection.distribution.homeWinPct - homeMarketProb).toFixed(4));
    const awayEdge = awayMarketProb == null ? null : Number((projection.distribution.awayWinPct - awayMarketProb).toFixed(4));
    const totalEdge = typeof line?.total === "number" && projection.mlbIntel ? Number((projection.mlbIntel.projectedTotal - line.total).toFixed(3)) : null;
    const best = [
      homeEdge == null ? null : { market: "home_ml", team: projection.matchup.home, edge: homeEdge },
      awayEdge == null ? null : { market: "away_ml", team: projection.matchup.away, edge: awayEdge },
      totalEdge == null ? null : { market: totalEdge > 0 ? "over" : "under", team: null, edge: Math.abs(totalEdge) }
    ].filter(Boolean).sort((a: any, b: any) => Math.abs(b.edge) - Math.abs(a.edge))[0] as any;
    edges.push({
      gameId: game.id,
      matchup: projection.matchup,
      sportsbook: line?.sportsbook ?? "unknown",
      projection,
      market: line ?? null,
      edges: { homeMoneyline: homeEdge, awayMoneyline: awayEdge, totalRuns: totalEdge },
      signal: best ? { ...best, strength: Math.abs(best.edge) >= 0.05 ? "strong" : Math.abs(best.edge) >= 0.025 ? "watch" : "thin" } : null
    });
  }
  return { ok: true, lineCount: lines.length, gameCount: mlbGames.length, edges };
}
