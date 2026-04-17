import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { edgeRecomputeJob } from "@/services/jobs/edge-recompute-job";
import { refreshCombatParticipantProfiles } from "@/services/modeling/fighter-history-service";
import { buildEventIntelligenceSnapshot } from "@/services/intelligence/event-intelligence-snapshot-service";
import { buildEventModelInputBundle } from "@/services/intelligence/model-input-bundle-service";
import { refreshUpcomingEventWeatherSnapshots } from "@/services/weather/venue-weather-enrichment-service";

function asRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function mergeMetadata(base: Prisma.JsonValue | null, updates: Record<string, unknown>) {
  const record = asRecord(base) ?? {};
  return {
    ...record,
    ...updates
  } as Prisma.InputJsonValue;
}

export function isWeatherStale(event: {
  startTime: Date;
  league: { key: string };
  metadataJson: Prisma.JsonValue | null;
}) {
  if (!["MLB", "NFL", "NCAAF"].includes(event.league.key)) {
    return false;
  }
  const metadata = asRecord(event.metadataJson);
  const weather = asRecord((metadata?.weather ?? null) as Prisma.JsonValue | null);
  const observedAt = typeof weather?.observedAt === "string" ? Date.parse(weather.observedAt) : NaN;
  const hoursUntilStart = (event.startTime.getTime() - Date.now()) / 3600000;
  if (!Number.isFinite(observedAt)) {
    return hoursUntilStart <= 72;
  }
  const ageHours = (Date.now() - observedAt) / 3600000;
  return hoursUntilStart <= 12 ? ageHours > 2 : ageHours > 6;
}

export function areCombatProfilesStale(event: {
  league: { key: string };
  participantContexts: Array<{ metadataJson: Prisma.JsonValue | null }>;
}) {
  if (!["UFC", "BOXING"].includes(event.league.key)) {
    return false;
  }
  return event.participantContexts.some((context) => {
    const meta = asRecord(context.metadataJson);
    const generatedAt = typeof meta?.combatProfileGeneratedAt === "string" ? Date.parse(meta.combatProfileGeneratedAt) : NaN;
    if (!Number.isFinite(generatedAt)) {
      return true;
    }
    const ageHours = (Date.now() - generatedAt) / 3600000;
    return ageHours > 24;
  });
}

export function isProjectionStale(event: {
  metadataJson: Prisma.JsonValue | null;
  bundleHash: string;
}) {
  const metadata = asRecord(event.metadataJson);
  const intelligence = asRecord((metadata?.intelligenceSnapshot ?? null) as Prisma.JsonValue | null);
  return typeof intelligence?.bundleHash !== "string" || intelligence.bundleHash !== event.bundleHash;
}

export async function refreshEventIntelligence(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      league: true,
      participants: true,
      participantContexts: true,
      eventProjections: {
        include: { modelRun: true }
      }
    }
  });
  if (!event) {
    throw new Error("Event not found for intelligence refresh.");
  }

  const stale = {
    weather: isWeatherStale(event),
    combatProfiles: areCombatProfilesStale(event),
    projection: false
  };

  const actions = {
    weatherRefreshed: false,
    combatProfilesRefreshed: false,
    projectionRerun: false
  };

  if (stale.weather) {
    const result = await refreshUpcomingEventWeatherSnapshots({ eventIds: [eventId], leagues: [event.league.key], limit: 1 });
    actions.weatherRefreshed = result.updated > 0;
  }

  if (stale.combatProfiles) {
    const result = await refreshCombatParticipantProfiles({ eventIds: [eventId], limit: 1 });
    actions.combatProfilesRefreshed = result.participantProfilesUpdated > 0;
  }

  const refreshedEvent = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      league: true,
      participants: true,
      participantContexts: true,
      eventProjections: {
        include: { modelRun: true }
      }
    }
  });
  if (!refreshedEvent) {
    throw new Error("Event disappeared during intelligence refresh.");
  }

  const bundle = buildEventModelInputBundle(refreshedEvent as any);
  stale.projection = isProjectionStale({ metadataJson: refreshedEvent.metadataJson, bundleHash: bundle.bundleHash });

  if (stale.projection || actions.weatherRefreshed || actions.combatProfilesRefreshed) {
    await edgeRecomputeJob(eventId);
    actions.projectionRerun = true;
  }

  const latestProjection = await prisma.eventProjection.findFirst({
    where: { eventId },
    include: { modelRun: true },
    orderBy: { modelRunId: "desc" }
  });

  const intelligenceSnapshot = buildEventIntelligenceSnapshot({
    stale,
    actions,
    bundleHash: bundle.bundleHash,
    projectionSummary: {
      modelKey: latestProjection?.modelRun?.key ?? null,
      winProbHome: latestProjection?.winProbHome ?? null,
      projectedTotal: latestProjection?.projectedTotal ?? null
    }
  });

  await prisma.event.update({
    where: { id: eventId },
    data: {
      metadataJson: mergeMetadata(refreshedEvent.metadataJson, {
        modelInputBundle: bundle,
        intelligenceSnapshot
      })
    }
  });

  return {
    eventId,
    stale,
    actions,
    bundleHash: bundle.bundleHash
  };
}

export async function refreshUpcomingEventIntelligence(args?: { leagues?: string[]; limit?: number }) {
  const events = await prisma.event.findMany({
    where: {
      status: { in: ["SCHEDULED", "LIVE"] },
      ...(args?.leagues?.length ? { league: { key: { in: args.leagues } } } : {})
    },
    orderBy: { startTime: "asc" },
    take: args?.limit ?? 50,
    select: { id: true }
  });

  const results = [] as Array<Awaited<ReturnType<typeof refreshEventIntelligence>>>;
  for (const event of events) {
    results.push(await refreshEventIntelligence(event.id));
  }

  return {
    eventsProcessed: results.length,
    reruns: results.filter((entry) => entry.actions.projectionRerun).length,
    weatherRefreshes: results.filter((entry) => entry.actions.weatherRefreshed).length,
    combatRefreshes: results.filter((entry) => entry.actions.combatProfilesRefreshed).length
  };
}
