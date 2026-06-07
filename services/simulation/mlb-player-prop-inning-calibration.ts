import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbPlayerPropInningLedgers } from "@/services/simulation/mlb-player-prop-inning-ledgers";

export type MlbPlayerMarketCalibrationSource = "player_prop" | "inning_market";

export type MlbPlayerMarketCalibrationTrainingRow = {
  source: MlbPlayerMarketCalibrationSource;
  market: string;
  probability: number | null;
  confidence: number | null;
  result: "WIN" | "LOSS" | "PUSH" | "PENDING" | string;
  brier?: number | null;
  log_loss?: number | null;
  projected_value?: number | null;
  actual_value?: number | null;
};

export type MlbPlayerMarketProbabilityBucket = {
  bucket: "low" | "coinflip" | "high";
  count: number;
  avgProbability: number;
  winRate: number;
  brier: number;
};

export type MlbPlayerMarketCalibration = {
  source: MlbPlayerMarketCalibrationSource;
  market: string;
  status: "LEARNED" | "SAMPLE_TOO_SMALL";
  sampleSize: number;
  reliability: number;
  winRate: number;
  avgProbability: number;
  avgConfidence: number;
  accuracy: number;
  brier: number;
  logLoss: number;
  baselineBrier: number;
  brierImprovement: number;
  probabilityBias: number;
  probabilityShift: number;
  confidenceCap: number;
  minEdgeRequired: number;
  buckets: MlbPlayerMarketProbabilityBucket[];
};

export type MlbPlayerMarketCalibrationProfile = {
  modelVersion: "mlb-player-market-calibration-v1";
  status: "DEFAULT" | "LEARNED" | "SAMPLE_TOO_SMALL";
  sampleSize: number;
  trainedAt: string | null;
  markets: Record<string, MlbPlayerMarketCalibration>;
  metrics: Record<string, unknown>;
};

export const DEFAULT_MLB_PLAYER_MARKET_CALIBRATION_PROFILE: MlbPlayerMarketCalibrationProfile = {
  modelVersion: "mlb-player-market-calibration-v1",
  status: "DEFAULT",
  sampleSize: 0,
  trainedAt: null,
  markets: {},
  metrics: { source: "default-empty-profile" }
};

