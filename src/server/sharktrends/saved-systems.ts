import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { ensureTrendUser } from "@/services/trends/saved-systems";

import { runSharkTrendBacktest } from "./backtest-engine";
import { findLiveSharkTrendQualifiers } from "./live-qualifiers";
import { parseSharkTrendQuery } from "./query-parser";
import { sharkTrendFilterZodSchema, type SharkTrendFilter } from "./types";

const DEFAULT_USER_ID = "user_demo";

type SavedSystemArgs = {
  name: string;
  rawQuery?: string | null;
  filters: SharkTrendFilter;
  alertEnabled?: boolean;
  minimumQualifierMatchScore?: number;
  minimumConfidenceGrade?: string;
  confirmedSmallSample?: boolean;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readSystemPayload(value: unknown) {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    product: record.product === "sharktrends" ? "sharktrends" : "legacy",
    rawQuery: typeof record.rawQuery === "string" ? record.rawQuery : null,
    filters: sharkTrendFilterZodSchema.parse(record.filters ?? { league: "MLB" }),
    alertEnabled: record.alertEnabled === true,
    minimumQualifierMatchScore: typeof record.minimumQualifierMatchScore === "number" ? record.minimumQualifierMatchScore : 70,
    minimumConfidenceGrade: typeof record.minimumConfidenceGrade === "string" ? record.minimumConfidenceGrade : "C",
    lastBacktestResult: record.lastBacktestResult ?? null,
    lastQualifierCount: typeof record.lastQualifierCount === "number" ? record.lastQualifierCount : null,
    lastRunAt: typeof record.lastRunAt === "string" ? record.lastRunAt : null
  };
}

export async function saveSharkTrendSystem(args: SavedSystemArgs) {
  await ensureTrendUser();
  const parsed = sharkTrendFilterZodSchema.parse(args.filters);
  const backtest = await runSharkTrendBacktest({ filters: parsed, limit: 250, includeMatches: false });
  if (backtest.result.sampleSize < 20 && !args.confirmedSmallSample) {
    return {
      ok: false as const,
      error: "Small sample systems require explicit confirmation before saving.",
      warnings: ["Sample size below 20. Run the backtest and confirm before saving."]
    };
  }
  const qualifiers = await findLiveSharkTrendQualifiers({ filters: parsed, daysAhead: 7 });
  const saved = await prisma.savedTrend.create({
    data: {
      userId: DEFAULT_USER_ID,
      name: args.name,
      sport: "BASEBALL",
      queryJson: toJson({
        product: "sharktrends",
        rawQuery: args.rawQuery ?? null,
        filters: parsed,
        alertEnabled: Boolean(args.alertEnabled),
        minimumQualifierMatchScore: args.minimumQualifierMatchScore ?? 70,
        minimumConfidenceGrade: args.minimumConfidenceGrade ?? "C",
        lastBacktestResult: backtest.result,
        lastQualifierCount: qualifiers.qualifiers.length,
        lastRunAt: new Date().toISOString()
      })
    }
  });
  await prisma.trendRun.create({
    data: {
      savedTrendId: saved.id,
      userId: DEFAULT_USER_ID,
      queryJson: toJson({ filters: parsed, rawQuery: args.rawQuery ?? null }),
      resultJson: toJson({ backtest: backtest.result, qualifierCount: qualifiers.qualifiers.length })
    }
  });
  return { ok: true as const, system: saved, backtest, qualifiers };
}

export async function listSharkTrendSystems() {
  await ensureTrendUser();
  const rows = await prisma.savedTrend.findMany({
    where: { userId: DEFAULT_USER_ID, sport: "BASEBALL" },
    include: { trendRuns: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: [{ archivedAt: "asc" }, { updatedAt: "desc" }]
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...readSystemPayload(row.queryJson),
      lastRunAt: row.trendRuns[0]?.createdAt?.toISOString() ?? readSystemPayload(row.queryJson).lastRunAt
    }))
    .filter((row) => row.product === "sharktrends");
}

export async function getSharkTrendSystem(id: string) {
  await ensureTrendUser();
  const row = await prisma.savedTrend.findFirst({ where: { id, userId: DEFAULT_USER_ID, sport: "BASEBALL" } });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...readSystemPayload(row.queryJson)
  };
}

export async function runSavedSharkTrendSystem(id: string) {
  const system = await getSharkTrendSystem(id);
  if (!system) return null;
  const backtest = await runSharkTrendBacktest({ filters: system.filters, includeMatches: false, limit: 500 });
  const qualifiers = await findLiveSharkTrendQualifiers({ filters: system.filters, daysAhead: 7 });
  await prisma.trendRun.create({
    data: {
      savedTrendId: id,
      userId: DEFAULT_USER_ID,
      queryJson: toJson({ filters: system.filters, rawQuery: system.rawQuery }),
      resultJson: toJson({ backtest: backtest.result, qualifierCount: qualifiers.qualifiers.length })
    }
  });
  await prisma.savedTrend.update({
    where: { id },
    data: {
      queryJson: toJson({
        product: "sharktrends",
        rawQuery: system.rawQuery,
        filters: system.filters,
        alertEnabled: system.alertEnabled,
        minimumQualifierMatchScore: system.minimumQualifierMatchScore,
        minimumConfidenceGrade: system.minimumConfidenceGrade,
        lastBacktestResult: backtest.result,
        lastQualifierCount: qualifiers.qualifiers.length,
        lastRunAt: new Date().toISOString()
      })
    }
  });
  return { system, backtest, qualifiers };
}

export async function archiveSharkTrendSystem(id: string) {
  await ensureTrendUser();
  await prisma.savedTrend.updateMany({ where: { id, userId: DEFAULT_USER_ID }, data: { archivedAt: new Date() } });
  return getSharkTrendSystem(id);
}

export function parseSystemInput(body: Record<string, unknown>) {
  const parsed = typeof body.rawQuery === "string" ? parseSharkTrendQuery(body.rawQuery) : null;
  return {
    name: typeof body.name === "string" ? body.name : parsed?.explanation ?? "Untitled SharkTrend",
    rawQuery: typeof body.rawQuery === "string" ? body.rawQuery : null,
    filters: sharkTrendFilterZodSchema.parse(body.filters ?? parsed?.filters ?? { league: "MLB" }),
    alertEnabled: body.alertEnabled === true,
    minimumQualifierMatchScore: typeof body.minimumQualifierMatchScore === "number" ? body.minimumQualifierMatchScore : undefined,
    minimumConfidenceGrade: typeof body.minimumConfidenceGrade === "string" ? body.minimumConfidenceGrade : undefined,
    confirmedSmallSample: body.confirmedSmallSample === true
  };
}
