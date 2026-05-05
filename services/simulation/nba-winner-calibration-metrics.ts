import { prisma } from "@/lib/db/prisma";
import { bucketForProbability, type NbaWinnerBucketKey, type NbaWinnerBucketStatus } from "@/services/simulation/nba-winner-ledger";

const LEDGER_MODEL_KEY = "nba-winner-ledger";
const LEDGER_MODEL_VERSION = "v1";
const EPSILON = 1e-6;

export type NbaWinnerAdvancedBaseline = {
  label: string;
  sampleSize: number;
  hitRate: number | null;
  expectedHitRate: number | null;
  calibrationError: number | null;
  avgBrier: number | null;
  avgLogLoss: number | null;
  roi: number | null;
  totalProfitUnits: number | null;
  maxDrawdown: number | null;
};

export type NbaWinnerAdvancedBucket = {
  bucket: NbaWinnerBucketKey;
  status: NbaWinnerBucketStatus;
  sampleSize: number;
  passCount: number;
  hitRate: number | null;
  expectedHitRate: number | null;
  marketExpectedHitRate: number | null;
  calibrationError: number | null;
  avgBrier: number | null;
  avgMarketBrier: number | null;
  brierEdge: number | null;
  avgLogLoss: number | null;
  avgMarketLogLoss: number | null;
  logLossEdge: number | null;
  avgClvPct: number | null;
  clvBeatRate: number | null;
  roi: number | null;
  totalProfitUnits: number | null;
  maxDrawdown: number | null;
  avgModelMarketEdge: number | null;
  blockers: string[];
  warnings: string[];
};

export type NbaWinnerAdvancedCalibrationReport = {
  generatedAt: string;
  status: NbaWinnerBucketStatus;
  rowCount: number;
  gradedCount: number;
  pickCount: number;
  passCount: number;
  overall: {
    hitRate: number | null;
    expectedHitRate: number | null;
    calibrationError: number | null;
    expectedCalibrationError: number | null;
    avgBrier: number | null;
    avgMarketBrier: number | null;
    brierEdge: number | null;
    avgLogLoss: number | null;
    avgMarketLogLoss: number | null;
    logLossEdge: number | null;
    avgClvPct: number | null;
    clvBeatRate: number | null;
    roi: number | null;
    totalProfitUnits: number | null;
    maxDrawdown: number | null;
  };
  baselines: {
    marketFavorite: NbaWinnerAdvancedBaseline;
    homeTeam: NbaWinnerAdvancedBaseline;
    noBet: NbaWinnerAdvancedBaseline;
  };
  buckets: NbaWinnerAdvancedBucket[];
  healthyBucketCount: number;
  watchBucketCount: number;
  poorBucketCount: number;
  insufficientBucketCount: number;
  blockers: string[];
  warnings: string[];
};

type LedgerRow = {
  eventId: string;
  captureType: "PREDICTION" | "GRADED";
  pickedSide: "HOME" | "AWAY" | "PASS";
  actualWinner: "HOME" | "AWAY" | null;
  bucket: NbaWinnerBucketKey | null;
  pickedProbability: number | null;
  finalHomeWinPct: number;
  finalAwayWinPct: number;
  marketHomeNoVig: number | null;
  marketAwayNoVig: number | null;
  predictionHomeOddsAmerican: number | null;
  predictionAwayOddsAmerican: number | null;
  brier: number | null;
  marketBrier: number | null;
  logLoss: number | null;
  marketLogLoss: number | null;
  clvPct: number | null;
  roi: number | null;
};

