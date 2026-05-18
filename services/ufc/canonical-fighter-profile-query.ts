import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

type FighterProfileRow = {
  fighter_id: string;
  full_name: string;
  nickname: string | null;
  payload_json: unknown;
  updated_at: Date | string | null;
};

export type CanonicalFighterProfileSummary = {
  fighterId: string;
  fullName: string;
  nickname: string | null;
  updatedAt: string | null;
  status: string;
  whatIfReady: boolean;
  archetype: string;
  score: number;
  grade: string;
  sampleReliability: number | null;
  weightClass: string | null;
  stance: string | null;
  missingCore: string[];
  genericDefaultFields: string[];
  evidenceFlags: string[];
  supportedWeightClasses: string[];
  blockingReasons: string[];
  ratings: {
    striking: number | null;
    wrestling: number | null;
    grappling: number | null;
    durability: number | null;
    cardio: number | null;
    fightIq: number | null;
  };
};

export type CanonicalFighterProfileDetail = CanonicalFighterProfileSummary & {
  canonicalProfile: Record<string, unknown> | null;
  careerStats: Record<string, unknown> | null;
  eras: unknown[];
  sources: Record<string, unknown> | null;
  completeness: Record<string, unknown> | null;
};

export type CanonicalFighterProfileReport = {
  ok: boolean;
  checkedAt: string;
  total: number;
  statusCounts: Record<string, number>;
  archetypeCounts: Record<string, number>;
  whatIfReadyCount: number;
  needsRepairCount: number;
  items: CanonicalFighterProfileSummary[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  return asArray(value).map(String).filter(Boolean);
}

function asNumber(value: unknown, fallback: number | null = null) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string | null = null) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function avg(values: unknown[]) {
  const nums = values.map((value) => asNumber(value)).filter((value): value is number => value != null);
  if (!nums.length) return null;
  return Math.round(nums.reduce((sum, value) => sum + value, 0) / nums.length);
}

function ratingsFromProfile(profile: Record<string, unknown>) {
  const ratings = asRecord(profile.ratings);
  const striking = asRecord(ratings.striking);
  const wrestling = asRecord(ratings.wrestling);
  const grappling = asRecord(ratings.grappling);
  const durability = asRecord(ratings.durability);
  const cardio = asRecord(ratings.cardio);
  const intangibles = asRecord(ratings.intangibles);
  return {
    striking: avg([striking.offense, striking.defense, striking.power]),
    wrestling: avg([wrestling.takedownOffense, wrestling.takedownDefense, wrestling.control]),
    grappling: avg([grappling.submissionThreat, grappling.grapplingDefense, grappling.topGame]),
    durability: avg([durability.koResistance, durability.submissionResistance, durability.heart]),
    cardio: avg([cardio.stamina, cardio.latePace, cardio.paceSustain]),
    fightIq: avg([intangibles.fightIq, intangibles.gamePlan])
  };
}

function mapSummary(row: FighterProfileRow): CanonicalFighterProfileSummary {
  const payload = asRecord(row.payload_json);
  const profile = asRecord(payload.canonicalProfile);
  const completeness = asRecord(profile.completeness);
  const fantasySim = asRecord(profile.fantasySim);
  const ratings = asRecord(profile.ratings);
  return {
    fighterId: row.fighter_id,
    fullName: row.full_name,
    nickname: row.nickname,
    updatedAt: toIso(row.updated_at),
    status: asString(profile.status, "NO_CANONICAL_PROFILE") ?? "NO_CANONICAL_PROFILE",
    whatIfReady: Boolean(profile.whatIfReady),
    archetype: asString(profile.archetype, "unknown") ?? "unknown",
    score: asNumber(completeness.score, 0) ?? 0,
    grade: asString(completeness.grade, "D") ?? "D",
    sampleReliability: asNumber(ratings.sampleReliability),
    weightClass: asString(ratings.weightClass),
    stance: asString(ratings.stance),
    missingCore: asStringArray(completeness.missingCore),
    genericDefaultFields: asStringArray(completeness.genericDefaultFields),
    evidenceFlags: asStringArray(completeness.evidenceFlags),
    supportedWeightClasses: asStringArray(fantasySim.supportedWeightClasses),
    blockingReasons: asStringArray(fantasySim.blockingReasons),
    ratings: ratingsFromProfile(profile)
  };
}

function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function normalizeQuery(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export async function getCanonicalUfcFighterProfiles(options: { limit?: number; status?: string | null; q?: string | null } = {}): Promise<CanonicalFighterProfileReport> {
  const limit = Math.max(1, Math.min(1000, Math.round(options.limit ?? 250)));
  const status = options.status && options.status !== "all" ? options.status : null;
  const q = normalizeQuery(options.q);
  if (!hasUsableServerDatabaseUrl()) return { ok: false, checkedAt: new Date().toISOString(), total: 0, statusCounts: {}, archetypeCounts: {}, whatIfReadyCount: 0, needsRepairCount: 0, items: [] };
  const rows = await prisma.$queryRaw<FighterProfileRow[]>`
    SELECT id AS fighter_id, full_name, nickname, payload_json, updated_at
    FROM ufc_fighters
    WHERE payload_json ? 'canonicalProfile'
      AND (${status}::text IS NULL OR payload_json->'canonicalProfile'->>'status' = ${status})
      AND (${q}::text = '' OR lower(full_name) LIKE '%' || ${q}::text || '%' OR lower(COALESCE(nickname, '')) LIKE '%' || ${q}::text || '%')
    ORDER BY
      CASE payload_json->'canonicalProfile'->>'status'
        WHEN 'WHAT_IF_READY' THEN 0
        WHEN 'RESEARCH_ONLY' THEN 1
        WHEN 'NEEDS_REPAIR' THEN 2
        ELSE 3
      END,
      COALESCE((payload_json->'canonicalProfile'->'completeness'->>'score')::int, 0) DESC,
      full_name ASC
    LIMIT ${limit}
  `;
  const items = rows.map(mapSummary);
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    total: items.length,
    statusCounts: countBy(items.map((item) => item.status)),
    archetypeCounts: countBy(items.map((item) => item.archetype)),
    whatIfReadyCount: items.filter((item) => item.whatIfReady).length,
    needsRepairCount: items.filter((item) => item.status === "NEEDS_REPAIR" || item.status === "NO_CANONICAL_PROFILE").length,
    items
  };
}

export async function getCanonicalUfcFighterProfile(fighterId: string): Promise<CanonicalFighterProfileDetail | null> {
  if (!hasUsableServerDatabaseUrl()) return null;
  const rows = await prisma.$queryRaw<FighterProfileRow[]>`
    SELECT id AS fighter_id, full_name, nickname, payload_json, updated_at
    FROM ufc_fighters
    WHERE id = ${fighterId} OR lower(full_name) = lower(${fighterId}) OR lower(regexp_replace(full_name, '[^a-zA-Z0-9]+', '-', 'g')) = lower(${fighterId})
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const payload = asRecord(row.payload_json);
  const canonicalProfile = Object.keys(asRecord(payload.canonicalProfile)).length ? asRecord(payload.canonicalProfile) : null;
  const summary = mapSummary(row);
  return {
    ...summary,
    canonicalProfile,
    careerStats: canonicalProfile ? asRecord(canonicalProfile.careerStats) : null,
    eras: canonicalProfile ? asArray(canonicalProfile.eras) : [],
    sources: canonicalProfile ? asRecord(canonicalProfile.sources) : null,
    completeness: canonicalProfile ? asRecord(canonicalProfile.completeness) : null
  };
}
