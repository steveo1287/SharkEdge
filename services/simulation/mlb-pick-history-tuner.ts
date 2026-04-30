import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

const TUNER_KEY = "mlb:pick-history:tuner:v1";
const TTL_SECONDS = 60 * 60 * 6;

const FEATURE_KEYS = [
  "teamEdge",
  "playerEdge",
  "statcastEdge",
  "weatherEdge",
  "pitcherEdge",
  "bullpenEdge",
  "lockEdge",
  "parkEdge",
  "formEdge",
  "totalWeatherEdge",
  "totalStatcastEdge",
  "totalPitchingEdge",
  "totalParkEdge",
  "totalBullpenEdge",
  "umpireEdge",
  "pitcherRegressionEdge"
] as const;

type FeatureKey = typeof FEATURE_KEYS[number];
type Action = "attack" | "watch" | "pass";

type RawTunerRow = {
  id: string;
  captured_at: Date;
  tier: string | null;
  confidence: number | null;
  model_home_win_pct: number;
  market_home_win_pct: number | null;
  home_won: boolean | null;
  final_home_score: number | null;
  final_away_score: number | null;
  brier: number | null;
  log_loss: number | null;
  prediction_json: unknown;
};

type NormalizedRow = {
  id: string;
  tier: string | null;
  confidence: number | null;
  modelHomeWinPct: number;
  marketHomeWinPct: number | null;
  actualHomeWin: 0 | 1;
  brier: number;
  marketBrier: number | null;
  logLoss: number | null;
  features: Partial<Record<FeatureKey, number>>;
  lock: { startersConfirmed: boolean | null; lineupsConfirmed: boolean | null };
};

type BucketAccumulator = {
  key: string;
  label: string;
  count: number;
  wins: number;
  modelBrier: number;
  marketBrier: number;
  marketCount: number;
  logLoss: number;
  logLossCount: number;
};

type FeatureAccumulator = {
  key: FeatureKey;
  count: number;
  wins: number;
  absSignal: number;
};

export type MlbPickHistoryBucket = {
  key: string;
  label: string;
  count: number;
  winPct: number | null;
  modelBrier: number | null;
  marketBrier: number | null;
  modelBrierEdge: number | null;
  logLoss: number | null;
  action: Action;
  deltaMultiplier: number;
  confidenceAdjustment: number;
  reason: string;
};

export type MlbPickHistoryTuner = {
  ok: boolean;
  source: "graded-ledger" | "fallback";
  trainedAt: string;
  rows: number;
  usableMarketRows: number;
  global: {
    winPct: number | null;
    modelBrier: number | null;
    marketBrier: number | null;
    modelBrierEdge: number | null;
    reliability: number;
  };
  featureWeights: Record<FeatureKey, number>;
  buckets: Record<string, MlbPickHistoryBucket>;
  warning: string | null;
};

export type MlbPickHistoryAdjustment = {
  tunedHomeWinPct: number;
  marketBaselineUsed: boolean;
  bucketKey: string;
  action: Action;
  deltaMultiplier: number;
  confidenceAdjustment: number;
  shouldPass: boolean;
  reasons: string[];
};

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function round(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}
function sigmoid(value: number) { return 1 / (1 + Math.exp(-clamp(value, -35, 35))); }
function logit(probability: number) { const p = clamp(probability, 0.001, 0.999); return Math.log(p / (1 - p)); }
function brier(probability: number, outcome: 0 | 1) { return (probability - outcome) ** 2; }
function safeNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function defaultFeatureWeights() { return Object.fromEntries(FEATURE_KEYS.map((key) => [key, 1])) as Record<FeatureKey, number>; }

function defaultTuner(warning: string): MlbPickHistoryTuner {
  return {
    ok: false,
    source: "fallback",
    trainedAt: new Date().toISOString(),
    rows: 0,
    usableMarketRows: 0,
    global: { winPct: null, modelBrier: null, marketBrier: null, modelBrierEdge: null, reliability: 0.35 },
    featureWeights: defaultFeatureWeights(),
    buckets: {},
    warning
  };
}

function parseJson(value: unknown) {
  if (!value) return null;
  if (typeof value === "object") return value as any;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return null;
}

function nestedNumber(root: any, ...paths: string[][]) {
  for (const path of paths) {
    let current = root;
    for (const key of path) current = current?.[key];
    const value = safeNumber(current);
    if (value != null) return value;
  }
  return null;
}

