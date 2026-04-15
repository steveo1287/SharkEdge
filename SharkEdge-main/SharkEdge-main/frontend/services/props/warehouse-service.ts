import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db/prisma";
import type {
  BoardSupportStatus,
  LeagueKey,
  PlayerRecord,
  PropCardView,
  PropFilters,
  PropMarketType,
  SportsbookRecord,
  TeamRecord
} from "@/lib/types/domain";
import { calculateEdgeScore } from "@/lib/utils/edge-score";
import { calculateMarketExpectedValuePct } from "@/lib/utils/bet-intelligence";
import { buildMatchupHref } from "@/lib/utils/matchups";
import { americanToDecimal, americanToImpliedProbability } from "@/lib/utils/odds";
import { getBackendBaseUrl } from "@/services/backend/base-url";

const PROP_ARCHIVE_DIR = path.join(process.cwd(), "data", "props-board");
const PROP_CACHE_WINDOW_MS = 60_000;
const PROP_FETCH_TIMEOUT_MS = 20_000;
const MAX_RECENT_EVENTS = 150;
const PROPS_USER_AGENT =
  process.env.SHARKEDGE_PROPS_USER_AGENT?.trim() ??
  "Mozilla/5.0 SharkEdgePropsWorker/1.0";

const LEAGUE_CONFIG = {
  NBA: {
    sportKey: "basketball_nba",
    leagueName: "NBA",
    sportKeyName: "basketball",
    sportName: "Basketball",
    sportCode: "BASKETBALL" as const
  },
  NCAAB: {
    sportKey: "basketball_ncaab",
    leagueName: "NCAA Men's Basketball",
    sportKeyName: "basketball",
    sportName: "Basketball",
    sportCode: "BASKETBALL" as const
  }
};

type SupportedPropLeagueKey = keyof typeof LEAGUE_CONFIG;

type BackendProp = {
  id: string;
  event_id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmaker_key: string;
  bookmaker_title: string;
  market_key: PropMarketType;
  player_name: string;
  player_external_id?: string | null;
  player_position?: string | null;
  team_name?: string | null;
  opponent_name?: string | null;
  team_resolved: boolean;
  side: string;
  line: number;
  price: number;
  last_update?: string | null;
};

type BackendPropsSport = {
  key: string;
  title: string;
  short_title: string;
  event_count: number;
  game_count: number;
  prop_count: number;
  event_limit: number;
  events_scanned: number;
  partial: boolean;
  props: BackendProp[];
  errors: string[];
};

type BackendPropsBoardResponse = {
  configured: boolean;
  generated_at: string;
  bookmakers?: string;
  errors?: string[];
  prop_count: number;
  event_limit: number;
  partial: boolean;
  quota_note?: string;
  sports: BackendPropsSport[];
};

type PropWarehouseSyncArgs = {
  league?: SupportedPropLeagueKey | "ALL";
  eventId?: string;
  maxEvents?: number;
  lookaheadHours?: number;
  dryRun?: boolean;
};

type PropWarehouseBackfillArgs = {
  league?: SupportedPropLeagueKey | "ALL";
  from?: string;
  to?: string;
  dryRun?: boolean;
};

type PropWarehouseSyncResult = {
  ok: true;
  generatedAt: string;
  dryRun: boolean;
  leagues: string[];
  archivedFiles: string[];
  fetchedBoardCount: number;
  scannedProps: number;
  storedRows: number;
  storedSnapshots: number;
  skippedRows: number;
  warnings: string[];
};

type StoredPropCardOptions = {
  supportStatus?: BoardSupportStatus;
  supportNote?: string | null;
};

type PropAnalyticsSummary = {
  sampleSize: number | null;
  hitRatePct: number | null;
  avgStat: number | null;
  avgMinutes: number | null;
  recentFormDelta: number | null;
  tags: string[];
  reason: string;
};

