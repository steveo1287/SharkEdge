import { Prisma } from "@prisma/client";

import { getServerDatabaseResolution, hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import {
  buildTrendSystemRun,
  PUBLISHED_SYSTEMS,
  type TrendSystemDefinition,
  type TrendSystemMatch
} from "@/services/trends/trend-system-engine";
import { runTrendSystemBacktests } from "@/services/trends/trend-system-ledger";

const DEFAULT_USER_ID = "user_demo";
const trendPrisma = prisma as any;

type CaptureStatus = "captured" | "skipped" | "failed";

type MetricsProvenance = {
  source: string;
  reason: string | null;
  ledgerRows: number;
  gradedRows: number;
  openRows?: number;
  savedRows?: number;
  eventMarketRows?: number;
};

export type TrendSystemCaptureResult = {
  systemId: string;
  systemName: string;
  definitionId: string | null;
  status: CaptureStatus;
  activeMatches: number;
  capturedMatches: number;
  skippedMatches: number;
  reason: string | null;
  matchResults: Array<{
    gameId: string;
    eventLabel: string;
    eventId: string | null;
    status: CaptureStatus;
    reason: string | null;
  }>;
};

export type TrendSystemCaptureRun = {
  ok: boolean;
  generatedAt: string;
  database: {
    usable: boolean;
    source: string | null;
  };
  summary: {
    systems: number;
    activeSystems: number;
    activeMatches: number;
    capturedMatches: number;
    skippedMatches: number;
    failedSystems: number;
    definitionsCreatedOrUpdated: number;
    metricsLedgerBacked: number;
    metricsSavedLedgerBacked: number;
    metricsEventMarketBacked: number;
    metricsSeededFallback: number;
  };
  results: TrendSystemCaptureResult[];
};

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function ensureTrendUser() {
  await trendPrisma.user.upsert({
    where: { id: DEFAULT_USER_ID },
    update: {},
    create: {
      id: DEFAULT_USER_ID,
      username: "demo_bettor",
      bankrollSettingsJson: {
        bankroll: 5000,
        unitSize: 100
      }
    }
  });
}

function statsJson(system: TrendSystemDefinition, provenance?: MetricsProvenance) {
  return {
    wins: system.metrics.wins,
    losses: system.metrics.losses,
    pushes: system.metrics.pushes,
    totalGames: system.metrics.sampleSize,
    winPercentage: system.metrics.winRatePct,
    roi: system.metrics.roiPct,
    totalProfit: system.metrics.profitUnits,
    currentStreak: system.metrics.currentStreak,
    last30WinRatePct: system.metrics.last30WinRatePct,
    clvPct: system.metrics.clvPct,
    seasons: system.metrics.seasons,
    provenance: provenance ?? {
      source: "seeded-fallback",
      reason: "Starter published-system metrics captured before saved-ledger or EventMarket sample is available.",
      ledgerRows: 0,
      gradedRows: 0,
      openRows: 0,
      savedRows: 0,
      eventMarketRows: 0
    }
  };
}

async function findExistingDefinition(system: TrendSystemDefinition) {
  return trendPrisma.savedTrendDefinition.findFirst({
    where: {
      OR: [
        { name: system.name },
        {
          filterConditionsJson: {
            path: ["publishedSystemId"],
            equals: system.id
          }
        }
      ]
    }
  });
}

async function upsertSystemDefinition(system: TrendSystemDefinition, provenance?: MetricsProvenance) {
  const existing = await findExistingDefinition(system);
  const filterConditions = {
    ...system.filters,
    publishedSystemId: system.id,
    rules: system.rules,
    risk: system.risk,
    verified: system.verified,
    source: system.source
  };
  const data = {
    creatorId: DEFAULT_USER_ID,
    name: system.name,
    description: system.description,
    sport: system.sport,
    league: system.league,
    betType: system.market,
    filterConditionsJson: toInputJsonValue(filterConditions),
    currentStatsJson: toInputJsonValue(statsJson(system, provenance)),
    isSystemGenerated: true,
    isUserCreated: false,
    isPublic: true,
    isPremium: system.verified,
    lastComputedAt: new Date()
  };

  if (existing?.id) {
    return trendPrisma.savedTrendDefinition.update({
      where: { id: existing.id },
      data
    });
  }

  return trendPrisma.savedTrendDefinition.create({ data });
}

async function findEventForMatch(match: TrendSystemMatch) {
  const exact = await trendPrisma.event.findFirst({
    where: {
      OR: [
        { externalEventId: match.gameId },
        { id: match.gameId }
      ]
    },
    select: { id: true, name: true, startTime: true }
  });
  if (exact) return exact;

  const start = new Date(match.startTime);
  if (Number.isNaN(start.getTime())) return null;
  const windowStart = new Date(start.getTime() - 12 * 60 * 60 * 1000);
  const windowEnd = new Date(start.getTime() + 12 * 60 * 60 * 1000);
  return trendPrisma.event.findFirst({
    where: {
      league: { key: match.league },
      startTime: { gte: windowStart, lte: windowEnd },
      name: { contains: match.eventLabel.split(" @ ")[0] ?? match.eventLabel, mode: "insensitive" }
    },
    select: { id: true, name: true, startTime: true }
  });
}

function syntheticOpenResult(match: TrendSystemMatch) {
  return "OPEN";
}

async function captureMatch(definitionId: string, match: TrendSystemMatch, cumulativeProfit: number) {
  const event = await findEventForMatch(match);
  if (!event?.id) {
    return {
      gameId: match.gameId,
      eventLabel: match.eventLabel,
      eventId: null,
      status: "skipped" as CaptureStatus,
      reason: "No matching Event row found. Ingest/sync events before capture can persist this active match."
    };
  }

  const existing = await trendPrisma.savedTrendMatch.findFirst({
    where: {
      trendDefinitionId: definitionId,
      eventId: event.id
    },
    select: { id: true, betResult: true }
  });

  const metadata = {
    publishedSystemMatch: true,
    gameId: match.gameId,
    actionability: match.actionability,
    side: match.side,
    market: match.market,
    price: match.price,
    fairProbability: match.fairProbability,
    edgePct: match.edgePct,
    confidencePct: match.confidencePct,
    reasons: match.reasons,
    href: match.href
  };

  if (existing?.id) {
    const currentResult = String(existing.betResult ?? "OPEN").toUpperCase();
    if (currentResult !== "OPEN") {
      return {
        gameId: match.gameId,
        eventLabel: match.eventLabel,
        eventId: event.id,
        status: "captured" as CaptureStatus,
        reason: `Existing captured match is already graded as ${currentResult}; capture preserved the graded ledger row.`
      };
    }

    await trendPrisma.savedTrendMatch.update({
      where: { id: existing.id },
      data: {
        matchedAt: new Date(match.startTime),
        betResult: syntheticOpenResult(match),
        unitsWon: 0,
        cumulativeProfit,
        metadataJson: toInputJsonValue(metadata)
      }
    });
  } else {
    await trendPrisma.savedTrendMatch.create({
      data: {
        trendDefinitionId: definitionId,
        eventId: event.id,
        matchedAt: new Date(match.startTime),
        betResult: syntheticOpenResult(match),
        unitsWon: 0,
        cumulativeProfit,
        metadataJson: toInputJsonValue(metadata)
      }
    });
  }

  return {
    gameId: match.gameId,
    eventLabel: match.eventLabel,
    eventId: event.id,
    status: "captured" as CaptureStatus,
    reason: existing?.id ? "Updated existing open system match." : "Captured new active system match."
  };
}

async function writeSnapshot(definitionId: string, system: TrendSystemDefinition, activeGameCount: number, provenance?: MetricsProvenance) {
  await trendPrisma.savedTrendSnapshot.create({
    data: {
      trendDefinitionId: definitionId,
      totalGames: system.metrics.sampleSize,
      wins: system.metrics.wins,
      losses: system.metrics.losses,
      pushes: system.metrics.pushes,
      winPercentage: system.metrics.winRatePct,
      roi: system.metrics.roiPct,
      totalProfit: system.metrics.profitUnits,
      currentStreak: system.metrics.currentStreak,
      streakType: system.metrics.currentStreak.startsWith("W") ? "WIN" : system.metrics.currentStreak.startsWith("L") ? "LOSS" : null,
      pValue: null,
      chiSquareStat: null,
      isStatisticallySignificant: false,
      confidenceScore: Math.min(100, Math.max(0, system.metrics.winRatePct + system.metrics.roiPct)),
      sampleSizeRating: system.metrics.sampleSize >= 150 ? "strong" : system.metrics.sampleSize >= 75 ? "medium" : "thin",
      warningsJson: toInputJsonValue([
        provenance?.source && provenance.source !== "seeded-fallback"
          ? `Metrics are ${provenance.source} backed.`
          : "Metrics are seeded fallback until saved-ledger or EventMarket sample is available.",
        provenance?.reason
      ].filter(Boolean)),
      activeGameCount
    }
  });
}

export async function capturePublishedTrendSystemMatches(args?: { league?: string; includeInactive?: boolean }): Promise<TrendSystemCaptureRun> {
  const database = getServerDatabaseResolution();
  if (!hasUsableServerDatabaseUrl()) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      database: { usable: false, source: database.key },
      summary: {
        systems: 0,
        activeSystems: 0,
        activeMatches: 0,
        capturedMatches: 0,
        skippedMatches: 0,
        failedSystems: 0,
        definitionsCreatedOrUpdated: 0,
        metricsLedgerBacked: 0,
        metricsSavedLedgerBacked: 0,
        metricsEventMarketBacked: 0,
        metricsSeededFallback: 0
      },
      results: []
    };
  }

  await ensureTrendUser();
  const systemRun = await buildTrendSystemRun({ league: args?.league as any, includeInactive: args?.includeInactive ?? true });
  const backtests = await runTrendSystemBacktests(
    PUBLISHED_SYSTEMS.filter((system) => args?.league && args.league !== "ALL" ? system.league === args.league : true),
    { preferSaved: true }
  );
  const backtestBySystemId = new Map(backtests.results.map((result) => [result.systemId, result]));
  const results: TrendSystemCaptureResult[] = [];

  for (const system of systemRun.systems) {
    try {
      const backtest = backtestBySystemId.get(system.id);
      const provenance = backtest ? {
        source: backtest.metrics.source,
        reason: backtest.metrics.reason,
        ledgerRows: backtest.metrics.ledgerRows,
        gradedRows: backtest.metrics.gradedRows,
        openRows: backtest.metrics.openRows ?? 0,
        savedRows: backtest.metrics.savedRows ?? 0,
        eventMarketRows: backtest.metrics.eventMarketRows ?? 0
      } : undefined;
      const persistedSystem = backtest?.metrics ? { ...system, metrics: backtest.metrics } : system;
      const definition = await upsertSystemDefinition(persistedSystem, provenance);
      const cumulativeProfit = persistedSystem.metrics.profitUnits;
      const matchResults = [];
      for (const match of system.activeMatches) {
        const captured = await captureMatch(definition.id, match, cumulativeProfit);
        matchResults.push(captured);
      }
      await writeSnapshot(definition.id, persistedSystem, system.activeMatches.length, provenance);
      const capturedMatches = matchResults.filter((match) => match.status === "captured").length;
      const skippedMatches = matchResults.filter((match) => match.status === "skipped").length;
      results.push({
        systemId: system.id,
        systemName: system.name,
        definitionId: definition.id,
        status: capturedMatches || !system.activeMatches.length ? "captured" : "skipped",
        activeMatches: system.activeMatches.length,
        capturedMatches,
        skippedMatches,
        reason: capturedMatches ? null : system.activeMatches.length ? "No active matches could be tied to Event rows." : "Definition/snapshot captured; no active matches on current slate.",
        matchResults
      });
    } catch (error) {
      results.push({
        systemId: system.id,
        systemName: system.name,
        definitionId: null,
        status: "failed",
        activeMatches: system.activeMatches.length,
        capturedMatches: 0,
        skippedMatches: system.activeMatches.length,
        reason: error instanceof Error ? error.message : "Failed to capture published system.",
        matchResults: []
      });
    }
  }

  const capturedMatches = results.reduce((sum, result) => sum + result.capturedMatches, 0);
  const skippedMatches = results.reduce((sum, result) => sum + result.skippedMatches, 0);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    database: { usable: true, source: database.key },
    summary: {
      systems: results.length,
      activeSystems: results.filter((result) => result.activeMatches > 0).length,
      activeMatches: results.reduce((sum, result) => sum + result.activeMatches, 0),
      capturedMatches,
      skippedMatches,
      failedSystems: results.filter((result) => result.status === "failed").length,
      definitionsCreatedOrUpdated: results.filter((result) => result.definitionId).length,
      metricsLedgerBacked: backtests.summary.ledgerBacked,
      metricsSavedLedgerBacked: backtests.summary.savedLedgerBacked,
      metricsEventMarketBacked: backtests.summary.eventMarketBacked,
      metricsSeededFallback: backtests.summary.seededFallback
    },
    results
  };
}
