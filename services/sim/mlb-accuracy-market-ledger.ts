import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

export type MlbAuditMarket = "MONEYLINE" | "FULL_TOTAL" | "F5_MONEYLINE" | "NRFI_YRFI";
export type MlbAuditResult = "WIN" | "LOSS" | "PUSH" | "PENDING";

type DateRange = { start: Date; end: Date; label: string; mode: "date" | "window" };

type SnapshotRow = {
  id: string;
  game_id: string;
  event_label: string | null;
  away_team: string | null;
  home_team: string | null;
  start_time: Date | string | null;
  captured_at: Date | string;
  model_version: string | null;
  data_source: string | null;
  tier: string | null;
  no_bet: boolean | null;
  confidence: number | string | null;
  model_home_win_pct: number | string | null;
  model_away_win_pct: number | string | null;
  model_total: number | string | null;
  market_total: number | string | null;
  final_home_score: number | string | null;
  final_away_score: number | string | null;
  home_won: boolean | null;
  prediction_json: unknown;
  result_json: unknown;
  graded_at: Date | string | null;
};

export type MlbMarketAuditRow = {
  id: string;
  snapshotId: string;
  gameId: string;
  eventLabel: string;
  awayTeam: string | null;
  homeTeam: string | null;
  startTime: string | null;
  capturedAt: string;
  modelVersion: string | null;
  market: MlbAuditMarket;
  side: string | null;
  line: number | null;
  modelProbability: number | null;
  modelValue: number | null;
  marketLine: number | null;
  finalHomeScore: number | null;
  finalAwayScore: number | null;
  actualValue: number | null;
  resultBucket: MlbAuditResult;
  settlementStatus: "graded" | "pending_final" | "missing_market_line" | "missing_inning_result" | "missing_projection";
  source: string;
  details: string;
  dataQuality: string[];
};

export type MlbMarketAuditSummary = {
  market: MlbAuditMarket;
  label: string;
  predictionCount: number;
  settledCount: number;
  pendingCount: number;
  winCount: number;
  lossCount: number;
  pushCount: number;
  winRate: number | null;
  statusNote: string;
};

export type MlbMarketAuditLedger = {
  ok: boolean;
  databaseReady: boolean;
  generatedAt: string;
  sourceTable: "sim_prediction_snapshots";
  filters: { date: string | null; windowDays: number; rangeLabel: string };
  dateNavigation: { selectedDate: string; previousDate: string; nextDate: string; today: string };
  summaries: MlbMarketAuditSummary[];
  rows: MlbMarketAuditRow[];
  warnings: string[];
  error?: string;
};

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function round(value: number | null | undefined, digits = 3) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function iso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseJson(value: unknown) {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayValue(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(record(item))) : [];
}

function get(source: unknown, path: string) {
  let current: unknown = source;
  for (const part of path.split(".")) {
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[Number(part)];
      continue;
    }
    const object = record(current);
    if (!object) return undefined;
    current = object[part];
  }
  return current;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateRange(dateValue: string | null | undefined, windowDays: number): DateRange {
  const trimmed = dateValue?.trim();
  if (trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const start = new Date(`${trimmed}T00:00:00.000Z`);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      return { start, end, label: trimmed, mode: "date" };
    }
  }
  const days = Math.max(1, Math.min(3650, Math.round(windowDays || 30)));
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end, label: `${days}D`, mode: "window" };
}

function dateNavigation(dateValue: string | null | undefined) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue ?? ""))
    ? new Date(`${dateValue}T00:00:00.000Z`)
    : new Date();
  const selectedDate = dayKey(base);
  const previousDate = dayKey(new Date(base.getTime() - 24 * 60 * 60 * 1000));
  const nextDate = dayKey(new Date(base.getTime() + 24 * 60 * 60 * 1000));
  return { selectedDate, previousDate, nextDate, today: dayKey(new Date()) };
}

function inningProjection(prediction: unknown) {
  return record(get(prediction, "mlbIntel.inningProjection"))
    ?? record(get(prediction, "mlbIntel.playerImpact.inningProjection"))
    ?? record(get(prediction, "mlbIntel.firstFive"))
    ?? null;
}

function firstInningRuns(result: unknown) {
  const direct = numberValue(get(result, "firstInningRuns"));
  if (direct != null) return direct;
  const away = numberValue(get(result, "firstInningAwayRuns")) ?? numberValue(get(result, "inning1AwayRuns"));
  const home = numberValue(get(result, "firstInningHomeRuns")) ?? numberValue(get(result, "inning1HomeRuns"));
  if (away != null && home != null) return away + home;
  const innings = arrayValue(get(result, "innings"));
  const first = innings.find((row) => numberValue(row.inning) === 1) ?? innings[0];
  if (!first) return null;
  const firstAway = numberValue(first.awayRuns ?? first.away ?? first.awayScore);
  const firstHome = numberValue(first.homeRuns ?? first.home ?? first.homeScore);
  return firstAway != null && firstHome != null ? firstAway + firstHome : null;
}

