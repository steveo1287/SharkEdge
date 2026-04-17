import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

export type EventModelInputBundle = {
  generatedAt: string;
  eventId: string;
  league: string;
  sport: string;
  startTime: string;
  venue: string | null;
  weather: {
    available: boolean;
    source: string | null;
    observedAt: string | null;
  };
  participants: Array<{
    competitorId: string;
    role: string;
    recentWinRate: number | null;
    recentMargin: number | null;
    combatProfileReady: boolean;
  }>;
  bundleHash: string;
};

function asRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(",")}}`;
}

function digest(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 20);
}

export function buildEventModelInputBundle(event: {
  id: string;
  startTime: Date;
  venue: string | null;
  metadataJson: Prisma.JsonValue | null;
  league: { key: string; sport: string };
  participants: Array<{ competitorId: string; role: string }>;
  participantContexts: Array<{
    competitorId: string;
    recentWinRate: number | null;
    recentMargin: number | null;
    metadataJson: Prisma.JsonValue | null;
  }>;
}): EventModelInputBundle {
  const metadata = asRecord(event.metadataJson);
  const weather = asRecord((metadata?.weather ?? null) as Prisma.JsonValue | null);
  const participants = event.participants.map((participant) => {
    const context = event.participantContexts.find((row) => row.competitorId === participant.competitorId) ?? null;
    const contextMeta = asRecord(context?.metadataJson);
    return {
      competitorId: participant.competitorId,
      role: participant.role,
      recentWinRate: context?.recentWinRate ?? null,
      recentMargin: context?.recentMargin ?? null,
      combatProfileReady: Boolean(contextMeta?.combatProfile)
    };
  });

  const base = {
    eventId: event.id,
    league: event.league.key,
    sport: event.league.sport,
    startTime: event.startTime.toISOString(),
    venue: event.venue ?? null,
    weather: {
      available: Boolean(weather),
      source: typeof weather?.source === "string" ? weather.source : typeof metadata?.weatherSource === "string" ? metadata.weatherSource : null,
      observedAt: typeof weather?.observedAt === "string" ? weather.observedAt : null
    },
    participants
  };

  return {
    generatedAt: new Date().toISOString(),
    ...base,
    bundleHash: digest(base)
  };
}
