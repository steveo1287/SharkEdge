import { prisma } from "@/lib/db/prisma";
import { bucketForProbability, type NbaWinnerBucketKey, type NbaWinnerBucketStatus } from "@/services/simulation/nba-winner-ledger";
import { buildNbaWinnerFactorWeightReport, type NbaWinnerFactorWeightReport } from "@/services/simulation/nba-winner-factor-weights";

const LEDGER_MODEL_KEY = "nba-winner-ledger";
const LEDGER_MODEL_VERSION = "v1";
const EPSILON = 1e-6;

type Side = "HOME" | "AWAY" | "PASS";

type BacktestRow = {
  eventId: string;
  captureType: "PREDICTION" | "GRADED";
  homeTeam: string;
  awayTeam: string;
  pickedSide: Side;
  actualWinner: Exclude<Side, "PASS"> | null;
  bucket: NbaWinnerBucketKey | null;
  confidence: string;
  noBet: boolean;
  finalHomeWinPct: number;
  finalAwayWinPct: number;
  rawHomeWinPct: number | null;
  rawAwayWinPct: number | null;
  marketHomeNoVig: number | null;
  marketAwayNoVig: number | null;
  finalProjectedHomeMargin: number | null;
  boundedModelDelta: number | null;
  brier: number | null;
  marketBrier: number | null;
  logLoss: number | null;
  marketLogLoss: number | null;
  clvPct: number | null;
  roi: number | null;
  blockers: string[];
  warnings: string[];
  drivers: string[];
};

export type NbaWinnerBacktestBaseline = {
  label: string;
  sampleSize: number;
  picks: number;
  passes: number;
  hitRate: number | null;
  avgProbability: number | null;
  calibrationError: number | null;
  avgBrier: number | null;
  avgLogLoss: number | null;
  roi: number | null;
  totalProfitUnits: number | null;
  maxDrawdown: number | null;
};

export type NbaWinnerBacktestSplit = {
  key: string;
  sampleSize: number;
  picks: number;
  passes: number;
  hitRate: number | null;
  avgProbability: number | null;
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
  status: NbaWinnerBucketStatus;
  blockers: string[];
  warnings: string[];
};

