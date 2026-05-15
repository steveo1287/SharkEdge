import { prisma } from "@/lib/db/prisma";

export type UfcSettledLedgerRow = {
  id: string;
  fightId: string;
  predictionId: string | null;
  modelVersion: string;
  recordedAt: string;
  eventLabel: string;
  eventDate: string | null;
  fightDate: string | null;
  fighterAName: string | null;
  fighterBName: string | null;
  pickName: string | null;
  actualWinnerName: string | null;
  pickFighterId: string | null;
  actualWinnerFighterId: string | null;
  fighterAWinProbability: number;
  fighterBWinProbability: number;
  pickProbability: number | null;
  resultCorrect: boolean | null;
  status: string;
  dataQualityGrade: string | null;
  confidenceGrade: string | null;
  closingLineValuePct: number | null;
  marketOddsAOpen: number | null;
  marketOddsBOpen: number | null;
  marketOddsAClose: number | null;
  marketOddsBClose: number | null;
  brier: number | null;
  shouldHavePassed: boolean;
  passReason: string | null;
};

export type UfcCalibrationSnapshotSummary = {
  id: string;
  modelVersion: string;
  snapshotLabel: string;
  generatedAt: string;
  fightCount: number;
  accuracyPct: number | null;
  logLoss: number | null;
  brierScore: number | null;
  calibrationError: number | null;
  avgClvPct: number | null;
};

export type UfcSettledLedgerSummary = {
  ok: boolean;
  generatedAt: string;
  modelVersion: string;
  predictionCount: number;
  settledCount: number;
  pendingCount: number;
  winCount: number;
  lossCount: number;
  accuracyPct: number | null;
  avgBrier: number | null;
  avgClvPct: number | null;
  actualWinnerCoveragePct: number | null;
  clvCoveragePct: number | null;
  shouldHavePassedCount: number;
  dataQualityBreakdown: Record<string, number>;
  confidenceBreakdown: Record<string, number>;
  statusBreakdown: Record<string, number>;
  latestCalibration: UfcCalibrationSnapshotSummary | null;
  rows: UfcSettledLedgerRow[];
  warnings: string[];
};

type ShadowLedgerRaw = {
  id: string;
  fight_id: string;
  prediction_id: string | null;
  model_version: string;
  recorded_at: Date | string;
  event_label: string | null;
  event_name: string | null;
  event_date: Date | string | null;
  fight_date: Date | string | null;
  fighter_a_id: string | null;
  fighter_b_id: string | null;
  fighter_a_name: string | null;
  fighter_b_name: string | null;
  pick_fighter_id: string | null;
  pick_name: string | null;
  actual_winner_fighter_id: string | null;
  actual_winner_name: string | null;
  fighter_a_win_probability: number;
  fighter_b_win_probability: number;
  result_correct: boolean | null;
  status: string;
  data_quality_grade: string | null;
  confidence_grade: string | null;
  closing_line_value_pct: number | null;
  market_odds_a_open: number | null;
  market_odds_b_open: number | null;
  market_odds_a_close: number | null;
  market_odds_b_close: number | null;
};

type CalibrationRaw = {
  id: string;
  model_version: string;
  snapshot_label: string;
  generated_at: Date | string;
  fight_count: number;
  accuracy_pct: number | null;
  log_loss: number | null;
  brier_score: number | null;
  calibration_error: number | null;
  avg_clv_pct: number | null;
};

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function inc(map: Record<string, number>, key: string | null | undefined) {
  const safe = key || "unknown";
  map[safe] = (map[safe] ?? 0) + 1;
}

function avg(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!present.length) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

function pickProbability(row: ShadowLedgerRaw) {
  if (!row.pick_fighter_id) return null;
  if (row.pick_fighter_id === row.fighter_a_id) return row.fighter_a_win_probability;
  if (row.pick_fighter_id === row.fighter_b_id) return row.fighter_b_win_probability;
  return Math.max(row.fighter_a_win_probability, row.fighter_b_win_probability);
}

