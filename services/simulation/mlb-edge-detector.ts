import { getBoardFeed } from "@/services/market-data/market-data-service";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";
import { readLatestOddsApiSnapshot, runOddsApiSnapshotPull } from "@/services/odds/the-odds-api-budget-service";
import { normalizeTeamKey } from "@/lib/utils/team-normalization";

export type SportsbookLine = {
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

type MlbConsensusLine = SportsbookLine & {
  homeNoVigProbability: number | null;
  awayNoVigProbability: number | null;
  moneylineHold: number | null;
  moneylineSourceCount: number;
  totalSourceCount: number;
  totalHold: number | null;
  warnings: string[];
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

type MarketSignal = {
  market: string;
  team: string | null;
  edge: number;
  rankScore: number;
  sourceCount: number;
  marketHold: number | null;
  warnings: string[];
};

const MAX_MONEYLINE_HOLD = 0.12;
const MAX_TOTAL_HOLD = 0.12;
const MIN_ACTIONABLE_MARKET_SOURCES = 2;
const STRONG_MONEYLINE_EDGE = 0.05;
const WATCH_MONEYLINE_EDGE = 0.025;
const STRONG_TOTAL_RUN_EDGE = 1.35;
const WATCH_TOTAL_RUN_EDGE = 0.65;

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

export type MlbEdgeGame = { id: string; label: string; startTime: string; status: string; leagueKey: string; leagueLabel: string };
export type MlbEdgeProjection = Pick<Awaited<ReturnType<typeof buildSimProjection>>, "matchup" | "distribution" | "mlbIntel">;

type BuildMlbEdgesOptions = {
  games?: MlbEdgeGame[];
  projectionsByGameId?: Map<string, MlbEdgeProjection>;
  allowLineRefresh?: boolean;
};

type BuildMlbEdgesFromProjectionsOptions = {
  games: MlbEdgeGame[];
  projectionsByGameId: Map<string, MlbEdgeProjection>;
  lines?: SportsbookLine[];
  allowLineRefresh?: boolean;
};

function logTiming(label: string, startedAt: number) {
  console.info(`[sim-timing] ${label} ${Date.now() - startedAt}ms`);
}

function americanToProbability(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

export function noVigMoneylineProbabilities(homeOdds: number | null | undefined, awayOdds: number | null | undefined) {
  const home = americanToProbability(homeOdds);
  const away = americanToProbability(awayOdds);
  if (home == null || away == null) return null;
  const total = home + away;
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    home: round(home / total),
    away: round(away / total),
    hold: round(total - 1)
  };
}

function noVigTotalProbabilities(overOdds: number | null | undefined, underOdds: number | null | undefined) {
  const over = americanToProbability(overOdds);
  const under = americanToProbability(underOdds);
  if (over == null || under == null) return null;
  const total = over + under;
  if (!Number.isFinite(total) || total <= 0) return null;
  return { over: round(over / total), under: round(under / total), hold: round(total - 1) };
}

function validNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value !== 0 ? value : null;
}

function normalizeTeam(value: string | null | undefined) {
  return normalizeTeamKey(value, {
    athletics: "sacramentoathletics",
    oaklandathletics: "sacramentoathletics",
    whitesox: "chicagowhitesox",
    redsox: "bostonredsox",
    bluejays: "torontobluejays",
    dbacks: "arizonadiamondbacks",
    diamondbacks: "arizonadiamondbacks"
  });
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

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
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

  const lines: SportsbookLine[] = [];
  for (const bookmaker of event.bookmakers ?? []) {
    const markets = bookmaker.markets ?? [];
    const h2h = markets.find((market) => market.key === "h2h")?.outcomes ?? [];
    const totals = markets.find((market) => market.key === "totals")?.outcomes ?? [];
    const homeMoneyline = h2h.find((outcome) => looseTeamMatch(outcome.name, event.home_team))?.price ?? null;
    const awayMoneyline = h2h.find((outcome) => looseTeamMatch(outcome.name, event.away_team))?.price ?? null;
    const over = totals.find((outcome) => String(outcome.name ?? "").toLowerCase().includes("over"));
    const under = totals.find((outcome) => String(outcome.name ?? "").toLowerCase().includes("under"));
    const total = validNumber(over?.point) ?? validNumber(under?.point);

    if (homeMoneyline === null && awayMoneyline === null && total === null) continue;
    lines.push({
      gameId: event.id,
      awayTeam: event.away_team,
      homeTeam: event.home_team,
      homeMoneyline,
      awayMoneyline,
      total,
      overPrice: over?.price ?? null,
      underPrice: under?.price ?? null,
      sportsbook: bookmaker.title || bookmaker.key || "The Odds API snapshot"
    });
  }

  return lines;
}

async function fetchExternalLines() {
  const startedAt = Date.now();
  const url = process.env.MLB_SPORTSBOOK_LINES_URL?.trim() || process.env.ODDS_MARKET_URL?.trim();
  if (!url) return [] as SportsbookLine[];
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    return parseMarketRows(await res.json());
  } catch {
    return [];
  } finally {
    logTiming("fetchLines.external", startedAt);
  }
}

