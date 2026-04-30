import fs from "node:fs/promises";
import path from "node:path";

export type NbaWarehouseKind = "team" | "player" | "history" | "rating";

export type NbaWarehouseFeed = {
  kind: NbaWarehouseKind;
  generatedAt: string;
  warehouseDir: string;
  filePath: string | null;
  rows: Record<string, unknown>[];
  warnings: string[];
};

type FeedBody = {
  rows?: Record<string, unknown>[];
  data?: Record<string, unknown>[];
  teams?: Record<string, unknown>[];
  players?: Record<string, unknown>[];
  history?: Record<string, unknown>[];
  ratings?: Record<string, unknown>[];
};

function warehouseDir() {
  return process.env.NBA_WAREHOUSE_DIR?.trim() || path.join(process.cwd(), "data", "nba", "warehouse");
}

function candidateFiles(kind: NbaWarehouseKind) {
  const dir = warehouseDir();
  return [
    path.join(dir, `${kind}-feed.json`),
    path.join(dir, `${kind}.json`),
    path.join(dir, `nba-${kind}-feed.json`),
    path.join(dir, `nba-${kind}.json`)
  ];
}

function rowsFromBody(body: unknown, kind: NbaWarehouseKind) {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  const value = body as FeedBody;
  if (kind === "team" && Array.isArray(value.teams)) return value.teams;
  if (kind === "player" && Array.isArray(value.players)) return value.players;
  if (kind === "history" && Array.isArray(value.history)) return value.history;
  if (kind === "rating" && Array.isArray(value.ratings)) return value.ratings;
  if (Array.isArray(value.rows)) return value.rows;
  if (Array.isArray(value.data)) return value.data;
  return [];
}

async function readJson(filePath: string) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text) as unknown;
}

export async function readNbaWarehouseFeed(kind: NbaWarehouseKind): Promise<NbaWarehouseFeed> {
  const warnings: string[] = [];
  const files = candidateFiles(kind);

  for (const filePath of files) {
    try {
      const body = await readJson(filePath);
      const rows = rowsFromBody(body, kind).map((row) => ({
        ...row,
        __source: String(row.__source ?? "sharkedge-nba-free-warehouse"),
        __sourceLabel: String(row.__sourceLabel ?? "SharkEdge NBA free warehouse"),
        __sourceTier: String(row.__sourceTier ?? "historical"),
        __sourcePriority: Number(row.__sourcePriority ?? 5),
        __sourceWeight: Number(row.__sourceWeight ?? 1),
        __license: String(row.__license ?? "public-or-self-hosted")
      }));

      return {
        kind,
        generatedAt: new Date().toISOString(),
        warehouseDir: warehouseDir(),
        filePath,
        rows,
        warnings: rows.length ? warnings : [`NBA warehouse ${kind} feed exists but returned zero rows: ${filePath}`]
      };
    } catch {
      // Try the next candidate filename.
    }
  }

  warnings.push(`No NBA warehouse ${kind} feed found. Expected one of: ${files.join(", ")}`);
  return {
    kind,
    generatedAt: new Date().toISOString(),
    warehouseDir: warehouseDir(),
    filePath: null,
    rows: [],
    warnings
  };
}

export function nbaWarehouseFeedPlan(kind: NbaWarehouseKind) {
  return {
    kind,
    warehouseDir: warehouseDir(),
    candidates: candidateFiles(kind),
    preferredFile: path.join(warehouseDir(), `${kind}-feed.json`),
    acceptedShapes: [
      "array",
      "{ rows: [] }",
      "{ data: [] }",
      kind === "team" ? "{ teams: [] }" : null,
      kind === "player" ? "{ players: [] }" : null,
      kind === "history" ? "{ history: [] }" : null,
      kind === "rating" ? "{ ratings: [] }" : null
    ].filter(Boolean)
  };
}