type PreparedTrainingRow = {
  source: MlbPlayerMarketCalibrationSource;
  market: string;
  key: string;
  probability: number;
  confidence: number;
  outcome: 0 | 1;
  brier: number;
  logLoss: number;
  projectedValue: number | null;
  actualValue: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function safeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function numberFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function sourceFrom(value: unknown): MlbPlayerMarketCalibrationSource {
  return value === "inning_market" ? "inning_market" : "player_prop";
}

function brier(probability: number, outcome: 0 | 1) {
  return (clamp(probability, 0.001, 0.999) - outcome) ** 2;
}

function logLoss(probability: number, outcome: 0 | 1) {
  const p = clamp(probability, 0.001, 0.999);
  return outcome === 1 ? -Math.log(p) : -Math.log(1 - p);
}

function accuracy(probability: number, outcome: 0 | 1) {
  return (probability >= 0.5 ? 1 : 0) === outcome ? 1 : 0;
}

function marketKey(source: MlbPlayerMarketCalibrationSource, market: string) {
  return `${source}:${market}`;
}

function bucketFor(probability: number): MlbPlayerMarketProbabilityBucket["bucket"] {
  if (probability < 0.45) return "low";
  if (probability > 0.55) return "high";
  return "coinflip";
}

function prepareRows(rows: MlbPlayerMarketCalibrationTrainingRow[]): PreparedTrainingRow[] {
  return rows.flatMap((row) => {
    if (row.result !== "WIN" && row.result !== "LOSS") return [];
    const probability = numberFrom(row.probability);
    if (probability == null) return [];
    const source = sourceFrom(row.source);
    const market = String(row.market ?? "").trim();
    if (!market) return [];
    const outcome = row.result === "WIN" ? 1 : 0;
    const confidence = clamp(numberFrom(row.confidence) ?? 0.5, 0, 1);
    const p = clamp(probability, 0.001, 0.999);
    return [{
      source,
      market,
      key: marketKey(source, market),
      probability: p,
      confidence,
      outcome,
      brier: numberFrom(row.brier) ?? brier(p, outcome),
      logLoss: numberFrom(row.log_loss) ?? logLoss(p, outcome),
      projectedValue: numberFrom(row.projected_value),
      actualValue: numberFrom(row.actual_value)
    }];
  });
}

function bucketMetrics(rows: PreparedTrainingRow[]) {
  return (["low", "coinflip", "high"] as const).map((bucket) => {
    const slice = rows.filter((row) => bucketFor(row.probability) === bucket);
    return {
      bucket,
      count: slice.length,
      avgProbability: round(mean(slice.map((row) => row.probability)), 4),
      winRate: round(mean(slice.map((row) => row.outcome)), 4),
      brier: round(mean(slice.map((row) => row.brier)), 5)
    };
  });
}

function fitMarket(rows: PreparedTrainingRow[]): MlbPlayerMarketCalibration {
  const first = rows[0];
  const sampleSize = rows.length;
  const reliability = clamp((sampleSize - 40) / 460, 0, 1);
  const avgProbability = mean(rows.map((row) => row.probability));
  const winRate = mean(rows.map((row) => row.outcome));
  const avgConfidence = mean(rows.map((row) => row.confidence));
  const avgBrier = mean(rows.map((row) => row.brier));
  const avgLogLoss = mean(rows.map((row) => row.logLoss));
  const avgAccuracy = mean(rows.map((row) => accuracy(row.probability, row.outcome)));
  const baselineBrier = mean(rows.map((row) => brier(0.5, row.outcome)));
  const brierImprovement = baselineBrier - avgBrier;
  const probabilityBias = winRate - avgProbability;
  const absoluteBias = Math.abs(probabilityBias);
  const status: MlbPlayerMarketCalibration["status"] = sampleSize >= 100 ? "LEARNED" : "SAMPLE_TOO_SMALL";
  const skillScore = clamp((brierImprovement * 2.6) + (avgAccuracy - 0.5) * 0.85 - absoluteBias * 0.65, -0.4, 0.45);
  const confidenceCap = sampleSize < 40
    ? 0.35
    : clamp(0.48 + reliability * 0.24 + skillScore, 0.35, 0.88);
  const probabilityShift = sampleSize < 40 ? 0 : clamp(probabilityBias * reliability * 0.72, -0.12, 0.12);
  const minEdgeRequired = clamp(0.02 + Math.max(0, avgBrier - 0.23) * 0.35 + absoluteBias * 0.22 - reliability * 0.012, 0.015, 0.08);

  return {
    source: first.source,
    market: first.market,
    status,
    sampleSize,
    reliability: round(reliability, 4),
    winRate: round(winRate, 4),
    avgProbability: round(avgProbability, 4),
    avgConfidence: round(avgConfidence, 4),
    accuracy: round(avgAccuracy, 4),
    brier: round(avgBrier, 5),
    logLoss: round(avgLogLoss, 5),
    baselineBrier: round(baselineBrier, 5),
    brierImprovement: round(brierImprovement, 5),
    probabilityBias: round(probabilityBias, 4),
    probabilityShift: round(probabilityShift, 4),
    confidenceCap: round(confidenceCap, 4),
    minEdgeRequired: round(minEdgeRequired, 4),
    buckets: bucketMetrics(rows)
  };
}

export function applyMlbPlayerMarketCalibration(args: {
  source: MlbPlayerMarketCalibrationSource;
  market: string;
  probability: number;
  confidence?: number | null;
  profile?: MlbPlayerMarketCalibrationProfile | null;
}) {
  const profile = args.profile ?? DEFAULT_MLB_PLAYER_MARKET_CALIBRATION_PROFILE;
  const calibration = profile.markets[marketKey(args.source, args.market)] ?? null;
  const rawProbability = clamp(args.probability, 0.001, 0.999);
  if (!calibration) {
    return {
      rawProbability: round(rawProbability, 4),
      calibratedProbability: round(rawProbability, 4),
      confidence: round(clamp(args.confidence ?? 0.45, 0, 0.45), 4),
      minEdgeRequired: 0.04,
      status: "UNTRAINED" as const,
      calibration: null
    };
  }
  const shifted = clamp(rawProbability + calibration.probabilityShift, 0.001, 0.999);
  const confidence = clamp(args.confidence ?? calibration.avgConfidence, 0, calibration.confidenceCap);
  return {
    rawProbability: round(rawProbability, 4),
    calibratedProbability: round(shifted, 4),
    confidence: round(confidence, 4),
    minEdgeRequired: calibration.minEdgeRequired,
    status: calibration.status,
    calibration
  };
}

export function fitMlbPlayerMarketCalibrationProfileFromRows(
  rows: MlbPlayerMarketCalibrationTrainingRow[],
  trainedAt = new Date().toISOString()
): MlbPlayerMarketCalibrationProfile {
  const prepared = prepareRows(rows);
  const grouped = new Map<string, PreparedTrainingRow[]>();
  for (const row of prepared) grouped.set(row.key, [...(grouped.get(row.key) ?? []), row]);
  const markets: Record<string, MlbPlayerMarketCalibration> = {};
  for (const [key, marketRows] of grouped.entries()) markets[key] = fitMarket(marketRows);
  const marketValues = Object.values(markets);
  const learnedCount = marketValues.filter((market) => market.status === "LEARNED").length;
  const status: MlbPlayerMarketCalibrationProfile["status"] = prepared.length >= 150 && learnedCount > 0
    ? "LEARNED"
    : prepared.length > 0
      ? "SAMPLE_TOO_SMALL"
      : "DEFAULT";

  return {
    modelVersion: "mlb-player-market-calibration-v1",
    status,
    sampleSize: prepared.length,
    trainedAt,
    markets,
    metrics: {
      source: "graded-player-prop-and-inning-ledgers",
      leakageGuard: "uses only graded rows from pregame projection ledgers",
      marketCount: marketValues.length,
      learnedMarketCount: learnedCount,
      sampleTooSmallMarketCount: marketValues.length - learnedCount,
      avgBrier: round(mean(prepared.map((row) => row.brier)), 5),
      avgLogLoss: round(mean(prepared.map((row) => row.logLoss)), 5),
      avgAccuracy: round(mean(prepared.map((row) => accuracy(row.probability, row.outcome))), 4),
      playerPropRows: prepared.filter((row) => row.source === "player_prop").length,
      inningMarketRows: prepared.filter((row) => row.source === "inning_market").length
    }
  };
}

export async function ensureMlbPlayerMarketCalibrationProfileTable() {
  if (!hasUsableServerDatabaseUrl()) return false;
  await ensureMlbPlayerPropInningLedgers();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mlb_player_market_calibration_profiles (
      id TEXT PRIMARY KEY,
      model_version TEXT NOT NULL DEFAULT 'mlb-player-market-calibration-v1',
      status TEXT NOT NULL,
      sample_size INTEGER NOT NULL DEFAULT 0,
      markets_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      trained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mlb_player_market_calibration_profiles_active_idx ON mlb_player_market_calibration_profiles (model_version, is_active, trained_at DESC);`);
  return true;
}

export async function getActiveMlbPlayerMarketCalibrationProfile(): Promise<MlbPlayerMarketCalibrationProfile> {
  const ready = await ensureMlbPlayerMarketCalibrationProfileTable();
  if (!ready) return DEFAULT_MLB_PLAYER_MARKET_CALIBRATION_PROFILE;
  const rows = await prisma.$queryRaw<Array<{ status: string; sample_size: number; markets_json: unknown; metrics_json: unknown; trained_at: Date }>>`
    SELECT status, sample_size, markets_json, metrics_json, trained_at
    FROM mlb_player_market_calibration_profiles
    WHERE model_version = 'mlb-player-market-calibration-v1' AND is_active = TRUE
    ORDER BY trained_at DESC
    LIMIT 1;
  `;
  const row = rows[0];
  if (!row || !row.markets_json || typeof row.markets_json !== "object") return DEFAULT_MLB_PLAYER_MARKET_CALIBRATION_PROFILE;
  return {
    modelVersion: "mlb-player-market-calibration-v1",
    status: row.status === "LEARNED" || row.status === "SAMPLE_TOO_SMALL" ? row.status : "DEFAULT",
    sampleSize: Number(row.sample_size ?? 0),
    trainedAt: row.trained_at.toISOString(),
    markets: row.markets_json as Record<string, MlbPlayerMarketCalibration>,
    metrics: row.metrics_json && typeof row.metrics_json === "object" ? row.metrics_json as Record<string, unknown> : {}
  };
}

export async function fitAndPersistMlbPlayerMarketCalibrationProfile(limit = 25000) {
  const ready = await ensureMlbPlayerMarketCalibrationProfileTable();
  if (!ready) return { ok: false, profile: DEFAULT_MLB_PLAYER_MARKET_CALIBRATION_PROFILE, error: "No usable server database URL is configured." };
  const boundedLimit = Math.max(100, Math.min(100000, Math.round(limit)));
  const rows = await prisma.$queryRaw<MlbPlayerMarketCalibrationTrainingRow[]>`
    WITH graded AS (
      SELECT
        'player_prop'::text AS source,
        market,
        probability_over AS probability,
        confidence,
        result,
        brier,
        log_loss,
        projected_value,
        actual_value,
        graded_at
      FROM mlb_player_prop_projection_ledger
      WHERE result IN ('WIN', 'LOSS') AND probability_over IS NOT NULL
      UNION ALL
      SELECT
        'inning_market'::text AS source,
        market,
        probability,
        confidence,
        result,
        brier,
        log_loss,
        projected_value,
        actual_value,
        graded_at
      FROM mlb_inning_market_projection_ledger
      WHERE result IN ('WIN', 'LOSS') AND probability IS NOT NULL
    )
    SELECT source, market, probability, confidence, result, brier, log_loss, projected_value, actual_value
    FROM graded
    ORDER BY graded_at DESC NULLS LAST
    LIMIT ${boundedLimit};
  `;
  const profile = fitMlbPlayerMarketCalibrationProfileFromRows(rows);
  await prisma.$executeRaw`UPDATE mlb_player_market_calibration_profiles SET is_active = FALSE WHERE model_version = 'mlb-player-market-calibration-v1';`;
  await prisma.$executeRaw`
    INSERT INTO mlb_player_market_calibration_profiles (id, model_version, status, sample_size, markets_json, metrics_json, is_active, trained_at)
    VALUES (${crypto.randomUUID()}, 'mlb-player-market-calibration-v1', ${profile.status}, ${profile.sampleSize}, ${safeJson(profile.markets)}::jsonb, ${safeJson(profile.metrics)}::jsonb, TRUE, now());
  `;
  return { ok: true, profile };
}