async function fetchPersistedBoardLines() {
  const startedAt = Date.now();
  try {
    const board = (await getBoardFeed("MLB", { skipCache: true })) as PersistedBoardFeed;
    return (board.events ?? []).map(lineFromPersistedEvent).filter((line): line is SportsbookLine => Boolean(line));
  } catch {
    return [] as SportsbookLine[];
  } finally {
    logTiming("fetchLines.persistedBoard", startedAt);
  }
}

async function fetchSnapshotLines() {
  const startedAt = Date.now();
  try {
    const snapshot = await readLatestOddsApiSnapshot();
    return ((snapshot?.events ?? []) as OddsSnapshotEvent[]).flatMap(linesFromSnapshotEvent);
  } catch {
    return [] as SportsbookLine[];
  } finally {
    logTiming("fetchLines.snapshot", startedAt);
  }
}

export async function fetchMlbSportsbookLines(options: { allowRefresh?: boolean } = {}) {
  const startedAt = Date.now();
  const [persisted, external, snapshot] = await Promise.all([fetchPersistedBoardLines(), fetchExternalLines(), fetchSnapshotLines()]);
  const lines = [...persisted, ...external, ...snapshot];
  if (lines.length > 0 || options.allowRefresh === false) {
    logTiming("fetchLines.total", startedAt);
    return lines;
  }

  // Self-healing path: if the MLB sim page has games but no usable lines, run one guarded MLB pull.
  // The budget service still enforces active hours, min interval, daily limit, and monthly reserve.
  await runOddsApiSnapshotPull({ mode: "regular", sportsCsv: "baseball_mlb" }).catch(() => null);
  const [refreshedPersisted, refreshedSnapshot] = await Promise.all([fetchPersistedBoardLines(), fetchSnapshotLines()]);
  const refreshed = [...refreshedPersisted, ...refreshedSnapshot];
  logTiming("fetchLines.total", startedAt);
  return refreshed;
}

function lineMatchesGame(line: SportsbookLine, game: { id: string }, matchup: { home: string; away: string }) {
  if (line.gameId && line.gameId === game.id) return true;
  if (line.homeTeam && line.awayTeam && key(line.homeTeam, line.awayTeam) === key(matchup.home, matchup.away)) return true;
  return Boolean(line.homeTeam && line.awayTeam && looseTeamMatch(line.homeTeam, matchup.home) && looseTeamMatch(line.awayTeam, matchup.away));
}

function findLinesForGame(lines: SportsbookLine[], game: { id: string }, matchup: { home: string; away: string }) {
  return lines.filter((line) => lineMatchesGame(line, game, matchup));
}

