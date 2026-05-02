import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { compareModelToMarket } from "@/services/sim/market-benchmark";

export type SimLeague = "NBA" | "MLB" | "NHL" | "NFL" | "NCAAB" | "NCAAF" | string;
export type SimMarket = "moneyline" | "spread" | "total" | "run_line" | "puck_line" | "team_total" | string;
export type ResultBucket = "WIN" | "LOSS" | "PUSH" | "PENDING";

export type DataQualityFlags = {
  grade?: "A" | "B" | "C" | "D" | "F" | string;
  staleData?: boolean;
  lineupConfirmed?: boolean;
  injuryConfirmed?: boolean;
  goalieConfirmed?: boolean;
  starterConfirmed?: boolean;
  weatherConfirmed?: boolean;
  marketFresh?: boolean;
  notes?: string[];
  [key: string]: unknown;
};

export type RecordSimulationPredictionInput = {
  id?: string;
  gameId: string;
  league: SimLeague;
  market: SimMarket;
  modelVersion: string;
  predictionTime?: Date | string;
  eventLabel?: string | null;
  side?: "HOME" | "AWAY" | "OVER" | "UNDER" | string | null;
  modelProbability?: number | null;
  modelSpread?: number | null;
  modelTotal?: number | null;
  marketProbability?: number | null;
  marketSpread?: number | null;
  marketTotal?: number | null;
  closingProbability?: number | null;
  closingSpread?: number | null;
  closingTotal?: number | null;
  dataQualityFlags?: DataQualityFlags | null;
  predictionJson?: Record<string, unknown> | null;
};

export type SettleSimulationPredictionInput = {
  id?: string;
  gameId?: string;
  league?: SimLeague;
  market?: SimMarket;
  modelVersion?: string;
  finalHomeScore: number;
  finalAwayScore: number;
  closingProbability?: number | null;
  closingSpread?: number | null;
  closingTotal?: number | null;
  outcome?: 0 | 1 | "WIN" | "LOSS" | "PUSH" | boolean | null;
  resultJson?: Record<string, unknown> | null;
};

export type SimulationPredictionRow = {
  id: string;
  gameId: string;
  league: string;
  market: string;
  modelVersion: string;
  predictionTime: string;
  eventLabel: string | null;
  side: string | null;
  modelProbability: number | null;
  modelSpread: number | null;
  modelTotal: number | null;
  marketProbability: number | null;
  marketSpread: number | null;
  marketTotal: number | null;
  closingProbability: number | null;
  closingSpread: number | null;
  closingTotal: number | null;
  finalHomeScore: number | null;
  finalAwayScore: number | null;
  outcome: number | null;
  resultBucket: ResultBucket;
  brierScore: number | null;
  logLoss: number | null;
  spreadError: number | null;
  totalError: number | null;
  clvPct: number | null;
  dataQualityGrade: string | null;
  dataQualityFlags: unknown;
  predictionJson: unknown;
  resultJson: unknown;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function clampProbability(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0.001, Math.min(0.999, value));
}