function firstFiveScore(result: unknown) {
  const away = numberValue(get(result, "firstFiveAwayRuns")) ?? numberValue(get(result, "f5AwayRuns"));
  const home = numberValue(get(result, "firstFiveHomeRuns")) ?? numberValue(get(result, "f5HomeRuns"));
  if (away != null && home != null) return { away, home, total: away + home };
  const innings = arrayValue(get(result, "innings"));
  if (innings.length >= 5) {
    const firstFive = innings.slice(0, 5);
    const summed = firstFive.reduce<{ away: number; home: number }>((acc, inning) => {
      const awayRuns = numberValue(inning.awayRuns ?? inning.away ?? inning.awayScore) ?? 0;
      const homeRuns = numberValue(inning.homeRuns ?? inning.home ?? inning.homeScore) ?? 0;
      return { away: acc.away + awayRuns, home: acc.home + homeRuns };
    }, { away: 0, home: 0 });
    return { ...summed, total: summed.away + summed.home };
  }
  return null;
}

function resultForSide(side: string | null, homeWon: boolean | null, finalHome: number | null, finalAway: number | null): MlbAuditResult {
  if (!side || homeWon == null || finalHome == null || finalAway == null) return "PENDING";
  if (finalHome === finalAway) return "PUSH";
  return (side === "HOME") === homeWon ? "WIN" : "LOSS";
}

function resultForTotal(side: string | null, actualTotal: number | null, line: number | null): MlbAuditResult {
  if (!side || actualTotal == null || line == null) return "PENDING";
  if (actualTotal === line) return "PUSH";
  if (side === "OVER") return actualTotal > line ? "WIN" : "LOSS";
  if (side === "UNDER") return actualTotal < line ? "WIN" : "LOSS";
  return "PENDING";
}

function resultForF5(side: string | null, score: { home: number; away: number } | null): MlbAuditResult {
  if (!side || !score) return "PENDING";
  if (score.home === score.away) return "PUSH";
  return (side === "HOME") === (score.home > score.away) ? "WIN" : "LOSS";
}

function resultForNrfi(side: string | null, actualFirstInningRuns: number | null): MlbAuditResult {
  if (!side || actualFirstInningRuns == null) return "PENDING";
  const noRun = actualFirstInningRuns === 0;
  return (side === "NRFI") === noRun ? "WIN" : "LOSS";
}

function trackedMarket(prediction: unknown, key: string) {
  return arrayValue(get(prediction, "trackedMarkets")).find((row) => String(row.market ?? "").toUpperCase() === key) ?? null;
}

function baseDataQuality(row: SnapshotRow) {
  const flags = [row.tier ? `tier=${row.tier}` : "tier=unknown"];
  if (row.no_bet) flags.push("governor=no-bet");
  const confidence = numberValue(row.confidence);
  if (confidence != null) flags.push(`confidence=${round(confidence, 3)}`);
  if (row.data_source) flags.push(`source=${row.data_source}`);
  return flags;
}

