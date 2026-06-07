import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

export type MlbV8PlayerImpactWeights = {
  starterRunWeight: number;
  bullpenRunWeight: number;
  runDeltaCap: number;
  runProbabilityScale: number;
  probabilityBlendMin: number;
  probabilityBlendMax: number;
  confirmedLineupBonus: number;
  injuryPenaltyPerPlayer: number;
  unavailableRelieverPenalty: number;
  hitterWeights: {
    contact: number;
    power: number;
    discipline: number;
    split: number;
    currentForm: number;
    baserunning: number;
    fielding: number;
  };
  pitcherWeights: {
    xeraQuality: number;
    fipQuality: number;
    kBb: number;
    hrRiskAvoidance: number;
    groundballRate: number;
    platoonSplit: number;
    stamina: number;
    workloadFreshness: number;
    arsenalQuality: number;
  };
};

export type MlbV8PlayerImpactProfile = {
  modelVersion: "mlb-intel-v8-player-impact";
  status: "DEFAULT" | "LEARNED" | "SAMPLE_TOO_SMALL";
  sampleSize: number;
  trainedAt: string | null;
  weights: MlbV8PlayerImpactWeights;
  metrics: Record<string, unknown>;
};

export type MlbV8PlayerImpactTrainingRow = {
  rowSource?: "snapshot" | "official" | string | null;
  result: "WIN" | "LOSS";
  side: "HOME" | "AWAY";
  raw_probability?: number | null;
  calibrated_probability?: number | null;
  market_no_vig_probability?: number | null;
  edge?: number | null;
  brier?: number | null;
  log_loss?: number | null;
  prediction_json: unknown;
};

type MlbV8PlayerImpactFeatureRow = {
  rowSource: string;
  y: 0 | 1;
  side: "HOME" | "AWAY";
  rawSideProbability: number;
  calibratedSideProbability: number;
  rosterAdjustedSideProbability: number;
  marketSideProbability: number | null;
  edge: number | null;
  signedOffenseEdge: number;
  signedStarterEdge: number;
  signedBullpenEdge: number;
  signedRunDeltaEdge: number;
  signedProbabilityLift: number;
  absRunDeltaEdge: number;
  confidence: number;
};

type EdgeBucket = "negative" | "neutral" | "positive";

export const DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS: MlbV8PlayerImpactWeights = {
  starterRunWeight: 0.026,
  bullpenRunWeight: 0.012,
  runDeltaCap: 0.85,
  runProbabilityScale: 0.55,
  probabilityBlendMin: 0.25,
  probabilityBlendMax: 0.55,
  confirmedLineupBonus: 0.4,
  injuryPenaltyPerPlayer: 0.9,
  unavailableRelieverPenalty: 1.8,
  hitterWeights: {
    contact: 0.2,
    power: 0.24,
    discipline: 0.18,
    split: 0.22,
    currentForm: 0.1,
    baserunning: 0.04,
    fielding: 0.02
  },
  pitcherWeights: {
    xeraQuality: 0.24,
    fipQuality: 0.2,
    kBb: 0.16,
    hrRiskAvoidance: 0.1,
    groundballRate: 0.06,
    platoonSplit: 0.08,
    stamina: 0.05,
    workloadFreshness: 0.04,
    arsenalQuality: 0.07
  }
};

export const DEFAULT_MLB_V8_PLAYER_IMPACT_PROFILE: MlbV8PlayerImpactProfile = {
  modelVersion: "mlb-intel-v8-player-impact",
  status: "DEFAULT",
  sampleSize: 0,
  trainedAt: null,
  weights: DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS,
  metrics: { source: "hard-coded-default" }
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function normalizeWeights<T extends Record<string, number>>(weights: T) {
  const total = Object.values(weights).reduce((sum, value) => sum + Math.max(0, value), 0);
  if (!Number.isFinite(total) || total <= 0) return weights;
  return Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, round(Math.max(0, value) / total, 4)])) as T;
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