export function buildMlbConsensusLine(lines: SportsbookLine[], matchup: { home: string; away: string }): MlbConsensusLine | null {
  if (!lines.length) return null;

  const moneylineMarkets = lines
    .map((line) => ({ line, noVig: noVigMoneylineProbabilities(line.homeMoneyline, line.awayMoneyline) }))
    .filter((row): row is { line: SportsbookLine; noVig: NonNullable<ReturnType<typeof noVigMoneylineProbabilities>> } => Boolean(row.noVig))
    .filter((row) => row.noVig.hold <= MAX_MONEYLINE_HOLD);
  const totalMarkets = lines
    .map((line) => ({ line, noVig: noVigTotalProbabilities(line.overPrice, line.underPrice) }))
    .filter((row): row is { line: SportsbookLine; noVig: NonNullable<ReturnType<typeof noVigTotalProbabilities>> } => Boolean(row.noVig))
    .filter((row) => row.noVig.hold <= MAX_TOTAL_HOLD);

  const rawTotals = lines.map((line) => validNumber(line.total)).filter((value): value is number => value !== null);
  const consensusTotal = median(rawTotals);
  const homeNoVigProbability = average(moneylineMarkets.map((row) => row.noVig.home));
  const awayNoVigProbability = average(moneylineMarkets.map((row) => row.noVig.away));
  const moneylineHold = average(moneylineMarkets.map((row) => row.noVig.hold));
  const totalHold = average(totalMarkets.map((row) => row.noVig.hold));
  const warnings: string[] = [];

  if (moneylineMarkets.length < MIN_ACTIONABLE_MARKET_SOURCES) warnings.push(`Moneyline consensus thin (${moneylineMarkets.length}/${MIN_ACTIONABLE_MARKET_SOURCES} valid books).`);
  if (rawTotals.length > 0 && rawTotals.length < MIN_ACTIONABLE_MARKET_SOURCES) warnings.push(`Total consensus thin (${rawTotals.length}/${MIN_ACTIONABLE_MARKET_SOURCES} books).`);
  if (moneylineMarkets.length < lines.filter((line) => line.homeMoneyline != null && line.awayMoneyline != null).length) warnings.push("Rejected high-hold moneyline books from consensus.");
  if (totalMarkets.length < lines.filter((line) => line.overPrice != null && line.underPrice != null).length) warnings.push("Rejected high-hold total books from consensus.");

  const homeMoneyline = bestNumeric(lines.map((line) => line.homeMoneyline));
  const awayMoneyline = bestNumeric(lines.map((line) => line.awayMoneyline));
  const overPrice = bestNumeric(lines.map((line) => line.overPrice));
  const underPrice = bestNumeric(lines.map((line) => line.underPrice));
  if (homeMoneyline === null && awayMoneyline === null && consensusTotal === null) return null;

  return {
    gameId: lines.find((line) => line.gameId)?.gameId,
    awayTeam: matchup.away,
    homeTeam: matchup.home,
    homeMoneyline,
    awayMoneyline,
    total: consensusTotal == null ? null : round(consensusTotal, 3),
    overPrice,
    underPrice,
    sportsbook: lines.length === 1 ? lines[0]?.sportsbook ?? "unknown" : `${lines.length} book consensus`,
    homeNoVigProbability: homeNoVigProbability == null ? null : round(homeNoVigProbability),
    awayNoVigProbability: awayNoVigProbability == null ? null : round(awayNoVigProbability),
    moneylineHold: moneylineHold == null ? null : round(moneylineHold),
    moneylineSourceCount: moneylineMarkets.length,
    totalSourceCount: rawTotals.length,
    totalHold: totalHold == null ? null : round(totalHold),
    warnings
  };
}

export function rankMlbMarketSignal(signal: Pick<MarketSignal, "market" | "edge">) {
  const absEdge = Math.abs(signal.edge);
  if (signal.market === "over" || signal.market === "under") {
    return round(absEdge / STRONG_TOTAL_RUN_EDGE, 4);
  }
  return round(absEdge / STRONG_MONEYLINE_EDGE, 4);
}

function signalStrength(signal: MarketSignal, projection: MlbEdgeProjection) {
  const absEdge = Math.abs(signal.edge);
  const governor = projection.mlbIntel?.governor;
  const confidence = typeof governor?.confidence === "number" ? governor.confidence : 0;
  const volatility = projection.mlbIntel?.volatilityIndex ?? 2;
  const calibrated = projection.mlbIntel?.calibration?.ece != null;
  const noBet = Boolean(governor?.noBet) || confidence < 0.6;
  const thinMarket = signal.sourceCount < MIN_ACTIONABLE_MARKET_SOURCES;
  const dirtyMarket = signal.marketHold != null && signal.marketHold > (signal.market === "over" || signal.market === "under" ? MAX_TOTAL_HOLD : MAX_MONEYLINE_HOLD);

  if (dirtyMarket) return "thin";

  if (signal.market === "over" || signal.market === "under") {
    if (noBet || volatility >= 1.65 || !calibrated || thinMarket) {
      if (absEdge >= 2.25 && confidence >= 0.45 && volatility < 2.05 && !dirtyMarket) return "watch";
      return "thin";
    }
    if (absEdge >= STRONG_TOTAL_RUN_EDGE) return "strong";
    if (absEdge >= WATCH_TOTAL_RUN_EDGE) return "watch";
    return "thin";
  }

  if (noBet || volatility >= 1.65 || thinMarket) {
    if (absEdge >= 0.075 && confidence >= 0.52 && !dirtyMarket) return "watch";
    return "thin";
  }
  if (absEdge >= STRONG_MONEYLINE_EDGE) return "strong";
  if (absEdge >= WATCH_MONEYLINE_EDGE) return "watch";
  return "thin";
}