const fetchCache = new Map<string, { expiresAt: number; payload: BackendPropsBoardResponse }>();
let lastFetchAt = 0;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeToken(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function deriveAbbreviation(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);

  if (parts.length >= 2) {
    return parts
      .slice(0, 3)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
}

function average(values: number[]) {
  return values.length
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
    : null;
}

function getStatKeys(marketType: PropMarketType) {
  switch (marketType) {
    case "player_points":
      return ["points", "PTS", "points_per_game"];
    case "player_rebounds":
      return ["rebounds", "REB", "total_rebounds"];
    case "player_assists":
      return ["assists", "AST"];
    case "player_threes":
      return ["threes", "FG3M", "3PM"];
    default:
      return [];
  }
}

function getNumericStat(stats: unknown, keys: string[]) {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
    return null;
  }

  const record = stats as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function formatSigned(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pacedFetchJson(pathname: string) {
  const cached = fetchCache.get(pathname);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.payload;
  }

  const waitMs = Math.max(0, 900 + Math.floor(Math.random() * 700) - (now - lastFetchAt));
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  const headers: Record<string, string> = {
    "User-Agent": PROPS_USER_AGENT,
    Accept: "application/json",
    "Cache-Control": "no-cache"
  };

  if (process.env.SHARKEDGE_API_KEY?.trim()) {
    headers["x-api-key"] = process.env.SHARKEDGE_API_KEY.trim();
  }

  let attempt = 0;
  let lastError: Error | null = null;
  while (attempt < 3) {
    attempt += 1;
    try {
      const response = await fetch(`${getBackendBaseUrl()}${pathname}`, {
        cache: "no-store",
        headers,
        signal: AbortSignal.timeout(PROP_FETCH_TIMEOUT_MS)
      });

      if (!response.ok) {
        throw new Error(`Props backend returned ${response.status} for ${pathname}`);
      }

      const payload = (await response.json()) as BackendPropsBoardResponse;
      lastFetchAt = Date.now();
      fetchCache.set(pathname, {
        expiresAt: lastFetchAt + PROP_CACHE_WINDOW_MS,
        payload
      });
      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown prop fetch error.");
      await sleep(600 * attempt);
    }
  }

  throw lastError ?? new Error(`Unable to fetch ${pathname}`);
}

function getSupportedLeagues(requested?: SupportedPropLeagueKey | "ALL") {
  if (!requested || requested === "ALL") {
    return Object.keys(LEAGUE_CONFIG) as SupportedPropLeagueKey[];
  }

  return [requested];
}

async function ensureArchive(payload: BackendPropsBoardResponse, leagueKey: SupportedPropLeagueKey) {
  const stamp = (payload.generated_at ?? new Date().toISOString()).replace(/[:.]/g, "-");
  const datedDir = path.join(PROP_ARCHIVE_DIR, stamp.slice(0, 10));
  await mkdir(datedDir, { recursive: true });
  const filePath = path.join(datedDir, `${leagueKey.toLowerCase()}-${stamp}.json`);
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

async function ensureLeagueAndSport(leagueKey: SupportedPropLeagueKey) {
  const config = LEAGUE_CONFIG[leagueKey];

  const sport = await prisma.sport.upsert({
    where: { key: config.sportKeyName },
    update: {
      name: config.sportName,
      code: config.sportCode,
      category: "team"
    },
    create: {
      key: config.sportKeyName,
      name: config.sportName,
      code: config.sportCode,
      category: "team"
    }
  });

  const league = await prisma.league.upsert({
    where: { key: leagueKey },
    update: {
      name: config.leagueName,
      sport: config.sportCode,
      sportId: sport.id
    },
    create: {
      key: leagueKey,
      name: config.leagueName,
      sport: config.sportCode,
      sportId: sport.id
    }
  });

  return { sport, league };
}

async function ensureTeam(leagueId: string, teamName: string, source: string) {
  const normalized = normalizeText(teamName);
  const existingAlias = await prisma.teamAlias.findFirst({
    where: { normalizedAlias: normalized },
    include: { team: true }
  });
  if (existingAlias?.team) {
    return existingAlias.team;
  }

  const existingTeam = await prisma.team.findFirst({
    where: {
      leagueId,
      OR: [
        { name: { equals: teamName, mode: "insensitive" } },
        { abbreviation: deriveAbbreviation(teamName) }
      ]
    }
  });

  const team =
    existingTeam ??
    (await prisma.team.create({
      data: {
        leagueId,
        key: `${leagueId}:${normalizeToken(teamName)}`,
        name: teamName,
        abbreviation: deriveAbbreviation(teamName),
        externalIds: {
          source,
          rawName: teamName
        }
      }
    }));

  await prisma.teamAlias.upsert({
    where: {
      source_normalizedAlias: {
        source,
        normalizedAlias: normalized
      }
    },
    update: {
      alias: teamName,
      teamId: team.id
    },
    create: {
      teamId: team.id,
      source,
      alias: teamName,
      normalizedAlias: normalized
    }
  });

  return team;
}

async function ensureGame(args: {
  leagueId: string;
  eventId: string;
  startTime: string;
  homeTeamId: string;
  awayTeamId: string;
}) {
  return prisma.game.upsert({
    where: {
      externalEventId: args.eventId
    },
    update: {
      leagueId: args.leagueId,
      startTime: new Date(args.startTime),
      homeTeamId: args.homeTeamId,
      awayTeamId: args.awayTeamId,
      status: "PREGAME",
      venue: "Worker-synced prop market",
      liveStateJson: {
        source: "props-backend-worker",
        lastPropSyncAt: new Date().toISOString()
      }
    },
    create: {
      leagueId: args.leagueId,
      externalEventId: args.eventId,
      startTime: new Date(args.startTime),
      homeTeamId: args.homeTeamId,
      awayTeamId: args.awayTeamId,
      status: "PREGAME",
      venue: "Worker-synced prop market",
      liveStateJson: {
        source: "props-backend-worker",
        lastPropSyncAt: new Date().toISOString()
      }
    }
  });
}

async function ensureSportsbook(bookmakerKey: string, bookmakerTitle: string) {
  return prisma.sportsbook.upsert({
    where: { key: bookmakerKey },
    update: {
      name: bookmakerTitle,
      region: "US",
      isActive: true
    },
    create: {
      key: bookmakerKey,
      name: bookmakerTitle,
      region: "US",
      isActive: true
    }
  });
}

async function ensurePlayer(args: {
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  defaultTeamId: string;
  playerName: string;
  playerExternalId?: string | null;
  position?: string | null;
  source: string;
}) {
  const normalized = normalizeText(args.playerName);
  const alias = await prisma.playerAlias.findFirst({
    where: { normalizedAlias: normalized },
    include: { player: true }
  });
  if (alias?.player) {
    return alias.player;
  }

  const existing = await prisma.player.findFirst({
    where: {
      leagueId: args.leagueId,
      name: { equals: args.playerName, mode: "insensitive" },
      teamId: {
        in: [args.homeTeamId, args.awayTeamId]
      }
    }
  });
  if (existing) {
    await prisma.playerAlias.upsert({
      where: {
        source_normalizedAlias: {
          source: args.source,
          normalizedAlias: normalized
        }
      },
      update: {
        alias: args.playerName,
        playerId: existing.id
      },
      create: {
        playerId: existing.id,
        source: args.source,
        alias: args.playerName,
        normalizedAlias: normalized
      }
    });
    return existing;
  }

  const player = await prisma.player.create({
    data: {
      leagueId: args.leagueId,
      teamId: args.defaultTeamId,
      key: `${args.defaultTeamId}:${normalizeToken(args.playerName)}`,
      name: args.playerName,
      firstName: args.playerName.split(" ").slice(0, -1).join(" ") || null,
      lastName: args.playerName.split(" ").at(-1) ?? null,
      position: args.position ?? "N/A",
      status: "ACTIVE",
      externalIds: {
        source: args.source,
        externalPlayerId: args.playerExternalId ?? null
      }
    }
  });

  await prisma.playerAlias.create({
    data: {
      playerId: player.id,
      source: args.source,
      alias: args.playerName,
      normalizedAlias: normalized
    }
  });

  return player;
}

async function upsertMarketAndSnapshot(args: {
  gameId: string;
  sportsbookId: string;
  playerId: string;
  marketType: PropMarketType;
  side: string;
  line: number;
  price: number;
  capturedAt: Date;
}) {
  const existing = await prisma.market.findFirst({
    where: {
      gameId: args.gameId,
      sportsbookId: args.sportsbookId,
      marketType: args.marketType,
      playerId: args.playerId,
      side: args.side,
      line: args.line
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  const market =
    existing
      ? await prisma.market.update({
          where: { id: existing.id },
          data: {
            oddsAmerican: args.price,
            oddsDecimal: americanToDecimal(args.price),
            impliedProbability: americanToImpliedProbability(args.price) ?? 0,
            isLive: false,
            updatedAt: args.capturedAt
          }
        })
      : await prisma.market.create({
          data: {
            gameId: args.gameId,
            sportsbookId: args.sportsbookId,
            marketType: args.marketType,
            period: "full_game",
            side: args.side,
            playerId: args.playerId,
            line: args.line,
            oddsAmerican: args.price,
            oddsDecimal: americanToDecimal(args.price),
            impliedProbability: americanToImpliedProbability(args.price) ?? 0,
            isLive: false,
            updatedAt: args.capturedAt
          }
        });

  const latestSnapshot = await prisma.marketSnapshot.findFirst({
    where: {
      marketId: market.id
    },
    orderBy: {
      capturedAt: "desc"
    }
  });

  if (
    !latestSnapshot ||
    latestSnapshot.oddsAmerican !== args.price ||
    latestSnapshot.line !== args.line
  ) {
    await prisma.marketSnapshot.create({
      data: {
        marketId: market.id,
        capturedAt: args.capturedAt,
        line: args.line,
        oddsAmerican: args.price,
        impliedProbability: americanToImpliedProbability(args.price) ?? 0
      }
    });
    return { marketId: market.id, snapshotStored: true };
  }

  return { marketId: market.id, snapshotStored: false };
}

function shouldIncludeProp(
  prop: BackendProp,
  args: {
    eventId?: string;
    lookaheadHours: number;
  }
) {
  if (args.eventId && prop.event_id !== args.eventId) {
    return false;
  }

  const eventTime = Date.parse(prop.commence_time);
  if (!Number.isFinite(eventTime)) {
    return true;
  }

  const diffHours = (eventTime - Date.now()) / (1000 * 60 * 60);
  return diffHours <= args.lookaheadHours && diffHours >= -8;
}

async function ingestBoardPayload(
  payload: BackendPropsBoardResponse,
  leagueKey: SupportedPropLeagueKey,
  args: PropWarehouseSyncArgs
) {
  const warnings: string[] = [...(payload.errors ?? [])];
  let storedRows = 0;
  let storedSnapshots = 0;
  let skippedRows = 0;
  const scannedProps = payload.sports.flatMap((sport) => sport.props ?? []);
  const filteredProps = scannedProps.filter((prop) =>
    shouldIncludeProp(prop, {
      eventId: args.eventId,
      lookaheadHours: args.lookaheadHours ?? 36
    })
  );

  if (args.dryRun) {
    return {
      scannedProps: filteredProps.length,
      storedRows,
      storedSnapshots,
      skippedRows,
      warnings
    };
  }

  const { league } = await ensureLeagueAndSport(leagueKey);

  for (const prop of filteredProps) {
    try {
      const capturedAt = new Date(prop.last_update ?? payload.generated_at ?? new Date().toISOString());
      const homeTeam = await ensureTeam(league.id, prop.home_team, "props_backend");
      const awayTeam = await ensureTeam(league.id, prop.away_team, "props_backend");
      const defaultTeam =
        prop.team_name && normalizeText(prop.team_name) === normalizeText(prop.away_team)
          ? awayTeam
          : prop.team_name && normalizeText(prop.team_name) === normalizeText(prop.home_team)
            ? homeTeam
            : homeTeam;
      const player = await ensurePlayer({
        leagueId: league.id,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        defaultTeamId: defaultTeam.id,
        playerName: prop.player_name,
        playerExternalId: prop.player_external_id ?? null,
        position: prop.player_position ?? null,
        source: prop.team_resolved ? "props_backend" : "props_backend_pending"
      });
      const game = await ensureGame({
        leagueId: league.id,
        eventId: prop.event_id,
        startTime: prop.commence_time,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id
      });
      const sportsbook = await ensureSportsbook(prop.bookmaker_key, prop.bookmaker_title);
      const result = await upsertMarketAndSnapshot({
        gameId: game.id,
        sportsbookId: sportsbook.id,
        playerId: player.id,
        marketType: prop.market_key,
        side: prop.side.toLowerCase(),
        line: prop.line,
        price: prop.price,
        capturedAt
      });

      storedRows += 1;
      if (result.snapshotStored) {
        storedSnapshots += 1;
      }
    } catch (error) {
      skippedRows += 1;
      warnings.push(
        `Skipped ${prop.player_name} ${prop.market_key} ${prop.side}: ${
          error instanceof Error ? error.message : "unknown ingestion error"
        }`
      );
    }
  }

  return {
    scannedProps: filteredProps.length,
    storedRows,
    storedSnapshots,
    skippedRows,
    warnings
  };
}

export async function syncPropWarehouse(
  args: PropWarehouseSyncArgs = {}
): Promise<PropWarehouseSyncResult> {
  const leagues = getSupportedLeagues(args.league);
  const archivedFiles: string[] = [];
  const warnings: string[] = [];
  let fetchedBoardCount = 0;
  let scannedProps = 0;
  let storedRows = 0;
  let storedSnapshots = 0;
  let skippedRows = 0;

  for (const leagueKey of leagues) {
    const config = LEAGUE_CONFIG[leagueKey];
    const query = new URLSearchParams({
      sport_key: config.sportKey,
      max_events: String(args.maxEvents ?? 4)
    });
    const payload = await pacedFetchJson(`/api/props/board?${query.toString()}`);
    fetchedBoardCount += 1;

    if (!payload.configured) {
      warnings.push(`${leagueKey}: props backend is not configured.`);
      continue;
    }

    if (!args.dryRun) {
      archivedFiles.push(await ensureArchive(payload, leagueKey));
    }

    const result = await ingestBoardPayload(payload, leagueKey, args);
    scannedProps += result.scannedProps;
    storedRows += result.storedRows;
    storedSnapshots += result.storedSnapshots;
    skippedRows += result.skippedRows;
    warnings.push(...result.warnings);
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    dryRun: Boolean(args.dryRun),
    leagues,
    archivedFiles,
    fetchedBoardCount,
    scannedProps,
    storedRows,
    storedSnapshots,
    skippedRows,
    warnings
  };
}

function withinRange(isoString: string, from?: Date | null, to?: Date | null) {
  const parsed = Date.parse(isoString);
  if (!Number.isFinite(parsed)) {
    return false;
  }
  if (from && parsed < from.getTime()) {
    return false;
  }
  if (to && parsed > to.getTime()) {
    return false;
  }
  return true;
}

export async function backfillPropWarehouse(
  args: PropWarehouseBackfillArgs = {}
): Promise<PropWarehouseSyncResult> {
  await mkdir(PROP_ARCHIVE_DIR, { recursive: true });
  const datedDirs = await readdir(PROP_ARCHIVE_DIR, { withFileTypes: true });
  const from = args.from ? new Date(args.from) : null;
  const to = args.to ? new Date(args.to) : null;
  const requestedLeagues = new Set(getSupportedLeagues(args.league));

  const archivedFiles: string[] = [];
  const warnings: string[] = [];
  let fetchedBoardCount = 0;
  let scannedProps = 0;
  let storedRows = 0;
  let storedSnapshots = 0;
  let skippedRows = 0;

  for (const datedDir of datedDirs) {
    if (!datedDir.isDirectory()) {
      continue;
    }

    const fullDir = path.join(PROP_ARCHIVE_DIR, datedDir.name);
    const files = await readdir(fullDir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".json")) {
        continue;
      }

      const leagueKey = file.name.split("-")[0]?.toUpperCase() as SupportedPropLeagueKey;
      if (!requestedLeagues.has(leagueKey)) {
        continue;
      }

      const fullPath = path.join(fullDir, file.name);
      const payload = JSON.parse(await readFile(fullPath, "utf8")) as BackendPropsBoardResponse;
      if (!withinRange(payload.generated_at ?? "", from, to)) {
        continue;
      }

      archivedFiles.push(fullPath);
      fetchedBoardCount += 1;
      const result = await ingestBoardPayload(payload, leagueKey, {
        league: leagueKey,
        dryRun: args.dryRun
      });
      scannedProps += result.scannedProps;
      storedRows += result.storedRows;
      storedSnapshots += result.storedSnapshots;
      skippedRows += result.skippedRows;
      warnings.push(...result.warnings);
    }
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    dryRun: Boolean(args.dryRun),
    leagues: Array.from(requestedLeagues),
    archivedFiles,
    fetchedBoardCount,
    scannedProps,
    storedRows,
    storedSnapshots,
    skippedRows,
    warnings
  };
}

async function getRecentPlayerAnalytics(
  playerId: string,
  marketType: PropMarketType,
  line: number
): Promise<PropAnalyticsSummary> {
  const keys = getStatKeys(marketType);
  if (!keys.length) {
    return {
      sampleSize: null,
      hitRatePct: null,
      avgStat: null,
      avgMinutes: null,
      recentFormDelta: null,
      tags: [],
      reason: "Historic player stat mapping is not wired for this market yet."
    };
  }

  const stats = await prisma.playerGameStat.findMany({
    where: {
      playerId
    },
    include: {
      game: {
        select: {
          startTime: true
        }
      }
    },
    orderBy: {
      game: {
        startTime: "desc"
      }
    },
    take: 10
  });

  const values = stats
    .map((row) => getNumericStat(row.statsJson, keys))
    .filter((value): value is number => value !== null);
  const minutes = stats
    .map((row) => row.minutes)
    .filter((value): value is number => typeof value === "number");
  const recentValues = values.slice(0, 5);
  const sampleSize = values.length;
  const avgStat = average(values);
  const recentAverage = average(recentValues);
  const hitCount = values.filter((value) => value >= line).length;
  const hitRatePct =
    sampleSize > 0 ? Number(((hitCount / sampleSize) * 100).toFixed(1)) : null;
  const recentFormDelta =
    avgStat !== null && recentAverage !== null
      ? Number((recentAverage - avgStat).toFixed(2))
      : null;

  const tags: string[] = [];
  if (sampleSize >= 10) {
    tags.push("10-game floor");
  }
  if (hitRatePct !== null && hitRatePct >= 60 && sampleSize >= 10) {
    tags.push("hit-rate backed");
  }
  if (recentFormDelta !== null && recentFormDelta >= 1.5) {
    tags.push("role uptick");
  }
  if (average(minutes) !== null && (average(minutes) ?? 0) >= 28) {
    tags.push("stable minutes");
  }

  const reason =
    sampleSize >= 10 && hitRatePct !== null
      ? `${hitCount}/${sampleSize} recent games cleared this line proxy, with ${recentAverage !== null ? `${recentAverage.toFixed(1)} over the last five.` : "a real recent sample behind it."}`
      : "Recent player sample is still thin, so SharkEdge is showing market context first.";

  return {
    sampleSize: sampleSize || null,
    hitRatePct,
    avgStat,
    avgMinutes: average(minutes),
    recentFormDelta,
    tags,
    reason
  };
}

function buildSupportStatus(updatedAt: Date): BoardSupportStatus {
  const ageMs = Date.now() - updatedAt.getTime();
  if (ageMs <= 20 * 60 * 1000) {
    return "LIVE";
  }
  if (ageMs <= 6 * 60 * 60 * 1000) {
    return "PARTIAL";
  }
  return "COMING_SOON";
}

async function getStoredMarketRows(filters?: Partial<PropFilters>, eventExternalId?: string) {
  const where: Record<string, unknown> = {
    marketType: {
      in: ["player_points", "player_rebounds", "player_assists", "player_threes"]
    }
  };

  if (eventExternalId) {
    where.game = {
      externalEventId: eventExternalId
    };
  } else {
    where.game = {
      startTime: {
        gte: new Date(Date.now() - 8 * 60 * 60 * 1000)
      }
    };
  }

  if (filters?.league && filters.league !== "ALL") {
    where.game = {
      ...(where.game as Record<string, unknown>),
      league: {
        key: filters.league
      }
    };
  }

  const rows = await prisma.market.findMany({
    where: where as never,
    include: {
      sportsbook: true,
      player: {
        include: {
          team: true,
          league: true
        }
      },
      game: {
        include: {
          league: true,
          homeTeam: true,
          awayTeam: true
        }
      },
      snapshots: {
        orderBy: {
          capturedAt: "desc"
        },
        take: 12
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: MAX_RECENT_EVENTS * 12
  });

  return rows
    .filter(
      (
        row
      ): row is (typeof rows)[number] & {
        player: NonNullable<(typeof rows)[number]["player"]>;
      } => row.playerId !== null && row.player !== null
    )
    .filter((row) =>
      filters?.marketType && filters.marketType !== "ALL" ? row.marketType === filters.marketType : true
    )
    .filter((row) => (filters?.team && filters.team !== "all" ? row.player.teamId === filters.team : true))
    .filter((row) => (filters?.player && filters.player !== "all" ? row.playerId === filters.player : true))
    .filter((row) =>
      filters?.sportsbook && filters.sportsbook !== "all"
        ? row.sportsbook.key === filters.sportsbook
        : true
    );
}

async function getStoredPropGroups(filters?: Partial<PropFilters>, eventExternalId?: string) {
  const rows = await getStoredMarketRows(filters, eventExternalId);

  return rows.reduce<{ key: string; rows: typeof rows }[]>((groups, row) => {
    const key = [row.game.externalEventId, row.playerId, row.marketType, row.side].join(":");
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.push({
        key,
        rows: [row]
      });
    }
    return groups;
  }, []);
}

async function buildStoredPropCard(
  group: Awaited<ReturnType<typeof getStoredPropGroups>>[number],
  options: StoredPropCardOptions = {}
): Promise<PropCardView | null> {
  const bestRow = [...group.rows].sort((left, right) => right.oddsAmerican - left.oddsAmerican)[0];
  if (!bestRow || !bestRow.playerId || !bestRow.player) {
    return null;
  }
  const bestRowPlayer = bestRow.player;
  const bestRowPlayerTeam = bestRowPlayer.team;
  if (!bestRowPlayerTeam) {
    return null;
  }

  const firstSnapshot = bestRow.snapshots.at(-1) ?? null;
  const latestSnapshot = bestRow.snapshots[0] ?? null;
  const averageOdds = average(group.rows.map((row) => row.oddsAmerican));
  const marketDeltaAmerican =
    averageOdds !== null ? Number((bestRow.oddsAmerican - averageOdds).toFixed(2)) : null;
  const lineMovement =
    firstSnapshot && latestSnapshot
      ? Number(
          ((latestSnapshot.line ?? bestRow.line ?? 0) - (firstSnapshot.line ?? bestRow.line ?? 0)).toFixed(2)
        )
      : null;
  const analytics = await getRecentPlayerAnalytics(
    bestRow.playerId,
    bestRow.marketType as PropMarketType,
    bestRow.line ?? 0
  );
  const supportStatus = options.supportStatus ?? buildSupportStatus(bestRow.updatedAt);
  const tags = new Set<string>(analytics.tags);
  if (group.rows.length >= 3) {
    tags.add("multi-book");
  }
  if ((marketDeltaAmerican ?? 0) >= 8) {
    tags.add("best price");
  }
  if ((marketDeltaAmerican ?? 0) >= 12) {
    tags.add("market lag");
  }
  if (Math.abs(lineMovement ?? 0) >= 0.5) {
    tags.add("line movement");
  }

  const reasonBits = [
    (marketDeltaAmerican ?? 0) >= 12
      ? `Best price is ${formatSigned(marketDeltaAmerican ?? 0, 0)} cents clear of the board average.`
      : (marketDeltaAmerican ?? 0) >= 6
        ? "This number is still better than the current board average."
        : null,
    Math.abs(lineMovement ?? 0) >= 0.5
      ? `Tracked line has moved ${formatSigned(lineMovement ?? 0, 1)} since the first stored snapshot.`
      : null,
    analytics.reason
  ].filter(Boolean) as string[];

  const impliedProbability = americanToImpliedProbability(bestRow.oddsAmerican);
  const modelProbability =
    analytics.hitRatePct !== null && analytics.sampleSize && analytics.sampleSize >= 10
      ? Math.min(0.92, Math.max(0.08, analytics.hitRatePct / 100))
      : typeof averageOdds === "number"
        ? americanToImpliedProbability(averageOdds)
        : impliedProbability;
  const expectedValuePct = calculateMarketExpectedValuePct(
    bestRow.oddsAmerican,
    typeof averageOdds === "number" ? averageOdds : null
  );
  const valueFlag =
    Math.abs(lineMovement ?? 0) >= 1
      ? "STEAM"
      : (marketDeltaAmerican ?? 0) >= 10
        ? "MARKET_PLUS"
        : group.rows.length > 1
          ? "BEST_PRICE"
          : "NONE";

  const player: PlayerRecord = {
    id: bestRowPlayer.id,
    leagueId: bestRowPlayer.leagueId,
    teamId: bestRowPlayer.teamId,
    name: bestRowPlayer.name,
    position: bestRowPlayer.position,
    externalIds:
      bestRowPlayer.externalIds && typeof bestRowPlayer.externalIds === "object"
        ? (bestRowPlayer.externalIds as Record<string, string>)
        : {},
    status: bestRowPlayer.status
  };

  const team: TeamRecord = {
    id: bestRowPlayerTeam.id,
    leagueId: bestRowPlayerTeam.leagueId,
    name: bestRowPlayerTeam.name,
    abbreviation: bestRowPlayerTeam.abbreviation,
    externalIds:
      bestRowPlayerTeam.externalIds && typeof bestRowPlayerTeam.externalIds === "object"
        ? (bestRowPlayerTeam.externalIds as Record<string, string>)
        : {}
  };

  const opponentTeam = bestRow.game.homeTeamId === team.id ? bestRow.game.awayTeam : bestRow.game.homeTeam;
  const opponent: TeamRecord = {
    id: opponentTeam.id,
    leagueId: opponentTeam.leagueId,
    name: opponentTeam.name,
    abbreviation: opponentTeam.abbreviation,
    externalIds:
      opponentTeam.externalIds && typeof opponentTeam.externalIds === "object"
        ? (opponentTeam.externalIds as Record<string, string>)
        : {}
  };

  const sportsbook: SportsbookRecord = {
    id: bestRow.sportsbook.id,
    key: bestRow.sportsbook.key,
    name: bestRow.sportsbook.name,
    region: bestRow.sportsbook.region
  };

  return {
    id: `stored:${bestRow.id}`,
    gameId: bestRow.game.externalEventId,
    leagueKey: bestRow.game.league.key as LeagueKey,
    sportsbook,
    player,
    team,
    opponent,
    marketType: bestRow.marketType as PropMarketType,
    side: bestRow.side.toUpperCase(),
    line: bestRow.line ?? 0,
    oddsAmerican: bestRow.oddsAmerican,
    recentHitRate: analytics.hitRatePct,
    matchupRank: analytics.recentFormDelta,
    gameLabel: `${bestRow.game.awayTeam.abbreviation} vs ${bestRow.game.homeTeam.abbreviation}`,
    teamResolved: true,
    sportsbookCount: group.rows.length,
    bestAvailableOddsAmerican: bestRow.oddsAmerican,
    bestAvailableSportsbookName: bestRow.sportsbook.name,
    averageOddsAmerican: averageOdds,
    marketDeltaAmerican,
    expectedValuePct,
    lineMovement,
    valueFlag,
    supportStatus,
    supportNote: options.supportNote ?? reasonBits.slice(0, 3).join(" "),
    gameHref: buildMatchupHref(bestRow.game.league.key as LeagueKey, bestRow.game.externalEventId),
    source: "mock",
    edgeScore: calculateEdgeScore({
      impliedProbability,
      modelProbability: modelProbability ?? undefined,
      recentHitRate: analytics.hitRatePct ?? undefined,
      lineMovementSupport:
        typeof lineMovement === "number" ? Math.min(0.45, Math.abs(lineMovement) / 3) : undefined,
      volatility: group.rows.length >= 3 ? 0.24 : 0.36
    }),
    analyticsSummary: {
      tags: Array.from(tags),
      reason: reasonBits.slice(0, 3).join(" "),
      sampleSize: analytics.sampleSize,
      clvProxyPct: expectedValuePct,
      hitRatePct: analytics.hitRatePct,
      bookCount: group.rows.length,
      avgStat: analytics.avgStat,
      lineMovement
    }
  };
}

export async function getStoredPropsExplorerData(filters: PropFilters) {
  const groups = await getStoredPropGroups(filters);
  const cards = (await Promise.all(groups.map((group) => buildStoredPropCard(group)))).filter(
    Boolean
  ) as PropCardView[];

  const filteredProps = cards
    .filter((prop) => (filters.valueFlag === "all" ? true : prop.valueFlag === filters.valueFlag))
    .sort((left, right) => {
      if (filters.sortBy === "league" && left.leagueKey !== right.leagueKey) {
        return left.leagueKey.localeCompare(right.leagueKey);
      }
      if (filters.sortBy === "line_movement") {
        return Math.abs(right.lineMovement ?? 0) - Math.abs(left.lineMovement ?? 0);
      }
      if (filters.sortBy === "market_ev") {
        return (right.expectedValuePct ?? -999) - (left.expectedValuePct ?? -999);
      }
      if (filters.sortBy === "edge_score") {
        return right.edgeScore.score - left.edgeScore.score;
      }
      if (filters.sortBy === "best_price") {
        return (right.bestAvailableOddsAmerican ?? right.oddsAmerican) - (left.bestAvailableOddsAmerican ?? left.oddsAmerican);
      }
      return left.player.name.localeCompare(right.player.name);
    });

  const sportsbooks = Array.from(
    new Map(filteredProps.map((prop) => [prop.sportsbook.key, prop.sportsbook] as const)).values()
  ).sort((left, right) => left.name.localeCompare(right.name));
  const teams = Array.from(
    new Map(filteredProps.map((prop) => [prop.team.id, prop.team] as const)).values()
  ).sort((left, right) => left.name.localeCompare(right.name));
  const players = Array.from(
    new Map(filteredProps.map((prop) => [prop.player.id, prop.player] as const)).values()
  ).sort((left, right) => left.name.localeCompare(right.name));

  return {
    props: filteredProps,
    sportsbooks,
    teams,
    players,
    sourceNote: filteredProps.length
      ? "Stored prop history is backing this board while live rows stay worker-synced in the background."
      : "No stored prop rows match this filter set yet."
  };
}

export async function getStoredPropById(propId: string) {
  if (!propId.startsWith("stored:")) {
    return null;
  }

  const marketId = propId.replace(/^stored:/, "");
  const market = await prisma.market.findUnique({
    where: {
      id: marketId
    }
  });

  if (!market?.playerId) {
    return null;
  }

  const groups = await getStoredPropGroups(
    {
      league: "ALL",
      marketType: market.marketType as PropMarketType,
      team: "all",
      player: market.playerId,
      sportsbook: "all",
      sortBy: "best_price",
      valueFlag: "all"
    },
    undefined
  );
  const group = groups.find((entry) => entry.rows.some((row) => row.id === marketId));
  return group ? buildStoredPropCard(group) : null;
}

export async function getStoredPropsForEvent(eventExternalId: string) {
  const groups = await getStoredPropGroups(undefined, eventExternalId);
  const cards = (await Promise.all(groups.map((group) => buildStoredPropCard(group)))).filter(
    Boolean
  ) as PropCardView[];

  return cards.sort((left, right) => {
    const evDelta = (right.expectedValuePct ?? -999) - (left.expectedValuePct ?? -999);
    if (evDelta !== 0) {
      return evDelta;
    }
    return right.edgeScore.score - left.edgeScore.score;
  });
}
