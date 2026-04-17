import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { fetchCombatHistoryRowsForCompetitor } from "@/services/modeling/fighter-history-service";
import { buildUfcOpponentGraphSnapshot } from "@/services/modeling/ufc-opponent-graph";
import { buildUfcSourceConsensus, type StoredCombatSourceProfile } from "@/services/modeling/ufc-source-consensus";

function asRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readSourceProfiles(metadata: Record<string, unknown> | null | undefined) {
  const list = metadata?.combatSourceProfiles;
  if (Array.isArray(list)) {
    return list.filter((entry): entry is StoredCombatSourceProfile => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry) && typeof (entry as { source?: unknown }).source === "string" && typeof (entry as { profile?: unknown }).profile === "object");
  }
  const single = metadata?.combatSourceProfile;
  if (single && typeof single === "object" && !Array.isArray(single) && typeof (single as { source?: unknown }).source === "string" && typeof (single as { profile?: unknown }).profile === "object") {
    return [single as StoredCombatSourceProfile];
  }
  return [] as StoredCombatSourceProfile[];
}

function parseRecordWinPct(record: string | null | undefined) {
  const match = (record ?? "").match(/(\d+)-(\d+)(?:-(\d+))?/);
  if (!match) return 0.5;
  const wins = Number(match[1] ?? 0);
  const losses = Number(match[2] ?? 0);
  const draws = Number(match[3] ?? 0);
  const total = wins + losses + draws;
  return total ? (wins + draws * 0.5) / total : 0.5;
}

function summarizeRows(rows: Awaited<ReturnType<typeof fetchCombatHistoryRowsForCompetitor>>) {
  const wins = rows
    .filter((row) => row.winnerCompetitorId === row.competitorId)
    .map((row) => ({ opponentCompetitorId: row.opponentCompetitorId, opponentRecord: row.opponentRecord, method: row.method, period: row.period, opponentWinPct: parseRecordWinPct(row.opponentRecord) }))
    .sort((a, b) => b.opponentWinPct - a.opponentWinPct);
  const losses = rows
    .filter((row) => row.loserCompetitorId === row.competitorId)
    .map((row) => ({ opponentCompetitorId: row.opponentCompetitorId, opponentRecord: row.opponentRecord, method: row.method, period: row.period, opponentWinPct: parseRecordWinPct(row.opponentRecord) }))
    .sort((a, b) => a.opponentWinPct - b.opponentWinPct);
  return {
    bestWins: wins.slice(0, 5),
    badLosses: losses.slice(0, 3)
  };
}

export async function buildUfcFighterDossier(competitorId: string) {
  const competitor = await prisma.competitor.findUnique({
    where: { id: competitorId },
    include: {
      league: true,
      participantContexts: {
        orderBy: { updatedAt: 'desc' },
        take: 5
      }
    }
  });
  if (!competitor) {
    throw new Error('Competitor not found for UFC dossier build.');
  }

  const metadata = asRecord(competitor.metadataJson);
  const sourceProfiles = readSourceProfiles(metadata);
  const sourceConsensus = buildUfcSourceConsensus(sourceProfiles);
  const rows = await fetchCombatHistoryRowsForCompetitor(competitorId, null);
  const opponentGraph = buildUfcOpponentGraphSnapshot(rows);
  const summaries = summarizeRows(rows);

  const latestContextMeta = asRecord(competitor.participantContexts[0]?.metadataJson);
  const ufcIntelligenceProfile = asRecord((latestContextMeta?.ufcIntelligenceProfile ?? metadata?.ufcIntelligenceProfile ?? null) as Prisma.JsonValue | null);
  const ufcSourceProfile = asRecord((latestContextMeta?.ufcSourceProfile ?? metadata?.ufcSourceProfile ?? null) as Prisma.JsonValue | null);

  return {
    competitorId: competitor.id,
    competitorName: competitor.name,
    leagueKey: competitor.league?.key ?? null,
    generatedAt: new Date().toISOString(),
    identity: {
      nickname: typeof metadata?.nickname === 'string' ? metadata.nickname : null,
      aliases: Array.isArray(metadata?.aliases) ? metadata.aliases : [],
      camp: typeof metadata?.camp === 'string' ? metadata.camp : null,
      stance: typeof metadata?.stance === 'string' ? metadata.stance : null,
      age: typeof metadata?.age === 'number' ? metadata.age : null,
      reachInches: typeof metadata?.reachInches === 'number' ? metadata.reachInches : null,
      heightInches: typeof metadata?.heightInches === 'number' ? metadata.heightInches : null
    },
    sourceSummary: {
      sourceCount: sourceConsensus.sourceCount,
      sourceConfidenceScore: sourceConsensus.sourceConfidenceScore,
      supportingSources: sourceConsensus.supportingSources,
      normalizedProfile: ufcSourceProfile ?? sourceConsensus.consensusFields
    },
    intelligence: {
      opponentGraph,
      profile: ufcIntelligenceProfile ?? null
    },
    scouting: {
      bestWins: summaries.bestWins,
      badLosses: summaries.badLosses,
      scoutingFlags: Array.isArray(ufcIntelligenceProfile?.scoutingFlags) ? ufcIntelligenceProfile.scoutingFlags : []
    }
  };
}

export async function refreshUfcFighterDossiers(args?: { competitorIds?: string[]; limit?: number }) {
  const competitors = await prisma.competitor.findMany({
    where: {
      league: { key: 'UFC' },
      ...(args?.competitorIds?.length ? { id: { in: args.competitorIds } } : {})
    },
    select: { id: true },
    take: args?.limit ?? 40,
    orderBy: { updatedAt: 'desc' }
  });

  let updated = 0;
  for (const competitor of competitors) {
    const dossier = await buildUfcFighterDossier(competitor.id);
    const existing = await prisma.competitor.findUnique({ where: { id: competitor.id }, select: { metadataJson: true } });
    const record = asRecord(existing?.metadataJson);
    await prisma.competitor.update({
      where: { id: competitor.id },
      data: {
        metadataJson: {
          ...(record ?? {}),
          ufcFighterDossier: dossier,
          ufcFighterDossierGeneratedAt: new Date().toISOString()
        } as Prisma.InputJsonValue
      }
    });
    updated += 1;
  }

  return {
    competitorsProcessed: competitors.length,
    dossiersUpdated: updated
  };
}
