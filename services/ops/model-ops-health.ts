import { prisma } from "@/lib/db/prisma";

type ModelOpsHealth = {
  generatedAt: string;
  closingLineHealth: {
    upcomingEvents: number;
    marketsNearLock: number;
    frozenMarketsNearLock: number;
    freezeCoverage: number | null;
  };
  evaluationHealth: {
    latestReportAt: string | null;
    latestLeagueKey: string | null;
    latestLookbackDays: number | null;
    playerPropSample: number | null;
    playerPropHitRate: number | null;
    avgClvLine: number | null;
  };
  tuningHealth: {
    latestProfileAt: string | null;
    latestLeagueKey: string | null;
    ruleCount: number;
    defaultAction: string | null;
  };
  warnings: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export async function getModelOpsHealth(): Promise<ModelOpsHealth> {
  const now = new Date();
  const lockStart = new Date(now.getTime() - 90 * 60 * 1000);
  const lockEnd = new Date(now.getTime() + 45 * 60 * 1000);

  const nearLockEvents = await prisma.event.findMany({
    where: {
      startTime: { gte: lockStart, lte: lockEnd },
      status: { in: ["SCHEDULED", "LIVE", "FINAL"] },
      league: { key: "NBA" }
    },
    select: { id: true }
  });
  const eventIds = nearLockEvents.map((event) => event.id);
  const marketsNearLock = eventIds.length
    ? await prisma.eventMarket.findMany({
        where: { eventId: { in: eventIds } },
        select: { id: true, closingOdds: true }
      })
    : [];
  const frozenMarketsNearLock = marketsNearLock.filter((market) => market.closingOdds !== null).length;
  const freezeCoverage = marketsNearLock.length ? frozenMarketsNearLock / marketsNearLock.length : null;

  const [latestEvaluation, latestTuning] = await Promise.all([
    prisma.trendCache.findFirst({
      where: {
        scope: "model_evaluation_report",
        expiresAt: { gt: now }
      },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.trendCache.findFirst({
      where: {
        scope: "model_tuning_profile",
        expiresAt: { gt: now }
      },
      orderBy: { updatedAt: "desc" }
    })
  ]);

  const evaluation = asRecord(latestEvaluation?.payloadJson);
  const evaluationPlayerProps = asRecord(evaluation.playerProps);
  const tuning = asRecord(latestTuning?.payloadJson);
  const tuningRules = asRecord(tuning.rules);
  const tuningDefaultRule = asRecord(tuning.defaultRule);
  const warnings: string[] = [];

  if (marketsNearLock.length > 0 && (freezeCoverage ?? 0) < 0.75) {
    warnings.push(`Closing-line freeze coverage is low: ${Math.round((freezeCoverage ?? 0) * 100)}%.`);
  }
  if (!latestEvaluation) warnings.push("No cached model evaluation report found.");
  if (!latestTuning) warnings.push("No cached model tuning profile found.");
  if (readNumber(evaluationPlayerProps.sample) !== null && (readNumber(evaluationPlayerProps.sample) ?? 0) < 250) {
    warnings.push(`Evaluation player-prop sample is thin: ${readNumber(evaluationPlayerProps.sample)}/250.`);
  }
  if (Object.keys(tuningRules).length === 0 && latestTuning) {
    warnings.push("Tuning profile has no stat-specific rules.");
  }

  return {
    generatedAt: now.toISOString(),
    closingLineHealth: {
      upcomingEvents: nearLockEvents.length,
      marketsNearLock: marketsNearLock.length,
      frozenMarketsNearLock,
      freezeCoverage
    },
    evaluationHealth: {
      latestReportAt: readString(evaluation.generatedAt),
      latestLeagueKey: readString(evaluation.leagueKey),
      latestLookbackDays: readNumber(evaluation.lookbackDays),
      playerPropSample: readNumber(evaluationPlayerProps.sample),
      playerPropHitRate: readNumber(evaluationPlayerProps.hitRate),
      avgClvLine: readNumber(evaluationPlayerProps.avgClvLine)
    },
    tuningHealth: {
      latestProfileAt: readString(tuning.generatedAt),
      latestLeagueKey: readString(tuning.leagueKey),
      ruleCount: Object.keys(tuningRules).length,
      defaultAction: readString(tuningDefaultRule.action)
    },
    warnings
  };
}
