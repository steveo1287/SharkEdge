import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbIntelV7Ledgers } from "@/services/simulation/mlb-intel-v7-ledgers";

export type MlbV8PromotionMetricSet = {
  count: number;
  wins: number;
  losses: number;
  winRate: number | null;
  playerImpactRows: number;
  playerImpactRate: number | null;
  avgPlayerImpactConfidence: number | null;
  baselineBrier: number | null;
  v8ImpactBrier: number | null;
  finalCalibratedBrier: number | null;
  marketBrier: number | null;
  v8EdgeVsBaseline: number | null;
  finalEdgeVsBaseline: number | null;
  finalEdgeVsMarket: number | null;
  avgClv: number | null;
  avgEdge: number | null;
};

export type MlbV8PromotionBucket = MlbV8PromotionMetricSet & {
  bucket: string;
};

export type MlbV8PromotionReport = {
  ok: boolean;
  databaseReady: boolean;
  generatedAt: string;
  windowDays: number;
  modelVersion: string;
  status: "PROMOTE" | "SHADOW" | "BLOCK" | "INSUFFICIENT_DATA";
  summary: string;
  officialPicks: MlbV8PromotionMetricSet;
  snapshots: MlbV8PromotionMetricSet;
  buckets: {
    playerImpact: MlbV8PromotionBucket[];
    confidence: MlbV8PromotionBucket[];
    lift: MlbV8PromotionBucket[];
  };
  blockers: string[];
  warnings: string[];
  recommendations: string[];
};

type LedgerRow = {
  id: string;
  source: "official" | "snapshot";
  side: "HOME" | "AWAY";
  result: "WIN" | "LOSS";
  calibrated_probability: number | null;
  market_no_vig_probability: number | null;
  edge: number | null;
  clv: number | null;
  prediction_json: unknown;
};

