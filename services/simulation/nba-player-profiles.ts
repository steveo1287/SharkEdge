import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeNbaTeam } from "@/services/simulation/nba-team-analytics";

export type NbaPlayerProfile = {
  playerName: string;
  teamName: string;
  role: "star" | "starter" | "rotation" | "bench" | "unknown";
  status: "available" | "questionable" | "doubtful" | "out" | "unknown";
  projectedMinutes: number;
  usageRate: number;
  offensiveEpm: number;
  defensiveEpm: number;
  netImpact: number;
  onOffNet: number;
  trueShooting: number;
  assistRate: number;
  reboundRate: number;
  turnoverRate: number;
  rimPressure: number;
  threePointGravity: number;
  defensiveVersatility: number;
  pointOfAttackDefense: number;
  rimProtection: number;
  clutchImpact: number;
  fatigueRisk: number;
  source: "real" | "synthetic";
};

export type NbaTeamPlayerProfileSummary = {
  teamName: string;
  source: "real" | "synthetic";
  players: NbaPlayerProfile[];
  starPower: number;
  creationIndex: number;
  spacingIndex: number;
  playmakingIndex: number;
  glassIndex: number;
  defenseIndex: number;
  rimProtectionIndex: number;
  clutchIndex: number;
  fatigueRisk: number;
  availabilityDrag: number;
  rotationReliability: number;
  offensiveProfileBoost: number;
  defensiveProfileBoost: number;
  volatilityBoost: number;
  notes: string[];
};

type RawPlayerProfile = Partial<NbaPlayerProfile> & {
  player?: string;
  name?: string;
  team?: string;
  team_name?: string;
  minutes?: number;
  projected_minutes?: number;
  usage?: number;
  usage_rate?: number;
  off_epm?: number;
  def_epm?: number;
  net_impact?: number;
  on_off_net?: number;
  ts_pct?: number;
  ast_rate?: number;
  reb_rate?: number;
  tov_rate?: number;
  rim_pressure?: number;
  three_point_gravity?: number;
  defensive_versatility?: number;
  poa_defense?: number;
  rim_protection?: number;
  clutch_impact?: number;
  fatigue_risk?: number;
};

const CACHE_KEY = "nba:player-profiles:v1";
const CACHE_TTL_SECONDS = 60 * 60 * 6;

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

function seedUnit(seed: number) {
  return (seed % 1000) / 1000;
}

function range(seed: number, min: number, max: number) {
  return Number((min + seedUnit(seed) * (max - min)).toFixed(2));
}

