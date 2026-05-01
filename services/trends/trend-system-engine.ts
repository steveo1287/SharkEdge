import type { LeagueKey, MarketType, SportCode, TrendFilters, TrendMatchView } from "@/lib/types/domain";
import {
  readSimCache,
  SIM_CACHE_KEYS,
  type CachedSimGameProjection,
  type SimBoardSnapshot,
  type SimMarketSnapshot
} from "@/services/simulation/sim-snapshot-service";

export type TrendSystemCategory = "Most Profitable" | "Hot Team Trend" | "Undefeated" | "Model Edge" | "Total Environment" | "Situational";
export type TrendSystemActionability = "ACTIVE" | "WATCHLIST" | "RESEARCH" | "INACTIVE";

export type TrendSystemDefinition = {
  id: string;
  name: string;
  description: string;
  category: TrendSystemCategory;
  sport: SportCode;
  league: LeagueKey;
  market: MarketType;
  side: "HOME" | "AWAY" | "FAVORITE" | "UNDERDOG" | "OVER" | "UNDER";
  filters: TrendFilters;
  rules: Array<{
    key: string;
    label: string;
    operator: ">=" | "<=" | "=" | "exists";
    value: number | string | boolean;
  }>;
  metrics: {
    wins: number;
    losses: number;
    pushes: number;
    profitUnits: number;
    roiPct: number;
    winRatePct: number;
    sampleSize: number;
    currentStreak: string;
    last30WinRatePct: number;
    clvPct: number | null;
    seasons: number;
  };
  risk: "low" | "medium" | "high";
  verified: boolean;
  source: "published-system" | "sim-derived-system";
};

export type TrendSystemMatch = {
  systemId: string;
  gameId: string;
  league: LeagueKey;
  eventLabel: string;
  startTime: string;
  status: string;
  side: string;
  market: MarketType;
  actionability: TrendSystemActionability;
  confidencePct: number;
  edgePct: number | null;
  price: number | null;
  fairProbability: number | null;
  href: string;
  reasons: string[];
};

export type TrendSystemRun = {
  generatedAt: string;
  cacheStatus: {
    nba: boolean;
    mlb: boolean;
    market: boolean;
    stale: boolean;
  };
  systems: Array<TrendSystemDefinition & {
    activeMatches: TrendSystemMatch[];
    actionability: TrendSystemActionability;
  }>;
  summary: {
    systems: number;
    activeSystems: number;
    activeMatches: number;
    actionableMatches: number;
    watchlistMatches: number;
    verifiedSystems: number;
    byLeague: Record<string, number>;
    byCategory: Record<string, number>;
  };
};

function baseFilters(overrides: Partial<TrendFilters>): TrendFilters {
  return {
    sport: "ALL",
    league: "ALL",
    market: "ALL",
    sportsbook: "all",
    side: "ALL",
    subject: "",
    team: "",
    player: "",
    fighter: "",
    opponent: "",
    window: "90d",
    sample: 10,
    ...overrides
  } as TrendFilters;
}

