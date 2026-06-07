import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbIntelV7Ledgers } from "@/services/simulation/mlb-intel-v7-ledgers";
import { buildMlbCalibrationRecommendations } from "@/services/simulation/mlb-calibration-recommendations";

export type MlbCalibrationMetricSet = {
  count: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgProbability: number | null;
  brier: number | null;
  logLoss: number | null;
  marketBrier: number | null;
  marketLogLoss: number | null;
  brierEdgeVsMarket: number | null;
  logLossEdgeVsMarket: number | null;
  neutralBrier: number;
  neutralLogLoss: number;
  avgEdge: number | null;
  avgClv: number | null;
  roi: number | null;
};

export type MlbCalibrationBucket = MlbCalibrationMetricSet & {
  bucket: string;
  min: number | null;
  max: number | null;
};

export type MlbCalibrationLabReport = {
  ok: boolean;
  databaseReady: boolean;
  generatedAt: string;
  windowDays: number;
  modelVersion: string;
  officialPicks: MlbCalibrationMetricSet;
  candidatePicks: MlbCalibrationMetricSet;
  snapshots: MlbCalibrationMetricSet;
  buckets: {
    probability: MlbCalibrationBucket[];
    edge: MlbCalibrationBucket[];
    clv: MlbCalibrationBucket[];
    tier: MlbCalibrationBucket[];
    playerImpact: MlbCalibrationBucket[];
    profileStatus: MlbCalibrationBucket[];
    candidateProbability: MlbCalibrationBucket[];
    candidateEdge: MlbCalibrationBucket[];
    candidateHomeAway: MlbCalibrationBucket[];
    candidateFavoriteUnderdog: MlbCalibrationBucket[];
    candidateOdds: MlbCalibrationBucket[];
    candidateMarketSource: MlbCalibrationBucket[];
    candidateClv: MlbCalibrationBucket[];
  };
  verdict: {
    status: "GREEN" | "YELLOW" | "RED" | "INSUFFICIENT_DATA";
    summary: string;
    blockers: string[];
    warnings: string[];
    recommendations: string[];
  };
  recommendations: string[];
  baselines: {
    neutralBrier: number;
    neutralLogLoss: number;
  };
};

type LedgerRow = {
  id: string;
  source: "official" | "candidate" | "snapshot";
  side?: string | null;
  result: "WIN" | "LOSS";
  raw_probability: number | null;
  calibrated_probability: number | null;
  market_no_vig_probability: number | null;
  market_open_odds?: number | null;
  current_american_odds?: number | null;
  gate_status?: string | null;
  edge: number | null;
  brier: number | null;
  log_loss: number | null;
  clv: number | null;
  roi: number | null;
  prediction_json: unknown;
};

const NEUTRAL_BRIER = 0.25;
const NEUTRAL_LOG_LOSS = 0.6931;

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

function probabilityLogLoss(probability: number, outcome: 0 | 1) {
  const p = clamp(probability, 0.001, 0.999);
  return outcome === 1 ? -Math.log(p) : -Math.log(1 - p);
}

function probabilityBrier(probability: number, outcome: 0 | 1) {
  return (probability - outcome) ** 2;
}

function rowOutcome(row: LedgerRow): 0 | 1 {
  return row.result === "WIN" ? 1 : 0;
}

