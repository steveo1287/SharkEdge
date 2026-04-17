export type StoredCombatSourceProfile = {
  source: string;
  sourceUrl?: string | null;
  importedAt?: string | null;
  resolutionScore?: number | null;
  matchedBy?: string[];
  profile: Record<string, unknown>;
};

export type UfcSourceConsensus = {
  sourceCount: number;
  sourceConfidenceScore: number;
  consensusFields: Record<string, unknown>;
  supportingSources: string[];
};

const SOURCE_WEIGHTS: Record<string, number> = {
  manual: 1.2,
  tapology: 1.05,
  sherdog: 1.0,
  ufcstats: 1.0,
  bjjheroes: 0.98,
  wikipedia: 0.72,
  wiki: 0.72,
  unknown: 0.6
};

function normalizeSource(value: string | null | undefined) {
  return (value ?? "unknown").trim().toLowerCase();
}

function asComparable(value: unknown) {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((entry) => String(entry)).sort());
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return value === null || value === undefined ? null : String(value);
}

function pickConsensusValue(values: Array<{ value: unknown; weight: number }>) {
  const scoreMap = new Map<string, { raw: unknown; score: number }>();
  for (const entry of values) {
    const key = String(asComparable(entry.value));
    if (!key || key === "null") continue;
    const current = scoreMap.get(key) ?? { raw: entry.value, score: 0 };
    current.score += entry.weight;
    scoreMap.set(key, current);
  }
  return [...scoreMap.values()].sort((a, b) => b.score - a.score)[0]?.raw ?? null;
}

export function buildUfcSourceConsensus(sourceProfiles: StoredCombatSourceProfile[]): UfcSourceConsensus {
  if (!sourceProfiles.length) {
    return {
      sourceCount: 0,
      sourceConfidenceScore: 0,
      consensusFields: {},
      supportingSources: []
    };
  }

  const allKeys = new Set<string>();
  for (const profile of sourceProfiles) {
    for (const key of Object.keys(profile.profile ?? {})) {
      allKeys.add(key);
    }
  }

  const consensusFields: Record<string, unknown> = {};
  for (const key of allKeys) {
    const values = sourceProfiles
      .map((profile) => ({
        value: profile.profile?.[key],
        weight: (SOURCE_WEIGHTS[normalizeSource(profile.source)] ?? 0.65) + ((profile.resolutionScore ?? 50) / 200)
      }))
      .filter((entry) => entry.value !== undefined && entry.value !== null && entry.value !== "");
    const consensus = pickConsensusValue(values);
    if (consensus !== null) {
      consensusFields[key] = consensus;
    }
  }

  const uniqueSources = [...new Set(sourceProfiles.map((profile) => normalizeSource(profile.source)))];
  const avgWeight = uniqueSources.reduce((sum, source) => sum + (SOURCE_WEIGHTS[source] ?? 0.65), 0) / uniqueSources.length;
  const sourceConfidenceScore = Math.min(9.8, 4.8 + uniqueSources.length * 0.75 + avgWeight * 0.9);

  return {
    sourceCount: sourceProfiles.length,
    sourceConfidenceScore: Number(sourceConfidenceScore.toFixed(3)),
    consensusFields,
    supportingSources: uniqueSources
  };
}
