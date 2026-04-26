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

function americanToProbability(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
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

async function fetchLines() {
  const url = process.env.MLB_SPORTSBOOK_LINES_URL?.trim() || process.env.ODDS_MARKET_URL?.trim();
  if (!url) return [];
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    return parseMarketRows(await res.json());
  } catch {
    return [];
  }
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
    edges.push({ gameId: game.id, matchup: projection.matchup, sportsbook: line?.sportsbook ?? "unknown", projection, market: line ?? null, edges: { homeMoneyline: homeEdge, awayMoneyline: awayEdge, totalRuns: totalEdge }, signal: best ? { ...best, strength: Math.abs(best.edge) >= 0.05 ? "strong" : Math.abs(best.edge) >= 0.025 ? "watch" : "thin" } : null });
  }
  return { ok: true, lineCount: lines.length, gameCount: mlbGames.length, edges };
}