function factorMap(json: any) {
  const map: Record<string, number> = {};
  const factors = json?.mlbIntel?.factors;
  if (Array.isArray(factors)) {
    for (const factor of factors) {
      if (typeof factor?.label === "string" && typeof factor?.value === "number") map[factor.label] = factor.value;
    }
  }
  return map;
}

function extractFeatures(json: any): Partial<Record<FeatureKey, number>> {
  const direct = json?.mlbIntel?.features;
  const factors = factorMap(json);
  return {
    teamEdge: safeNumber(direct?.teamEdge) ?? (factors["Team offense"] ?? 0) + (factors["Team power"] ?? 0),
    playerEdge: safeNumber(direct?.playerEdge) ?? factors["Player offense"],
    statcastEdge: safeNumber(direct?.statcastEdge) ?? factors["Hard contact trend"],
    weatherEdge: safeNumber(direct?.weatherEdge) ?? factors["Park/weather"],
    pitcherEdge: safeNumber(direct?.pitcherEdge) ?? (factors["Starting pitching"] ?? 0) + (factors["Player pitching"] ?? 0),
    bullpenEdge: safeNumber(direct?.bullpenEdge) ?? factors["Bullpen"],
    lockEdge: safeNumber(direct?.lockEdge) ?? factors["Official lineup/starter lock"],
    parkEdge: safeNumber(direct?.parkEdge) ?? factors["Park/weather"],
    formEdge: safeNumber(direct?.formEdge) ?? (factors["Recent team form"] ?? 0) + (factors["Recent player form"] ?? 0),
    totalWeatherEdge: safeNumber(direct?.totalWeatherEdge) ?? factors["Park/weather"],
    totalStatcastEdge: safeNumber(direct?.totalStatcastEdge) ?? factors["Hard contact trend"],
    totalPitchingEdge: safeNumber(direct?.totalPitchingEdge) ?? (factors["Starting pitching"] ?? 0) + (factors["Player pitching"] ?? 0),
    totalParkEdge: safeNumber(direct?.totalParkEdge) ?? factors["Park/weather"],
    totalBullpenEdge: safeNumber(direct?.totalBullpenEdge) ?? factors["Bullpen fatigue"],
    umpireEdge: safeNumber(direct?.umpireEdge) ?? factors["Umpire K-zone bias"],
    pitcherRegressionEdge: safeNumber(direct?.pitcherRegressionEdge) ?? factors["Pitcher regression (xFIP vs ERA)"]
  };
}

function normalizeRow(row: RawTunerRow): NormalizedRow | null {
  if (row.home_won == null || row.final_home_score == null || row.final_away_score == null) return null;
  if (row.final_home_score === row.final_away_score) return null;
  const modelHomeWinPct = safeNumber(row.model_home_win_pct);
  if (modelHomeWinPct == null) return null;
  const json = parseJson(row.prediction_json);
  const marketHomeWinPct = safeNumber(row.market_home_win_pct)
    ?? nestedNumber(json, ["mlbIntel", "market", "homeNoVigProbability"], ["market", "homeNoVigProbability"], ["market", "homeWinPct"]);
  const actualHomeWin = row.home_won ? 1 : 0;
  const rowBrier = safeNumber(row.brier) ?? brier(modelHomeWinPct, actualHomeWin);
  return {
    id: row.id,
    tier: row.tier,
    confidence: row.confidence,
    modelHomeWinPct,
    marketHomeWinPct,
    actualHomeWin,
    brier: rowBrier,
    marketBrier: marketHomeWinPct == null ? null : brier(marketHomeWinPct, actualHomeWin),
    logLoss: safeNumber(row.log_loss),
    features: extractFeatures(json),
    lock: {
      startersConfirmed: typeof json?.mlbIntel?.lock?.startersConfirmed === "boolean" ? json.mlbIntel.lock.startersConfirmed : null,
      lineupsConfirmed: typeof json?.mlbIntel?.lock?.lineupsConfirmed === "boolean" ? json.mlbIntel.lock.lineupsConfirmed : null
    }
  };
}

function edgeBucket(modelHomeWinPct: number, marketHomeWinPct: number | null) {
  if (marketHomeWinPct == null) return { key: "market:missing", label: "No market baseline" };
  const delta = modelHomeWinPct - marketHomeWinPct;
  const side = delta >= 0 ? "home" : "away";
  const abs = Math.abs(delta);
  const band = abs < 0.02 ? "0-2" : abs < 0.04 ? "2-4" : abs < 0.07 ? "4-7" : "7+";
  return { key: `edge:${side}:${band}`, label: `${side.toUpperCase()} market delta ${band}%` };
}

