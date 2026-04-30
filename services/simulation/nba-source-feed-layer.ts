export type NbaSourceKind = "team" | "player" | "history" | "rating";
export type NbaSourceTier = "core" | "advanced" | "premium" | "historical" | "fallback";

export type NbaSourceDescriptor = {
  id: string;
  label: string;
  kind: NbaSourceKind;
  tier: NbaSourceTier;
  envKeys: string[];
  priority: number;
  weight: number;
  license: "public-or-self-hosted" | "requires-license" | "subscription";
  role: string;
};

export type NbaSourceRow = Record<string, unknown> & {
  __source?: string;
  __sourceLabel?: string;
  __sourceTier?: NbaSourceTier;
  __sourcePriority?: number;
  __sourceWeight?: number;
  __license?: NbaSourceDescriptor["license"];
};

export type NbaSourceFeed = {
  kind: NbaSourceKind;
  generatedAt: string;
  rows: NbaSourceRow[];
  sources: Array<NbaSourceDescriptor & { configured: boolean; urlConfigured: boolean; rowCount: number }>;
  warnings: string[];
};

type SourceResponse = {
  teams?: NbaSourceRow[];
  players?: NbaSourceRow[];
  ratings?: NbaSourceRow[];
  history?: NbaSourceRow[];
  data?: NbaSourceRow[];
  rows?: NbaSourceRow[];
};

