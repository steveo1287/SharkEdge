import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

type CalibrationBucket = {
  bucket: string;
  min: number;
  max: number;
  sample: number;
  predictedAvg: number | null;
  actualWinRate: number | null;
  calibrationError: number | null;
  brier: number | null;
};

export type GameOutcomeCalibrationProfile = {
  leagueKey: string;
  lookbackDays: number;
  sample: number;
  brier: number | null;
  logLoss: number | null;
  accuracy: number | null;
  calibrationError: number | null;
  buckets: CalibrationBucket[];
  rules: {
    marketBlendScale: number;
    modelBlendScale: number;
    eloBlendScale: number;
    maxModelDeviationFromMarket: number;
    confidenceScale: number;
    action: "TRUST" | "STANDARD" | "CAUTION" | "PASS_ONLY";
  };
  warnings: string[];
  generatedAt: string;
};

const BUCKETS = [
  { bucket: "50-55", min: 0.5, max: 0.55 },
  { bucket: "55-60", min: 0.55, max: 0.6 },
  { bucket: "60-65", min: 0.6, max: 0.65 },
  { bucket: "65-70", min: 0.65, max: 0.7 },
  { bucket: "70-80", min: 0.7, max: 0.8 },
  { bucket: "80+", min: 0.8, max: 1.01 }
];

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function safeLogLoss(probability: number, actual: number) {
  const p = clamp(probability, 0.01, 0.99);
  return -(actual * Math.log(p) + (1 - actual) * Math.log(1 - p));
}

function scoreFromJson(value: unknown, side: "home" | "away") {
  const record = asRecord(value);
  const keys = side === "home"
    ? ["homeScore", "home", "home_score", "homeRuns", "home_points"]
    : ["awayScore", "away", "away_score", "awayRuns", "away_points"];
  for (const key of keys) {
    const found = readNumber(record[key]);
    if (found !== null) return found;
  }
  return null;
}

function actualHomeWin(event: any) {
  const homeParticipant = Array.isArray(event.participants)
    ? event.participants.find((participant: any) => participant.role === "HOME")
    : null;
  if (typeof homeParticipant?.isWinner === "boolean") return homeParticipant.isWinner ? 1 : 0;

  const homeScore = scoreFromJson(event.resultJson, "home") ?? scoreFromJson(event.scoreJson, "home") ?? scoreFromJson(event.stateJson, "home");
  const awayScore = scoreFromJson(event.resultJson, "away") ?? scoreFromJson(event.scoreJson, "away") ?? scoreFromJson(event.stateJson, "away");
  if (homeScore === null || awayScore === null || homeScore === awayScore) return null;
  return homeScore > awayScore ? 1 : 0;
}

function projectionProbability(projection: any) {
  const metadata = asRecord(projection.metadataJson);
  const adjustments = asRecord(metadata.gameOutcomeAdjustments);
  const final = readNumber(adjustments.finalWinProbHome);
  if (final !== null) return final;
  return readNumber(projection.winProbHome);
}

function bucketStats(rows: Array<{ probability: number; actual: number }>, min: number, max: number) {
  const bucketRows = rows.filter((row) => row.probability >= min && row.probability < max);
  const predicted = avg(bucketRows.map((row) => row.probability));
  const actual = avg(bucketRows.map((row) => row.actual));
  const brier = avg(bucketRows.map((row) => (row.probability - row.actual) ** 2));
  return {
    sample: bucketRows.length,
    predictedAvg: predicted === null ? null : Number(predicted.toFixed(4)),
    actualWinRate: actual === null ? null : Number(actual.toFixed(4)),
    calibrationError: predicted === null || actual === null ? null : Number(Math.abs(predicted - actual).toFixed(4)),
    brier: brier === null ? null : Number(brier.toFixed(5))
  };
}