function playerImpact(value: unknown): Record<string, unknown> | null {
  const json = predictionJsonObject(value);
  const mlbIntel = isRecord(json?.mlbIntel) ? json.mlbIntel : null;
  const impact = isRecord(mlbIntel?.playerImpact) ? mlbIntel.playerImpact : null;
  return impact;
}

function homeFeatureEdge(impact: Record<string, unknown>) {
  const homeOffense = numberFrom(impact.homeOffenseScore);
  const awayOffense = numberFrom(impact.awayOffenseScore);
  const homeStarter = numberFrom(impact.homeStarterScore);
  const awayStarter = numberFrom(impact.awayStarterScore);
  const homeBullpen = numberFrom(impact.homeBullpenScore);
  const awayBullpen = numberFrom(impact.awayBullpenScore);
  const homeRunDelta = numberFrom(impact.homeRunDelta);
  const awayRunDelta = numberFrom(impact.awayRunDelta);
  const adjustedHome = numberFrom(impact.adjustedHomeWinPct);
  const rawHome = numberFrom(impact.rawHomeWinPct);
  const confidence = numberFrom(impact.confidence);

  if ([homeOffense, awayOffense, homeStarter, awayStarter, homeBullpen, awayBullpen, homeRunDelta, awayRunDelta, adjustedHome, rawHome].some((value) => value == null)) {
    return null;
  }

  return {
    offenseEdge: homeOffense! - awayOffense!,
    starterEdge: homeStarter! - awayStarter!,
    bullpenEdge: homeBullpen! - awayBullpen!,
    runDeltaEdge: homeRunDelta! - awayRunDelta!,
    probabilityLift: adjustedHome! - rawHome!,
    rawHomeWinPct: rawHome!,
    adjustedHomeWinPct: adjustedHome!,
    confidence: clamp(confidence ?? 0.5, 0, 1)
  };
}

function sideProbabilityFromHome(side: "HOME" | "AWAY", homeProbability: number) {
  return side === "HOME" ? homeProbability : 1 - homeProbability;
}

function signedForSide(side: "HOME" | "AWAY", homeEdge: number) {
  return side === "HOME" ? homeEdge : -homeEdge;
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

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function correlation(rows: Array<{ x: number; y: number }>) {
  if (rows.length < 3) return 0;
  const xMean = rows.reduce((sum, row) => sum + row.x, 0) / rows.length;
  const yMean = rows.reduce((sum, row) => sum + row.y, 0) / rows.length;
  const numerator = rows.reduce((sum, row) => sum + (row.x - xMean) * (row.y - yMean), 0);
  const xVar = rows.reduce((sum, row) => sum + (row.x - xMean) ** 2, 0);
  const yVar = rows.reduce((sum, row) => sum + (row.y - yMean) ** 2, 0);
  const denominator = Math.sqrt(xVar * yVar);
  return denominator > 0 ? numerator / denominator : 0;
}

function bucket(value: number): EdgeBucket {
  if (value >= 0.015) return "positive";
  if (value <= -0.015) return "negative";
  return "neutral";
}

function bucketMetrics(rows: MlbV8PlayerImpactFeatureRow[]) {
  const output: Record<EdgeBucket, { count: number; winRate: number; avgLift: number; avgRunDeltaEdge: number }> = {
    negative: { count: 0, winRate: 0, avgLift: 0, avgRunDeltaEdge: 0 },
    neutral: { count: 0, winRate: 0, avgLift: 0, avgRunDeltaEdge: 0 },
    positive: { count: 0, winRate: 0, avgLift: 0, avgRunDeltaEdge: 0 }
  };

  for (const key of Object.keys(output) as EdgeBucket[]) {
    const slice = rows.filter((row) => bucket(row.signedProbabilityLift) === key);
    output[key] = {
      count: slice.length,
      winRate: round(mean(slice.map((row) => row.y)), 4),
      avgLift: round(mean(slice.map((row) => row.signedProbabilityLift)), 4),
      avgRunDeltaEdge: round(mean(slice.map((row) => row.signedRunDeltaEdge)), 4)
    };
  }

  return output;
}

function sourceCounts(rows: MlbV8PlayerImpactFeatureRow[]) {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.rowSource] = (counts[row.rowSource] ?? 0) + 1;
  return counts;
}

