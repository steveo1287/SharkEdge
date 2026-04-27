import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeMlbTeam } from "@/services/simulation/mlb-team-analytics";

export type MlbPlayerProfile = {
  playerName: string;
  teamName: string;
  role: "ace" | "starter" | "closer" | "setup" | "lineup" | "bench" | "unknown";
  playerType: "hitter" | "starter" | "reliever" | "two-way" | "unknown";
  bats: "L" | "R" | "S" | "unknown";
  throws: "L" | "R" | "unknown";
  status: "available" | "questionable" | "doubtful" | "out" | "unknown";
  projectedPa: number;
  projectedInnings: number;
  lineupSpot: number;
  wrcPlus: number;
  xwoba: number;
  isoPower: number;
  kRate: number;
  bbRate: number;
  hardHitRate: number;
  barrelRate: number;
  stolenBaseValue: number;
  defenseValue: number;
  pitcherEraMinus: number;
  pitcherXFip: number;
  pitcherKRate: number;
  pitcherBbRate: number;
  groundBallRate: number;
  platoonVsLhp: number;
  platoonVsRhp: number;
  fatigueRisk: number;
  leverageIndex: number;
  source: "real" | "synthetic";
};

export type MlbTeamPlayerSummary = {
  teamName: string;
  source: "real" | "synthetic";
  players: MlbPlayerProfile[];
  lineupRunCreation: number;
  lineupPower: number;
  lineupDiscipline: number;
  platoonFlex: number;
  speedDefense: number;
  starterQuality: number;
  bullpenLeverage: number;
  bullpenFatigue: number;
  availabilityDrag: number;
  offensivePlayerBoost: number;
  pitchingPlayerBoost: number;
  volatilityBoost: number;
  notes: string[];
};

const CACHE_KEY = "mlb:player-model:v1";
const CACHE_TTL_SECONDS = 60 * 60 * 6;
type RawPlayer = Record<string, unknown>;

function hashString(value: string) { let hash = 0; for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0; return hash; }
function seedUnit(seed: number) { return (seed % 1000) / 1000; }
function range(seed: number, min: number, max: number) { return Number((min + seedUnit(seed) * (max - min)).toFixed(2)); }
function num(value: unknown, fallback: number) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value); return fallback; }
function text(...values: unknown[]) { for (const value of values) if (typeof value === "string" && value.trim()) return value.trim(); return null; }
function side(value: unknown, fallback: "L" | "R" | "S" | "unknown") { const v = String(value ?? "").toUpperCase(); if (v === "L" || v === "R" || v === "S") return v; return fallback; }
function throwsSide(value: unknown, fallback: "L" | "R" | "unknown") { const v = String(value ?? "").toUpperCase(); if (v === "L" || v === "R") return v; return fallback; }
function statusFrom(value: unknown): MlbPlayerProfile["status"] { const v = String(value ?? "available").toLowerCase(); if (v.includes("out") || v.includes("injured") || v.includes("il") || v.includes("inactive")) return "out"; if (v.includes("doubt")) return "doubtful"; if (v.includes("question")) return "questionable"; if (v.includes("available") || v.includes("active") || v.includes("probable")) return "available"; return "unknown"; }
function playerTypeFrom(value: unknown, innings: number, pa: number): MlbPlayerProfile["playerType"] { const v = String(value ?? "").toLowerCase(); if (v.includes("starter") || v.includes("sp")) return "starter"; if (v.includes("reliever") || v.includes("rp") || v.includes("closer")) return "reliever"; if (v.includes("two")) return "two-way"; if (v.includes("hitter") || v.includes("batter")) return "hitter"; if (innings >= 3) return "starter"; if (innings > 0) return "reliever"; if (pa > 0) return "hitter"; return "unknown"; }
function roleFrom(row: RawPlayer, type: MlbPlayerProfile["playerType"], innings: number, pa: number): MlbPlayerProfile["role"] { const v = String(row.role ?? row.position ?? "").toLowerCase(); if (v.includes("ace")) return "ace"; if (v.includes("closer")) return "closer"; if (v.includes("setup")) return "setup"; if (type === "starter" && innings >= 4.5) return "starter"; if (type === "reliever" && num(row.leverageIndex ?? row.leverage_index, 1) >= 1.4) return "setup"; if (type === "hitter" && pa >= 3) return "lineup"; if (pa > 0) return "bench"; return "unknown"; }
function availabilityWeight(status: MlbPlayerProfile["status"]) { if (status === "out") return 1; if (status === "doubtful") return 0.7; if (status === "questionable") return 0.35; if (status === "unknown") return 0.12; return 0; }
function rowsFromBody(body: any): RawPlayer[] { if (Array.isArray(body)) return body; if (Array.isArray(body?.players)) return body.players; if (Array.isArray(body?.data)) return body.data; if (Array.isArray(body?.profiles)) return body.profiles; return []; }

