import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { getFreeNbaInjuryFeed } from "@/services/injuries/free-nba-injury-feed";
import { normalizeNbaTeam } from "@/services/simulation/nba-team-analytics";

export type PlayerStatus = "available" | "questionable" | "doubtful" | "out" | "unknown";

export type NbaPlayerImpactRecord = {
  playerName: string;
  teamName: string;
  status: PlayerStatus;
  minutesImpact: number;
  usageImpact: number;
  netRatingImpact: number;
  offensiveImpact: number;
  defensiveImpact: number;
  volatilityImpact: number;
  source?: "real" | "synthetic" | "free-official-nba" | "free-espn";
};

export type NbaLineupImpact = {
  teamName: string;
  players: NbaPlayerImpactRecord[];
  availabilityPenalty: number;
  offensivePenalty: number;
  defensivePenalty: number;
  usageShock: number;
  volatilityBoost: number;
  activeCoreHealth: number;
  summary: string;
};

export type NbaPlayerImpactSnapshot = {
  teams: Record<string, NbaPlayerImpactRecord[]>;
  lastUpdatedAt: string | null;
};

export type NbaPlayerImpactFeedHealth = {
  status: "GREEN" | "YELLOW" | "RED";
  hasFeedUrl: boolean;
  configuredEnv: "NBA_PLAYER_IMPACT_URL" | "NBA_INJURY_IMPACT_URL" | "FREE_NBA_INJURY_FEED" | null;
  feedFlowing: boolean;
  feedFresh: boolean;
  lastUpdatedAt: string | null;
  ageMinutes: number | null;
  teamCount: number;
  playerCount: number;
  blockers: string[];
  warnings: string[];
};

type RawPlayerImpact = {
  playerName?: string;
  teamName?: string;
  player?: string;
  name?: string;
  team?: string;
  team_name?: string;
  injury_status?: string;
  status?: string;
  minutesImpact?: number | string;
  usageImpact?: number | string;
  netRatingImpact?: number | string;
  offensiveImpact?: number | string;
  defensiveImpact?: number | string;
  volatilityImpact?: number | string;
  minutes_impact?: number | string;
  usage_impact?: number | string;
  net_rating_impact?: number | string;
  offensive_impact?: number | string;
  defensive_impact?: number | string;
  volatility_impact?: number | string;
  source?: NbaPlayerImpactRecord["source"];
};

const CACHE_KEY = "nba:player-impact:v2";
const LEGACY_CACHE_KEY = "nba:player-impact:v1";
const CACHE_TTL_SECONDS = 60 * 60 * 2;
const FEED_TIMEOUT_MS = 8000;
const FRESHNESS_WINDOW_MINUTES = 90;

function configuredImpactFeedEnv() {
  if (process.env.NBA_PLAYER_IMPACT_URL?.trim()) return "NBA_PLAYER_IMPACT_URL" as const;
  if (process.env.NBA_INJURY_IMPACT_URL?.trim()) return "NBA_INJURY_IMPACT_URL" as const;
  return null;
}

function configuredImpactFeedUrl() {
  return process.env.NBA_PLAYER_IMPACT_URL?.trim() || process.env.NBA_INJURY_IMPACT_URL?.trim() || null;
}