function deepMergeWeights(input: unknown): MlbV8PlayerImpactWeights {
  const raw = isRecord(input) ? input : {};
  const hitter = isRecord(raw.hitterWeights) ? raw.hitterWeights : {};
  const pitcher = isRecord(raw.pitcherWeights) ? raw.pitcherWeights : {};
  return {
    ...DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS,
    ...raw,
    hitterWeights: { ...DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.hitterWeights, ...hitter },
    pitcherWeights: { ...DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.pitcherWeights, ...pitcher }
  } as MlbV8PlayerImpactWeights;
}

export function buildMlbV8PlayerImpactTrainingRows(rows: MlbV8PlayerImpactTrainingRow[]): MlbV8PlayerImpactFeatureRow[] {
  return rows.flatMap((row) => {
    const impact = playerImpact(row.prediction_json);
    const features = impact ? homeFeatureEdge(impact) : null;
    const rawSideProbability = numberFrom(row.raw_probability);
    const calibratedSideProbability = numberFrom(row.calibrated_probability);
    if (!features || rawSideProbability == null || calibratedSideProbability == null) return [];

    const y = row.result === "WIN" ? 1 : 0;
    const rosterAdjustedSideProbability = sideProbabilityFromHome(row.side, features.adjustedHomeWinPct);
    const marketHomeProbability = numberFrom(row.market_no_vig_probability);
    const marketSideProbability = marketHomeProbability == null ? null : sideProbabilityFromHome(row.side, marketHomeProbability);

    return [{
      rowSource: row.rowSource ?? "snapshot",
      y,
      side: row.side,
      rawSideProbability: clamp(rawSideProbability, 0.001, 0.999),
      calibratedSideProbability: clamp(calibratedSideProbability, 0.001, 0.999),
      rosterAdjustedSideProbability: clamp(rosterAdjustedSideProbability, 0.001, 0.999),
      marketSideProbability,
      edge: numberFrom(row.edge),
      signedOffenseEdge: signedForSide(row.side, features.offenseEdge),
      signedStarterEdge: signedForSide(row.side, features.starterEdge),
      signedBullpenEdge: signedForSide(row.side, features.bullpenEdge),
      signedRunDeltaEdge: signedForSide(row.side, features.runDeltaEdge),
      signedProbabilityLift: rosterAdjustedSideProbability - sideProbabilityFromHome(row.side, features.rawHomeWinPct),
      absRunDeltaEdge: Math.abs(features.runDeltaEdge),
      confidence: features.confidence
    }];
  });
}