function avg(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function values(rows: LedgerRow[], selector: (row: LedgerRow) => number | null | undefined) {
  return rows.map(selector).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

export function summarizeMlbCalibrationRows(rows: LedgerRow[]): MlbCalibrationMetricSet {
  const wins = rows.filter((row) => row.result === "WIN").length;
  const losses = rows.filter((row) => row.result === "LOSS").length;
  const calibratedRows = rows.filter((row) => typeof row.calibrated_probability === "number" && Number.isFinite(row.calibrated_probability));
  const marketRows = rows.filter((row) => typeof row.market_no_vig_probability === "number" && Number.isFinite(row.market_no_vig_probability));
  const brierValues = calibratedRows.map((row) => row.brier ?? probabilityBrier(row.calibrated_probability as number, rowOutcome(row)));
  const logLossValues = calibratedRows.map((row) => row.log_loss ?? probabilityLogLoss(row.calibrated_probability as number, rowOutcome(row)));
  const marketBrierValues = marketRows.map((row) => probabilityBrier(row.market_no_vig_probability as number, rowOutcome(row)));
  const marketLogLossValues = marketRows.map((row) => probabilityLogLoss(row.market_no_vig_probability as number, rowOutcome(row)));
  const brier = avg(brierValues);
  const logLoss = avg(logLossValues);
  const marketBrier = avg(marketBrierValues);
  const marketLogLoss = avg(marketLogLossValues);
  const roiValues = values(rows, (row) => row.roi);

  return {
    count: rows.length,
    wins,
    losses,
    winRate: rows.length ? round(wins / rows.length, 4) : null,
    avgProbability: round(avg(values(rows, (row) => row.calibrated_probability))),
    brier: round(brier),
    logLoss: round(logLoss),
    marketBrier: round(marketBrier),
    marketLogLoss: round(marketLogLoss),
    brierEdgeVsMarket: brier != null && marketBrier != null ? round(marketBrier - brier, 4) : null,
    logLossEdgeVsMarket: logLoss != null && marketLogLoss != null ? round(marketLogLoss - logLoss, 4) : null,
    neutralBrier: NEUTRAL_BRIER,
    neutralLogLoss: NEUTRAL_LOG_LOSS,
    avgEdge: round(avg(values(rows, (row) => row.edge))),
    avgClv: round(avg(values(rows, (row) => row.clv)), 3),
    roi: round(avg(roiValues), 4)
  };
}

function bucketLabel(value: number, ranges: Array<{ label: string; min: number; max: number }>) {
  return ranges.find((range) => value >= range.min && value < range.max)?.label ?? ranges[ranges.length - 1]?.label ?? "unknown";
}

function bucketRows(rows: LedgerRow[], bucket: (row: LedgerRow) => string | null, bucketMeta: (label: string) => { min: number | null; max: number | null } = () => ({ min: null, max: null })) {
  const map = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    const label = bucket(row);
    if (!label) continue;
    const existing = map.get(label) ?? [];
    existing.push(row);
    map.set(label, existing);
  }
  return Array.from(map.entries()).map(([label, group]) => ({
    bucket: label,
    ...bucketMeta(label),
    ...summarizeMlbCalibrationRows(group)
  }));
}

function probabilityBuckets(rows: LedgerRow[]) {
  const ranges = [
    { label: "50-54%", min: 0.5, max: 0.55 },
    { label: "55-59%", min: 0.55, max: 0.6 },
    { label: "60-64%", min: 0.6, max: 0.65 },
    { label: "65-69%", min: 0.65, max: 0.7 },
    { label: "70%+", min: 0.7, max: 1.01 }
  ];
  return bucketRows(
    rows,
    (row) => typeof row.calibrated_probability === "number" ? bucketLabel(row.calibrated_probability, ranges) : null,
    (label) => {
      const range = ranges.find((item) => item.label === label);
      return { min: range?.min ?? null, max: range?.max ?? null };
    }
  );
}

function edgeBuckets(rows: LedgerRow[]) {
  const ranges = [
    { label: "negative", min: -1, max: 0 },
    { label: "0-2.5%", min: 0, max: 0.025 },
    { label: "2.5-4.5%", min: 0.025, max: 0.045 },
    { label: "4.5-7%", min: 0.045, max: 0.07 },
    { label: "7%+", min: 0.07, max: 1 }
  ];
  return bucketRows(
    rows,
    (row) => typeof row.edge === "number" ? bucketLabel(row.edge, ranges) : null,
    (label) => {
      const range = ranges.find((item) => item.label === label);
      return { min: range?.min ?? null, max: range?.max ?? null };
    }
  );
}

function clvBuckets(rows: LedgerRow[]) {
  const ranges = [
    { label: "CLV < -2%", min: -100, max: -2 },
    { label: "-2% to 0%", min: -2, max: 0 },
    { label: "0% to +2%", min: 0, max: 2 },
    { label: "+2% to +5%", min: 2, max: 5 },
    { label: "+5%+", min: 5, max: 100 }
  ];
  return bucketRows(
    rows,
    (row) => typeof row.clv === "number" ? bucketLabel(row.clv, ranges) : null,
    (label) => {
      const range = ranges.find((item) => item.label === label);
      return { min: range?.min ?? null, max: range?.max ?? null };
    }
  );
}

function jsonPath(row: LedgerRow) {
  const json = parseJsonObject(row.prediction_json);
  const mlbIntel = isRecord(json?.mlbIntel) ? json.mlbIntel : null;
  const playerImpact = isRecord(mlbIntel?.playerImpact) ? mlbIntel.playerImpact : null;
  const v7 = isRecord(json?.v7) ? json.v7 : null;
  return { json, mlbIntel, playerImpact, v7 };
}

function tierBucket(row: LedgerRow) {
  const { v7, mlbIntel } = jsonPath(row);
  const tier = String(v7?.tier ?? (isRecord(mlbIntel?.governor) ? mlbIntel.governor.tier : "unknown"));
  return tier || "unknown";
}

function playerImpactBucket(row: LedgerRow) {
  const { playerImpact } = jsonPath(row);
  if (!playerImpact) return "missing";
  return playerImpact.applied === true ? "applied" : "skipped";
}

function profileStatusBucket(row: LedgerRow) {
  const { playerImpact } = jsonPath(row);
  return String(playerImpact?.profileStatus ?? "unknown");
}

function homeAwayBucket(row: LedgerRow) {
  if (row.side === "HOME" || row.side === "OVER") return row.side.toLowerCase();
  if (row.side === "AWAY" || row.side === "UNDER") return row.side.toLowerCase();
  return "unknown";
}

function favoriteUnderdogBucket(row: LedgerRow) {
  const odds = safeNumber(row.current_american_odds ?? row.market_open_odds);
  if (odds == null) return "odds_missing";
  return odds < 0 ? "favorite" : "underdog";
}

function oddsBucket(row: LedgerRow) {
  const odds = safeNumber(row.current_american_odds ?? row.market_open_odds);
  if (odds == null) return "odds_missing";
  if (odds < -200) return "fav_over_200";
  if (odds < -150) return "fav_150_200";
  if (odds < -110) return "fav_110_150";
  if (odds <= 120) return "near_pickem";
  if (odds <= 170) return "dog_120_170";
  return "dog_over_170";
}

function marketSourceBucket(row: LedgerRow) {
  return safeNumber(row.current_american_odds ?? row.market_open_odds) == null ? "fallback_or_missing" : "actual_odds";
}

function verdictFor(metrics: MlbCalibrationMetricSet, officialRows: LedgerRow[]) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (metrics.count < 50) blockers.push(`Only ${metrics.count} settled official MLB picks. Need at least 50 before trusting calibration.`);
  if (metrics.brier != null && metrics.brier > 0.27) blockers.push(`Official-pick Brier ${metrics.brier.toFixed(4)} is above emergency threshold.`);
  if (metrics.logLoss != null && metrics.logLoss > 0.75) blockers.push(`Official-pick log loss ${metrics.logLoss.toFixed(4)} is above emergency threshold.`);

  if (metrics.count >= 50 && metrics.count < 200) warnings.push(`Official-pick sample is still thin at ${metrics.count}.`);
  if (metrics.brier != null && metrics.brier > NEUTRAL_BRIER && metrics.brier <= 0.27) warnings.push(`Brier ${metrics.brier.toFixed(4)} is worse than neutral ${NEUTRAL_BRIER.toFixed(4)}.`);
  if (metrics.logLoss != null && metrics.logLoss > NEUTRAL_LOG_LOSS && metrics.logLoss <= 0.75) warnings.push(`Log loss ${metrics.logLoss.toFixed(4)} is worse than neutral ${NEUTRAL_LOG_LOSS.toFixed(4)}.`);
  if (metrics.brierEdgeVsMarket != null && metrics.brierEdgeVsMarket < 0) warnings.push("Market no-vig Brier is beating the model on settled official picks.");
  if (metrics.logLossEdgeVsMarket != null && metrics.logLossEdgeVsMarket < 0) warnings.push("Market no-vig log loss is beating the model on settled official picks.");
  if (metrics.avgClv != null && metrics.avgClv < 0) warnings.push(`Average CLV is negative at ${metrics.avgClv.toFixed(3)}.`);

  const impactApplied = officialRows.filter((row) => playerImpactBucket(row) === "applied").length;
  if (officialRows.length && impactApplied / officialRows.length < 0.5) recommendations.push("Increase roster-intelligence coverage; fewer than half of official rows have player-impact applied.");
  if (metrics.count < 500) recommendations.push("Target 500+ settled official picks and 1,500+ snapshots before treating v8 calibration as stable.");
  if (metrics.brierEdgeVsMarket == null || metrics.logLossEdgeVsMarket == null) recommendations.push("Capture no-vig market probability on every official row so model-vs-market scoring is complete.");

  const status = metrics.count < 50 ? "INSUFFICIENT_DATA" : blockers.length ? "RED" : warnings.length ? "YELLOW" : "GREEN";
  const summary = status === "GREEN"
    ? "MLB v8 calibration is currently outperforming required checks."
    : status === "INSUFFICIENT_DATA"
      ? "MLB v8 calibration lab needs more settled official picks before a hard verdict."
      : status === "RED"
        ? "MLB v8 calibration has hard blockers and should not publish aggressive attack picks."
        : "MLB v8 calibration is usable but still has warnings. Keep pick gates tight.";

  return { status, summary, blockers, warnings, recommendations } as MlbCalibrationLabReport["verdict"];
}

