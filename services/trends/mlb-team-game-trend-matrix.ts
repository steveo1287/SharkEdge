import type { MlbTrendDefinition, MlbTrendEvaluationSummary } from "@/lib/types/mlb-trend-feed";
import type { MlbTrendBoardRow, MlbTrendHistoricalRow } from "@/lib/types/mlb-trends";

import { DefaultMlbTrendEvaluatorService } from "./mlb-trend-evaluator-service";
import {
  loadNormalizedMlbBoardTrendRows,
  loadNormalizedMlbHistoricalTrendRows
} from "./mlb-trends-data-adapters";

const MIN_CONTEXT_SAMPLE = 12;
const MIN_STRONG_SAMPLE = 60;

type TeamSide = "home" | "away";
type AngleAction = "ACTIONABLE" | "WATCH" | "CONTEXT" | "BLOCKED";
type FallbackTrendMatch = {
  gameId: string;
  league: string;
  eventLabel: string;
  startTime?: string | null;
  status?: string | null;
  side?: string | null;
  market?: string | null;
  price?: number | null;
};

export type MlbTeamGameTrendAngle = {
  id: string;
  title: string;
  teamName: string | null;
  opponentName: string | null;
  side: TeamSide | "game";
  market: "moneyline" | "runline" | "total";
  betLabel: string;
  currentMarket: number | null;
  sampleSize: number;
  record: string;
  hitRate: number | null;
  roi: number | null;
  units: number | null;
  signalScore: number;
  stabilityScore: number;
  overfitRisk: number;
  confidenceLabel: MlbTrendEvaluationSummary["confidenceLabel"];
  stabilityLabel: MlbTrendEvaluationSummary["stabilityLabel"];
  action: AngleAction;
  blockers: string[];
  reasons: string[];
  definition: {
    id: string;
    family: MlbTrendDefinition["family"];
    conditions: string[];
  };
};

export type MlbTeamGameTrendMatrixGame = {
  gameId: string;
  matchup: string;
  startsAt: string | null;
  homeTeamName: string;
  awayTeamName: string;
  source: string | null;
  depthScore: number;
  trendCount: number;
  actionableCount: number;
  watchCount: number;
  blockedCount: number;
  teamAngles: MlbTeamGameTrendAngle[];
  totalAngles: MlbTeamGameTrendAngle[];
  topAngles: MlbTeamGameTrendAngle[];
};

export type MlbTeamDepthRow = {
  teamName: string;
  games: number;
  angles: number;
  actionable: number;
  watch: number;
  topScore: number;
  bestAngle: string | null;
};

export type MlbTeamGameTrendMatrix = {
  generatedAt: string;
  source: "mlb_team_game_trend_matrix";
  historicalRows: number;
  boardRows: number;
  warnings: string[];
  games: MlbTeamGameTrendMatrixGame[];
  teamDepthBoard: MlbTeamDepthRow[];
  summary: {
    games: number;
    teams: number;
    angles: number;
    actionable: number;
    watch: number;
    blocked: number;
  };
};

const evaluator = new DefaultMlbTrendEvaluatorService();