function isAllowedFeedUrl(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function statusFrom(value: unknown): PlayerStatus {
  const text = String(value ?? "unknown").toLowerCase();
  if (text.includes("available") || text.includes("probable") || text.includes("active")) return "available";
  if (text.includes("question")) return "questionable";
  if (text.includes("doubt")) return "doubtful";
  if (text.includes("out") || text.includes("inactive") || text.includes("suspend")) return "out";
  return "unknown";
}

function bounded(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function num(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function statusWeight(status: PlayerStatus) {
  if (status === "out") return 1;
  if (status === "doubtful") return 0.75;
  if (status === "questionable") return 0.42;
  if (status === "unknown") return 0.2;
  return 0;
}

function rowsFromBody(body: unknown): RawPlayerImpact[] {
  const payload = body as { players?: unknown; injuries?: unknown; data?: unknown } | null;
  if (Array.isArray(body)) return body as RawPlayerImpact[];
  if (Array.isArray(payload?.players)) return payload.players as RawPlayerImpact[];
  if (Array.isArray(payload?.injuries)) return payload.injuries as RawPlayerImpact[];
  if (Array.isArray(payload?.data)) return payload.data as RawPlayerImpact[];
  return [];
}

function parseDateString(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function timestampFromBody(body: unknown, fallback: string | null) {
  const payload = body as {
    lastUpdatedAt?: unknown;
    updatedAt?: unknown;
    generatedAt?: unknown;
    timestamp?: unknown;
    meta?: { lastUpdatedAt?: unknown; updatedAt?: unknown };
  } | null;
  return parseDateString(payload?.lastUpdatedAt)
    ?? parseDateString(payload?.updatedAt)
    ?? parseDateString(payload?.generatedAt)
    ?? parseDateString(payload?.timestamp)
    ?? parseDateString(payload?.meta?.lastUpdatedAt)
    ?? parseDateString(payload?.meta?.updatedAt)
    ?? fallback;
}

function normalizeRaw(row: RawPlayerImpact): NbaPlayerImpactRecord | null {
  const playerName = String(row.playerName ?? row.player ?? row.name ?? "").trim();
  const teamName = String(row.teamName ?? row.team ?? row.team_name ?? "").trim();
  if (!playerName || !teamName) return null;
  const status = statusFrom(row.status ?? row.injury_status);
  const baseMinutes = bounded(num(row.minutesImpact, row.minutes_impact) ?? 0, 0, 48);
  const baseUsage = bounded(num(row.usageImpact, row.usage_impact) ?? 0, -20, 20);
  const baseNet = bounded(num(row.netRatingImpact, row.net_rating_impact) ?? 0, -15, 15);
  const baseOff = bounded(num(row.offensiveImpact, row.offensive_impact) ?? baseNet * 0.55, -15, 15);
  const baseDef = bounded(num(row.defensiveImpact, row.defensive_impact) ?? baseNet * 0.45, -15, 15);
  const baseVol = bounded(num(row.volatilityImpact, row.volatility_impact) ?? Math.abs(baseUsage) / 8, 0, 5);
  return {
    playerName,
    teamName,
    status,
    minutesImpact: baseMinutes,
    usageImpact: baseUsage,
    netRatingImpact: baseNet,
    offensiveImpact: baseOff,
    defensiveImpact: baseDef,
    volatilityImpact: baseVol,
    source: row.source ?? "real"
  };
}

function isSnapshot(value: unknown): value is NbaPlayerImpactSnapshot {
  return Boolean(value && typeof value === "object" && "teams" in value && typeof (value as { teams?: unknown }).teams === "object");
}

function minutesOld(value: string | null | undefined, now = new Date()) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.round((now.getTime() - date.getTime()) / 60000);
}

function snapshotCounts(snapshot: NbaPlayerImpactSnapshot | null) {
  const teamCount = Object.keys(snapshot?.teams ?? {}).length;
  const playerCount = Object.values(snapshot?.teams ?? {}).reduce((total, rows) => total + rows.length, 0);
  return { teamCount, playerCount };
}

export function classifyNbaPlayerImpactFeedHealth(args: {
  snapshot: NbaPlayerImpactSnapshot | null;
  hasFeedUrl: boolean;
  configuredEnv?: NbaPlayerImpactFeedHealth["configuredEnv"];
  now?: Date;
}): NbaPlayerImpactFeedHealth {
  const { teamCount, playerCount } = snapshotCounts(args.snapshot);
  const lastUpdatedAt = args.snapshot?.lastUpdatedAt ?? null;
  const ageMinutes = minutesOld(lastUpdatedAt, args.now ?? new Date());
  const feedFlowing = Boolean(args.snapshot && teamCount > 0 && playerCount > 0);
  const feedFresh = typeof ageMinutes === "number" && ageMinutes >= 0 && ageMinutes <= FRESHNESS_WINDOW_MINUTES;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!args.hasFeedUrl) blockers.push("NBA injury/player-impact feed URL is not configured.");
  if (args.hasFeedUrl && !feedFlowing) blockers.push("NBA injury/player-impact feed is configured but returned no usable players.");
  if (feedFlowing && !lastUpdatedAt) blockers.push("NBA injury/player-impact feed has no usable lastUpdatedAt timestamp.");
  if (typeof ageMinutes === "number" && ageMinutes < 0) blockers.push("NBA injury/player-impact feed timestamp is in the future.");
  if (feedFlowing && lastUpdatedAt && !feedFresh) blockers.push(`NBA injury/player-impact feed is stale (${ageMinutes} minutes old).`);
  if (feedFlowing && teamCount < 20) warnings.push(`NBA injury/player-impact feed only covers ${teamCount} teams.`);
  if (feedFlowing && playerCount < 100) warnings.push(`NBA injury/player-impact feed only has ${playerCount} players.`);

  const status: NbaPlayerImpactFeedHealth["status"] = blockers.length
    ? "RED"
    : warnings.length
      ? "YELLOW"
      : "GREEN";

  return {
    status,
    hasFeedUrl: args.hasFeedUrl,
    configuredEnv: args.configuredEnv ?? null,
    feedFlowing,
    feedFresh,
    lastUpdatedAt,
    ageMinutes,
    teamCount,
    playerCount,
    blockers,
    warnings
  };
}

async function fetchJsonWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function snapshotFromFreeFeed(): Promise<NbaPlayerImpactSnapshot | null> {
  const feed = await getFreeNbaInjuryFeed().catch(() => null);
  if (!feed?.ok) return null;
  const grouped: Record<string, NbaPlayerImpactRecord[]> = {};
  for (const player of feed.players) {
    const record = normalizeRaw({
      ...player,
      status: player.status,
      source: player.source === "official-nba" ? "free-official-nba" : "free-espn"
    });
    if (!record) continue;
    const key = normalizeNbaTeam(record.teamName);
    grouped[key] = [...(grouped[key] ?? []), record];
  }
  if (!Object.keys(grouped).length) return null;
  return { teams: grouped, lastUpdatedAt: feed.lastUpdatedAt ?? feed.generatedAt };
}

async function fetchPlayerImpactSnapshot(): Promise<NbaPlayerImpactSnapshot | null> {
  const cached = await readHotCache<NbaPlayerImpactSnapshot | Record<string, NbaPlayerImpactRecord[]>>(CACHE_KEY);
  if (isSnapshot(cached)) return cached;
  if (cached && typeof cached === "object" && Object.keys(cached).length) {
    return { teams: cached as Record<string, NbaPlayerImpactRecord[]>, lastUpdatedAt: null };
  }

  const legacy = await readHotCache<Record<string, NbaPlayerImpactRecord[]>>(LEGACY_CACHE_KEY);
  if (legacy && Object.keys(legacy).length) return { teams: legacy, lastUpdatedAt: null };

  const url = configuredImpactFeedUrl();
  if (isAllowedFeedUrl(url)) {
    try {
      const response = await fetchJsonWithTimeout(url!);
      if (response.ok) {
        const body: unknown = await response.json();
        const grouped: Record<string, NbaPlayerImpactRecord[]> = {};
        for (const row of rowsFromBody(body)) {
          const record = normalizeRaw(row);
          if (!record) continue;
          const key = normalizeNbaTeam(record.teamName);
          grouped[key] = [...(grouped[key] ?? []), record];
        }
        if (Object.keys(grouped).length) {
          const lastModified = response.headers.get("last-modified");
          const snapshot = {
            teams: grouped,
            lastUpdatedAt: timestampFromBody(body, parseDateString(lastModified))
          } satisfies NbaPlayerImpactSnapshot;
          await writeHotCache(CACHE_KEY, snapshot, CACHE_TTL_SECONDS);
          return snapshot;
        }
      }
    } catch {
      // Fall through to free no-key sources.
    }
  }

  const freeSnapshot = await snapshotFromFreeFeed();
  if (freeSnapshot) {
    await writeHotCache(CACHE_KEY, freeSnapshot, CACHE_TTL_SECONDS);
    return freeSnapshot;
  }
  return null;
}

function syntheticImpact(teamName: string): NbaLineupImpact {
  return {
    teamName,
    players: [],
    availabilityPenalty: 0,
    offensivePenalty: 0,
    defensivePenalty: 0,
    usageShock: 0,
    volatilityBoost: 1,
    activeCoreHealth: 100,
    summary: "No confirmed injury-impact feed available; lineup model is neutral."
  };
}

function buildLineupImpact(teamName: string, players: NbaPlayerImpactRecord[]): NbaLineupImpact {
  if (!players.length) return syntheticImpact(teamName);

  const unavailable = players.filter((player) => statusWeight(player.status) > 0);
  const availabilityPenalty = unavailable.reduce((sum, player) => sum + Math.abs(player.netRatingImpact) * statusWeight(player.status), 0);
  const offensivePenalty = unavailable.reduce((sum, player) => sum + Math.abs(player.offensiveImpact) * statusWeight(player.status), 0);
  const defensivePenalty = unavailable.reduce((sum, player) => sum + Math.abs(player.defensiveImpact) * statusWeight(player.status), 0);
  const usageShock = unavailable.reduce((sum, player) => sum + Math.abs(player.usageImpact) * statusWeight(player.status), 0);
  const volatilityBoost = Math.min(1.45, 1 + unavailable.reduce((sum, player) => sum + Math.abs(player.volatilityImpact) * statusWeight(player.status), 0) / 10);
  const activeCoreHealth = Math.max(0, Math.round(100 - availabilityPenalty * 5 - usageShock * 1.5));
  const top = unavailable.sort((a, b) => Math.abs(b.netRatingImpact) - Math.abs(a.netRatingImpact))[0];

  return {
    teamName,
    players,
    availabilityPenalty: Number(availabilityPenalty.toFixed(2)),
    offensivePenalty: Number(offensivePenalty.toFixed(2)),
    defensivePenalty: Number(defensivePenalty.toFixed(2)),
    usageShock: Number(usageShock.toFixed(2)),
    volatilityBoost: Number(volatilityBoost.toFixed(2)),
    activeCoreHealth,
    summary: top ? `${top.playerName} ${top.status} is the largest lineup-impact flag.` : "Lineup impact is light."
  };
}

export async function getNbaPlayerImpactSnapshot(): Promise<NbaPlayerImpactSnapshot | null> {
  return fetchPlayerImpactSnapshot();
}

export async function getNbaPlayerImpactFeedHealth(): Promise<NbaPlayerImpactFeedHealth> {
  const configuredEnv = configuredImpactFeedEnv();
  const snapshot = await fetchPlayerImpactSnapshot();
  return classifyNbaPlayerImpactFeedHealth({
    snapshot,
    hasFeedUrl: configuredEnv !== null || Boolean(snapshot),
    configuredEnv: configuredEnv ?? (snapshot ? "FREE_NBA_INJURY_FEED" : null)
  });
}

export async function getNbaLineupImpact(teamName: string): Promise<NbaLineupImpact> {
  const snapshot = await fetchPlayerImpactSnapshot();
  const players = snapshot?.teams?.[normalizeNbaTeam(teamName)] ?? [];
  return buildLineupImpact(teamName, players);
}
