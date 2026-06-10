import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  BoardFilters,
  BoardPageData,
  BoardSportSectionView,
  GameCardView,
  ProviderHealthView,
  ScoreboardPreviewView
} from "@/lib/types/domain";

type SnapshotOrigin = "remote" | "local";

type SnapshotLoadResult = {
  origin: SnapshotOrigin;
  data: BoardPageData;
};

type SnapshotCache = {
  key: string;
  loadedAtMs: number;
  result: SnapshotLoadResult | null;
};

const DEFAULT_LOCAL_SNAPSHOT_PATH = path.join(process.cwd(), "public", "data", "latest-board.json");
const DEFAULT_REMOTE_CACHE_TTL_MS = 60_000;
const DEFAULT_LOCAL_CACHE_TTL_MS = 5_000;

let remoteCache: SnapshotCache | null = null;
let localCache: SnapshotCache | null = null;

function numericEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function selectedLeague(filters: BoardFilters) {
  return filters.league && filters.league !== "ALL" ? filters.league : null;
}

function currentUtcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function dateMatches(value: string | undefined, startTime: string) {
  const raw = value?.trim().toLowerCase();
  if (!raw || raw === "all" || raw === "upcoming") {
    return true;
  }

  const eventDate = startTime.slice(0, 10);
  if (raw === "today") {
    return eventDate === currentUtcDateKey();
  }

  return eventDate === raw;
}

function statusMatches(value: BoardFilters["status"], status: string) {
  if (!value || value === "all") {
    return true;
  }

  const normalized = status.toLowerCase();
  if (value === "pregame") {
    return normalized === "pregame" || normalized === "scheduled";
  }

  return normalized === value;
}

function marketMatches(value: BoardFilters["market"], game: GameCardView) {
  if (!value || value === "all") {
    return true;
  }

  const market = game[value];
  return Boolean(market && !market.hidden);
}

function filterGames(games: GameCardView[], filters: BoardFilters) {
  const league = selectedLeague(filters);
  return games.filter((game) => {
    if (league && game.leagueKey !== league) {
      return false;
    }

    return (
      dateMatches(filters.date, game.startTime) &&
      statusMatches(filters.status, game.status) &&
      marketMatches(filters.market, game)
    );
  });
}

function filterScoreboardItem(item: ScoreboardPreviewView, filters: BoardFilters) {
  return dateMatches(filters.date, item.startTime) && statusMatches(filters.status, item.status);
}

function filterSections(
  sections: BoardSportSectionView[],
  games: GameCardView[],
  filters: BoardFilters
): BoardSportSectionView[] {
  const league = selectedLeague(filters);
  return sections
    .filter((section) => !league || section.leagueKey === league)
    .map((section) => ({
      ...section,
      games: games.filter((game) => game.leagueKey === section.leagueKey),
      scoreboard: (section.scoreboard ?? []).filter((item) => filterScoreboardItem(item, filters))
    }));
}

function extractGeneratedAt(snapshot: BoardPageData) {
  return (
    (snapshot as BoardPageData & { snapshotGeneratedAt?: string; generatedAt?: string }).snapshotGeneratedAt ??
    (snapshot as BoardPageData & { generatedAt?: string }).generatedAt ??
    snapshot.providerHealth?.asOf ??
    null
  );
}

function minutesSince(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
}

