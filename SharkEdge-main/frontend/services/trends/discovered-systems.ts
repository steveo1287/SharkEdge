import { prisma } from "@/lib/db/prisma";
import { safeArray, safeString, uniqueByKey } from "@/lib/utils/safe-data";
import { activateTrendSystems, discoverTrendSystems, defaultDiscoveryConfig } from "./system-discovery";
import { extractCurrentTrendRows, extractHistoricalTrendRows } from "./historical-row-extractor";
import { buildPersistedTrendBreakdowns } from "./breakdown-builder";
import type { CandidateTrendSystem } from "./types";

function isMissingDiscoveredTrendTables(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return [
    "discoveredTrendSystem",
    "discoveredTrendActivation",
    "discoveredTrendSystemSnapshot",
    "trendDiscoveryRun",
    "discovered_trend_systems",
    "discovered_trend_activations",
    "discovered_trend_system_snapshots",
    "trend_discovery_runs"
  ].some((token) => message.includes(token));
}

function normalizeConditionJson(value: unknown) {
  return safeArray(value);
}

function normalizeActivationReasons(value: unknown) {
  return safeArray(value).filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const output: R[] = [];

  for (let index = 0; index < items.length; index += limit) {
    const chunk = items.slice(index, index + limit);
    output.push(...(await Promise.all(chunk.map(worker))));
  }

  return output;
}

export function recordToView(record: any) {
  const snapshots = safeArray<any>(record.snapshots);
  const activations = safeArray<any>(record.activations);
  const latestSnapshot = snapshots[0] ?? null;
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    sport: record.sport,
    league: record.league,
    marketType: record.marketType,
    side: record.side,
    tier: record.tier,
    status: record.status,
    sampleSize: record.sampleSize,
    wins: record.wins,
    losses: record.losses,
    pushes: record.pushes,
    roi: record.roi,
    totalProfit: record.totalProfit,
    hitRate: record.hitRate,
    avgClv: record.avgClv,
    beatCloseRate: record.beatCloseRate,
    validationScore: record.validationScore,
    score: record.score,
    recentSampleSize: record.recentSampleSize,
    seasonsJson: safeArray(record.seasonsJson),
    teamBreakdownJson: safeArray(record.teamBreakdownJson),
    opponentBreakdownJson: safeArray(record.opponentBreakdownJson),
    lineDistributionJson: safeArray(record.lineDistributionJson),
    warningsJson: safeArray(record.warningsJson),
    conditionsJson: normalizeConditionJson(record.conditionsJson),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    latestSnapshot,
    snapshots,
    activations: activations.map((activation: any) => ({
      id: activation.id,
      eventId: activation.eventId,
      eventLabel: activation.eventLabel,
      eventStartTime: activation.eventStartTime,
      currentOdds: activation.currentOdds,
      currentLine: activation.currentLine,
      edgePct: activation.edgePct,
      fairOdds: activation.fairOdds,
      timingState: activation.timingState,
      confidenceTier: activation.confidenceTier,
      reasonsJson: normalizeActivationReasons(activation.reasonsJson),
      isActive: activation.isActive,
      event: activation.event
        ? {
            id: activation.event.id,
            name: activation.event.name,
            startTime: activation.event.startTime,
            league: activation.event.league
              ? {
                  key: activation.event.league.key,
                  name: activation.event.league.name
                }
              : null
          }
        : null
    }))
  };
}

async function createDiscoveryRun(args: { leagues?: string[]; historicalRowCount: number; currentRowCount: number }) {
  return (prisma as any).trendDiscoveryRun.create({
    data: {
      leaguesJson: args.leagues ?? [],
      historicalRowCount: args.historicalRowCount,
      currentRowCount: args.currentRowCount,
      status: "RUNNING"
    }
  });
}

async function completeDiscoveryRun(id: string, result: { discoveredSystemCount: number; activationCount: number; status: string; summary?: unknown }) {
  return (prisma as any).trendDiscoveryRun.update({
    where: { id },
    data: {
      discoveredSystemCount: result.discoveredSystemCount,
      activationCount: result.activationCount,
      status: result.status,
      completedAt: new Date(),
      summaryJson: result.summary ?? null
    }
  });
}