function syntheticPlayers(teamName: string): MlbPlayerProfile[] {
  return Array.from({ length: 16 }, (_, index) => {
    const seed = hashString(`${teamName}:mlb-player:${index}`);
    const isPitcher = index >= 9;
    const projectedPa = isPitcher ? 0 : index < 9 ? range(seed, 3.2, 4.7) : range(seed, 0, 1.2);
    const projectedInnings = !isPitcher ? 0 : index === 9 ? range(seed, 4.8, 6.6) : range(seed, 0.2, 1.1);
    const type = playerTypeFrom(isPitcher ? (index === 9 ? "starter" : "reliever") : "hitter", projectedInnings, projectedPa);
    return {
      playerName: `${teamName} MLB Profile ${index + 1}`,
      teamName,
      role: roleFrom({}, type, projectedInnings, projectedPa),
      playerType: type,
      bats: side(index % 3 === 0 ? "L" : index % 3 === 1 ? "R" : "S", "unknown"),
      throws: throwsSide(index % 4 === 0 ? "L" : "R", "unknown"),
      status: "available",
      projectedPa,
      projectedInnings,
      lineupSpot: isPitcher ? 0 : index + 1,
      wrcPlus: range(seed >>> 1, 82, 132),
      xwoba: range(seed >>> 2, 0.285, 0.37),
      isoPower: range(seed >>> 3, 0.1, 0.24),
      kRate: range(seed >>> 4, 16, 32),
      bbRate: range(seed >>> 5, 5, 13),
      hardHitRate: range(seed >>> 6, 32, 52),
      barrelRate: range(seed >>> 7, 4, 15),
      stolenBaseValue: range(seed >>> 8, -1, 3),
      defenseValue: range(seed >>> 9, -3, 5),
      pitcherEraMinus: range(seed >>> 10, 72, 125),
      pitcherXFip: range(seed >>> 11, 3.1, 5.1),
      pitcherKRate: range(seed >>> 12, 17, 32),
      pitcherBbRate: range(seed >>> 13, 5, 12),
      groundBallRate: range(seed >>> 14, 34, 52),
      platoonVsLhp: range(seed >>> 15, -12, 18),
      platoonVsRhp: range(seed >>> 16, -12, 18),
      fatigueRisk: range(seed >>> 17, 0, 1),
      leverageIndex: isPitcher ? range(seed >>> 18, 0.7, 2) : 0,
      source: "synthetic"
    };
  });
}

function normalizeRaw(row: RawPlayer): MlbPlayerProfile | null {
  const playerName = text(row.playerName, row.player, row.name, row.PLAYER_NAME);
  const teamName = text(row.teamName, row.team, row.team_name, row.TEAM_NAME, row.Team);
  if (!playerName || !teamName) return null;
  const projectedPa = num(row.projectedPa ?? row.projected_pa ?? row.PA ?? row.pa, 0);
  const projectedInnings = num(row.projectedInnings ?? row.projected_ip ?? row.IP ?? row.ip, 0);
  const playerType = playerTypeFrom(row.playerType ?? row.type ?? row.position, projectedInnings, projectedPa);
  return {
    playerName,
    teamName,
    role: roleFrom(row, playerType, projectedInnings, projectedPa),
    playerType,
    bats: side(row.bats ?? row.BATS, "unknown"),
    throws: throwsSide(row.throws ?? row.THROWS, "unknown"),
    status: statusFrom(row.status ?? row.injuryStatus ?? row.injury_status),
    projectedPa,
    projectedInnings,
    lineupSpot: num(row.lineupSpot ?? row.lineup_spot ?? row.battingOrder, 0),
    wrcPlus: num(row.wrcPlus ?? row.wRCPlus ?? row.wRC_plus, 100),
    xwoba: num(row.xwoba ?? row.xwOBA, 0.315),
    isoPower: num(row.isoPower ?? row.ISO, 0.16),
    kRate: num(row.kRate ?? row.KRate ?? row.K_PCT, 22.5),
    bbRate: num(row.bbRate ?? row.BBRate ?? row.BB_PCT, 8.2),
    hardHitRate: num(row.hardHitRate ?? row.hard_hit_rate, 40),
    barrelRate: num(row.barrelRate ?? row.barrel_rate, 8),
    stolenBaseValue: num(row.stolenBaseValue ?? row.sb_value, 0),
    defenseValue: num(row.defenseValue ?? row.defense ?? row.DRS ?? row.OAA, 0),
    pitcherEraMinus: num(row.pitcherEraMinus ?? row.ERA_MINUS, 100),
    pitcherXFip: num(row.pitcherXFip ?? row.xFIP, 4.15),
    pitcherKRate: num(row.pitcherKRate ?? row.pitcher_k_rate ?? row.K_PCT, 22),
    pitcherBbRate: num(row.pitcherBbRate ?? row.pitcher_bb_rate ?? row.BB_PCT, 8),
    groundBallRate: num(row.groundBallRate ?? row.gb_rate, 43),
    platoonVsLhp: num(row.platoonVsLhp ?? row.vs_lhp, 0),
    platoonVsRhp: num(row.platoonVsRhp ?? row.vs_rhp, 0),
    fatigueRisk: num(row.fatigueRisk ?? row.fatigue_risk, 0),
    leverageIndex: num(row.leverageIndex ?? row.leverage_index, 1),
    source: "real"
  };
}