async function readRows(windowDays: number, source: "official" | "candidate" | "snapshot") {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  if (source === "official") {
    return prisma.$queryRaw<LedgerRow[]>`
      SELECT id, 'official' AS source, side, result, raw_probability, calibrated_probability, market_no_vig_probability, market_open_odds, current_american_odds, gate_status, edge, brier, log_loss, clv, roi, prediction_json
      FROM mlb_official_pick_ledger
      WHERE result IN ('WIN', 'LOSS')
        AND released_at >= ${since}
        AND COALESCE(gate_status, 'official') NOT LIKE 'candidate%'
      ORDER BY released_at DESC
      LIMIT 5000;
    `;
  }

  if (source === "candidate") {
    return prisma.$queryRaw<LedgerRow[]>`
      SELECT id, 'candidate' AS source, side, result, raw_probability, calibrated_probability, market_no_vig_probability, market_open_odds, current_american_odds, gate_status, edge, brier, log_loss, clv, roi, prediction_json
      FROM mlb_official_pick_ledger
      WHERE result IN ('WIN', 'LOSS')
        AND released_at >= ${since}
        AND COALESCE(gate_status, '') LIKE 'candidate%'
      ORDER BY released_at DESC
      LIMIT 10000;
    `;
  }

  return prisma.$queryRaw<LedgerRow[]>`
    SELECT id, 'snapshot' AS source, side, result, raw_probability, calibrated_probability, market_no_vig_probability, market_open_odds, NULL::DOUBLE PRECISION AS current_american_odds, NULL::TEXT AS gate_status, edge, brier, log_loss, clv, roi, prediction_json
    FROM mlb_model_snapshot_ledger
    WHERE result IN ('WIN', 'LOSS') AND captured_at >= ${since}
    ORDER BY captured_at DESC
    LIMIT 10000;
  `;
}

