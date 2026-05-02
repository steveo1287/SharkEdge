import type { LeagueKey } from "@/lib/types/domain";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildScenarioSet, applyScenario, isScenarioKey, type ScenarioDelta, type ScenarioKey } from "@/services/sim/scenario-adjustments";
import { buildSeasonImpact, type SeasonImpactSnapshot } from "@/services/sim/season-impact";
import { getModelTrustGrade, type ModelTrustSnapshot } from "@/services/sim/model-trust-grade";
import { compareModelToMarket } from "@/services/sim/market-benchmark";
import { buildSimTwinCommandQueue } from "@/services/sim/sim-twin-command-queue";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

type BoardGame = {
  id: string;
  label: string;
  startTime: string;
  status: string;
  scoreboard?: string | null;
};

type SimProjectionInput = BoardGame & {
  leagueKey: LeagueKey;
  leagueLabel: string;
};

export type SimTwinSnapshot = {
  gameId: string;
  league: string;
  leagueLabel: string;
  eventLabel: string;
  startTime: string;
  status: string;
  href: string;
  matchup: {
    away: string;
    home: string;
  };
  base: {
    homeWinPct: number;
    awayWinPct: number;
    projectedSpread: number;
    projectedTotal: number;
    projectedHomeScore: number;
    projectedAwayScore: number;
    scoreRange: {
      homeP25: number;
      homeP75: number;
      awayP25: number;
      awayP75: number;
      totalP25: number;
      totalP75: number;
    };
    read: string;
  };
  market: {
    noVigHomePct: number | null;
    noVigAwayPct: number | null;
    spread: number | null;
    total: number | null;
    edgePct: number | null;
    verdict: string;
  };
  trust: ModelTrustSnapshot;
  seasonImpact: SeasonImpactSnapshot;
  scenarios: ScenarioDelta[];
  warnings: string[];
  source: {
    projectionModelVersion: string;
    dataSource: string;
  };
};

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function normalizeLeague(value: string | null | undefined) {
  return value?.trim().toUpperCase() || "ALL";
}

function projectionMarket(projection: Awaited<ReturnType<typeof buildSimProjection>>, league: string) {
  const realityMarket = (projection as any).realityIntel?.market ?? null;
  const nbaMarket = (projection as any).nbaIntel?.market ?? null;
  const mlbMarket = (projection as any).mlbIntel?.market ?? null;
  const market = realityMarket ?? nbaMarket ?? mlbMarket ?? null;

  const noVigHomePct =
    market?.homeNoVigProbability ??
    market?.homeProbability ??
    market?.noVigHomePct ??
    null;
  const noVigAwayPct = typeof noVigHomePct === "number" ? 1 - noVigHomePct : null;

  return {
    noVigHomePct: typeof noVigHomePct === "number" && Number.isFinite(noVigHomePct) ? noVigHomePct : null,
    noVigAwayPct: typeof noVigAwayPct === "number" && Number.isFinite(noVigAwayPct) ? noVigAwayPct : null,
    spread: typeof market?.spreadLine === "number" ? market.spreadLine : typeof market?.spread === "number" ? market.spread : null,
    total: typeof market?.totalLine === "number" ? market.totalLine : typeof market?.total === "number" ? market.total : null,
    dataSource: market?.source ?? "projection-market"
  };
}

function projectionSource(projection: Awaited<ReturnType<typeof buildSimProjection>>, league: string) {
  if (league === "NBA" && (projection as any).nbaIntel) {
    return {
      projectionModelVersion: (projection as any).nbaIntel.modelVersion ?? "nba-sim",
      dataSource: (projection as any).nbaIntel.dataSource ?? "nba-intel"
    };
  }

  if (league === "MLB" && (projection as any).mlbIntel) {
    return {
      projectionModelVersion: (projection as any).mlbIntel.modelVersion ?? "mlb-sim",
      dataSource: (projection as any).mlbIntel.dataSource ?? "mlb-intel"
    };
  }

  return {
    projectionModelVersion: "sim-projection-engine",
    dataSource: "projection-engine"
  };
}

function scoreRange(league: string, home: number, away: number) {
  const upperLeague = league.toUpperCase();
  const scoreSigma = upperLeague === "NBA" ? 8.5 : upperLeague === "NFL" ? 6.5 : upperLeague === "NHL" ? 1.25 : upperLeague === "MLB" ? 1.65 : 3;
  const totalSigma = upperLeague === "NBA" ? 12 : upperLeague === "NFL" ? 8.5 : upperLeague === "NHL" ? 1.8 : upperLeague === "MLB" ? 2.2 : 4.5;
  const total = home + away;

  return {
    homeP25: round(Math.max(0, home - scoreSigma), 2),
    homeP75: round(home + scoreSigma, 2),
    awayP25: round(Math.max(0, away - scoreSigma), 2),
    awayP75: round(away + scoreSigma, 2),
    totalP25: round(Math.max(0, total - totalSigma), 2),
    totalP75: round(total + totalSigma, 2)
  };
}

