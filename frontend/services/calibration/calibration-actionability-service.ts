import { prisma } from "@/lib/db/prisma";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function isWinnerMarket(marketType: string) {
  const normalized = marketType.toLowerCase();
  return normalized.includes("moneyline") || normalized.includes("winner");
}

function buildAlertSignature(alert: {
  title: string;
  detail: string;
  metadata: Record<string, unknown>;
}) {
  return [
    alert.title,
    alert.detail,
    String(alert.metadata.kind ?? ""),
    String(alert.metadata.key ?? ""),
    String(alert.metadata.metric ?? "")
  ].join("|");
}

export async function getActiveCalibrationAlerts(limit = 50) {
  const batches = await prisma.importBatch.findMany({
    where: {
      source: "calibration_alerts",
      status: "COMPLETED"
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit
  });

  const deduped = new Map<string, Record<string, unknown>>();

  for (const batch of batches) {
    const metadata = asObject(batch.metadataJson);
    const alerts = Array.isArray(metadata?.alerts) ? metadata.alerts : [];
    for (const raw of alerts) {
      const alert = asObject(raw);
      if (!alert) continue;
      const signature = buildAlertSignature({
        title: String(alert.title ?? ""),
        detail: String(alert.detail ?? ""),
        metadata: asObject(alert.metadata) ?? {}
      });
      if (!deduped.has(signature)) {
        deduped.set(signature, {
          ...alert,
          signature,
          createdAt: batch.createdAt.toISOString()
        });
      }
    }
  }

  return Array.from(deduped.values());
}

export async function shouldSuppressCalibrationAlert(alert: {
  title: string;
  detail: string;
  metadata: Record<string, unknown>;
}, cooldownHours = 12) {
  const signature = buildAlertSignature(alert);
  const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);

  const batches = await prisma.importBatch.findMany({
    where: {
      source: "calibration_alerts",
      status: "COMPLETED",
      createdAt: { gte: cutoff }
    },
    orderBy: [{ createdAt: "desc" }],
    take: 20
  });

  for (const batch of batches) {
    const metadata = asObject(batch.metadataJson);
    const alerts = Array.isArray(metadata?.alerts) ? metadata.alerts : [];
    for (const raw of alerts) {
      const existing = asObject(raw);
      if (!existing) continue;
      const existingSignature = buildAlertSignature({
        title: String(existing.title ?? ""),
        detail: String(existing.detail ?? ""),
        metadata: asObject(existing.metadata) ?? {}
      });
      if (existingSignature == signature) {
        return true;
      }
    }
  }

  return false;
}

export function applyFactorBucketPenalty(input: {
  rankSignal: number;
  adjustedEdgeScore: number;
  factorBucket: string | null;
  degradedFactorBuckets: string[];
}) {
  if (!input.factorBucket || !input.degradedFactorBuckets.includes(input.factorBucket)) {
    return {
      adjustedRankSignal: input.rankSignal,
      downWeight: 0
    };
  }

  const downWeight = 0.08;
  return {
    adjustedRankSignal: round(input.rankSignal * (1 - downWeight)),
    downWeight
  };
}

export function qualifiesWinnerMarket(input: {
  marketType: string;
  modelProb: number;
  confidenceScore: number | null;
  adjustedEdgeScore: number | null;
}) {
  if (!isWinnerMarket(input.marketType)) {
    return false;
  }

  const confidence = (input.confidenceScore ?? 0) / 100;
  return input.modelProb >= 0.58 && confidence >= 0.62 && (input.adjustedEdgeScore ?? 0) >= 55;
}

export function extractDegradedFactorBuckets(summaryRows: Array<{
  scope: string;
  metricsJson: unknown;
  flagsJson: unknown;
}>) {
  const degraded = new Set<string>();

  for (const row of summaryRows) {
    if (row.scope !== "factor_bucket") continue;
    const metrics = asObject(row.metricsJson);
    const flags = Array.isArray(row.flagsJson) ? row.flagsJson : [];
    if (!flags.length) continue;
    const key = String(metrics?.key ?? "");
    if (key) {
      degraded.add(key);
    }
  }

  return Array.from(degraded);
}