async function upsertSystem(
  runId: string,
  system: CandidateTrendSystem,
  breakdowns: { seasons: unknown; teams: unknown; opponents: unknown; lines: unknown }
) {
  return (prisma as any).discoveredTrendSystem.upsert({
    where: { slug: system.id },
    update: {
      discoveryRunId: runId,
      name: system.name,
      sport: system.sport,
      league: system.league,
      marketType: system.marketType,
      side: system.side,
      tier: system.tier,
      status: "ACTIVE",
      score: system.score,
      validationScore: system.validationScore,
      sampleSize: system.sampleSize,
      wins: system.wins,
      losses: system.losses,
      pushes: system.pushes,
      hitRate: system.hitRate,
      roi: system.roi,
      totalProfit: system.totalProfit,
      avgClv: system.avgClv,
      beatCloseRate: system.beatCloseRate,
      recentSampleSize: system.recentSampleSize,
      seasonsJson: breakdowns.seasons,
      teamBreakdownJson: breakdowns.teams,
      opponentBreakdownJson: breakdowns.opponents,
      lineDistributionJson: breakdowns.lines,
      warningsJson: system.warnings,
      conditionsJson: system.conditions
    },
    create: {
      discoveryRunId: runId,
      slug: system.id,
      name: system.name,
      sport: system.sport,
      league: system.league,
      marketType: system.marketType,
      side: system.side,
      tier: system.tier,
      status: "ACTIVE",
      score: system.score,
      validationScore: system.validationScore,
      sampleSize: system.sampleSize,
      wins: system.wins,
      losses: system.losses,
      pushes: system.pushes,
      hitRate: system.hitRate,
      roi: system.roi,
      totalProfit: system.totalProfit,
      avgClv: system.avgClv,
      beatCloseRate: system.beatCloseRate,
      recentSampleSize: system.recentSampleSize,
      seasonsJson: breakdowns.seasons,
      teamBreakdownJson: breakdowns.teams,
      opponentBreakdownJson: breakdowns.opponents,
      lineDistributionJson: breakdowns.lines,
      warningsJson: system.warnings,
      conditionsJson: system.conditions
    }
  });
}

async function createSnapshot(systemId: string, system: CandidateTrendSystem, activationCount: number) {
  return (prisma as any).discoveredTrendSystemSnapshot.create({
    data: {
      systemId,
      sampleSize: system.sampleSize,
      wins: system.wins,
      losses: system.losses,
      pushes: system.pushes,
      roi: system.roi,
      hitRate: system.hitRate,
      totalProfit: system.totalProfit,
      avgClv: system.avgClv,
      beatCloseRate: system.beatCloseRate,
      score: system.score,
      validationScore: system.validationScore,
      activationCount,
      warningsJson: system.warnings
    }
  });
}

