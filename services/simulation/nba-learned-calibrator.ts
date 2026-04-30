import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

const CALIBRATOR_KEY = "nba:learned-calibrator:v1";
const TTL_SECONDS = 60 * 60 * 6;

const SOURCE_KEYS = ["team", "player", "advanced", "rating", "history", "context"] as const;
type SourceKey = (typeof SOURCE_KEYS)[number];
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
  sourceMap: Record<SourceKey, number>;
};

type SourceAccumulator = {
  source: SourceKey;
  count: number;
  wins: number;
  absSignal: number;
  signedSignal: number;
  lossPenalty: number;
};

type BucketAccumulator = {
  key: string;
  label: string;
  count: number;
  wins: number;
  modelBrier: number;
  marketBrier: number;
  marketCount: number;
  confidenceSum: number;
  confidenceCount: number;
};

export type NbaLearnedSourceWeight = {
  source: SourceKey;
  count: number;
  winPct: number | null;
  reliability: number;
  weight: number;
  reason: string;
};

export type NbaLearnedBucketRule = {
  key: string;
  label: string;
  count: number;
  winPct: number | null;
  avgConfidence: number | null;
  modelBrier: number | null;
  marketBrier: number | null;
  brierEdge: number | null;
  action: Action;
  deltaMultiplier: number;
  confidenceAdjustment: number;
  reason: string;
};

export type NbaLearnedCalibrator = {
  ok: boolean;
  source: "graded-ledger" | "fallback";
  trainedAt: string;
  rows: number;
  usableMarketRows: number;
  global: {
    winPct: number | null;
    modelBrier: number | null;
    marketBrier: number | null;
    brierEdge: number | null;
    reliability: number;
    baseDeltaMultiplier: number;
    confidenceAdjustment: number;
  };
  sourceWeights: Record<SourceKey, number>;
  sourceDetails: Record<SourceKey, NbaLearnedSourceWeight>;
  buckets: Record<string, NbaLearnedBucketRule>;
  warning: string | null;
};

export type NbaLearnedCalibrationInput = {
  rawHomeWinPct: number;
  marketHomeNoVigProbability?: number | null;
  confidence: number;
  volatilityIndex: number;
  sourceMap: Record<string, number>;
};

export type NbaLearnedCalibrationResult = {
  calibratedHomeWinPct: number;
  marketBaselineUsed: boolean;
  bucketKey: string;
  action: Action;
  deltaMultiplier: number;
  confidenceAdjustment: number;
  shouldPass: boolean;
  sourceLogitMove: number;
  reasons: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-clamp(value, -35, 35)));
}

function logit(probability: number) {
  const p = clamp(probability, 0.001, 0.999);
  return Math.log(p / (1 - p));
}