function mapSnapshotToAuditRows(row: SnapshotRow): MlbMarketAuditRow[] {
  const prediction = parseJson(row.prediction_json);
  const result = parseJson(row.result_json);
  const projection = inningProjection(prediction);
  const f5Score = firstFiveScore(result);
  const firstRuns = firstInningRuns(result);
  const finalHome = numberValue(row.final_home_score);
  const finalAway = numberValue(row.final_away_score);
  const finalTotal = finalHome != null && finalAway != null ? finalHome + finalAway : null;
  const graded = Boolean(row.graded_at);
  const modelHomeWin = numberValue(row.model_home_win_pct);
  const modelAwayWin = numberValue(row.model_away_win_pct);
  const modelTotal = numberValue(row.model_total);
  const marketTotal = numberValue(row.market_total);
  const quality = baseDataQuality(row);
  const eventLabel = row.event_label ?? row.game_id;
  const capturedAt = iso(row.captured_at) ?? new Date().toISOString();
  const startTime = iso(row.start_time);
  const common = {
    snapshotId: row.id,
    gameId: row.game_id,
    eventLabel,
    awayTeam: row.away_team,
    homeTeam: row.home_team,
    startTime,
    capturedAt,
    modelVersion: row.model_version,
    finalHomeScore: finalHome,
    finalAwayScore: finalAway,
    dataQuality: quality
  };

  const mlSide = (modelHomeWin ?? 0.5) >= (modelAwayWin ?? 0.5) ? "HOME" : "AWAY";
  const mlProb = mlSide === "HOME" ? modelHomeWin : modelAwayWin;
  const totalSide = modelTotal == null || marketTotal == null ? null : modelTotal >= marketTotal ? "OVER" : "UNDER";

  const trackedF5 = trackedMarket(prediction, "F5_MONEYLINE");
  const f5HomeProb = numberValue(trackedF5?.modelProbability) ?? numberValue(get(projection, "firstFiveHomeWinProbability"));
  const f5AwayProb = numberValue(get(projection, "firstFiveAwayWinProbability"));
  const projectedF5Side = f5HomeProb != null && f5AwayProb != null ? (f5HomeProb >= f5AwayProb ? "HOME" : "AWAY") : "";
  const f5Side = String((trackedF5?.side ?? projectedF5Side) || "");
  const f5Prob = f5Side === "HOME" ? f5HomeProb : f5Side === "AWAY" ? f5AwayProb : null;
  const f5Total = numberValue(get(projection, "firstFiveTotalRuns"));

  const trackedNrfi = trackedMarket(prediction, "NRFI_YRFI");
  const nrfiProbability = numberValue(trackedNrfi?.modelProbability) ?? numberValue(get(projection, "nrfiProbability"));
  const yrfiProbability = numberValue(get(projection, "yrfiProbability"));
  const projectedNrfiSide = nrfiProbability != null && yrfiProbability != null ? (nrfiProbability >= yrfiProbability ? "NRFI" : "YRFI") : "";
  const nrfiSide = String((trackedNrfi?.side ?? projectedNrfiSide) || "");
  const nrfiProb = nrfiSide === "NRFI" ? nrfiProbability : nrfiSide === "YRFI" ? yrfiProbability : null;

  return [
    {
      id: `${row.id}:moneyline`,
      ...common,
      market: "MONEYLINE",
      side: mlSide,
      line: null,
      modelProbability: round(mlProb),
      modelValue: null,
      marketLine: null,
      actualValue: row.home_won == null ? null : row.home_won ? 1 : 0,
      resultBucket: resultForSide(mlSide, row.home_won, finalHome, finalAway),
      settlementStatus: graded ? "graded" : "pending_final",
      source: "sim_prediction_snapshots.model_home_win_pct/model_away_win_pct",
      details: "Full-game winner from the captured pregame sim snapshot.",
      dataQuality: quality
    },
    {
      id: `${row.id}:full-total`,
      ...common,
      market: "FULL_TOTAL",
      side: totalSide,
      line: marketTotal,
      modelProbability: null,
      modelValue: modelTotal,
      marketLine: marketTotal,
      actualValue: finalTotal,
      resultBucket: resultForTotal(totalSide, finalTotal, marketTotal),
      settlementStatus: !marketTotal ? "missing_market_line" : graded ? "graded" : "pending_final",
      source: "sim_prediction_snapshots.model_total/market_total",
      details: marketTotal == null ? "Model total was captured, but no market total was captured for an official O/U grade." : "Full-game over/under versus the captured market total line.",
      dataQuality: marketTotal == null ? [...quality, "missing market total"] : quality
    },
    {
      id: `${row.id}:f5-moneyline`,
      ...common,
      market: "F5_MONEYLINE",
      side: f5Side || null,
      line: null,
      modelProbability: round(f5Prob),
      modelValue: round(f5Total),
      marketLine: null,
      actualValue: f5Score ? (f5Side === "HOME" ? f5Score.home : f5Side === "AWAY" ? f5Score.away : f5Score.total) : null,
      resultBucket: resultForF5(f5Side || null, f5Score),
      settlementStatus: !projection ? "missing_projection" : !f5Score ? "missing_inning_result" : "graded",
      source: "prediction_json.mlbIntel.playerImpact.inningProjection",
      details: !projection ? "F5 projection was not stored in this snapshot yet." : !f5Score ? "F5 projection exists, but no inning-by-inning result is attached yet." : "F5 winner graded from inning result data.",
      dataQuality: !projection ? [...quality, "missing F5 projection"] : !f5Score ? [...quality, "missing F5 result"] : quality
    },
    {
      id: `${row.id}:nrfi-yrfi`,
      ...common,
      market: "NRFI_YRFI",
      side: nrfiSide || null,
      line: 0,
      modelProbability: round(nrfiProb),
      modelValue: round(numberValue(get(projection, "innings.0.expectedRuns"))),
      marketLine: null,
      actualValue: firstRuns,
      resultBucket: resultForNrfi(nrfiSide || null, firstRuns),
      settlementStatus: !projection ? "missing_projection" : firstRuns == null ? "missing_inning_result" : "graded",
      source: "prediction_json.mlbIntel.playerImpact.inningProjection",
      details: !projection ? "NRFI/YRFI projection was not stored in this snapshot yet." : firstRuns == null ? "NRFI/YRFI projection exists, but first-inning result data is not attached yet." : "NRFI/YRFI graded from first-inning result data.",
      dataQuality: !projection ? [...quality, "missing NRFI projection"] : firstRuns == null ? [...quality, "missing 1st inning result"] : quality
    }
  ];
}

