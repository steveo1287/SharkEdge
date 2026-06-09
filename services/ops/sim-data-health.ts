import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import {
  SIM_CACHE_KEYS,
  type SimBoardSnapshot,
  type SimMarketSnapshot,
  type SimRefreshStatusSnapshot
} from "@/services/simulation/sim-snapshot-service";
import { readSnapshotCache } from "@/services/simulation/sim-snapshot-cache-store";

export type SimDataHealthStatus = "ELITE" | "USABLE" | "WEAK" | "BLOCKED";
export type SimDataHealthPriority = "critical" | "high" | "medium";

export type SimDataHealthProbe = {
  key: string;
  label: string;
  category: "MLB" | "UFC" | "MARKET" | "CACHE";
  priority: SimDataHealthPriority;
  status: SimDataHealthStatus;
  count: number | null;
  latestAt: string | null;
  ageMinutes: number | null;
  maxFreshMinutes: number;
  blocker: string | null;
  warning: string | null;
  error: string | null;
};

export type SimDataHealthReport = {
  generatedAt: string;
  score: number;
  status: SimDataHealthStatus;
  databaseReady: boolean;
  blockers: string[];
  warnings: string[];
  probes: SimDataHealthProbe[];
  cache: {
    refreshStatus: {
      ok: boolean | null;
      running: boolean | null;
      generatedAt: string | null;
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
      reason: string | null;
    };
    mlbBoard: {
      generatedAt: string | null;
      expiresAt: string | null;
      stale: boolean | null;
      gameCount: number | null;
    };
    market: {
      generatedAt: string | null;
      expiresAt: string | null;
      stale: boolean | null;
      gameCount: number | null;
      lineCount: number | null;
    };
  };
  nextActions: string[];
};

type CountLatestRow = {
  row_count: number | bigint | string | null;
  latest_at: Date | string | null;
};

function toNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function ageMinutes(value: Date | string | null | undefined) {
  const iso = toIso(value);
  if (!iso) return null;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

function statusFrom(count: number | null, age: number | null, maxFreshMinutes: number, priority: SimDataHealthPriority): SimDataHealthStatus {
  if (!count || count <= 0) return priority === "medium" ? "WEAK" : "BLOCKED";
  if (age == null) return "WEAK";
  if (age <= maxFreshMinutes / 2) return "ELITE";
  if (age <= maxFreshMinutes) return "USABLE";
  if (age <= maxFreshMinutes * 3) return "WEAK";
  return priority === "critical" ? "BLOCKED" : "WEAK";
}

function scoreFor(status: SimDataHealthStatus) {
  if (status === "ELITE") return 100;
  if (status === "USABLE") return 75;
  if (status === "WEAK") return 42;
  return 0;
}

function weightFor(priority: SimDataHealthPriority) {
  if (priority === "critical") return 3;
  if (priority === "high") return 2;
  return 1;
}

function boolEnv(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return !["0", "false", "no", "off"].includes(raw);
}

function includeUfcHealth() {
  return boolEnv("SIM_HEALTH_INCLUDE_UFC", boolEnv("UFC_SIM_ENABLED", false));
}

function reportStatus(score: number, blockers: string[]): SimDataHealthStatus {
  if (blockers.length) return "BLOCKED";
  if (score >= 85) return "ELITE";
  if (score >= 68) return "USABLE";
  if (score >= 40) return "WEAK";
  return "BLOCKED";
}

function makeProbe(args: {
  key: string;
  label: string;
  category: SimDataHealthProbe["category"];
  priority: SimDataHealthPriority;
  count: number | null;
  latestAt: Date | string | null;
  maxFreshMinutes: number;
  error?: string | null;
}): SimDataHealthProbe {
  const latestAt = toIso(args.latestAt);
  const age = ageMinutes(args.latestAt);
  const status = args.error ? (args.priority === "medium" ? "WEAK" : "BLOCKED") : statusFrom(args.count, age, args.maxFreshMinutes, args.priority);
  const blocker = status === "BLOCKED" ? `${args.label} is blocked${args.error ? `: ${args.error}` : args.count === 0 ? ": zero rows" : age != null ? `: ${age} minutes old` : ": missing latest timestamp"}.` : null;
  const warning = status === "WEAK" ? `${args.label} is weak${args.error ? `: ${args.error}` : args.count === 0 ? ": zero rows" : age != null ? `: ${age} minutes old` : ": missing latest timestamp"}.` : null;
  return {
    key: args.key,
    label: args.label,
    category: args.category,
    priority: args.priority,
    status,
    count: args.count,
    latestAt,
    ageMinutes: age,
    maxFreshMinutes: args.maxFreshMinutes,
    blocker,
    warning,
    error: args.error ?? null
  };
}

async function queryProbe(args: {
  key: string;
  label: string;
  category: SimDataHealthProbe["category"];
  priority: SimDataHealthPriority;
  maxFreshMinutes: number;
  query: () => Promise<CountLatestRow[]>;
}): Promise<SimDataHealthProbe> {
  if (!hasUsableServerDatabaseUrl()) {
    return makeProbe({ ...args, count: null, latestAt: null, error: "No usable server database URL." });
  }
  try {
    const rows = await args.query();
    const row = rows[0] ?? { row_count: 0, latest_at: null };
    return makeProbe({ ...args, count: toNumber(row.row_count), latestAt: row.latest_at, error: null });
  } catch (error) {
    return makeProbe({ ...args, count: null, latestAt: null, error: error instanceof Error ? error.message : "unknown query failure" });
  }
}

async function buildDbProbes() {
  const probes: Array<Promise<SimDataHealthProbe>> = [
    queryProbe({
      key: "mlb-player-ratings",
      label: "MLB player ratings",
      category: "MLB",
      priority: "critical",
      maxFreshMinutes: 360,
      query: () => prisma.$queryRaw<CountLatestRow[]>`SELECT COUNT(*) AS row_count, MAX(snapshot_at) AS latest_at FROM mlb_player_ratings`
    }),
    queryProbe({
      key: "mlb-pitcher-ratings",
      label: "MLB pitcher ratings",
      category: "MLB",
      priority: "critical",
      maxFreshMinutes: 360,
      query: () => prisma.$queryRaw<CountLatestRow[]>`SELECT COUNT(*) AS row_count, MAX(snapshot_at) AS latest_at FROM mlb_pitcher_ratings`
    }),
    queryProbe({
      key: "mlb-lineup-snapshots",
      label: "MLB lineup snapshots",
      category: "MLB",
      priority: "high",
      maxFreshMinutes: 240,
      query: () => prisma.$queryRaw<CountLatestRow[]>`SELECT COUNT(*) AS row_count, MAX(captured_at) AS latest_at FROM mlb_lineup_snapshots`
    }),
    queryProbe({
      key: "market-snapshots",
      label: "Event market snapshots",
      category: "MARKET",
      priority: "high",
      maxFreshMinutes: 60,
      query: () => prisma.$queryRaw<CountLatestRow[]>`SELECT COUNT(*) AS row_count, MAX("capturedAt") AS latest_at FROM event_market_snapshots`
    }),
    queryProbe({
      key: "player-game-stats",
      label: "Raw player stat rows",
      category: "MLB",
      priority: "medium",
      maxFreshMinutes: 720,
      query: () => prisma.$queryRaw<CountLatestRow[]>`SELECT COUNT(*) AS row_count, MAX("updatedAt") AS latest_at FROM player_game_stats`
    }),
    queryProbe({
      key: "team-game-stats",
      label: "Raw team stat rows",
      category: "MLB",
      priority: "medium",
      maxFreshMinutes: 720,
      query: () => prisma.$queryRaw<CountLatestRow[]>`SELECT COUNT(*) AS row_count, MAX("updatedAt") AS latest_at FROM team_game_stats`
    })
  ];

  if (includeUfcHealth()) {
    probes.push(
      queryProbe({
        key: "ufc-model-features",
        label: "UFC model features",
        category: "UFC",
        priority: "critical",
        maxFreshMinutes: 720,
        query: () => prisma.$queryRaw<CountLatestRow[]>`SELECT COUNT(*) AS row_count, MAX(updated_at) AS latest_at FROM ufc_model_features`
      })
    );
  }

  return Promise.all(probes);
}

function cacheAgeProbe(args: {
  key: string;
  label: string;
  category: SimDataHealthProbe["category"];
  priority: SimDataHealthPriority;
  count: number | null;
  generatedAt: string | null;
  maxFreshMinutes: number;
}) {
  return makeProbe({
    key: args.key,
    label: args.label,
    category: args.category,
    priority: args.priority,
    count: args.count,
    latestAt: args.generatedAt,
    maxFreshMinutes: args.maxFreshMinutes,
    error: null
  });
}

async function buildCacheHealth() {
  const [refreshStatus, mlbBoard, market] = await Promise.all([
    readSnapshotCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus).catch(() => null),
    readSnapshotCache<SimBoardSnapshot>(SIM_CACHE_KEYS.mlbBoard).catch(() => null),
    readSnapshotCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market).catch(() => null)
  ]);

  const cache = {
    refreshStatus: {
      ok: refreshStatus?.ok ?? null,
      running: refreshStatus?.running ?? null,
      generatedAt: refreshStatus?.generatedAt ?? null,
      lastSuccessAt: refreshStatus?.lastSuccessAt ?? null,
      lastFailureAt: refreshStatus?.lastFailureAt ?? null,
      reason: refreshStatus?.reason ?? null
    },
    mlbBoard: {
      generatedAt: mlbBoard?.generatedAt ?? null,
      expiresAt: mlbBoard?.expiresAt ?? null,
      stale: mlbBoard?.expiresAt ? new Date(mlbBoard.expiresAt).getTime() <= Date.now() : null,
      gameCount: mlbBoard?.games?.length ?? null
    },
    market: {
      generatedAt: market?.generatedAt ?? null,
      expiresAt: market?.expiresAt ?? null,
      stale: market?.expiresAt ? new Date(market.expiresAt).getTime() <= Date.now() : null,
      gameCount: market?.gameCount ?? null,
      lineCount: market?.lineCount ?? null
    }
  };

  const probes = [
    cacheAgeProbe({ key: "cache-refresh-status", label: "Sim refresh status cache", category: "CACHE", priority: "high", count: refreshStatus ? 1 : 0, generatedAt: refreshStatus?.generatedAt ?? null, maxFreshMinutes: 90 }),
    cacheAgeProbe({ key: "cache-mlb-board", label: "Main MLB board cache", category: "CACHE", priority: "critical", count: mlbBoard?.games?.length ?? 0, generatedAt: mlbBoard?.generatedAt ?? null, maxFreshMinutes: 90 }),
    cacheAgeProbe({ key: "cache-market", label: "Sim market cache", category: "CACHE", priority: "high", count: market?.lineCount ?? 0, generatedAt: market?.generatedAt ?? null, maxFreshMinutes: 30 })
  ];

  return { cache, probes };
}

