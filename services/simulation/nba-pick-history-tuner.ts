import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

const TUNER_KEY = "nba:pick-history:tuner:v1";
const TTL_SECONDS = 60 * 60 * 6;

type Action = "attack" | "watch" | "pass";

type RawRow = {
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
  sourceMap: Record<string, number>;
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

export type NbaPickHistoryBucket = {
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

export type NbaPickHistoryTuner = {
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
  sourceWeights: Record<string, number>;
  buckets: Record<string, NbaPickHistoryBucket>;
  warning: string | null;
};

export type NbaPickHistoryAdjustment = {
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

function defaultTuner(warning: string): NbaPickHistoryTuner {
  return {
    ok: false,
    source: "fallback",
    trainedAt: new Date().toISOString(),
    rows: 0,
    usableMarketRows: 0,
    global: { winPct: null, modelBrier: null, marketBrier: null, modelBrierEdge: null, reliability: 0.3 },
    sourceWeights: { team: 1, player: 1, advanced: 1, rating: 1, history: 0.92, context: 1 },
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

function sourceMap(json: any) {
  const map: Record<string, number> = { team: 0, player: 0, advanced: 0, rating: 0, history: 0, context: 0 };
  const factors = json?.nbaIntel?.factors ?? json?.realityIntel?.factors;
  if (!Array.isArray(factors)) return map;
  for (const factor of factors) {
    const source = String(factor?.source ?? "advanced");
    const value = safeNumber(factor?.value) ?? 0;
    const weight = safeNumber(factor?.weight) ?? 1;
    if (source in map) map[source] += value * weight;
  }
  return map;
}

function normalizeRow(row: RawRow): NormalizedRow | null {
  if (row.home_won == null || row.final_home_score == null || row.final_away_score == null) return null;
  if (row.final_home_score === row.final_away_score) return null;
  const modelHomeWinPct = safeNumber(row.model_home_win_pct);
  if (modelHomeWinPct == null) return null;
  const json = parseJson(row.prediction_json);
  const marketHomeWinPct = safeNumber(row.market_home_win_pct)
    ?? nestedNumber(json, ["nbaIntel", "market", "homeNoVigProbability"], ["realityIntel", "market", "homeNoVigProbability"], ["market", "homeNoVigProbability"]);
  const actualHomeWin = row.home_won ? 1 : 0;
  return {
    id: row.id,
    tier: row.tier,
    confidence: row.confidence,
    modelHomeWinPct,
    marketHomeWinPct,
    actualHomeWin,
    brier: safeNumber(row.brier) ?? brier(modelHomeWinPct, actualHomeWin),
    marketBrier: marketHomeWinPct == null ? null : brier(marketHomeWinPct, actualHomeWin),
    logLoss: safeNumber(row.log_loss),
    sourceMap: sourceMap(json)
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

function scoreBucket(bucket: BucketAccumulator): NbaPickHistoryBucket {
  const winPct = bucket.count ? bucket.wins / bucket.count : null;
  const modelBrier = bucket.count ? bucket.modelBrier / bucket.count : null;
  const marketBrier = bucket.marketCount ? bucket.marketBrier / bucket.marketCount : null;
  const modelBrierEdge = modelBrier != null && marketBrier != null ? marketBrier - modelBrier : null;
  const logLoss = bucket.logLossCount ? bucket.logLoss / bucket.logLossCount : null;
  const reliability = bucket.count / (bucket.count + 40);
  let action: Action = "watch";
  let deltaMultiplier = 0.56 + reliability * 0.22;
  let confidenceAdjustment = 0;
  let reason = "NBA bucket is still building sample; use conservative market-baseline movement.";

  if (bucket.count >= 12 && ((modelBrierEdge != null && modelBrierEdge < -0.012) || (winPct != null && winPct < 0.47))) {
    action = "pass";
    deltaMultiplier = 0.22;
    confidenceAdjustment = -0.055;
    reason = "NBA history bucket is underperforming; pass unless another gate sees extreme edge.";
  } else if (bucket.count >= 30 && modelBrierEdge != null && modelBrierEdge > 0.008 && winPct != null && winPct >= 0.53) {
    action = bucket.count >= 70 && modelBrierEdge > 0.015 && winPct >= 0.55 ? "attack" : "watch";
    deltaMultiplier = action === "attack" ? 1.02 : 0.84;
    confidenceAdjustment = action === "attack" ? 0.022 : 0.01;
    reason = "NBA history bucket is beating no-vig market baseline; allow stronger movement off market.";
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

export async function trainNbaPickHistoryTuner(limit = 800): Promise<NbaPickHistoryTuner> {
  if (!hasUsableServerDatabaseUrl()) return defaultTuner("No usable database URL; NBA tuner is running in fallback mode.");
  let rawRows: RawRow[] = [];
  try {
    rawRows = await prisma.$queryRaw<RawRow[]>`
      SELECT id, captured_at, tier, confidence, model_home_win_pct, market_home_win_pct, home_won,
        final_home_score, final_away_score, brier, log_loss, prediction_json
      FROM sim_prediction_snapshots
      WHERE league = 'NBA'
        AND graded_at IS NOT NULL
      ORDER BY captured_at DESC
      LIMIT ${limit};
    `;
  } catch {
    return defaultTuner("sim_prediction_snapshots is not available yet; capture and grade NBA picks before the tuner can learn.");
  }

  const rows = rawRows.map(normalizeRow).filter(Boolean) as NormalizedRow[];
  if (!rows.length) {
    const fallback = defaultTuner("No graded NBA decisions yet. Tuner activates once NBA snapshots are captured and graded.");
    await writeHotCache(TUNER_KEY, fallback, TTL_SECONDS);
    return fallback;
  }

  const bucketMap = new Map<string, BucketAccumulator>();
  const sourceWins = new Map<string, { count: number; wins: number }>();
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
    addBucket(bucketMap, "all", "All graded NBA picks", row, pickedWinner);
    addBucket(bucketMap, edge.key, edge.label, row, pickedWinner);
    addBucket(bucketMap, confidence.key, confidence.label, row, pickedWinner);
    addBucket(bucketMap, `tier:${row.tier ?? "missing"}`, `Tier ${row.tier ?? "missing"}`, row, pickedWinner);
    addBucket(bucketMap, row.modelHomeWinPct >= 0.5 ? "side:home" : "side:away", row.modelHomeWinPct >= 0.5 ? "Model picked home" : "Model picked away", row, pickedWinner);

    for (const [source, value] of Object.entries(row.sourceMap)) {
      if (Math.abs(value) < 0.04) continue;
      const sourceWinner = value >= 0 ? 1 : 0;
      const item = sourceWins.get(source) ?? { count: 0, wins: 0 };
      item.count += 1;
      if (sourceWinner === row.actualHomeWin) item.wins += 1;
      sourceWins.set(source, item);
    }
  }

  const globalModelBrier = modelBrier / rows.length;
  const globalMarketBrier = usableMarketRows ? marketBrier / usableMarketRows : null;
  const globalWinPct = wins / rows.length;
  const globalBrierEdge = globalMarketBrier == null ? null : globalMarketBrier - globalModelBrier;
  const reliability = clamp(rows.length / (rows.length + 90), 0.16, 0.9);
  const buckets = Object.fromEntries(Array.from(bucketMap.values()).map((bucket) => [bucket.key, scoreBucket(bucket)])) as Record<string, NbaPickHistoryBucket>;
  const sourceWeights: Record<string, number> = { team: 1, player: 1, advanced: 1, rating: 1, history: 0.92, context: 1 };
  for (const [source, item] of sourceWins.entries()) {
    const winRate = item.wins / Math.max(1, item.count);
    const sampleReliability = item.count / (item.count + 35);
    sourceWeights[source] = round(clamp(1 + (winRate - 0.5) * 1.15 * sampleReliability, 0.72, 1.24), 4) ?? 1;
  }

  const tuner: NbaPickHistoryTuner = {
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
    sourceWeights,
    buckets,
    warning: rows.length < 60 ? "Small graded NBA sample. Tuner is active but conservative until at least 60 decisions exist." : null
  };
  await writeHotCache(TUNER_KEY, tuner, TTL_SECONDS);
  return tuner;
}

export async function getCachedNbaPickHistoryTuner() { return readHotCache<NbaPickHistoryTuner>(TUNER_KEY); }
export async function getOrTrainNbaPickHistoryTuner() { return (await getCachedNbaPickHistoryTuner()) ?? trainNbaPickHistoryTuner(); }

export function applyNbaPickHistoryTuner(tuner: NbaPickHistoryTuner | null, input: {
  rulesHomeWinPct: number;
  marketHomeNoVigProbability?: number | null;
  sourceMap?: Record<string, number>;
  volatilityIndex: number;
}): NbaPickHistoryAdjustment {
  const market = typeof input.marketHomeNoVigProbability === "number" && Number.isFinite(input.marketHomeNoVigProbability)
    ? clamp(input.marketHomeNoVigProbability, 0.02, 0.98)
    : null;
  const baseline = market ?? clamp(input.rulesHomeWinPct, 0.02, 0.98);
  const edge = edgeBucket(input.rulesHomeWinPct, market);
  const bucket = tuner?.buckets?.[edge.key] ?? tuner?.buckets?.all ?? null;
  const globalReliability = tuner?.global?.reliability ?? 0.3;
  const bucketMultiplier = bucket?.deltaMultiplier ?? (tuner?.ok ? 0.56 : 0.36);
  const historyReliability = tuner?.ok ? globalReliability : 0.24;

  let sourceLogitMove = 0;
  for (const [source, value] of Object.entries(input.sourceMap ?? {})) {
    const weight = tuner?.sourceWeights?.[source] ?? 1;
    sourceLogitMove += clamp(value, -3, 3) * (weight - 1) * 0.025;
  }
  const rulesDelta = input.rulesHomeWinPct - baseline;
  const logitMove = clamp(rulesDelta * 4.0 * bucketMultiplier * historyReliability + sourceLogitMove, -0.38, 0.38);
  const tunedHomeWinPct = market == null
    ? clamp(0.5 + (input.rulesHomeWinPct - 0.5) * clamp(0.68 + historyReliability * 0.18, 0.58, 0.84), 0.35, 0.65)
    : clamp(sigmoid(logit(baseline) + logitMove), 0.32, 0.68);
  const shouldPass = Boolean(
    (bucket?.action === "pass" && Math.abs(rulesDelta) < 0.085) ||
    (!tuner?.ok && Math.abs(rulesDelta) < 0.052) ||
    (input.volatilityIndex >= 1.75 && Math.abs(tunedHomeWinPct - baseline) < 0.04)
  );
  return {
    tunedHomeWinPct: round(tunedHomeWinPct, 4) ?? tunedHomeWinPct,
    marketBaselineUsed: market != null,
    bucketKey: bucket?.key ?? edge.key,
    action: bucket?.action ?? "watch",
    deltaMultiplier: bucketMultiplier,
    confidenceAdjustment: (bucket?.confidenceAdjustment ?? 0) + (tuner?.ok ? 0 : -0.025),
    shouldPass,
    reasons: [
      market == null ? "No NBA no-vig market baseline available; history tuner shrank probability toward coin flip." : "NBA no-vig market used as baseline; model signal only moves off market after history shrinkage.",
      bucket ? `${bucket.label}: ${bucket.reason}` : "No matching NBA history bucket yet; using conservative default shrinkage.",
      tuner?.ok ? `NBA tuner trained on ${tuner.rows} graded decisions (${tuner.usableMarketRows} with market baseline).` : (tuner?.warning ?? "NBA tuner fallback mode is active."),
      `History-adjusted NBA probability ${round(tunedHomeWinPct, 4)} from raw ${round(input.rulesHomeWinPct, 4)}${market == null ? "" : ` and market ${round(market, 4)}`}.`
    ]
  };
}