function confidenceBucket(confidence: number | null) {
  if (confidence == null) return { key: "confidence:missing", label: "Confidence missing" };
  if (confidence < 0.58) return { key: "confidence:<58", label: "Confidence <58%" };
  if (confidence < 0.64) return { key: "confidence:58-64", label: "Confidence 58-64%" };
  return { key: "confidence:64+", label: "Confidence 64%+" };
}

function addBucket(map: Map<string, BucketAccumulator>, key: string, label: string, row: NormalizedRow, pickedWinner: 0 | 1) {
  const bucket = map.get(key) ?? { key, label, count: 0, wins: 0, modelBrier: 0, marketBrier: 0, marketCount: 0, logLoss: 0, logLossCount: 0 };
  bucket.count += 1;
  if (pickedWinner === row.actualHomeWin) bucket.wins += 1;
  bucket.modelBrier += row.brier;
  if (row.marketBrier != null) {
    bucket.marketBrier += row.marketBrier;
    bucket.marketCount += 1;
  }
  if (row.logLoss != null) {
    bucket.logLoss += row.logLoss;
    bucket.logLossCount += 1;
  }
  map.set(key, bucket);
}

function scoreBucket(bucket: BucketAccumulator): MlbPickHistoryBucket {
  const winPct = bucket.count ? bucket.wins / bucket.count : null;
  const modelBrier = bucket.count ? bucket.modelBrier / bucket.count : null;
  const marketBrier = bucket.marketCount ? bucket.marketBrier / bucket.marketCount : null;
  const modelBrierEdge = modelBrier != null && marketBrier != null ? marketBrier - modelBrier : null;
  const logLoss = bucket.logLossCount ? bucket.logLoss / bucket.logLossCount : null;
  const reliability = bucket.count / (bucket.count + 35);

  let action: Action = "watch";
  let deltaMultiplier = 0.6 + reliability * 0.22;
  let confidenceAdjustment = 0;
  let reason = "Bucket is still building sample; use conservative delta from market baseline.";

  if (bucket.count >= 10 && ((modelBrierEdge != null && modelBrierEdge < -0.012) || (winPct != null && winPct < 0.47))) {
    action = "pass";
    deltaMultiplier = 0.24;
    confidenceAdjustment = -0.055;
    reason = "Historical bucket is underperforming market/coin-flip standards; pass unless another gate finds extreme value.";
  } else if (bucket.count >= 25 && modelBrierEdge != null && modelBrierEdge > 0.008 && winPct != null && winPct >= 0.53) {
    action = bucket.count >= 60 && modelBrierEdge > 0.015 && winPct >= 0.55 ? "attack" : "watch";
    deltaMultiplier = action === "attack" ? 1.05 : 0.86;
    confidenceAdjustment = action === "attack" ? 0.025 : 0.012;
    reason = "Historical bucket is beating the no-vig market baseline; allow stronger movement off market.";
  }

  return {
    key: bucket.key,
    label: bucket.label,
    count: bucket.count,
    winPct: round(winPct, 4),
    modelBrier: round(modelBrier, 4),
    marketBrier: round(marketBrier, 4),
    modelBrierEdge: round(modelBrierEdge, 4),
    logLoss: round(logLoss, 4),
    action,
    deltaMultiplier: round(deltaMultiplier, 4) ?? deltaMultiplier,
    confidenceAdjustment: round(confidenceAdjustment, 4) ?? confidenceAdjustment,
    reason
  };
}

function bucketLookupKey(modelHomeWinPct: number, marketHomeWinPct: number | null) {
  return edgeBucket(modelHomeWinPct, marketHomeWinPct).key;
}