function brier(row: ShadowLedgerRaw) {
  if (!row.actual_winner_fighter_id || !row.fighter_a_id) return null;
  const actualA = row.actual_winner_fighter_id === row.fighter_a_id ? 1 : 0;
  return (row.fighter_a_win_probability - actualA) ** 2;
}

function shouldHavePassed(row: ShadowLedgerRaw) {
  if (row.status !== "RESOLVED" && row.status !== "SETTLED") return false;
  if (row.data_quality_grade === "D" || row.confidence_grade === "LOW") return true;
  const probability = pickProbability(row);
  if (probability != null && probability < 0.56) return true;
  return false;
}

function passReason(row: ShadowLedgerRaw) {
  if (row.data_quality_grade === "D") return "Data quality D";
  if (row.confidence_grade === "LOW") return "Low confidence";
  const probability = pickProbability(row);
  if (probability != null && probability < 0.56) return "Pick probability under 56%";
  return null;
}

function mapRow(row: ShadowLedgerRaw): UfcSettledLedgerRow {
  return {
    id: row.id,
    fightId: row.fight_id,
    predictionId: row.prediction_id,
    modelVersion: row.model_version,
    recordedAt: toIso(row.recorded_at) ?? new Date().toISOString(),
    eventLabel: row.event_name ?? row.event_label ?? "UFC Fight",
    eventDate: toIso(row.event_date),
    fightDate: toIso(row.fight_date),
    fighterAName: row.fighter_a_name,
    fighterBName: row.fighter_b_name,
    pickName: row.pick_name,
    actualWinnerName: row.actual_winner_name,
    pickFighterId: row.pick_fighter_id,
    actualWinnerFighterId: row.actual_winner_fighter_id,
    fighterAWinProbability: row.fighter_a_win_probability,
    fighterBWinProbability: row.fighter_b_win_probability,
    pickProbability: pickProbability(row),
    resultCorrect: row.result_correct,
    status: row.status,
    dataQualityGrade: row.data_quality_grade,
    confidenceGrade: row.confidence_grade,
    closingLineValuePct: row.closing_line_value_pct,
    marketOddsAOpen: row.market_odds_a_open,
    marketOddsBOpen: row.market_odds_b_open,
    marketOddsAClose: row.market_odds_a_close,
    marketOddsBClose: row.market_odds_b_close,
    brier: brier(row),
    shouldHavePassed: shouldHavePassed(row),
    passReason: passReason(row)
  };
}

function mapCalibration(row: CalibrationRaw | undefined): UfcCalibrationSnapshotSummary | null {
  if (!row) return null;
  return {
    id: row.id,
    modelVersion: row.model_version,
    snapshotLabel: row.snapshot_label,
    generatedAt: toIso(row.generated_at) ?? new Date().toISOString(),
    fightCount: row.fight_count,
    accuracyPct: row.accuracy_pct,
    logLoss: row.log_loss,
    brierScore: row.brier_score,
    calibrationError: row.calibration_error,
    avgClvPct: row.avg_clv_pct
  };
}