async function fetchProfiles() {
  const cached = await readHotCache<Record<string, MlbPlayerProfile[]>>(CACHE_KEY);
  if (cached) return cached;
  const url = process.env.MLB_PLAYER_ANALYTICS_URL?.trim() || process.env.MLB_PLAYER_STATS_URL?.trim();
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const grouped: Record<string, MlbPlayerProfile[]> = {};
    for (const row of rowsFromBody(await response.json())) {
      const profile = normalizeRaw(row);
      if (!profile) continue;
      const key = normalizeMlbTeam(profile.teamName);
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

function weighted(players: MlbPlayerProfile[], weight: (p: MlbPlayerProfile) => number, selector: (p: MlbPlayerProfile) => number) {
  const active = players.filter((p) => availabilityWeight(p.status) < 1);
  const totalWeight = active.reduce((sum, p) => sum + Math.max(0, weight(p)), 0);
  if (!totalWeight) return 0;
  return Number((active.reduce((sum, p) => sum + selector(p) * Math.max(0, weight(p)), 0) / totalWeight).toFixed(2));
}

export async function getMlbTeamPlayerSummary(teamName: string): Promise<MlbTeamPlayerSummary> {
  const grouped = await fetchProfiles();
  const players = grouped?.[normalizeMlbTeam(teamName)] ?? syntheticPlayers(teamName);
  const source = players.some((p) => p.source === "real") ? "real" : "synthetic";
  const hitters = players.filter((p) => p.playerType === "hitter" || p.playerType === "two-way");
  const pitchers = players.filter((p) => p.playerType === "starter" || p.playerType === "reliever" || p.playerType === "two-way");
  const relievers = players.filter((p) => p.playerType === "reliever");
  const unavailable = players.filter((p) => availabilityWeight(p.status) > 0);
  const availabilityDrag = Number(unavailable.reduce((sum, p) => sum + (Math.abs(p.wrcPlus - 100) / 12 + Math.abs(100 - p.pitcherEraMinus) / 15 + p.leverageIndex) * availabilityWeight(p.status), 0).toFixed(2));
  const lineupRunCreation = weighted(hitters, (p) => p.projectedPa, (p) => (p.wrcPlus - 100) / 10 + (p.xwoba - 0.315) * 45);
  const lineupPower = weighted(hitters, (p) => p.projectedPa, (p) => p.isoPower * 22 + p.barrelRate * 0.25 + p.hardHitRate * 0.08);
  const lineupDiscipline = weighted(hitters, (p) => p.projectedPa, (p) => p.bbRate * 0.28 - p.kRate * 0.12);
  const platoonFlex = weighted(hitters, (p) => p.projectedPa, (p) => Math.max(p.platoonVsLhp, p.platoonVsRhp) / 5);
  const speedDefense = weighted(hitters, (p) => p.projectedPa, (p) => p.stolenBaseValue * 0.35 + p.defenseValue * 0.22);
  const starterQuality = weighted(pitchers.filter((p) => p.playerType === "starter"), (p) => p.projectedInnings, (p) => (100 - p.pitcherEraMinus) / 8 + (4.2 - p.pitcherXFip) * 0.9 + (p.pitcherKRate - p.pitcherBbRate) * 0.08);
  const bullpenLeverage = weighted(relievers, (p) => p.projectedInnings * Math.max(0.7, p.leverageIndex), (p) => (100 - p.pitcherEraMinus) / 10 + (4.2 - p.pitcherXFip) * 0.7 + (p.pitcherKRate - p.pitcherBbRate) * 0.06);
  const bullpenFatigue = weighted(relievers, (p) => p.projectedInnings * Math.max(0.5, p.leverageIndex), (p) => p.fatigueRisk);
  return {
    teamName,
    source,
    players,
    lineupRunCreation,
    lineupPower,
    lineupDiscipline,
    platoonFlex,
    speedDefense,
    starterQuality,
    bullpenLeverage,
    bullpenFatigue,
    availabilityDrag,
    offensivePlayerBoost: Number((lineupRunCreation * 0.48 + lineupPower * 0.22 + lineupDiscipline * 0.18 + platoonFlex * 0.16 + speedDefense * 0.08 - availabilityDrag * 0.28).toFixed(2)),
    pitchingPlayerBoost: Number((starterQuality * 0.55 + bullpenLeverage * 0.35 - bullpenFatigue * 0.9 - availabilityDrag * 0.14).toFixed(2)),
    volatilityBoost: Number(Math.max(0.85, Math.min(1.8, 1 + bullpenFatigue / 5 + availabilityDrag / 18 + Math.abs(lineupPower) / 30)).toFixed(2)),
    notes: [source === "real" ? "Real MLB player analytics feed applied." : "Synthetic MLB player model applied until MLB_PLAYER_ANALYTICS_URL is configured.", `Availability drag ${availabilityDrag}.`, `Bullpen fatigue ${bullpenFatigue}.`]
  };
}