function marketLabel(market: MlbAuditMarket) {
  switch (market) {
    case "MONEYLINE": return "Moneyline";
    case "FULL_TOTAL": return "Over / Under";
    case "F5_MONEYLINE": return "First 5";
    case "NRFI_YRFI": return "NRFI / YRFI";
  }
}

function summarize(rows: MlbMarketAuditRow[], market: MlbAuditMarket): MlbMarketAuditSummary {
  const group = rows.filter((row) => row.market === market);
  const settled = group.filter((row) => row.resultBucket === "WIN" || row.resultBucket === "LOSS" || row.resultBucket === "PUSH");
  const winCount = settled.filter((row) => row.resultBucket === "WIN").length;
  const lossCount = settled.filter((row) => row.resultBucket === "LOSS").length;
  const pushCount = settled.filter((row) => row.resultBucket === "PUSH").length;
  const decisions = winCount + lossCount;
  const missingProjection = group.filter((row) => row.settlementStatus === "missing_projection").length;
  const missingInning = group.filter((row) => row.settlementStatus === "missing_inning_result").length;
  const missingLine = group.filter((row) => row.settlementStatus === "missing_market_line").length;
  const statusNote = missingProjection ? `${missingProjection} missing stored projection` : missingInning ? `${missingInning} missing inning result` : missingLine ? `${missingLine} missing market line` : "gradeable";
  return {
    market,
    label: marketLabel(market),
    predictionCount: group.length,
    settledCount: settled.length,
    pendingCount: Math.max(0, group.length - settled.length),
    winCount,
    lossCount,
    pushCount,
    winRate: decisions > 0 ? round(winCount / decisions, 3) : null,
    statusNote
  };
}

export async function getMlbAccuracyMarketLedger(args: { date?: string | null; windowDays?: number | null; limit?: number | null } = {}): Promise<MlbMarketAuditLedger> {
  const generatedAt = new Date().toISOString();
  const databaseReady = hasUsableServerDatabaseUrl();
  const windowDays = Math.max(1, Math.min(3650, Math.round(args.windowDays ?? 30)));
  const nav = dateNavigation(args.date ?? null);
  const range = parseDateRange(args.date ?? null, windowDays);
  const base = {
    generatedAt,
    sourceTable: "sim_prediction_snapshots" as const,
    filters: { date: args.date ?? null, windowDays, rangeLabel: range.label },
    dateNavigation: nav
  };

  if (!databaseReady) {
    return { ok: false, databaseReady, ...base, summaries: [], rows: [], warnings: [], error: "No usable server database URL is configured." };
  }

  try {
    const rows = await prisma.$queryRaw<SnapshotRow[]>`
      SELECT id, game_id, event_label, away_team, home_team, start_time, captured_at,
        model_version, data_source, tier, no_bet, confidence,
        model_home_win_pct, model_away_win_pct, model_total, market_total,
        final_home_score, final_away_score, home_won,
        prediction_json, result_json, graded_at
      FROM sim_prediction_snapshots
      WHERE UPPER(league) = 'MLB'
        AND COALESCE(start_time, captured_at) >= ${range.start}
        AND COALESCE(start_time, captured_at) < ${range.end}
      ORDER BY COALESCE(start_time, captured_at) DESC, captured_at DESC
      LIMIT ${Math.max(1, Math.min(1000, Math.round(args.limit ?? 250)))};
    `;
    const auditRows = rows.flatMap(mapSnapshotToAuditRows);
    const summaries = (["MONEYLINE", "FULL_TOTAL", "F5_MONEYLINE", "NRFI_YRFI"] as MlbAuditMarket[]).map((market) => summarize(auditRows, market));
    const warnings = [
      "Date and window filters use MLB game start time first, then capture time only when start time is missing.",
      "Moneyline and full-game totals can grade from final score rows.",
      "F5 and NRFI/YRFI require inning-level settlement data; the page marks those rows as missing inning result instead of pretending they are graded.",
      "Older snapshots may not include stored inning projections until the capture job writes playerImpact.inningProjection into prediction_json."
    ];
    return { ok: true, databaseReady, ...base, summaries, rows: auditRows, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, databaseReady, ...base, summaries: [], rows: [], warnings: [], error: `MLB market audit query failed: ${message}` };
  }
}
