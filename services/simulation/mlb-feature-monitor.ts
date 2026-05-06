import { prisma } from "@/lib/db/prisma";

// Feature freshness + drift monitoring for the MLB sim pipeline.
// Writes a snapshot row per feature key, letting the pipeline gate
// on stale or drifted inputs before making predictions.

export type FeatureStatus = "GREEN" | "YELLOW" | "RED" | "STALE" | "UNKNOWN";

export type FeatureMonitorSnapshot = {
  featureKey: string;
  status: FeatureStatus;
  lastUpdatedAt: Date | null;
  stalenessHours: number | null;
  sampleCount: number;
  driftScore: number | null;
  details: Record<string, unknown>;
};

export type FeatureMonitorReport = {
  generatedAt: string;
  overallStatus: FeatureStatus;
  features: FeatureMonitorSnapshot[];
  staleFeatures: string[];
  driftedFeatures: string[];
  warnings: string[];
};

const STALE_THRESHOLDS_HOURS: Record<string, number> = {
  statcast:      6,
  lineup:        1,
  umpire:        8,
  closing_line:  2,
  pitch_tracking: 4,
  bullpen:       4,
  market_odds:   2,
  game_spine:   12,
  retrosheet:   48,
};

const DRIFT_THRESHOLDS: Record<string, { lo: number; hi: number }> = {
  statcast_xwoba:     { lo: 0.25, hi: 0.40 },
  lineup_confidence:  { lo: 30,   hi: 100  },
  market_hold_pct:    { lo: 0.03, hi: 0.12 },
  pitch_count_avg:    { lo: 60,   hi: 130  },
};

function hoursSince(date: Date | null): number | null {
  if (!date) return null;
  return (Date.now() - date.getTime()) / 3_600_000;
}

function stalenessStatus(hours: number | null, key: string): FeatureStatus {
  if (hours === null) return "UNKNOWN";
  const threshold = STALE_THRESHOLDS_HOURS[key] ?? 24;
  if (hours > threshold * 3) return "STALE";
  if (hours > threshold * 1.5) return "RED";
  if (hours > threshold) return "YELLOW";
  return "GREEN";
}

function driftStatus(value: number | null, key: string): FeatureStatus {
  if (value === null) return "UNKNOWN";
  const bounds = DRIFT_THRESHOLDS[key];
  if (!bounds) return "GREEN";
  if (value < bounds.lo || value > bounds.hi) return "RED";
  const range = bounds.hi - bounds.lo;
  const margin = range * 0.15;
  if (value < bounds.lo + margin || value > bounds.hi - margin) return "YELLOW";
  return "GREEN";
}

function worstStatus(...statuses: FeatureStatus[]): FeatureStatus {
  const order: FeatureStatus[] = ["STALE", "RED", "YELLOW", "UNKNOWN", "GREEN"];
  for (const s of order) if (statuses.includes(s)) return s;
  return "UNKNOWN";
}

async function checkStatcast(): Promise<FeatureMonitorSnapshot> {
  type Row = { last_updated: Date | null; count: bigint; avg_xwoba: number | null };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      MAX(tgs.updated_at) AS last_updated,
      COUNT(*) AS count,
      AVG((tgs.stats_json->'statcast'->>'xwoba')::FLOAT) AS avg_xwoba
    FROM team_game_stats tgs
    JOIN teams t ON t.id = tgs.team_id
    JOIN leagues l ON l.id = t.league_id AND l.key = 'MLB'
    WHERE tgs.updated_at > now() - INTERVAL '14 days'
  `.catch(() => [] as Row[]);

  const row = rows[0];
  const lastUpdated = row?.last_updated ?? null;
  const count = Number(row?.count ?? 0);
  const avgXwoba = row?.avg_xwoba ?? null;
  const hours = hoursSince(lastUpdated);
  const ss = stalenessStatus(hours, "statcast");
  const ds = driftStatus(avgXwoba, "statcast_xwoba");

  return {
    featureKey: "statcast",
    status: worstStatus(ss, ds),
    lastUpdatedAt: lastUpdated,
    stalenessHours: hours !== null ? Number(hours.toFixed(2)) : null,
    sampleCount: count,
    driftScore: avgXwoba !== null ? Number(Math.abs(avgXwoba - 0.315).toFixed(4)) : null,
    details: { avgXwoba, stalenessStatus: ss, driftStatus: ds },
  };
}

async function checkLineup(): Promise<FeatureMonitorSnapshot> {
  type Row = { last_updated: Date | null; count: bigint; avg_confidence: number | null };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      MAX(updated_at) AS last_updated,
      COUNT(*) AS count,
      AVG((data_json->>'lineupConfidence')::FLOAT) AS avg_confidence
    FROM mlb_roster_intelligence
    WHERE updated_at > now() - INTERVAL '2 days'
  `.catch(() => [] as Row[]);

  const row = rows[0];
  const lastUpdated = row?.last_updated ?? null;
  const count = Number(row?.count ?? 0);
  const avgConf = row?.avg_confidence ?? null;
  const hours = hoursSince(lastUpdated);
  const ss = stalenessStatus(hours, "lineup");
  const ds = driftStatus(avgConf, "lineup_confidence");

  return {
    featureKey: "lineup",
    status: worstStatus(ss, count === 0 ? "UNKNOWN" : "GREEN", ds),
    lastUpdatedAt: lastUpdated,
    stalenessHours: hours !== null ? Number(hours.toFixed(2)) : null,
    sampleCount: count,
    driftScore: avgConf !== null ? Number(Math.abs(avgConf - 65) / 100).toFixed(4) as unknown as number : null,
    details: { avgConfidence: avgConf, stalenessStatus: ss },
  };
}