function num(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function roleFrom(value: unknown, minutes: number, usage: number): NbaPlayerProfile["role"] {
  const text = String(value ?? "").toLowerCase();
  if (["star", "starter", "rotation", "bench"].includes(text)) return text as NbaPlayerProfile["role"];
  if (minutes >= 32 && usage >= 25) return "star";
  if (minutes >= 26) return "starter";
  if (minutes >= 14) return "rotation";
  if (minutes > 0) return "bench";
  return "unknown";
}

function statusFrom(value: unknown): NbaPlayerProfile["status"] {
  const text = String(value ?? "available").toLowerCase();
  if (text.includes("out") || text.includes("inactive") || text.includes("suspend")) return "out";
  if (text.includes("doubt")) return "doubtful";
  if (text.includes("question")) return "questionable";
  if (text.includes("probable") || text.includes("available") || text.includes("active")) return "available";
  return "unknown";
}

function availabilityWeight(status: NbaPlayerProfile["status"]) {
  if (status === "out") return 1;
  if (status === "doubtful") return 0.75;
  if (status === "questionable") return 0.42;
  if (status === "unknown") return 0.15;
  return 0;
}

function syntheticPlayers(teamName: string): NbaPlayerProfile[] {
  return Array.from({ length: 9 }, (_, index) => {
    const seed = hashString(`${teamName}:player-profile:${index}`);
    const projectedMinutes = index === 0 ? range(seed, 32, 37) : index < 5 ? range(seed, 22, 32) : range(seed, 10, 22);
    const usageRate = index === 0 ? range(seed >>> 1, 26, 33) : index < 3 ? range(seed >>> 1, 18, 25) : range(seed >>> 1, 10, 18);
    const offensiveEpm = index === 0 ? range(seed >>> 2, 2.5, 7) : range(seed >>> 2, -2, 3.2);
    const defensiveEpm = index < 5 ? range(seed >>> 3, -1.5, 3.5) : range(seed >>> 3, -2, 1.8);
    return {
      playerName: `${teamName} Profile ${index + 1}`,
      teamName,
      role: roleFrom(null, projectedMinutes, usageRate),
      status: "available",
      projectedMinutes,
      usageRate,
      offensiveEpm,
      defensiveEpm,
      netImpact: Number((offensiveEpm + defensiveEpm).toFixed(2)),
      onOffNet: range(seed >>> 4, -4, 8),
      trueShooting: range(seed >>> 5, 53, 64),
      assistRate: range(seed >>> 6, 6, 32),
      reboundRate: range(seed >>> 7, 4, 18),
      turnoverRate: range(seed >>> 8, 6, 16),
      rimPressure: range(seed >>> 9, 0, 10),
      threePointGravity: range(seed >>> 10, 0, 10),
      defensiveVersatility: range(seed >>> 11, 0, 10),
      pointOfAttackDefense: range(seed >>> 12, 0, 10),
      rimProtection: range(seed >>> 13, 0, 10),
      clutchImpact: range(seed >>> 14, -2, 4),
      fatigueRisk: range(seed >>> 15, 0, 1),
      source: "synthetic"
    };
  });
}

function normalizeRaw(row: RawPlayerProfile): NbaPlayerProfile | null {
  const playerName = row.playerName ?? row.player ?? row.name;
  const teamName = row.teamName ?? row.team ?? row.team_name;
  if (!playerName || !teamName) return null;
  const projectedMinutes = num(row.projectedMinutes, row.projected_minutes, row.minutes) ?? 0;
  const usageRate = num(row.usageRate, row.usage_rate, row.usage) ?? 0;
  const offensiveEpm = num(row.offensiveEpm, row.off_epm) ?? 0;
  const defensiveEpm = num(row.defensiveEpm, row.def_epm) ?? 0;
  return {
    playerName,
    teamName,
    role: roleFrom(row.role, projectedMinutes, usageRate),
    status: statusFrom(row.status),
    projectedMinutes,
    usageRate,
    offensiveEpm,
    defensiveEpm,
    netImpact: num(row.netImpact, row.net_impact) ?? offensiveEpm + defensiveEpm,
    onOffNet: num(row.onOffNet, row.on_off_net) ?? 0,
    trueShooting: num(row.trueShooting, row.ts_pct) ?? 56,
    assistRate: num(row.assistRate, row.ast_rate) ?? 10,
    reboundRate: num(row.reboundRate, row.reb_rate) ?? 8,
    turnoverRate: num(row.turnoverRate, row.tov_rate) ?? 10,
    rimPressure: num(row.rimPressure, row.rim_pressure) ?? 0,
    threePointGravity: num(row.threePointGravity, row.three_point_gravity) ?? 0,
    defensiveVersatility: num(row.defensiveVersatility, row.defensive_versatility) ?? 0,
    pointOfAttackDefense: num(row.pointOfAttackDefense, row.poa_defense) ?? 0,
    rimProtection: num(row.rimProtection, row.rim_protection) ?? 0,
    clutchImpact: num(row.clutchImpact, row.clutch_impact) ?? 0,
    fatigueRisk: num(row.fatigueRisk, row.fatigue_risk) ?? 0,
    source: "real"
  };
}

function rowsFromBody(body: any): RawPlayerProfile[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.players)) return body.players;
  if (Array.isArray(body?.profiles)) return body.profiles;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

