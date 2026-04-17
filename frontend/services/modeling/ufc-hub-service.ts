import { prisma } from '@/lib/db/prisma';
import { UFC_DIVISIONS, getUfcDivisionDefinition } from '@/services/modeling/ufc-division-catalog';
import { buildUfcEventContext } from '@/services/modeling/ufc-event-context-service';

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export async function getUfcLeagueHubData() {
  const [competitors, events] = await Promise.all([
    prisma.competitor.findMany({
      where: { league: { key: 'UFC' } },
      select: {
        id: true,
        name: true,
        metadataJson: true
      }
    }),
    prisma.event.findMany({
      where: {
        league: { key: 'UFC' },
        status: { in: ['SCHEDULED', 'LIVE'] }
      },
      include: {
        participants: {
          include: { competitor: true }
        }
      },
      orderBy: { startTime: 'asc' },
      take: 12
    })
  ]);

  const rankedFighters = competitors
    .map((competitor) => {
      const metadata = asRecord(competitor.metadataJson);
      return {
        id: competitor.id,
        name: competitor.name,
        divisionKey: typeof metadata?.ufcDivision === 'string' ? metadata.ufcDivision : null,
        divisionLabel: typeof metadata?.ufcDivisionLabel === 'string' ? metadata.ufcDivisionLabel : null,
        ranking: typeof metadata?.ufcRanking === 'number' ? metadata.ufcRanking : null,
        championStatus: typeof metadata?.ufcChampionStatus === 'string' ? metadata.ufcChampionStatus : null,
        dossierReady: Boolean(metadata?.ufcFighterDossier)
      };
    })
    .filter((fighter) => fighter.divisionKey)
    .sort((a, b) => {
      const championA = a.championStatus === 'champion' ? -1 : a.ranking ?? 999;
      const championB = b.championStatus === 'champion' ? -1 : b.ranking ?? 999;
      return championA - championB;
    });

  const divisions = UFC_DIVISIONS.map((division) => {
    const fighters = rankedFighters.filter((fighter) => fighter.divisionKey === division.key);
    const champion = fighters.find((fighter) => fighter.championStatus === 'champion') ?? null;
    const contenders = fighters.filter((fighter) => fighter.championStatus !== 'champion' && typeof fighter.ranking === 'number').slice(0, 10);
    return {
      key: division.key,
      label: division.label,
      champion,
      contenders
    };
  }).filter((division) => division.champion || division.contenders.length);

  const upcomingEvents = events.map((event) => {
    const storedContext = asRecord(asRecord(event.metadataJson)?.ufcEventContext);
    const context = storedContext ?? buildUfcEventContext({
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
    const division = getUfcDivisionDefinition(typeof context.divisionKey === 'string' ? context.divisionKey : null);
    return {
      id: event.id,
      name: event.name,
      startTime: event.startTime,
      status: event.status,
      context: {
        ...context,
        divisionLabel: typeof context.divisionLabel === 'string' && context.divisionLabel ? context.divisionLabel : division?.label ?? null
      }
    };
  });

  return {
    divisions,
    upcomingEvents
  };
}