function nextActions(probes: SimDataHealthProbe[]) {
  const actions: string[] = [];
  const byKey = new Map(probes.map((probe) => [probe.key, probe]));
  if (byKey.get("mlb-player-ratings")?.status === "BLOCKED" || byKey.get("mlb-pitcher-ratings")?.status === "BLOCKED") actions.push("Run /accuracy/data/pipeline or /api/sim/refresh?wait=1&statsForce=1 to rebuild MLB player/pitcher ratings before trusting MLB sim output.");
  if (byKey.get("mlb-lineup-snapshots")?.status === "BLOCKED" || byKey.get("mlb-lineup-snapshots")?.status === "WEAK") actions.push("Improve lineup/probable starter source rows; stale or empty lineup snapshots should cap official MLB confidence.");
  if (byKey.get("ufc-model-features")?.status === "BLOCKED") actions.push("Run the UFC feature builder so operational fight sims have model-ready fighter features.");
  if (byKey.get("market-snapshots")?.status === "BLOCKED" || byKey.get("market-snapshots")?.status === "WEAK") actions.push("Refresh odds ingestion and market snapshots before treating CLV, edge, or market-matched projections as reliable.");
  if (byKey.get("cache-mlb-board")?.status === "BLOCKED" || byKey.get("cache-mlb-board")?.status === "WEAK") actions.push("Run /api/sim/refresh?wait=1 after profile data is fresh so the visible MLB board uses rebuilt profile features.");
  return Array.from(new Set(actions)).slice(0, 8);
}

export async function getSimDataHealthReport(): Promise<SimDataHealthReport> {
  const generatedAt = new Date().toISOString();
  const [dbProbes, cacheHealth] = await Promise.all([buildDbProbes(), buildCacheHealth()]);
  const probes = [...dbProbes, ...cacheHealth.probes];
  const blockers = probes.filter((probe) => probe.blocker).map((probe) => probe.blocker as string);
  const warnings = probes.filter((probe) => probe.warning).map((probe) => probe.warning as string);
  const weightedPossible = probes.reduce((sum, probe) => sum + weightFor(probe.priority), 0);
  const weightedScore = probes.reduce((sum, probe) => sum + scoreFor(probe.status) * weightFor(probe.priority), 0);
  const score = Math.round(weightedScore / Math.max(1, weightedPossible));
  const status = reportStatus(score, blockers);

  return {
    generatedAt,
    score,
    status,
    databaseReady: hasUsableServerDatabaseUrl(),
    blockers,
    warnings,
    probes,
    cache: cacheHealth.cache,
    nextActions: nextActions(probes)
  };
}