export async function trainMlbPickHistoryTuner(limit = 600): Promise<MlbPickHistoryTuner> {
  if (!hasUsableServerDatabaseUrl()) return defaultTuner("No usable database URL; MLB pick-history tuner is running in fallback mode.");

  let rawRows: RawTunerRow[] = [];
  try {
    rawRows = await prisma.$queryRaw<RawTunerRow[]>`
      SELECT id, captured_at, tier, confidence, model_home_win_pct, market_home_win_pct, home_won,
        final_home_score, final_away_score, brier, log_loss, prediction_json
      FROM sim_prediction_snapshots
      WHERE league = 'MLB'
        AND graded_at IS NOT NULL
      ORDER BY captured_at DESC
      LIMIT ${limit};
    `;
  } catch {
    return defaultTuner("sim_prediction_snapshots is not available yet; capture and grade MLB picks before the tuner can learn.");
  }

  const rows = rawRows.map(normalizeRow).filter(Boolean) as NormalizedRow[];
  if (!rows.length) {
    const fallback = defaultTuner("No graded MLB decisions yet. Tuner will become active once MLB snapshots are captured before games and graded after finals.");
    await writeHotCache(TUNER_KEY, fallback, TTL_SECONDS);
    return fallback;
  }

  const bucketMap = new Map<string, BucketAccumulator>();
  const featureMap = new Map<FeatureKey, FeatureAccumulator>();
  let wins = 0;
  let modelBrier = 0;
  let marketBrier = 0;
  let usableMarketRows = 0;

  for (const row of rows) {
    const pickedWinner = row.modelHomeWinPct >= 0.5 ? 1 : 0;
    if (pickedWinner === row.actualHomeWin) wins += 1;
    modelBrier += row.brier;
    if (row.marketBrier != null) {
      marketBrier += row.marketBrier;
      usableMarketRows += 1;
    }

    const edge = edgeBucket(row.modelHomeWinPct, row.marketHomeWinPct);
    const confidence = confidenceBucket(row.confidence);
    addBucket(bucketMap, "all", "All graded MLB picks", row, pickedWinner);
    addBucket(bucketMap, edge.key, edge.label, row, pickedWinner);
    addBucket(bucketMap, confidence.key, confidence.label, row, pickedWinner);
    addBucket(bucketMap, `tier:${row.tier ?? "missing"}`, `Tier ${row.tier ?? "missing"}`, row, pickedWinner);
    addBucket(bucketMap, row.modelHomeWinPct >= 0.5 ? "side:home" : "side:away", row.modelHomeWinPct >= 0.5 ? "Model picked home" : "Model picked away", row, pickedWinner);
    if (row.lock.startersConfirmed != null) addBucket(bucketMap, `starter-lock:${row.lock.startersConfirmed ? "yes" : "no"}`, `Starter lock ${row.lock.startersConfirmed ? "yes" : "no"}`, row, pickedWinner);
    if (row.lock.lineupsConfirmed != null) addBucket(bucketMap, `lineup-lock:${row.lock.lineupsConfirmed ? "yes" : "no"}`, `Lineup lock ${row.lock.lineupsConfirmed ? "yes" : "no"}`, row, pickedWinner);

    for (const key of FEATURE_KEYS) {
      const value = safeNumber(row.features[key]);
      if (value == null || Math.abs(value) < 0.08) continue;
      const featureWinner = value >= 0 ? 1 : 0;
      const item = featureMap.get(key) ?? { key, count: 0, wins: 0, absSignal: 0 };
      item.count += 1;
      if (featureWinner === row.actualHomeWin) item.wins += 1;
      item.absSignal += Math.abs(value);
      featureMap.set(key, item);
    }
  }

  const globalModelBrier = modelBrier / rows.length;
  const globalMarketBrier = usableMarketRows ? marketBrier / usableMarketRows : null;
  const globalWinPct = wins / rows.length;
  const globalBrierEdge = globalMarketBrier == null ? null : globalMarketBrier - globalModelBrier;
  const reliability = clamp(rows.length / (rows.length + 80), 0.18, 0.92);
  const buckets = Object.fromEntries(Array.from(bucketMap.values()).map((bucket) => [bucket.key, scoreBucket(bucket)])) as Record<string, MlbPickHistoryBucket>;
  const featureWeights = defaultFeatureWeights();

  for (const item of featureMap.values()) {
    const winRate = item.wins / Math.max(1, item.count);
    const sampleReliability = item.count / (item.count + 30);
    featureWeights[item.key] = round(clamp(1 + (winRate - 0.5) * 1.4 * sampleReliability, 0.7, 1.3), 4) ?? 1;
  }

  const tuner: MlbPickHistoryTuner = {
    ok: rows.length >= 12,
    source: "graded-ledger",
    trainedAt: new Date().toISOString(),
    rows: rows.length,
    usableMarketRows,
    global: {
      winPct: round(globalWinPct, 4),
      modelBrier: round(globalModelBrier, 4),
      marketBrier: round(globalMarketBrier, 4),
      modelBrierEdge: round(globalBrierEdge, 4),
      reliability: round(reliability, 4) ?? reliability
    },
    featureWeights,
    buckets,
    warning: rows.length < 50 ? "Small graded MLB sample. Tuner is active but intentionally conservative until at least 50 decisions exist." : null
  };
  await writeHotCache(TUNER_KEY, tuner, TTL_SECONDS);
  return tuner;
}

