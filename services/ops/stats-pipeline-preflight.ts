import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { runStatsPipelineRunCenter, type StatsPipelineRunOptions } from "@/services/ops/stats-pipeline-run-center";

type ProfileFreshnessRow = {
  mlb_player_snapshot_at: Date | string | null;
  mlb_pitcher_snapshot_at: Date | string | null;
  mlb_lineup_captured_at: Date | string | null;
  ufc_feature_updated_at: Date | string | null;
};

export type StatsPipelinePreflightOptions = StatsPipelineRunOptions & {
  enabled?: boolean;
  force?: boolean;
  minAgeMinutes?: number;
  source?: string;
};

function boolEnv(name: string, fallback = false) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function intEnv(name: string, fallback: number, min: number, max: number) {
  const numeric = Number(process.env[name]);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function positiveInt(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.round(numeric))) : fallback;
}

function shouldRunSport(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return !["0", "false", "no", "off"].includes(value.toLowerCase());
  return fallback;
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown stats pipeline preflight error";
}

function toMs(value: Date | string | null | undefined) {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function iso(value: Date | string | null | undefined) {
  const ms = toMs(value);
  return ms == null ? null : new Date(ms).toISOString();
}

function ageMinutes(value: Date | string | null | undefined) {
  const ms = toMs(value);
  return ms == null ? null : Math.max(0, Math.round((Date.now() - ms) / 60000));
}

function stale(value: Date | string | null | undefined, minAgeMinutes: number) {
  const age = ageMinutes(value);
  return age == null || age >= minAgeMinutes;
}

async function getProfileFreshness() {
  if (!hasUsableServerDatabaseUrl()) {
    return {
      ok: false as const,
      error: "No usable server database URL is configured.",
      rows: null,
      freshness: null
    };
  }

  try {
    const rows = await prisma.$queryRaw<ProfileFreshnessRow[]>`
      SELECT
        (SELECT MAX(snapshot_at) FROM mlb_player_ratings) AS mlb_player_snapshot_at,
        (SELECT MAX(snapshot_at) FROM mlb_pitcher_ratings) AS mlb_pitcher_snapshot_at,
        (SELECT MAX(captured_at) FROM mlb_lineup_snapshots) AS mlb_lineup_captured_at,
        (SELECT MAX(updated_at) FROM ufc_model_features) AS ufc_feature_updated_at;
    `;
    const row = rows[0] ?? {
      mlb_player_snapshot_at: null,
      mlb_pitcher_snapshot_at: null,
      mlb_lineup_captured_at: null,
      ufc_feature_updated_at: null
    };
    return {
      ok: true as const,
      error: null,
      rows: row,
      freshness: {
        mlbPlayerSnapshotAt: iso(row.mlb_player_snapshot_at),
        mlbPitcherSnapshotAt: iso(row.mlb_pitcher_snapshot_at),
        mlbLineupCapturedAt: iso(row.mlb_lineup_captured_at),
        ufcFeatureUpdatedAt: iso(row.ufc_feature_updated_at),
        mlbPlayerAgeMinutes: ageMinutes(row.mlb_player_snapshot_at),
        mlbPitcherAgeMinutes: ageMinutes(row.mlb_pitcher_snapshot_at),
        mlbLineupAgeMinutes: ageMinutes(row.mlb_lineup_captured_at),
        ufcFeatureAgeMinutes: ageMinutes(row.ufc_feature_updated_at)
      }
    };
  } catch (error) {
    return {
      ok: false as const,
      error: safeError(error),
      rows: null,
      freshness: null
    };
  }
}

export async function runStatsPipelinePreflight(options: StatsPipelinePreflightOptions = {}) {
  const startedAt = new Date().toISOString();
  const source = options.source ?? "sim-refresh";
  const force = Boolean(options.force);
  const enabled = force || options.enabled === true || boolEnv("STATS_PIPELINE_BEFORE_SIM_REFRESH", false);
  const minAgeMinutes = positiveInt(options.minAgeMinutes, intEnv("STATS_PIPELINE_GUARD_MINUTES", 360, 5, 1440), 5, 1440);
  const runMlb = shouldRunSport(options.runMlb, true);
  const runUfc = shouldRunSport(options.runUfc, true);
  const includeLineups = shouldRunSport(options.includeLineups, true);

  if (!enabled) {
    return {
      ok: true,
      attempted: false,
      skipped: true,
      reason: "disabled",
      source,
      startedAt,
      minAgeMinutes,
      freshness: null,
      result: null
    };
  }

  const profile = await getProfileFreshness();
  const rows = profile.rows;
  const mlbStale = runMlb && (!profile.ok || !rows || stale(rows.mlb_player_snapshot_at, minAgeMinutes) || stale(rows.mlb_pitcher_snapshot_at, minAgeMinutes) || (includeLineups && stale(rows.mlb_lineup_captured_at, minAgeMinutes)));
  const ufcStale = runUfc && (!profile.ok || !rows || stale(rows.ufc_feature_updated_at, minAgeMinutes));
  const shouldRun = force || mlbStale || ufcStale;

  if (!shouldRun) {
    return {
      ok: true,
      attempted: false,
      skipped: true,
      reason: "fresh",
      source,
      startedAt,
      minAgeMinutes,
      freshness: profile.freshness,
      probeError: profile.error,
      result: null
    };
  }

  const result = await runStatsPipelineRunCenter({
    runMlb: force ? runMlb : mlbStale,
    runUfc: force ? runUfc : ufcStale,
    mlbLookbackDays: options.mlbLookbackDays,
    mlbLimit: options.mlbLimit,
    includeLineups,
    ufcLimit: options.ufcLimit,
    modelVersion: options.modelVersion
  });

  return {
    ok: result.ok,
    attempted: true,
    skipped: false,
    reason: force ? "forced" : !profile.ok ? "freshness-probe-failed" : "stale",
    source,
    startedAt,
    completedAt: new Date().toISOString(),
    minAgeMinutes,
    requestedSports: { mlb: runMlb, ufc: runUfc, includeLineups },
    stale: { mlb: mlbStale, ufc: ufcStale },
    freshness: profile.freshness,
    probeError: profile.error,
    result
  };
}
