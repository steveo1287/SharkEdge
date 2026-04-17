import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { buildUfcSourceProfile } from "@/services/modeling/ufc-source-profile";
import { buildUfcSourceConsensus, type StoredCombatSourceProfile } from "@/services/modeling/ufc-source-consensus";
import { resolveCombatCompetitorIdentity, type CombatCompetitorCandidate } from "@/services/modeling/ufc-identity-resolution";

export type RawCombatSourceProfile = {
  source: string;
  name: string;
  nickname?: string | null;
  aliases?: string[] | string | null;
  record?: string | null;
  amateurRecord?: string | null;
  camp?: string | null;
  trainingPartners?: string[] | string | null;
  wrestlingLevel?: string | null;
  bjjBelt?: string | null;
  kickboxingRecord?: string | null;
  boxingRecord?: string | null;
  stance?: string | null;
  age?: number | string | null;
  reachInches?: number | string | null;
  heightInches?: number | string | null;
  sourceUrl?: string | null;
};

export type NormalizedCombatSourceProfile = {
  source: string;
  sourceUrl: string | null;
  name: string;
  nickname: string | null;
  aliases: string[];
  record: string | null;
  metadata: Record<string, unknown>;
};

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return [] as string[];
}

function mergeMetadata(base: Prisma.JsonValue | null, updates: Record<string, unknown>) {
  const record = base && typeof base === "object" && !Array.isArray(base) ? (base as Record<string, unknown>) : {};
  return {
    ...record,
    ...updates
  } as Prisma.InputJsonValue;
}


function readStoredSourceProfiles(metadata: Record<string, unknown> | null | undefined) {
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

function mergeAliases(existing: Record<string, unknown> | null | undefined, incoming: string[]) {
  const current = Array.isArray(existing?.aliases)
    ? (existing?.aliases as unknown[]).map((entry) => String(entry).trim()).filter(Boolean)
    : typeof existing?.aliases === "string"
      ? String(existing.aliases).split(",").map((entry) => entry.trim()).filter(Boolean)
      : [];
  return [...new Set([...current, ...incoming])];
}

export function normalizeCombatSourceProfile(raw: RawCombatSourceProfile): NormalizedCombatSourceProfile {
  const metadata = {
    record: raw.record ?? null,
    amateurRecord: raw.amateurRecord ?? null,
    camp: raw.camp ?? null,
    trainingPartners: asStringArray(raw.trainingPartners),
    wrestlingLevel: raw.wrestlingLevel ?? null,
    bjjBelt: raw.bjjBelt ?? null,
    kickboxingRecord: raw.kickboxingRecord ?? null,
    boxingRecord: raw.boxingRecord ?? null,
    stance: raw.stance ?? null,
    age: asNumber(raw.age),
    reachInches: asNumber(raw.reachInches),
    heightInches: asNumber(raw.heightInches),
    nickname: raw.nickname ?? null
  } satisfies Record<string, unknown>;
  const sourceProfile = buildUfcSourceProfile(metadata);

  return {
    source: raw.source,
    sourceUrl: raw.sourceUrl ?? null,
    name: raw.name,
    nickname: raw.nickname ?? null,
    aliases: asStringArray(raw.aliases),
    record: raw.record ?? null,
    metadata: {
      ...metadata,
      ...sourceProfile
    }
  };
}

export async function importCombatSourceProfiles(rawProfiles: RawCombatSourceProfile[]) {
  const combatCompetitors = await prisma.competitor.findMany({
    where: {
      league: { key: { in: ["UFC", "BOXING"] } }
    },
    select: {
      id: true,
      name: true,
      shortName: true,
      key: true,
      metadataJson: true
    }
  });

  const candidates: CombatCompetitorCandidate[] = combatCompetitors.map((competitor) => ({
    id: competitor.id,
    name: competitor.name,
    shortName: competitor.shortName,
    key: competitor.key,
    metadataJson: competitor.metadataJson && typeof competitor.metadataJson === "object" && !Array.isArray(competitor.metadataJson)
      ? (competitor.metadataJson as Record<string, unknown>)
      : null
  }));

  let imported = 0;
  const unresolved: Array<{ name: string; source: string; resolutionScore: number }> = [];

  for (const rawProfile of rawProfiles) {
    const normalized = normalizeCombatSourceProfile(rawProfile);
    const resolution = resolveCombatCompetitorIdentity({
      name: normalized.name,
      nickname: normalized.nickname,
      aliases: normalized.aliases,
      record: normalized.record,
      age: typeof normalized.metadata.age === "number" ? normalized.metadata.age : null,
      reachInches: typeof normalized.metadata.reachInches === "number" ? normalized.metadata.reachInches : null,
      heightInches: typeof normalized.metadata.heightInches === "number" ? normalized.metadata.heightInches : null
    }, candidates);

    if (!resolution.competitorId) {
      unresolved.push({ name: normalized.name, source: normalized.source, resolutionScore: resolution.resolutionScore });
      continue;
    }

    const competitor = combatCompetitors.find((entry) => entry.id === resolution.competitorId)!;
    const competitorMeta = competitor.metadataJson && typeof competitor.metadataJson === "object" && !Array.isArray(competitor.metadataJson)
      ? (competitor.metadataJson as Record<string, unknown>)
      : null;

    const storedProfile = {
      source: normalized.source,
      sourceUrl: normalized.sourceUrl,
      importedAt: new Date().toISOString(),
      resolutionScore: resolution.resolutionScore,
      matchedBy: resolution.matchedBy,
      profile: normalized.metadata
    } satisfies StoredCombatSourceProfile;
    const historicalProfiles = readStoredSourceProfiles(competitorMeta)
      .filter((entry) => !(entry.source === storedProfile.source && JSON.stringify(entry.profile) === JSON.stringify(storedProfile.profile)))
      .slice(-9);
    const combatSourceProfiles = [...historicalProfiles, storedProfile];
    const sourceConsensus = buildUfcSourceConsensus(combatSourceProfiles);

    const metadataPatch = {
      ...sourceConsensus.consensusFields,
      aliases: mergeAliases(competitorMeta, normalized.aliases),
      combatSourceProfile: storedProfile,
      combatSourceProfiles,
      combatSourceConsensus: sourceConsensus,
      nickname: normalized.nickname ?? competitorMeta?.nickname ?? null
    };

    await prisma.competitor.update({
      where: { id: competitor.id },
      data: {
        metadataJson: mergeMetadata(competitor.metadataJson, metadataPatch)
      }
    });

    imported += 1;
  }

  return {
    processed: rawProfiles.length,
    imported,
    unresolved
  };
}
