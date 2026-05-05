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

type TrainingRow = {
  result: "WIN" | "LOSS";
  prediction_json: unknown;
};

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

function featureEdge(impact: Record<string, unknown>) {
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

  if ([homeOffense, awayOffense, homeStarter, awayStarter, homeBullpen, awayBullpen, homeRunDelta, awayRunDelta, adjustedHome, rawHome].some((value) => value == null)) {
    return null;
  }

  return {
    offenseEdge: homeOffense! - awayOffense!,
    starterEdge: homeStarter! - awayStarter!,
    bullpenEdge: homeBullpen! - awayBullpen!,
    runDeltaEdge: homeRunDelta! - awayRunDelta!,
    probabilityLift: adjustedHome! - rawHome!
  };
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
    weights: { ...DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS, ...(row.weights_json as Partial<MlbV8PlayerImpactWeights>) },
    metrics: isRecord(row.metrics_json) ? row.metrics_json : {}
  };
}

export async function fitAndPersistMlbV8PlayerImpactProfile(limit = 2000) {
  const ready = await ensureMlbV8PlayerImpactProfileTable();
  if (!ready) return { ok: false, profile: DEFAULT_MLB_V8_PLAYER_IMPACT_PROFILE, error: "No usable server database URL is configured." };

  const rows = await prisma.$queryRaw<TrainingRow[]>`
    SELECT result, prediction_json
    FROM mlb_model_snapshot_ledger
    WHERE result IN ('WIN', 'LOSS')
      AND prediction_json IS NOT NULL
      AND prediction_json::text LIKE '%playerImpact%'
    ORDER BY captured_at DESC
    LIMIT ${Math.max(50, Math.min(10000, Math.round(limit)))};
  `;

  const featureRows = rows
    .map((row) => {
      const impact = playerImpact(row.prediction_json);
      const features = impact ? featureEdge(impact) : null;
      return features ? { ...features, y: row.result === "WIN" ? 1 : 0 } : null;
    })
    .filter((row): row is { offenseEdge: number; starterEdge: number; bullpenEdge: number; runDeltaEdge: number; probabilityLift: number; y: number } => Boolean(row));

  const sampleSize = featureRows.length;
  const offenseCorr = correlation(featureRows.map((row) => ({ x: row.offenseEdge, y: row.y })));
  const starterCorr = correlation(featureRows.map((row) => ({ x: row.starterEdge, y: row.y })));
  const bullpenCorr = correlation(featureRows.map((row) => ({ x: row.bullpenEdge, y: row.y })));
  const runDeltaCorr = correlation(featureRows.map((row) => ({ x: row.runDeltaEdge, y: row.y })));
  const liftCorr = correlation(featureRows.map((row) => ({ x: row.probabilityLift, y: row.y })));
  const reliability = clamp((sampleSize - 50) / 450, 0, 1);

  const base = DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS;
  const starterScale = clamp(1 + reliability * starterCorr * 0.7, 0.6, 1.4);
  const bullpenScale = clamp(1 + reliability * bullpenCorr * 0.55, 0.65, 1.35);
  const offenseScale = clamp(1 + reliability * offenseCorr * 0.35, 0.75, 1.25);
  const probabilityScale = clamp(base.runProbabilityScale * (1 + reliability * liftCorr * 0.5), 0.38, 0.72);
  const blendMax = clamp(base.probabilityBlendMax * (1 + reliability * Math.abs(runDeltaCorr) * 0.25), 0.45, 0.62);

  const learnedWeights: MlbV8PlayerImpactWeights = {
    ...base,
    starterRunWeight: round(base.starterRunWeight * starterScale, 5),
    bullpenRunWeight: round(base.bullpenRunWeight * bullpenScale, 5),
    runProbabilityScale: round(probabilityScale, 4),
    probabilityBlendMax: round(blendMax, 4),
    hitterWeights: normalizeWeights(Object.fromEntries(Object.entries(base.hitterWeights).map(([key, value]) => [key, value * offenseScale])) as MlbV8PlayerImpactWeights["hitterWeights"]),
    pitcherWeights: normalizeWeights({
      ...base.pitcherWeights,
      xeraQuality: base.pitcherWeights.xeraQuality * starterScale,
      fipQuality: base.pitcherWeights.fipQuality * starterScale,
      kBb: base.pitcherWeights.kBb * starterScale,
      arsenalQuality: base.pitcherWeights.arsenalQuality * starterScale,
      workloadFreshness: base.pitcherWeights.workloadFreshness * bullpenScale
    })
  };

  const status: MlbV8PlayerImpactProfile["status"] = sampleSize >= 100 ? "LEARNED" : "SAMPLE_TOO_SMALL";
  const profile: MlbV8PlayerImpactProfile = {
    modelVersion: "mlb-intel-v8-player-impact",
    status,
    sampleSize,
    trainedAt: new Date().toISOString(),
    weights: sampleSize >= 30 ? learnedWeights : base,
    metrics: {
      reliability: round(reliability, 4),
      offenseCorr: round(offenseCorr, 4),
      starterCorr: round(starterCorr, 4),
      bullpenCorr: round(bullpenCorr, 4),
      runDeltaCorr: round(runDeltaCorr, 4),
      probabilityLiftCorr: round(liftCorr, 4),
      sourceRows: rows.length
    }
  };

  await prisma.$executeRaw`UPDATE mlb_v8_player_impact_profiles SET is_active = FALSE WHERE model_version = 'mlb-intel-v8-player-impact';`;
  await prisma.$executeRaw`
    INSERT INTO mlb_v8_player_impact_profiles (id, model_version, status, sample_size, weights_json, metrics_json, is_active, trained_at)
    VALUES (${crypto.randomUUID()}, 'mlb-intel-v8-player-impact', ${profile.status}, ${profile.sampleSize}, ${safeJson(profile.weights)}::jsonb, ${safeJson(profile.metrics)}::jsonb, TRUE, now());
  `;

  return { ok: true, profile };
}