function round(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function safeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function asDate(value: Date | string | null | undefined) {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function toOutcome(value: SettleSimulationPredictionInput["outcome"], finalHomeScore: number, finalAwayScore: number) {
  if (value === true || value === "WIN" || value === 1) return 1 as const;
  if (value === false || value === "LOSS" || value === 0) return 0 as const;
  if (value === "PUSH") return null;
  if (finalHomeScore === finalAwayScore) return null;
  return finalHomeScore > finalAwayScore ? 1 as const : 0 as const;
}

function resultBucket(outcome: number | null, finalHomeScore: number | null, finalAwayScore: number | null): ResultBucket {
  if (finalHomeScore == null || finalAwayScore == null) return "PENDING";
  if (outcome == null) return "PUSH";
  return outcome === 1 ? "WIN" : "LOSS";
}

export function brierScore(probability: number | null | undefined, outcome: number | null | undefined) {
  const p = clampProbability(probability);
  if (p == null || outcome == null) return null;
  return (p - outcome) ** 2;
}

export function logLoss(probability: number | null | undefined, outcome: number | null | undefined) {
  const p = clampProbability(probability);
  if (p == null || outcome == null) return null;
  return outcome === 1 ? -Math.log(p) : -Math.log(1 - p);
}

export function spreadError(modelSpread: number | null | undefined, finalHomeScore: number, finalAwayScore: number) {
  if (typeof modelSpread !== "number" || !Number.isFinite(modelSpread)) return null;
  return Math.abs(modelSpread - (finalHomeScore - finalAwayScore));
}

export function totalError(modelTotal: number | null | undefined, finalHomeScore: number, finalAwayScore: number) {
  if (typeof modelTotal !== "number" || !Number.isFinite(modelTotal)) return null;
  return Math.abs(modelTotal - (finalHomeScore + finalAwayScore));
}

export async function ensureSimulationPredictionLedgerTable() {
  if (!hasUsableServerDatabaseUrl()) return false;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS simulation_predictions (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      league TEXT NOT NULL,
      market TEXT NOT NULL,
      model_version TEXT NOT NULL,
      prediction_time TIMESTAMPTZ NOT NULL,
      event_label TEXT,
      side TEXT,
      model_probability DOUBLE PRECISION,
      model_spread DOUBLE PRECISION,
      model_total DOUBLE PRECISION,
      market_probability DOUBLE PRECISION,
      market_spread DOUBLE PRECISION,
      market_total DOUBLE PRECISION,
      closing_probability DOUBLE PRECISION,
      closing_spread DOUBLE PRECISION,
      closing_total DOUBLE PRECISION,
      final_home_score DOUBLE PRECISION,
      final_away_score DOUBLE PRECISION,
      outcome DOUBLE PRECISION,
      result_bucket TEXT NOT NULL DEFAULT 'PENDING',
      brier_score DOUBLE PRECISION,
      log_loss DOUBLE PRECISION,
      spread_error DOUBLE PRECISION,
      total_error DOUBLE PRECISION,
      clv_pct DOUBLE PRECISION,
      data_quality_grade TEXT,
      data_quality_flags JSONB,
      prediction_json JSONB,
      result_json JSONB,
      settled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (game_id, league, market, model_version, prediction_time)
    );
  `);

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS simulation_predictions_model_idx ON simulation_predictions (league, market, model_version, prediction_time DESC);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS simulation_predictions_settled_idx ON simulation_predictions (settled_at, prediction_time DESC);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS simulation_predictions_game_idx ON simulation_predictions (league, game_id, market);`);
  return true;
}

export async function recordSimulationPrediction(input: RecordSimulationPredictionInput) {
  const ready = await ensureSimulationPredictionLedgerTable();
  if (!ready) return { ok: false, databaseReady: false, id: null, error: "No usable server database URL is configured." };

  const id = input.id ?? crypto.randomUUID();
  const predictionTime = asDate(input.predictionTime);
  const modelProbability = clampProbability(input.modelProbability);
  const marketProbability = clampProbability(input.marketProbability);
  const closingProbability = clampProbability(input.closingProbability);
  const comparison = compareModelToMarket({ modelProbability, marketProbability, closeProbability: closingProbability });
  const dataQualityGrade = typeof input.dataQualityFlags?.grade === "string" ? input.dataQualityFlags.grade : null;

  await prisma.$executeRaw`
    INSERT INTO simulation_predictions (
      id, game_id, league, market, model_version, prediction_time, event_label, side,
      model_probability, model_spread, model_total,
      market_probability, market_spread, market_total,
      closing_probability, closing_spread, closing_total,
      clv_pct, data_quality_grade, data_quality_flags, prediction_json
    ) VALUES (
      ${id}, ${input.gameId}, ${input.league}, ${input.market}, ${input.modelVersion}, ${predictionTime}, ${input.eventLabel ?? null}, ${input.side ?? null},
      ${modelProbability}, ${input.modelSpread ?? null}, ${input.modelTotal ?? null},
      ${marketProbability}, ${input.marketSpread ?? null}, ${input.marketTotal ?? null},
      ${closingProbability}, ${input.closingSpread ?? null}, ${input.closingTotal ?? null},
      ${comparison.clvPct}, ${dataQualityGrade}, ${safeJson(input.dataQualityFlags)}::jsonb, ${safeJson(input.predictionJson)}::jsonb
    )
    ON CONFLICT (game_id, league, market, model_version, prediction_time) DO UPDATE SET
      event_label = EXCLUDED.event_label,
      side = EXCLUDED.side,
      model_probability = EXCLUDED.model_probability,
      model_spread = EXCLUDED.model_spread,
      model_total = EXCLUDED.model_total,
      market_probability = EXCLUDED.market_probability,
      market_spread = EXCLUDED.market_spread,
      market_total = EXCLUDED.market_total,
      closing_probability = EXCLUDED.closing_probability,
      closing_spread = EXCLUDED.closing_spread,
      closing_total = EXCLUDED.closing_total,
      clv_pct = EXCLUDED.clv_pct,
      data_quality_grade = EXCLUDED.data_quality_grade,
      data_quality_flags = EXCLUDED.data_quality_flags,
      prediction_json = EXCLUDED.prediction_json,
      updated_at = now();
  `;

  return { ok: true, databaseReady: true, id };
}

export async function settleSimulationPrediction(input: SettleSimulationPredictionInput) {
  const ready = await ensureSimulationPredictionLedgerTable();
  if (!ready) return { ok: false, databaseReady: false, settled: 0, error: "No usable server database URL is configured." };

  const outcome = toOutcome(input.outcome, input.finalHomeScore, input.finalAwayScore);
  const bucket = resultBucket(outcome, input.finalHomeScore, input.finalAwayScore);
  const closingProbability = clampProbability(input.closingProbability);

  const rows = input.id
    ? await prisma.$queryRaw<Array<{ id: string; model_probability: number | null; model_spread: number | null; model_total: number | null; market_probability: number | null; closing_probability: number | null }>>`
        SELECT id, model_probability, model_spread, model_total, market_probability, COALESCE(${closingProbability}, closing_probability) AS closing_probability
        FROM simulation_predictions
        WHERE id = ${input.id}
        LIMIT 1;
      `
    : await prisma.$queryRaw<Array<{ id: string; model_probability: number | null; model_spread: number | null; model_total: number | null; market_probability: number | null; closing_probability: number | null }>>`
        SELECT id, model_probability, model_spread, model_total, market_probability, COALESCE(${closingProbability}, closing_probability) AS closing_probability
        FROM simulation_predictions
        WHERE game_id = ${input.gameId ?? ""}
          AND league = ${input.league ?? ""}
          AND market = ${input.market ?? ""}
          AND model_version = ${input.modelVersion ?? ""}
        ORDER BY prediction_time DESC
        LIMIT 25;
      `;

  let settled = 0;
  for (const row of rows) {
    const rowBrier = brierScore(row.model_probability, outcome);
    const rowLogLoss = logLoss(row.model_probability, outcome);
    const rowSpreadError = spreadError(row.model_spread, input.finalHomeScore, input.finalAwayScore);
    const rowTotalError = totalError(row.model_total, input.finalHomeScore, input.finalAwayScore);
    const comparison = compareModelToMarket({
      modelProbability: row.market_probability,
      marketProbability: row.market_probability,
      closeProbability: row.closing_probability
    });

    await prisma.$executeRaw`
      UPDATE simulation_predictions
      SET final_home_score = ${input.finalHomeScore},
          final_away_score = ${input.finalAwayScore},
          outcome = ${outcome},
          result_bucket = ${bucket},
          closing_probability = COALESCE(${closingProbability}, closing_probability),
          closing_spread = COALESCE(${input.closingSpread ?? null}, closing_spread),
          closing_total = COALESCE(${input.closingTotal ?? null}, closing_total),
          brier_score = ${round(rowBrier)},
          log_loss = ${round(rowLogLoss)},
          spread_error = ${round(rowSpreadError, 3)},
          total_error = ${round(rowTotalError, 3)},
          clv_pct = ${round(comparison.clvPct, 3)},
          result_json = ${safeJson(input.resultJson)}::jsonb,
          settled_at = now(),
          updated_at = now()
      WHERE id = ${row.id};
    `;
    settled += 1;
  }

  return { ok: true, databaseReady: true, settled };
}

function normalizeJson(value: unknown) {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

export function mapSimulationPredictionRow(row: Record<string, any>): SimulationPredictionRow {
  return {
    id: String(row.id),
    gameId: String(row.game_id),
    league: String(row.league),
    market: String(row.market),
    modelVersion: String(row.model_version),
    predictionTime: new Date(row.prediction_time).toISOString(),
    eventLabel: row.event_label ?? null,
    side: row.side ?? null,
    modelProbability: row.model_probability ?? null,
    modelSpread: row.model_spread ?? null,
    modelTotal: row.model_total ?? null,
    marketProbability: row.market_probability ?? null,
    marketSpread: row.market_spread ?? null,
    marketTotal: row.market_total ?? null,
    closingProbability: row.closing_probability ?? null,
    closingSpread: row.closing_spread ?? null,
    closingTotal: row.closing_total ?? null,
    finalHomeScore: row.final_home_score ?? null,
    finalAwayScore: row.final_away_score ?? null,
    outcome: row.outcome ?? null,
    resultBucket: (row.result_bucket ?? "PENDING") as ResultBucket,
    brierScore: row.brier_score ?? null,
    logLoss: row.log_loss ?? null,
    spreadError: row.spread_error ?? null,
    totalError: row.total_error ?? null,
    clvPct: row.clv_pct ?? null,
    dataQualityGrade: row.data_quality_grade ?? null,
    dataQualityFlags: normalizeJson(row.data_quality_flags),
    predictionJson: normalizeJson(row.prediction_json),
    resultJson: normalizeJson(row.result_json),
    settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}