type ScoredRow = LedgerRow & {
  baselineProbability: number | null;
  v8ImpactProbability: number | null;
  finalProbability: number | null;
  marketProbability: number | null;
  playerImpactApplied: boolean;
  playerImpactConfidence: number | null;
  baselineBrier: number | null;
  v8ImpactBrier: number | null;
  finalBrier: number | null;
  marketBrier: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function safeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sideProbability(side: "HOME" | "AWAY", homeProbability: number | null | undefined) {
  if (typeof homeProbability !== "number" || !Number.isFinite(homeProbability)) return null;
  const p = clamp(homeProbability, 0.001, 0.999);
  return side === "HOME" ? p : 1 - p;
}

function brier(probability: number | null, outcome: 0 | 1) {
  if (typeof probability !== "number" || !Number.isFinite(probability)) return null;
  return (probability - outcome) ** 2;
}

function avg(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function rowJson(row: LedgerRow) {
  const json = parseJsonObject(row.prediction_json);
  const rawDistribution = isRecord(json?.rawDistribution) ? json.rawDistribution : null;
  const playerImpactDistribution = isRecord(json?.playerImpactDistribution) ? json.playerImpactDistribution : null;
  const mlbIntel = isRecord(json?.mlbIntel) ? json.mlbIntel : null;
  const playerImpact = isRecord(mlbIntel?.playerImpact) ? mlbIntel.playerImpact : null;
  return { rawDistribution, playerImpactDistribution, playerImpact };
}

function scoreRow(row: LedgerRow): ScoredRow {
  const outcome = row.result === "WIN" ? 1 : 0;
  const { rawDistribution, playerImpactDistribution, playerImpact } = rowJson(row);
  const baselineProbability = sideProbability(row.side, safeNumber(rawDistribution?.homeWinPct));
  const v8ImpactProbability = sideProbability(row.side, safeNumber(playerImpactDistribution?.homeWinPct));
  const finalProbability = safeNumber(row.calibrated_probability);
  const marketProbability = safeNumber(row.market_no_vig_probability);
  const playerImpactConfidence = safeNumber(playerImpact?.confidence);
  const playerImpactApplied = playerImpact?.applied === true || typeof v8ImpactProbability === "number";

  return {
    ...row,
    baselineProbability,
    v8ImpactProbability,
    finalProbability,
    marketProbability,
    playerImpactApplied,
    playerImpactConfidence,
    baselineBrier: brier(baselineProbability, outcome),
    v8ImpactBrier: brier(v8ImpactProbability, outcome),
    finalBrier: brier(finalProbability, outcome),
    marketBrier: brier(marketProbability, outcome)
  };
}

function summarize(rows: ScoredRow[]): MlbV8PromotionMetricSet {
  const wins = rows.filter((row) => row.result === "WIN").length;
  const losses = rows.filter((row) => row.result === "LOSS").length;
  const playerImpactRows = rows.filter((row) => row.playerImpactApplied).length;
  const baselineBrier = avg(rows.map((row) => row.baselineBrier));
  const v8ImpactBrier = avg(rows.map((row) => row.v8ImpactBrier));
  const finalCalibratedBrier = avg(rows.map((row) => row.finalBrier));
  const marketBrier = avg(rows.map((row) => row.marketBrier));

  return {
    count: rows.length,
    wins,
    losses,
    winRate: rows.length ? round(wins / rows.length, 4) : null,
    playerImpactRows,
    playerImpactRate: rows.length ? round(playerImpactRows / rows.length, 4) : null,
    avgPlayerImpactConfidence: round(avg(rows.map((row) => row.playerImpactConfidence)), 3),
    baselineBrier: round(baselineBrier),
    v8ImpactBrier: round(v8ImpactBrier),
    finalCalibratedBrier: round(finalCalibratedBrier),
    marketBrier: round(marketBrier),
    v8EdgeVsBaseline: baselineBrier != null && v8ImpactBrier != null ? round(baselineBrier - v8ImpactBrier, 4) : null,
    finalEdgeVsBaseline: baselineBrier != null && finalCalibratedBrier != null ? round(baselineBrier - finalCalibratedBrier, 4) : null,
    finalEdgeVsMarket: marketBrier != null && finalCalibratedBrier != null ? round(marketBrier - finalCalibratedBrier, 4) : null,
    avgClv: round(avg(rows.map((row) => row.clv)), 3),
    avgEdge: round(avg(rows.map((row) => row.edge)))
  };
}

function bucketRows(rows: ScoredRow[], bucket: (row: ScoredRow) => string): MlbV8PromotionBucket[] {
  const map = new Map<string, ScoredRow[]>();
  for (const row of rows) {
    const label = bucket(row);
    const existing = map.get(label) ?? [];
    existing.push(row);
    map.set(label, existing);
  }
  return Array.from(map.entries()).map(([label, group]) => ({ bucket: label, ...summarize(group) }));
}

function liftBucket(row: ScoredRow) {
  if (row.baselineBrier == null || row.v8ImpactBrier == null) return "missing";
  const lift = row.baselineBrier - row.v8ImpactBrier;
  if (lift > 0.02) return "v8_clear_improve";
  if (lift > 0) return "v8_small_improve";
  if (lift > -0.02) return "v8_small_decline";
  return "v8_clear_decline";
}

function confidenceBucket(row: ScoredRow) {
  const confidence = row.playerImpactConfidence;
  if (confidence == null) return "missing";
  if (confidence < 0.4) return "low_confidence";
  if (confidence < 0.65) return "medium_confidence";
  return "high_confidence";
}

function impactBucket(row: ScoredRow) {
  return row.playerImpactApplied ? "player_impact_applied" : "player_impact_missing";
}

function verdict(metrics: MlbV8PromotionMetricSet, officialRows: ScoredRow[]) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (metrics.count < 50) blockers.push(`Only ${metrics.count} settled official picks. Keep V8 in shadow mode until at least 50 are settled.`);
  if (metrics.count >= 50 && metrics.count < 250) warnings.push(`Official sample is still thin at ${metrics.count}. Use tight gates.`);
  if (metrics.playerImpactRate != null && metrics.playerImpactRate < 0.5) blockers.push("Player-impact coverage is below 50% of settled official picks.");
  if (metrics.v8EdgeVsBaseline != null && metrics.v8EdgeVsBaseline < 0) blockers.push("V8 player-impact Brier is worse than the raw baseline on official picks.");
  if (metrics.finalEdgeVsMarket != null && metrics.finalEdgeVsMarket < 0) warnings.push("Final calibrated model is trailing the no-vig market Brier.");
  if (metrics.avgClv != null && metrics.avgClv < 0) warnings.push(`Average CLV is negative at ${metrics.avgClv.toFixed(3)}.`);

  const highConfidenceRows = officialRows.filter((row) => confidenceBucket(row) === "high_confidence");
  const highConfidence = summarize(highConfidenceRows);
  if (highConfidence.count >= 20 && highConfidence.v8EdgeVsBaseline != null && highConfidence.v8EdgeVsBaseline > 0) {
    recommendations.push("High-confidence player-impact bucket is beating baseline; consider allowing promotion only in that bucket first.");
  }
  if (metrics.count < 500) recommendations.push("Keep collecting shadow rows until 500+ settled official picks before broad V8 promotion.");
  if (metrics.playerImpactRate != null && metrics.playerImpactRate < 0.8) recommendations.push("Increase lineup, starter, bullpen, and injury coverage before aggressive V8 gating.");

  const status = metrics.count < 50 ? "INSUFFICIENT_DATA" : blockers.length ? "BLOCK" : warnings.length ? "SHADOW" : "PROMOTE";
  const summary = status === "PROMOTE"
    ? "V8 is clearing promotion checks on official settled rows."
    : status === "SHADOW"
      ? "V8 has useful signal, but warnings require restricted shadow or bucket-only promotion."
      : status === "BLOCK"
        ? "V8 has blockers and should not be promoted broadly."
        : "V8 needs more settled official picks before a promotion verdict.";

  return { status, summary, blockers, warnings, recommendations } as Pick<MlbV8PromotionReport, "status" | "summary" | "blockers" | "warnings" | "recommendations">;
}

async function readRows(windowDays: number, source: "official" | "snapshot") {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  if (source === "official") {
    return prisma.$queryRaw<LedgerRow[]>`
      SELECT id, 'official' AS source, side, result, calibrated_probability, market_no_vig_probability, edge, clv, prediction_json
      FROM mlb_official_pick_ledger
      WHERE result IN ('WIN', 'LOSS') AND released_at >= ${since}
      ORDER BY released_at DESC
      LIMIT 5000;
    `;
  }

  return prisma.$queryRaw<LedgerRow[]>`
    SELECT id, 'snapshot' AS source, side, result, calibrated_probability, market_no_vig_probability, edge, clv, prediction_json
    FROM mlb_model_snapshot_ledger
    WHERE result IN ('WIN', 'LOSS') AND captured_at >= ${since}
    ORDER BY captured_at DESC
    LIMIT 10000;
  `;
}

export async function getMlbV8PromotionReport(windowDays = 180): Promise<MlbV8PromotionReport> {
  const generatedAt = new Date().toISOString();
  const safeWindowDays = Math.max(1, Math.min(3650, Math.round(windowDays)));
  const databaseReady = hasUsableServerDatabaseUrl() && await ensureMlbIntelV7Ledgers();

  if (!databaseReady) {
    const empty = summarize([]);
    return {
      ok: false,
      databaseReady: false,
      generatedAt,
      windowDays: safeWindowDays,
      modelVersion: "mlb-intel-v8-player-impact+v7-calibration",
      status: "BLOCK",
      summary: "Database unavailable; V8 promotion cannot be scored.",
      officialPicks: empty,
      snapshots: empty,
      buckets: { playerImpact: [], confidence: [], lift: [] },
      blockers: ["No usable server database URL is configured."],
      warnings: [],
      recommendations: ["Restore database access before trusting V8 promotion status."]
    };
  }

  const [officialRowsRaw, snapshotRowsRaw] = await Promise.all([
    readRows(safeWindowDays, "official"),
    readRows(safeWindowDays, "snapshot")
  ]);
  const officialRows = officialRowsRaw.map(scoreRow);
  const snapshotRows = snapshotRowsRaw.map(scoreRow);
  const officialPicks = summarize(officialRows);
  const gate = verdict(officialPicks, officialRows);

  return {
    ok: true,
    databaseReady: true,
    generatedAt,
    windowDays: safeWindowDays,
    modelVersion: "mlb-intel-v8-player-impact+v7-calibration",
    ...gate,
    officialPicks,
    snapshots: summarize(snapshotRows),
    buckets: {
      playerImpact: bucketRows(officialRows, impactBucket),
      confidence: bucketRows(officialRows, confidenceBucket),
      lift: bucketRows(officialRows, liftBucket)
    }
  };
}