export type NbaWinnerBacktestReport = {
  modelVersion: "nba-winner-backtest-v1";
  generatedAt: string;
  status: NbaWinnerBucketStatus;
  ledgerRowCount: number;
  gradedCount: number;
  pickCount: number;
  passCount: number;
  overall: NbaWinnerBacktestSplit;
  baselines: {
    sharkEdge: NbaWinnerBacktestBaseline;
    marketFavorite: NbaWinnerBacktestBaseline;
    rawSim: NbaWinnerBacktestBaseline;
    homeTeam: NbaWinnerBacktestBaseline;
  };
  buckets: NbaWinnerBacktestSplit[];
  favoriteDogSplits: NbaWinnerBacktestSplit[];
  homeAwaySplits: NbaWinnerBacktestSplit[];
  modelMarketDisagreementSplits: NbaWinnerBacktestSplit[];
  confidenceSplits: NbaWinnerBacktestSplit[];
  factorWeights: NbaWinnerFactorWeightReport;
  blockers: string[];
  warnings: string[];
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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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

function parseSide(value: unknown): Side {
  return value === "HOME" || value === "AWAY" ? value : "PASS";
}

function parseWinner(value: unknown): Exclude<Side, "PASS"> | null {
  return value === "HOME" || value === "AWAY" ? value : null;
}

function parseRow(value: unknown): BacktestRow | null {
  const metadata = asRecord(value);
  if (metadata.ledgerType !== "NBA_WINNER") return null;
  const finalHomeWinPct = asNumber(metadata.finalHomeWinPct) ?? 0.5;
  const finalAwayWinPct = asNumber(metadata.finalAwayWinPct) ?? 1 - finalHomeWinPct;
  const pickedSide = parseSide(metadata.pickedSide);
  const pickedProbability = pickedSide === "HOME" ? finalHomeWinPct : pickedSide === "AWAY" ? finalAwayWinPct : null;
  return {
    eventId: String(metadata.eventId ?? ""),
    captureType: metadata.captureType === "GRADED" ? "GRADED" : "PREDICTION",
    homeTeam: String(metadata.homeTeam ?? "Home"),
    awayTeam: String(metadata.awayTeam ?? "Away"),
    pickedSide,
    actualWinner: parseWinner(metadata.actualWinner),
    bucket: (typeof metadata.bucket === "string" ? metadata.bucket : bucketForProbability(pickedProbability)) as NbaWinnerBucketKey | null,
    confidence: String(metadata.confidence ?? "INSUFFICIENT"),
    noBet: metadata.noBet === true,
    finalHomeWinPct,
    finalAwayWinPct,
    rawHomeWinPct: asNumber(metadata.rawHomeWinPct),
    rawAwayWinPct: asNumber(metadata.rawAwayWinPct),
    marketHomeNoVig: asNumber(metadata.marketHomeNoVig),
    marketAwayNoVig: asNumber(metadata.marketAwayNoVig),
    finalProjectedHomeMargin: asNumber(metadata.finalProjectedHomeMargin),
    boundedModelDelta: asNumber(metadata.boundedModelDelta),
    brier: asNumber(metadata.brier),
    marketBrier: asNumber(metadata.marketBrier),
    logLoss: asNumber(metadata.logLoss),
    marketLogLoss: asNumber(metadata.marketLogLoss),
    clvPct: asNumber(metadata.clvPct),
    roi: asNumber(metadata.roi),
    blockers: asStringArray(metadata.blockers),
    warnings: asStringArray(metadata.warnings),
    drivers: asStringArray(metadata.drivers)
  };
}

export async function loadNbaWinnerBacktestRows(args: { limit?: number } = {}) {
  const modelRun = await prisma.modelRun.findUnique({ where: { key: `${LEDGER_MODEL_KEY}:${LEDGER_MODEL_VERSION}:event` } });
  if (!modelRun) return [] as BacktestRow[];
  const rows = await prisma.eventProjection.findMany({
    where: { modelRunId: modelRun.id },
    orderBy: { id: "desc" },
    take: Math.max(1, Math.min(args.limit ?? 5000, 10000))
  });
  const latestByEvent = new Map<string, BacktestRow>();
  for (const row of rows) {
    const parsed = parseRow(row.metadataJson);
    if (!parsed?.eventId || latestByEvent.has(parsed.eventId)) continue;
    latestByEvent.set(parsed.eventId, parsed);
  }
  return [...latestByEvent.values()];
}

function probabilityForSide(row: BacktestRow, side: Side, source: "model" | "market" | "raw") {
  if (side === "PASS") return null;
  if (source === "model") return side === "HOME" ? row.finalHomeWinPct : row.finalAwayWinPct;
  if (source === "market") return side === "HOME" ? row.marketHomeNoVig : row.marketAwayNoVig;
  return side === "HOME" ? row.rawHomeWinPct : row.rawAwayWinPct;
}

function baselineRows(rows: BacktestRow[], pickSide: (row: BacktestRow) => Side, source: "model" | "market" | "raw") {
  return rows.filter((row) => row.captureType === "GRADED" && row.actualWinner).map((row) => {
    const side = pickSide(row);
    const probability = probabilityForSide(row, side, source);
    if (side === "PASS" || probability == null) return null;
    const actual = row.actualWinner === side ? 1 : 0;
    const roi = source === "model" && row.roi != null ? row.roi : null;
    return { row, side, probability, actual, roi };
  }).filter((entry): entry is { row: BacktestRow; side: Exclude<Side, "PASS">; probability: number; actual: 0 | 1; roi: number | null } => Boolean(entry));
}

function summarizeBaseline(label: string, rows: BacktestRow[], pickSide: (row: BacktestRow) => Side, source: "model" | "market" | "raw"): NbaWinnerBacktestBaseline {
  const played = baselineRows(rows, pickSide, source);
  const hits = played.filter((entry) => entry.actual === 1).length;
  const probabilities = played.map((entry) => entry.probability);
  const briers = played.map((entry) => brier(entry.probability, entry.actual));
  const losses = played.map((entry) => logLoss(entry.probability, entry.actual));
  const roiValues = played.map((entry) => entry.roi).filter((value): value is number => typeof value === "number");
  const hitRate = played.length ? hits / played.length : null;
  const avgProbability = average(probabilities);
  return {
    label,
    sampleSize: played.length,
    picks: played.length,
    passes: rows.filter((row) => row.captureType === "GRADED" && row.actualWinner).length - played.length,
    hitRate: hitRate == null ? null : round(hitRate),
    avgProbability: avgProbability == null ? null : round(avgProbability),
    calibrationError: hitRate == null || avgProbability == null ? null : round(Math.abs(hitRate - avgProbability)),
    avgBrier: average(briers) == null ? null : round(average(briers)!),
    avgLogLoss: average(losses) == null ? null : round(average(losses)!),
    roi: average(roiValues) == null ? null : round(average(roiValues)!),
    totalProfitUnits: sum(roiValues) == null ? null : round(sum(roiValues)!, 4),
    maxDrawdown: roiValues.length ? maxDrawdown(roiValues) : null
  };
}

function summarizeSplit(key: string, rows: BacktestRow[]): NbaWinnerBacktestSplit {
  const graded = rows.filter((row) => row.captureType === "GRADED" && row.actualWinner);
  const picks = graded.filter((row) => row.pickedSide !== "PASS");
  const hits = picks.filter((row) => row.actualWinner === row.pickedSide).length;
  const probabilities = picks.map((row) => probabilityForSide(row, row.pickedSide, "model")).filter((value): value is number => typeof value === "number");
  const modelBriers = picks.map((row) => row.brier ?? brier(row.finalHomeWinPct, row.actualWinner === "HOME" ? 1 : 0));
  const marketBriers = picks.map((row) => row.marketBrier).filter((value): value is number => typeof value === "number");
  const modelLosses = picks.map((row) => row.logLoss ?? logLoss(row.finalHomeWinPct, row.actualWinner === "HOME" ? 1 : 0));
  const marketLosses = picks.map((row) => row.marketLogLoss).filter((value): value is number => typeof value === "number");
  const clvRows = picks.map((row) => row.clvPct).filter((value): value is number => typeof value === "number");
  const roiRows = picks.map((row) => row.roi).filter((value): value is number => typeof value === "number");
  const hitRate = picks.length ? hits / picks.length : null;
  const avgProbability = average(probabilities);
  const avgBrier = average(modelBriers);
  const avgMarketBrier = average(marketBriers);
  const avgLogLoss = average(modelLosses);
  const avgMarketLogLoss = average(marketLosses);
  const calibrationError = hitRate == null || avgProbability == null ? null : Math.abs(hitRate - avgProbability);
  const brierEdge = avgBrier == null || avgMarketBrier == null ? null : avgMarketBrier - avgBrier;
  const logLossEdge = avgLogLoss == null || avgMarketLogLoss == null ? null : avgMarketLogLoss - avgLogLoss;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (picks.length < 100) warnings.push("sample under 100; treat as directional only");
  if (brierEdge != null && brierEdge < -0.0025) blockers.push("Brier trails market baseline");
  if (logLossEdge != null && logLossEdge < -0.0025) blockers.push("log loss trails market baseline");
  if (calibrationError != null && calibrationError > 0.06) blockers.push("calibration error above 6%");
  if (calibrationError != null && calibrationError > 0.035) warnings.push("calibration error above 3.5%");

  const status: NbaWinnerBucketStatus = picks.length < 100
    ? "INSUFFICIENT"
    : blockers.length
      ? "RED"
      : warnings.length
        ? "YELLOW"
        : "GREEN";

  return {
    key,
    sampleSize: graded.length,
    picks: picks.length,
    passes: graded.length - picks.length,
    hitRate: hitRate == null ? null : round(hitRate),
    avgProbability: avgProbability == null ? null : round(avgProbability),
    calibrationError: calibrationError == null ? null : round(calibrationError),
    avgBrier: avgBrier == null ? null : round(avgBrier),
    avgMarketBrier: avgMarketBrier == null ? null : round(avgMarketBrier),
    brierEdge: brierEdge == null ? null : round(brierEdge),
    avgLogLoss: avgLogLoss == null ? null : round(avgLogLoss),
    avgMarketLogLoss: avgMarketLogLoss == null ? null : round(avgMarketLogLoss),
    logLossEdge: logLossEdge == null ? null : round(logLossEdge),
    avgClvPct: average(clvRows) == null ? null : round(average(clvRows)!),
    clvBeatRate: clvRows.length ? round(clvRows.filter((value) => value > 0).length / clvRows.length) : null,
    roi: average(roiRows) == null ? null : round(average(roiRows)!),
    status,
    blockers,
    warnings
  };
}

function groupBy(rows: BacktestRow[], keyFn: (row: BacktestRow) => string) {
  const map = new Map<string, BacktestRow[]>();
  for (const row of rows) {
    const key = keyFn(row);
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return [...map.entries()].map(([key, grouped]) => summarizeSplit(key, grouped));
}

function disagreementBucket(row: BacktestRow) {
  if (row.marketHomeNoVig == null) return "market-missing";
  const disagreement = Math.abs(row.finalHomeWinPct - row.marketHomeNoVig);
  if (disagreement < 0.015) return "0-1.5%";
  if (disagreement < 0.03) return "1.5-3%";
  if (disagreement < 0.045) return "3-4.5%";
  return "4.5%+";
}

export async function runNbaWinnerBacktest(args: { limit?: number } = {}): Promise<NbaWinnerBacktestReport> {
  const rows = await loadNbaWinnerBacktestRows(args);
  const graded = rows.filter((row) => row.captureType === "GRADED" && row.actualWinner);
  const factorWeights = await buildNbaWinnerFactorWeightReport({ rows, limit: args.limit });
  const overall = summarizeSplit("overall", rows);
  const buckets = (["50-53", "53-56", "56-60", "60-65", "65+"] as NbaWinnerBucketKey[])
    .map((bucket) => summarizeSplit(bucket, rows.filter((row) => row.bucket === bucket)));
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!graded.length) blockers.push("no graded NBA winner ledger rows available");
  if (graded.length < 100) warnings.push("graded sample under 100; backtest is directional only");
  if (overall.status === "RED") blockers.push(...overall.blockers.map((blocker) => `overall: ${blocker}`));
  if (factorWeights.status === "RED") blockers.push(...factorWeights.blockers.map((blocker) => `factor weights: ${blocker}`));
  if (factorWeights.status === "YELLOW") warnings.push(...factorWeights.warnings.map((warning) => `factor weights: ${warning}`));

  const status: NbaWinnerBucketStatus = blockers.length
    ? "RED"
    : warnings.length
      ? "YELLOW"
      : graded.length >= 100
        ? "GREEN"
        : "INSUFFICIENT";

  return {
    modelVersion: "nba-winner-backtest-v1",
    generatedAt: new Date().toISOString(),
    status,
    ledgerRowCount: rows.length,
    gradedCount: graded.length,
    pickCount: graded.filter((row) => row.pickedSide !== "PASS").length,
    passCount: graded.filter((row) => row.pickedSide === "PASS").length,
    overall,
    baselines: {
      sharkEdge: summarizeBaseline("SharkEdge final pick", rows, (row) => row.pickedSide, "model"),
      marketFavorite: summarizeBaseline("Market favorite", rows, (row) => {
        if (row.marketHomeNoVig == null || row.marketAwayNoVig == null) return "PASS";
        return row.marketHomeNoVig >= row.marketAwayNoVig ? "HOME" : "AWAY";
      }, "market"),
      rawSim: summarizeBaseline("Raw sim", rows, (row) => {
        if (row.rawHomeWinPct == null || row.rawAwayWinPct == null) return "PASS";
        return row.rawHomeWinPct >= row.rawAwayWinPct ? "HOME" : "AWAY";
      }, "raw"),
      homeTeam: summarizeBaseline("Home team", rows, () => "HOME", "model")
    },
    buckets,
    favoriteDogSplits: groupBy(graded, (row) => {
      if (row.marketHomeNoVig == null || row.marketAwayNoVig == null || row.pickedSide === "PASS") return "pass-or-market-missing";
      const marketFavorite = row.marketHomeNoVig >= row.marketAwayNoVig ? "HOME" : "AWAY";
      return row.pickedSide === marketFavorite ? "favorite" : "dog";
    }),
    homeAwaySplits: groupBy(graded, (row) => row.pickedSide === "PASS" ? "pass" : row.pickedSide === "HOME" ? "home-pick" : "away-pick"),
    modelMarketDisagreementSplits: groupBy(graded, disagreementBucket),
    confidenceSplits: groupBy(graded, (row) => row.confidence || "UNKNOWN"),
    factorWeights,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)]
  };
}
