export type MlbPlayerProjectionContext = {
  playerName: string;
  team?: string | null;
  opponent?: string | null;
  handedness?: "L" | "R" | "S" | null;
  pitcherHand?: "L" | "R" | null;

  seasonAvg?: number | null;
  last7Avg?: number | null;
  last15Avg?: number | null;

  plateAppearancesPerGame?: number | null;
  projectedPlateAppearances?: number | null;
  battingOrderSpot?: number | null;

  pitcherKRate?: number | null;
  pitcherWalkRate?: number | null;
  pitcherPitchCountAvg?: number | null;
  pitcherOutsAvg?: number | null;
  pitcherEra?: number | null;
  pitcherWhip?: number | null;

  batterKRate?: number | null;
  batterWalkRate?: number | null;
  batterIso?: number | null;
  batterWoba?: number | null;
  batterXwoba?: number | null;

  opponentKRate?: number | null;
  opponentWalkRate?: number | null;
  opponentWobaAllowed?: number | null;
  bullpenFatigueIndex?: number | null;

  parkFactor?: number | null;
  weatherRunFactor?: number | null;
  windOutFactor?: number | null;
  umpireKBoost?: number | null;

  injuryStatus?: "ACTIVE" | "QUESTIONABLE" | "DOUBTFUL" | "OUT" | null;
  source: "databallr" | "fallback";
  updatedAt: string;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickNumber(raw: any, keys: string[]) {
  for (const key of keys) {
    const value = toNumber(raw?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function normalizeStatus(value: unknown): MlbPlayerProjectionContext["injuryStatus"] {
  const raw = String(value ?? "ACTIVE").toUpperCase();
  if (raw.includes("OUT") || raw.includes("IL") || raw.includes("INJURED")) return "OUT";
  if (raw.includes("DOUBT")) return "DOUBTFUL";
  if (raw.includes("QUESTION") || raw === "Q" || raw.includes("DAY")) return "QUESTIONABLE";
  return "ACTIVE";
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

function fallback(playerName: string): MlbPlayerProjectionContext {
  return {
    playerName,
    injuryStatus: "ACTIVE",
    source: "fallback",
    updatedAt: new Date().toISOString()
  };
}

function normalize(payload: unknown, args: { playerName: string; team?: string | null; opponent?: string | null }): MlbPlayerProjectionContext | null {
  const raw = unwrapPayload(payload as any);
  if (!raw || typeof raw !== "object") return null;

  return {
    playerName: String(raw.playerName ?? raw.player_name ?? raw.name ?? args.playerName),
    team: raw.team ?? raw.teamAbbreviation ?? raw.team_abbreviation ?? args.team ?? null,
    opponent: raw.opponent ?? raw.opponentAbbreviation ?? raw.opponent_abbreviation ?? args.opponent ?? null,
    handedness: raw.handedness ?? raw.bats ?? null,
    pitcherHand: raw.pitcherHand ?? raw.pitcher_hand ?? raw.throws ?? null,

    seasonAvg: pickNumber(raw, ["seasonAvg", "season_avg", "avg", "stat_avg"]),
    last7Avg: pickNumber(raw, ["last7Avg", "last_7_avg", "l7_avg"]),
    last15Avg: pickNumber(raw, ["last15Avg", "last_15_avg", "l15_avg"]),

    plateAppearancesPerGame: pickNumber(raw, ["plateAppearancesPerGame", "pa_per_game", "pa_pg"]),
    projectedPlateAppearances: pickNumber(raw, ["projectedPlateAppearances", "projected_pa", "proj_pa"]),
    battingOrderSpot: pickNumber(raw, ["battingOrderSpot", "batting_order", "lineup_spot"]),

    pitcherKRate: pickNumber(raw, ["pitcherKRate", "pitcher_k_rate", "k_pct", "strikeout_rate"]),
    pitcherWalkRate: pickNumber(raw, ["pitcherWalkRate", "bb_pct", "walk_rate"]),
    pitcherPitchCountAvg: pickNumber(raw, ["pitcherPitchCountAvg", "pitch_count_avg", "avg_pitch_count"]),
    pitcherOutsAvg: pickNumber(raw, ["pitcherOutsAvg", "outs_avg", "avg_outs"]),
    pitcherEra: pickNumber(raw, ["pitcherEra", "era"]),
    pitcherWhip: pickNumber(raw, ["pitcherWhip", "whip"]),

    batterKRate: pickNumber(raw, ["batterKRate", "batter_k_rate", "batter_k_pct"]),
    batterWalkRate: pickNumber(raw, ["batterWalkRate", "batter_walk_rate", "batter_bb_pct"]),
    batterIso: pickNumber(raw, ["batterIso", "iso"]),
    batterWoba: pickNumber(raw, ["batterWoba", "woba"]),
    batterXwoba: pickNumber(raw, ["batterXwoba", "xwoba"]),

    opponentKRate: pickNumber(raw, ["opponentKRate", "opp_k_rate", "opponent_k_pct"]),
    opponentWalkRate: pickNumber(raw, ["opponentWalkRate", "opp_walk_rate", "opponent_bb_pct"]),
    opponentWobaAllowed: pickNumber(raw, ["opponentWobaAllowed", "opp_woba_allowed"]),
    bullpenFatigueIndex: pickNumber(raw, ["bullpenFatigueIndex", "bullpen_fatigue"]),

    parkFactor: pickNumber(raw, ["parkFactor", "park_factor"]),
    weatherRunFactor: pickNumber(raw, ["weatherRunFactor", "weather_run_factor"]),
    windOutFactor: pickNumber(raw, ["windOutFactor", "wind_out_factor"]),
    umpireKBoost: pickNumber(raw, ["umpireKBoost", "umpire_k_boost"]),

    injuryStatus: normalizeStatus(raw.injuryStatus ?? raw.injury_status ?? raw.status),
    source: "databallr",
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? new Date().toISOString())
  };
}

export async function getMlbPlayerProjectionContext(args: {
  playerName: string;
  team?: string | null;
  opponent?: string | null;
  propType?: string | null;
}): Promise<MlbPlayerProjectionContext> {
  const baseUrl = process.env.DATABALLR_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!baseUrl) return fallback(args.playerName);

  const path = process.env.DATABALLR_MLB_PLAYER_CONTEXT_PATH?.trim() || "/mlb/player-context";
  const apiKey = process.env.DATABALLR_API_KEY?.trim();
  const query = new URLSearchParams({ player: args.playerName });
  if (args.team) query.set("team", args.team);
  if (args.opponent) query.set("opponent", args.opponent);
  if (args.propType) query.set("prop", args.propType);

  try {
    const response = await fetch(`${baseUrl}${path}?${query.toString()}`, {
      cache: "no-store",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}`, "x-api-key": apiKey } : undefined
    });
    if (!response.ok) return fallback(args.playerName);
    const mapped = normalize(await response.json(), args);
    return mapped ?? fallback(args.playerName);
  } catch {
    return fallback(args.playerName);
  }
}
