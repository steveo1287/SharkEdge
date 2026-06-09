import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbRosterIntelligenceTables } from "@/services/simulation/mlb-roster-intelligence";

export type MlbPlayerProfileRole = "BATTER" | "STARTER" | "RELIEVER" | "PITCHER";

export type MlbPlayerTrait = {
  key: string;
  label: string;
  score: number | null;
  grade: string;
  note: string;
};

export type MlbPlayerModelImpact = {
  projectedRunImpact: number | null;
  winProbabilityImpactPct: number | null;
  propSignal: string;
  simUsage: string[];
};

export type MlbPlayerProfileCard = {
  playerId: string;
  name: string;
  team: string;
  role: MlbPlayerProfileRole;
  roleTier: string;
  season: number | null;
  primaryPosition: string | null;
  handedness: string | null;
  source: string;
  snapshotAt: string | null;
  overall: number | null;
  confidenceTier: "HIGH" | "MEDIUM" | "LOW" | "DATA_GAP";
  traits: MlbPlayerTrait[];
  modelImpact: MlbPlayerModelImpact;
  whyItMatters: string[];
  metrics: Record<string, unknown>;
  href: string;
};

export type MlbPlayerProfilesResponse = {
  ok: boolean;
  generatedAt: string;
  count: number;
  profiles: MlbPlayerProfileCard[];
  warnings: string[];
};

type HitterRow = {
  player_id: string;
  player_name: string;
  team: string;
  season: number | null;
  primary_position: string | null;
  role_tier: string | null;
  contact: number | null;
  power: number | null;
  discipline: number | null;
  vs_lhp: number | null;
  vs_rhp: number | null;
  baserunning: number | null;
  fielding: number | null;
  current_form: number | null;
  overall: number | null;
  metrics_json: Record<string, unknown> | null;
  source: string | null;
  snapshot_at: Date | string | null;
};

type PitcherRow = {
  pitcher_id: string;
  pitcher_name: string;
  team: string;
  season: number | null;
  role_tier: string | null;
  xera_quality: number | null;
  fip_quality: number | null;
  k_bb: number | null;
  hr_risk: number | null;
  groundball_rate: number | null;
  platoon_split: number | null;
  stamina: number | null;
  recent_workload: number | null;
  arsenal_quality: number | null;
  overall: number | null;
  metrics_json: Record<string, unknown> | null;
  source: string | null;
  snapshot_at: Date | string | null;
};

type PlayerProfileFilters = {
  q?: string | null;
  team?: string | null;
  role?: string | null;
  limit?: number | null;
};

const STARTER_ROLES = new Set(["ACE", "TOP_ROTATION", "MID_ROTATION", "BACK_END", "OPENER_BULK"]);
const RELIEF_ROLES = new Set(["CLOSER", "SETUP", "MIDDLE_RELIEF", "LONG_RELIEF", "MOP_UP"]);

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function safeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function score(value: unknown) {
  const n = safeNumber(value);
  return n == null ? null : round(clamp(n), 1);
}