export async function getMlbV8CalibrationLabReport(windowDays = 180): Promise<MlbCalibrationLabReport> {
  const generatedAt = new Date().toISOString();
  const databaseReady = hasUsableServerDatabaseUrl() && await ensureMlbIntelV7Ledgers();
  const safeWindowDays = Math.max(1, Math.min(3650, Math.round(windowDays)));
  if (!databaseReady) {
    const empty = summarizeMlbCalibrationRows([]);
    return {
      ok: false,
      databaseReady: false,
      generatedAt,
      windowDays: safeWindowDays,
      modelVersion: "mlb-intel-v8-player-impact+v7-calibration",
      officialPicks: empty,
      candidatePicks: empty,
      snapshots: empty,
      buckets: { probability: [], edge: [], clv: [], tier: [], playerImpact: [], profileStatus: [], candidateProbability: [], candidateEdge: [], candidateHomeAway: [], candidateFavoriteUnderdog: [], candidateOdds: [], candidateMarketSource: [], candidateClv: [] },
      verdict: {
        status: "RED",
        summary: "Database unavailable; calibration cannot be scored.",
        blockers: ["No usable server database URL is configured."],
        warnings: [],
        recommendations: ["Restore database access before trusting MLB calibration status."]
      },
      recommendations: ["Restore database access before trusting MLB calibration status."],
      baselines: { neutralBrier: NEUTRAL_BRIER, neutralLogLoss: NEUTRAL_LOG_LOSS }
    };
  }

  const [officialRows, candidateRows, snapshotRows] = await Promise.all([
    readRows(safeWindowDays, "official"),
    readRows(safeWindowDays, "candidate"),
    readRows(safeWindowDays, "snapshot")
  ]);
  const officialPicks = summarizeMlbCalibrationRows(officialRows);
  const candidatePicks = summarizeMlbCalibrationRows(candidateRows);
  const snapshots = summarizeMlbCalibrationRows(snapshotRows);
  const verdict = verdictFor(officialPicks, officialRows);
  const recommendations = buildMlbCalibrationRecommendations({
    officialPicks,
    candidatePicks,
    snapshots,
    probabilityBuckets: probabilityBuckets(candidateRows.length ? candidateRows : officialRows),
    edgeBuckets: edgeBuckets(candidateRows.length ? candidateRows : officialRows),
    playerImpactBuckets: bucketRows(candidateRows.length ? candidateRows : officialRows, playerImpactBucket),
    clvBuckets: clvBuckets(candidateRows.length ? candidateRows : officialRows)
  });

  return {
    ok: true,
    databaseReady: true,
    generatedAt,
    windowDays: safeWindowDays,
    modelVersion: "mlb-intel-v8-player-impact+v7-calibration",
    officialPicks,
    candidatePicks,
    snapshots,
    buckets: {
      probability: probabilityBuckets(officialRows),
      edge: edgeBuckets(officialRows),
      clv: clvBuckets(officialRows),
      tier: bucketRows(officialRows, tierBucket),
      playerImpact: bucketRows(officialRows, playerImpactBucket),
      profileStatus: bucketRows(officialRows, profileStatusBucket),
      candidateProbability: probabilityBuckets(candidateRows),
      candidateEdge: edgeBuckets(candidateRows),
      candidateHomeAway: bucketRows(candidateRows, homeAwayBucket),
      candidateFavoriteUnderdog: bucketRows(candidateRows, favoriteUnderdogBucket),
      candidateOdds: bucketRows(candidateRows, oddsBucket),
      candidateMarketSource: bucketRows(candidateRows, marketSourceBucket),
      candidateClv: clvBuckets(candidateRows)
    },
    verdict,
    recommendations,
    baselines: { neutralBrier: NEUTRAL_BRIER, neutralLogLoss: NEUTRAL_LOG_LOSS }
  };
}