async function currentGames(league = "ALL") {
  const selectedLeague = normalizeLeague(league);
  const sections = await buildBoardSportSections({ selectedLeague: selectedLeague as any, gamesByLeague: {}, maxScoreboardGames: null });
  return sections
    .filter((section: any) => selectedLeague === "ALL" || String(section.leagueKey).toUpperCase() === selectedLeague)
    .flatMap((section: any) => (section.scoreboard ?? []).map((game: BoardGame) => ({
      ...game,
      leagueKey: section.leagueKey as LeagueKey,
      leagueLabel: section.leagueLabel ?? String(section.leagueKey)
    } as SimProjectionInput)));
}

export async function buildSimTwinSnapshot(game: SimProjectionInput): Promise<SimTwinSnapshot> {
  const projection = await buildSimProjection(game);
  const league = String(game.leagueKey).toUpperCase();
  const projectedHomeScore = projection.distribution.avgHome;
  const projectedAwayScore = projection.distribution.avgAway;
  const projectedSpread = projectedHomeScore - projectedAwayScore;
  const projectedTotal = projectedHomeScore + projectedAwayScore;
  const marketSource = projectionMarket(projection, league);
  const source = projectionSource(projection, league);
  const marketComparison = compareModelToMarket({
    modelProbability: projection.distribution.homeWinPct,
    marketProbability: marketSource.noVigHomePct
  });
  const trust = await getModelTrustGrade({
    league,
    market: "moneyline",
    modelVersion: source.projectionModelVersion,
    windowDays: 365
  });

  const base = {
    league,
    homeWinPct: projection.distribution.homeWinPct,
    awayWinPct: projection.distribution.awayWinPct,
    projectedSpread,
    projectedTotal
  };
  const scenarios = buildScenarioSet(base);
  const seasonImpact = buildSeasonImpact({
    league,
    gameId: game.id,
    eventLabel: game.label,
    status: game.status,
    homeWinPct: projection.distribution.homeWinPct,
    awayWinPct: projection.distribution.awayWinPct,
    projectedSpread,
    projectedTotal,
    trustGrade: trust.grade,
    marketEdgePct: marketComparison.edgePct
  });
  const warnings = [
    ...trust.warnings,
    ...seasonImpact.leverageReasons,
    ...scenarios.flatMap((scenario) => scenario.warnings)
  ];

  return {
    gameId: game.id,
    league,
    leagueLabel: game.leagueLabel,
    eventLabel: game.label,
    startTime: game.startTime,
    status: game.status,
    href: `/sim/twin/${encodeURIComponent(league)}/${encodeURIComponent(game.id)}`,
    matchup: projection.matchup,
    base: {
      homeWinPct: round(projection.distribution.homeWinPct),
      awayWinPct: round(projection.distribution.awayWinPct),
      projectedSpread: round(projectedSpread, 2),
      projectedTotal: round(projectedTotal, 2),
      projectedHomeScore: round(projectedHomeScore, 2),
      projectedAwayScore: round(projectedAwayScore, 2),
      scoreRange: scoreRange(league, projectedHomeScore, projectedAwayScore),
      read: projection.read
    },
    market: {
      noVigHomePct: marketSource.noVigHomePct == null ? null : round(marketSource.noVigHomePct),
      noVigAwayPct: marketSource.noVigAwayPct == null ? null : round(marketSource.noVigAwayPct),
      spread: marketSource.spread,
      total: marketSource.total,
      edgePct: marketComparison.edgePct == null ? null : round(marketComparison.edgePct, 2),
      verdict: marketComparison.verdict
    },
    trust,
    seasonImpact,
    scenarios,
    warnings: [...new Set(warnings)],
    source
  };
}

export async function listSimTwins(args: { league?: string | null; limit?: number | null } = {}) {
  const games = await currentGames(args.league ?? "ALL");
  const limit = typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.max(1, Math.min(50, args.limit)) : 24;
  const usable = games.filter((game) => game.status !== "FINAL" && game.status !== "POSTPONED" && game.status !== "CANCELED").slice(0, limit);
  const twins = await Promise.all(usable.map((game) => buildSimTwinSnapshot(game)));
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    league: normalizeLeague(args.league),
    count: twins.length,
    commandQueue: buildSimTwinCommandQueue(twins),
    twins
  };
}

export async function getSimTwin(args: { league: string; gameId: string }) {
  const games = await currentGames(args.league);
  const game = games.find((item) => String(item.id) === args.gameId);
  if (!game) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      error: `No current ${args.league.toUpperCase()} game found for ${args.gameId}.`,
      twin: null
    };
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    twin: await buildSimTwinSnapshot(game)
  };
}

export async function getSimTwinScenario(args: { league: string; gameId: string; scenario: string | null | undefined }) {
  const twinResult = await getSimTwin({ league: args.league, gameId: args.gameId });
  if (!twinResult.ok || !twinResult.twin) return { ...twinResult, scenario: null };

  const scenarioKey: ScenarioKey = isScenarioKey(args.scenario) ? args.scenario : "MARKET_LINE_MOVE";
  const twin = twinResult.twin;
  const scenario = applyScenario({
    league: twin.league,
    homeWinPct: twin.base.homeWinPct,
    awayWinPct: twin.base.awayWinPct,
    projectedSpread: twin.base.projectedSpread,
    projectedTotal: twin.base.projectedTotal
  }, scenarioKey);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    gameId: twin.gameId,
    league: twin.league,
    eventLabel: twin.eventLabel,
    scenario
  };
}