export async function getCachedMlbPickHistoryTuner() {
  return readHotCache<MlbPickHistoryTuner>(TUNER_KEY);
}

export async function getOrTrainMlbPickHistoryTuner() {
  return (await getCachedMlbPickHistoryTuner()) ?? trainMlbPickHistoryTuner();
}

export function applyMlbPickHistoryTuner(tuner: MlbPickHistoryTuner | null, input: {
  rulesHomeWinPct: number;
  marketHomeNoVigProbability?: number | null;
  features: Record<string, number | null | undefined>;
  volatilityIndex: number;
}) : MlbPickHistoryAdjustment {
  const market = typeof input.marketHomeNoVigProbability === "number" && Number.isFinite(input.marketHomeNoVigProbability)
    ? clamp(input.marketHomeNoVigProbability, 0.02, 0.98)
    : null;
  const baseline = market ?? clamp(input.rulesHomeWinPct, 0.02, 0.98);
  const lookupKey = bucketLookupKey(input.rulesHomeWinPct, market);
  const bucket = tuner?.buckets?.[lookupKey] ?? tuner?.buckets?.all ?? null;
  const globalReliability = tuner?.global?.reliability ?? 0.35;
  const bucketMultiplier = bucket?.deltaMultiplier ?? (tuner?.ok ? 0.62 : 0.42);
  const historyReliability = tuner?.ok ? globalReliability : 0.28;

  let featureLogitMove = 0;
  for (const key of FEATURE_KEYS) {
    const value = safeNumber(input.features[key]);
    if (value == null) continue;
    const weight = tuner?.featureWeights?.[key] ?? 1;
    featureLogitMove += clamp(value, -2.5, 2.5) * (weight - 1) * 0.025;
  }

  const rulesDelta = input.rulesHomeWinPct - baseline;
  const logitMove = clamp(rulesDelta * 4.2 * bucketMultiplier * historyReliability + featureLogitMove, -0.42, 0.42);
  const tunedHomeWinPct = market == null
    ? clamp(0.5 + (input.rulesHomeWinPct - 0.5) * clamp(0.72 + historyReliability * 0.18, 0.62, 0.88), 0.34, 0.66)
    : clamp(sigmoid(logit(baseline) + logitMove), 0.32, 0.68);
  const action = bucket?.action ?? "watch";
  const shouldPass = Boolean(
    (bucket?.action === "pass" && Math.abs(rulesDelta) < 0.09) ||
    (!tuner?.ok && Math.abs(rulesDelta) < 0.055) ||
    (input.volatilityIndex >= 1.7 && Math.abs(tunedHomeWinPct - baseline) < 0.045)
  );

  return {
    tunedHomeWinPct: round(tunedHomeWinPct, 4) ?? tunedHomeWinPct,
    marketBaselineUsed: market != null,
    bucketKey: bucket?.key ?? lookupKey,
    action,
    deltaMultiplier: bucketMultiplier,
    confidenceAdjustment: (bucket?.confidenceAdjustment ?? 0) + (tuner?.ok ? 0 : -0.025),
    shouldPass,
    reasons: [
      market == null ? "No no-vig market baseline available; history tuner shrank probability toward coin flip." : "No-vig market used as the baseline; model signal only moves off the market baseline after history shrinkage.",
      bucket ? `${bucket.label}: ${bucket.reason}` : "No matching history bucket yet; using conservative default history shrinkage.",
      tuner?.ok ? `Tuner trained on ${tuner.rows} graded MLB decisions (${tuner.usableMarketRows} with market baseline).` : (tuner?.warning ?? "Tuner fallback mode is active."),
      `History-adjusted probability ${round(tunedHomeWinPct, 4)} from raw ${round(input.rulesHomeWinPct, 4)}${market == null ? "" : ` and market ${round(market, 4)}`}.`
    ]
  };
}