async function checkUmpire(): Promise<FeatureMonitorSnapshot> {
  type CountRow = { count: bigint; last_fetched: Date | null };
  const rows = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count, MAX(fetched_at) AS last_fetched
    FROM mlb_umpire_assignments
    WHERE game_date >= now()::DATE - 1
  `.catch(() => [] as CountRow[]);

  const row = rows[0];
  const lastUpdated = row?.last_fetched ?? null;
  const count = Number(row?.count ?? 0);
  const hours = hoursSince(lastUpdated);
  const ss = stalenessStatus(hours, "umpire");

  type SeedRow = { count: bigint };
  const seedRows = await prisma.$queryRaw<SeedRow[]>`SELECT COUNT(*) AS count FROM mlb_umpire_tendencies`.catch(() => [] as SeedRow[]);
  const seedCount = Number(seedRows[0]?.count ?? 0);

  return {
    featureKey: "umpire",
    status: seedCount === 0 ? "RED" : ss,
    lastUpdatedAt: lastUpdated,
    stalenessHours: hours !== null ? Number(hours.toFixed(2)) : null,
    sampleCount: count,
    driftScore: null,
    details: { todayAssignments: count, seedUmpires: seedCount, stalenessStatus: ss },
  };
}

async function checkClosingLines(): Promise<FeatureMonitorSnapshot> {
  type Row = { count: bigint; last_updated: Date | null; avg_prob: number | null };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(*) AS count,
      MAX(updated_at) AS last_updated,
      AVG(no_vig_probability) AS avg_prob
    FROM mlb_market_open_close
    WHERE updated_at > now() - INTERVAL '3 days'
      AND market_type = 'moneyline'
  `.catch(() => [] as Row[]);

  const row = rows[0];
  const lastUpdated = row?.last_updated ?? null;
  const count = Number(row?.count ?? 0);
  const hours = hoursSince(lastUpdated);
  const ss = stalenessStatus(hours, "closing_line");

  return {
    featureKey: "closing_line",
    status: worstStatus(ss, count === 0 ? "RED" : "GREEN"),
    lastUpdatedAt: lastUpdated,
    stalenessHours: hours !== null ? Number(hours.toFixed(2)) : null,
    sampleCount: count,
    driftScore: null,
    details: { avgNoVigProbability: row?.avg_prob, stalenessStatus: ss },
  };
}

async function checkPitchTracking(): Promise<FeatureMonitorSnapshot> {
  type Row = { count: bigint; last_captured: Date | null; avg_pitch_count: number | null };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(*) AS count,
      MAX(captured_at) AS last_captured,
      AVG(pitch_count) AS avg_pitch_count
    FROM mlb_pitch_game_log
    WHERE game_date >= now()::DATE - 3
  `.catch(() => [] as Row[]);

  const row = rows[0];
  const lastUpdated = row?.last_captured ?? null;
  const count = Number(row?.count ?? 0);
  const avgPitchCount = row?.avg_pitch_count ?? null;
  const hours = hoursSince(lastUpdated);
  const ss = stalenessStatus(hours, "pitch_tracking");
  const ds = driftStatus(avgPitchCount, "pitch_count_avg");

  return {
    featureKey: "pitch_tracking",
    status: worstStatus(ss, count === 0 ? "UNKNOWN" : "GREEN", ds),
    lastUpdatedAt: lastUpdated,
    stalenessHours: hours !== null ? Number(hours.toFixed(2)) : null,
    sampleCount: count,
    driftScore: avgPitchCount !== null ? Number(Math.abs(avgPitchCount - 95) / 95).toFixed(4) as unknown as number : null,
    details: { avgPitchCount, stalenessStatus: ss, driftStatus: ds },
  };
}

async function checkMarketOdds(): Promise<FeatureMonitorSnapshot> {
  type Row = { count: bigint; last_updated: Date | null };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT COUNT(*) AS count, MAX(em.updated_at) AS last_updated
    FROM event_markets em
    JOIN events e ON e.id = em.event_id
    JOIN leagues l ON l.id = e.league_id AND l.key = 'MLB'
    WHERE e.start_time > now() - INTERVAL '1 day'
      AND e.start_time < now() + INTERVAL '3 days'
  `.catch(() => [] as Row[]);

  const row = rows[0];
  const lastUpdated = row?.last_updated ?? null;
  const count = Number(row?.count ?? 0);
  const hours = hoursSince(lastUpdated);
  const ss = stalenessStatus(hours, "market_odds");

  return {
    featureKey: "market_odds",
    status: worstStatus(ss, count === 0 ? "RED" : "GREEN"),
    lastUpdatedAt: lastUpdated,
    stalenessHours: hours !== null ? Number(hours.toFixed(2)) : null,
    sampleCount: count,
    driftScore: null,
    details: { upcomingMarkets: count, stalenessStatus: ss },
  };
}

