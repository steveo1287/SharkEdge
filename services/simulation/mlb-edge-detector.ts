import { getBoardFeed } from "@/services/market-data/market-data-service";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";
import { readLatestOddsApiSnapshot, runOddsApiSnapshotPull } from "@/services/odds/the-odds-api-budget-service";

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

type OddsSnapshotEvent = {
  id?: string;
  sport_key?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: Array<{
    key?: string;
    title?: string;
    markets?: Array<{
      key?: string;
      outcomes?: Array<{ name?: string; price?: number; point?: number | null }>;
    }>;
  }>;
};

function americanToProbability(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function validNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value !== 0 ? value : null;
}

function normalizeTeam(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

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

function key(home: string, away: string) {
  return `${normalizeTeam(away)}@${normalizeTeam(home)}`;
}

function looseTeamMatch(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeTeam(left);
  const b = normalizeTeam(right);
  if (!a || !b) return false;
  return a === b || a.endsWith(b) || b.endsWith(a) || a.includes(b) || b.includes(a);
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

function linesFromSnapshotEvent(event: OddsSnapshotEvent): SportsbookLine[] {
  if (event.sport_key !== "baseball_mlb" || !event.home_team || !event.away_team) return [];

  return (event.bookmakers ?? []).map((bookmaker) => {
    const markets = bookmaker.markets ?? [];
    const h2h = markets.find((market) => market.key === "h2h")?.outcomes ?? [];
    const totals = markets.find((market) => market.key === "totals")?.outcomes ?? [];
    const homeMoneyline = h2h.find((outcome) => looseTeamMatch(outcome.name, event.home_team))?.price ?? null;
    const awayMoneyline = h2h.find((outcome) => looseTeamMatch(outcome.name, event.away_team))?.price ?? null;
    const over = totals.find((outcome) => String(outcome.name ?? "").toLowerCase().includes("over"));
    const under = totals.find((outcome) => String(outcome.name ?? "").toLowerCase().includes("under"));
    const total = validNumber(over?.point) ?? validNumber(under?.point);

    if (homeMoneyline === null && awayMoneyline === null && total === null) return null;
    return {
      gameId: event.id,
      awayTeam: event.away_team,
      homeTeam: event.home_team,
      homeMoneyline,
      awayMoneyline,
      total,
      overPrice: over?.price ?? null,
      underPrice: under?.price ?? null,
      sportsbook: bookmaker.title || bookmaker.key || "The Odds API snapshot"
    } satisfies SportsbookLine;
  }).filter((line): line is SportsbookLine => Boolean(line));
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

async function fetchSnapshotLines() {
  try {
    const snapshot = await readLatestOddsApiSnapshot();
    return ((snapshot?.events ?? []) as OddsSnapshotEvent[]).flatMap(linesFromSnapshotEvent);
  } catch {
    return [] as SportsbookLine[];
  }
}

async function fetchLines() {
  const [persisted, external, snapshot] = await Promise.all([fetchPersistedBoardLines(), fetchExternalLines(), fetchSnapshotLines()]);
  const lines = [...persisted, ...external, ...snapshot];
  if (lines.length > 0) return lines;

  // Self-healing path: if the MLB sim page has games but no usable lines, run one guarded MLB pull.
  // The budget service still enforces active hours, min interval, daily limit, and monthly reserve.
  await runOddsApiSnapshotPull({ mode: "regular", sportsCsv: "baseball_mlb" }).catch(() => null);
  const [refreshedPersisted, refreshedSnapshot] = await Promise.all([fetchPersistedBoardLines(), fetchSnapshotLines()]);
  return [...refreshedPersisted, ...refreshedSnapshot];
}

function findLineForGame(lines: SportsbookLine[], game: { id: string }, matchup: { home: string; away: string }) {
  return lines.find((line) => line.gameId && line.gameId === game.id)
    ?? lines.find((line) => line.homeTeam && line.awayTeam && key(line.homeTeam, line.awayTeam) === key(matchup.home, matchup.away))
    ?? lines.find((line) => line.homeTeam && line.awayTeam && looseTeamMatch(line.homeTeam, matchup.home) && looseTeamMatch(line.awayTeam, matchup.away));
}

export async function buildMlbEdges() {
  const [sections, lines] = await Promise.all([buildBoardSportSections({ selectedLeague: "ALL", gamesByLeague: {} }), fetchLines()]);
  const mlbGames = sections.flatMap((section) => section.leagueKey === "MLB" ? section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel })) : []);
  const edges = [];
  for (const game of mlbGames) {
    const projection = await buildSimProjection(game as any);
    const line = findLineForGame(lines, game, projection.matchup);
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
