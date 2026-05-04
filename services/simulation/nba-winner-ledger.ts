import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { buildNbaWinnerProbability, type NbaWinnerProbabilityResult } from "@/services/simulation/nba-winner-probability-engine";
import { getNbaLineupTruth } from "@/services/simulation/nba-lineup-truth";
import type { NbaNoVigMarket } from "@/services/simulation/nba-market-sanity";

const LEDGER_MODEL_KEY = "nba-winner-ledger";
const LEDGER_MODEL_VERSION = "v1";
const EPSILON = 1e-6;

export type NbaWinnerSide = "HOME" | "AWAY" | "PASS";
export type NbaWinnerBucketKey = "50-53" | "53-56" | "56-60" | "60-65" | "65+";
export type NbaWinnerBucketStatus = "GREEN" | "YELLOW" | "RED" | "INSUFFICIENT";

export type NbaWinnerLedgerMetadata = {
  ledgerType: "NBA_WINNER";
  captureType: "PREDICTION" | "GRADED";
  eventId: string;
  capturedAt: string;
  gradedAt?: string;
  gameTime: string;
  homeTeam: string;
  awayTeam: string;
  marketHomeNoVig: number | null;
  marketAwayNoVig: number | null;
  rawHomeWinPct: number;
  rawAwayWinPct: number;
  rawModelDelta: number | null;
  boundedModelDelta: number;
  deltaCap: number;
  finalHomeWinPct: number;
  finalAwayWinPct: number;
  finalProjectedHomeMargin: number;
  pickedSide: NbaWinnerSide;
  pickedProbability: number | null;
  bucket: NbaWinnerBucketKey | null;
  confidence: string;
  noBet: boolean;
  blockers: string[];
  warnings: string[];
  drivers: string[];
  predictionHomeOddsAmerican: number | null;
  predictionAwayOddsAmerican: number | null;
  closingHomeOddsAmerican?: number | null;
  closingAwayOddsAmerican?: number | null;
  closingHomeNoVig?: number | null;
  closingAwayNoVig?: number | null;
  actualWinner?: Exclude<NbaWinnerSide, "PASS"> | null;
  brier?: number | null;
  marketBrier?: number | null;
  logLoss?: number | null;
  marketLogLoss?: number | null;
  clvPct?: number | null;
  roi?: number | null;
};

export type NbaWinnerBucketSummary = {
  bucket: NbaWinnerBucketKey;
  status: NbaWinnerBucketStatus;
  sampleSize: number;
  hitRate: number | null;
  expectedHitRate: number | null;
  marketExpectedHitRate: number | null;
  avgBrier: number | null;
  avgMarketBrier: number | null;
  avgLogLoss: number | null;
  avgMarketLogLoss: number | null;
  avgClvPct: number | null;
  roi: number | null;
  maxDrawdown: number | null;
  blockers: string[];
  warnings: string[];
};

