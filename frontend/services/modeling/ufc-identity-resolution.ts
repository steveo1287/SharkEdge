export type CombatSourceIdentity = {
  name: string;
  nickname?: string | null;
  aliases?: string[];
  record?: string | null;
  age?: number | null;
  reachInches?: number | null;
  heightInches?: number | null;
};

export type CombatCompetitorCandidate = {
  id: string;
  name: string;
  shortName?: string | null;
  key?: string | null;
  metadataJson?: Record<string, unknown> | null;
};

export type CombatIdentityResolution = {
  competitorId: string | null;
  resolutionScore: number;
  matchedBy: string[];
};

function normalizeName(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/\b(the|jr|sr|iii|iv)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenize(value: string | null | undefined) {
  return normalizeName(value).split(" ").filter(Boolean);
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseAliases(metadata: Record<string, unknown> | null | undefined) {
  const value = metadata?.aliases;
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return [] as string[];
}

function parseNickname(metadata: Record<string, unknown> | null | undefined) {
  const nickname = metadata?.nickname;
  return typeof nickname === "string" && nickname.trim() ? nickname.trim() : null;
}

function parseRecord(record: string | null | undefined) {
  const match = (record ?? "").match(/(\d+)-(\d+)(?:-(\d+))?/);
  if (!match) return null;
  const wins = Number(match[1] ?? 0);
  const losses = Number(match[2] ?? 0);
  const draws = Number(match[3] ?? 0);
  return { wins, losses, draws };
}

export function scoreCombatIdentityCandidate(source: CombatSourceIdentity, candidate: CombatCompetitorCandidate) {
  const matchedBy: string[] = [];
  const sourceName = normalizeName(source.name);
  const candidateName = normalizeName(candidate.name);
  const candidateShort = normalizeName(candidate.shortName);
  const sourceAliases = [...(source.aliases ?? []), source.nickname ?? ""].map(normalizeName).filter(Boolean);
  const candidateAliases = [...parseAliases(candidate.metadataJson), parseNickname(candidate.metadataJson) ?? ""]
    .map(normalizeName)
    .filter(Boolean);

  let score = 0;
  if (sourceName && candidateName && sourceName === candidateName) {
    score += 68;
    matchedBy.push("exact_name");
  } else if (sourceName && candidateShort && sourceName === candidateShort) {
    score += 54;
    matchedBy.push("short_name");
  } else {
    const sourceTokens = tokenize(source.name);
    const candidateTokens = tokenize(candidate.name);
    const overlap = sourceTokens.filter((token) => candidateTokens.includes(token)).length;
    if (overlap >= Math.min(2, sourceTokens.length)) {
      score += overlap * 16;
      matchedBy.push("token_overlap");
    }
  }

  const aliasHit = sourceAliases.some((alias) => alias && (alias === candidateName || alias === candidateShort || candidateAliases.includes(alias)));
  if (aliasHit) {
    score += 14;
    matchedBy.push("alias");
  }

  const sourceRecord = parseRecord(source.record);
  const candidateRecord = parseRecord(typeof candidate.metadataJson?.record === "string" ? candidate.metadataJson.record : null);
  if (sourceRecord && candidateRecord && sourceRecord.wins === candidateRecord.wins && sourceRecord.losses === candidateRecord.losses) {
    score += 8;
    matchedBy.push("record");
  }

  const candidateAge = asNumber(candidate.metadataJson?.age);
  if (source.age !== null && source.age !== undefined && candidateAge !== null && Math.abs(source.age - candidateAge) <= 1) {
    score += 4;
    matchedBy.push("age");
  }

  const candidateReach = asNumber(candidate.metadataJson?.reachInches ?? candidate.metadataJson?.reach);
  if (source.reachInches !== null && source.reachInches !== undefined && candidateReach !== null && Math.abs(source.reachInches - candidateReach) <= 1.5) {
    score += 3;
    matchedBy.push("reach");
  }

  const candidateHeight = asNumber(candidate.metadataJson?.heightInches ?? candidate.metadataJson?.height);
  if (source.heightInches !== null && source.heightInches !== undefined && candidateHeight !== null && Math.abs(source.heightInches - candidateHeight) <= 1.5) {
    score += 3;
    matchedBy.push("height");
  }

  return {
    competitorId: candidate.id,
    resolutionScore: score,
    matchedBy
  } satisfies CombatIdentityResolution;
}

export function resolveCombatCompetitorIdentity(source: CombatSourceIdentity, candidates: CombatCompetitorCandidate[]) {
  const ranked = candidates
    .map((candidate) => scoreCombatIdentityCandidate(source, candidate))
    .sort((a, b) => b.resolutionScore - a.resolutionScore);
  const best = ranked[0] ?? { competitorId: null, resolutionScore: 0, matchedBy: [] };
  return best.resolutionScore >= 40 ? best : { competitorId: null, resolutionScore: best.resolutionScore, matchedBy: best.matchedBy };
}
