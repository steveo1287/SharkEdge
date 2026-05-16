import { SIM_CACHE_KEYS, readSimCache } from "@/services/simulation/sim-snapshot-service";

type SnapshotLike = {
  generatedAt?: string;
  expiresAt?: string;
  stale?: boolean;
  summary?: unknown;
  warnings?: string[];
  sourceStatus?: Record<string, unknown>;
  rows?: unknown[];
  games?: unknown[];
  edges?: unknown[];
  lineCount?: number;
  gameCount?: number;
};

function summarize(snapshot: SnapshotLike | null) {
  if (!snapshot) return { hit: false };
  return {
    hit: true,
    generatedAt: snapshot.generatedAt ?? null,
    expiresAt: snapshot.expiresAt ?? null,
    stale: Boolean(snapshot.stale),
    summary: snapshot.summary ?? null,
    rowCount: Array.isArray(snapshot.rows) ? snapshot.rows.length : null,
    gameCount: Array.isArray(snapshot.games) ? snapshot.games.length : snapshot.gameCount ?? null,
    edgeCount: Array.isArray(snapshot.edges) ? snapshot.edges.length : null,
    lineCount: snapshot.lineCount ?? null,
    warnings: snapshot.warnings ?? [],
    sourceStatus: snapshot.sourceStatus ?? null
  };
}

export async function GET() {
  const entries = await Promise.all(Object.entries(SIM_CACHE_KEYS).map(async ([name, key]) => {
    const snapshot = await readSimCache<SnapshotLike>(key);
    return [name, { key, ...summarize(snapshot) }] as const;
  }));
  const cache = Object.fromEntries(entries);
  const active = entries.filter(([, value]) => value.hit && !value.stale).length;
  const stale = entries.filter(([, value]) => value.hit && value.stale).length;
  return Response.json({
    status: "ok",
    cache,
    summary: {
      totalKeys: entries.length,
      active,
      stale,
      missing: entries.length - active - stale
    },
    message: `${active} active sim snapshot keys, ${stale} stale, ${entries.length - active - stale} missing`
  });
}