function freshnessLabel(minutes: number | null) {
  if (minutes === null) return "Snapshot freshness unknown";
  if (minutes < 2) return "Snapshot refreshed just now";
  if (minutes < 60) return `Snapshot refreshed ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `Snapshot refreshed ${hours}h ago`;
}

function buildProviderHealth(
  snapshot: BoardPageData,
  origin: SnapshotOrigin,
  generatedAt: string | null
): ProviderHealthView {
  const base = snapshot.providerHealth ?? {
    state: "FALLBACK",
    label: "Snapshot",
    summary: "Board snapshot loaded.",
    freshnessLabel: "Snapshot freshness unknown",
    freshnessMinutes: null,
    asOf: null,
    warnings: []
  };

  const minutes = minutesSince(generatedAt);
  const location = origin === "remote" ? "remote snapshot URL" : "local snapshot file";

  return {
    ...base,
    state: base.state === "OFFLINE" ? "FALLBACK" : base.state,
    label: base.label ?? "Snapshot",
    summary: `Board is serving a precomputed ${location}. No live odds, database, or simulation work is running during this request.`,
    freshnessLabel: freshnessLabel(minutes ?? base.freshnessMinutes ?? null),
    freshnessMinutes: minutes ?? base.freshnessMinutes ?? null,
    asOf: generatedAt ?? base.asOf ?? null,
    warnings: [
      ...(base.warnings ?? []),
      "Snapshot mode active: request-time live board compute is disabled unless SHARKEDGE_ALLOW_LIVE_BOARD_FALLBACK=true."
    ]
  };
}

function coerceSnapshot(value: unknown): BoardPageData | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<BoardPageData>;
  if (!Array.isArray(candidate.games) || !Array.isArray(candidate.sportSections)) {
    return null;
  }

  return candidate as BoardPageData;
}

async function loadRemoteSnapshot(): Promise<SnapshotLoadResult | null> {
  const url = process.env.SHARKEDGE_BOARD_SNAPSHOT_URL?.trim();
  if (!url) {
    return null;
  }

  const ttlMs = numericEnv("SHARKEDGE_BOARD_SNAPSHOT_CACHE_TTL_MS", DEFAULT_REMOTE_CACHE_TTL_MS);
  const cacheKey = url;
  if (remoteCache?.key === cacheKey && Date.now() - remoteCache.loadedAtMs < ttlMs) {
    return remoteCache.result;
  }

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" }
    });

    if (!response.ok) {
      remoteCache = { key: cacheKey, loadedAtMs: Date.now(), result: null };
      return null;
    }

    const snapshot = coerceSnapshot(await response.json());
    const result = snapshot ? { origin: "remote" as const, data: snapshot } : null;
    remoteCache = { key: cacheKey, loadedAtMs: Date.now(), result };
    return result;
  } catch {
    remoteCache = { key: cacheKey, loadedAtMs: Date.now(), result: null };
    return null;
  }
}

async function loadLocalSnapshot(): Promise<SnapshotLoadResult | null> {
  const snapshotPath = process.env.SHARKEDGE_BOARD_SNAPSHOT_PATH?.trim() || DEFAULT_LOCAL_SNAPSHOT_PATH;
  const ttlMs = numericEnv("SHARKEDGE_LOCAL_BOARD_SNAPSHOT_CACHE_TTL_MS", DEFAULT_LOCAL_CACHE_TTL_MS);

  if (localCache?.key === snapshotPath && Date.now() - localCache.loadedAtMs < ttlMs) {
    return localCache.result;
  }

  try {
    const raw = await readFile(snapshotPath, "utf8");
    const snapshot = coerceSnapshot(JSON.parse(raw));
    const result = snapshot ? { origin: "local" as const, data: snapshot } : null;
    localCache = { key: snapshotPath, loadedAtMs: Date.now(), result };
    return result;
  } catch {
    localCache = { key: snapshotPath, loadedAtMs: Date.now(), result: null };
    return null;
  }
}

export async function loadBoardSnapshot(): Promise<SnapshotLoadResult | null> {
  return (await loadRemoteSnapshot()) ?? (await loadLocalSnapshot());
}

export function applyBoardSnapshotFilters(
  snapshot: BoardPageData,
  filters: BoardFilters,
  origin: SnapshotOrigin = "local"
): BoardPageData {
  const games = filterGames(snapshot.games ?? [], filters);
  const sportSections = filterSections(snapshot.sportSections ?? [], games, filters);
  const generatedAt = extractGeneratedAt(snapshot);
  const availableDates = Array.from(
    new Set([...(snapshot.availableDates ?? []), ...games.map((game) => game.startTime.slice(0, 10))])
  ).sort();

  return {
    ...snapshot,
    filters,
    availableDates,
    games,
    sportSections,
    summary: {
      totalGames: games.length,
      totalProps: snapshot.summary?.totalProps ?? 0,
      totalSportsbooks: snapshot.summary?.totalSportsbooks ?? snapshot.sportsbooks?.length ?? 0
    },
    liveMessage: null,
    source: snapshot.source === "live" ? "live" : "mock",
    sourceNote:
      origin === "remote"
        ? "Board is serving from a precomputed remote snapshot URL."
        : "Board is serving from public/data/latest-board.json.",
    providerHealth: buildProviderHealth(snapshot, origin, generatedAt)
  };
}

export async function getBoardSnapshotPageData(filters: BoardFilters): Promise<BoardPageData | null> {
  const result = await loadBoardSnapshot();
  if (!result) {
    return null;
  }

  return applyBoardSnapshotFilters(result.data, filters, result.origin);
}
