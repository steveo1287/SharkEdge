import { prisma } from "@/lib/db/prisma";
import { trainMlbMlModel, getCachedMlbMlModel } from "@/services/simulation/mlb-ml-training-engine";
import { runMlbBacktest } from "@/services/simulation/mlb-backtesting-engine";
import { buildMlbTrainingDataset } from "@/services/simulation/mlb-training-dataset-builder";

// Automated retraining pipeline for the MLB sim model.
// Checks if enough new completed games exist since last train,
// runs the training, compares vs previous model, and activates if improved.

const MIN_NEW_ROWS_TO_RETRAIN = 15;
const MIN_IMPROVEMENT_TO_ACTIVATE = -0.002; // Allow marginal degradation to keep model fresh
const RETRAIN_LOG_TABLE = "mlb_retrain_log";

type RetrainResult = {
  ok: boolean;
  triggered: boolean;
  reason: string;
  trainingRows: number;
  sideAccuracy: number | null;
  totalAccuracy: number | null;
  prevSideAccuracy: number | null;
  improvement: number | null;
  modelActivated: boolean;
  warning: string | null;
  completedAt: string;
};

type LogRow = {
  training_rows: number;
  side_accuracy: number | null;
  triggered_at: Date;
};

async function ensureTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS mlb_retrain_log (
      id TEXT PRIMARY KEY,
      triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      trigger_reason TEXT NOT NULL,
      training_rows INTEGER NOT NULL DEFAULT 0,
      side_accuracy DOUBLE PRECISION,
      total_accuracy DOUBLE PRECISION,
      prev_side_accuracy DOUBLE PRECISION,
      improvement DOUBLE PRECISION,
      model_activated BOOLEAN NOT NULL DEFAULT FALSE,
      model_key TEXT,
      warning TEXT,
      completed_at TIMESTAMPTZ
    )
  `;
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS mlb_retrain_log_triggered_idx
    ON mlb_retrain_log (triggered_at DESC)
  `;
}

async function getLastTrainInfo(): Promise<{ rows: number; accuracy: number | null; triggeredAt: Date | null }> {
  const rows = await prisma.$queryRaw<LogRow[]>`
    SELECT training_rows, side_accuracy, triggered_at
    FROM mlb_retrain_log
    WHERE model_activated = TRUE
    ORDER BY triggered_at DESC
    LIMIT 1
  `.catch(() => [] as LogRow[]);

  const row = rows[0];
  return {
    rows: row?.training_rows ?? 0,
    accuracy: row?.side_accuracy ?? null,
    triggeredAt: row?.triggered_at ?? null,
  };
}

async function countAvailableRows(): Promise<number> {
  const dataset = await buildMlbTrainingDataset(5000, 240).catch(() => ({ joinedCount: 0 }));
  return dataset.joinedCount;
}

async function persistLog(args: {
  id: string;
  reason: string;
  trainingRows: number;
  sideAccuracy: number | null;
  totalAccuracy: number | null;
  prevSideAccuracy: number | null;
  improvement: number | null;
  activated: boolean;
  modelKey: string | null;
  warning: string | null;
}) {
  await prisma.$executeRaw`
    INSERT INTO mlb_retrain_log (
      id, triggered_at, trigger_reason, training_rows,
      side_accuracy, total_accuracy, prev_side_accuracy,
      improvement, model_activated, model_key, warning, completed_at
    ) VALUES (
      ${args.id}, now(), ${args.reason}, ${args.trainingRows},
      ${args.sideAccuracy}, ${args.totalAccuracy}, ${args.prevSideAccuracy},
      ${args.improvement}, ${args.activated}, ${args.modelKey},
      ${args.warning}, now()
    )
  `;
}