export async function refreshDiscoveredTrendSystems(args?: { leagues?: string[]; days?: number }) {
  try {
    const historicalRows = await extractHistoricalTrendRows({
      leagues: args?.leagues,
      days: args?.days,
      historical: true
    });
    const currentRows = await extractCurrentTrendRows({
      leagues: args?.leagues,
      limit: 250
    });
    const run = await createDiscoveryRun({
      leagues: args?.leagues,
      historicalRowCount: historicalRows.length,
      currentRowCount: currentRows.length
    });

    const systems = discoverTrendSystems(historicalRows, defaultDiscoveryConfig).slice(0, 60);
    const signals = uniqueByKey(
      activateTrendSystems(systems, currentRows),
      (signal) => `${signal.systemId}:${signal.eventId ?? "none"}:${signal.side}`
    );
    const signalCountBySystemId = new Map<string, number>();
    for (const signal of signals) {
      signalCountBySystemId.set(signal.systemId, (signalCountBySystemId.get(signal.systemId) ?? 0) + 1);
    }

    const persistedBySlug = new Map<string, string>();
    const persistedSystems = await mapWithConcurrency(systems, 8, async (system) => {
      const breakdowns = buildPersistedTrendBreakdowns(system, historicalRows);
      const persisted = await upsertSystem(run.id, system, breakdowns);
      await createSnapshot(persisted.id, system, signalCountBySystemId.get(system.id) ?? 0);
      return { slug: system.id, id: persisted.id };
    });

    for (const persisted of persistedSystems) {
      persistedBySlug.set(persisted.slug, persisted.id);
    }

    await (prisma as any).discoveredTrendActivation.updateMany({
      where: {
        systemId: {
          in: Array.from(persistedBySlug.values())
        }
      },
      data: {
        isActive: false
      }
    });

    for (const signal of signals) {
      const systemId = persistedBySlug.get(signal.systemId);
      if (!systemId) {
        continue;
      }
      await (prisma as any).discoveredTrendActivation.create({
        data: {
          systemId,
          eventId: signal.eventId,
          eventLabel: safeString(signal.eventLabel, "Upcoming game"),
          eventStartTime: signal.gameDate ? new Date(signal.gameDate) : null,
          currentLine: signal.currentLine,
          currentOdds: signal.currentOdds,
          fairOdds: signal.fairOdds,
          edgePct: signal.edgePct,
          timingState: signal.timingState,
          confidenceTier: signal.confidenceTier,
          reasonsJson: signal.reasons,
          isActive: signal.timingState !== "DEAD"
        }
      });
    }

    await completeDiscoveryRun(run.id, {
      discoveredSystemCount: systems.length,
      activationCount: signals.length,
      status: "SUCCESS",
      summary: {
        leagues: args?.leagues ?? null
      }
    });

    return {
      runId: run.id,
      discoveredSystemCount: systems.length,
      activationCount: signals.length,
      historicalRowCount: historicalRows.length,
      currentRowCount: currentRows.length,
      skipped: false
    };
  } catch (error) {
    if (!isMissingDiscoveredTrendTables(error)) {
      throw error;
    }

    return {
      runId: null,
      discoveredSystemCount: 0,
      activationCount: 0,
      historicalRowCount: 0,
      currentRowCount: 0,
      skipped: true,
      reason: "discovered trend tables are not migrated in this runtime yet"
    };
  }
}

export async function listDiscoveredTrendSystems(args?: {
  league?: string;
  limit?: number;
  tier?: string;
  activeOnly?: boolean;
}) {
  try {
    const records = await (prisma as any).discoveredTrendSystem.findMany({
      where: {
        ...(args?.league ? { league: args.league } : {}),
        ...(args?.tier ? { tier: args.tier } : {}),
        ...(args?.activeOnly ? { activations: { some: { isActive: true } } } : {})
      },
      orderBy: [
        { validationScore: "desc" },
        { updatedAt: "desc" }
      ],
      take: args?.limit ?? 24,
      include: {
        snapshots: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        },
        activations: {
          where: args?.activeOnly ? { isActive: true } : undefined,
          orderBy: {
            createdAt: "desc"
          },
          take: 5,
          include: {
            event: {
              include: {
                league: true
              }
            }
          }
        }
      }
    });
    return records.map(recordToView);
  } catch (error) {
    if (!isMissingDiscoveredTrendTables(error)) {
      throw error;
    }
    return [];
  }
}

export async function getDiscoveredTrendSystem(idOrSlug: string) {
  try {
    const record = await (prisma as any).discoveredTrendSystem.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }]
      },
      include: {
        snapshots: {
          orderBy: {
            createdAt: "desc"
          },
          take: 8
        },
        activations: {
          orderBy: {
            createdAt: "desc"
          },
          take: 20,
          include: {
            event: {
              include: {
                league: true
              }
            }
          }
        },
        discoveryRun: true
      }
    });

    return record ? recordToView(record) : null;
  } catch (error) {
    if (!isMissingDiscoveredTrendTables(error)) {
      throw error;
    }
    return null;
  }
}
