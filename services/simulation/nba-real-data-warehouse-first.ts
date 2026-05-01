import { writeHotCache } from "@/lib/cache/live-cache";
import { readNbaWarehouseFeed, type NbaWarehouseKind } from "@/services/data/nba/warehouse-feed";
import { compareNbaRealDataIntelligence as compareBaseNbaRealDataIntelligence, type NbaRealDataIntel } from "@/services/simulation/nba-real-data-intelligence";

const CACHE_TTL_SECONDS = 60 * 30;
const WAREHOUSE_CACHE_KEYS: Record<NbaWarehouseKind, string> = {
  team: "nba:real-data:team:v1",
  player: "nba:real-data:player:v1",
  rating: "nba:real-data:rating:v1",
  history: "nba:real-data:history:v1"
};

async function preloadWarehouseKind(kind: NbaWarehouseKind) {
  const feed = await readNbaWarehouseFeed(kind).catch(() => null);
  if (!feed?.rows.length) return { kind, rows: 0, loaded: false, warnings: feed?.warnings ?? [] };
  await writeHotCache(WAREHOUSE_CACHE_KEYS[kind], feed.rows, CACHE_TTL_SECONDS);
  return { kind, rows: feed.rows.length, loaded: true, warnings: feed.warnings };
}

export async function compareNbaRealDataIntelligence(awayTeam: string, homeTeam: string): Promise<NbaRealDataIntel> {
  const preload = await Promise.all([
    preloadWarehouseKind("team"),
    preloadWarehouseKind("player"),
    preloadWarehouseKind("rating"),
    preloadWarehouseKind("history")
  ]);
  const result = await compareBaseNbaRealDataIntelligence(awayTeam, homeTeam);
  const loaded = preload.filter((item) => item.loaded);
  const playerRows = preload.find((item) => item.kind === "player")?.rows ?? 0;
  const teamRows = preload.find((item) => item.kind === "team")?.rows ?? 0;
  return {
    ...result,
    dataSource: `local-warehouse-first:${loaded.map((item) => `${item.kind}:${item.rows}`).join(",") || "none"}+${result.dataSource}`,
    modules: [
      ...result.modules,
      {
        label: "NBA local warehouse priority",
        status: teamRows > 0 && playerRows > 0 ? "real" : "unavailable",
        note: teamRows > 0 && playerRows > 0
          ? `Loaded committed local warehouse before URL/live fallback: team ${teamRows}, player ${playerRows}.`
          : `Local warehouse incomplete before fallback: team ${teamRows}, player ${playerRows}.`
      }
    ]
  };
}