function brier(probability: number, outcome: 0 | 1) {
  return (probability - outcome) ** 2;
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function defaultSourceDetails(): Record<SourceKey, NbaLearnedSourceWeight> {
  return Object.fromEntries(SOURCE_KEYS.map((source) => [source, {
    source,
    count: 0,
    winPct: null,
    reliability: 0,
    weight: source === "history" ? 0.92 : 1,
    reason: "No graded NBA sample for this source yet."
  }])) as Record<SourceKey, NbaLearnedSourceWeight>;
}

function defaultCalibrator(warning: string): NbaLearnedCalibrator {
  const sourceDetails = defaultSourceDetails();
  return {
    ok: false,
    source: "fallback",
    trainedAt: new Date().toISOString(),
    rows: 0,
    usableMarketRows: 0,
    global: {
      winPct: null,
      modelBrier: null,
      marketBrier: null,
      brierEdge: null,
      reliability: 0.18,
      baseDeltaMultiplier: 0.36,
      confidenceAdjustment: -0.025
    },
    sourceWeights: Object.fromEntries(SOURCE_KEYS.map((source) => [source, sourceDetails[source].weight])) as Record<SourceKey, number>,
    sourceDetails,
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

function sourceMap(json: any): Record<SourceKey, number> {
  const map = Object.fromEntries(SOURCE_KEYS.map((source) => [source, 0])) as Record<SourceKey, number>;
  const factors = json?.nbaIntel?.factors ?? json?.realityIntel?.factors;
  if (!Array.isArray(factors)) return map;
  for (const factor of factors) {
    const source = String(factor?.source ?? "advanced") as SourceKey;
    if (!SOURCE_KEYS.includes(source)) continue;
    const value = safeNumber(factor?.value) ?? 0;
    const weight = safeNumber(factor?.weight) ?? 1;
    map[source] += value * weight;
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
  if (confidence < 0.70) return { key: "confidence:64-70", label: "Confidence 64-70%" };
  return { key: "confidence:70+", label: "Confidence 70%+" };
}

function sideBucket(modelHomeWinPct: number) {
  return modelHomeWinPct >= 0.5 ? { key: "side:home", label: "Model picked home" } : { key: "side:away", label: "Model picked away" };
}

function addBucket(map: Map<string, BucketAccumulator>, key: string, label: string, row: NormalizedRow, pickedWinner: 0 | 1) {
  const bucket = map.get(key) ?? { key, label, count: 0, wins: 0, modelBrier: 0, marketBrier: 0, marketCount: 0, confidenceSum: 0, confidenceCount: 0 };
  bucket.count += 1;
  if (pickedWinner === row.actualHomeWin) bucket.wins += 1;
  bucket.modelBrier += row.brier;
  if (row.marketBrier != null) {
    bucket.marketBrier += row.marketBrier;
    bucket.marketCount += 1;
  }
  if (row.confidence != null) {
    bucket.confidenceSum += row.confidence;
    bucket.confidenceCount += 1;
  }
  map.set(key, bucket);
}

function scoreBucket(bucket: BucketAccumulator): NbaLearnedBucketRule {
  const winPct = bucket.count ? bucket.wins / bucket.count : null;
  const modelBrier = bucket.count ? bucket.modelBrier / bucket.count : null;
  const marketBrier = bucket.marketCount ? bucket.marketBrier / bucket.marketCount : null;
  const brierEdge = modelBrier != null && marketBrier != null ? marketBrier - modelBrier : null;
  const avgConfidence = bucket.confidenceCount ? bucket.confidenceSum / bucket.confidenceCount : null;
  const reliability = bucket.count / (bucket.count + 45);
  let action: Action = "watch";
  let deltaMultiplier = 0.48 + reliability * 0.24;
  let confidenceAdjustment = 0;
  let reason = "NBA learned bucket is still building sample; keep market movement conservative.";

  if (bucket.count >= 14 && ((brierEdge != null && brierEdge < -0.01) || (winPct != null && winPct < 0.47))) {
    action = "pass";
    deltaMultiplier = 0.18;
    confidenceAdjustment = -0.065;
    reason = "This NBA bucket has been worse than market or below break-even; shrink hard and pass marginal edges.";
  } else if (bucket.count >= 24 && brierEdge != null && brierEdge > 0.006 && winPct != null && winPct >= 0.525) {
    action = bucket.count >= 60 && brierEdge > 0.014 && winPct >= 0.55 ? "attack" : "watch";
    deltaMultiplier = action === "attack" ? 1.06 : 0.82;
    confidenceAdjustment = action === "attack" ? 0.024 : 0.01;
    reason = "This NBA bucket has beaten the no-vig market baseline; allow stronger movement off market.";
  }

  if (avgConfidence != null && winPct != null && bucket.count >= 20) {
    const overconfidence = avgConfidence - winPct;
    if (overconfidence > 0.08) confidenceAdjustment -= 0.02;
    if (overconfidence < -0.06) confidenceAdjustment += 0.008;
  }

  return {
    key: bucket.key,
    label: bucket.label,
    count: bucket.count,
    winPct: round(winPct, 4),
    avgConfidence: round(avgConfidence, 4),
    modelBrier: round(modelBrier, 4),
    marketBrier: round(marketBrier, 4),
    brierEdge: round(brierEdge, 4),
    action,
    deltaMultiplier: round(deltaMultiplier, 4) ?? deltaMultiplier,
    confidenceAdjustment: round(confidenceAdjustment, 4) ?? confidenceAdjustment,
    reason
  };
}

function scoreSource(source: SourceKey, accumulator: SourceAccumulator): NbaLearnedSourceWeight {
  if (!accumulator.count) {
    return defaultSourceDetails()[source];
  }
  const winPct = accumulator.wins / accumulator.count;
  const reliability = accumulator.count / (accumulator.count + 40);
  const strength = clamp((winPct - 0.5) * 1.4 * reliability, -0.35, 0.35);
  const noisePenalty = clamp(accumulator.lossPenalty / Math.max(1, accumulator.count) * 0.12, 0, 0.12);
  const weight = clamp(1 + strength - noisePenalty, 0.68, 1.28);
  const reason = weight > 1.04
    ? "Source has aligned with NBA outcomes; increase its future influence."
    : weight < 0.96
      ? "Source has been noisy or wrong-side; reduce its future influence."
      : "Source is roughly neutral; keep near base weight.";
  return {
    source,
    count: accumulator.count,
    winPct: round(winPct, 4),
    reliability: round(reliability, 4) ?? reliability,
    weight: round(weight, 4) ?? weight,
    reason
  };
}

export async function trainNbaLearnedCalibrator(limit = 1000): Promise<NbaLearnedCalibrator> {
  if (!hasUsableServerDatabaseUrl()) return defaultCalibrator("No usable database URL; NBA learned calibrator is in fallback mode.");
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
    return defaultCalibrator("sim_prediction_snapshots is not available; capture and grade NBA picks before the learned calibrator can train.");
  }

  const rows = rawRows.map(normalizeRow).filter(Boolean) as NormalizedRow[];
  if (!rows.length) {
    const fallback = defaultCalibrator("No graded NBA decisions yet. Learned calibrator activates once NBA snapshots are captured and graded.");
    await writeHotCache(CALIBRATOR_KEY, fallback, TTL_SECONDS);
    return fallback;
  }

  const buckets = new Map<string, BucketAccumulator>();
  const sourceAccumulators = new Map<SourceKey, SourceAccumulator>();
  for (const source of SOURCE_KEYS) {
    sourceAccumulators.set(source, { source, count: 0, wins: 0, absSignal: 0, signedSignal: 0, lossPenalty: 0 });
  }

  let wins = 0;
  let modelBrier = 0;
  let marketBrier = 0;
  let usableMarketRows = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (const row of rows) {
    const pickedWinner = row.modelHomeWinPct >= 0.5 ? 1 : 0;
    if (pickedWinner === row.actualHomeWin) wins += 1;
    modelBrier += row.brier;
    if (row.marketBrier != null) {
      marketBrier += row.marketBrier;
      usableMarketRows += 1;
    }
    if (row.confidence != null) {
      confidenceSum += row.confidence;
      confidenceCount += 1;
    }

    const edge = edgeBucket(row.modelHomeWinPct, row.marketHomeWinPct);
    const confidence = confidenceBucket(row.confidence);
    const side = sideBucket(row.modelHomeWinPct);
    addBucket(buckets, "all", "All graded NBA picks", row, pickedWinner);
    addBucket(buckets, edge.key, edge.label, row, pickedWinner);
    addBucket(buckets, confidence.key, confidence.label, row, pickedWinner);
    addBucket(buckets, side.key, side.label, row, pickedWinner);
    addBucket(buckets, `tier:${row.tier ?? "missing"}`, `Tier ${row.tier ?? "missing"}`, row, pickedWinner);

    for (const source of SOURCE_KEYS) {
      const value = row.sourceMap[source] ?? 0;
      if (Math.abs(value) < 0.04) continue;
      const sourceWinner = value >= 0 ? 1 : 0;
      const accumulator = sourceAccumulators.get(source)!;
      accumulator.count += 1;
      accumulator.absSignal += Math.abs(value);
      accumulator.signedSignal += value;
      if (sourceWinner === row.actualHomeWin) accumulator.wins += 1;
      else accumulator.lossPenalty += Math.min(3, Math.abs(value));
    }
  }

  const globalModelBrier = modelBrier / rows.length;
  const globalMarketBrier = usableMarketRows ? marketBrier / usableMarketRows : null;
  const globalBrierEdge = globalMarketBrier == null ? null : globalMarketBrier - globalModelBrier;
  const winPct = wins / rows.length;
  const reliability = clamp(rows.length / (rows.length + 110), 0.16, 0.92);
  const avgConfidence = confidenceCount ? confidenceSum / confidenceCount : null;
  const overconfidence = avgConfidence == null ? 0 : avgConfidence - winPct;
  const baseDeltaMultiplier = globalBrierEdge == null
    ? 0.42 + reliability * 0.18
    : clamp(0.54 + globalBrierEdge * 14 + reliability * 0.12, 0.24, 1.05);
  const confidenceAdjustment = clamp((winPct - (avgConfidence ?? winPct)) * 0.16, -0.045, 0.025);
  const sourceDetails = Object.fromEntries(SOURCE_KEYS.map((source) => [source, scoreSource(source, sourceAccumulators.get(source)!)])) as Record<SourceKey, NbaLearnedSourceWeight>;
  const sourceWeights = Object.fromEntries(SOURCE_KEYS.map((source) => [source, sourceDetails[source].weight])) as Record<SourceKey, number>;
  const bucketRules = Object.fromEntries(Array.from(buckets.values()).map((bucket) => [bucket.key, scoreBucket(bucket)])) as Record<string, NbaLearnedBucketRule>;

  const calibrator: NbaLearnedCalibrator = {
    ok: rows.length >= 16,
    source: "graded-ledger",
    trainedAt: new Date().toISOString(),
    rows: rows.length,
    usableMarketRows,
    global: {
      winPct: round(winPct, 4),
      modelBrier: round(globalModelBrier, 4),
      marketBrier: round(globalMarketBrier, 4),
      brierEdge: round(globalBrierEdge, 4),
      reliability: round(reliability, 4) ?? reliability,
      baseDeltaMultiplier: round(baseDeltaMultiplier, 4) ?? baseDeltaMultiplier,
      confidenceAdjustment: round(confidenceAdjustment, 4) ?? confidenceAdjustment
    },
    sourceWeights,
    sourceDetails,
    buckets: bucketRules,
    warning: rows.length < 80
      ? "Small graded NBA sample. Learned calibrator is active but conservative until at least 80 graded NBA decisions exist."
      : overconfidence > 0.08
        ? "NBA confidence has been running hotter than realized win rate; confidence is being shrunk."
        : null
  };
  await writeHotCache(CALIBRATOR_KEY, calibrator, TTL_SECONDS);
  return calibrator;
}

export async function getCachedNbaLearnedCalibrator() {
  return readHotCache<NbaLearnedCalibrator>(CALIBRATOR_KEY);
}

export async function getOrTrainNbaLearnedCalibrator() {
  return (await getCachedNbaLearnedCalibrator()) ?? trainNbaLearnedCalibrator();
}

export function applyNbaLearnedCalibrator(calibrator: NbaLearnedCalibrator | null, input: NbaLearnedCalibrationInput): NbaLearnedCalibrationResult {
  const market = typeof input.marketHomeNoVigProbability === "number" && Number.isFinite(input.marketHomeNoVigProbability)
    ? clamp(input.marketHomeNoVigProbability, 0.02, 0.98)
    : null;
  const baseline = market ?? clamp(input.rawHomeWinPct, 0.02, 0.98);
  const edge = edgeBucket(input.rawHomeWinPct, market);
  const confidence = confidenceBucket(input.confidence);
  const side = sideBucket(input.rawHomeWinPct);
  const bucket = calibrator?.buckets?.[edge.key]
    ?? calibrator?.buckets?.[confidence.key]
    ?? calibrator?.buckets?.[side.key]
    ?? calibrator?.buckets?.all
    ?? null;

  const reliability = calibrator?.ok ? calibrator.global.reliability : 0.18;
  const bucketMultiplier = bucket?.deltaMultiplier ?? calibrator?.global.baseDeltaMultiplier ?? 0.36;
  const deltaMultiplier = clamp(bucketMultiplier * (0.74 + reliability * 0.32), 0.16, 1.12);
  const rawDelta = clamp(input.rawHomeWinPct - baseline, -0.24, 0.24);
  let sourceLogitMove = 0;
  for (const source of SOURCE_KEYS) {
    const signal = typeof input.sourceMap[source] === "number" ? input.sourceMap[source] : 0;
    const sourceWeight = calibrator?.sourceWeights?.[source] ?? (source === "history" ? 0.92 : 1);
    sourceLogitMove += clamp(signal, -3, 3) * (sourceWeight - 1) * 0.028 * reliability;
  }
  sourceLogitMove = clamp(sourceLogitMove, -0.11, 0.11);

  const learnedLogitMove = clamp(rawDelta * 4.15 * deltaMultiplier * (calibrator?.ok ? 1 : 0.58) + sourceLogitMove, -0.42, 0.42);
  const calibratedHomeWinPct = market == null
    ? clamp(0.5 + (input.rawHomeWinPct - 0.5) * clamp(0.58 + reliability * 0.22, 0.52, 0.82), 0.34, 0.66)
    : clamp(sigmoid(logit(baseline) + learnedLogitMove), 0.31, 0.69);
  const confidenceAdjustment = clamp((bucket?.confidenceAdjustment ?? 0) + (calibrator?.global.confidenceAdjustment ?? -0.025), -0.08, 0.045);
  const shouldPass = Boolean(
    (bucket?.action === "pass" && Math.abs(rawDelta) < 0.09) ||
    (!calibrator?.ok && Math.abs(rawDelta) < 0.055) ||
    (input.volatilityIndex >= 1.75 && Math.abs(calibratedHomeWinPct - baseline) < 0.04)
  );

  return {
    calibratedHomeWinPct: round(calibratedHomeWinPct, 4) ?? calibratedHomeWinPct,
    marketBaselineUsed: market != null,
    bucketKey: bucket?.key ?? edge.key,
    action: bucket?.action ?? "watch",
    deltaMultiplier: round(deltaMultiplier, 4) ?? deltaMultiplier,
    confidenceAdjustment,
    shouldPass,
    sourceLogitMove: round(sourceLogitMove, 5) ?? sourceLogitMove,
    reasons: [
      market == null
        ? "No NBA no-vig market baseline available; learned calibrator shrank model probability toward 50%."
        : "NBA no-vig market used as baseline; learned factor weights control movement away from market.",
      bucket ? `${bucket.label}: ${bucket.reason}` : "No learned NBA bucket matched yet; using conservative learned defaults.",
      calibrator?.ok
        ? `NBA learned calibrator trained on ${calibrator.rows} graded decisions (${calibrator.usableMarketRows} with market baseline).`
        : (calibrator?.warning ?? "NBA learned calibrator fallback mode is active."),
      `Learned probability ${round(calibratedHomeWinPct, 4)} from raw ${round(input.rawHomeWinPct, 4)}${market == null ? "" : ` and market ${round(market, 4)}`}.`
    ]
  };
}