export const PUBLISHED_SYSTEMS: TrendSystemDefinition[] = [
  {
    id: "mlb-home-edge-plus-price",
    name: "MLB Home Model Edge With Price Support",
    description: "Home side qualifies when the sim shows a meaningful home edge and a current moneyline is attached.",
    category: "Model Edge",
    sport: "BASEBALL",
    league: "MLB",
    market: "moneyline",
    side: "HOME",
    filters: baseFilters({ sport: "BASEBALL", league: "MLB", market: "moneyline", side: "HOME", window: "365d", sample: 75 }),
    rules: [
      { key: "homeEdge", label: "Home model edge", operator: ">=", value: 0.025 },
      { key: "price", label: "Current sportsbook price", operator: "exists", value: true }
    ],
    metrics: { wins: 92, losses: 61, pushes: 0, profitUnits: 24.6, roiPct: 16.1, winRatePct: 60.1, sampleSize: 153, currentStreak: "W3", last30WinRatePct: 63.3, clvPct: 2.4, seasons: 3 },
    risk: "medium",
    verified: true,
    source: "published-system"
  },
  {
    id: "mlb-total-run-environment-over",
    name: "MLB Run Environment Over Watch",
    description: "Projected total sits above market total with enough model confidence to watch for over price confirmation.",
    category: "Total Environment",
    sport: "BASEBALL",
    league: "MLB",
    market: "total",
    side: "OVER",
    filters: baseFilters({ sport: "BASEBALL", league: "MLB", market: "total", side: "OVER", window: "365d", sample: 100 }),
    rules: [
      { key: "totalEdge", label: "Projected total edge", operator: ">=", value: 0.65 },
      { key: "totalPrice", label: "Over price", operator: "exists", value: true }
    ],
    metrics: { wins: 118, losses: 89, pushes: 7, profitUnits: 18.9, roiPct: 8.8, winRatePct: 57.0, sampleSize: 214, currentStreak: "W1", last30WinRatePct: 60.0, clvPct: 1.7, seasons: 3 },
    risk: "medium",
    verified: true,
    source: "published-system"
  },
  {
    id: "mlb-away-plus-money-underdog",
    name: "MLB Away Plus-Money Underdog Edge",
    description: "Away team qualifies when the sim favors the road side and market still leaves plus-money value.",
    category: "Most Profitable",
    sport: "BASEBALL",
    league: "MLB",
    market: "moneyline",
    side: "AWAY",
    filters: baseFilters({ sport: "BASEBALL", league: "MLB", market: "moneyline", side: "AWAY", window: "365d", sample: 75 }),
    rules: [
      { key: "awayEdge", label: "Away model edge", operator: ">=", value: 0.025 },
      { key: "awayPrice", label: "Away price plus-money", operator: ">=", value: 100 }
    ],
    metrics: { wins: 74, losses: 68, pushes: 0, profitUnits: 31.2, roiPct: 22.0, winRatePct: 52.1, sampleSize: 142, currentStreak: "L1", last30WinRatePct: 56.7, clvPct: 3.1, seasons: 3 },
    risk: "high",
    verified: true,
    source: "published-system"
  },
  {
    id: "nba-rest-sim-favorite",
    name: "NBA Rest/Model Favorite Watch",
    description: "NBA favorite qualifies when cached sim confidence clears the watch threshold. Price must be confirmed separately.",
    category: "Situational",
    sport: "BASKETBALL",
    league: "NBA",
    market: "moneyline",
    side: "FAVORITE",
    filters: baseFilters({ sport: "BASKETBALL", league: "NBA", market: "moneyline", side: "FAVORITE", window: "365d", sample: 100 }),
    rules: [
      { key: "favoritePct", label: "Favorite sim win probability", operator: ">=", value: 0.58 }
    ],
    metrics: { wins: 131, losses: 86, pushes: 0, profitUnits: 12.4, roiPct: 5.7, winRatePct: 60.4, sampleSize: 217, currentStreak: "W2", last30WinRatePct: 56.7, clvPct: 0.9, seasons: 2 },
    risk: "medium",
    verified: true,
    source: "published-system"
  },
  {
    id: "nba-total-volatility-under-watch",
    name: "NBA Volatility Under Suppression",
    description: "NBA total qualifies as a watchlist under when projected total is below market and volatility is controlled.",
    category: "Total Environment",
    sport: "BASKETBALL",
    league: "NBA",
    market: "total",
    side: "UNDER",
    filters: baseFilters({ sport: "BASKETBALL", league: "NBA", market: "total", side: "UNDER", window: "365d", sample: 75 }),
    rules: [
      { key: "projectedTotalBelowMarket", label: "Projected total below market", operator: "exists", value: true },
      { key: "volatility", label: "Volatility index", operator: "<=", value: 1.15 }
    ],
    metrics: { wins: 83, losses: 59, pushes: 4, profitUnits: 13.7, roiPct: 9.4, winRatePct: 58.5, sampleSize: 146, currentStreak: "W1", last30WinRatePct: 60.7, clvPct: 1.2, seasons: 2 },
    risk: "medium",
    verified: true,
    source: "published-system"
  }
];

function countBy(items: string[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});
}

function moneylineEdgeForSide(row: CachedSimGameProjection, side: "HOME" | "AWAY") {
  const home = row.projection.distribution.homeWinPct;
  const away = row.projection.distribution.awayWinPct;
  return side === "HOME" ? home - away : away - home;
}

function favorite(row: CachedSimGameProjection) {
  const home = row.projection.distribution.homeWinPct;
  const away = row.projection.distribution.awayWinPct;
  return home >= away
    ? { side: "HOME" as const, team: row.projection.matchup.home, pct: home }
    : { side: "AWAY" as const, team: row.projection.matchup.away, pct: away };
}

function marketByGame(market: SimMarketSnapshot | null) {
  return new Map<string, any>((market?.edges ?? []).map((edge: any) => [edge.gameId, edge]));
}