function round(value: number, digits = 6) {
  return Number(value.toFixed(digits));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function americanToDecimal(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

function brier(probability: number, actual: 0 | 1) {
  return (probability - actual) ** 2;
}

function logLoss(probability: number, actual: 0 | 1) {
  const p = Math.max(EPSILON, Math.min(1 - EPSILON, probability));
  return actual === 1 ? -Math.log(p) : -Math.log(1 - p);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function sum(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function maxDrawdown(values: number[]) {
  let running = 0;
  let peak = 0;
  let drawdown = 0;
  for (const value of values) {
    running += value;
    peak = Math.max(peak, running);
    drawdown = Math.min(drawdown, running - peak);
  }
  return round(drawdown, 4);
}

function parseLedgerRow(value: unknown): LedgerRow | null {
  const metadata = asRecord(value);
  if (metadata.ledgerType !== "NBA_WINNER") return null;
  const pickedSide = metadata.pickedSide === "HOME" || metadata.pickedSide === "AWAY" ? metadata.pickedSide : "PASS";
  const actualWinner = metadata.actualWinner === "HOME" || metadata.actualWinner === "AWAY" ? metadata.actualWinner : null;
  const finalHomeWinPct = asNumber(metadata.finalHomeWinPct) ?? 0.5;
  const finalAwayWinPct = asNumber(metadata.finalAwayWinPct) ?? 0.5;
  const pickedProbability = asNumber(metadata.pickedProbability);
  return {
    eventId: String(metadata.eventId ?? ""),
    captureType: metadata.captureType === "GRADED" ? "GRADED" : "PREDICTION",
    pickedSide,
    actualWinner,
    bucket: (typeof metadata.bucket === "string" ? metadata.bucket : bucketForProbability(pickedProbability)) as NbaWinnerBucketKey | null,
    pickedProbability,
    finalHomeWinPct,
    finalAwayWinPct,
    marketHomeNoVig: asNumber(metadata.marketHomeNoVig),
    marketAwayNoVig: asNumber(metadata.marketAwayNoVig),
    predictionHomeOddsAmerican: asNumber(metadata.predictionHomeOddsAmerican),
    predictionAwayOddsAmerican: asNumber(metadata.predictionAwayOddsAmerican),
    brier: asNumber(metadata.brier),
    marketBrier: asNumber(metadata.marketBrier),
    logLoss: asNumber(metadata.logLoss),
    marketLogLoss: asNumber(metadata.marketLogLoss),
    clvPct: asNumber(metadata.clvPct),
    roi: asNumber(metadata.roi)
  };
}

function roiForSide(row: LedgerRow, side: "HOME" | "AWAY") {
  if (!row.actualWinner) return null;
  const odds = side === "HOME" ? row.predictionHomeOddsAmerican : row.predictionAwayOddsAmerican;
  const decimal = americanToDecimal(odds);
  if (!decimal) return null;
  return row.actualWinner === side ? decimal - 1 : -1;
}

function summarizeBaseline(label: string, rows: LedgerRow[], pickSide: (row: LedgerRow) => "HOME" | "AWAY" | "PASS"): NbaWinnerAdvancedBaseline {
  const graded = rows.filter((row) => row.captureType === "GRADED" && row.actualWinner);
  const played = graded
    .map((row) => ({ row, side: pickSide(row) }))
    .filter((entry): entry is { row: LedgerRow; side: "HOME" | "AWAY" } => entry.side === "HOME" || entry.side === "AWAY");
  const hits = played.filter((entry) => entry.row.actualWinner === entry.side).length;
  const probabilities = played.map((entry) => entry.side === "HOME" ? entry.row.marketHomeNoVig : entry.row.marketAwayNoVig).filter((value): value is number => typeof value === "number");
  const briers = played.map((entry) => {
    const probability = entry.side === "HOME" ? entry.row.marketHomeNoVig : entry.row.marketAwayNoVig;
    return probability == null ? null : brier(probability, entry.row.actualWinner === entry.side ? 1 : 0);
  }).filter((value): value is number => typeof value === "number");
  const losses = played.map((entry) => {
    const probability = entry.side === "HOME" ? entry.row.marketHomeNoVig : entry.row.marketAwayNoVig;
    return probability == null ? null : logLoss(probability, entry.row.actualWinner === entry.side ? 1 : 0);
  }).filter((value): value is number => typeof value === "number");
  const roiValues = played.map((entry) => roiForSide(entry.row, entry.side)).filter((value): value is number => typeof value === "number");
  const hitRate = played.length ? hits / played.length : null;
  const expectedHitRate = average(probabilities);
  return {
    label,
    sampleSize: played.length,
    hitRate: hitRate == null ? null : round(hitRate),
    expectedHitRate: expectedHitRate == null ? null : round(expectedHitRate),
    calibrationError: hitRate == null || expectedHitRate == null ? null : round(Math.abs(hitRate - expectedHitRate)),
    avgBrier: average(briers) == null ? null : round(average(briers)!),
    avgLogLoss: average(losses) == null ? null : round(average(losses)!),
    roi: average(roiValues) == null ? null : round(average(roiValues)!),
    totalProfitUnits: sum(roiValues) == null ? null : round(sum(roiValues)!, 4),
    maxDrawdown: roiValues.length ? maxDrawdown(roiValues) : null
  };
}

function summarizeBucket(bucket: NbaWinnerBucketKey, rows: LedgerRow[]): NbaWinnerAdvancedBucket {
  const bucketRows = rows.filter((row) => row.bucket === bucket);
  const graded = bucketRows.filter((row) => row.captureType === "GRADED" && row.actualWinner && row.pickedSide !== "PASS");
  const hits = graded.filter((row) => row.actualWinner === row.pickedSide).length;
  const hitRate = graded.length ? hits / graded.length : null;
  const expectedHitRate = average(graded.map((row) => row.pickedProbability).filter((value): value is number => typeof value === "number"));
  const marketExpectedHitRate = average(graded.map((row) => row.pickedSide === "HOME" ? row.marketHomeNoVig : row.marketAwayNoVig).filter((value): value is number => typeof value === "number"));
  const avgBrier = average(graded.map((row) => row.brier).filter((value): value is number => typeof value === "number"));
  const avgMarketBrier = average(graded.map((row) => row.marketBrier).filter((value): value is number => typeof value === "number"));
  const avgLogLoss = average(graded.map((row) => row.logLoss).filter((value): value is number => typeof value === "number"));
  const avgMarketLogLoss = average(graded.map((row) => row.marketLogLoss).filter((value): value is number => typeof value === "number"));
  const avgClvPct = average(graded.map((row) => row.clvPct).filter((value): value is number => typeof value === "number"));
  const clvRows = graded.map((row) => row.clvPct).filter((value): value is number => typeof value === "number");
  const clvBeatRate = clvRows.length ? clvRows.filter((value) => value > 0).length / clvRows.length : null;
  const roiValues = graded.map((row) => row.roi).filter((value): value is number => typeof value === "number");
  const modelMarketEdges = graded.map((row) => row.pickedSide === "HOME"
    ? row.finalHomeWinPct - (row.marketHomeNoVig ?? row.finalHomeWinPct)
    : row.finalAwayWinPct - (row.marketAwayNoVig ?? row.finalAwayWinPct)
  );
  const brierEdge = avgBrier == null || avgMarketBrier == null ? null : avgMarketBrier - avgBrier;
  const logLossEdge = avgLogLoss == null || avgMarketLogLoss == null ? null : avgMarketLogLoss - avgLogLoss;
  const calibrationError = hitRate == null || expectedHitRate == null ? null : Math.abs(hitRate - expectedHitRate);
  const roi = average(roiValues);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (graded.length < 100) blockers.push("bucket sample under 100");
  if (avgClvPct != null && avgClvPct < 0) blockers.push("negative CLV bucket");
  if (brierEdge != null && brierEdge < -0.0025) blockers.push("Brier score worse than market baseline");
  if (logLossEdge != null && logLossEdge < -0.0025) blockers.push("log loss worse than market baseline");
  if (calibrationError != null && calibrationError > 0.05) blockers.push("calibration error above 5%");
  if (roi != null && roi < -0.015) blockers.push("negative ROI bucket");
  if (clvBeatRate != null && clvBeatRate < 0.48) warnings.push("CLV beat rate below 48%");
  if (calibrationError != null && calibrationError > 0.03) warnings.push("calibration error above 3%");

  const status: NbaWinnerBucketStatus = graded.length < 100
    ? "INSUFFICIENT"
    : blockers.length
      ? "RED"
      : warnings.length
        ? "YELLOW"
        : "GREEN";

  return {
    bucket,
    status,
    sampleSize: graded.length,
    passCount: bucketRows.filter((row) => row.pickedSide === "PASS").length,
    hitRate: hitRate == null ? null : round(hitRate),
    expectedHitRate: expectedHitRate == null ? null : round(expectedHitRate),
    marketExpectedHitRate: marketExpectedHitRate == null ? null : round(marketExpectedHitRate),
    calibrationError: calibrationError == null ? null : round(calibrationError),
    avgBrier: avgBrier == null ? null : round(avgBrier),
    avgMarketBrier: avgMarketBrier == null ? null : round(avgMarketBrier),
    brierEdge: brierEdge == null ? null : round(brierEdge),
    avgLogLoss: avgLogLoss == null ? null : round(avgLogLoss),
    avgMarketLogLoss: avgMarketLogLoss == null ? null : round(avgMarketLogLoss),
    logLossEdge: logLossEdge == null ? null : round(logLossEdge),
    avgClvPct: avgClvPct == null ? null : round(avgClvPct),
    clvBeatRate: clvBeatRate == null ? null : round(clvBeatRate),
    roi: roi == null ? null : round(roi),
    totalProfitUnits: sum(roiValues) == null ? null : round(sum(roiValues)!, 4),
    maxDrawdown: roiValues.length ? maxDrawdown(roiValues) : null,
    avgModelMarketEdge: average(modelMarketEdges) == null ? null : round(average(modelMarketEdges)!),
    blockers,
    warnings
  };
}

function expectedCalibrationError(buckets: NbaWinnerAdvancedBucket[], totalSamples: number) {
  if (!totalSamples) return null;
  const weighted = buckets.reduce((total, bucket) => total + (bucket.calibrationError ?? 0) * bucket.sampleSize, 0);
  return round(weighted / totalSamples);
}

export async function getNbaWinnerAdvancedCalibrationReport(args: { limit?: number } = {}): Promise<NbaWinnerAdvancedCalibrationReport> {
  const modelRun = await prisma.modelRun.findUnique({ where: { key: `${LEDGER_MODEL_KEY}:${LEDGER_MODEL_VERSION}:event` } });
  if (!modelRun) {
    return {
      generatedAt: new Date().toISOString(),
      status: "INSUFFICIENT",
      rowCount: 0,
      gradedCount: 0,
      pickCount: 0,
      passCount: 0,
      overall: {
        hitRate: null,
        expectedHitRate: null,
        calibrationError: null,
        expectedCalibrationError: null,
        avgBrier: null,
        avgMarketBrier: null,
        brierEdge: null,
        avgLogLoss: null,
        avgMarketLogLoss: null,
        logLossEdge: null,
        avgClvPct: null,
        clvBeatRate: null,
        roi: null,
        totalProfitUnits: null,
        maxDrawdown: null
      },
      baselines: {
        marketFavorite: summarizeBaseline("Market favorite", [], () => "PASS"),
        homeTeam: summarizeBaseline("Home team", [], () => "PASS"),
        noBet: summarizeBaseline("No bet", [], () => "PASS")
      },
      buckets: [],
      healthyBucketCount: 0,
      watchBucketCount: 0,
      poorBucketCount: 0,
      insufficientBucketCount: 0,
      blockers: ["NBA winner ledger has no captured rows"],
      warnings: []
    };
  }

  const rows = await prisma.eventProjection.findMany({
    where: { modelRunId: modelRun.id },
    orderBy: { id: "desc" },
    take: Math.max(1, Math.min(args.limit ?? 5000, 10000))
  });
  const latestByEvent = new Map<string, LedgerRow>();
  for (const row of rows) {
    const parsed = parseLedgerRow(row.metadataJson);
    if (!parsed || latestByEvent.has(parsed.eventId)) continue;
    latestByEvent.set(parsed.eventId, parsed);
  }
  const parsedRows = [...latestByEvent.values()];
  const graded = parsedRows.filter((row) => row.captureType === "GRADED" && row.actualWinner && row.pickedSide !== "PASS");
  const buckets = (["50-53", "53-56", "56-60", "60-65", "65+"] as NbaWinnerBucketKey[]).map((bucket) => summarizeBucket(bucket, parsedRows));
  const hits = graded.filter((row) => row.actualWinner === row.pickedSide).length;
  const hitRate = graded.length ? hits / graded.length : null;
  const expectedHitRate = average(graded.map((row) => row.pickedProbability).filter((value): value is number => typeof value === "number"));
  const avgBrier = average(graded.map((row) => row.brier).filter((value): value is number => typeof value === "number"));
  const avgMarketBrier = average(graded.map((row) => row.marketBrier).filter((value): value is number => typeof value === "number"));
  const avgLogLoss = average(graded.map((row) => row.logLoss).filter((value): value is number => typeof value === "number"));
  const avgMarketLogLoss = average(graded.map((row) => row.marketLogLoss).filter((value): value is number => typeof value === "number"));
  const clvRows = graded.map((row) => row.clvPct).filter((value): value is number => typeof value === "number");
  const roiValues = graded.map((row) => row.roi).filter((value): value is number => typeof value === "number");
  const calibrationError = hitRate == null || expectedHitRate == null ? null : Math.abs(hitRate - expectedHitRate);
  const healthyBucketCount = buckets.filter((bucket) => bucket.status === "GREEN").length;
  const watchBucketCount = buckets.filter((bucket) => bucket.status === "YELLOW").length;
  const poorBucketCount = buckets.filter((bucket) => bucket.status === "RED").length;
  const insufficientBucketCount = buckets.filter((bucket) => bucket.status === "INSUFFICIENT").length;
  const blockers = [
    ...(poorBucketCount ? [`${poorBucketCount} NBA winner buckets are RED`] : []),
    ...(!healthyBucketCount ? ["no healthy NBA winner calibration buckets"] : []),
    ...(avgBrier != null && avgMarketBrier != null && avgMarketBrier - avgBrier < -0.0025 ? ["overall Brier score trails market baseline"] : []),
    ...(avgLogLoss != null && avgMarketLogLoss != null && avgMarketLogLoss - avgLogLoss < -0.0025 ? ["overall log loss trails market baseline"] : [])
  ];
  const warnings = [
    ...(insufficientBucketCount ? [`${insufficientBucketCount} NBA winner buckets under 100 graded rows`] : []),
    ...(calibrationError != null && calibrationError > 0.03 ? ["overall calibration error above 3%"] : [])
  ];
  const status: NbaWinnerBucketStatus = blockers.length
    ? "RED"
    : warnings.length
      ? "YELLOW"
      : healthyBucketCount
        ? "GREEN"
        : "INSUFFICIENT";

  return {
    generatedAt: new Date().toISOString(),
    status,
    rowCount: parsedRows.length,
    gradedCount: parsedRows.filter((row) => row.captureType === "GRADED").length,
    pickCount: parsedRows.filter((row) => row.pickedSide !== "PASS").length,
    passCount: parsedRows.filter((row) => row.pickedSide === "PASS").length,
    overall: {
      hitRate: hitRate == null ? null : round(hitRate),
      expectedHitRate: expectedHitRate == null ? null : round(expectedHitRate),
      calibrationError: calibrationError == null ? null : round(calibrationError),
      expectedCalibrationError: expectedCalibrationError(buckets, graded.length),
      avgBrier: avgBrier == null ? null : round(avgBrier),
      avgMarketBrier: avgMarketBrier == null ? null : round(avgMarketBrier),
      brierEdge: avgBrier == null || avgMarketBrier == null ? null : round(avgMarketBrier - avgBrier),
      avgLogLoss: avgLogLoss == null ? null : round(avgLogLoss),
      avgMarketLogLoss: avgMarketLogLoss == null ? null : round(avgMarketLogLoss),
      logLossEdge: avgLogLoss == null || avgMarketLogLoss == null ? null : round(avgMarketLogLoss - avgLogLoss),
      avgClvPct: average(clvRows) == null ? null : round(average(clvRows)!),
      clvBeatRate: clvRows.length ? round(clvRows.filter((value) => value > 0).length / clvRows.length) : null,
      roi: average(roiValues) == null ? null : round(average(roiValues)!),
      totalProfitUnits: sum(roiValues) == null ? null : round(sum(roiValues)!, 4),
      maxDrawdown: roiValues.length ? maxDrawdown(roiValues) : null
    },
    baselines: {
      marketFavorite: summarizeBaseline("Market favorite", parsedRows, (row) => {
        if (row.marketHomeNoVig == null || row.marketAwayNoVig == null) return "PASS";
        return row.marketHomeNoVig >= row.marketAwayNoVig ? "HOME" : "AWAY";
      }),
      homeTeam: summarizeBaseline("Home team", parsedRows, () => "HOME"),
      noBet: summarizeBaseline("No bet", parsedRows, () => "PASS")
    },
    buckets,
    healthyBucketCount,
    watchBucketCount,
    poorBucketCount,
    insufficientBucketCount,
    blockers,
    warnings
  };
}

export async function getNbaWinnerAdvancedCalibrationGate(args: {
  finalHomeWinPct: number;
  finalAwayWinPct: number;
  limit?: number;
}) {
  const pickedProbability = Math.max(args.finalHomeWinPct, args.finalAwayWinPct);
  const bucketKey = bucketForProbability(pickedProbability);
  const report = await getNbaWinnerAdvancedCalibrationReport({ limit: args.limit });
  const bucket = report.buckets.find((candidate) => candidate.bucket === bucketKey) ?? null;
  const blockers = [
    ...(!bucket ? ["NBA winner advanced calibration bucket missing"] : []),
    ...(bucket?.status === "RED" ? bucket.blockers : []),
    ...(bucket?.status === "INSUFFICIENT" ? ["NBA winner calibration bucket sample under 100"] : []),
    ...(bucket?.avgClvPct != null && bucket.avgClvPct < 0 ? ["NBA winner bucket has negative CLV"] : []),
    ...(bucket?.brierEdge != null && bucket.brierEdge < 0 ? ["NBA winner bucket Brier trails market"] : []),
    ...(bucket?.logLossEdge != null && bucket.logLossEdge < 0 ? ["NBA winner bucket log loss trails market"] : [])
  ];
  const warnings = [
    ...(bucket?.warnings ?? []),
    ...(report.warnings ?? [])
  ];
  return {
    bucketKey,
    bucket,
    reportStatus: report.status,
    shouldPass: blockers.length > 0,
    shouldBlockStrongBet: true,
    blockers,
    warnings,
    summary: report
  };
}