function n(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function score(value: number | null | undefined) {
  return n(value) ?? 0;
}

function normalizeId(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function splitEventLabel(value: string | null | undefined) {
  const label = String(value ?? "");
  const parts = label.includes(" @ ") ? label.split(" @ ") : label.includes(" at ") ? label.split(" at ") : [];
  if (parts.length !== 2) return null;
  const away = parts[0]?.trim();
  const home = parts[1]?.trim();
  return away && home ? { away, home } : null;
}

function mergeFallbackRows(rows: MlbTrendBoardRow[], matches: FallbackTrendMatch[] = []) {
  if (rows.length || !matches.length) return rows;
  const map = new Map<string, MlbTrendBoardRow>();

  for (const match of matches) {
    if (String(match.league).toUpperCase() !== "MLB") continue;
    const teams = splitEventLabel(match.eventLabel);
    if (!teams) continue;
    const existing = map.get(match.gameId) ?? {
      gameId: match.gameId,
      externalGameId: null,
      startsAt: match.startTime ?? null,
      league: "MLB" as const,
      homeTeamId: normalizeId(teams.home),
      awayTeamId: normalizeId(teams.away),
      homeTeamName: teams.home,
      awayTeamName: teams.away,
      matchup: `${teams.away} @ ${teams.home}`,
      currentMoneylineHome: null,
      currentMoneylineAway: null,
      currentRunlineHome: null,
      currentRunlineAway: null,
      currentRunlinePriceHome: null,
      currentRunlinePriceAway: null,
      currentTotal: null,
      currentTotalOverPrice: null,
      currentTotalUnderPrice: null,
      startingPitcherHome: null,
      startingPitcherAway: null,
      startingPitcherHandHome: null,
      startingPitcherHandAway: null,
      status: match.status ?? null,
      source: "trend-active-match-fallback"
    };

    const market = String(match.market ?? "").toLowerCase();
    const side = String(match.side ?? "").toUpperCase();
    if (market === "moneyline" && typeof match.price === "number") {
      if (side === "HOME") existing.currentMoneylineHome = match.price;
      if (side === "AWAY") existing.currentMoneylineAway = match.price;
    }
    if (market === "total") {
      if (side === "OVER") existing.currentTotalOverPrice = match.price ?? null;
      if (side === "UNDER") existing.currentTotalUnderPrice = match.price ?? null;
    }
    map.set(match.gameId, existing);
  }

  return [...map.values()];
}

function moneylineBand(price: number | null | undefined) {
  if (typeof price !== "number" || !Number.isFinite(price)) return null;
  const spread = Math.max(20, Math.round(Math.abs(price) * 0.18));
  return {
    min: price - spread,
    max: price + spread
  };
}

function conditionText(definition: MlbTrendDefinition) {
  return definition.conditions.map((condition) => {
    const field = condition.field.replace(/_/g, " ");
    if (condition.op === "between") return `${field} ${condition.min} to ${condition.max}`;
    return `${field} ${condition.op} ${String(condition.value)}`;
  });
}

function teamDefinition(args: {
  row: MlbTrendBoardRow;
  side: TeamSide;
  market: "moneyline" | "runline";
  variant: "role" | "price-band";
}): MlbTrendDefinition | null {
  const teamId = args.side === "home" ? args.row.homeTeamId : args.row.awayTeamId;
  const teamName = args.side === "home" ? args.row.homeTeamName : args.row.awayTeamName;
  const moneyline = args.side === "home" ? args.row.currentMoneylineHome : args.row.currentMoneylineAway;
  const runline = args.side === "home" ? args.row.currentRunlineHome : args.row.currentRunlineAway;
  const isHome = args.side === "home";

  if (!teamId || !teamName) return null;

  const conditions: MlbTrendDefinition["conditions"] = [
    { field: "subject_team_name", op: "eq", value: teamName },
    { field: isHome ? "subject_is_home" : "subject_is_away", op: "eq", value: true }
  ];

  if (args.market === "moneyline" && args.variant === "price-band") {
    const band = moneylineBand(moneyline);
    if (!band) return null;
    conditions.push({ field: "subject_moneyline", op: "between", min: band.min, max: band.max });
  }

  if (args.market === "runline") {
    if (typeof runline !== "number" || !Number.isFinite(runline)) return null;
    conditions.push({ field: "subject_runline", op: "eq", value: runline });
  }

  const label = args.variant === "price-band" ? "near current price" : isHome ? "home role" : "road role";

  return {
    id: `mlb-${normalizeId(teamName)}-${args.side}-${args.market}-${args.variant}`,
    family: args.market === "runline" ? "RUNLINE" : "MONEYLINE",
    title: `${teamName} ${args.market === "runline" ? "runline" : "moneyline"} ${label}`,
    description: `${teamName} historical ${args.market} trend in the current ${isHome ? "home" : "away"} context.`,
    subject: { type: "team", teamId, teamName },
    betSide: args.market === "runline" ? "subject_runline" : "subject_ml",
    conditions,
    whyThisMatters: "Team-specific historical rows show whether this exact team/role/market has produced real graded betting results.",
    cautionNote: "Use as context unless the current sim, starter, lineup, bullpen, and market price also agree.",
    enabled: true
  };
}

function totalDefinition(row: MlbTrendBoardRow, side: "over" | "under"): MlbTrendDefinition | null {
  if (typeof row.currentTotal !== "number" || !Number.isFinite(row.currentTotal)) return null;
  const min = Number((row.currentTotal - 0.5).toFixed(1));
  const max = Number((row.currentTotal + 0.5).toFixed(1));
  return {
    id: `mlb-${normalizeId(row.gameId)}-total-${side}-${row.currentTotal}`,
    family: "TOTALS",
    title: `${row.matchup} ${side} total band`,
    description: `Historical MLB total results for games closing around ${row.currentTotal}.`,
    betSide: side,
    conditions: [{ field: "closing_total", op: "between", min, max }],
    whyThisMatters: "Total-band history checks whether the current number sits in a historically over-friendly or under-friendly scoring window.",
    cautionNote: "Weather, umpire, park, lineups, and bullpen usage can overpower a generic total band.",
    enabled: true
  };
}

function currentMarketFor(definition: MlbTrendDefinition, row: MlbTrendBoardRow, side: TeamSide | "game") {
  if (definition.betSide === "over" || definition.betSide === "under") return row.currentTotal ?? null;
  if (definition.betSide === "subject_ml") return side === "home" ? row.currentMoneylineHome ?? null : side === "away" ? row.currentMoneylineAway ?? null : null;
  if (definition.betSide === "subject_runline") return side === "home" ? row.currentRunlineHome ?? null : side === "away" ? row.currentRunlineAway ?? null : null;
  return null;
}

function betLabel(definition: MlbTrendDefinition, row: MlbTrendBoardRow, side: TeamSide | "game") {
  if (definition.betSide === "over") return `Over ${row.currentTotal ?? "TBD"}`;
  if (definition.betSide === "under") return `Under ${row.currentTotal ?? "TBD"}`;
  if (definition.betSide === "subject_ml") return `${side === "home" ? row.homeTeamName : row.awayTeamName} ML`;
  if (definition.betSide === "subject_runline") return `${side === "home" ? row.homeTeamName : row.awayTeamName} ${currentMarketFor(definition, row, side) ?? "RL"}`;
  return definition.title;
}

function blockersFor(summary: MlbTrendEvaluationSummary, currentMarket: number | null) {
  const blockers: string[] = [];
  if (currentMarket == null) blockers.push("missing-current-market");
  if (summary.sampleSize < MIN_CONTEXT_SAMPLE) blockers.push("thin-history");
  if (summary.roi == null) blockers.push("roi-not-supported");
  if (typeof summary.roi === "number" && summary.roi <= 0) blockers.push("negative-or-flat-roi");
  if ((summary.overfitRisk ?? 0) >= 70) blockers.push("overfit-risk");
  return blockers;
}

function actionFor(summary: MlbTrendEvaluationSummary, blockers: string[]): AngleAction {
  if (blockers.includes("missing-current-market") || blockers.includes("thin-history")) return "BLOCKED";
  if (summary.sampleSize >= MIN_STRONG_SAMPLE && typeof summary.roi === "number" && summary.roi > 0 && (summary.signalScore ?? 0) >= 45) return "ACTIONABLE";
  if (summary.sampleSize >= 25 && (summary.signalScore ?? 0) >= 30) return "WATCH";
  return "CONTEXT";
}

function reasonsFor(summary: MlbTrendEvaluationSummary, blockers: string[]) {
  const reasons = [
    `${summary.record} historical record`,
    summary.hitRate == null ? "hit rate unavailable" : `${summary.hitRate.toFixed(1)}% hit rate`,
    summary.roi == null ? "ROI not supported by enough closing prices" : `${summary.roi > 0 ? "+" : ""}${summary.roi.toFixed(1)}% ROI`,
    `signal ${score(summary.signalScore).toFixed(1)}`,
    `stability ${score(summary.stabilityScore).toFixed(1)}`
  ];
  if (blockers.length) reasons.push(`Blockers: ${blockers.join(", ")}`);
  return reasons;
}

function buildAngle(args: {
  definition: MlbTrendDefinition;
  historicalRows: MlbTrendHistoricalRow[];
  boardRow: MlbTrendBoardRow;
  side: TeamSide | "game";
  teamName: string | null;
  opponentName: string | null;
  market: "moneyline" | "runline" | "total";
}): MlbTeamGameTrendAngle {
  const summary = evaluator.evaluateTrend(args.definition, args.historicalRows);
  const currentMarket = currentMarketFor(args.definition, args.boardRow, args.side);
  const blockers = blockersFor(summary, currentMarket);
  const action = actionFor(summary, blockers);

  return {
    id: `${args.boardRow.gameId}:${args.definition.id}`,
    title: args.definition.title,
    teamName: args.teamName,
    opponentName: args.opponentName,
    side: args.side,
    market: args.market,
    betLabel: betLabel(args.definition, args.boardRow, args.side),
    currentMarket,
    sampleSize: summary.sampleSize,
    record: summary.record,
    hitRate: summary.hitRate,
    roi: summary.roi,
    units: typeof summary.units === "number" ? summary.units : null,
    signalScore: score(summary.signalScore),
    stabilityScore: score(summary.stabilityScore),
    overfitRisk: score(summary.overfitRisk),
    confidenceLabel: summary.confidenceLabel,
    stabilityLabel: summary.stabilityLabel,
    action,
    blockers,
    reasons: reasonsFor(summary, blockers),
    definition: {
      id: args.definition.id,
      family: args.definition.family,
      conditions: conditionText(args.definition)
    }
  };
}

function angleRank(angle: MlbTeamGameTrendAngle) {
  const actionBoost = angle.action === "ACTIONABLE" ? 35 : angle.action === "WATCH" ? 20 : angle.action === "CONTEXT" ? 8 : 0;
  const roiBoost = typeof angle.roi === "number" ? Math.max(-15, Math.min(25, angle.roi * 0.8)) : -6;
  const sampleBoost = Math.min(15, angle.sampleSize / 6);
  const blockerPenalty = angle.blockers.length * 6;
  return actionBoost + angle.signalScore * 0.45 + angle.stabilityScore * 0.2 + roiBoost + sampleBoost - blockerPenalty;
}

function buildGame(row: MlbTrendBoardRow, historicalRows: MlbTrendHistoricalRow[]): MlbTeamGameTrendMatrixGame {
  const definitions = [
    teamDefinition({ row, side: "away", market: "moneyline", variant: "role" }),
    teamDefinition({ row, side: "away", market: "moneyline", variant: "price-band" }),
    teamDefinition({ row, side: "away", market: "runline", variant: "role" }),
    teamDefinition({ row, side: "home", market: "moneyline", variant: "role" }),
    teamDefinition({ row, side: "home", market: "moneyline", variant: "price-band" }),
    teamDefinition({ row, side: "home", market: "runline", variant: "role" })
  ].filter((definition): definition is MlbTrendDefinition => Boolean(definition));

  const teamAngles = definitions.map((definition) => {
    const isHome = definition.conditions.some((condition) => condition.field === "subject_is_home");
    return buildAngle({
      definition,
      historicalRows,
      boardRow: row,
      side: isHome ? "home" : "away",
      teamName: isHome ? row.homeTeamName : row.awayTeamName,
      opponentName: isHome ? row.awayTeamName : row.homeTeamName,
      market: definition.family === "RUNLINE" ? "runline" : "moneyline"
    });
  });

  const totalAngles = [totalDefinition(row, "over"), totalDefinition(row, "under")]
    .filter((definition): definition is MlbTrendDefinition => Boolean(definition))
    .map((definition) => buildAngle({
      definition,
      historicalRows,
      boardRow: row,
      side: "game",
      teamName: null,
      opponentName: null,
      market: "total"
    }));

  const allAngles = [...teamAngles, ...totalAngles].sort((left, right) => angleRank(right) - angleRank(left));
  const topAngles = allAngles.slice(0, 5);

  return {
    gameId: row.gameId,
    matchup: row.matchup || `${row.awayTeamName} @ ${row.homeTeamName}`,
    startsAt: row.startsAt ?? null,
    homeTeamName: row.homeTeamName,
    awayTeamName: row.awayTeamName,
    source: row.source ?? null,
    depthScore: Math.round(Math.max(0, Math.min(100, topAngles.reduce((sum, angle) => sum + angleRank(angle), 0) / Math.max(1, topAngles.length)))),
    trendCount: allAngles.length,
    actionableCount: allAngles.filter((angle) => angle.action === "ACTIONABLE").length,
    watchCount: allAngles.filter((angle) => angle.action === "WATCH").length,
    blockedCount: allAngles.filter((angle) => angle.action === "BLOCKED").length,
    teamAngles,
    totalAngles,
    topAngles
  };
}

function buildTeamDepthBoard(games: MlbTeamGameTrendMatrixGame[]): MlbTeamDepthRow[] {
  const map = new Map<string, MlbTeamDepthRow>();
  for (const game of games) {
    for (const teamName of [game.awayTeamName, game.homeTeamName]) {
      const teamAngles = game.teamAngles.filter((angle) => angle.teamName === teamName);
      const existing = map.get(teamName) ?? {
        teamName,
        games: 0,
        angles: 0,
        actionable: 0,
        watch: 0,
        topScore: 0,
        bestAngle: null
      };
      existing.games += 1;
      existing.angles += teamAngles.length;
      existing.actionable += teamAngles.filter((angle) => angle.action === "ACTIONABLE").length;
      existing.watch += teamAngles.filter((angle) => angle.action === "WATCH").length;
      const best = [...teamAngles].sort((left, right) => angleRank(right) - angleRank(left))[0] ?? null;
      if (best && angleRank(best) > existing.topScore) {
        existing.topScore = Math.round(angleRank(best));
        existing.bestAngle = best.title;
      }
      map.set(teamName, existing);
    }
  }
  return [...map.values()].sort((left, right) => right.actionable - left.actionable || right.topScore - left.topScore || left.teamName.localeCompare(right.teamName));
}

export function buildMlbTeamGameTrendMatrixFromRows(args: {
  historicalRows: MlbTrendHistoricalRow[];
  boardRows: MlbTrendBoardRow[];
  warnings?: string[];
}): MlbTeamGameTrendMatrix {
  const games = args.boardRows.map((row) => buildGame(row, args.historicalRows)).sort((left, right) => right.depthScore - left.depthScore);
  const allAngles = games.flatMap((game) => [...game.teamAngles, ...game.totalAngles]);

  return {
    generatedAt: new Date().toISOString(),
    source: "mlb_team_game_trend_matrix",
    historicalRows: args.historicalRows.length,
    boardRows: args.boardRows.length,
    warnings: args.warnings ?? [],
    games,
    teamDepthBoard: buildTeamDepthBoard(games),
    summary: {
      games: games.length,
      teams: new Set(games.flatMap((game) => [game.awayTeamName, game.homeTeamName])).size,
      angles: allAngles.length,
      actionable: allAngles.filter((angle) => angle.action === "ACTIONABLE").length,
      watch: allAngles.filter((angle) => angle.action === "WATCH").length,
      blocked: allAngles.filter((angle) => angle.action === "BLOCKED").length
    }
  };
}

export async function buildMlbTeamGameTrendMatrix(): Promise<MlbTeamGameTrendMatrix> {
  return buildMlbTeamGameTrendMatrixWithFallback();
}

export async function buildMlbTeamGameTrendMatrixWithFallback(args: {
  fallbackMatches?: FallbackTrendMatch[];
} = {}): Promise<MlbTeamGameTrendMatrix> {
  const [historical, board] = await Promise.all([
    loadNormalizedMlbHistoricalTrendRows(),
    loadNormalizedMlbBoardTrendRows()
  ]);
  const boardRows = mergeFallbackRows(board.rows, args.fallbackMatches);

  return buildMlbTeamGameTrendMatrixFromRows({
    historicalRows: historical.rows,
    boardRows,
    warnings: [
      ...historical.warnings,
      ...board.warnings,
      board.rows.length === 0 && boardRows.length > 0 ? "Current MLB board rows were empty; built game shells from active published trend matches without inventing missing markets." : null
    ].filter((warning): warning is string => Boolean(warning))
  });
}
