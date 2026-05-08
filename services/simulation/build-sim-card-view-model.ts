import { buildDisplayAction, edgeHasTotalMarket } from "@/services/simulation/sim-card-display-fallback";
import type { SimPriorityRow, SimMarketSnapshot } from "@/services/simulation/sim-snapshot-service";

type EdgeLike = NonNullable<SimMarketSnapshot["edges"]>[number];

export type ActionView = {
  action: "ATTACK" | "PLAY" | "LEAN" | "WATCH" | "PASS" | "NO_MARKET";
  marketType: "moneyline" | "total" | "projection_only";
  side: "home" | "away" | "over" | "under" | null;
  modelProbability: number | null;
  marketProbability: number | null;
  odds: number | null;
  ev: number | null;
  probabilityEdge: number | null;
  projectedRunEdge: number | null;
  actionScore: number | null;
  stakeUnits: number;
  sportsbook: string | null;
  reasons: string[];
  warnings: string[];
  hardStops: string[];
};

export type SimCardViewModel = {
  gameId: string;
  leagueKey: string;
  startTime: string | null;
  status: string | null;
  awayTeam: string;
  homeTeam: string;
  lean: { team: string; pct: number; edge: number };
  href: string;

  mode: "betting" | "projection_only";
  hasTotals: boolean;

  primaryAction: ActionView;
  totalsView: ActionView | null;

  projectedAwayRuns: number | null;
  projectedHomeRuns: number | null;
  projectedTotal: number | null;
  marketTotal: number | null;

  confidence: number | null;
  dataStatus: "ready" | "projection_only" | "market_missing";
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasRealMarket(edge: EdgeLike | null | undefined): boolean {
  const m = edge?.market as Record<string, unknown> | null | undefined;
  if (!m) return false;
  return m.homeMoneyline != null || m.awayMoneyline != null || m.total != null || m.overPrice != null || m.underPrice != null;
}

function toMarketType(market: string | null | undefined): "moneyline" | "total" | "projection_only" {
  if (market === "home_ml" || market === "away_ml") return "moneyline";
  if (market === "over" || market === "under") return "total";
  return "projection_only";
}

function toSide(market: string | null | undefined): "home" | "away" | "over" | "under" | null {
  if (market === "home_ml") return "home";
  if (market === "away_ml") return "away";
  if (market === "over") return "over";
  if (market === "under") return "under";
  return null;
}

const ACTION_RANK: Record<string, number> = {
  ATTACK: 6, PLAY: 5, LEAN: 4, WATCH: 3, PASS: 1, NO_MARKET: 2
};

function mapActionPayload(raw: Record<string, unknown>, fallbackSportsbook: string | null): ActionView {
  const action = String(raw.action ?? "WATCH").toUpperCase() as ActionView["action"];
  const market = String(raw.market ?? "").toLowerCase() || null;
  return {
    action: action === "NO_MARKET" ? "NO_MARKET" : action as ActionView["action"],
    marketType: toMarketType(market),
    side: toSide(market),
    modelProbability: num(raw.modelProbability),
    marketProbability: num(raw.marketProbability),
    odds: num(raw.americanOdds),
    ev: num(raw.expectedValue),
    probabilityEdge: num(raw.edge),
    projectedRunEdge: num(raw.projectedRunEdge),
    actionScore: num(raw.actionScore),
    stakeUnits: num(raw.stakeUnits) ?? 0,
    sportsbook: String(raw.sportsbook ?? fallbackSportsbook ?? "market") || null,
    reasons: Array.isArray(raw.reasons) ? (raw.reasons as string[]).filter(Boolean).slice(0, 4) : [],
    warnings: Array.isArray(raw.warnings) ? (raw.warnings as string[]).filter(Boolean) : [],
    hardStops: Array.isArray(raw.hardStopReasons) ? (raw.hardStopReasons as string[]).filter(Boolean) : []
  };
}

const NO_MARKET_ACTION: ActionView = {
  action: "NO_MARKET",
  marketType: "projection_only",
  side: null,
  modelProbability: null,
  marketProbability: null,
  odds: null,
  ev: null,
  probabilityEdge: null,
  projectedRunEdge: null,
  actionScore: null,
  stakeUnits: 0,
  sportsbook: null,
  reasons: [],
  warnings: [],
  hardStops: []
};

function edgeLean(edge: EdgeLike): { team: string; pct: number; edge: number } {
  const home = edge.matchup?.home ?? (edge.market as Record<string, unknown> | null)?.homeTeam ?? "Home";
  const away = edge.matchup?.away ?? (edge.market as Record<string, unknown> | null)?.awayTeam ?? "Away";
  const homeWinPct = num(edge.projection?.distribution?.homeWinPct) ?? 0.5;
  const awayWinPct = num(edge.projection?.distribution?.awayWinPct) ?? (1 - homeWinPct);
  return homeWinPct >= awayWinPct
    ? { team: String(home), pct: homeWinPct, edge: homeWinPct - awayWinPct }
    : { team: String(away), pct: awayWinPct, edge: awayWinPct - homeWinPct };
}

function fromEdge(edge: EdgeLike, row: SimPriorityRow | null): SimCardViewModel {
  const realMarket = hasRealMarket(edge);
  const sportsbook = (edge as Record<string, unknown>).sportsbook as string | null ?? null;

  const primaryRaw = realMarket ? buildDisplayAction(edge as Parameters<typeof buildDisplayAction>[0], "all") : {};
  const totalsRaw = realMarket && edgeHasTotalMarket(edge as Parameters<typeof edgeHasTotalMarket>[0])
    ? buildDisplayAction(edge as Parameters<typeof buildDisplayAction>[0], "totals")
    : null;

  const primaryAction = realMarket && Object.keys(primaryRaw).length > 0
    ? mapActionPayload(primaryRaw as Record<string, unknown>, sportsbook)
    : NO_MARKET_ACTION;

  const totalsView = totalsRaw && Object.keys(totalsRaw).length > 0
    ? mapActionPayload(totalsRaw as Record<string, unknown>, sportsbook)
    : null;

  const lean = edgeLean(edge);
  const projAway = num(edge.projection?.distribution?.avgAway);
  const projHome = num(edge.projection?.distribution?.avgHome);
  const mlbIntel = ((edge.projection as Record<string, unknown> | undefined)?.mlbIntel) as Record<string, unknown> | undefined;
  const projTotal = num(mlbIntel?.projectedTotal as unknown)
    ?? (projAway != null && projHome != null ? projAway + projHome : null);
  const marketTotal = num((edge.market as Record<string, unknown> | null)?.total as unknown);

  const home = edge.matchup?.home ?? (edge.market as Record<string, unknown> | null)?.homeTeam ?? row?.matchup?.home ?? "Home";
  const away = edge.matchup?.away ?? (edge.market as Record<string, unknown> | null)?.awayTeam ?? row?.matchup?.away ?? "Away";

  return {
    gameId: edge.gameId,
    leagueKey: (edge as Record<string, unknown>).leagueKey as string ?? "MLB",
    startTime: (edge as Record<string, unknown>).startTime as string | null ?? row?.startTime ?? null,
    status: (edge as Record<string, unknown>).status as string | null ?? row?.status ?? null,
    awayTeam: String(away),
    homeTeam: String(home),
    lean: row?.lean ?? lean,
    href: row?.href ?? `/sim/mlb/${encodeURIComponent(edge.gameId)}`,
    mode: realMarket ? "betting" : "projection_only",
    hasTotals: edgeHasTotalMarket(edge as Parameters<typeof edgeHasTotalMarket>[0]),
    primaryAction,
    totalsView,
    projectedAwayRuns: projAway,
    projectedHomeRuns: projHome,
    projectedTotal,
    marketTotal,
    confidence: row?.confidence ?? num((edge.projection as Record<string, unknown> | undefined)?.mlbIntel?.governor?.confidence as unknown),
    dataStatus: realMarket ? "ready" : "market_missing"
  };
}

function fromRow(row: SimPriorityRow): SimCardViewModel {
  return {
    gameId: row.id,
    leagueKey: row.leagueKey,
    startTime: row.startTime,
    status: row.status,
    awayTeam: row.matchup.away,
    homeTeam: row.matchup.home,
    lean: row.lean,
    href: row.href,
    mode: "projection_only",
    hasTotals: false,
    primaryAction: NO_MARKET_ACTION,
    totalsView: null,
    projectedAwayRuns: null,
    projectedHomeRuns: null,
    projectedTotal: null,
    marketTotal: null,
    confidence: row.confidence,
    dataStatus: "market_missing"
  };
}

export function buildSimCardViewModels(
  rows: SimPriorityRow[],
  edges: EdgeLike[]
): SimCardViewModel[] {
  const rowMap = new Map(rows.map((row) => [row.id, row]));
  const models = new Map<string, SimCardViewModel>();

  for (const edge of edges) {
    const row = rowMap.get(edge.gameId) ?? null;
    models.set(edge.gameId, fromEdge(edge, row));
  }

  for (const row of rows) {
    if (!models.has(row.id)) {
      models.set(row.id, fromRow(row));
    }
  }

  return [...models.values()].sort((a, b) => {
    const aRank = ACTION_RANK[a.primaryAction.action] ?? 2;
    const bRank = ACTION_RANK[b.primaryAction.action] ?? 2;
    const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
    const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
    return bRank - aRank || aTime - bTime;
  });
}