export async function runMlbRetrainPipeline(args: {
  force?: boolean;
  reason?: string;
} = {}): Promise<RetrainResult> {
  await ensureTable().catch(() => null);

  const reason = args.reason ?? "scheduled";
  const id = `retrain:${Date.now()}`;

  // Step 1: Check how many rows are available
  const availableRows = await countAvailableRows();

  if (!args.force) {
    const last = await getLastTrainInfo();
    const newRows = availableRows - last.rows;

    if (newRows < MIN_NEW_ROWS_TO_RETRAIN) {
      const result: RetrainResult = {
        ok: true,
        triggered: false,
        reason: `Not enough new rows to retrain (need ${MIN_NEW_ROWS_TO_RETRAIN}, have ${newRows} new).`,
        trainingRows: availableRows,
        sideAccuracy: null,
        totalAccuracy: null,
        prevSideAccuracy: last.accuracy,
        improvement: null,
        modelActivated: false,
        warning: null,
        completedAt: new Date().toISOString(),
      };
      await persistLog({
        id,
        reason,
        trainingRows: availableRows,
        sideAccuracy: null,
        totalAccuracy: null,
        prevSideAccuracy: last.accuracy,
        improvement: null,
        activated: false,
        modelKey: null,
        warning: result.reason,
      }).catch(() => null);
      return result;
    }
  }

  // Step 2: Train
  const prevModel = await getCachedMlbMlModel().catch(() => null);
  const prevAccuracy = prevModel?.ok ? prevModel.sideModel.accuracy : null;

  const newModel = await trainMlbMlModel(2000);

  if (!newModel.ok) {
    const result: RetrainResult = {
      ok: false,
      triggered: true,
      reason,
      trainingRows: newModel.rows,
      sideAccuracy: null,
      totalAccuracy: null,
      prevSideAccuracy: prevAccuracy,
      improvement: null,
      modelActivated: false,
      warning: newModel.warning ?? "Training failed.",
      completedAt: new Date().toISOString(),
    };
    await persistLog({
      id,
      reason,
      trainingRows: newModel.rows,
      sideAccuracy: null,
      totalAccuracy: null,
      prevSideAccuracy: prevAccuracy,
      improvement: null,
      activated: false,
      modelKey: null,
      warning: result.warning,
    }).catch(() => null);
    return result;
  }

  // Step 3: Run backtest to validate
  const backtest = await runMlbBacktest(1000).catch(() => null);

  const newAccuracy = newModel.sideModel.accuracy;
  const improvement = prevAccuracy !== null ? newAccuracy - prevAccuracy : null;

  // Step 4: Activate if improved or no prior model
  const shouldActivate =
    prevAccuracy === null ||
    improvement === null ||
    improvement >= MIN_IMPROVEMENT_TO_ACTIVATE;

  const modelKey = `mlb:ml:model:v1`;
  const warning = newModel.warning ?? (backtest?.ok === false ? "Backtest had no data rows." : null);

  await persistLog({
    id,
    reason,
    trainingRows: newModel.rows,
    sideAccuracy: newAccuracy,
    totalAccuracy: newModel.totalModel.mae ? 1 / (1 + newModel.totalModel.mae) : null,
    prevSideAccuracy: prevAccuracy,
    improvement,
    activated: shouldActivate,
    modelKey: shouldActivate ? modelKey : null,
    warning,
  }).catch(() => null);

  return {
    ok: true,
    triggered: true,
    reason,
    trainingRows: newModel.rows,
    sideAccuracy: newAccuracy,
    totalAccuracy: newModel.totalModel.mae ? Number((1 / (1 + newModel.totalModel.mae)).toFixed(4)) : null,
    prevSideAccuracy: prevAccuracy,
    improvement: improvement !== null ? Number(improvement.toFixed(4)) : null,
    modelActivated: shouldActivate,
    warning,
    completedAt: new Date().toISOString(),
  };
}

export async function getRetrainHistory(limit = 20): Promise<LogRow[]> {
  return prisma.$queryRaw<LogRow[]>`
    SELECT training_rows, side_accuracy, triggered_at
    FROM mlb_retrain_log
    ORDER BY triggered_at DESC
    LIMIT ${limit}
  `.catch(() => [] as LogRow[]);
}

export async function shouldRetrain(): Promise<boolean> {
  const availableRows = await countAvailableRows().catch(() => 0);
  const last = await getLastTrainInfo().catch(() => ({ rows: 0, accuracy: null, triggeredAt: null }));
  return availableRows - last.rows >= MIN_NEW_ROWS_TO_RETRAIN;
}
