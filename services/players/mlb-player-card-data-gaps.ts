import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbRosterIntelligenceTables } from "@/services/simulation/mlb-roster-intelligence";

export type MlbPlayerCardGapSeverity = "BLOCKER" | "HIGH" | "MEDIUM" | "LOW";

export type MlbPlayerCardTeamGap = {
  team: string;
  hitters: number;
  starters: number;
  relievers: number;
  total: number;
  latestSnapshotAt: string | null;
  staleDays: number | null;
  severity: MlbPlayerCardGapSeverity;
  issues: string[];
};

export type MlbPlayerCardTraitGap = {
  team: string;
  playerId: string;
  playerName: string;
  role: "BATTER" | "PITCHER";
  roleTier: string | null;
  missingTraits: string[];
  thinTraits: string[];
  snapshotAt: string | null;
};

export type MlbPlayerCardDataGapReport = {
  ok: boolean;
  generatedAt: string;
  teams: MlbPlayerCardTeamGap[];
  traitGaps: MlbPlayerCardTraitGap[];
  summary: {
    teamCount: number;
    blockerTeams: number;
    highTeams: number;
    mediumTeams: number;
    lowTeams: number;
    traitGapRows: number;
    teamsWithNoHitters: number;
    teamsWithNoStarters: number;
    teamsWithThinBullpen: number;
    staleTeams: number;
  };
  actionPlan: Array<{ priority: number; label: string; detail: string }>;
  warnings: string[];
};

type HitterTeamRow = {
  team: string;
  hitters: bigint | number | string;
  latest_snapshot_at: Date | string | null;
};

type PitcherTeamRow = {
  team: string;
  starters: bigint | number | string;
  relievers: bigint | number | string;
  latest_snapshot_at: Date | string | null;
};

type HitterTraitRow = {
  team: string;
  player_id: string;
  player_name: string;
  role_tier: string | null;
  contact: number | null;
  power: number | null;
  discipline: number | null;
  vs_lhp: number | null;
  vs_rhp: number | null;
  baserunning: number | null;
  fielding: number | null;
  current_form: number | null;
  snapshot_at: Date | string | null;
};

type PitcherTraitRow = {
  team: string;
  pitcher_id: string;
  pitcher_name: string;
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
  snapshot_at: Date | string | null;
};

const STARTER_ROLES = new Set(["ACE", "TOP_ROTATION", "MID_ROTATION", "BACK_END", "OPENER_BULK"]);
const RELIEF_ROLES = new Set(["CLOSER", "SETUP", "MIDDLE_RELIEF", "LONG_RELIEF", "MOP_UP"]);

function toNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function staleDays(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

function severityFor(issues: string[]): MlbPlayerCardGapSeverity {
  if (issues.some((issue) => /no hitter|no starter/i.test(issue))) return "BLOCKER";
  if (issues.some((issue) => /thin bullpen|stale/i.test(issue))) return "HIGH";
  if (issues.length >= 2) return "MEDIUM";
  return issues.length ? "LOW" : "LOW";
}

function traitMissing(row: Record<string, unknown>, keys: string[]) {
  return keys.filter((key) => row[key] == null || (typeof row[key] === "number" && !Number.isFinite(row[key] as number)));
}

function traitThin(row: Record<string, unknown>, keys: string[]) {
  return keys.filter((key) => typeof row[key] === "number" && Number.isFinite(row[key] as number) && (row[key] as number) < 55);
}

async function teamRows() {
  const [hitterRows, pitcherRows] = await Promise.all([
    prisma.$queryRaw<HitterTeamRow[]>`
      WITH latest AS (
        SELECT DISTINCT ON (player_id) player_id, team, snapshot_at
        FROM mlb_player_ratings
        ORDER BY player_id, snapshot_at DESC
      )
      SELECT team, COUNT(*)::bigint AS hitters, MAX(snapshot_at) AS latest_snapshot_at
      FROM latest
      GROUP BY team;
    `,
    prisma.$queryRaw<PitcherTeamRow[]>`
      WITH latest AS (
        SELECT DISTINCT ON (pitcher_id) pitcher_id, team, role_tier, snapshot_at
        FROM mlb_pitcher_ratings
        ORDER BY pitcher_id, snapshot_at DESC
      )
      SELECT
        team,
        COUNT(*) FILTER (WHERE role_tier IN ('ACE','TOP_ROTATION','MID_ROTATION','BACK_END','OPENER_BULK'))::bigint AS starters,
        COUNT(*) FILTER (WHERE role_tier IN ('CLOSER','SETUP','MIDDLE_RELIEF','LONG_RELIEF','MOP_UP'))::bigint AS relievers,
        MAX(snapshot_at) AS latest_snapshot_at
      FROM latest
      GROUP BY team;
    `
  ]);

  const teams = new Map<string, { hitters: number; starters: number; relievers: number; latest: Date | string | null }>();
  for (const row of hitterRows) {
    teams.set(row.team, { hitters: toNumber(row.hitters), starters: 0, relievers: 0, latest: row.latest_snapshot_at });
  }
  for (const row of pitcherRows) {
    const current = teams.get(row.team) ?? { hitters: 0, starters: 0, relievers: 0, latest: null };
    const hitterLatest = current.latest ? new Date(current.latest).getTime() : 0;
    const pitcherLatest = row.latest_snapshot_at ? new Date(row.latest_snapshot_at).getTime() : 0;
    teams.set(row.team, {
      hitters: current.hitters,
      starters: toNumber(row.starters),
      relievers: toNumber(row.relievers),
      latest: pitcherLatest > hitterLatest ? row.latest_snapshot_at : current.latest
    });
  }

  return Array.from(teams.entries()).map(([team, row]) => {
    const issues: string[] = [];
    if (row.hitters === 0) issues.push("No hitter cards loaded.");
    if (row.hitters > 0 && row.hitters < 9) issues.push("Hitter coverage below full lineup.");
    if (row.starters === 0) issues.push("No starter cards loaded.");
    if (row.relievers < 4) issues.push("Thin bullpen card coverage.");
    const age = staleDays(row.latest);
    if (age == null) issues.push("No snapshot timestamp.");
    if (age != null && age > 14) issues.push(`Stale player snapshot: ${age} days old.`);
    return {
      team,
      hitters: row.hitters,
      starters: row.starters,
      relievers: row.relievers,
      total: row.hitters + row.starters + row.relievers,
      latestSnapshotAt: toIso(row.latest),
      staleDays: age,
      severity: severityFor(issues),
      issues
    } satisfies MlbPlayerCardTeamGap;
  }).sort((a, b) => {
    const order = { BLOCKER: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } satisfies Record<MlbPlayerCardGapSeverity, number>;
    return order[a.severity] - order[b.severity] || a.team.localeCompare(b.team);
  });
}

async function traitGapRows() {
  const [hitters, pitchers] = await Promise.all([
    prisma.$queryRaw<HitterTraitRow[]>`
      SELECT DISTINCT ON (player_id)
        team, player_id, player_name, role_tier, contact, power, discipline, vs_lhp, vs_rhp,
        baserunning, fielding, current_form, snapshot_at
      FROM mlb_player_ratings
      ORDER BY player_id, snapshot_at DESC;
    `,
    prisma.$queryRaw<PitcherTraitRow[]>`
      SELECT DISTINCT ON (pitcher_id)
        team, pitcher_id, pitcher_name, role_tier, xera_quality, fip_quality, k_bb, hr_risk,
        groundball_rate, platoon_split, stamina, recent_workload, arsenal_quality, snapshot_at
      FROM mlb_pitcher_ratings
      ORDER BY pitcher_id, snapshot_at DESC;
    `
  ]);

  const hitterKeys = ["contact", "power", "discipline", "vs_lhp", "vs_rhp", "baserunning", "fielding", "current_form"];
  const pitcherKeys = ["xera_quality", "fip_quality", "k_bb", "hr_risk", "groundball_rate", "platoon_split", "stamina", "recent_workload", "arsenal_quality"];
  const hitterGaps = hitters.map((row) => {
    const record = row as unknown as Record<string, unknown>;
    return {
      team: row.team,
      playerId: row.player_id,
      playerName: row.player_name,
      role: "BATTER" as const,
      roleTier: row.role_tier,
      missingTraits: traitMissing(record, hitterKeys),
      thinTraits: traitThin(record, hitterKeys),
      snapshotAt: toIso(row.snapshot_at)
    };
  });
  const pitcherGaps = pitchers.map((row) => {
    const record = row as unknown as Record<string, unknown>;
    return {
      team: row.team,
      playerId: row.pitcher_id,
      playerName: row.pitcher_name,
      role: "PITCHER" as const,
      roleTier: row.role_tier,
      missingTraits: traitMissing(record, pitcherKeys),
      thinTraits: traitThin(record, pitcherKeys),
      snapshotAt: toIso(row.snapshot_at)
    };
  });

  return [...hitterGaps, ...pitcherGaps]
    .filter((row) => row.missingTraits.length || row.thinTraits.length)
    .sort((a, b) => b.missingTraits.length - a.missingTraits.length || b.thinTraits.length - a.thinTraits.length || a.team.localeCompare(b.team))
    .slice(0, 100);
}

function actionPlan(teams: MlbPlayerCardTeamGap[], traits: MlbPlayerCardTraitGap[]) {
  const plan: Array<{ priority: number; label: string; detail: string }> = [];
  const noHitters = teams.filter((team) => team.hitters === 0).map((team) => team.team);
  const noStarters = teams.filter((team) => team.starters === 0).map((team) => team.team);
  const thinBullpens = teams.filter((team) => team.relievers < 4).map((team) => team.team);
  const stale = teams.filter((team) => (team.staleDays ?? 0) > 14).map((team) => team.team);
  if (noHitters.length) plan.push({ priority: 1, label: "Backfill hitter cards", detail: `No hitter cards: ${noHitters.slice(0, 8).join(", ")}${noHitters.length > 8 ? "…" : ""}.` });
  if (noStarters.length) plan.push({ priority: 2, label: "Backfill starter cards", detail: `No starter cards: ${noStarters.slice(0, 8).join(", ")}${noStarters.length > 8 ? "…" : ""}.` });
  if (thinBullpens.length) plan.push({ priority: 3, label: "Improve bullpen coverage", detail: `Thin bullpen teams: ${thinBullpens.slice(0, 8).join(", ")}${thinBullpens.length > 8 ? "…" : ""}.` });
  if (stale.length) plan.push({ priority: 4, label: "Refresh stale snapshots", detail: `Stale teams: ${stale.slice(0, 8).join(", ")}${stale.length > 8 ? "…" : ""}.` });
  if (traits.length) plan.push({ priority: 5, label: "Patch trait gaps", detail: `${traits.length} player rows have missing or thin traits. Start with rows at the top of the trait gap table.` });
  return plan.sort((a, b) => a.priority - b.priority).slice(0, 8);
}

export async function getMlbPlayerCardDataGaps(): Promise<MlbPlayerCardDataGapReport> {
  if (!hasUsableServerDatabaseUrl()) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      teams: [],
      traitGaps: [],
      summary: { teamCount: 0, blockerTeams: 0, highTeams: 0, mediumTeams: 0, lowTeams: 0, traitGapRows: 0, teamsWithNoHitters: 0, teamsWithNoStarters: 0, teamsWithThinBullpen: 0, staleTeams: 0 },
      actionPlan: [],
      warnings: ["No usable server database URL is configured."]
    };
  }

  try {
    await ensureMlbRosterIntelligenceTables();
    const [teams, traitGaps] = await Promise.all([teamRows(), traitGapRows()]);
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      teams,
      traitGaps,
      summary: {
        teamCount: teams.length,
        blockerTeams: teams.filter((team) => team.severity === "BLOCKER").length,
        highTeams: teams.filter((team) => team.severity === "HIGH").length,
        mediumTeams: teams.filter((team) => team.severity === "MEDIUM").length,
        lowTeams: teams.filter((team) => team.severity === "LOW").length,
        traitGapRows: traitGaps.length,
        teamsWithNoHitters: teams.filter((team) => team.hitters === 0).length,
        teamsWithNoStarters: teams.filter((team) => team.starters === 0).length,
        teamsWithThinBullpen: teams.filter((team) => team.relievers < 4).length,
        staleTeams: teams.filter((team) => (team.staleDays ?? 0) > 14).length
      },
      actionPlan: actionPlan(teams, traitGaps),
      warnings: teams.length ? [] : ["No teams found in MLB player-card source tables."]
    };
  } catch (error) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      teams: [],
      traitGaps: [],
      summary: { teamCount: 0, blockerTeams: 0, highTeams: 0, mediumTeams: 0, lowTeams: 0, traitGapRows: 0, teamsWithNoHitters: 0, teamsWithNoStarters: 0, teamsWithThinBullpen: 0, staleTeams: 0 },
      actionPlan: [],
      warnings: [error instanceof Error ? error.message : "Unknown player-card data gap error."]
    };
  }
}