export async function getUfcSettledLedger(options: { modelVersion?: string; limit?: number } = {}): Promise<UfcSettledLedgerSummary> {
  const modelVersion = options.modelVersion ?? "ufc-fight-iq-v1";
  const limit = Math.max(1, Math.min(250, Math.floor(options.limit ?? 100)));
  const generatedAt = new Date().toISOString();

  try {
    const [rawRows, calibrationRows] = await Promise.all([
      prisma.$queryRaw<ShadowLedgerRaw[]>`
        SELECT
          s.id,
          s.fight_id,
          s.prediction_id,
          s.model_version,
          s.recorded_at,
          f.event_label,
          e.event_name,
          e.event_date,
          f.fight_date,
          f.fighter_a_id,
          f.fighter_b_id,
          fa.full_name AS fighter_a_name,
          fb.full_name AS fighter_b_name,
          s.pick_fighter_id,
          pick.full_name AS pick_name,
          s.actual_winner_fighter_id,
          winner.full_name AS actual_winner_name,
          s.fighter_a_win_probability,
          s.fighter_b_win_probability,
          s.result_correct,
          s.status,
          s.data_quality_grade,
          s.confidence_grade,
          s.closing_line_value_pct,
          s.market_odds_a_open,
          s.market_odds_b_open,
          s.market_odds_a_close,
          s.market_odds_b_close
        FROM ufc_shadow_predictions s
        LEFT JOIN ufc_fights f ON f.id = s.fight_id
        LEFT JOIN ufc_events e ON e.id = f.event_id
        LEFT JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
        LEFT JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
        LEFT JOIN ufc_fighters pick ON pick.id = s.pick_fighter_id
        LEFT JOIN ufc_fighters winner ON winner.id = s.actual_winner_fighter_id
        WHERE s.model_version = ${modelVersion}
        ORDER BY s.recorded_at DESC
        LIMIT ${limit}
      `,
      prisma.$queryRaw<CalibrationRaw[]>`
        SELECT id, model_version, snapshot_label, generated_at, fight_count, accuracy_pct, log_loss, brier_score, calibration_error, avg_clv_pct
        FROM ufc_calibration_snapshots
        WHERE model_version = ${modelVersion}
        ORDER BY generated_at DESC
        LIMIT 1
      `
    ]);

    const rows = rawRows.map(mapRow);
    const settled = rows.filter((row) => row.status === "RESOLVED" || row.status === "SETTLED" || row.resultCorrect != null);
    const winCount = settled.filter((row) => row.resultCorrect === true).length;
    const lossCount = settled.filter((row) => row.resultCorrect === false).length;
    const dataQualityBreakdown: Record<string, number> = {};
    const confidenceBreakdown: Record<string, number> = {};
    const statusBreakdown: Record<string, number> = {};

    for (const row of rows) {
      inc(dataQualityBreakdown, row.dataQualityGrade);
      inc(confidenceBreakdown, row.confidenceGrade);
      inc(statusBreakdown, row.status);
    }

    const warnings: string[] = [];
    if (!rows.length) warnings.push("No MMA shadow predictions are stored yet.");
    if (!settled.length) warnings.push("No settled MMA predictions yet; Fight Lab remains shadow-only.");
    if (settled.length > 0 && settled.length < 30) warnings.push("Settled MMA sample is still thin; do not market it as proven.");
    if (settled.some((row) => row.closingLineValuePct == null)) warnings.push("Some settled fights are missing CLV data.");
    if (settled.some((row) => row.shouldHavePassed)) warnings.push("Some settled fights would have failed current pass discipline.");

    return {
      ok: true,
      generatedAt,
      modelVersion,
      predictionCount: rows.length,
      settledCount: settled.length,
      pendingCount: rows.length - settled.length,
      winCount,
      lossCount,
      accuracyPct: settled.length ? winCount / settled.length : null,
      avgBrier: avg(settled.map((row) => row.brier)),
      avgClvPct: avg(settled.map((row) => row.closingLineValuePct)),
      actualWinnerCoveragePct: rows.length ? rows.filter((row) => row.actualWinnerFighterId).length / rows.length : null,
      clvCoveragePct: settled.length ? settled.filter((row) => row.closingLineValuePct != null).length / settled.length : null,
      shouldHavePassedCount: settled.filter((row) => row.shouldHavePassed).length,
      dataQualityBreakdown,
      confidenceBreakdown,
      statusBreakdown,
      latestCalibration: mapCalibration(calibrationRows[0]),
      rows,
      warnings
    };
  } catch (error) {
    return {
      ok: false,
      generatedAt,
      modelVersion,
      predictionCount: 0,
      settledCount: 0,
      pendingCount: 0,
      winCount: 0,
      lossCount: 0,
      accuracyPct: null,
      avgBrier: null,
      avgClvPct: null,
      actualWinnerCoveragePct: null,
      clvCoveragePct: null,
      shouldHavePassedCount: 0,
      dataQualityBreakdown: {},
      confidenceBreakdown: {},
      statusBreakdown: {},
      latestCalibration: null,
      rows: [],
      warnings: [error instanceof Error ? error.message : String(error)]
    };
  }
}
