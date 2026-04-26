import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeNbaTeam } from "@/services/simulation/nba-team-analytics";

export type PlayerStatus = "available" | "questionable" | "doubtful" | "out" | "unknown";

export type NbaPlayerImpactRecord = {
  playerName: string;
  teamName: string;
  status: PlayerStatus;
  minutesImpact: number;
  usageImpact: number;
  netRatingImpact: number;
  offensiveImpact: number;
  defensiveImpact: number;
  volatilityImpact: number;
  source?: "real" | "synthetic";
};

export type NbaLineupImpact = {
  teamName: string;
  players: NbaPlayerImpactRecord[];
  availabilityPenalty: number;
  offensivePenalty: number;
  defensivePenalty: number;
  usageShock: number;
  volatilityBoost: number;
  activeCoreHealth: number;
  summary: string;
};

type RawPlayerImpact = Partial<NbaPlayerImpactRecord> & {
  player?: string;
  name?: string;
  team?: string;
  team_name?: string;
  injury_status?: string;
  status?: string;
  minutes_impact?: number;
  usage_impact?: number;
  net_rating_impact?: number;
  offensive_impact?: number;
  defensive_impact?: number;
  volatility_impact?: number;
};

const CACHE_KEY = "nba:player-impact:v1";
const CACHE_TTL_SECONDS = 60 * 60 * 2;

function statusFrom(value: unknown): PlayerStatus {
  const text = String(value ?? "unknown").toLowerCase();
  if (text.includes("available") || text.includes("probable") || text.includes("active")) return "available";
  if (text.includes("question")) return "questionable";
  if (text.includes("doubt")) return "doubtful";
  if (text.includes("out") || text.includes("inactive") || text.includes("suspend")) return "out";
  return "unknown";
}

function num(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function statusWeight(status: PlayerStatus) {
  if (status === "out") return 1;
  if (status === "doubtful") return 0.75;
  if (status === "questionable") return 0.42;
  if (status === "unknown") return 0.2;
  return 0;
}

function rowsFromBody(body: any): RawPlayerImpact[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.players)) return body.players;
  if (Array.isArray(body?.injuries)) return body.injuries;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

function normalizeRaw(row: RawPlayerImpact): NbaPlayerImpactRecord | null {
  const playerName = row.playerName ?? row.player ?? row.name;
  const teamName = row.teamName ?? row.team ?? row.team_name;
  if (!playerName || !teamName) return null;
  const status = statusFrom(row.status ?? row.injury_status);
  const baseMinutes = num(row.minutesImpact, row.minutes_impact) ?? 0;
  const baseUsage = num(row.usageImpact, row.usage_impact) ?? 0;
  const baseNet = num(row.netRatingImpact, row.net_rating_impact) ?? 0;
  const baseOff = num(row.offensiveImpact, row.offensive_impact) ?? baseNet * 0.55;
  const baseDef = num(row.defensiveImpact, row.defensive_impact) ?? baseNet * 0.45;
  const baseVol = num(row.volatilityImpact, row.volatility_impact) ?? Math.abs(baseUsage) / 8;
  return {
    playerName,
    teamName,
    status,
    minutesImpact: baseMinutes,
    usageImpact: baseUsage,
    netRatingImpact: baseNet,
    offensiveImpact: baseOff,
    defensiveImpact: baseDef,
    volatilityImpact: baseVol,
    source: "real"
  };
}

async function fetchPlayerImpact() {
  const cached = await readHotCache<Record<string, NbaPlayerImpactRecord[]>>(CACHE_KEY);
  if (cached) return cached;
  const url = process.env.NBA_PLAYER_IMPACT_URL?.trim() || process.env.NBA_INJURY_IMPACT_URL?.trim();
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const body = await response.json();
    const grouped: Record<string, NbaPlayerImpactRecord[]> = {};
    for (const row of rowsFromBody(body)) {
      const record = normalizeRaw(row);
      if (!record) continue;
      const key = normalizeNbaTeam(record.teamName);
      grouped[key] = [...(grouped[key] ?? []), record];
    }
    if (Object.keys(grouped).length) {
      await writeHotCache(CACHE_KEY, grouped, CACHE_TTL_SECONDS);
      return grouped;
    }
  } catch {
    return null;
  }
  return null;
}

function syntheticImpact(teamName: string): NbaLineupImpact {
  return {
    teamName,
    players: [],
    availabilityPenalty: 0,
    offensivePenalty: 0,
    defensivePenalty: 0,
    usageShock: 0,
    volatilityBoost: 1,
    activeCoreHealth: 100,
    summary: "No confirmed injury-impact feed available; lineup model is neutral."
  };
}

export async function getNbaLineupImpact(teamName: string): Promise<NbaLineupImpact> {
  const grouped = await fetchPlayerImpact();
  const players = grouped?.[normalizeNbaTeam(teamName)] ?? [];
  if (!players.length) return syntheticImpact(teamName);

  const unavailable = players.filter((player) => statusWeight(player.status) > 0);
  const availabilityPenalty = unavailable.reduce((sum, player) => sum + Math.abs(player.netRatingImpact) * statusWeight(player.status), 0);
  const offensivePenalty = unavailable.reduce((sum, player) => sum + Math.abs(player.offensiveImpact) * statusWeight(player.status), 0);
  const defensivePenalty = unavailable.reduce((sum, player) => sum + Math.abs(player.defensiveImpact) * statusWeight(player.status), 0);
  const usageShock = unavailable.reduce((sum, player) => sum + Math.abs(player.usageImpact) * statusWeight(player.status), 0);
  const volatilityBoost = Math.min(1.45, 1 + unavailable.reduce((sum, player) => sum + Math.abs(player.volatilityImpact) * statusWeight(player.status), 0) / 10);
  const activeCoreHealth = Math.max(0, Math.round(100 - availabilityPenalty * 5 - usageShock * 1.5));
  const top = unavailable.sort((a, b) => Math.abs(b.netRatingImpact) - Math.abs(a.netRatingImpact))[0];

  return {
    teamName,
    players,
    availabilityPenalty: Number(availabilityPenalty.toFixed(2)),
    offensivePenalty: Number(offensivePenalty.toFixed(2)),
    defensivePenalty: Number(defensivePenalty.toFixed(2)),
    usageShock: Number(usageShock.toFixed(2)),
    volatilityBoost: Number(volatilityBoost.toFixed(2)),
    activeCoreHealth,
    summary: top ? `${top.playerName} ${top.status} is the largest lineup-impact flag.` : "Lineup impact is light."
  };
}