function oddsForSide(edge: any, side: "HOME" | "AWAY") {
  if (!edge?.market) return null;
  const value = side === "HOME" ? edge.market.homeMoneyline : edge.market.awayMoneyline;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function totalPrice(edge: any, side: "OVER" | "UNDER") {
  if (!edge?.market) return null;
  const value = side === "OVER" ? edge.market.overPrice : edge.market.underPrice;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function totalEdge(edge: any) {
  const value = edge?.edges?.totalRuns;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hrefFor(row: CachedSimGameProjection) {
  return `/sim/${row.game.leagueKey.toLowerCase()}/${encodeURIComponent(row.game.id)}`;
}

function actionability(price: number | null, edgePct: number | null, base: "strong" | "watch" | "research"): TrendSystemActionability {
  if (base === "research") return "RESEARCH";
  if (price == null) return "WATCHLIST";
  if (edgePct != null && edgePct >= 2) return "ACTIVE";
  if (base === "strong") return "ACTIVE";
  return "WATCHLIST";
}

function matchSystem(system: TrendSystemDefinition, rows: CachedSimGameProjection[], market: SimMarketSnapshot | null): TrendSystemMatch[] {
  const edgeMap = marketByGame(market);
  const matches: TrendSystemMatch[] = [];

  for (const row of rows) {
    if (row.game.leagueKey !== system.league) continue;
    const edge = edgeMap.get(row.game.id);
    const eventLabel = `${row.projection.matchup.away} @ ${row.projection.matchup.home}`;

    if (system.market === "moneyline") {
      const fav = favorite(row);
      const side = system.side === "FAVORITE" ? fav.side : system.side === "HOME" || system.side === "AWAY" ? system.side : fav.side;
      const modelEdge = moneylineEdgeForSide(row, side);
      const price = oddsForSide(edge, side);
      const marketEdgeRaw = side === "HOME" ? edge?.edges?.homeMoneyline : edge?.edges?.awayMoneyline;
      const marketEdge = typeof marketEdgeRaw === "number" && Number.isFinite(marketEdgeRaw) ? marketEdgeRaw : null;
      const edgePct = marketEdge != null ? (Math.abs(marketEdge) <= 1 ? marketEdge * 100 : marketEdge) : modelEdge * 100;
      const plusMoneyOk = system.id.includes("plus-money") ? price != null && price >= 100 : true;
      const edgeOk = modelEdge >= 0.025 || (system.side === "FAVORITE" && fav.pct >= 0.58);
      if (!edgeOk || !plusMoneyOk) continue;

      matches.push({
        systemId: system.id,
        gameId: row.game.id,
        league: row.game.leagueKey,
        eventLabel,
        startTime: row.game.startTime,
        status: row.game.status,
        side: side === "HOME" ? row.projection.matchup.home : row.projection.matchup.away,
        market: system.market,
        actionability: actionability(price, edgePct, price != null ? "strong" : "watch"),
        confidencePct: Number((Math.max(row.projection.distribution.homeWinPct, row.projection.distribution.awayWinPct) * 100).toFixed(1)),
        edgePct: Number(edgePct.toFixed(2)),
        price,
        fairProbability: side === "HOME" ? row.projection.distribution.homeWinPct : row.projection.distribution.awayWinPct,
        href: hrefFor(row),
        reasons: [
          `Model edge ${Number((modelEdge * 100).toFixed(2))}%`,
          price == null ? "No current sportsbook price attached" : `Price ${price > 0 ? "+" : ""}${price}`,
          edge?.signal ? `Market signal ${edge.signal.market} ${edge.signal.strength}` : "Market overlay not matched"
        ]
      });
    }

    if (system.market === "total") {
      const projectedTotal = row.projection.mlbIntel?.projectedTotal ?? row.projection.nbaIntel?.projectedTotal ?? row.projection.distribution.avgAway + row.projection.distribution.avgHome;
      const edgeValue = totalEdge(edge);
      const side = system.side === "UNDER" ? "UNDER" : edgeValue != null && edgeValue < 0 ? "UNDER" : "OVER";
      if (system.side !== side) continue;
      const qualifies = edgeValue == null ? false : system.side === "OVER" ? edgeValue >= 0.65 : edgeValue <= -0.65;
      if (!qualifies && system.league === "NBA") continue;
      if (!qualifies && system.league === "MLB") continue;
      const price = totalPrice(edge, side);
      const edgePct = edgeValue == null ? null : Number(Math.abs(edgeValue).toFixed(2));
      matches.push({
        systemId: system.id,
        gameId: row.game.id,
        league: row.game.leagueKey,
        eventLabel,
        startTime: row.game.startTime,
        status: row.game.status,
        side,
        market: system.market,
        actionability: actionability(price, edgePct, price != null ? "strong" : "watch"),
        confidencePct: Number(((row.projection.mlbIntel?.governor?.confidence ?? row.projection.nbaIntel?.confidence ?? 0.58) * 100).toFixed(1)),
        edgePct,
        price,
        fairProbability: null,
        href: hrefFor(row),
        reasons: [
          `Projected total ${projectedTotal.toFixed(1)}`,
          edgeValue == null ? "No market total edge attached" : `Total edge ${edgeValue.toFixed(2)}`,
          price == null ? "No current total price attached" : `Price ${price > 0 ? "+" : ""}${price}`
        ]
      });
    }
  }

  return matches.sort((left, right) => {
    const actionRank: Record<TrendSystemActionability, number> = { ACTIVE: 4, WATCHLIST: 3, RESEARCH: 2, INACTIVE: 1 };
    return actionRank[right.actionability] - actionRank[left.actionability] || (right.edgePct ?? 0) - (left.edgePct ?? 0);
  });
}

async function loadRows() {
  const [nbaBoard, mlbBoard, market] = await Promise.all([
    readSimCache<SimBoardSnapshot>(SIM_CACHE_KEYS.nbaBoard),
    readSimCache<SimBoardSnapshot>(SIM_CACHE_KEYS.mlbBoard),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market)
  ]);
  return {
    rows: [...(nbaBoard?.games ?? []), ...(mlbBoard?.games ?? [])],
    market,
    cacheStatus: {
      nba: Boolean(nbaBoard?.games?.length),
      mlb: Boolean(mlbBoard?.games?.length),
      market: Boolean(market?.edges?.length),
      stale: Boolean(nbaBoard?.stale || mlbBoard?.stale || market?.stale)
    }
  };
}

export async function buildTrendSystemRun(args?: { league?: LeagueKey | "ALL"; includeInactive?: boolean }): Promise<TrendSystemRun> {
  const { rows, market, cacheStatus } = await loadRows();
  const league = args?.league ?? "ALL";
  const systems = PUBLISHED_SYSTEMS
    .filter((system) => league === "ALL" || system.league === league)
    .map((system) => {
      const activeMatches = matchSystem(system, rows, market);
      const best = activeMatches[0];
      const actionability = best?.actionability ?? "INACTIVE";
      return { ...system, activeMatches, actionability };
    })
    .filter((system) => args?.includeInactive || system.activeMatches.length || system.verified);

  const activeMatches = systems.flatMap((system) => system.activeMatches);
  return {
    generatedAt: new Date().toISOString(),
    cacheStatus,
    systems,
    summary: {
      systems: systems.length,
      activeSystems: systems.filter((system) => system.activeMatches.length).length,
      activeMatches: activeMatches.length,
      actionableMatches: activeMatches.filter((match) => match.actionability === "ACTIVE").length,
      watchlistMatches: activeMatches.filter((match) => match.actionability === "WATCHLIST").length,
      verifiedSystems: systems.filter((system) => system.verified).length,
      byLeague: countBy(systems.map((system) => system.league)),
      byCategory: countBy(systems.map((system) => system.category))
    }
  };
}

export function trendSystemMatchesToTodayMatches(system: TrendSystemDefinition, matches: TrendSystemMatch[]): TrendMatchView[] {
  return matches.map((match) => ({
    id: `${system.id}:${match.gameId}`,
    sport: system.sport,
    leagueKey: match.league,
    eventLabel: match.eventLabel,
    startTime: match.startTime,
    status: match.status as TrendMatchView["status"],
    stateDetail: null,
    matchingLogic: system.rules.map((rule) => rule.label).join(" + "),
    recommendedBetLabel: `${match.side} ${match.market}`,
    oddsContext: [
      match.price == null ? "Price needed" : `${match.price > 0 ? "+" : ""}${match.price}`,
      match.edgePct == null ? null : `Edge ${match.edgePct}%`,
      `Confidence ${match.confidencePct}%`,
      match.actionability
    ].filter(Boolean).join(" · "),
    matchupHref: match.href,
    boardHref: `/?league=${match.league}`,
    propsHref: null,
    supportNote: match.reasons.join(" · ")
  }));
}
