import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { getUfcSettledLedger } from "@/services/ufc/settled-ledger";

export type AccuracyWindowKey = "weekly" | "biweekly" | "monthly" | "allTime";
export type AccuracySegmentKey = "topPlays" | "everyPick";
export type AccuracyBetResult = "WIN" | "LOSS" | "PUSH" | "PENDING";

export type AccuracyRecord = {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  graded: number;
  winRate: number | null;
  units: number | null;
  roi: number | null;
  avgOddsAmerican: number | null;
  actualOddsCount: number;
  fallbackOddsCount: number;
  sampleWarning: string | null;
};

export type AccuracyWindowSummary = {
  key: AccuracyWindowKey;
  label: string;
  days: number | null;
  topPlays: AccuracyRecord;
  everyPick: AccuracyRecord;
};

export type AccuracyDashboardPick = {
  id: string;
  league: "MLB" | "MMA";
  market: "moneyline" | "total" | "fight_winner";
  label: string;
  side: string;
  result: AccuracyBetResult;
  oddsAmerican: number | null;
  predictionTime: string;
  settledAt: string | null;
  isTopPlay: boolean;
};

export type AccuracyDashboard = {
  ok: boolean;
  generatedAt: string;
  databaseReady: boolean;
  windows: AccuracyWindowSummary[];
  recentTopPlays: AccuracyDashboardPick[];
  recentEveryPick: AccuracyDashboardPick[];
  warnings: string[];
  error?: string;
};

type MlbSnapshotRow = {
  id: string;
  game_id: string;
  event_label: string | null;
  captured_at: Date | string;
  model_home_win_pct: number | string | null;
  model_away_win_pct: number | string | null;
  model_total: number | string | null;
  market_total: number | string | null;
  final_home_score: number | string | null;
  final_away_score: number | string | null;
  home_won: boolean | null;
  prediction_json: unknown;
  graded_at: Date | string | null;
};

const WINDOW_DEFS: Array<{ key: AccuracyWindowKey; label: string; days: number | null }> = [
  { key: "weekly", label: "Weekly", days: 7 },
  { key: "biweekly", label: "Bi-weekly", days: 14 },
  { key: "monthly", label: "Monthly", days: 30 },
  { key: "allTime", label: "All time", days: null }
];

