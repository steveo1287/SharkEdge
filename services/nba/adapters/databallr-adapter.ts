export type DataballrPlayerContextRequest = {
  playerName: string;
  team?: string | null;
  opponent?: string | null;
  propType?: string | null;
};

export type DataballrPlayerContext = {
  playerName: string;
  team?: string | null;
  opponent?: string | null;
  seasonAvg?: number | null;
  last5Avg?: number | null;
  last10Avg?: number | null;
  seasonMinutes?: number | null;
  last5Minutes?: number | null;
  last10Minutes?: number | null;
  seasonUsageRate?: number | null;
  last5UsageRate?: number | null;
  last10UsageRate?: number | null;
  teamPace?: number | null;
  opponentPace?: number | null;
  opponentDefRating?: number | null;
  opponentRankVsPosition?: number | null;
  trueShootingPct?: number | null;
  projectedMinutes?: number | null;
  injuryStatus?: "ACTIVE" | "QUESTIONABLE" | "DOUBTFUL" | "OUT" | null;
  synergyPlayTypePpp?: number | null;
  synergyFrequencyPct?: number | null;
  nba2kRating?: number | null;
  source: "databallr" | "fallback";
  updatedAt: string;
};

export type DataballrEndpointConfig = {
  baseUrl: string | null;
  apiKeyConfigured: boolean;
  playerContextPath: string;
  queryMode: "player" | "search";
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeStatus(value: unknown): DataballrPlayerContext["injuryStatus"] {
  const raw = String(value ?? "ACTIVE").toUpperCase();
  if (raw.includes("OUT")) return "OUT";
  if (raw.includes("DOUBT")) return "DOUBTFUL";
  if (raw.includes("QUESTION") || raw === "Q") return "QUESTIONABLE";
  return "ACTIVE";
}

function pickNumber(raw: any, keys: string[]) {
  for (const key of keys) {
    const value = toNumber(raw?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function unwrapPayload(payload: any) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload[0] ?? null;
  if (Array.isArray(payload.data)) return payload.data[0] ?? null;
  if (Array.isArray(payload.results)) return payload.results[0] ?? null;
  if (Array.isArray(payload.players)) return payload.players[0] ?? null;
  if (payload.player) return payload.player;
  if (payload.context) return payload.context;
  return payload;
}

export function getDataballrEndpointConfig(): DataballrEndpointConfig {
  return {
    baseUrl: process.env.DATABALLR_API_BASE_URL?.trim().replace(/\/$/, "") ?? null,
    apiKeyConfigured: Boolean(process.env.DATABALLR_API_KEY?.trim()),
    playerContextPath: process.env.DATABALLR_PLAYER_CONTEXT_PATH?.trim() || "/nba/player-context",
    queryMode: process.env.DATABALLR_QUERY_MODE === "search" ? "search" : "player"
  };
}

function buildQuery(request: DataballrPlayerContextRequest, queryMode: DataballrEndpointConfig["queryMode"]) {
  const query = new URLSearchParams();
  query.set(queryMode === "search" ? "q" : "player", request.playerName);
  if (request.team) query.set("team", request.team);
  if (request.opponent) query.set("opponent", request.opponent);
  if (request.propType) query.set("prop", request.propType);
  return query;
}

function buildHeaders() {
  const apiKey = process.env.DATABALLR_API_KEY?.trim();
  if (!apiKey) return undefined;
  return {
    Authorization: `Bearer ${apiKey}`,
    "x-api-key": apiKey
  };
}

export function normalizeDataballrPlayerContext(payload: unknown, request: DataballrPlayerContextRequest): DataballrPlayerContext | null {
  const raw = unwrapPayload(payload as any);
  if (!raw || typeof raw !== "object") return null;

  return {
    playerName: String(raw.playerName ?? raw.player_name ?? raw.name ?? request.playerName),
    team: raw.team ?? raw.teamAbbreviation ?? raw.team_abbreviation ?? request.team ?? null,
    opponent: raw.opponent ?? raw.opponentAbbreviation ?? raw.opponent_abbreviation ?? request.opponent ?? null,
    seasonAvg: pickNumber(raw, ["seasonAvg", "season_avg", "avg", "stat_avg", "points_per_game", "pts_per_game"]),
    last5Avg: pickNumber(raw, ["last5Avg", "last_5_avg", "last5", "l5_avg"]),
    last10Avg: pickNumber(raw, ["last10Avg", "last_10_avg", "last10", "l10_avg"]),
    seasonMinutes: pickNumber(raw, ["seasonMinutes", "season_minutes", "minutes", "mp", "min"]),
    last5Minutes: pickNumber(raw, ["last5Minutes", "last_5_minutes", "l5_minutes", "l5_min"]),
    last10Minutes: pickNumber(raw, ["last10Minutes", "last_10_minutes", "l10_minutes", "l10_min"]),
    seasonUsageRate: pickNumber(raw, ["seasonUsageRate", "season_usage_rate", "usageRate", "usage_rate", "usg_pct"]),
    last5UsageRate: pickNumber(raw, ["last5UsageRate", "last_5_usage_rate", "l5_usage_rate"]),
    last10UsageRate: pickNumber(raw, ["last10UsageRate", "last_10_usage_rate", "l10_usage_rate"]),
    teamPace: pickNumber(raw, ["teamPace", "team_pace", "pace"]),
    opponentPace: pickNumber(raw, ["opponentPace", "opponent_pace", "opp_pace"]),
    opponentDefRating: pickNumber(raw, ["opponentDefRating", "opponent_def_rating", "opp_def_rating", "def_rating_allowed"]),
    opponentRankVsPosition: pickNumber(raw, ["opponentRankVsPosition", "opponent_rank_vs_position", "opp_rank_position", "rank_vs_position"]),
    trueShootingPct: pickNumber(raw, ["trueShootingPct", "true_shooting_pct", "ts_pct"]),
    projectedMinutes: pickNumber(raw, ["projectedMinutes", "projected_minutes", "proj_minutes", "projected_min"]),
    injuryStatus: normalizeStatus(raw.injuryStatus ?? raw.injury_status ?? raw.status),
    synergyPlayTypePpp: pickNumber(raw, ["synergyPlayTypePpp", "synergy_play_type_ppp", "play_type_ppp", "ppp"]),
    synergyFrequencyPct: pickNumber(raw, ["synergyFrequencyPct", "synergy_frequency_pct", "play_type_frequency_pct", "frequency_pct"]),
    nba2kRating: pickNumber(raw, ["nba2kRating", "nba2k_rating", "rating_2k", "overall"]),
    source: "databallr",
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? new Date().toISOString())
  };
}

export function buildDataballrPlayerContextUrl(request: DataballrPlayerContextRequest) {
  const config = getDataballrEndpointConfig();
  if (!config.baseUrl) return null;
  const query = buildQuery(request, config.queryMode);
  return `${config.baseUrl}${config.playerContextPath}?${query.toString()}`;
}

export async function fetchDataballrPlayerContext(request: DataballrPlayerContextRequest): Promise<DataballrPlayerContext | null> {
  const url = buildDataballrPlayerContextUrl(request);
  if (!url) return null;

  const response = await fetch(url, {
    cache: "no-store",
    headers: buildHeaders()
  });

  if (!response.ok) return null;

  const payload = await response.json();
  return normalizeDataballrPlayerContext(payload, request);
}

export async function diagnoseDataballrPlayerContext(request: DataballrPlayerContextRequest) {
  const config = getDataballrEndpointConfig();
  const url = buildDataballrPlayerContextUrl(request);

  if (!url) {
    return {
      ok: false,
      config,
      url: null,
      status: null,
      mapped: null,
      error: "DATABALLR_API_BASE_URL is not configured"
    };
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: buildHeaders()
  });

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    ok: response.ok,
    config,
    url,
    status: response.status,
    mapped: response.ok ? normalizeDataballrPlayerContext(json, request) : null,
    sampleKeys: json && typeof json === "object" ? Object.keys(unwrapPayload(json as any) ?? {}).slice(0, 40) : [],
    error: response.ok ? null : text.slice(0, 500)
  };
}
