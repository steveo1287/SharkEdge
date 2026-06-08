import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbRosterIntelligenceTables } from "@/services/simulation/mlb-roster-intelligence";
import type { MlbTeamByTeamRatingEnforcementResult } from "@/services/simulation/mlb-team-by-team-rating-enforcer";
import type { MlbProjectionRating } from "@/services/simulation/mlb-player-stat-inning-engine";

export const MLB_ENFORCED_RATING_SOURCE = "mlb-team-by-team-rating-enforcer-v1";

export type MlbEnforcedRatingPersistenceReport = {
  modelVersion: "mlb-enforced-rating-persistence-v1";
  persisted: boolean;
  source: typeof MLB_ENFORCED_RATING_SOURCE;
  season: number;
  snapshotDate: string;
  generatedAt: string;
  hitterRows: number;
  pitcherRows: number;
  skipped: boolean;
  reason: string | null;
};

function safeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function snapshotId(kind: "hitter" | "pitcher", snapshotDate: string, season: number, playerId: string) {
  return `enforced:${kind}:${snapshotDate}:${season}:${playerId}`;
}

function position(row: MlbProjectionRating) {
  const metrics = row.metrics_json ?? {};
  const roster = metrics.roster;
  if (roster && typeof roster === "object" && !Array.isArray(roster)) {
    const value = (roster as Record<string, unknown>).primaryPosition;
    return value == null ? null : String(value);
  }
  return null;
}

export async function persistMlbEnforcedTeamByTeamRatings(args: {
  result: MlbTeamByTeamRatingEnforcementResult;
  season: number;
  snapshotDate: string;
  generatedAt?: string;
  persist?: boolean;
}): Promise<MlbEnforcedRatingPersistenceReport> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const shouldPersist = args.persist !== false;
  if (!shouldPersist) {
    return {
      modelVersion: "mlb-enforced-rating-persistence-v1",
      persisted: false,
      source: MLB_ENFORCED_RATING_SOURCE,
      season: args.season,
      snapshotDate: args.snapshotDate,
      generatedAt,
      hitterRows: args.result.ratings.hitters.length,
      pitcherRows: args.result.ratings.pitchers.length,
      skipped: true,
      reason: "Persistence disabled."
    };
  }
  if (!hasUsableServerDatabaseUrl()) {
    return {
      modelVersion: "mlb-enforced-rating-persistence-v1",
      persisted: false,
      source: MLB_ENFORCED_RATING_SOURCE,
      season: args.season,
      snapshotDate: args.snapshotDate,
      generatedAt,
      hitterRows: args.result.ratings.hitters.length,
      pitcherRows: args.result.ratings.pitchers.length,
      skipped: true,
      reason: "DATABASE_URL unavailable."
    };
  }

  await ensureMlbRosterIntelligenceTables();

  for (const row of args.result.ratings.hitters) {
    await prisma.$executeRaw`
      INSERT INTO mlb_player_ratings (
        id, player_id, player_name, team, season, primary_position, role_tier,
        contact, power, discipline, vs_lhp, vs_rhp, baserunning, fielding, current_form, overall,
        metrics_json, source, snapshot_at
      ) VALUES (
        ${snapshotId("hitter", args.snapshotDate, args.season, row.id)}, ${row.id}, ${row.name}, ${row.team ?? "UNKNOWN"}, ${args.season}, ${position(row)}, ${row.role_tier ?? "UNKNOWN"},
        ${row.contact ?? null}, ${row.power ?? null}, ${row.discipline ?? null}, ${row.vs_lhp ?? null}, ${row.vs_rhp ?? null}, ${row.baserunning ?? null}, ${row.fielding ?? null}, ${row.current_form ?? null}, ${row.overall ?? null},
        ${safeJson({ ...(row.metrics_json ?? {}), snapshotSource: MLB_ENFORCED_RATING_SOURCE, snapshotDate: args.snapshotDate })}::jsonb, ${MLB_ENFORCED_RATING_SOURCE}, CAST(${generatedAt} AS timestamptz)
      )
      ON CONFLICT (id) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        team = EXCLUDED.team,
        primary_position = EXCLUDED.primary_position,
        role_tier = EXCLUDED.role_tier,
        contact = EXCLUDED.contact,
        power = EXCLUDED.power,
        discipline = EXCLUDED.discipline,
        vs_lhp = EXCLUDED.vs_lhp,
        vs_rhp = EXCLUDED.vs_rhp,
        baserunning = EXCLUDED.baserunning,
        fielding = EXCLUDED.fielding,
        current_form = EXCLUDED.current_form,
        overall = EXCLUDED.overall,
        metrics_json = EXCLUDED.metrics_json,
        source = EXCLUDED.source,
        snapshot_at = EXCLUDED.snapshot_at,
        updated_at = now();
    `;
  }

  for (const row of args.result.ratings.pitchers) {
    await prisma.$executeRaw`
      INSERT INTO mlb_pitcher_ratings (
        id, pitcher_id, pitcher_name, team, season, role_tier,
        xera_quality, fip_quality, k_bb, hr_risk, groundball_rate, platoon_split, stamina, recent_workload, arsenal_quality, overall,
        metrics_json, source, snapshot_at
      ) VALUES (
        ${snapshotId("pitcher", args.snapshotDate, args.season, row.id)}, ${row.id}, ${row.name}, ${row.team ?? "UNKNOWN"}, ${args.season}, ${row.role_tier ?? "UNKNOWN"},
        ${row.xera_quality ?? null}, ${row.fip_quality ?? null}, ${row.k_bb ?? null}, ${row.hr_risk ?? null}, ${row.groundball_rate ?? null}, ${row.platoon_split ?? null}, ${row.stamina ?? null}, ${row.recent_workload ?? null}, ${row.arsenal_quality ?? null}, ${row.overall ?? null},
        ${safeJson({ ...(row.metrics_json ?? {}), snapshotSource: MLB_ENFORCED_RATING_SOURCE, snapshotDate: args.snapshotDate })}::jsonb, ${MLB_ENFORCED_RATING_SOURCE}, CAST(${generatedAt} AS timestamptz)
      )
      ON CONFLICT (id) DO UPDATE SET
        pitcher_name = EXCLUDED.pitcher_name,
        team = EXCLUDED.team,
        role_tier = EXCLUDED.role_tier,
        xera_quality = EXCLUDED.xera_quality,
        fip_quality = EXCLUDED.fip_quality,
        k_bb = EXCLUDED.k_bb,
        hr_risk = EXCLUDED.hr_risk,
        groundball_rate = EXCLUDED.groundball_rate,
        platoon_split = EXCLUDED.platoon_split,
        stamina = EXCLUDED.stamina,
        recent_workload = EXCLUDED.recent_workload,
        arsenal_quality = EXCLUDED.arsenal_quality,
        overall = EXCLUDED.overall,
        metrics_json = EXCLUDED.metrics_json,
        source = EXCLUDED.source,
        snapshot_at = EXCLUDED.snapshot_at,
        updated_at = now();
    `;
  }

  return {
    modelVersion: "mlb-enforced-rating-persistence-v1",
    persisted: true,
    source: MLB_ENFORCED_RATING_SOURCE,
    season: args.season,
    snapshotDate: args.snapshotDate,
    generatedAt,
    hitterRows: args.result.ratings.hitters.length,
    pitcherRows: args.result.ratings.pitchers.length,
    skipped: false,
    reason: null
  };
}