const JUICE_PAYOUT = 100 / 110;
const TOP_ACTIONS = new Set(["ATTACK", "PLAY"]);

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function round(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function toIso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseJson(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function get(source: unknown, path: string) {
  let current: unknown = source;
  for (const part of path.split(".")) {
    const object = recordValue(current);
    if (!object) return undefined;
    current = object[part];
  }
  return current;
}

function americanOdds(value: unknown) {
  const odds = numberValue(value);
  if (odds == null || odds === 0) return null;
  if (Math.abs(odds) < 100 || Math.abs(odds) > 10000) return null;
  return Math.round(odds);
}

const HOME_ODDS_PATHS = ["homeMoneyline", "homeAmericanOdds", "homeOddsAmerican", "homeOdds", "currentHomeOdds", "bestHomeOddsAmerican", "moneyline.home", "moneyline.homeOdds", "moneyline.homeMoneyline", "markets.moneyline.home", "markets.moneyline.homeOdds", "home.price", "home.odds", "home.americanOdds"];
const AWAY_ODDS_PATHS = ["awayMoneyline", "awayAmericanOdds", "awayOddsAmerican", "awayOdds", "currentAwayOdds", "bestAwayOddsAmerican", "moneyline.away", "moneyline.awayOdds", "moneyline.awayMoneyline", "markets.moneyline.away", "markets.moneyline.awayOdds", "away.price", "away.odds", "away.americanOdds"];

function firstOdds(source: unknown, paths: string[]) {
  for (const path of paths) {
    const odds = americanOdds(get(source, path));
    if (odds != null) return odds;
  }
  return null;
}

function selectedMoneylineOdds(payload: unknown, side: "HOME" | "AWAY") {
  const object = recordValue(payload);
  if (!object) return null;
  const candidates = [object.market, get(object, "mlbIntel.market"), get(object, "realityIntel.market"), object.topSignal, object.sportsbook ? object : null].filter(Boolean);
  const paths = side === "HOME" ? HOME_ODDS_PATHS : AWAY_ODDS_PATHS;
  for (const candidate of candidates) {
    const odds = firstOdds(candidate, paths);
    if (odds != null) return odds;
  }
  return null;
}

function selectedTotalOdds(payload: unknown, side: "OVER" | "UNDER") {
  const path = side === "OVER" ? "topSignal.takeAction.totalProbability.over.americanOdds" : "topSignal.takeAction.totalProbability.under.americanOdds";
  return americanOdds(get(payload, path));
}

function topAction(payload: unknown) {
  return String(get(payload, "topSignal.takeAction.action") ?? get(payload, "topSignal.action") ?? get(payload, "action") ?? "").toUpperCase();
}

function topMarket(payload: unknown) {
  return String(get(payload, "topSignal.market") ?? "").toLowerCase();
}

function isTopPlayPayload(payload: unknown) {
  const action = topAction(payload);
  const roiEligible = get(payload, "topSignal.takeAction.roiEligible");
  return TOP_ACTIONS.has(action) && (roiEligible == null || roiEligible === true);
}

function profitFor(result: AccuracyBetResult, oddsAmerican: number | null) {
  if (result === "LOSS") return -1;
  if (result === "PUSH") return 0;
  if (result !== "WIN") return null;
  if (oddsAmerican == null) return JUICE_PAYOUT;
  return oddsAmerican > 0 ? oddsAmerican / 100 : 100 / Math.abs(oddsAmerican);
}

function moneylinePick(row: MlbSnapshotRow, side: "HOME" | "AWAY", isTopPlay: boolean, idSuffix: string): AccuracyDashboardPick {
  const finalHome = numberValue(row.final_home_score);
  const finalAway = numberValue(row.final_away_score);
  const predictionTime = toIso(row.captured_at) ?? new Date().toISOString();
  const payload = parseJson(row.prediction_json);
  let result: AccuracyBetResult = "PENDING";

  if (row.graded_at && finalHome != null && finalAway != null && row.home_won != null) {
    result = finalHome === finalAway ? "PUSH" : (side === "HOME") === row.home_won ? "WIN" : "LOSS";
  }

  return {
    id: `${row.id}:${idSuffix}`,
    league: "MLB",
    market: "moneyline",
    label: row.event_label ?? row.game_id,
    side,
    result,
    oddsAmerican: selectedMoneylineOdds(payload, side),
    predictionTime,
    settledAt: toIso(row.graded_at),
    isTopPlay
  };
}

function totalPick(row: MlbSnapshotRow, side: "OVER" | "UNDER", isTopPlay: boolean, idSuffix: string): AccuracyDashboardPick | null {
  const finalHome = numberValue(row.final_home_score);
  const finalAway = numberValue(row.final_away_score);
  const marketTotal = numberValue(row.market_total);
  const predictionTime = toIso(row.captured_at) ?? new Date().toISOString();
  const payload = parseJson(row.prediction_json);
  if (marketTotal == null) return null;

  let result: AccuracyBetResult = "PENDING";
  if (row.graded_at && finalHome != null && finalAway != null) {
    const actualTotal = finalHome + finalAway;
    result = actualTotal === marketTotal ? "PUSH" : side === "OVER" ? actualTotal > marketTotal ? "WIN" : "LOSS" : actualTotal < marketTotal ? "WIN" : "LOSS";
  }

  return {
    id: `${row.id}:${idSuffix}`,
    league: "MLB",
    market: "total",
    label: row.event_label ?? row.game_id,
    side,
    result,
    oddsAmerican: selectedTotalOdds(payload, side),
    predictionTime,
    settledAt: toIso(row.graded_at),
    isTopPlay
  };
}

function mlbPicksFromRow(row: MlbSnapshotRow): AccuracyDashboardPick[] {
  const picks: AccuracyDashboardPick[] = [];
  const payload = parseJson(row.prediction_json);
  const homePct = numberValue(row.model_home_win_pct);
  const awayPct = numberValue(row.model_away_win_pct);
  const modelTotal = numberValue(row.model_total);
  const marketTotal = numberValue(row.market_total);
  const actionMarket = topMarket(payload);
  const isTop = isTopPlayPayload(payload);

  if (homePct != null || awayPct != null) {
    const everySide = (homePct ?? 0) >= (awayPct ?? 0) ? "HOME" : "AWAY";
    picks.push(moneylinePick(row, everySide, false, "every-ml"));
  }

  if (modelTotal != null && marketTotal != null && Math.abs(modelTotal - marketTotal) >= 0.01) {
    const everyTotalSide = modelTotal > marketTotal ? "OVER" : "UNDER";
    const everyTotal = totalPick(row, everyTotalSide, false, "every-total");
    if (everyTotal) picks.push(everyTotal);
  }

  if (isTop && (actionMarket === "home_ml" || actionMarket === "away_ml")) {
    picks.push(moneylinePick(row, actionMarket === "home_ml" ? "HOME" : "AWAY", true, "top-ml"));
  }

  if (isTop && (actionMarket === "over" || actionMarket === "under")) {
    const topTotal = totalPick(row, actionMarket === "over" ? "OVER" : "UNDER", true, "top-total");
    if (topTotal) picks.push(topTotal);
  }

  return picks;
}

function summaryFor(picks: AccuracyDashboardPick[]): AccuracyRecord {
  const wins = picks.filter((pick) => pick.result === "WIN").length;
  const losses = picks.filter((pick) => pick.result === "LOSS").length;
  const pushes = picks.filter((pick) => pick.result === "PUSH").length;
  const pending = picks.filter((pick) => pick.result === "PENDING").length;
  const graded = wins + losses + pushes;
  const settledRisked = picks.filter((pick) => pick.result === "WIN" || pick.result === "LOSS" || pick.result === "PUSH");
  const profits = settledRisked.map((pick) => profitFor(pick.result, pick.oddsAmerican)).filter((value): value is number => value != null);
  const units = profits.length ? profits.reduce((sum, value) => sum + value, 0) : null;
  const actualOdds = settledRisked.filter((pick) => pick.oddsAmerican != null).map((pick) => pick.oddsAmerican as number);
  const fallbackOddsCount = settledRisked.length - actualOdds.length;
  const decisions = wins + losses;

  return {
    wins,
    losses,
    pushes,
    pending,
    graded,
    winRate: decisions ? round(wins / decisions, 3) : null,
    units: round(units, 2),
    roi: graded && units != null ? round((units / graded) * 100, 1) : null,
    avgOddsAmerican: actualOdds.length ? round(actualOdds.reduce((sum, value) => sum + value, 0) / actualOdds.length, 0) : null,
    actualOddsCount: actualOdds.length,
    fallbackOddsCount,
    sampleWarning: graded < 10 ? "Tiny sample" : graded < 30 ? "Small sample" : null
  };
}

function pickTime(pick: AccuracyDashboardPick) {
  const value = new Date(pick.predictionTime).getTime();
  return Number.isFinite(value) ? value : 0;
}

function filterWindow(picks: AccuracyDashboardPick[], days: number | null) {
  if (!days) return picks;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return picks.filter((pick) => pickTime(pick) >= cutoff);
}

function emptyRecord(): AccuracyRecord {
  return summaryFor([]);
}

function emptyDashboard(databaseReady: boolean, error?: string): AccuracyDashboard {
  return {
    ok: databaseReady,
    generatedAt: new Date().toISOString(),
    databaseReady,
    windows: WINDOW_DEFS.map((window) => ({ ...window, topPlays: emptyRecord(), everyPick: emptyRecord() })),
    recentTopPlays: [],
    recentEveryPick: [],
    warnings: error ? [error] : [],
    error
  };
}

function ufcPicks(rows: Awaited<ReturnType<typeof getUfcSettledLedger>>["rows"]): AccuracyDashboardPick[] {
  return rows
    .filter((row) => row.pickName)
    .map((row) => {
      const predictionTime = row.recordedAt;
      const result: AccuracyBetResult = row.resultCorrect === true ? "WIN" : row.resultCorrect === false ? "LOSS" : "PENDING";
      const topQuality = ["A", "B"].includes(String(row.dataQualityGrade ?? "").toUpperCase());
      const topConfidence = ["HIGH", "ELITE", "A"].includes(String(row.confidenceGrade ?? "").toUpperCase());
      const probability = typeof row.pickProbability === "number" ? row.pickProbability : 0;
      return {
        id: `mma:${row.id}`,
        league: "MMA" as const,
        market: "fight_winner" as const,
        label: `${row.fighterAName ?? "Fighter A"} vs ${row.fighterBName ?? "Fighter B"}`,
        side: row.pickName ?? "PICK",
        result,
        oddsAmerican: row.pickOpenOddsAmerican,
        predictionTime,
        settledAt: row.resultCorrect == null ? null : row.recordedAt,
        isTopPlay: topQuality && topConfidence && probability >= 0.58 && !row.shouldHavePassed
      };
    });
}

export function summarizeAccuracyWindows(picks: AccuracyDashboardPick[]): AccuracyWindowSummary[] {
  return WINDOW_DEFS.map((window) => {
    const scoped = filterWindow(picks, window.days);
    return {
      ...window,
      topPlays: summaryFor(scoped.filter((pick) => pick.isTopPlay)),
      everyPick: summaryFor(scoped)
    };
  });
}

export async function getAccuracyDashboard(): Promise<AccuracyDashboard> {
  if (!hasUsableServerDatabaseUrl()) {
    return emptyDashboard(false, "No usable server database URL is configured.");
  }

  try {
    const [mlbRows, mmaLedger] = await Promise.all([
      prisma.$queryRaw<MlbSnapshotRow[]>`
        SELECT id, game_id, event_label, captured_at,
          model_home_win_pct, model_away_win_pct, model_total, market_total,
          final_home_score, final_away_score, home_won,
          prediction_json, graded_at
        FROM sim_prediction_snapshots
        WHERE UPPER(league) = 'MLB'
        ORDER BY captured_at DESC
        LIMIT 10000;
      `,
      getUfcSettledLedger({ limit: 5000 })
    ]);

    const picks = [...mlbRows.flatMap(mlbPicksFromRow), ...ufcPicks(mmaLedger.rows ?? [])];
    const sorted = picks.sort((left, right) => pickTime(right) - pickTime(left));
    const windows = summarizeAccuracyWindows(sorted);
    const warnings = [
      ...(!mlbRows.length ? ["No MLB prediction snapshots are stored yet."] : []),
      ...mmaLedger.warnings.map((warning) => `MMA: ${warning}`),
      ...(((windows.find((window) => window.key === "allTime")?.topPlays.graded ?? 0) < 30) ? ["Top-play sample is still small. Treat ROI as directional, not proof."] : [])
    ];

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      databaseReady: true,
      windows,
      recentTopPlays: sorted.filter((pick) => pick.isTopPlay).slice(0, 12),
      recentEveryPick: sorted.slice(0, 12),
      warnings
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[accuracy-dashboard] query failed", error);
    return emptyDashboard(false, message);
  }
}
