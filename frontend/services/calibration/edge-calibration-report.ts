import { prisma } from "@/lib/db/prisma";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

type SnapshotRow = {
  sport: string;
  marketType: string;
  modelVersion: string;
  confidenceBucket: string;
  factorBucket: string;
  modelProb: number;
  realizedOutcome: number;
  clvPercent: number | null;
  createdAt: Date;
};

function confidenceBucket(prob: number) {
  const p = clamp(prob, 0, 0.9999);
  const lower = Math.floor(p * 10) * 10;
  return `${lower}-${lower + 9}%`;
}

function factorBucket(snapshot: {
  decompositionJson: unknown;
}) {
  const decomposition = asObject(snapshot.decompositionJson);
  const contributions = Array.isArray(decomposition?.contributions) ? decomposition.contributions : [];
  const positive = contributions
    .map((item) => asObject(item))
    .filter(Boolean)
    .sort((a, b) => Math.abs(Number(b?.value ?? 0)) - Math.abs(Number(a?.value ?? 0)))[0];
  return String(positive?.key ?? "unknown");
}

function daysAgo(date: Date) {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

function summarizeRows(rows: SnapshotRow[]) {
  const count = rows.length || 1;
  let brier = 0;
  let logLoss = 0;
  let clvSum = 0;
  let clvCount = 0;

  for (const row of rows) {
    const p = clamp(row.modelProb, 0.0001, 0.9999);
    const y = clamp(row.realizedOutcome, 0, 1);
    brier += Math.pow(p - y, 2);
    logLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    if (typeof row.clvPercent === "number") {
      clvSum += row.clvPercent;
      clvCount += 1;
    }
  }

  return {
    sampleSize: rows.length,
    brier: round(brier / count, 6),
    logLoss: round(logLoss / count, 6),
    averageClvPercent: clvCount ? round(clvSum / clvCount, 4) : null,
    hitRate: round(rows.reduce((sum, row) => sum + row.realizedOutcome, 0) / count, 4)
  };
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return Array.from(map.entries()).map(([key, items]) => ({
    key,
    ...summarizeRows(items as unknown as SnapshotRow[])
  }));
}

export async function buildSegmentedCalibrationReport() {
  const snapshots = await prisma.edgeExplanationSnapshot.findMany({
    where: {
      realizedOutcome: { not: null }
    },
    include: {
      edgeSignal: {
        include: {
          event: {
            include: {
              league: true
            }
          }
        }
      }
    },
    orderBy: [{ createdAt: "desc" }],
    take: 10000
  });

  const rows: SnapshotRow[] = snapshots
    .filter((snapshot) => typeof snapshot.realizedOutcome === "number")
    .map((snapshot) => ({
      sport: snapshot.edgeSignal.event.league.sport,
      marketType: snapshot.marketType,
      modelVersion: snapshot.modelVersion ?? "unknown",
      confidenceBucket: confidenceBucket(snapshot.modelProb),
      factorBucket: factorBucket(snapshot),
      modelProb: snapshot.modelProb,
      realizedOutcome: Number(snapshot.realizedOutcome),
      clvPercent: snapshot.clvPercent,
      createdAt: snapshot.createdAt
    }));

  const rolling = {
    d7: summarizeRows(rows.filter((row) => daysAgo(row.createdAt) <= 7)),
    d30: summarizeRows(rows.filter((row) => daysAgo(row.createdAt) <= 30)),
    d90: summarizeRows(rows.filter((row) => daysAgo(row.createdAt) <= 90))
  };

  return {
    generatedAt: new Date().toISOString(),
    overall: summarizeRows(rows),
    rolling,
    bySport: groupBy(rows, (row) => row.sport),
    byMarketType: groupBy(rows, (row) => row.marketType),
    byModelVersion: groupBy(rows, (row) => row.modelVersion),
    byFactorBucket: groupBy(rows, (row) => row.factorBucket),
    byConfidenceBucket: groupBy(rows, (row) => row.confidenceBucket)
  };
}