const SOURCE_DESCRIPTORS: NbaSourceDescriptor[] = [
  {
    id: "nba-stats-team-advanced",
    label: "NBA Stats team advanced/tracking",
    kind: "team",
    tier: "core",
    envKeys: ["NBA_STATS_TEAM_ADVANCED_URL", "NBA_OFFICIAL_TEAM_ADVANCED_URL", "NBA_TEAM_ANALYTICS_URL"],
    priority: 10,
    weight: 1,
    license: "public-or-self-hosted",
    role: "Official pace, rating, clutch, hustle, tracking, and team advanced box-score base."
  },
  {
    id: "cleaning-the-glass-team",
    label: "Cleaning the Glass team context",
    kind: "team",
    tier: "premium",
    envKeys: ["NBA_CTG_TEAM_URL", "CLEANING_THE_GLASS_TEAM_URL"],
    priority: 20,
    weight: 1.08,
    license: "subscription",
    role: "Garbage-time-filtered team strength, four factors, transition, half-court, and possession quality."
  },
  {
    id: "pbpstats-team-lineup",
    label: "PBP Stats team/on-off/lineup",
    kind: "team",
    tier: "advanced",
    envKeys: ["NBA_PBPSTATS_TEAM_URL", "NBA_PBPSTATS_LINEUPS_URL"],
    priority: 30,
    weight: 1.05,
    license: "public-or-self-hosted",
    role: "Possession-based on/off, lineup, shot-zone, and lineup-context information."
  },
  {
    id: "bigdataball-team",
    label: "BigDataBall team validated data",
    kind: "team",
    tier: "historical",
    envKeys: ["NBA_BIGDATABALL_TEAM_URL", "BIGDATABALL_NBA_TEAM_URL"],
    priority: 40,
    weight: 1.02,
    license: "requires-license",
    role: "Clean paid team box-score, odds, historical, and schedule context."
  },
  {
    id: "kaggle-team-history",
    label: "Kaggle team historical baseline",
    kind: "team",
    tier: "fallback",
    envKeys: ["NBA_KAGGLE_TEAM_URL", "KAGGLE_NBA_TEAM_URL"],
    priority: 90,
    weight: 0.82,
    license: "public-or-self-hosted",
    role: "Offline baseline when higher-quality current feeds are unavailable."
  },
  {
    id: "dunks-threes-epm",
    label: "Dunks & Threes EPM",
    kind: "player",
    tier: "premium",
    envKeys: ["NBA_DUNKS_THREES_EPM_URL", "DUNKS_THREES_EPM_URL", "NBA_EPM_PLAYER_URL"],
    priority: 10,
    weight: 1.12,
    license: "subscription",
    role: "Predictive player impact, offensive EPM, defensive EPM, estimated wins, role, and skill components."
  },
  {
    id: "nba-stats-player-advanced",
    label: "NBA Stats player advanced/tracking",
    kind: "player",
    tier: "core",
    envKeys: ["NBA_STATS_PLAYER_ADVANCED_URL", "NBA_OFFICIAL_PLAYER_ADVANCED_URL", "NBA_PLAYER_ANALYTICS_URL"],
    priority: 20,
    weight: 1,
    license: "public-or-self-hosted",
    role: "Official usage, minutes, tracking, speed, hustle, clutch, and player-level advanced stats."
  },
  {
    id: "basketball-reference-player",
    label: "Basketball-Reference player advanced",
    kind: "player",
    tier: "historical",
    envKeys: ["NBA_BREF_PLAYER_ADVANCED_URL", "BASKETBALL_REFERENCE_PLAYER_URL"],
    priority: 30,
    weight: 0.94,
    license: "public-or-self-hosted",
    role: "BPM, VORP, Win Shares, age, historical game logs, and longer-horizon priors."
  },
  {
    id: "bigdataball-player",
    label: "BigDataBall player validated data",
    kind: "player",
    tier: "historical",
    envKeys: ["NBA_BIGDATABALL_PLAYER_URL", "BIGDATABALL_NBA_PLAYER_URL"],
    priority: 40,
    weight: 1.02,
    license: "requires-license",
    role: "Clean historical player box scores and betting-relevant validated player rows."
  },
  {
    id: "basketball-reference-history",
    label: "Basketball-Reference historical team/player",
    kind: "history",
    tier: "historical",
    envKeys: ["NBA_BREF_HISTORY_URL", "BASKETBALL_REFERENCE_HISTORY_URL", "NBA_RECENT_FORM_URL"],
    priority: 10,
    weight: 0.95,
    license: "public-or-self-hosted",
    role: "Long-horizon historical priors, game logs, player/team advanced stats, BPM and Win Shares context."
  },
  {
    id: "stathead-query-export",
    label: "Stathead query export",
    kind: "history",
    tier: "premium",
    envKeys: ["NBA_STATHEAD_HISTORY_URL", "STATHEAD_NBA_EXPORT_URL"],
    priority: 20,
    weight: 1.04,
    license: "subscription",
    role: "Specific historical splits, era-adjusted queries, head-to-head and matchup-query exports."
  },
  {
    id: "pbpstats-history",
    label: "PBP Stats possession history",
    kind: "history",
    tier: "advanced",
    envKeys: ["NBA_PBPSTATS_HISTORY_URL", "NBA_MATCHUP_HISTORY_URL"],
    priority: 30,
    weight: 1.05,
    license: "public-or-self-hosted",
    role: "Possession-level, on/off, lineup, shot-zone, and recent lineup-combination history."
  },
  {
    id: "bigdataball-history",
    label: "BigDataBall historical games/odds",
    kind: "history",
    tier: "historical",
    envKeys: ["NBA_BIGDATABALL_HISTORY_URL", "BIGDATABALL_NBA_HISTORY_URL"],
    priority: 40,
    weight: 1.02,
    license: "requires-license",
    role: "Validated historical game, odds, play-by-play, and score result rows."
  },
  {
    id: "ratings-blend",
    label: "Ratings blend feed",
    kind: "rating",
    tier: "fallback",
    envKeys: ["NBA_GAME_RATINGS_URL", "GAME_RATINGS_URL", "VIDEO_GAME_RATINGS_URL"],
    priority: 80,
    weight: 0.82,
    license: "public-or-self-hosted",
    role: "Fallback roster-strength and video-game-style rating blend. Use only as a soft prior."
  }
];

