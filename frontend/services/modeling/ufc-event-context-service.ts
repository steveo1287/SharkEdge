import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { getUfcDivisionDefinition, normalizeUfcDivisionKey } from '@/services/modeling/ufc-division-catalog';

function asRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function mergeMetadata(base: Prisma.JsonValue | null, updates: Record<string, unknown>) {
  const record = asRecord(base) ?? {};
  return {
    ...record,
    ...updates
  } as Prisma.InputJsonValue;
}

export function buildUfcEventContext(input: {
  eventId: string;
  name: string;
  metadataJson: Prisma.JsonValue | null;
  participants: Array<{
    role: string;
    competitor: { id: string; name: string; metadataJson: Prisma.JsonValue | null };
  }>;
}) {
  const metadata = asRecord(input.metadataJson);
  const divisionKey = normalizeUfcDivisionKey(typeof metadata?.division === 'string' ? metadata.division : typeof metadata?.weightClass === 'string' ? metadata.weightClass : null);
  const division = getUfcDivisionDefinition(divisionKey);
  const fighters = input.participants.map((participant) => {
    const fighterMeta = asRecord(participant.competitor.metadataJson);
    return {
      competitorId: participant.competitor.id,
      role: participant.role,
      name: participant.competitor.name,
      divisionKey: typeof fighterMeta?.ufcDivision === 'string' ? fighterMeta.ufcDivision : divisionKey,
      ranking: typeof fighterMeta?.ufcRanking === 'number' ? fighterMeta.ufcRanking : null,
      championStatus: typeof fighterMeta?.ufcChampionStatus === 'string' ? fighterMeta.ufcChampionStatus : null,
      dossierReady: Boolean(fighterMeta?.ufcFighterDossier)
    };
  });

  const titleFight = fighters.filter((fighter) => fighter.championStatus === 'champion').length > 0;
  const rankedFight = fighters.filter((fighter) => typeof fighter.ranking === 'number').length >= 1;

  return {
    eventId: input.eventId,
    eventName: input.name,
    divisionKey: division?.key ?? divisionKey,
    divisionLabel: division?.label ?? null,
    titleFight,
    rankedFight,
    fighters
  };
}

export async function refreshUpcomingUfcEventContexts(args?: { eventIds?: string[]; limit?: number }) {
  const events = await prisma.event.findMany({
    where: {
      league: { key: 'UFC' },
      status: { in: ['SCHEDULED', 'LIVE'] },
      ...(args?.eventIds?.length ? { id: { in: args.eventIds } } : {})
    },
    include: {
      participants: {
        include: { competitor: true }
      }
    },
    orderBy: { startTime: 'asc' },
    take: args?.limit ?? 40
  });

  let updated = 0;
  for (const event of events) {
    const context = buildUfcEventContext({
      eventId: event.id,
      name: event.name,
      metadataJson: event.metadataJson,
      participants: event.participants.map((participant) => ({
        role: participant.role,
        competitor: {
          id: participant.competitor.id,
          name: participant.competitor.name,
          metadataJson: participant.competitor.metadataJson
        }
      }))
    });

    await prisma.event.update({
      where: { id: event.id },
      data: {
        metadataJson: mergeMetadata(event.metadataJson, {
          ufcEventContext: context,
          ufcEventContextGeneratedAt: new Date().toISOString()
        })
      }
    });
    updated += 1;
  }

  return {
    eventsProcessed: events.length,
    contextsUpdated: updated
  };
}