function grade(value: number | null) {
  if (value == null) return "—";
  if (value >= 90) return "ELITE";
  if (value >= 82) return "PLUS";
  if (value >= 72) return "ABOVE AVG";
  if (value >= 62) return "PLAYABLE";
  if (value >= 52) return "THIN";
  return "RISK";
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function metrics(value: Record<string, unknown> | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function handednessFromMetrics(value: Record<string, unknown>) {
  const raw = value.bats ?? value.throws ?? value.handedness ?? value.battingSide ?? value.throwingHand;
  return typeof raw === "string" && raw.trim() ? raw.trim().toUpperCase() : null;
}

function confidenceTier(overall: number | null, snapshotAt: string | null) {
  if (overall == null) return "DATA_GAP" as const;
  if (!snapshotAt) return "LOW" as const;
  const ageDays = Math.max(0, Math.floor((Date.now() - new Date(snapshotAt).getTime()) / 86_400_000));
  if (ageDays <= 7) return "HIGH" as const;
  if (ageDays <= 30) return "MEDIUM" as const;
  return "LOW" as const;
}

function trait(key: string, label: string, value: unknown, note: string): MlbPlayerTrait {
  const s = score(value);
  return { key, label, score: s, grade: grade(s), note };
}

function roleForPitcher(roleTier: string) {
  if (STARTER_ROLES.has(roleTier)) return "STARTER" as const;
  if (RELIEF_ROLES.has(roleTier)) return "RELIEVER" as const;
  return "PITCHER" as const;
}

function impactFromOverall(overall: number | null, role: MlbPlayerProfileRole) {
  if (overall == null) return { run: null, winPct: null };
  const centered = overall - 70;
  const runScale = role === "BATTER" ? 0.018 : role === "STARTER" ? 0.024 : 0.012;
  const winScale = role === "BATTER" ? 0.22 : role === "STARTER" ? 0.32 : 0.12;
  return {
    run: round(centered * runScale, 2),
    winPct: round(centered * winScale, 1)
  };
}

function hitterPropSignal(row: HitterRow) {
  const power = score(row.power) ?? 0;
  const contact = score(row.contact) ?? 0;
  const discipline = score(row.discipline) ?? 0;
  if (power >= 82) return "Power-prop watch: HR/RBI/total bases sensitivity.";
  if (contact >= 82) return "Hit-prop watch: contact and batting-order value.";
  if (discipline >= 82) return "Walk/run-scoring watch: patience and on-base value.";
  return "Team-run contribution only until a stronger prop signal appears.";
}

function pitcherPropSignal(row: PitcherRow) {
  const kbb = score(row.k_bb) ?? 0;
  const stamina = score(row.stamina) ?? 0;
  const risk = score(row.hr_risk) ?? 100;
  if (kbb >= 82 && stamina >= 70) return "Strikeout and outs watch: bat-miss plus usable workload.";
  if (stamina >= 82) return "Outs watch: workload profile is a projection driver.";
  if (risk >= 70) return "Damage-risk warning: HR risk can flip inning/team-total markets.";
  return "Run-prevention contribution only until a stronger prop signal appears.";
}

function buildHitterProfile(row: HitterRow): MlbPlayerProfileCard {
  const m = metrics(row.metrics_json);
  const overall = score(row.overall);
  const roleTier = row.role_tier ?? "UNKNOWN";
  const impact = impactFromOverall(overall, "BATTER");
  const platoon = row.vs_lhp != null && row.vs_rhp != null ? 100 - Math.abs(row.vs_lhp - row.vs_rhp) : null;
  const traits = [
    trait("contact", "Contact", row.contact, "Hit probability and ball-in-play pressure."),
    trait("power", "Power", row.power, "Extra-base, HR, RBI, and team-total sensitivity."),
    trait("discipline", "Discipline", row.discipline, "Walk rate, chase risk, and inning-extension value."),
    trait("platoon", "Platoon stability", platoon, "Lower score means the matchup hand matters more."),
    trait("form", "Current form", row.current_form, "Recent production signal after shrinkage."),
    trait("speed_defense", "Speed/defense", ((score(row.baserunning) ?? 70) + (score(row.fielding) ?? 70)) / 2, "Baserunning and run-prevention support.")
  ];

  const why = [
    `${row.player_name} carries a ${grade(overall).toLowerCase()} batter profile at ${overall ?? "—"}/100.`,
    `Estimated model impact: ${impact.run == null ? "—" : `${impact.run > 0 ? "+" : ""}${impact.run}`} projected team runs and ${impact.winPct == null ? "—" : `${impact.winPct > 0 ? "+" : ""}${impact.winPct}%`} win probability.` ,
    hitterPropSignal(row)
  ];

  return {
    playerId: row.player_id,
    name: row.player_name,
    team: row.team,
    role: "BATTER",
    roleTier,
    season: row.season,
    primaryPosition: row.primary_position,
    handedness: handednessFromMetrics(m),
    source: row.source ?? "unknown",
    snapshotAt: toIso(row.snapshot_at),
    overall,
    confidenceTier: confidenceTier(overall, toIso(row.snapshot_at)),
    traits,
    modelImpact: {
      projectedRunImpact: impact.run,
      winProbabilityImpactPct: impact.winPct,
      propSignal: hitterPropSignal(row),
      simUsage: ["moneyline", "team_total", "first_five", "nrfi_yrfi", "player_props"]
    },
    whyItMatters: why,
    metrics: m,
    href: `/players/${encodeURIComponent(row.player_id)}`
  };
}

function buildPitcherProfile(row: PitcherRow): MlbPlayerProfileCard {
  const m = metrics(row.metrics_json);
  const overall = score(row.overall);
  const roleTier = row.role_tier ?? "UNKNOWN";
  const role = roleForPitcher(roleTier);
  const impact = impactFromOverall(overall, role);
  const damageAvoidance = row.hr_risk == null ? null : 100 - clamp(row.hr_risk);
  const workloadFreshness = row.recent_workload == null ? null : 100 - clamp(row.recent_workload);
  const traits = [
    trait("run_prevention", "Run prevention", ((score(row.xera_quality) ?? 70) + (score(row.fip_quality) ?? 70)) / 2, "xERA/FIP-style quality blended into run prevention."),
    trait("strikeout", "Strikeout grade", row.k_bb, "Bat-miss and K/BB value for pitcher props."),
    trait("damage_avoidance", "Damage avoidance", damageAvoidance, "Inverse of HR risk; lower score means one-swing volatility."),
    trait("groundball", "Groundball profile", row.groundball_rate, "Contact-management and double-play support."),
    trait("stamina", "Stamina", row.stamina, "Pitch count and outs-market support."),
    trait("freshness", "Workload freshness", workloadFreshness, "Fatigue and recent usage adjustment.")
  ];

  const why = [
    `${row.pitcher_name} carries a ${grade(overall).toLowerCase()} ${role.toLowerCase()} profile at ${overall ?? "—"}/100.`,
    `Estimated model impact: ${impact.run == null ? "—" : `${impact.run > 0 ? "+" : ""}${impact.run}`} opponent-run suppression value and ${impact.winPct == null ? "—" : `${impact.winPct > 0 ? "+" : ""}${impact.winPct}%`} win probability swing.` ,
    pitcherPropSignal(row)
  ];

  return {
    playerId: row.pitcher_id,
    name: row.pitcher_name,
    team: row.team,
    role,
    roleTier,
    season: row.season,
    primaryPosition: role === "STARTER" ? "SP" : "P",
    handedness: handednessFromMetrics(m),
    source: row.source ?? "unknown",
    snapshotAt: toIso(row.snapshot_at),
    overall,
    confidenceTier: confidenceTier(overall, toIso(row.snapshot_at)),
    traits,
    modelImpact: {
      projectedRunImpact: impact.run,
      winProbabilityImpactPct: impact.winPct,
      propSignal: pitcherPropSignal(row),
      simUsage: ["moneyline", "first_five", "team_total_allowed", "pitcher_strikeouts", "pitcher_outs", "nrfi_yrfi"]
    },
    whyItMatters: why,
    metrics: m,
    href: `/players/${encodeURIComponent(row.pitcher_id)}`
  };
}

function matches(profile: MlbPlayerProfileCard, filters: PlayerProfileFilters) {
  const q = filters.q?.trim().toLowerCase();
  const team = filters.team?.trim().toLowerCase();
  const role = filters.role?.trim().toUpperCase();
  if (q && !`${profile.name} ${profile.playerId} ${profile.team}`.toLowerCase().includes(q)) return false;
  if (team && profile.team.toLowerCase() !== team) return false;
  if (role && profile.role !== role && profile.roleTier !== role) return false;
  return true;
}

export async function getMlbPlayerProfiles(filters: PlayerProfileFilters = {}): Promise<MlbPlayerProfilesResponse> {
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: false, generatedAt: new Date().toISOString(), count: 0, profiles: [], warnings: ["No usable server database URL is configured."] };
  }

  try {
    await ensureMlbRosterIntelligenceTables();
    const [hitters, pitchers] = await Promise.all([
      prisma.$queryRaw<HitterRow[]>`
        SELECT DISTINCT ON (player_id)
          player_id, player_name, team, season, primary_position, role_tier,
          contact, power, discipline, vs_lhp, vs_rhp, baserunning, fielding, current_form,
          overall, metrics_json, source, snapshot_at
        FROM mlb_player_ratings
        ORDER BY player_id, snapshot_at DESC
        LIMIT 750;
      `,
      prisma.$queryRaw<PitcherRow[]>`
        SELECT DISTINCT ON (pitcher_id)
          pitcher_id, pitcher_name, team, season, role_tier,
          xera_quality, fip_quality, k_bb, hr_risk, groundball_rate, platoon_split,
          stamina, recent_workload, arsenal_quality, overall, metrics_json, source, snapshot_at
        FROM mlb_pitcher_ratings
        ORDER BY pitcher_id, snapshot_at DESC
        LIMIT 750;
      `
    ]);

    const limit = Math.max(1, Math.min(250, Math.round(filters.limit ?? 80)));
    const profiles = [...hitters.map(buildHitterProfile), ...pitchers.map(buildPitcherProfile)]
      .filter((profile) => matches(profile, filters))
      .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0) || a.name.localeCompare(b.name))
      .slice(0, limit);

    const warnings = profiles.length ? [] : ["No player profile rows matched the current filters."];
    return { ok: true, generatedAt: new Date().toISOString(), count: profiles.length, profiles, warnings };
  } catch (error) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      count: 0,
      profiles: [],
      warnings: [error instanceof Error ? error.message : "Unknown MLB player profile error."]
    };
  }
}

export async function getMlbPlayerProfile(playerId: string) {
  const response = await getMlbPlayerProfiles({ limit: 250 });
  return response.profiles.find((profile) => profile.playerId === playerId) ?? null;
}
