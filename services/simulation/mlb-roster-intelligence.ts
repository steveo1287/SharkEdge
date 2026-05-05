import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

export type MlbHitterRoleTier = "STAR" | "STARTER" | "ROLE_PLAYER" | "BENCH" | "REPLACEMENT";
export type MlbPitcherRoleTier = "ACE" | "TOP_ROTATION" | "MID_ROTATION" | "BACK_END" | "OPENER_BULK" | "CLOSER" | "SETUP" | "MIDDLE_RELIEF" | "LONG_RELIEF" | "MOP_UP";

export type MlbHitterSkillInput = {
  contact: number;
  power: number;
  discipline: number;
  vsLhp: number;
  vsRhp: number;
  baserunning: number;
  fielding: number;
  currentForm: number;
};

export type MlbPitcherSkillInput = {
  xeraQuality: number;
  fipQuality: number;
  kBb: number;
  hrRisk: number;
  groundballRate: number;
  platoonSplit: number;
  stamina: number;
  recentWorkload: number;
  arsenalQuality: number;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

export function calculateMlbHitterOverall(input: MlbHitterSkillInput) {
  const splitStrength = (clamp(input.vsLhp) + clamp(input.vsRhp)) / 2;
  return round(
    clamp(input.contact) * 0.2 +
    clamp(input.power) * 0.22 +
    clamp(input.discipline) * 0.15 +
    splitStrength * 0.16 +
    clamp(input.baserunning) * 0.07 +
    clamp(input.fielding) * 0.08 +
    clamp(input.currentForm) * 0.12
  );
}

export function classifyMlbHitterRole(overall: number): MlbHitterRoleTier {
  if (overall >= 84) return "STAR";
  if (overall >= 72) return "STARTER";
  if (overall >= 62) return "ROLE_PLAYER";
  if (overall >= 52) return "BENCH";
  return "REPLACEMENT";
}

export function calculateMlbPitcherOverall(input: MlbPitcherSkillInput) {
  const runPrevention = clamp(input.xeraQuality) * 0.27 + clamp(input.fipQuality) * 0.2;
  const batMiss = clamp(input.kBb) * 0.16 + clamp(input.arsenalQuality) * 0.14;
  const damageControl = (100 - clamp(input.hrRisk)) * 0.09 + clamp(input.groundballRate) * 0.06;
  const usage = clamp(input.stamina) * 0.06 + (100 - clamp(input.recentWorkload)) * 0.04;
  const matchup = clamp(input.platoonSplit) * 0.08;
  return round(runPrevention + batMiss + damageControl + usage + matchup);
}

export function classifyMlbStarterRole(overall: number): MlbPitcherRoleTier {
  if (overall >= 86) return "ACE";
  if (overall >= 76) return "TOP_ROTATION";
  if (overall >= 66) return "MID_ROTATION";
  if (overall >= 54) return "BACK_END";
  return "OPENER_BULK";
}

export function classifyMlbReliefRole(overall: number, leverageScore: number): MlbPitcherRoleTier {
  if (overall >= 82 && leverageScore >= 80) return "CLOSER";
  if (overall >= 74 && leverageScore >= 68) return "SETUP";
  if (overall >= 62) return "MIDDLE_RELIEF";
  if (overall >= 52) return "LONG_RELIEF";
  return "MOP_UP";
}

export async function ensureMlbRosterIntelligenceTables() {
  if (!hasUsableServerDatabaseUrl()) return false;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mlb_player_ratings (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      team TEXT NOT NULL,
      season INTEGER NOT NULL,
      primary_position TEXT,
      role_tier TEXT NOT NULL DEFAULT 'UNKNOWN',
      contact DOUBLE PRECISION,
      power DOUBLE PRECISION,
      discipline DOUBLE PRECISION,
      vs_lhp DOUBLE PRECISION,
      vs_rhp DOUBLE PRECISION,
      baserunning DOUBLE PRECISION,
      fielding DOUBLE PRECISION,
      current_form DOUBLE PRECISION,
      overall DOUBLE PRECISION,
      metrics_json JSONB,
      source TEXT NOT NULL DEFAULT 'manual',
      snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mlb_pitcher_ratings (
      id TEXT PRIMARY KEY,
      pitcher_id TEXT NOT NULL,
      pitcher_name TEXT NOT NULL,
      team TEXT NOT NULL,
      season INTEGER NOT NULL,
      role_tier TEXT NOT NULL DEFAULT 'UNKNOWN',
      xera_quality DOUBLE PRECISION,
      fip_quality DOUBLE PRECISION,
      k_bb DOUBLE PRECISION,
      hr_risk DOUBLE PRECISION,
      groundball_rate DOUBLE PRECISION,
      platoon_split DOUBLE PRECISION,
      stamina DOUBLE PRECISION,
      recent_workload DOUBLE PRECISION,
      arsenal_quality DOUBLE PRECISION,
      overall DOUBLE PRECISION,
      metrics_json JSONB,
      source TEXT NOT NULL DEFAULT 'manual',
      snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mlb_lineup_snapshots (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      team TEXT NOT NULL,
      confirmed BOOLEAN NOT NULL DEFAULT FALSE,
      batting_order_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      bench_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      starting_pitcher_id TEXT,
      starting_pitcher_name TEXT,
      available_relievers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      unavailable_relievers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      injuries_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      source TEXT NOT NULL DEFAULT 'manual',
      captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mlb_player_ratings_team_season_idx ON mlb_player_ratings (team, season, snapshot_at DESC);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mlb_pitcher_ratings_team_season_idx ON mlb_pitcher_ratings (team, season, snapshot_at DESC);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mlb_lineup_snapshots_game_idx ON mlb_lineup_snapshots (game_id, team, captured_at DESC);`);
  return true;
}

function normalizeCount(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

export async function getMlbRosterIntelligenceSummary() {
  const databaseReady = await ensureMlbRosterIntelligenceTables();
  if (!databaseReady) return { ok: false, databaseReady, error: "No usable server database URL is configured." };

  const [hitterTotals, pitcherTotals, lineupTotals, hitterRoles, pitcherRoles] = await Promise.all([
    prisma.$queryRaw<Array<{ total: bigint; teams: bigint }>>`SELECT COUNT(*)::bigint AS total, COUNT(DISTINCT team)::bigint AS teams FROM mlb_player_ratings;`,
    prisma.$queryRaw<Array<{ total: bigint; teams: bigint }>>`SELECT COUNT(*)::bigint AS total, COUNT(DISTINCT team)::bigint AS teams FROM mlb_pitcher_ratings;`,
    prisma.$queryRaw<Array<{ total: bigint; confirmed: bigint }>>`SELECT COUNT(*)::bigint AS total, SUM(CASE WHEN confirmed THEN 1 ELSE 0 END)::bigint AS confirmed FROM mlb_lineup_snapshots;`,
    prisma.$queryRaw<Array<{ role_tier: string; count: bigint; avg_overall: number | null }>>`
      SELECT role_tier, COUNT(*)::bigint AS count, AVG(overall) AS avg_overall
      FROM mlb_player_ratings
      GROUP BY role_tier
      ORDER BY count DESC;
    `,
    prisma.$queryRaw<Array<{ role_tier: string; count: bigint; avg_overall: number | null }>>`
      SELECT role_tier, COUNT(*)::bigint AS count, AVG(overall) AS avg_overall
      FROM mlb_pitcher_ratings
      GROUP BY role_tier
      ORDER BY count DESC;
    `
  ]);

  return {
    ok: true,
    databaseReady,
    hitters: {
      total: normalizeCount(hitterTotals[0]?.total),
      teams: normalizeCount(hitterTotals[0]?.teams),
      roles: hitterRoles.map((row) => ({ role: row.role_tier, count: normalizeCount(row.count), avgOverall: row.avg_overall == null ? null : round(row.avg_overall) }))
    },
    pitchers: {
      total: normalizeCount(pitcherTotals[0]?.total),
      teams: normalizeCount(pitcherTotals[0]?.teams),
      roles: pitcherRoles.map((row) => ({ role: row.role_tier, count: normalizeCount(row.count), avgOverall: row.avg_overall == null ? null : round(row.avg_overall) }))
    },
    lineupSnapshots: {
      total: normalizeCount(lineupTotals[0]?.total),
      confirmed: normalizeCount(lineupTotals[0]?.confirmed)
    },
    targetSchema: {
      hitters: ["contact", "power", "discipline", "vs_lhp", "vs_rhp", "baserunning", "fielding", "current_form", "overall", "role_tier"],
      pitchers: ["xera_quality", "fip_quality", "k_bb", "hr_risk", "groundball_rate", "platoon_split", "stamina", "recent_workload", "arsenal_quality", "overall", "role_tier"],
      lineups: ["batting_order_json", "bench_json", "starting_pitcher_id", "available_relievers_json", "unavailable_relievers_json", "injuries_json", "confirmed"]
    }
  };
}
