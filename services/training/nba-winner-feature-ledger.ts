import { loadNbaWinnerBacktestRows } from "@/services/backtesting/nba-winner-backtest";

type Side = "HOME" | "AWAY" | "PASS";
type BacktestRow = Awaited<ReturnType<typeof loadNbaWinnerBacktestRows>>[number];

export const NBA_WINNER_FEATURE_NAMES = [
  "rawModelDelta",
  "boundedModelDelta",
  "rosterImpactDelta",
  "signalConsensusDelta",
  "playerOverallDelta",
  "possessionScoreDelta",
  "defensiveEventDelta",
  "closeGameDelta",
  "coachingPaceDelta",
  "restFatigueDelta",
  "marketPressureDelta",
  "learnedFactorDelta",
  "lineupPenaltyDelta",
  "sourceConfidence",
  "shrinkageToMarket",
  "marketConflictScore",
  "signalAgreementRate",
  "modelMarketAbsGap",
  "confidenceOrdinal"
] as const;

export type NbaWinnerFeatureName = typeof NBA_WINNER_FEATURE_NAMES[number];

export type NbaWinnerFeatureLedgerRow = {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  actualHomeWin: 0 | 1;
  pickedSide: Side;
  noBet: boolean;
  finalHomeWinPct: number;
  marketHomeNoVig: number;
  rawHomeWinPct: number;
  marketLogit: number;
  modelLogit: number;
  features: Record<NbaWinnerFeatureName, number>;
  brier: number;
  marketBrier: number | null;
  logLoss: number;
  marketLogLoss: number | null;
  clvPct: number | null;
  roi: number | null;
  drivers: string[];
  warnings: string[];
  blockers: string[];
};

export type NbaWinnerFeatureLedger = {
  modelVersion: "nba-winner-feature-ledger-v1";
  generatedAt: string;
  sourceRowCount: number;
  usableRowCount: number;
  rows: NbaWinnerFeatureLedgerRow[];
  warnings: string[];
};

const EPSILON = 1e-6;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 6) {
  return Number(value.toFixed(digits));
}

function logit(probability: number) {
  const p = clamp(probability, 0.01, 0.99);
  return Math.log(p / (1 - p));
}

function brier(probability: number, actual: 0 | 1) {
  return (probability - actual) ** 2;
}

function logLoss(probability: number, actual: 0 | 1) {
  const p = clamp(probability, EPSILON, 1 - EPSILON);
  return actual === 1 ? -Math.log(p) : -Math.log(1 - p);
}

function confidenceOrdinal(confidence: string) {
  switch (confidence) {
    case "HIGH": return 1;
    case "MEDIUM": return 0.66;
    case "LOW": return 0.33;
    default: return 0;
  }
}

function containsAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function extractPercent(drivers: string[], patterns: RegExp[], fallback = 0) {
  const driver = drivers.find((candidate) => containsAny(candidate.toLowerCase(), patterns));
  if (!driver) return fallback;
  const match = driver.match(/(-?\d+(?:\.\d+)?)%/);
  if (!match) return fallback;
  return Number(match[1]) / 100;
}

function extractNumber(drivers: string[], patterns: RegExp[], fallback = 0) {
  const driver = drivers.find((candidate) => containsAny(candidate.toLowerCase(), patterns));
  if (!driver) return fallback;
  const cleaned = driver.replace(/\d+PA|\d+PM/gi, "");
  const match = cleaned.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return fallback;
  return Number(match[1]);
}

function marginPointsToProbability(points: number) {
  return clamp(points * 0.012, -0.06, 0.06);
}