async function fetchProfiles() {
  const cached = await readHotCache<Record<string, NbaPlayerProfile[]>>(CACHE_KEY);
  if (cached) return cached;
  const url = process.env.NBA_PLAYER_PROFILE_URL?.trim();
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const grouped: Record<string, NbaPlayerProfile[]> = {};
    for (const row of rowsFromBody(await response.json())) {
      const profile = normalizeRaw(row);
      if (!profile) continue;
      const key = normalizeNbaTeam(profile.teamName);
      grouped[key] = [...(grouped[key] ?? []), profile];
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

function weighted(players: NbaPlayerProfile[], selector: (player: NbaPlayerProfile) => number) {
  const active = players.filter((player) => availabilityWeight(player.status) < 1);
  const minutes = active.reduce((sum, player) => sum + Math.max(0, player.projectedMinutes), 0);
  if (!minutes) return 0;
  return Number((active.reduce((sum, player) => sum + selector(player) * Math.max(0, player.projectedMinutes), 0) / minutes).toFixed(2));
}

export async function getNbaTeamPlayerProfileSummary(teamName: string): Promise<NbaTeamPlayerProfileSummary> {
  const grouped = await fetchProfiles();
  const players = grouped?.[normalizeNbaTeam(teamName)] ?? syntheticPlayers(teamName);
  const source = players.some((player) => player.source === "real") ? "real" : "synthetic";
  const unavailable = players.filter((player) => availabilityWeight(player.status) > 0);
  const availabilityDrag = Number(unavailable.reduce((sum, player) => sum + Math.abs(player.netImpact) * availabilityWeight(player.status), 0).toFixed(2));
  const fatigueRisk = weighted(players, (player) => player.fatigueRisk);
  const starPower = weighted(players, (player) => player.role === "star" ? player.netImpact * 1.25 : player.netImpact);
  const creationIndex = weighted(players, (player) => player.usageRate * 0.18 + player.offensiveEpm + player.rimPressure * 0.25);
  const spacingIndex = weighted(players, (player) => player.trueShooting * 0.08 + player.threePointGravity * 0.7);
  const playmakingIndex = weighted(players, (player) => player.assistRate * 0.18 - player.turnoverRate * 0.12);
  const glassIndex = weighted(players, (player) => player.reboundRate * 0.25);
  const defenseIndex = weighted(players, (player) => player.defensiveEpm + player.defensiveVersatility * 0.25 + player.pointOfAttackDefense * 0.22);
  const rimProtectionIndex = weighted(players, (player) => player.rimProtection * 0.45);
  const clutchIndex = weighted(players, (player) => player.clutchImpact);
  const rotationReliability = Number(Math.max(0, 100 - availabilityDrag * 6 - fatigueRisk * 12).toFixed(2));
  return {
    teamName,
    source,
    players,
    starPower,
    creationIndex,
    spacingIndex,
    playmakingIndex,
    glassIndex,
    defenseIndex,
    rimProtectionIndex,
    clutchIndex,
    fatigueRisk,
    availabilityDrag,
    rotationReliability,
    offensiveProfileBoost: Number((creationIndex * 0.45 + spacingIndex * 0.24 + playmakingIndex * 0.22 + starPower * 0.2 - availabilityDrag * 0.35).toFixed(2)),
    defensiveProfileBoost: Number((defenseIndex * 0.45 + rimProtectionIndex * 0.28 + glassIndex * 0.14 - availabilityDrag * 0.18).toFixed(2)),
    volatilityBoost: Number(Math.min(1.6, 1 + availabilityDrag / 18 + fatigueRisk / 10).toFixed(2)),
    notes: [source === "real" ? "Real player profile feed applied." : "Synthetic player profiles applied until NBA_PLAYER_PROFILE_URL is configured.", `Rotation reliability ${rotationReliability}/100.`]
  };
}
