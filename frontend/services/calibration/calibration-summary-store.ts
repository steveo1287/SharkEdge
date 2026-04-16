import { prisma } from "@/lib/db/prisma";

type PersistCalibrationSummaryInput = {
  summaryDate: Date;
  scope: string;
  sport?: string | null;
  marketType?: string | null;
  modelVersion?: string | null;
  thresholdConfigJson: unknown;
  metricsJson: unknown;
  flagsJson: unknown;
};

export async function persistCalibrationSummary(input: PersistCalibrationSummaryInput) {
  return prisma.calibrationSummary.upsert({
    where: {
      summaryDate_scope_sport_marketType_modelVersion: {
        summaryDate: input.summaryDate,
        scope: input.scope,
        sport: input.sport ?? null,
        marketType: input.marketType ?? null,
        modelVersion: input.modelVersion ?? null
      }
    },
    update: {
      thresholdConfigJson: input.thresholdConfigJson,
      metricsJson: input.metricsJson,
      flagsJson: input.flagsJson
    },
    create: {
      summaryDate: input.summaryDate,
      scope: input.scope,
      sport: input.sport ?? null,
      marketType: input.marketType ?? null,
      modelVersion: input.modelVersion ?? null,
      thresholdConfigJson: input.thresholdConfigJson,
      metricsJson: input.metricsJson,
      flagsJson: input.flagsJson
    }
  });
}

export async function listRecentCalibrationSummaries(limit = 30) {
  return prisma.calibrationSummary.findMany({
    orderBy: [{ summaryDate: "desc" }, { createdAt: "desc" }],
    take: limit
  });
}