export function fitMlbV8PlayerImpactProfileFromRows(rows: MlbV8PlayerImpactTrainingRow[], trainedAt = new Date().toISOString()): MlbV8PlayerImpactProfile {
  const featureRows = buildMlbV8PlayerImpactTrainingRows(rows);
  const sampleSize = featureRows.length;
  const reliability = clamp((sampleSize - 75) / 725, 0, 1);

  const offenseCorr = correlation(featureRows.map((row) => ({ x: row.signedOffenseEdge, y: row.y })));
  const starterCorr = correlation(featureRows.map((row) => ({ x: row.signedStarterEdge, y: row.y })));
  const bullpenCorr = correlation(featureRows.map((row) => ({ x: row.signedBullpenEdge, y: row.y })));
  const runDeltaCorr = correlation(featureRows.map((row) => ({ x: row.signedRunDeltaEdge, y: row.y })));
  const liftCorr = correlation(featureRows.map((row) => ({ x: row.signedProbabilityLift, y: row.y })));

  const rawBrier = mean(featureRows.map((row) => brier(row.rawSideProbability, row.y)));
  const rosterAdjustedBrier = mean(featureRows.map((row) => brier(row.rosterAdjustedSideProbability, row.y)));
  const finalBrier = mean(featureRows.map((row) => brier(row.calibratedSideProbability, row.y)));
  const rawLogLoss = mean(featureRows.map((row) => logLoss(row.rawSideProbability, row.y)));
  const rosterAdjustedLogLoss = mean(featureRows.map((row) => logLoss(row.rosterAdjustedSideProbability, row.y)));
  const finalLogLoss = mean(featureRows.map((row) => logLoss(row.calibratedSideProbability, row.y)));
  const rawAccuracy = mean(featureRows.map((row) => accuracy(row.rawSideProbability, row.y)));
  const rosterAdjustedAccuracy = mean(featureRows.map((row) => accuracy(row.rosterAdjustedSideProbability, row.y)));
  const finalAccuracy = mean(featureRows.map((row) => accuracy(row.calibratedSideProbability, row.y)));
  const rosterDirectionHitRate = mean(featureRows
    .filter((row) => Math.abs(row.signedProbabilityLift) >= 0.005)
    .map((row) => row.signedProbabilityLift > 0 ? row.y : 1 - row.y));
  const brierImprovement = rawBrier - rosterAdjustedBrier;
  const logLossImprovement = rawLogLoss - rosterAdjustedLogLoss;
  const rosterHelped = sampleSize >= 30 && (brierImprovement > 0 || logLossImprovement > 0 || liftCorr > 0.02);

  const base = DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS;
  const offenseScale = clamp(1 + reliability * offenseCorr * 0.5, 0.72, 1.28);
  const starterScale = clamp(1 + reliability * starterCorr * 0.85, 0.58, 1.45);
  const bullpenScale = clamp(1 + reliability * bullpenCorr * 0.7, 0.62, 1.38);
  const runDeltaScale = clamp(1 + reliability * runDeltaCorr * 0.55, 0.7, 1.35);
  const brierScale = clamp(1 + reliability * brierImprovement * 5.5, 0.74, 1.24);
  const liftScale = clamp(1 + reliability * liftCorr * 0.5, 0.72, 1.26);
  const directionScale = clamp(0.8 + rosterDirectionHitRate * 0.4, 0.72, 1.16);
  const guardScale = rosterHelped ? 1 : clamp(0.78 + reliability * 0.08, 0.72, 0.86);
  const hitterShape = clamp(Math.abs(offenseCorr) * reliability, 0, 1);
  const starterShape = clamp(Math.abs(starterCorr) * reliability, 0, 1);
  const bullpenShape = clamp(Math.abs(bullpenCorr) * reliability, 0, 1);

  const learnedWeights: MlbV8PlayerImpactWeights = {
    ...base,
    starterRunWeight: round(base.starterRunWeight * starterScale * runDeltaScale * guardScale, 5),
    bullpenRunWeight: round(base.bullpenRunWeight * bullpenScale * runDeltaScale * guardScale, 5),
    runDeltaCap: round(clamp(base.runDeltaCap * (rosterHelped ? 1 + reliability * 0.08 : 0.82), 0.55, 0.95), 4),
    runProbabilityScale: round(clamp(base.runProbabilityScale * brierScale * liftScale * guardScale, 0.34, 0.78), 4),
    probabilityBlendMin: round(clamp(base.probabilityBlendMin * (rosterHelped ? 1 : 0.82), 0.16, 0.32), 4),
    probabilityBlendMax: round(clamp(base.probabilityBlendMax * brierScale * liftScale * directionScale * guardScale, 0.34, 0.66), 4),
    hitterWeights: normalizeWeights({
      contact: base.hitterWeights.contact * offenseScale * (1 + hitterShape * 0.16),
      power: base.hitterWeights.power * offenseScale * (1 + hitterShape * 0.24),
      discipline: base.hitterWeights.discipline * offenseScale * (1 + hitterShape * 0.14),
      split: base.hitterWeights.split * offenseScale * (1 + hitterShape * 0.22),
      currentForm: base.hitterWeights.currentForm * offenseScale * (1 + hitterShape * 0.12),
      baserunning: base.hitterWeights.baserunning * (1 - hitterShape * 0.08),
      fielding: base.hitterWeights.fielding * (1 - hitterShape * 0.08)
    }),
    pitcherWeights: normalizeWeights({
      xeraQuality: base.pitcherWeights.xeraQuality * starterScale * (1 + starterShape * 0.16),
      fipQuality: base.pitcherWeights.fipQuality * starterScale * (1 + starterShape * 0.14),
      kBb: base.pitcherWeights.kBb * starterScale * (1 + starterShape * 0.14),
      hrRiskAvoidance: base.pitcherWeights.hrRiskAvoidance * (1 + bullpenShape * 0.08),
      groundballRate: base.pitcherWeights.groundballRate * (1 + bullpenShape * 0.06),
      platoonSplit: base.pitcherWeights.platoonSplit * (1 + starterShape * 0.08),
      stamina: base.pitcherWeights.stamina * (1 + starterShape * 0.05),
      workloadFreshness: base.pitcherWeights.workloadFreshness * bullpenScale * (1 + bullpenShape * 0.22),
      arsenalQuality: base.pitcherWeights.arsenalQuality * starterScale * (1 + starterShape * 0.12)
    })
  };

  const status: MlbV8PlayerImpactProfile["status"] = sampleSize >= 150 ? "LEARNED" : "SAMPLE_TOO_SMALL";
  return {
    modelVersion: "mlb-intel-v8-player-impact",
    status,
    sampleSize,
    trainedAt,
    weights: sampleSize >= 30 ? learnedWeights : base,
    metrics: {
      source: "historical-ledger-roster-accuracy",
      leakageGuard: "captured_at <= start_time; result IN WIN/LOSS; side-normalized roster deltas",
      reliability: round(reliability, 4),
      rosterHelped,
      sourceCounts: sourceCounts(featureRows),
      rawAccuracy: round(rawAccuracy, 4),
      rosterAdjustedAccuracy: round(rosterAdjustedAccuracy, 4),
      finalAccuracy: round(finalAccuracy, 4),
      rawBrier: round(rawBrier, 5),
      rosterAdjustedBrier: round(rosterAdjustedBrier, 5),
      finalBrier: round(finalBrier, 5),
      brierImprovement: round(brierImprovement, 5),
      rawLogLoss: round(rawLogLoss, 5),
      rosterAdjustedLogLoss: round(rosterAdjustedLogLoss, 5),
      finalLogLoss: round(finalLogLoss, 5),
      logLossImprovement: round(logLossImprovement, 5),
      rosterDirectionHitRate: round(rosterDirectionHitRate, 4),
      offenseCorr: round(offenseCorr, 4),
      starterCorr: round(starterCorr, 4),
      bullpenCorr: round(bullpenCorr, 4),
      runDeltaCorr: round(runDeltaCorr, 4),
      probabilityLiftCorr: round(liftCorr, 4),
      liftBuckets: bucketMetrics(featureRows),
      sourceRows: rows.length
    }
  };
}

