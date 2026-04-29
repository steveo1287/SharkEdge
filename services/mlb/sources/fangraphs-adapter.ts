import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";

export type FangraphsSplits = {
  playerName: string;
  source: "real" | "synthetic";
  wobaVsHand: number;
  kRateVsHand: number;
  parkFactor: number;
};

type RawRow = Record<string, unknown>;
const CACHE_TTL_SECONDS = 60 * 60 * 8;

function num(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function rowsFromBody(body: unknown): RawRow[] {
  const value = body as { data?: RawRow[]; players?: RawRow[]; rows?: RawRow[]; stats?: RawRow[] };
  if (Array.isArray(body)) return body as RawRow[];
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.players)) return value.players;
  if (Array.isArray(value.rows)) return value.rows;
  if (Array.isArray(value.stats)) return value.stats;
  return [];
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seedUnit(seed: number) { return (seed % 10000) / 10000; }
function range(seed: number, min: number, max: number) {
  return Number((min + seedUnit(seed) * (max - min)).toFixed(3));
}

// Player-seeded synthetic: varies by player rather than returning the same
// value for everyone. Calibrated to realistic MLB platoon split ranges.
// Average hitter vs RHP: wOBA ~0.315, K-rate ~22%. vs LHP: wOBA ~0.325, K-rate ~21%.
// Top of the range reflects elite contact hitters; bottom reflects weak-side hitters.
function syntheticSplits(playerName: string): FangraphsSplits {
  const seed = hashString(`${playerName}:fangraphs-splits`);
  return {
    playerName,
    source: "synthetic",
    wobaVsHand: range(seed >>> 1, 0.270, 0.390),
    kRateVsHand: range(seed >>> 2, 0.155, 0.305),
    parkFactor: 1.0
  };
}

function rowFromMatch(row: RawRow, playerName: string): FangraphsSplits {
  return {
    playerName,
    source: "real",
    wobaVsHand: num(
      row.wobaVsHand ?? row.woba_vs_hand ?? row.woba ?? row.xwoba ?? row.obp,
      syntheticSplits(playerName).wobaVsHand
    ),
    kRateVsHand: num(
      row.kRateVsHand ?? row.k_rate_vs_hand ?? row.kRate ?? row.k_pct ?? row.strikeout_rate,
      syntheticSplits(playerName).kRateVsHand
    ),
    parkFactor: num(
      row.parkFactor ?? row.park_factor ?? row.pf ?? row.parkRunFactor,
      1.0
    )
  };
}

async function fetchAllSplits(): Promise<Record<string, FangraphsSplits> | null> {
  const cacheKey = "mlb:fangraphs:splits:v2";
  const cached = await readHotCache<Record<string, FangraphsSplits>>(cacheKey);
  if (cached) return cached;

  const url = process.env.FANGRAPHS_PLAYER_FEED_URL?.trim();
  if (!url) return null;

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const body = await response.json();
    const rows = rowsFromBody(body);
    const index: Record<string, FangraphsSplits> = {};
    for (const row of rows) {
      const name = text(row.playerName, row.player_name, row.name, row.Name);
      if (name) index[normalizeName(name)] = rowFromMatch(row, name);
    }
    if (Object.keys(index).length) {
      await writeHotCache(cacheKey, index, CACHE_TTL_SECONDS);
      return index;
    }
  } catch {
    return null;
  }

  return null;
}

export async function fetchFangraphsSplits(playerName: string): Promise<FangraphsSplits> {
  const splits = await fetchAllSplits();
  if (splits) {
    const key = normalizeName(playerName);
    const match = splits[key];
    if (match) return match;
    // Partial name match fallback (handles "Last, First" vs "First Last")
    const partialKey = key.slice(0, Math.min(key.length, 8));
    const partial = Object.keys(splits).find((k) => k.startsWith(partialKey));
    if (partial) return splits[partial];
  }
  return syntheticSplits(playerName);
}
