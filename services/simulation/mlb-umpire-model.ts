import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeMlbTeam } from "@/services/simulation/mlb-team-analytics";

export type MlbUmpireTendency = {
  source: "real" | "synthetic";
  umpireName: string | null;
  strikeoutBiasEdge: number;  // positive = umpire drives more Ks (tighter bat path enforcement)
  walkBiasEdge: number;        // positive = umpire grants more walks (generous ball calls)
  totalRunBiasEdge: number;    // net run-environment effect: positive = more runs allowed
  kZoneSize: "tight" | "average" | "generous";
  notes: string[];
};

type RawUmpire = Record<string, unknown>;
const CACHE_KEY = "mlb:umpire-context:v1";
const CACHE_TTL_SECONDS = 60 * 60 * 4;

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

function rowsFromBody(body: unknown): RawUmpire[] {
  const value = body as { data?: RawUmpire[]; umpires?: RawUmpire[]; rows?: RawUmpire[]; games?: RawUmpire[] };
  if (Array.isArray(body)) return body as RawUmpire[];
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.umpires)) return value.umpires;
  if (Array.isArray(value.rows)) return value.rows;
  if (Array.isArray(value.games)) return value.games;
  return [];
}

function zoneSize(strikeoutBias: number, walkBias: number): MlbUmpireTendency["kZoneSize"] {
  const net = strikeoutBias - walkBias;
  if (net >= 0.25) return "generous";
  if (net <= -0.25) return "tight";
  return "average";
}

// Synthetic fallback: neutral with bounded uncertainty to represent
// the unknown umpire assignment effect without fabricating a false edge.
function syntheticTendency(): MlbUmpireTendency {
  return {
    source: "synthetic",
    umpireName: null,
    strikeoutBiasEdge: 0,
    walkBiasEdge: 0,
    totalRunBiasEdge: 0,
    kZoneSize: "average",
    notes: [
      "No umpire context feed configured. Umpire zone effect is treated as neutral.",
      "Set MLB_UMPIRE_CONTEXT_URL to provide real umpire assignment and tendency data."
    ]
  };
}

function tendencyFromRow(row: RawUmpire): MlbUmpireTendency {
  const name = text(row.umpireName, row.name, row.umpire, row.hp_umpire);
  // K-rate bias: how many K% points above/below league avg this ump drives
  // Walk-rate bias: how many BB% points above/below league avg this ump grants
  // Both can come from real umpire databases keyed on above/below league average
  const strikeoutBiasEdge = num(
    row.strikeoutBiasEdge ?? row.kRateImpact ?? row.k_rate_impact ?? row.strikeout_bias,
    0
  );
  const walkBiasEdge = num(
    row.walkBiasEdge ?? row.walkRateImpact ?? row.walk_rate_impact ?? row.walk_bias,
    0
  );
  // Net run effect: tight zone = more runs (more walks, harder to get Ks on fringe pitches)
  // generous zone = fewer runs (more Ks, fewer walks)
  const totalRunBiasEdge = num(
    row.totalRunBiasEdge ?? row.runEffect ?? row.run_bias ?? row.totalRunEffect,
    // derive if not provided: walks add more runs than Ks remove (roughly 2:1 ratio)
    walkBiasEdge * 0.18 - strikeoutBiasEdge * 0.09
  );
  return {
    source: "real",
    umpireName: name,
    strikeoutBiasEdge,
    walkBiasEdge,
    totalRunBiasEdge,
    kZoneSize: zoneSize(strikeoutBiasEdge, walkBiasEdge),
    notes: [
      name ? `Umpire: ${name}.` : "Umpire name not provided.",
      `K-zone: ${zoneSize(strikeoutBiasEdge, walkBiasEdge)} (K-bias ${strikeoutBiasEdge > 0 ? "+" : ""}${strikeoutBiasEdge.toFixed(2)}, BB-bias ${walkBiasEdge > 0 ? "+" : ""}${walkBiasEdge.toFixed(2)}).`,
      Math.abs(totalRunBiasEdge) >= 0.2
        ? `Umpire run-environment bias is material: ${totalRunBiasEdge > 0 ? "+" : ""}${totalRunBiasEdge.toFixed(2)} expected run shift.`
        : "Umpire run-environment bias is minimal."
    ]
  };
}

function keyFor(awayTeam: string, homeTeam: string) {
  return `${normalizeMlbTeam(awayTeam)}@${normalizeMlbTeam(homeTeam)}`;
}

async function fetchUmpireContexts(): Promise<Record<string, MlbUmpireTendency> | null> {
  const cached = await readHotCache<Record<string, MlbUmpireTendency>>(CACHE_KEY);
  if (cached) return cached;

  const url = process.env.MLB_UMPIRE_CONTEXT_URL?.trim();
  if (!url) return null;

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const body = await response.json();
    const rows = rowsFromBody(body);
    const contexts: Record<string, MlbUmpireTendency> = {};
    for (const row of rows) {
      const away = text(row.awayTeam, row.away, row.away_team);
      const home = text(row.homeTeam, row.home, row.home_team);
      if (away && home) {
        contexts[keyFor(away, home)] = tendencyFromRow(row);
      } else {
        // Keyed by umpire name alone — apply to all games
        const name = text(row.umpireName, row.name, row.umpire, row.hp_umpire);
        if (name) contexts[`umpire:${name.toLowerCase().replace(/\s+/g, "-")}`] = tendencyFromRow(row);
      }
    }
    if (Object.keys(contexts).length) {
      await writeHotCache(CACHE_KEY, contexts, CACHE_TTL_SECONDS);
      return contexts;
    }
  } catch {
    return null;
  }

  return null;
}

export async function getMlbUmpireTendency(awayTeam: string, homeTeam: string): Promise<MlbUmpireTendency> {
  const contexts = await fetchUmpireContexts();
  if (!contexts) return syntheticTendency();
  // Prefer game-specific matchup key; fall back to synthetic
  return contexts[keyFor(awayTeam, homeTeam)] ?? syntheticTendency();
}
