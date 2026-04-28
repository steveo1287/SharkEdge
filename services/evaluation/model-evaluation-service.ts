import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { clampProbability } from "@/services/simulation/probability-math";

type JsonRecord = Record<string, unknown>;

type BucketSummary = {
  bucket: string;
  count: number;
  hitRate: number | null;
  avgEdge: number | null;
  avgClvLine: number | null;
  avgAbsError: number | null;
  brier: number | null;
};

type PlayerPropEvaluationRecord = {
  projectionId: string;
  eventId: string;
  eventName: string;
  leagueKey: string;
  startTime: string;
  playerId: string;
  playerName: string;
  statKey: string;
  actualValue: number;
  modelMean: number;
  modelStdDev: number;
  marketLine: number | null;
  closingLine: number | null;
  modelOverProbability: number | null;
  marketNoVigOverProbability: number | null;
  modelEdgeProbability: number | null;
  modelPick: "OVER" | "UNDER" | "NONE";
  result: "WIN" | "LOSS" | "PUSH" | "NO_LINE";
  absoluteError: number;
  squaredError: number;
  brier: number | null;
  clvLine: number | null;
  confidence: number | null;
  metadata: JsonRecord;
};

type EventEvaluationRecord = {
  projectionId: string;
  eventId: string;
  eventName: string;
  leagueKey: string;
  startTime: string;
  modelHomeWinProbability: number;
  actualHomeWin: 0 | 1;
  modelPickedHome: boolean;
  winnerCorrect: boolean;
  brier: number;
  logLoss: number;
  projectedSpreadHome: number | null;
  actualSpreadHome: number | null;
  projectedTotal: number | null;
  actualTotal: number | null;
  spreadAbsError: number | null;
  totalAbsError: number | null;
};

type EvaluationReport = {
  generatedAt: string;
  leagueKey: string | null;
  lookbackDays: number;
  playerProps: {
    sample: number;
    withLineSample: number;
    hitRate: number | null;
    mae: number | null;
    rmse: number | null;
    brier: number | null;
    avgModelEdge: number | null;
    avgClvLine: number | null;
    byStatKey: BucketSummary[];
    byEdgeBucket: BucketSummary[];
    byConfidenceBucket: BucketSummary[];
    records: PlayerPropEvaluationRecord[];
  };
  events: {
    sample: number;
    winnerAccuracy: number | null;
    brier: number | null;
    logLoss: number | null;
    spreadMae: number | null;
    totalMae: number | null;
    records: EventEvaluationRecord[];
  };
  guardrails: {
    warnings: string[];
    minimumSamples: {
      playerProps: number;
      events: number;
    };
  };
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number | null, digits = 4) {
  return value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}

