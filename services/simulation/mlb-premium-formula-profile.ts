import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

export type MlbPremiumFormulaWeights = {
  rawWeight: number;
  v8Weight: number;
  v7Weight: number;
  pythagoreanWeight: number;
  marketAgreementWeight: number;
  disagreementPenaltyScale: number;
  confidenceCapBase: number;
  confidenceCapFloor: number;
  pythagoreanExponent: number;
};

export type MlbPremiumFormulaProfile = {
  modelVersion: "mlb-premium-formula-stack-v1";
  status: "DEFAULT" | "LEARNED" | "SAMPLE_TOO_SMALL";
  sampleSize: number;
  trainedAt: string | null;
  weights: MlbPremiumFormulaWeights;
  metrics: Record<string, unknown>;
};

type TrainingRow = {
  result: "WIN" | "LOSS";
  prediction_json: unknown;
};

export const DEFAULT_MLB_PREMIUM_FORMULA_WEIGHTS: MlbPremiumFormulaWeights = {
  rawWeight: 0.08,
  v8Weight: 0.2,
  v7Weight: 0.52,
  pythagoreanWeight: 0.2,
  marketAgreementWeight: 0.08,
  disagreementPenaltyScale: 0.6,
  confidenceCapBase: 0.72,
  confidenceCapFloor: 0.54,
  pythagoreanExponent: 1.83
};

