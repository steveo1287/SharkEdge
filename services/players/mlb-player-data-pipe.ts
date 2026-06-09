import { randomUUID } from "node:crypto";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import {
  calculateMlbHitterOverall,
  calculateMlbPitcherOverall,
  classifyMlbHitterRole,
  classifyMlbReliefRole,
  classifyMlbStarterRole,
  ensureMlbRosterIntelligenceTables
} from "@/services/simulation/mlb-roster-intelligence";

export type MlbBatterStatInput = {
  playerId: string;
  playerName: string;
  team: string;
  season: number;
  snapshotDate?: string | null;
  primaryPosition?: string | null;
  bats?: string | null;
  throws?: string | null;
  plateAppearances?: number | null;
  avg?: number | null;
  obp?: number | null;
  slg?: number | null;
  iso?: number | null;
  woba?: number | null;
  xwoba?: number | null;
  kRate?: number | null;
  bbRate?: number | null;
  hardHitRate?: number | null;
  barrelRate?: number | null;
  vsLhpOps?: number | null;
  vsRhpOps?: number | null;
  sprintSpeed?: number | null;
  defensiveValue?: number | null;
  recentWoba?: number | null;
  recentOps?: number | null;
  source?: string | null;
  raw?: Record<string, unknown> | null;
};

export type MlbPitcherStatInput = {
  pitcherId: string;
  pitcherName: string;
  team: string;
  season: number;
  snapshotDate?: string | null;
  throws?: string | null;
  innings?: number | null;
  starts?: number | null;
  reliefAppearances?: number | null;
  era?: number | null;
  xera?: number | null;
  fip?: number | null;
  xfip?: number | null;
  kRate?: number | null;
  bbRate?: number | null;
  kMinusBbRate?: number | null;
  hrPer9?: number | null;
  groundBallRate?: number | null;
  pitchCountAvg?: number | null;
  recentWorkload?: number | null;
  velocity?: number | null;
  stuffPlus?: number | null;
  source?: string | null;
  raw?: Record<string, unknown> | null;
};

export type MlbPlayerDataPipePayload = {
  source?: string | null;
  capturedAt?: string | null;
  batters?: MlbBatterStatInput[];
  pitchers?: MlbPitcherStatInput[];
};