function buildRules(args: { sample: number; brier: number | null; calibrationError: number | null; accuracy: number | null }) {
  const warnings: string[] = [];
  const brier = args.brier ?? 0.28;
  const calibrationError = args.calibrationError ?? 0.12;
  let action: GameOutcomeCalibrationProfile["rules"]["action"] = "STANDARD";
  let marketBlendScale = 1;
  let modelBlendScale = 1;
  let eloBlendScale = 1;
  let confidenceScale = 1;
  let maxModelDeviationFromMarket = 0.16;

  if (args.sample < 80) {
    warnings.push(`Thin game-outcome calibration sample: ${args.sample}/80.`);
    action = "CAUTION";
    marketBlendScale += 0.12;
    modelBlendScale -= 0.12;
    confidenceScale -= 0.12;
    maxModelDeviationFromMarket = 0.11;
  }

  if (brier > 0.245 || calibrationError > 0.085) {
    warnings.push(`Game outcome calibration is weak: brier=${brier.toFixed(4)}, calibrationError=${calibrationError.toFixed(4)}.`);
    action = args.sample < 40 ? "PASS_ONLY" : "CAUTION";
    marketBlendScale += 0.18;
    modelBlendScale -= 0.18;
    eloBlendScale -= 0.08;
    confidenceScale -= 0.18;
    maxModelDeviationFromMarket = 0.09;
  } else if (brier < 0.215 && calibrationError < 0.045 && args.sample >= 120) {
    action = "TRUST";
    marketBlendScale -= 0.08;
    modelBlendScale += 0.12;
    eloBlendScale += 0.04;
    confidenceScale += 0.08;
    maxModelDeviationFromMarket = 0.2;
  }

  return {
    rules: {
      marketBlendScale: Number(clamp(marketBlendScale, 0.75, 1.35).toFixed(4)),
      modelBlendScale: Number(clamp(modelBlendScale, 0.65, 1.25).toFixed(4)),
      eloBlendScale: Number(clamp(eloBlendScale, 0.75, 1.2).toFixed(4)),
      maxModelDeviationFromMarket: Number(clamp(maxModelDeviationFromMarket, 0.06, 0.22).toFixed(4)),
      confidenceScale: Number(clamp(confidenceScale, 0.65, 1.15).toFixed(4)),
      action
    },
    warnings
  };
}

export async function rebuildGameOutcomeCalibration(args: { leagueKey: string; lookbackDays?: number }): Promise<GameOutcomeCalibrationProfile> {
  const lookbackDays = Math.max(14, Math.min(730, args.lookbackDays ?? 180));
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const projections = await (prisma.eventProjection as any).findMany({
    where: {
      event: {
        league: { key: args.leagueKey },
        status: "FINAL",
        startTime: { gte: since }
      }
    },
    include: {
      event: {
        include: { participants: true }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 2500
  });

  const latestByEvent = new Map<string, any>();
  for (const projection of projections) {
    if (!latestByEvent.has(projection.eventId)) latestByEvent.set(projection.eventId, projection);
  }

  const rows: Array<{ probability: number; actual: number }> = [];
  for (const projection of latestByEvent.values()) {
    const probability = projectionProbability(projection);
    const actual = actualHomeWin(projection.event);
    if (probability === null || actual === null) continue;
    rows.push({ probability: clamp(probability, 0.01, 0.99), actual });
  }

  const brier = avg(rows.map((row) => (row.probability - row.actual) ** 2));
  const logLoss = avg(rows.map((row) => safeLogLoss(row.probability, row.actual)));
  const correct = rows.filter((row) => (row.probability >= 0.5 && row.actual === 1) || (row.probability < 0.5 && row.actual === 0)).length;
  const buckets = BUCKETS.map((bucket) => ({ ...bucket, ...bucketStats(rows, bucket.min, bucket.max) }));
  const calibrationError = avg(buckets.filter((bucket) => bucket.calibrationError !== null && bucket.sample >= 5).map((bucket) => bucket.calibrationError as number));
  const ruleResult = buildRules({ sample: rows.length, brier, calibrationError, accuracy: rows.length ? correct / rows.length : null });

  const profile: GameOutcomeCalibrationProfile = {
    leagueKey: args.leagueKey,
    lookbackDays,
    sample: rows.length,
    brier: brier === null ? null : Number(brier.toFixed(5)),
    logLoss: logLoss === null ? null : Number(logLoss.toFixed(5)),
    accuracy: rows.length ? Number((correct / rows.length).toFixed(4)) : null,
    calibrationError: calibrationError === null ? null : Number(calibrationError.toFixed(4)),
    buckets,
    rules: ruleResult.rules,
    warnings: ruleResult.warnings,
    generatedAt: new Date().toISOString()
  };

  await prisma.trendCache.upsert({
    where: { cacheKey: `game_outcome_calibration:${args.leagueKey}` },
    update: {
      scope: "game_outcome_calibration",
      filterJson: toJson({ leagueKey: args.leagueKey, lookbackDays }),
      payloadJson: toJson(profile),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    },
    create: {
      cacheKey: `game_outcome_calibration:${args.leagueKey}`,
      scope: "game_outcome_calibration",
      filterJson: toJson({ leagueKey: args.leagueKey, lookbackDays }),
      payloadJson: toJson(profile),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    }
  });

  return profile;
}

export async function getLatestGameOutcomeCalibration(leagueKey: string) {
  const cached = await prisma.trendCache.findFirst({
    where: { cacheKey: `game_outcome_calibration:${leagueKey}`, scope: "game_outcome_calibration", expiresAt: { gt: new Date() } },
    orderBy: { updatedAt: "desc" }
  });
  return cached?.payloadJson as GameOutcomeCalibrationProfile | null;
}