async function checkGameSpine(): Promise<FeatureMonitorSnapshot> {
  type Row = { count: bigint; last_updated: Date | null };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT COUNT(*) AS count, MAX(updated_at) AS last_updated
    FROM mlb_games
    WHERE game_date >= now()::DATE - 1
  `.catch(() => [] as Row[]);

  const row = rows[0];
  const lastUpdated = row?.last_updated ?? null;
  const count = Number(row?.count ?? 0);
  const hours = hoursSince(lastUpdated);
  const ss = stalenessStatus(hours, "game_spine");

  return {
    featureKey: "game_spine",
    status: worstStatus(ss, count === 0 ? "RED" : "GREEN"),
    lastUpdatedAt: lastUpdated,
    stalenessHours: hours !== null ? Number(hours.toFixed(2)) : null,
    sampleCount: count,
    driftScore: null,
    details: { recentGames: count, stalenessStatus: ss },
  };
}

async function persistSnapshot(snapshot: FeatureMonitorSnapshot) {
  const id = `fmon:${snapshot.featureKey}:${Date.now()}`;
  await prisma.$executeRaw`
    INSERT INTO mlb_feature_monitor_snapshots
      (id, snapshot_at, feature_key, status, last_updated_at, staleness_hours,
       sample_count, drift_score, details_json, created_at)
    VALUES
      (${id}, now(), ${snapshot.featureKey}, ${snapshot.status},
       ${snapshot.lastUpdatedAt ?? null},
       ${snapshot.stalenessHours ?? null},
       ${snapshot.sampleCount},
       ${snapshot.driftScore ?? null},
       ${JSON.stringify(snapshot.details)}::JSONB,
       now())
  `;
}

async function ensureMonitorTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS mlb_feature_monitor_snapshots (
      id TEXT PRIMARY KEY,
      snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      feature_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'UNKNOWN',
      last_updated_at TIMESTAMPTZ,
      staleness_hours DOUBLE PRECISION,
      sample_count INTEGER NOT NULL DEFAULT 0,
      drift_score DOUBLE PRECISION,
      details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS mlb_feature_monitor_key_time_idx
    ON mlb_feature_monitor_snapshots (feature_key, snapshot_at DESC)
  `;
}

export async function runMlbFeatureMonitor(): Promise<FeatureMonitorReport> {
  await ensureMonitorTable().catch(() => null);

  const [statcast, lineup, umpire, closingLine, pitchTracking, marketOdds, gameSpine] = await Promise.all([
    checkStatcast(),
    checkLineup(),
    checkUmpire(),
    checkClosingLines(),
    checkPitchTracking(),
    checkMarketOdds(),
    checkGameSpine(),
  ]);

  const features = [statcast, lineup, umpire, closingLine, pitchTracking, marketOdds, gameSpine];

  // Persist to DB (best-effort)
  await Promise.allSettled(features.map((f) => persistSnapshot(f)));

  const staleFeatures = features.filter((f) => f.status === "STALE" || f.status === "RED").map((f) => f.featureKey);
  const driftedFeatures = features.filter((f) => f.driftScore !== null && (f.driftScore as number) > 0.3).map((f) => f.featureKey);

  const overallStatus = worstStatus(...features.map((f) => f.status));
  const warnings: string[] = [
    ...staleFeatures.map((k) => `Feature "${k}" is stale/red — pipeline accuracy may be degraded.`),
    ...driftedFeatures.map((k) => `Feature "${k}" shows drift above threshold.`),
  ];

  return {
    generatedAt: new Date().toISOString(),
    overallStatus,
    features,
    staleFeatures,
    driftedFeatures,
    warnings,
  };
}

export async function getLatestFeatureStatuses(): Promise<Record<string, { status: FeatureStatus; stalenessHours: number | null; snapshotAt: Date }>> {
  type Row = { feature_key: string; status: string; staleness_hours: number | null; snapshot_at: Date };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT DISTINCT ON (feature_key)
      feature_key, status, staleness_hours, snapshot_at
    FROM mlb_feature_monitor_snapshots
    ORDER BY feature_key, snapshot_at DESC
  `.catch(() => [] as Row[]);

  const result: Record<string, { status: FeatureStatus; stalenessHours: number | null; snapshotAt: Date }> = {};
  for (const r of rows) {
    result[r.feature_key] = {
      status: r.status as FeatureStatus,
      stalenessHours: r.staleness_hours,
      snapshotAt: r.snapshot_at,
    };
  }
  return result;
}