export async function ensureMlbV8PlayerImpactProfileTable() {
  if (!hasUsableServerDatabaseUrl()) return false;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mlb_v8_player_impact_profiles (
      id TEXT PRIMARY KEY,
      model_version TEXT NOT NULL DEFAULT 'mlb-intel-v8-player-impact',
      status TEXT NOT NULL,
      sample_size INTEGER NOT NULL DEFAULT 0,
      weights_json JSONB NOT NULL,
      metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      trained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mlb_v8_player_impact_profiles_active_idx ON mlb_v8_player_impact_profiles (model_version, is_active, trained_at DESC);`);
  return true;
}

export async function getActiveMlbV8PlayerImpactProfile(): Promise<MlbV8PlayerImpactProfile> {
  const ready = await ensureMlbV8PlayerImpactProfileTable();
  if (!ready) return DEFAULT_MLB_V8_PLAYER_IMPACT_PROFILE;

  const rows = await prisma.$queryRaw<Array<{ status: string; sample_size: number; weights_json: unknown; metrics_json: unknown; trained_at: Date }>>`
    SELECT status, sample_size, weights_json, metrics_json, trained_at
    FROM mlb_v8_player_impact_profiles
    WHERE model_version = 'mlb-intel-v8-player-impact' AND is_active = TRUE
    ORDER BY trained_at DESC
    LIMIT 1;
  `;
  const row = rows[0];
  if (!row || !isRecord(row.weights_json)) return DEFAULT_MLB_V8_PLAYER_IMPACT_PROFILE;

  return {
    modelVersion: "mlb-intel-v8-player-impact",
    status: row.status === "LEARNED" || row.status === "SAMPLE_TOO_SMALL" ? row.status : "DEFAULT",
    sampleSize: Number(row.sample_size ?? 0),
    trainedAt: row.trained_at.toISOString(),
    weights: deepMergeWeights(row.weights_json),
    metrics: isRecord(row.metrics_json) ? row.metrics_json : {}
  };
}

export async function fitAndPersistMlbV8PlayerImpactProfile(limit = 5000) {
  const ready = await ensureMlbV8PlayerImpactProfileTable();
  if (!ready) return { ok: false, profile: DEFAULT_MLB_V8_PLAYER_IMPACT_PROFILE, error: "No usable server database URL is configured." };

  const rows = await prisma.$queryRaw<MlbV8PlayerImpactTrainingRow[]>`
    WITH training_rows AS (
      SELECT
        'snapshot'::text AS "rowSource",
        result,
        side,
        raw_probability,
        calibrated_probability,
        market_no_vig_probability,
        edge,
        brier,
        log_loss,
        prediction_json,
        captured_at,
        start_time
      FROM mlb_model_snapshot_ledger
      WHERE result IN ('WIN', 'LOSS')
        AND prediction_json IS NOT NULL
        AND prediction_json::text LIKE '%playerImpact%'
      UNION ALL
      SELECT
        'official'::text AS "rowSource",
        result,
        side,
        raw_probability,
        calibrated_probability,
        market_no_vig_probability,
        edge,
        brier,
        log_loss,
        prediction_json,
        captured_at,
        start_time
      FROM mlb_official_pick_ledger
      WHERE result IN ('WIN', 'LOSS')
        AND prediction_json IS NOT NULL
        AND prediction_json::text LIKE '%playerImpact%'
    )
    SELECT "rowSource", result, side, raw_probability, calibrated_probability, market_no_vig_probability, edge, brier, log_loss, prediction_json
    FROM training_rows
    WHERE captured_at <= start_time
    ORDER BY captured_at DESC
    LIMIT ${Math.max(50, Math.min(25000, Math.round(limit)))};
  `;

  const profile = fitMlbV8PlayerImpactProfileFromRows(rows);

  await prisma.$executeRaw`UPDATE mlb_v8_player_impact_profiles SET is_active = FALSE WHERE model_version = 'mlb-intel-v8-player-impact';`;
  await prisma.$executeRaw`
    INSERT INTO mlb_v8_player_impact_profiles (id, model_version, status, sample_size, weights_json, metrics_json, is_active, trained_at)
    VALUES (${crypto.randomUUID()}, 'mlb-intel-v8-player-impact', ${profile.status}, ${profile.sampleSize}, ${safeJson(profile.weights)}::jsonb, ${safeJson(profile.metrics)}::jsonb, TRUE, now());
  `;

  return { ok: true, profile };
}
