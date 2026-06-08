import type { CachedSimGameProjection, SimBoardSnapshot, SimMarketSnapshot } from "@/services/simulation/sim-snapshot-service";
import type { MlbDailySimPickBoard } from "@/services/simulation/mlb-sim-pick-selector";

export type MlbReadinessLevel = "READY" | "WATCH" | "WEAK" | "BLOCKED";

export type MlbReadinessComponent = {
  key: "schedule" | "projections" | "market" | "playerModel" | "calibration" | "pickBoard" | "freshness";
  label: string;
  score: number;
  level: MlbReadinessLevel;
  detail: string;
  missing: string[];
};

export type MlbDataReadinessReport = {
  modelVersion: "mlb-data-readiness-v1";
  generatedAt: string;
  score: number;
  level: MlbReadinessLevel;
  components: MlbReadinessComponent[];
  blockers: string[];
  warnings: string[];
  actions: string[];
  summary: {
    gameCount: number;
    projectionCount: number;
    marketLineCount: number;
    matchedMarketGames: number;
    realOrEstimatedPlayerRows: number;
    calibratedRows: number;
    topSimCount: number;
    strongLeanCount: number;
    stale: boolean;
  };
};

type Args = {
  board: SimBoardSnapshot | null;
  market: SimMarketSnapshot | null;
  pickBoard?: MlbDailySimPickBoard | null;
  now?: Date;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function round(value: number) {
  return Math.round(clamp(value, 0, 100));
}

function level(score: number, blockers: string[] = []): MlbReadinessLevel {
  if (blockers.length) return "BLOCKED";
  if (score >= 82) return "READY";
  if (score >= 65) return "WATCH";
  if (score >= 40) return "WEAK";
  return "BLOCKED";
}

function component(key: MlbReadinessComponent["key"], label: string, score: number, detail: string, missing: string[] = []): MlbReadinessComponent {
  const cleanScore = round(score);
  return { key, label, score: cleanScore, level: level(cleanScore), detail, missing };
}

function generatedAgeMinutes(generatedAt: string | null | undefined, now: Date) {
  if (!generatedAt) return null;
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
}

function pct(count: number, total: number) {
  if (total <= 0) return 0;
  return clamp(count / total, 0, 1);
}

function dataSource(row: CachedSimGameProjection) {
  return String((row.projection.mlbIntel as { dataSource?: unknown } | undefined)?.dataSource ?? "").toLowerCase();
}

function isFallback(row: CachedSimGameProjection) {
  return dataSource(row).includes("fallback") || dataSource(row).includes("synthetic-only");
}

function hasUsablePlayerModel(row: CachedSimGameProjection) {
  const source = dataSource(row);
  if (!source || source.includes("fallback")) return false;
  return source.includes("real") || source.includes("estimated") || source.includes("player-model");
}

function hasCalibration(row: CachedSimGameProjection) {
  return row.projection.mlbIntel?.calibration?.ece != null;
}

function marketGameIds(market: SimMarketSnapshot | null) {
  return new Set((market?.edges ?? []).filter((edge) => Boolean(edge.market)).map((edge) => edge.gameId));
}

function sourceStatusWarnings(board: SimBoardSnapshot | null, market: SimMarketSnapshot | null) {
  return [...(board?.warnings ?? []), ...(market?.warnings ?? [])].filter(Boolean);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function buildMlbDataReadinessReport(args: Args): MlbDataReadinessReport {
  const now = args.now ?? new Date();
  const rows = args.board?.games ?? [];
  const gameCount = rows.length;
  const projectionRows = rows.filter((row) => row.projection?.mlbIntel && !isFallback(row));
  const projectionCount = projectionRows.length;
  const playerRows = rows.filter(hasUsablePlayerModel).length;
  const calibratedRows = rows.filter(hasCalibration).length;
  const marketIds = marketGameIds(args.market ?? null);
  const matchedMarketGames = rows.filter((row) => marketIds.has(row.game.id)).length;
  const marketLineCount = args.market?.lineCount ?? 0;
  const topSimCount = args.pickBoard?.summary.officialCount ?? 0;
  const strongLeanCount = args.pickBoard?.summary.qualifiedLeanCount ?? 0;
  const ageMinutes = generatedAgeMinutes(args.board?.generatedAt ?? args.market?.generatedAt, now);
  const stale = Boolean(args.board?.stale || args.market?.stale || (ageMinutes != null && ageMinutes > 180));

  const components: MlbReadinessComponent[] = [
    component(
      "schedule",
      "Schedule",
      gameCount > 0 ? 100 : 0,
      gameCount > 0 ? `${gameCount} MLB games loaded` : "No MLB games loaded",
      gameCount > 0 ? [] : ["Refresh scoreboard/schedule cache"]
    ),
    component(
      "projections",
      "Projections",
      gameCount > 0 ? pct(projectionCount, gameCount) * 100 : 0,
      `${projectionCount}/${gameCount} real model projections`,
      projectionCount === gameCount ? [] : ["Run sim refresh and prevent fallback-only rows from entering board"]
    ),
    component(
      "market",
      "Market context",
      gameCount > 0 ? Math.max(pct(matchedMarketGames, gameCount) * 75, marketLineCount > 0 ? 55 : 0) : 0,
      `${matchedMarketGames}/${gameCount} games matched to market context, ${marketLineCount} lines`,
      marketLineCount > 0 ? [] : ["Run odds refresh / verify MLB odds provider key"]
    ),
    component(
      "playerModel",
      "Player model",
      gameCount > 0 ? pct(playerRows, gameCount) * 100 : 0,
      `${playerRows}/${gameCount} rows have real or estimated player-model source`,
      playerRows === gameCount ? [] : ["Run mlb:daily-roster-ratings and mlb:populate-feed"]
    ),
    component(
      "calibration",
      "Calibration",
      gameCount > 0 ? pct(calibratedRows, gameCount) * 100 : 0,
      `${calibratedRows}/${gameCount} rows have calibration fields`,
      calibratedRows > 0 ? [] : ["Run MLB calibration/backtest refresh jobs"]
    ),
    component(
      "pickBoard",
      "Pick board",
      Math.min(100, topSimCount * 35 + strongLeanCount * 18),
      `${topSimCount} top sim, ${strongLeanCount} strong/lean picks`,
      topSimCount + strongLeanCount > 0 ? [] : ["Refresh sim board after projection and market caches are healthy"]
    ),
    component(
      "freshness",
      "Freshness",
      ageMinutes == null ? 0 : ageMinutes <= 45 ? 100 : ageMinutes <= 90 ? 82 : ageMinutes <= 180 ? 62 : 30,
      ageMinutes == null ? "No generated timestamp" : `${ageMinutes} minutes old`,
      !stale ? [] : ["Refresh full sim snapshots"]
    )
  ];

  const blockers: string[] = [];
  if (gameCount === 0) blockers.push("No MLB games loaded");
  if (projectionCount === 0) blockers.push("No usable MLB model projections");

  const weightedScore = round(
    components.find((c) => c.key === "schedule")!.score * 0.12 +
    components.find((c) => c.key === "projections")!.score * 0.24 +
    components.find((c) => c.key === "market")!.score * 0.14 +
    components.find((c) => c.key === "playerModel")!.score * 0.18 +
    components.find((c) => c.key === "calibration")!.score * 0.12 +
    components.find((c) => c.key === "pickBoard")!.score * 0.10 +
    components.find((c) => c.key === "freshness")!.score * 0.10
  );

  const actions = unique(components.flatMap((c) => c.missing));
  const warnings = unique(sourceStatusWarnings(args.board ?? null, args.market ?? null));

  return {
    modelVersion: "mlb-data-readiness-v1",
    generatedAt: now.toISOString(),
    score: weightedScore,
    level: level(weightedScore, blockers),
    components,
    blockers,
    warnings,
    actions,
    summary: {
      gameCount,
      projectionCount,
      marketLineCount,
      matchedMarketGames,
      realOrEstimatedPlayerRows: playerRows,
      calibratedRows,
      topSimCount,
      strongLeanCount,
      stale
    }
  };
}