export const DEFAULT_MLB_PREMIUM_FORMULA_PROFILE: MlbPremiumFormulaProfile = {
  modelVersion: "mlb-premium-formula-stack-v1",
  status: "DEFAULT",
  sampleSize: 0,
  trainedAt: null,
  weights: DEFAULT_MLB_PREMIUM_FORMULA_WEIGHTS,
  metrics: { source: "hard-coded-default" }
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function safeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numberFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function predictionJsonObject(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function clampProb(value: unknown) {
  const numeric = numberFrom(value);
  return numeric == null ? null : clamp(numeric, 0.001, 0.999);
}

function brier(probability: number, outcome: 0 | 1) {
  return (probability - outcome) ** 2;
}

function logLoss(probability: number, outcome: 0 | 1) {
  const p = clamp(probability, 0.001, 0.999);
  return outcome === 1 ? -Math.log(p) : -Math.log(1 - p);
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function logit(probability: number) {
  const p = clamp(probability, 0.001, 0.999);
  return Math.log(p / (1 - p));
}

function invLogit(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function normalizeWeights(weights: MlbPremiumFormulaWeights): MlbPremiumFormulaWeights {
  const total = Math.max(0, weights.rawWeight) + Math.max(0, weights.v8Weight) + Math.max(0, weights.v7Weight) + Math.max(0, weights.pythagoreanWeight);
  if (!Number.isFinite(total) || total <= 0) return DEFAULT_MLB_PREMIUM_FORMULA_WEIGHTS;
  return {
    rawWeight: round(Math.max(0, weights.rawWeight) / total, 4),
    v8Weight: round(Math.max(0, weights.v8Weight) / total, 4),
    v7Weight: round(Math.max(0, weights.v7Weight) / total, 4),
    pythagoreanWeight: round(Math.max(0, weights.pythagoreanWeight) / total, 4),
    marketAgreementWeight: round(clamp(weights.marketAgreementWeight, 0, 0.2), 4),
    disagreementPenaltyScale: round(clamp(weights.disagreementPenaltyScale, 0.2, 1.1), 4),
    confidenceCapBase: round(clamp(weights.confidenceCapBase, 0.62, 0.76), 4),
    confidenceCapFloor: round(clamp(weights.confidenceCapFloor, 0.48, 0.6), 4),
    pythagoreanExponent: round(clamp(weights.pythagoreanExponent, 1.5, 2.2), 4)
  };
}

function blendedProbability(features: { raw: number; v8: number; v7: number; pythagorean: number }, weights: MlbPremiumFormulaWeights) {
  const w = normalizeWeights(weights);
  return invLogit(
    logit(features.raw) * w.rawWeight +
    logit(features.v8) * w.v8Weight +
    logit(features.v7) * w.v7Weight +
    logit(features.pythagorean) * w.pythagoreanWeight
  );
}

function extractFeatures(row: TrainingRow) {
  const json = predictionJsonObject(row.prediction_json);
  const mainBrain = isRecord(json?.mainBrain) ? json.mainBrain : null;
  const mlbIntel = isRecord(json?.mlbIntel) ? json.mlbIntel : null;
  const formulaStack = isRecord(mlbIntel?.premiumFormulaStack) ? mlbIntel.premiumFormulaStack : null;
  const v7 = isRecord(json?.v7) ? json.v7 : null;
  const raw = clampProb(formulaStack?.rawHomeWinPct ?? mainBrain?.rawHomeWinPct);
  const v8 = clampProb(formulaStack?.v8HomeWinPct ?? mainBrain?.v8HomeWinPct);
  const v7Prob = clampProb(formulaStack?.v7HomeWinPct ?? mainBrain?.v7HomeWinPct ?? v7?.finalHomeWinPct);
  const pythagorean = clampProb(formulaStack?.pythagoreanHomeWinPct ?? mainBrain?.formulaHomeWinPct);
  const market = clampProb(formulaStack?.marketHomeNoVigProbability ?? v7?.marketHomeNoVigProbability);

  if (raw == null || v8 == null || v7Prob == null || pythagorean == null) return null;
  return {
    outcome: row.result === "WIN" ? 1 as const : 0 as const,
    raw,
    v8,
    v7: v7Prob,
    pythagorean,
    market
  };
}

function scoreComponent(features: Array<ReturnType<typeof extractFeatures> extends infer T ? NonNullable<T> : never>, key: "raw" | "v8" | "v7" | "pythagorean") {
  const briers = features.map((row) => brier(row[key], row.outcome));
  const losses = features.map((row) => logLoss(row[key], row.outcome));
  return { brier: avg(briers) ?? 0.25, logLoss: avg(losses) ?? Math.log(2) };
}

function softmaxFromScores(scores: Record<"raw" | "v8" | "v7" | "pythagorean", number>, reliability: number) {
  const base = DEFAULT_MLB_PREMIUM_FORMULA_WEIGHTS;
  const keys = ["raw", "v8", "v7", "pythagorean"] as const;
  const best = Math.min(...keys.map((key) => scores[key]));
  const temp = 22;
  const learned = Object.fromEntries(keys.map((key) => [key, Math.exp(-(scores[key] - best) * temp)])) as Record<typeof keys[number], number>;
  const learnedTotal = keys.reduce((sum, key) => sum + learned[key], 0) || 1;
  const learnedWeights = {
    raw: learned.raw / learnedTotal,
    v8: learned.v8 / learnedTotal,
    v7: learned.v7 / learnedTotal,
    pythagorean: learned.pythagorean / learnedTotal
  };

  return normalizeWeights({
    ...base,
    rawWeight: base.rawWeight * (1 - reliability) + learnedWeights.raw * reliability,
    v8Weight: base.v8Weight * (1 - reliability) + learnedWeights.v8 * reliability,
    v7Weight: base.v7Weight * (1 - reliability) + learnedWeights.v7 * reliability,
    pythagoreanWeight: base.pythagoreanWeight * (1 - reliability) + learnedWeights.pythagorean * reliability
  });
}

export async function ensureMlbPremiumFormulaProfileTable() {
  if (!hasUsableServerDatabaseUrl()) return false;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mlb_premium_formula_profiles (
      id TEXT PRIMARY KEY,
      model_version TEXT NOT NULL DEFAULT 'mlb-premium-formula-stack-v1',
      status TEXT NOT NULL,
      sample_size INTEGER NOT NULL DEFAULT 0,
      weights_json JSONB NOT NULL,
      metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      trained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mlb_premium_formula_profiles_active_idx ON mlb_premium_formula_profiles (model_version, is_active, trained_at DESC);`);
  return true;
}

export async function getActiveMlbPremiumFormulaProfile(): Promise<MlbPremiumFormulaProfile> {
  const ready = await ensureMlbPremiumFormulaProfileTable();
  if (!ready) return DEFAULT_MLB_PREMIUM_FORMULA_PROFILE;

  const rows = await prisma.$queryRaw<Array<{ status: string; sample_size: number; weights_json: unknown; metrics_json: unknown; trained_at: Date }>>`
    SELECT status, sample_size, weights_json, metrics_json, trained_at
    FROM mlb_premium_formula_profiles
    WHERE model_version = 'mlb-premium-formula-stack-v1' AND is_active = TRUE
    ORDER BY trained_at DESC
    LIMIT 1;
  `;
  const row = rows[0];
  if (!row || !isRecord(row.weights_json)) return DEFAULT_MLB_PREMIUM_FORMULA_PROFILE;

  return {
    modelVersion: "mlb-premium-formula-stack-v1",
    status: row.status === "LEARNED" || row.status === "SAMPLE_TOO_SMALL" ? row.status : "DEFAULT",
    sampleSize: Number(row.sample_size ?? 0),
    trainedAt: row.trained_at.toISOString(),
    weights: normalizeWeights({ ...DEFAULT_MLB_PREMIUM_FORMULA_WEIGHTS, ...(row.weights_json as Partial<MlbPremiumFormulaWeights>) }),
    metrics: isRecord(row.metrics_json) ? row.metrics_json : {}
  };
}

export async function fitAndPersistMlbPremiumFormulaProfile(limit = 5000) {
  const ready = await ensureMlbPremiumFormulaProfileTable();
  if (!ready) return { ok: false, profile: DEFAULT_MLB_PREMIUM_FORMULA_PROFILE, error: "No usable server database URL is configured." };

  const rows = await prisma.$queryRaw<TrainingRow[]>`
    SELECT result, prediction_json
    FROM mlb_model_snapshot_ledger
    WHERE result IN ('WIN', 'LOSS')
      AND prediction_json IS NOT NULL
      AND prediction_json::text LIKE '%mainBrain%'
    ORDER BY captured_at DESC
    LIMIT ${Math.max(50, Math.min(20000, Math.round(limit)))};
  `;
  const features = rows.map(extractFeatures).filter((row): row is NonNullable<ReturnType<typeof extractFeatures>> => Boolean(row));
  const sampleSize = features.length;
  const reliability = clamp((sampleSize - 75) / 925, 0, 1);
  const rawScore = scoreComponent(features, "raw");
  const v8Score = scoreComponent(features, "v8");
  const v7Score = scoreComponent(features, "v7");
  const pythagoreanScore = scoreComponent(features, "pythagorean");
  const learnedWeights = softmaxFromScores({ raw: rawScore.logLoss, v8: v8Score.logLoss, v7: v7Score.logLoss, pythagorean: pythagoreanScore.logLoss }, reliability);
  const marketRows = features.filter((row) => row.market != null);
  const marketBrier = avg(marketRows.map((row) => brier(row.market as number, row.outcome)));
  const formulaBrier = avg(features.map((row) => brier(blendedProbability(row, learnedWeights), row.outcome)));
  const formulaLogLoss = avg(features.map((row) => logLoss(blendedProbability(row, learnedWeights), row.outcome)));
  const marketAgreementBoost = marketBrier != null && formulaBrier != null && marketBrier < formulaBrier ? 0.04 * reliability : 0;
  const weights = normalizeWeights({
    ...learnedWeights,
    marketAgreementWeight: DEFAULT_MLB_PREMIUM_FORMULA_WEIGHTS.marketAgreementWeight + marketAgreementBoost,
    disagreementPenaltyScale: DEFAULT_MLB_PREMIUM_FORMULA_WEIGHTS.disagreementPenaltyScale * (1 + reliability * 0.2),
    confidenceCapBase: DEFAULT_MLB_PREMIUM_FORMULA_WEIGHTS.confidenceCapBase,
    confidenceCapFloor: DEFAULT_MLB_PREMIUM_FORMULA_WEIGHTS.confidenceCapFloor,
    pythagoreanExponent: DEFAULT_MLB_PREMIUM_FORMULA_WEIGHTS.pythagoreanExponent
  });
  const status: MlbPremiumFormulaProfile["status"] = sampleSize >= 150 ? "LEARNED" : "SAMPLE_TOO_SMALL";
  const profile: MlbPremiumFormulaProfile = {
    modelVersion: "mlb-premium-formula-stack-v1",
    status,
    sampleSize,
    trainedAt: new Date().toISOString(),
    weights: sampleSize >= 30 ? weights : DEFAULT_MLB_PREMIUM_FORMULA_WEIGHTS,
    metrics: {
      reliability: round(reliability, 4),
      sourceRows: rows.length,
      usableRows: sampleSize,
      formulaBrier: round(formulaBrier),
      formulaLogLoss: round(formulaLogLoss),
      marketBrier: round(marketBrier),
      componentScores: {
        raw: { brier: round(rawScore.brier), logLoss: round(rawScore.logLoss) },
        v8: { brier: round(v8Score.brier), logLoss: round(v8Score.logLoss) },
        v7: { brier: round(v7Score.brier), logLoss: round(v7Score.logLoss) },
        pythagorean: { brier: round(pythagoreanScore.brier), logLoss: round(pythagoreanScore.logLoss) }
      }
    }
  };

  await prisma.$executeRaw`UPDATE mlb_premium_formula_profiles SET is_active = FALSE WHERE model_version = 'mlb-premium-formula-stack-v1';`;
  await prisma.$executeRaw`
    INSERT INTO mlb_premium_formula_profiles (id, model_version, status, sample_size, weights_json, metrics_json, is_active, trained_at)
    VALUES (${crypto.randomUUID()}, 'mlb-premium-formula-stack-v1', ${profile.status}, ${profile.sampleSize}, ${safeJson(profile.weights)}::jsonb, ${safeJson(profile.metrics)}::jsonb, TRUE, now());
  `;

  return { ok: true, profile };
}