export async function buildMlbEdges(options: BuildMlbEdgesOptions = {}) {
  const startedAt = Date.now();
  const [sections, lines] = await Promise.all([
    options.games ? Promise.resolve(null) : (async () => {
      const boardStartedAt = Date.now();
      const value = await buildBoardSportSections({ selectedLeague: "ALL", gamesByLeague: {} });
      logTiming("buildMlbEdges.buildBoardSportSections", boardStartedAt);
      return value;
    })(),
    fetchMlbSportsbookLines({ allowRefresh: options.allowLineRefresh })
  ]);
  const mlbGames = options.games
    ?? (sections ?? []).flatMap((section) => section.leagueKey === "MLB" ? section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel })) : []);
  const projectionsByGameId = new Map(options.projectionsByGameId);
  const projectionStartedAt = Date.now();
  for (const game of mlbGames) {
    if (!projectionsByGameId.has(game.id)) {
      projectionsByGameId.set(game.id, await buildSimProjection(game as any));
    }
  }
  logTiming("buildMlbEdges.buildSimProjection batch", projectionStartedAt);
  const result = await buildMlbEdgesFromProjections({
    games: mlbGames,
    projectionsByGameId,
    lines,
    allowLineRefresh: false
  });
  logTiming("buildMlbEdges.total", startedAt);
  return result;
}

export async function buildMlbEdgesFromProjections(options: BuildMlbEdgesFromProjectionsOptions) {
  const startedAt = Date.now();
  const lines = options.lines ?? await fetchMlbSportsbookLines({ allowRefresh: options.allowLineRefresh });
  const edges = [];
  for (const game of options.games) {
    const projection = options.projectionsByGameId.get(game.id);
    if (!projection) continue;
    const matchedLines = findLinesForGame(lines, game, projection.matchup);
    const line = buildMlbConsensusLine(matchedLines, projection.matchup);
    const homeMarketProb = line?.homeNoVigProbability ?? americanToProbability(line?.homeMoneyline ?? null);
    const awayMarketProb = line?.awayNoVigProbability ?? americanToProbability(line?.awayMoneyline ?? null);
    const homeEdge = homeMarketProb == null ? null : Number((projection.distribution.homeWinPct - homeMarketProb).toFixed(4));
    const awayEdge = awayMarketProb == null ? null : Number((projection.distribution.awayWinPct - awayMarketProb).toFixed(4));
    const totalEdge = typeof line?.total === "number" && projection.mlbIntel ? Number((projection.mlbIntel.projectedTotal - line.total).toFixed(3)) : null;
    const candidates: MarketSignal[] = [
      homeEdge == null ? null : { market: "home_ml", team: projection.matchup.home, edge: homeEdge, rankScore: rankMlbMarketSignal({ market: "home_ml", edge: homeEdge }), sourceCount: line?.moneylineSourceCount ?? 0, marketHold: line?.moneylineHold ?? null, warnings: line?.warnings ?? [] },
      awayEdge == null ? null : { market: "away_ml", team: projection.matchup.away, edge: awayEdge, rankScore: rankMlbMarketSignal({ market: "away_ml", edge: awayEdge }), sourceCount: line?.moneylineSourceCount ?? 0, marketHold: line?.moneylineHold ?? null, warnings: line?.warnings ?? [] },
      totalEdge == null ? null : { market: totalEdge > 0 ? "over" : "under", team: null, edge: Math.abs(totalEdge), rankScore: rankMlbMarketSignal({ market: totalEdge > 0 ? "over" : "under", edge: totalEdge }), sourceCount: line?.totalSourceCount ?? 0, marketHold: line?.totalHold ?? null, warnings: line?.warnings ?? [] }
    ].filter((signal): signal is MarketSignal => Boolean(signal));
    const best = candidates.sort((a, b) => b.rankScore - a.rankScore)[0] ?? null;
    edges.push({
      gameId: game.id,
      matchup: projection.matchup,
      sportsbook: line?.sportsbook ?? "unknown",
      projection,
      market: line ?? null,
      marketQuality: line ? {
        moneylineSourceCount: line.moneylineSourceCount,
        totalSourceCount: line.totalSourceCount,
        moneylineHold: line.moneylineHold,
        totalHold: line.totalHold,
        warnings: line.warnings
      } : null,
      edges: { homeMoneyline: homeEdge, awayMoneyline: awayEdge, totalRuns: totalEdge },
      signal: best ? { ...best, strength: signalStrength(best, projection) } : null
    });
  }
  logTiming("buildMlbEdgesFromProjections.total", startedAt);
  return { ok: true, lineCount: lines.length, gameCount: options.games.length, edges };
}