export type NbaWinnerCalibrationReport = {
  generatedAt: string;
  status: NbaWinnerBucketStatus;
  rowCount: number;
  gradedCount: number;
  bucketCount: number;
  healthyBucketCount: number;
  watchBucketCount: number;
  poorBucketCount: number;
  insufficientBucketCount: number;
  buckets: NbaWinnerBucketSummary[];
  blockers: string[];
  warnings: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function americanToImplied(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function americanToDecimal(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

function noVig(homeOdds: number | null | undefined, awayOdds: number | null | undefined) {
  const home = americanToImplied(homeOdds);
  const away = americanToImplied(awayOdds);
  if (home == null || away == null) return null;
  const total = home + away;
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    homeNoVigProbability: round(home / total),
    awayNoVigProbability: round(away / total),
    hold: round(total - 1)
  };
}

export function bucketForProbability(probability: number | null | undefined): NbaWinnerBucketKey | null {
  if (typeof probability !== "number" || !Number.isFinite(probability)) return null;
  const p = Math.max(probability, 1 - probability);
  if (p < 0.5) return null;
  if (p < 0.53) return "50-53";
  if (p < 0.56) return "53-56";
  if (p < 0.6) return "56-60";
  if (p < 0.65) return "60-65";
  return "65+";
}

export function computeBrier(probability: number, actual: 0 | 1) {
  return round((probability - actual) ** 2, 6);
}

export function computeLogLoss(probability: number, actual: 0 | 1) {
  const p = clamp(probability, EPSILON, 1 - EPSILON);
  return round(actual === 1 ? -Math.log(p) : -Math.log(1 - p), 6);
}

function marketStateToNoVigMarket(args: {
  awayTeam: string;
  homeTeam: string;
  states: Array<{
    marketType: string;
    period: string;
    bestHomeOddsAmerican: number | null;
    bestAwayOddsAmerican: number | null;
    consensusLineValue: number | null;
    bestOverOddsAmerican?: number | null;
    bestUnderOddsAmerican?: number | null;
  }>;
}): NbaNoVigMarket {
  const moneyline = args.states.find((state) => state.period === "full_game" && state.marketType === "moneyline")
    ?? args.states.find((state) => state.marketType === "moneyline")
    ?? null;
  const spread = args.states.find((state) => state.period === "full_game" && state.marketType === "spread")
    ?? args.states.find((state) => state.marketType === "spread")
    ?? null;
  const total = args.states.find((state) => state.period === "full_game" && state.marketType === "total")
    ?? args.states.find((state) => state.marketType === "total")
    ?? null;
  const moneylineNoVig = noVig(moneyline?.bestHomeOddsAmerican, moneyline?.bestAwayOddsAmerican);
  const totalNoVig = noVig(total?.bestOverOddsAmerican, total?.bestUnderOddsAmerican);
  return {
    available: Boolean(moneylineNoVig),
    source: "current-market-state",
    awayTeam: args.awayTeam,
    homeTeam: args.homeTeam,
    awayOddsAmerican: moneyline?.bestAwayOddsAmerican ?? null,
    homeOddsAmerican: moneyline?.bestHomeOddsAmerican ?? null,
    awayNoVigProbability: moneylineNoVig?.awayNoVigProbability ?? null,
    homeNoVigProbability: moneylineNoVig?.homeNoVigProbability ?? null,
    hold: moneylineNoVig?.hold ?? null,
    spreadLine: spread?.consensusLineValue ?? null,
    awaySpreadOddsAmerican: spread?.bestAwayOddsAmerican ?? null,
    homeSpreadOddsAmerican: spread?.bestHomeOddsAmerican ?? null,
    totalLine: total?.consensusLineValue ?? null,
    overOddsAmerican: total?.bestOverOddsAmerican ?? null,
    underOddsAmerican: total?.bestUnderOddsAmerican ?? null,
    overNoVigProbability: totalNoVig?.homeNoVigProbability ?? null,
    underNoVigProbability: totalNoVig?.awayNoVigProbability ?? null,
    totalHold: totalNoVig?.hold ?? null
  };
}

function eventProjectionMetadata(value: unknown) {
  const metadata = asRecord(value);
  const simulation = asRecord(metadata.simulation);
  return {
    sourceHealth: {
      team: true,
      player: true,
      history: true,
      rating: true,
      realModules: 4,
      requiredModulesReady: true
    },
    projectedTotal: asNumber(simulation.projectedTotal) ?? asNumber(metadata.projectedTotal)
  };
}

function pickedSideFromWinner(winner: NbaWinnerProbabilityResult): NbaWinnerSide {
  if (winner.noBet) return "PASS";
  return winner.finalHomeWinPct >= winner.finalAwayWinPct ? "HOME" : "AWAY";
}

function metadataFromWinner(args: {
  eventId: string;
  gameTime: Date;
  homeTeam: string;
  awayTeam: string;
  winner: NbaWinnerProbabilityResult;
  predictionHomeOddsAmerican: number | null;
  predictionAwayOddsAmerican: number | null;
}): NbaWinnerLedgerMetadata {
  const pickedSide = pickedSideFromWinner(args.winner);
  const pickedProbability = pickedSide === "HOME"
    ? args.winner.finalHomeWinPct
    : pickedSide === "AWAY"
      ? args.winner.finalAwayWinPct
      : null;
  return {
    ledgerType: "NBA_WINNER",
    captureType: "PREDICTION",
    eventId: args.eventId,
    capturedAt: new Date().toISOString(),
    gameTime: args.gameTime.toISOString(),
    homeTeam: args.homeTeam,
    awayTeam: args.awayTeam,
    marketHomeNoVig: args.winner.marketHomeNoVig,
    marketAwayNoVig: args.winner.marketAwayNoVig,
    rawHomeWinPct: args.winner.rawHomeWinPct,
    rawAwayWinPct: args.winner.rawAwayWinPct,
    rawModelDelta: args.winner.rawModelDelta,
    boundedModelDelta: args.winner.boundedModelDelta,
    deltaCap: args.winner.deltaCap,
    finalHomeWinPct: args.winner.finalHomeWinPct,
    finalAwayWinPct: args.winner.finalAwayWinPct,
    finalProjectedHomeMargin: args.winner.finalProjectedHomeMargin,
    pickedSide,
    pickedProbability,
    bucket: bucketForProbability(pickedProbability),
    confidence: args.winner.confidence,
    noBet: args.winner.noBet,
    blockers: args.winner.blockers,
    warnings: args.winner.warnings,
    drivers: args.winner.drivers,
    predictionHomeOddsAmerican: args.predictionHomeOddsAmerican,
    predictionAwayOddsAmerican: args.predictionAwayOddsAmerican
  };
}

function parseMetadata(value: unknown): NbaWinnerLedgerMetadata | null {
  const metadata = asRecord(value);
  if (metadata.ledgerType !== "NBA_WINNER") return null;
  const pickedSide = String(metadata.pickedSide ?? "PASS") as NbaWinnerSide;
  return {
    ledgerType: "NBA_WINNER",
    captureType: metadata.captureType === "GRADED" ? "GRADED" : "PREDICTION",
    eventId: String(metadata.eventId ?? ""),
    capturedAt: String(metadata.capturedAt ?? ""),
    gradedAt: typeof metadata.gradedAt === "string" ? metadata.gradedAt : undefined,
    gameTime: String(metadata.gameTime ?? ""),
    homeTeam: String(metadata.homeTeam ?? "Home"),
    awayTeam: String(metadata.awayTeam ?? "Away"),
    marketHomeNoVig: asNumber(metadata.marketHomeNoVig),
    marketAwayNoVig: asNumber(metadata.marketAwayNoVig),
    rawHomeWinPct: asNumber(metadata.rawHomeWinPct) ?? 0.5,
    rawAwayWinPct: asNumber(metadata.rawAwayWinPct) ?? 0.5,
    rawModelDelta: asNumber(metadata.rawModelDelta),
    boundedModelDelta: asNumber(metadata.boundedModelDelta) ?? 0,
    deltaCap: asNumber(metadata.deltaCap) ?? 0,
    finalHomeWinPct: asNumber(metadata.finalHomeWinPct) ?? 0.5,
    finalAwayWinPct: asNumber(metadata.finalAwayWinPct) ?? 0.5,
    finalProjectedHomeMargin: asNumber(metadata.finalProjectedHomeMargin) ?? 0,
    pickedSide: pickedSide === "HOME" || pickedSide === "AWAY" ? pickedSide : "PASS",
    pickedProbability: asNumber(metadata.pickedProbability),
    bucket: (typeof metadata.bucket === "string" ? metadata.bucket : null) as NbaWinnerBucketKey | null,
    confidence: String(metadata.confidence ?? "INSUFFICIENT"),
    noBet: asBoolean(metadata.noBet) ?? true,
    blockers: asStringArray(metadata.blockers),
    warnings: asStringArray(metadata.warnings),
    drivers: asStringArray(metadata.drivers),
    predictionHomeOddsAmerican: asNumber(metadata.predictionHomeOddsAmerican),
    predictionAwayOddsAmerican: asNumber(metadata.predictionAwayOddsAmerican),
    closingHomeOddsAmerican: asNumber(metadata.closingHomeOddsAmerican),
    closingAwayOddsAmerican: asNumber(metadata.closingAwayOddsAmerican),
    closingHomeNoVig: asNumber(metadata.closingHomeNoVig),
    closingAwayNoVig: asNumber(metadata.closingAwayNoVig),
    actualWinner: metadata.actualWinner === "HOME" || metadata.actualWinner === "AWAY" ? metadata.actualWinner : null,
    brier: asNumber(metadata.brier),
    marketBrier: asNumber(metadata.marketBrier),
    logLoss: asNumber(metadata.logLoss),
    marketLogLoss: asNumber(metadata.marketLogLoss),
    clvPct: asNumber(metadata.clvPct),
    roi: asNumber(metadata.roi)
  };
}

async function ensureLedgerModelRun() {
  return prisma.modelRun.upsert({
    where: { key: `${LEDGER_MODEL_KEY}:${LEDGER_MODEL_VERSION}:event` },
    update: { modelName: LEDGER_MODEL_KEY, version: LEDGER_MODEL_VERSION, status: "ACTIVE" },
    create: {
      key: `${LEDGER_MODEL_KEY}:${LEDGER_MODEL_VERSION}:event`,
      modelName: LEDGER_MODEL_KEY,
      version: LEDGER_MODEL_VERSION,
      scope: "nba_winner_ledger",
      status: "ACTIVE"
    }
  });
}

async function loadEventContext(eventId: string) {
  return prisma.event.findUnique({
    where: { id: eventId },
    include: {
      league: true,
      eventResult: true,
      participants: {
        include: { competitor: { include: { team: true } } }
      },
      currentMarketStates: {
        select: {
          marketType: true,
          period: true,
          bestHomeOddsAmerican: true,
          bestAwayOddsAmerican: true,
          bestOverOddsAmerican: true,
          bestUnderOddsAmerican: true,
          consensusLineValue: true
        }
      },
      eventProjections: {
        include: { modelRun: true },
        orderBy: { createdAt: "desc" },
        take: 20
      }
    }
  });
}

function homeAwayTeams(event: NonNullable<Awaited<ReturnType<typeof loadEventContext>>>) {
  const homeParticipant = event.participants.find((participant) => participant.role === "HOME") ?? null;
  const awayParticipant = event.participants.find((participant) => participant.role === "AWAY") ?? null;
  const homeTeam = homeParticipant?.competitor.team;
  const awayTeam = awayParticipant?.competitor.team;
  return { homeParticipant, awayParticipant, homeTeam, awayTeam };
}

export async function captureNbaWinnerLedgerSnapshotForEvent(eventId: string) {
  const event = await loadEventContext(eventId);
  if (!event || event.league.key !== "NBA") return null;
  const { homeTeam, awayTeam } = homeAwayTeams(event);
  if (!homeTeam || !awayTeam) return null;
  const latestProjection = event.eventProjections.find((projection) => projection.modelRun.modelName !== LEDGER_MODEL_KEY) ?? null;
  if (!latestProjection) return null;
  const projectionMetadata = eventProjectionMetadata(latestProjection.metadataJson);
  const market = marketStateToNoVigMarket({
    awayTeam: awayTeam.name,
    homeTeam: homeTeam.name,
    states: event.currentMarketStates
  });
  const lineupTruth = await getNbaLineupTruth({
    awayTeam: awayTeam.name,
    homeTeam: homeTeam.name,
    gameTime: event.startTime,
    projectionReasons: ["nba winner ledger capture"],
    projectionModules: [{ label: "injury/availability/rotation", status: "real" }]
  }).catch(() => null);
  const winner = buildNbaWinnerProbability({
    rawHomeWinPct: latestProjection.winProbHome,
    rawAwayWinPct: latestProjection.winProbAway,
    projectedHomeMargin: latestProjection.projectedSpreadHome,
    projectedTotal: projectionMetadata.projectedTotal ?? latestProjection.projectedTotal,
    market,
    lineupTruth,
    sourceHealth: projectionMetadata.sourceHealth,
    calibrationHealthy: true
  });
  const metadata = metadataFromWinner({
    eventId,
    gameTime: event.startTime,
    homeTeam: homeTeam.name,
    awayTeam: awayTeam.name,
    winner,
    predictionHomeOddsAmerican: market.homeOddsAmerican,
    predictionAwayOddsAmerican: market.awayOddsAmerican
  });
  const modelRun = await ensureLedgerModelRun();
  const row = await prisma.eventProjection.create({
    data: {
      modelRunId: modelRun.id,
      eventId,
      projectedHomeScore: latestProjection.projectedHomeScore,
      projectedAwayScore: latestProjection.projectedAwayScore,
      projectedTotal: latestProjection.projectedTotal,
      projectedSpreadHome: winner.finalProjectedHomeMargin,
      winProbHome: winner.finalHomeWinPct,
      winProbAway: winner.finalAwayWinPct,
      metadataJson: metadata as Prisma.InputJsonValue
    }
  });
  return { eventId, rowId: row.id, metadata };
}

function actualWinnerFromEvent(event: NonNullable<Awaited<ReturnType<typeof loadEventContext>>>): Exclude<NbaWinnerSide, "PASS"> | null {
  const result = event.eventResult;
  if (!result) return null;
  const side = String(result.winningSide ?? "").toUpperCase();
  if (side === "HOME" || side === "AWAY") return side;
  const { homeParticipant, awayParticipant } = homeAwayTeams(event);
  if (result.winnerCompetitorId && result.winnerCompetitorId === homeParticipant?.competitorId) return "HOME";
  if (result.winnerCompetitorId && result.winnerCompetitorId === awayParticipant?.competitorId) return "AWAY";
  return null;
}

export function gradeWinnerMetadata(input: {
  metadata: NbaWinnerLedgerMetadata;
  actualWinner: Exclude<NbaWinnerSide, "PASS">;
  closingHomeOddsAmerican: number | null;
  closingAwayOddsAmerican: number | null;
}): NbaWinnerLedgerMetadata {
  const closingNoVig = noVig(input.closingHomeOddsAmerican, input.closingAwayOddsAmerican);
  const actualHome = input.actualWinner === "HOME" ? 1 : 0;
  const modelProb = input.metadata.finalHomeWinPct;
  const marketProb = input.metadata.marketHomeNoVig ?? closingNoVig?.homeNoVigProbability ?? 0.5;
  const pickedWon = input.metadata.pickedSide !== "PASS" && input.metadata.pickedSide === input.actualWinner;
  const closingPickedProb = input.metadata.pickedSide === "HOME"
    ? closingNoVig?.homeNoVigProbability ?? null
    : input.metadata.pickedSide === "AWAY"
      ? closingNoVig?.awayNoVigProbability ?? null
      : null;
  const modelPickedProb = input.metadata.pickedSide === "HOME"
    ? input.metadata.finalHomeWinPct
    : input.metadata.pickedSide === "AWAY"
      ? input.metadata.finalAwayWinPct
      : null;
  const pickedOdds = input.metadata.pickedSide === "HOME"
    ? input.metadata.predictionHomeOddsAmerican
    : input.metadata.pickedSide === "AWAY"
      ? input.metadata.predictionAwayOddsAmerican
      : null;
  const decimal = americanToDecimal(pickedOdds);
  const roi = input.metadata.pickedSide === "PASS" || !decimal ? null : pickedWon ? decimal - 1 : -1;
  return {
    ...input.metadata,
    captureType: "GRADED",
    gradedAt: new Date().toISOString(),
    actualWinner: input.actualWinner,
    closingHomeOddsAmerican: input.closingHomeOddsAmerican,
    closingAwayOddsAmerican: input.closingAwayOddsAmerican,
    closingHomeNoVig: closingNoVig?.homeNoVigProbability ?? null,
    closingAwayNoVig: closingNoVig?.awayNoVigProbability ?? null,
    brier: computeBrier(modelProb, actualHome),
    marketBrier: computeBrier(marketProb, actualHome),
    logLoss: computeLogLoss(modelProb, actualHome),
    marketLogLoss: computeLogLoss(marketProb, actualHome),
    clvPct: modelPickedProb != null && closingPickedProb != null ? round(modelPickedProb - closingPickedProb, 6) : null,
    roi: roi == null ? null : round(roi, 6)
  };
}

export async function gradeNbaWinnerLedgerForEvent(eventId: string) {
  const event = await loadEventContext(eventId);
  if (!event || event.league.key !== "NBA") return null;
  const actualWinner = actualWinnerFromEvent(event);
  if (!actualWinner) return null;
  const ledgerRows = event.eventProjections.filter((projection) => projection.modelRun.modelName === LEDGER_MODEL_KEY);
  const latest = ledgerRows[0] ?? null;
  if (!latest) return null;
  const metadata = parseMetadata(latest.metadataJson);
  if (!metadata) return null;
  const { homeTeam, awayTeam } = homeAwayTeams(event);
  if (!homeTeam || !awayTeam) return null;
  const market = marketStateToNoVigMarket({
    awayTeam: awayTeam.name,
    homeTeam: homeTeam.name,
    states: event.currentMarketStates
  });
  const graded = gradeWinnerMetadata({
    metadata,
    actualWinner,
    closingHomeOddsAmerican: market.homeOddsAmerican,
    closingAwayOddsAmerican: market.awayOddsAmerican
  });
  await prisma.eventProjection.update({
    where: { id: latest.id },
    data: { metadataJson: graded as Prisma.InputJsonValue }
  });
  return { eventId, rowId: latest.id, metadata: graded };
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function maxDrawdown(values: number[]) {
  let peak = 0;
  let running = 0;
  let drawdown = 0;
  for (const value of values) {
    running += value;
    peak = Math.max(peak, running);
    drawdown = Math.min(drawdown, running - peak);
  }
  return round(drawdown, 4);
}

function summarizeBucket(bucket: NbaWinnerBucketKey, rows: NbaWinnerLedgerMetadata[]): NbaWinnerBucketSummary {
  const graded = rows.filter((row) => row.captureType === "GRADED" && row.actualWinner && row.pickedSide !== "PASS");
  const hits = graded.filter((row) => row.actualWinner === row.pickedSide).length;
  const hitRate = graded.length ? hits / graded.length : null;
  const expectedHitRate = average(graded.map((row) => row.pickedProbability).filter((value): value is number => typeof value === "number"));
  const marketExpectedHitRate = average(graded.map((row) => row.pickedSide === "HOME" ? row.marketHomeNoVig : row.marketAwayNoVig).filter((value): value is number => typeof value === "number"));
  const avgBrier = average(graded.map((row) => row.brier).filter((value): value is number => typeof value === "number"));
  const avgMarketBrier = average(graded.map((row) => row.marketBrier).filter((value): value is number => typeof value === "number"));
  const avgLogLoss = average(graded.map((row) => row.logLoss).filter((value): value is number => typeof value === "number"));
  const avgMarketLogLoss = average(graded.map((row) => row.marketLogLoss).filter((value): value is number => typeof value === "number"));
  const avgClvPct = average(graded.map((row) => row.clvPct).filter((value): value is number => typeof value === "number"));
  const roiValues = graded.map((row) => row.roi).filter((value): value is number => typeof value === "number");
  const roi = roiValues.length ? roiValues.reduce((sum, value) => sum + value, 0) / roiValues.length : null;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (graded.length < 100) warnings.push("bucket sample under 100; no STRONG_BET allowed");
  if (avgClvPct != null && avgClvPct < -0.0025) blockers.push("negative CLV bucket");
  if (avgLogLoss != null && avgMarketLogLoss != null && avgLogLoss > avgMarketLogLoss) blockers.push("log loss worse than market baseline");
  if (avgBrier != null && avgMarketBrier != null && avgBrier > avgMarketBrier) warnings.push("Brier score worse than market baseline");
  if (roi != null && roi < -0.02) blockers.push("negative ROI bucket");

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
    hitRate: hitRate == null ? null : round(hitRate),
    expectedHitRate: expectedHitRate == null ? null : round(expectedHitRate),
    marketExpectedHitRate: marketExpectedHitRate == null ? null : round(marketExpectedHitRate),
    avgBrier: avgBrier == null ? null : round(avgBrier, 6),
    avgMarketBrier: avgMarketBrier == null ? null : round(avgMarketBrier, 6),
    avgLogLoss: avgLogLoss == null ? null : round(avgLogLoss, 6),
    avgMarketLogLoss: avgMarketLogLoss == null ? null : round(avgMarketLogLoss, 6),
    avgClvPct: avgClvPct == null ? null : round(avgClvPct, 6),
    roi: roi == null ? null : round(roi, 6),
    maxDrawdown: roiValues.length ? maxDrawdown(roiValues) : null,
    blockers,
    warnings
  };
}

export async function getNbaWinnerCalibrationReport(args: { limit?: number } = {}): Promise<NbaWinnerCalibrationReport> {
  const modelRun = await prisma.modelRun.findUnique({ where: { key: `${LEDGER_MODEL_KEY}:${LEDGER_MODEL_VERSION}:event` } });
  if (!modelRun) {
    return {
      generatedAt: new Date().toISOString(),
      status: "INSUFFICIENT",
      rowCount: 0,
      gradedCount: 0,
      bucketCount: 0,
      healthyBucketCount: 0,
      watchBucketCount: 0,
      poorBucketCount: 0,
      insufficientBucketCount: 0,
      buckets: [],
      blockers: ["NBA winner ledger has no captured rows"],
      warnings: []
    };
  }
  const rows = await prisma.eventProjection.findMany({
    where: { modelRunId: modelRun.id },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(args.limit ?? 5000, 10000))
  });
  const latestByEvent = new Map<string, NbaWinnerLedgerMetadata>();
  for (const row of rows) {
    const metadata = parseMetadata(row.metadataJson);
    if (!metadata || latestByEvent.has(metadata.eventId)) continue;
    latestByEvent.set(metadata.eventId, metadata);
  }
  const parsed = [...latestByEvent.values()];
  const buckets: NbaWinnerBucketSummary[] = (["50-53", "53-56", "56-60", "60-65", "65+"] as NbaWinnerBucketKey[])
    .map((bucket) => summarizeBucket(bucket, parsed.filter((row) => row.bucket === bucket)));
  const healthyBucketCount = buckets.filter((bucket) => bucket.status === "GREEN").length;
  const watchBucketCount = buckets.filter((bucket) => bucket.status === "YELLOW").length;
  const poorBucketCount = buckets.filter((bucket) => bucket.status === "RED").length;
  const insufficientBucketCount = buckets.filter((bucket) => bucket.status === "INSUFFICIENT").length;
  const blockers = [
    ...(poorBucketCount ? [`${poorBucketCount} NBA winner buckets are underperforming`] : []),
    ...(!healthyBucketCount ? ["no healthy NBA winner calibration buckets"] : [])
  ];
  const warnings = [
    ...(insufficientBucketCount ? [`${insufficientBucketCount} NBA winner buckets have fewer than 100 graded rows`] : [])
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
    rowCount: parsed.length,
    gradedCount: parsed.filter((row) => row.captureType === "GRADED").length,
    bucketCount: buckets.length,
    healthyBucketCount,
    watchBucketCount,
    poorBucketCount,
    insufficientBucketCount,
    buckets,
    blockers,
    warnings
  };
}

export async function getNbaWinnerCalibrationGate(args: {
  finalHomeWinPct: number;
  finalAwayWinPct: number;
  limit?: number;
}) {
  const pickedProbability = Math.max(args.finalHomeWinPct, args.finalAwayWinPct);
  const bucketKey = bucketForProbability(pickedProbability);
  const report = await getNbaWinnerCalibrationReport({ limit: args.limit });
  const bucket = report.buckets.find((candidate) => candidate.bucket === bucketKey) ?? null;
  const blockers = [
    ...(!bucket ? ["NBA winner calibration bucket missing"] : []),
    ...(bucket?.status === "RED" ? bucket.blockers : []),
    ...(bucket?.status === "INSUFFICIENT" ? ["NBA winner calibration bucket sample under 100"] : []),
    ...(report.status === "RED" && !bucket ? report.blockers : [])
  ];
  const warnings = [
    ...(bucket?.warnings ?? []),
    ...(report.warnings ?? [])
  ];
  return {
    bucketKey,
    bucket,
    reportStatus: report.status,
    shouldBlockStrongBet: true,
    shouldPass: blockers.length > 0 || bucket?.status === "RED",
    blockers,
    warnings,
    summary: report
  };
}