function avg(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function logLoss(probability: number, actual: 0 | 1) {
  const p = clampProbability(probability, 0.0001, 0.9999);
  return -(actual * Math.log(p) + (1 - actual) * Math.log(1 - p));
}

function scoreFromResult(result: unknown, side: "home" | "away") {
  const record = asRecord(result);
  const keys = side === "home"
    ? ["homeScore", "home", "home_score", "homeRuns", "home_points"]
    : ["awayScore", "away", "away_score", "awayRuns", "away_points"];
  for (const key of keys) {
    const value = readNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function emptyPlayerPropSection(): EvaluationReport["playerProps"] {
  return {
    sample: 0,
    withLineSample: 0,
    hitRate: null,
    mae: null,
    rmse: null,
    brier: null,
    avgModelEdge: null,
    avgClvLine: null,
    byStatKey: [],
    byEdgeBucket: [],
    byConfidenceBucket: [],
    records: []
  };
}

function actualHomeWinFromEvent(event: any): 0 | 1 | null {
  const result = event.eventResult;
  const homeParticipant = Array.isArray(event.participants)
    ? event.participants.find((participant: any) => String(participant.role) === "HOME")
    : null;

  if (result?.winnerCompetitorId && homeParticipant?.competitorId) {
    return result.winnerCompetitorId === homeParticipant.competitorId ? 1 : 0;
  }

  const homeScore = scoreFromResult(result, "home") ?? scoreFromResult(event.resultJson, "home") ?? scoreFromResult(event.scoreJson, "home");
  const awayScore = scoreFromResult(result, "away") ?? scoreFromResult(event.resultJson, "away") ?? scoreFromResult(event.scoreJson, "away");
  if (homeScore === null || awayScore === null || homeScore === awayScore) return null;
  return homeScore > awayScore ? 1 : 0;
}

function buildEventRecords(events: any[]): EventEvaluationRecord[] {
  const records: EventEvaluationRecord[] = [];

  for (const event of events) {
    const projection = Array.isArray(event.eventProjections) ? event.eventProjections[0] : null;
    const actualHomeWin = actualHomeWinFromEvent(event);
    const modelHomeWinProbability = readNumber(projection?.winProbHome);
    if (!projection || actualHomeWin === null || modelHomeWinProbability === null) continue;

    const result = event.eventResult;
    const projectedSpreadHome = readNumber(projection.projectedSpreadHome);
    const projectedTotal = readNumber(projection.projectedTotal);
    const actualSpreadHome = typeof result?.margin === "number"
      ? actualHomeWin === 1 ? result.margin : -result.margin
      : null;
    const actualTotal = readNumber(result?.totalPoints);

    records.push({
      projectionId: projection.id,
      eventId: event.id,
      eventName: event.name,
      leagueKey: event.league?.key ?? "unknown",
      startTime: event.startTime instanceof Date ? event.startTime.toISOString() : String(event.startTime),
      modelHomeWinProbability,
      actualHomeWin,
      modelPickedHome: modelHomeWinProbability >= 0.5,
      winnerCorrect: (modelHomeWinProbability >= 0.5) === (actualHomeWin === 1),
      brier: (modelHomeWinProbability - actualHomeWin) ** 2,
      logLoss: logLoss(modelHomeWinProbability, actualHomeWin),
      projectedSpreadHome,
      actualSpreadHome,
      projectedTotal,
      actualTotal,
      spreadAbsError: projectedSpreadHome !== null && actualSpreadHome !== null ? Math.abs(projectedSpreadHome - actualSpreadHome) : null,
      totalAbsError: projectedTotal !== null && actualTotal !== null ? Math.abs(projectedTotal - actualTotal) : null
    });
  }

  return records;
}

async function loadSettledEvents(args: { leagueKey?: string | null; lookbackDays: number }) {
  const events = await prisma.event.findMany({
    where: {
      status: "FINAL",
      resultState: "OFFICIAL",
      startTime: { gte: new Date(Date.now() - args.lookbackDays * 24 * 60 * 60 * 1000) },
      ...(args.leagueKey ? { league: { key: args.leagueKey } } : {})
    },
    include: {
      league: true,
      eventResult: true,
      participants: { include: { competitor: true } },
      eventProjections: { take: 1 }
    },
    orderBy: { startTime: "desc" },
    take: 1000
  });

  return events as any[];
}

function buildGuardrails(playerSample: number, eventRecords: EventEvaluationRecord[]) {
  const warnings: string[] = [];
  if (playerSample < 250) warnings.push(`Player prop sample below target (${playerSample}/250).`);
  if (eventRecords.length < 150) warnings.push(`Event projection sample below target (${eventRecords.length}/150).`);
  return {
    warnings,
    minimumSamples: {
      playerProps: 250,
      events: 150
    }
  };
}

export async function rebuildModelEvaluationReport(args: { leagueKey?: string | null; lookbackDays?: number } = {}) {
  const leagueKey = args.leagueKey ?? null;
  const lookbackDays = Math.max(1, Math.min(365, args.lookbackDays ?? 90));
  const events = await loadSettledEvents({ leagueKey, lookbackDays });
  const eventRecords = buildEventRecords(events);
  const playerProps = emptyPlayerPropSection();

  const report: EvaluationReport = {
    generatedAt: new Date().toISOString(),
    leagueKey,
    lookbackDays,
    playerProps,
    events: {
      sample: eventRecords.length,
      winnerAccuracy: eventRecords.length ? round(eventRecords.filter((record) => record.winnerCorrect).length / eventRecords.length) : null,
      brier: round(avg(eventRecords.map((record) => record.brier))),
      logLoss: round(avg(eventRecords.map((record) => record.logLoss))),
      spreadMae: round(avg(eventRecords.map((record) => record.spreadAbsError))),
      totalMae: round(avg(eventRecords.map((record) => record.totalAbsError))),
      records: eventRecords.slice(0, 250)
    },
    guardrails: buildGuardrails(playerProps.sample, eventRecords)
  };

  const cacheKey = `model_evaluation_report:${leagueKey ?? "all"}:${lookbackDays}`;
  await prisma.trendCache.upsert({
    where: { cacheKey },
    update: {
      scope: "model_evaluation_report",
      filterJson: toJson({ leagueKey, lookbackDays }),
      payloadJson: toJson(report),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    },
    create: {
      cacheKey,
      scope: "model_evaluation_report",
      filterJson: toJson({ leagueKey, lookbackDays }),
      payloadJson: toJson(report),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    }
  });

  return report;
}

export async function getCachedModelEvaluationReports() {
  const reports = await prisma.trendCache.findMany({
    where: {
      scope: "model_evaluation_report",
      expiresAt: { gt: new Date() }
    },
    orderBy: { updatedAt: "desc" }
  });

  return reports.map((report) => report.payloadJson as EvaluationReport);
}