export type MlbPlayerDataPipeResult = {
  ok: boolean;
  generatedAt: string;
  source: string;
  capturedAt: string;
  inserted: { batters: number; pitchers: number; identities: number; ratings: number };
  warnings: string[];
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function n(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function pct(value: unknown) {
  const num = n(value);
  if (num == null) return null;
  return num <= 1 ? num * 100 : num;
}

function scale(value: unknown, low: number, high: number, invert = false, fallback = 70) {
  const num = n(value);
  if (num == null || high === low) return fallback;
  const raw = ((num - low) / (high - low)) * 100;
  return clamp(invert ? 100 - raw : raw);
}

function avg(values: number[]) {
  if (!values.length) return 70;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dateKey(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function iso(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function sourceName(input: string | null | undefined) {
  return input?.trim() || "player-data-pipe";
}

export async function ensureMlbPlayerDataPipeTables() {
  if (!hasUsableServerDatabaseUrl()) return false;
  await ensureMlbRosterIntelligenceTables();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mlb_player_identity (
      id TEXT PRIMARY KEY,
      mlbam_id TEXT,
      fangraphs_id TEXT,
      baseball_savant_id TEXT,
      retrosheet_id TEXT,
      player_name TEXT NOT NULL,
      team TEXT,
      primary_position TEXT,
      bats TEXT,
      throws TEXT,
      source TEXT NOT NULL DEFAULT 'player-data-pipe',
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mlb_player_identity_aliases (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'player-data-pipe',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(player_id, alias)
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mlb_batter_stat_snapshots (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      team TEXT NOT NULL,
      season INTEGER NOT NULL,
      snapshot_date DATE NOT NULL,
      stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      source TEXT NOT NULL DEFAULT 'player-data-pipe',
      captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(player_id, season, snapshot_date, source)
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mlb_pitcher_stat_snapshots (
      id TEXT PRIMARY KEY,
      pitcher_id TEXT NOT NULL,
      pitcher_name TEXT NOT NULL,
      team TEXT NOT NULL,
      season INTEGER NOT NULL,
      snapshot_date DATE NOT NULL,
      stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      source TEXT NOT NULL DEFAULT 'player-data-pipe',
      captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(pitcher_id, season, snapshot_date, source)
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mlb_batter_stat_snapshots_player_idx ON mlb_batter_stat_snapshots (player_id, snapshot_date DESC);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mlb_pitcher_stat_snapshots_pitcher_idx ON mlb_pitcher_stat_snapshots (pitcher_id, snapshot_date DESC);`);
  return true;
}

function hitterSkills(row: MlbBatterStatInput) {
  const contact = avg([scale(row.avg, 0.19, 0.34), scale(row.kRate == null ? null : pct(row.kRate), 34, 12), scale(row.xwoba ?? row.woba, 0.28, 0.43)]);
  const power = avg([scale(row.iso, 0.08, 0.32), scale(row.slg, 0.33, 0.62), scale(row.barrelRate == null ? null : pct(row.barrelRate), 2, 18), scale(row.hardHitRate == null ? null : pct(row.hardHitRate), 28, 58)]);
  const discipline = avg([scale(row.obp, 0.28, 0.43), scale(row.bbRate == null ? null : pct(row.bbRate), 4, 16), scale(row.kRate == null ? null : pct(row.kRate), 32, 12)]);
  const vsLhp = scale(row.vsLhpOps, 0.55, 1.05, false, avg([contact, power]));
  const vsRhp = scale(row.vsRhpOps, 0.55, 1.05, false, avg([contact, power]));
  const baserunning = scale(row.sprintSpeed, 23, 31, false, 70);
  const fielding = scale(row.defensiveValue, -10, 15, false, 70);
  const currentForm = avg([scale(row.recentWoba ?? row.woba, 0.27, 0.45), scale(row.recentOps, 0.58, 1.05, false, 70)]);
  const input = { contact, power, discipline, vsLhp, vsRhp, baserunning, fielding, currentForm };
  const overall = calculateMlbHitterOverall(input);
  return { ...input, overall, roleTier: classifyMlbHitterRole(overall) };
}

function pitcherSkills(row: MlbPitcherStatInput) {
  const xeraQuality = scale(row.xera ?? row.era, 5.4, 2.2, true);
  const fipQuality = scale(row.fip ?? row.xfip, 5.2, 2.4, true);
  const kBb = avg([scale(row.kMinusBbRate == null ? null : pct(row.kMinusBbRate), 4, 28), scale(row.kRate == null ? null : pct(row.kRate), 14, 36), scale(row.bbRate == null ? null : pct(row.bbRate), 13, 4)]);
  const hrRisk = scale(row.hrPer9, 0.4, 2.1, false, 42);
  const groundballRate = scale(row.groundBallRate == null ? null : pct(row.groundBallRate), 32, 58);
  const platoonSplit = 70;
  const stamina = avg([scale(row.innings, 20, 180), scale(row.pitchCountAvg, 45, 102), scale(row.starts, 0, 28)]);
  const recentWorkload = scale(row.recentWorkload, 0, 110, false, 35);
  const arsenalQuality = avg([scale(row.velocity, 89, 99), scale(row.stuffPlus, 85, 125)]);
  const input = { xeraQuality, fipQuality, kBb, hrRisk, groundballRate, platoonSplit, stamina, recentWorkload, arsenalQuality };
  const overall = calculateMlbPitcherOverall(input);
  const isStarter = (row.starts ?? 0) >= Math.max(1, (row.reliefAppearances ?? 0) * 0.35) || (row.pitchCountAvg ?? 0) >= 68;
  const roleTier = isStarter ? classifyMlbStarterRole(overall) : classifyMlbReliefRole(overall, clamp((row.recentWorkload ?? 25) + arsenalQuality * 0.55));
  return { ...input, overall, roleTier };
}

async function upsertIdentity(args: { id: string; name: string; team: string; position?: string | null; bats?: string | null; throws?: string | null; source: string }) {
  await prisma.$executeRaw`
    INSERT INTO mlb_player_identity (id, mlbam_id, player_name, team, primary_position, bats, throws, source, updated_at)
    VALUES (${args.id}, ${args.id}, ${args.name}, ${args.team}, ${args.position ?? null}, ${args.bats ?? null}, ${args.throws ?? null}, ${args.source}, now())
    ON CONFLICT (id) DO UPDATE SET
      player_name = EXCLUDED.player_name,
      team = EXCLUDED.team,
      primary_position = COALESCE(EXCLUDED.primary_position, mlb_player_identity.primary_position),
      bats = COALESCE(EXCLUDED.bats, mlb_player_identity.bats),
      throws = COALESCE(EXCLUDED.throws, mlb_player_identity.throws),
      source = EXCLUDED.source,
      updated_at = now();
  `;
  await prisma.$executeRaw`
    INSERT INTO mlb_player_identity_aliases (id, player_id, alias, source)
    VALUES (${randomUUID()}, ${args.id}, ${args.name}, ${args.source})
    ON CONFLICT (player_id, alias) DO NOTHING;
  `;
}

export async function ingestMlbPlayerDataPipe(payload: MlbPlayerDataPipePayload): Promise<MlbPlayerDataPipeResult> {
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: false, generatedAt: new Date().toISOString(), source: sourceName(payload.source), capturedAt: iso(payload.capturedAt), inserted: { batters: 0, pitchers: 0, identities: 0, ratings: 0 }, warnings: ["No usable server database URL is configured."] };
  }
  await ensureMlbPlayerDataPipeTables();
  const source = sourceName(payload.source);
  const capturedAt = iso(payload.capturedAt);
  let identities = 0;
  let ratings = 0;

  for (const batter of payload.batters ?? []) {
    const snapshotDate = dateKey(batter.snapshotDate ?? payload.capturedAt);
    await upsertIdentity({ id: batter.playerId, name: batter.playerName, team: batter.team, position: batter.primaryPosition, bats: batter.bats, throws: batter.throws, source });
    identities += 1;
    await prisma.$executeRaw`
      INSERT INTO mlb_batter_stat_snapshots (id, player_id, player_name, team, season, snapshot_date, stats_json, source, captured_at)
      VALUES (${randomUUID()}, ${batter.playerId}, ${batter.playerName}, ${batter.team}, ${batter.season}, ${snapshotDate}::date, ${JSON.stringify(batter)}::jsonb, ${source}, ${capturedAt}::timestamptz)
      ON CONFLICT (player_id, season, snapshot_date, source) DO UPDATE SET
        player_name = EXCLUDED.player_name, team = EXCLUDED.team, stats_json = EXCLUDED.stats_json, captured_at = EXCLUDED.captured_at;
    `;
    const skills = hitterSkills(batter);
    await prisma.$executeRaw`
      INSERT INTO mlb_player_ratings (id, player_id, player_name, team, season, primary_position, role_tier, contact, power, discipline, vs_lhp, vs_rhp, baserunning, fielding, current_form, overall, metrics_json, source, snapshot_at, updated_at)
      VALUES (${`pipe-hitter-${batter.playerId}-${batter.season}-${snapshotDate}-${source}`}, ${batter.playerId}, ${batter.playerName}, ${batter.team}, ${batter.season}, ${batter.primaryPosition ?? null}, ${skills.roleTier}, ${skills.contact}, ${skills.power}, ${skills.discipline}, ${skills.vsLhp}, ${skills.vsRhp}, ${skills.baserunning}, ${skills.fielding}, ${skills.currentForm}, ${skills.overall}, ${JSON.stringify({ ...batter.raw, bats: batter.bats, throws: batter.throws, sourceStatPipe: source })}::jsonb, ${source}, ${capturedAt}::timestamptz, now())
      ON CONFLICT (id) DO UPDATE SET contact = EXCLUDED.contact, power = EXCLUDED.power, discipline = EXCLUDED.discipline, vs_lhp = EXCLUDED.vs_lhp, vs_rhp = EXCLUDED.vs_rhp, baserunning = EXCLUDED.baserunning, fielding = EXCLUDED.fielding, current_form = EXCLUDED.current_form, overall = EXCLUDED.overall, metrics_json = EXCLUDED.metrics_json, updated_at = now();
    `;
    ratings += 1;
  }

  for (const pitcher of payload.pitchers ?? []) {
    const snapshotDate = dateKey(pitcher.snapshotDate ?? payload.capturedAt);
    await upsertIdentity({ id: pitcher.pitcherId, name: pitcher.pitcherName, team: pitcher.team, position: "P", throws: pitcher.throws, source });
    identities += 1;
    await prisma.$executeRaw`
      INSERT INTO mlb_pitcher_stat_snapshots (id, pitcher_id, pitcher_name, team, season, snapshot_date, stats_json, source, captured_at)
      VALUES (${randomUUID()}, ${pitcher.pitcherId}, ${pitcher.pitcherName}, ${pitcher.team}, ${pitcher.season}, ${snapshotDate}::date, ${JSON.stringify(pitcher)}::jsonb, ${source}, ${capturedAt}::timestamptz)
      ON CONFLICT (pitcher_id, season, snapshot_date, source) DO UPDATE SET
        pitcher_name = EXCLUDED.pitcher_name, team = EXCLUDED.team, stats_json = EXCLUDED.stats_json, captured_at = EXCLUDED.captured_at;
    `;
    const skills = pitcherSkills(pitcher);
    await prisma.$executeRaw`
      INSERT INTO mlb_pitcher_ratings (id, pitcher_id, pitcher_name, team, season, role_tier, xera_quality, fip_quality, k_bb, hr_risk, groundball_rate, platoon_split, stamina, recent_workload, arsenal_quality, overall, metrics_json, source, snapshot_at, updated_at)
      VALUES (${`pipe-pitcher-${pitcher.pitcherId}-${pitcher.season}-${snapshotDate}-${source}`}, ${pitcher.pitcherId}, ${pitcher.pitcherName}, ${pitcher.team}, ${pitcher.season}, ${skills.roleTier}, ${skills.xeraQuality}, ${skills.fipQuality}, ${skills.kBb}, ${skills.hrRisk}, ${skills.groundballRate}, ${skills.platoonSplit}, ${skills.stamina}, ${skills.recentWorkload}, ${skills.arsenalQuality}, ${skills.overall}, ${JSON.stringify({ ...pitcher.raw, throws: pitcher.throws, sourceStatPipe: source })}::jsonb, ${source}, ${capturedAt}::timestamptz, now())
      ON CONFLICT (id) DO UPDATE SET xera_quality = EXCLUDED.xera_quality, fip_quality = EXCLUDED.fip_quality, k_bb = EXCLUDED.k_bb, hr_risk = EXCLUDED.hr_risk, groundball_rate = EXCLUDED.groundball_rate, platoon_split = EXCLUDED.platoon_split, stamina = EXCLUDED.stamina, recent_workload = EXCLUDED.recent_workload, arsenal_quality = EXCLUDED.arsenal_quality, overall = EXCLUDED.overall, metrics_json = EXCLUDED.metrics_json, updated_at = now();
    `;
    ratings += 1;
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source,
    capturedAt,
    inserted: { batters: payload.batters?.length ?? 0, pitchers: payload.pitchers?.length ?? 0, identities, ratings },
    warnings: []
  };
}