function featureRecord(row: BacktestRow): Record<NbaWinnerFeatureName, number> {
  const marketHome = row.marketHomeNoVig ?? 0.5;
  const rawHome = row.rawHomeWinPct ?? row.finalHomeWinPct;
  const drivers = row.drivers.map((driver) => driver.toLowerCase());
  const boundedModelDelta = row.boundedModelDelta ?? extractPercent(drivers, [/bounded model delta/]);
  const rosterImpactDelta = extractPercent(drivers, [/roster\/team delta/, /roster impact.*delta/]);
  const signalConsensusDelta = extractPercent(drivers, [/signal consensus probability delta/, /consensus probability delta/]);
  const playerOverallDelta = extractPercent(drivers, [/player overall delta/, /player overall probability delta/]);
  const possessionScoreDelta = extractPercent(drivers, [/possession score delta/]);
  const defensiveEventDelta = extractPercent(drivers, [/defensive event delta/, /defense event.*probability delta/]);
  const closeGameDelta = extractPercent(drivers, [/close-game delta/, /close game.*probability delta/]);
  const coachingPaceDelta = extractPercent(drivers, [/coaching pace delta/, /coaching probability delta/]);
  const restFatigueDelta = extractPercent(drivers, [/rest fatigue delta/, /rest\/fatigue probability delta/]);
  const marketPressureDelta = extractPercent(drivers, [/market pressure delta/, /market pressure probability delta/]);
  const learnedFactorDelta = marginPointsToProbability(extractNumber(drivers, [/learned factor delta/], 0));
  const lineupPenaltyDelta = marginPointsToProbability(extractNumber(drivers, [/lineup penalty/], 0));
  const sourceConfidence = extractPercent(drivers, [/source confidence/]);
  const shrinkageToMarket = extractPercent(drivers, [/shrinkage to market/]);
  const marketConflictScore = extractPercent(drivers, [/market pressure conflict/, /market conflict/]);
  const signalAgreementRate = extractPercent(drivers, [/weighted agreement/, /agreement/]);
  const rawModelDelta = rawHome - marketHome;
  const modelMarketAbsGap = Math.abs(row.finalHomeWinPct - marketHome);

  return {
    rawModelDelta: round(rawModelDelta),
    boundedModelDelta: round(boundedModelDelta),
    rosterImpactDelta: round(rosterImpactDelta),
    signalConsensusDelta: round(signalConsensusDelta),
    playerOverallDelta: round(playerOverallDelta),
    possessionScoreDelta: round(possessionScoreDelta),
    defensiveEventDelta: round(defensiveEventDelta),
    closeGameDelta: round(closeGameDelta),
    coachingPaceDelta: round(coachingPaceDelta),
    restFatigueDelta: round(restFatigueDelta),
    marketPressureDelta: round(marketPressureDelta),
    learnedFactorDelta: round(learnedFactorDelta),
    lineupPenaltyDelta: round(lineupPenaltyDelta),
    sourceConfidence: round(sourceConfidence),
    shrinkageToMarket: round(shrinkageToMarket),
    marketConflictScore: round(marketConflictScore),
    signalAgreementRate: round(signalAgreementRate),
    modelMarketAbsGap: round(modelMarketAbsGap),
    confidenceOrdinal: round(confidenceOrdinal(row.confidence))
  };
}

function parseLedgerRow(row: BacktestRow): NbaWinnerFeatureLedgerRow | null {
  if (row.captureType !== "GRADED" || !row.actualWinner) return null;
  const marketHome = row.marketHomeNoVig ?? null;
  if (marketHome == null || !Number.isFinite(marketHome)) return null;
  const finalHome = clamp(row.finalHomeWinPct, 0.01, 0.99);
  const actualHomeWin: 0 | 1 = row.actualWinner === "HOME" ? 1 : 0;
  const rawHome = clamp(row.rawHomeWinPct ?? finalHome, 0.01, 0.99);
  return {
    eventId: row.eventId,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    actualHomeWin,
    pickedSide: row.pickedSide,
    noBet: row.noBet,
    finalHomeWinPct: round(finalHome),
    marketHomeNoVig: round(clamp(marketHome, 0.01, 0.99)),
    rawHomeWinPct: round(rawHome),
    marketLogit: round(logit(marketHome)),
    modelLogit: round(logit(finalHome)),
    features: featureRecord(row),
    brier: round(row.brier ?? brier(finalHome, actualHomeWin)),
    marketBrier: row.marketBrier == null ? round(brier(marketHome, actualHomeWin)) : round(row.marketBrier),
    logLoss: round(row.logLoss ?? logLoss(finalHome, actualHomeWin)),
    marketLogLoss: row.marketLogLoss == null ? round(logLoss(marketHome, actualHomeWin)) : round(row.marketLogLoss),
    clvPct: row.clvPct == null ? null : round(row.clvPct),
    roi: row.roi == null ? null : round(row.roi),
    drivers: row.drivers,
    warnings: row.warnings,
    blockers: row.blockers
  };
}

export async function buildNbaWinnerFeatureLedger(args: { limit?: number } = {}): Promise<NbaWinnerFeatureLedger> {
  const sourceRows = await loadNbaWinnerBacktestRows({ limit: args.limit ?? 10000 });
  const rows = sourceRows
    .map(parseLedgerRow)
    .filter((row): row is NbaWinnerFeatureLedgerRow => Boolean(row));
  const warnings: string[] = [];
  if (rows.length < 100) warnings.push("usable graded NBA winner feature sample is under 100; learned model is directional only");
  if (rows.length < sourceRows.length) warnings.push(`${sourceRows.length - rows.length} ledger rows were skipped because they were ungraded or missing market baseline`);
  return {
    modelVersion: "nba-winner-feature-ledger-v1",
    generatedAt: new Date().toISOString(),
    sourceRowCount: sourceRows.length,
    usableRowCount: rows.length,
    rows,
    warnings
  };
}
