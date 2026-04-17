import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { getUfcDivisionDefinition, normalizeUfcDivisionKey } from '@/services/modeling/ufc-division-catalog';
import { resolveCombatCompetitorIdentity, type CombatCompetitorCandidate } from '@/services/modeling/ufc-identity-resolution';

export type RawUfcRankingEntry = {
  rank: number | string;
  fighterName: string;
  nickname?: string | null;
  record?: string | null;
  isChampion?: boolean;
};

export type RawUfcRankingSnapshot = {
  source: string;
  division: string;
  updatedAt?: string | null;
  championName?: string | null;
  entries: RawUfcRankingEntry[];
};

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.+-]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

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

export function normalizeUfcRankingSnapshot(snapshot: RawUfcRankingSnapshot) {
  const divisionKey = normalizeUfcDivisionKey(snapshot.division);
  const division = divisionKey ? getUfcDivisionDefinition(divisionKey) : null;
  if (!division || !divisionKey) {
    throw new Error(`Unsupported UFC division: ${snapshot.division}`);
  }

  return {
    source: snapshot.source,
    divisionKey,
    divisionLabel: division.label,
    updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
    championName: snapshot.championName ?? null,
    entries: snapshot.entries
      .map((entry) => ({
        rank: asNumber(entry.rank) ?? null,
        fighterName: entry.fighterName,
        nickname: entry.nickname ?? null,
        record: entry.record ?? null,
        isChampion: Boolean(entry.isChampion)
      }))
      .filter((entry) => entry.rank !== null || entry.isChampion)
  };
}

export async function importUfcRankingSnapshot(snapshot: RawUfcRankingSnapshot) {
  const normalized = normalizeUfcRankingSnapshot(snapshot);
  const competitors = await prisma.competitor.findMany({
    where: { league: { key: 'UFC' } },
    select: { id: true, name: true, shortName: true, key: true, metadataJson: true }
  });

  const candidates: CombatCompetitorCandidate[] = competitors.map((competitor) => ({
    id: competitor.id,
    name: competitor.name,
    shortName: competitor.shortName,
    key: competitor.key,
    metadataJson: asRecord(competitor.metadataJson)
  }));

  let updated = 0;
  const unresolved: string[] = [];

  for (const entry of normalized.entries) {
    const resolution = resolveCombatCompetitorIdentity({
      name: entry.fighterName,
      nickname: entry.nickname,
      record: entry.record
    }, candidates);
    if (!resolution.competitorId) {
      unresolved.push(entry.fighterName);
      continue;
    }

    const competitor = competitors.find((item) => item.id === resolution.competitorId)!;
    await prisma.competitor.update({
      where: { id: competitor.id },
      data: {
        metadataJson: mergeMetadata(competitor.metadataJson, {
          ufcDivision: normalized.divisionKey,
          ufcDivisionLabel: normalized.divisionLabel,
          ufcRanking: entry.rank,
          ufcChampionStatus: entry.isChampion || normalized.championName === entry.fighterName ? 'champion' : entry.rank === 1 ? 'contender_1' : entry.rank ? `rank_${entry.rank}` : null,
          ufcRankingSource: {
            source: normalized.source,
            updatedAt: normalized.updatedAt,
            divisionKey: normalized.divisionKey,
            resolutionScore: resolution.resolutionScore,
            matchedBy: resolution.matchedBy
          }
        })
      }
    });
    updated += 1;
  }

  return {
    divisionKey: normalized.divisionKey,
    entriesProcessed: normalized.entries.length,
    competitorsUpdated: updated,
    unresolved
  };
}