function firstEnv(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return { key, value };
  }
  return null;
}

function rowsFromBody(body: unknown, kind: NbaSourceKind): NbaSourceRow[] {
  if (Array.isArray(body)) return body as NbaSourceRow[];
  const value = body as SourceResponse;
  if (kind === "team" && Array.isArray(value.teams)) return value.teams;
  if (kind === "player" && Array.isArray(value.players)) return value.players;
  if (kind === "rating" && Array.isArray(value.ratings)) return value.ratings;
  if (kind === "history" && Array.isArray(value.history)) return value.history;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.rows)) return value.rows;
  return [];
}

async function fetchSourceRows(source: NbaSourceDescriptor, kind: NbaSourceKind): Promise<NbaSourceRow[]> {
  const configured = firstEnv(source.envKeys);
  if (!configured) return [];
  try {
    const response = await fetch(configured.value, { cache: "no-store" });
    if (!response.ok) return [];
    const rows = rowsFromBody(await response.json(), kind);
    return rows.map((row) => ({
      ...row,
      __source: source.id,
      __sourceLabel: source.label,
      __sourceTier: source.tier,
      __sourcePriority: source.priority,
      __sourceWeight: source.weight,
      __license: source.license
    }));
  } catch {
    return [];
  }
}

export function listNbaSourceDescriptors(kind?: NbaSourceKind) {
  return SOURCE_DESCRIPTORS.filter((source) => !kind || source.kind === kind)
    .sort((left, right) => left.priority - right.priority);
}

export function buildNbaSourcePlan(kind?: NbaSourceKind) {
  return listNbaSourceDescriptors(kind).map((source) => {
    const configured = firstEnv(source.envKeys);
    return {
      ...source,
      configured: Boolean(configured),
      configuredEnvKey: configured?.key ?? null,
      urlConfigured: Boolean(configured?.value)
    };
  });
}

export async function getNbaSourceFeed(kind: NbaSourceKind): Promise<NbaSourceFeed> {
  const sources = listNbaSourceDescriptors(kind);
  const warnings: string[] = [];
  const collected = await Promise.all(sources.map(async (source) => {
    const configured = firstEnv(source.envKeys);
    const rows = await fetchSourceRows(source, kind);
    if (source.license !== "public-or-self-hosted" && configured) {
      warnings.push(`${source.label} is marked ${source.license}; only use licensed/exported data.`);
    }
    return { source, configured: Boolean(configured), urlConfigured: Boolean(configured?.value), rows };
  }));
  const rows = collected
    .flatMap((item) => item.rows)
    .sort((left, right) => Number(left.__sourcePriority ?? 999) - Number(right.__sourcePriority ?? 999));

  if (!rows.length) {
    warnings.push(`No configured NBA ${kind} source returned rows. The model will fall back to synthetic/source-light priors.`);
  }

  return {
    kind,
    generatedAt: new Date().toISOString(),
    rows,
    sources: collected.map((item) => ({ ...item.source, configured: item.configured, urlConfigured: item.urlConfigured, rowCount: item.rows.length })),
    warnings
  };
}

export function nbaSourceEnvInstructions(baseUrl: string, tokenPlaceholder = "$NBA_SOURCE_FEED_TOKEN") {
  const clean = baseUrl.replace(/\/$/, "");
  return {
    NBA_TEAM_ANALYTICS_URL: `${clean}/api/simulation/nba/source-feed?kind=team&token=${tokenPlaceholder}`,
    NBA_PLAYER_ANALYTICS_URL: `${clean}/api/simulation/nba/source-feed?kind=player&token=${tokenPlaceholder}`,
    NBA_RECENT_FORM_URL: `${clean}/api/simulation/nba/source-feed?kind=history&token=${tokenPlaceholder}`,
    NBA_GAME_RATINGS_URL: `${clean}/api/simulation/nba/source-feed?kind=rating&token=${tokenPlaceholder}`
  };
}
