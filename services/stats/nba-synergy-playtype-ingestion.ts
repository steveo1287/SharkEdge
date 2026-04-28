import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

type NbaStatsResultSet = {
  name?: string;
  headers?: string[];
  rowSet?: unknown[][];
};

type NbaStatsResponse = {
  resultSets?: NbaStatsResultSet[];
  resultSet?: NbaStatsResultSet;
};

type SynergyEntityType = "player" | "team";
type SynergySide = "offense" | "defense";

type SynergyRow = {
  season: string;
  seasonType: string;
  side: SynergySide;
  entityType: SynergyEntityType;
  entityId: string | null;
  entityName: string;
  teamId: string | null;
  teamName: string | null;
  teamAbbreviation: string | null;
  playType: string;
  possessions: number | null;
  frequency: number | null;
  ppp: number | null;
  points: number | null;
  percentile: number | null;
  fgPct: number | null;
  efgPct: number | null;
  turnoverPct: number | null;
  shootingFoulPct: number | null;
  andOnePct: number | null;
  scoreFrequency: number | null;
  raw: JsonRecord;
};

type SynergyProfile = {
  season: string;
  seasonType: string;
  entityType: SynergyEntityType;
  entityId: string | null;
  entityName: string;
  teamId: string | null;
  teamName: string | null;
  teamAbbreviation: string | null;
  matchedDbId: string | null;
  updatedAt: string;
  playTypes: {
    offense: Record<string, SynergyRow>;
    defense: Record<string, SynergyRow>;
  };
  summary: {
    primaryOffensivePlayType: string | null;
    primaryOffensiveFrequency: number | null;
    bestOffensivePlayType: string | null;
    bestOffensivePpp: number | null;
    weakestDefensivePlayType: string | null;
    weakestDefensivePppAllowed: number | null;
    totalTrackedOffensivePossessions: number;
    totalTrackedDefensivePossessions: number;
    profileQuality: "HIGH" | "MEDIUM" | "LOW";
  };
};

const PLAY_TYPES = [
  "Isolation",
  "Transition",
  "PRBallHandler",
  "PRRollman",
  "Postup",
  "Spotup",
  "Handoff",
  "Cut",
  "OffScreen",
  "OffRebound",
  "Misc"
] as const;

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[%,$]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function currentNbaSeason(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const startYear = month >= 9 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function endpointPlayType(playType: string) {
  switch (playType) {
    case "PRBallHandler":
      return "PRBallHandler";
    case "PRRollman":
      return "PRRollman";
    case "Postup":
      return "Postup";
    case "Spotup":
      return "Spotup";
    case "OffScreen":
      return "OffScreen";
    case "OffRebound":
      return "OffRebound";
    default:
      return playType;
  }
}

async function fetchNbaStats<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
        "Host": "stats.nba.com",
        "Origin": "https://www.nba.com",
        "Referer": "https://www.nba.com/stats/players/isolation",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "x-nba-stats-origin": "stats",
        "x-nba-stats-token": "true"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function resultSet(response: NbaStatsResponse) {
  return response.resultSets?.[0] ?? response.resultSet ?? null;
}

function valueByHeader(row: unknown[], headerIndex: Record<string, number>, names: string[]) {
  for (const name of names) {
    const index = headerIndex[normalizeKey(name)];
    if (typeof index === "number") return row[index];
  }
  return null;
}

function parseSynergyRows(args: {
  response: NbaStatsResponse;
  season: string;
  seasonType: string;
  entityType: SynergyEntityType;
  side: SynergySide;
  playType: string;
}) {
  const set = resultSet(args.response);
  const headers = set?.headers;
  const rowSet = set?.rowSet;
  if (!headers?.length || !rowSet?.length) return [] as SynergyRow[];

  const headerIndex: Record<string, number> = {};
  headers.forEach((header, index) => {
    headerIndex[normalizeKey(header)] = index;
  });

  return rowSet.map((row): SynergyRow | null => {
    const entityId = readString(valueByHeader(row, headerIndex, ["PLAYER_ID", "TEAM_ID", "GROUP_ID"]));
    const entityName = readString(valueByHeader(row, headerIndex, ["PLAYER_NAME", "TEAM_NAME", "GROUP_NAME", "NAME"]));
    if (!entityName) return null;

    const teamId = readString(valueByHeader(row, headerIndex, ["TEAM_ID"]));
    const teamName = readString(valueByHeader(row, headerIndex, ["TEAM_NAME"]));
    const teamAbbreviation = readString(valueByHeader(row, headerIndex, ["TEAM_ABBREVIATION", "TEAM_ABBREVIATION"]));
    const possessions = readNumber(valueByHeader(row, headerIndex, ["POSS", "POSS_PG", "POSS_COUNT", "POSSSESSIONS"]));
    const ppp = readNumber(valueByHeader(row, headerIndex, ["PPP", "POINTS_PER_POSSESSION"]));
    const frequency = readNumber(valueByHeader(row, headerIndex, ["POSS_PCT", "PERCENT_POSS", "FREQUENCY", "FREQ"]));

    const raw: JsonRecord = {};
    headers.forEach((header, index) => {
      raw[header] = row[index];
    });

    return {
      season: args.season,
      seasonType: args.seasonType,
      side: args.side,
      entityType: args.entityType,
      entityId,
      entityName,
      teamId,
      teamName,
      teamAbbreviation,
      playType: args.playType,
      possessions,
      frequency,
      ppp,
      points: readNumber(valueByHeader(row, headerIndex, ["PTS", "POINTS"])),
      percentile: readNumber(valueByHeader(row, headerIndex, ["PERCENTILE", "PERCENTILE_RANK"])),
      fgPct: readNumber(valueByHeader(row, headerIndex, ["FG_PCT", "FG%"])),
      efgPct: readNumber(valueByHeader(row, headerIndex, ["EFG_PCT", "EFG%"])),
      turnoverPct: readNumber(valueByHeader(row, headerIndex, ["TOV_POSS_PCT", "TOV_PCT", "TURNOVER_PCT"])),
      shootingFoulPct: readNumber(valueByHeader(row, headerIndex, ["SF_POSS_PCT", "SHOOTING_FOUL_PCT"])),
      andOnePct: readNumber(valueByHeader(row, headerIndex, ["AND_ONE_POSS_PCT", "AND_ONE_PCT"])),
      scoreFrequency: readNumber(valueByHeader(row, headerIndex, ["SCORE_POSS_PCT", "SCORE_FREQUENCY"])),
      raw
    };
  }).filter((row): row is SynergyRow => row !== null);
}

async function fetchSynergyPlayType(args: {
  season: string;
  seasonType: string;
  entityType: SynergyEntityType;
  side: SynergySide;
  playType: string;
}) {
  const params = new URLSearchParams({
    LeagueID: "00",
    PerMode: "Totals",
    PlayType: endpointPlayType(args.playType),
    PlayerOrTeam: args.entityType === "player" ? "P" : "T",
    SeasonType: args.seasonType,
    SeasonYear: args.season,
    TypeGrouping: args.side === "offense" ? "offensive" : "defensive"
  });
  const response = await fetchNbaStats<NbaStatsResponse>(`https://stats.nba.com/stats/synergyplaytypes?${params.toString()}`);
  return parseSynergyRows({ ...args, response });
}

async function findMatchedTeam(row: SynergyRow) {
  if (row.entityType !== "team") return null;
  return prisma.team.findFirst({
    where: {
      league: { key: "NBA" },
      OR: [
        ...(row.teamAbbreviation ? [{ abbreviation: { equals: row.teamAbbreviation, mode: "insensitive" as const } }] : []),
        { name: { equals: row.entityName, mode: "insensitive" } }
      ]
    },
    select: { id: true }
  });
}

async function findMatchedPlayer(row: SynergyRow) {
  if (row.entityType !== "player") return null;
  return prisma.player.findFirst({
    where: {
      league: { key: "NBA" },
      name: { equals: row.entityName, mode: "insensitive" },
      ...(row.teamAbbreviation ? { team: { abbreviation: { equals: row.teamAbbreviation, mode: "insensitive" as const } } } : {})
    },
    select: { id: true }
  });
}

function profileQuality(offensiveRows: SynergyRow[], defensiveRows: SynergyRow[]) {
  const possessions = [...offensiveRows, ...defensiveRows].reduce((sum: number, row) => sum + (row.possessions ?? 0), 0);
  if (possessions >= 250) return "HIGH" as const;
  if (possessions >= 80) return "MEDIUM" as const;
  return "LOW" as const;
}

function pickMax(rows: SynergyRow[], value: (row: SynergyRow) => number | null) {
  return rows.reduce<SynergyRow | null>((best, row) => {
    const current = value(row);
    const previous = best ? value(best) : null;
    if (current === null) return best;
    if (previous === null || current > previous) return row;
    return best;
  }, null);
}

async function persistProfiles(rows: SynergyRow[]) {
  const groups = new Map<string, SynergyRow[]>();
  for (const row of rows) {
    const key = [row.season, row.seasonType, row.entityType, row.entityId ?? normalizeKey(row.entityName), row.teamAbbreviation ?? "none"].join(":");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  let profilesWritten = 0;
  let matchedProfiles = 0;

  for (const groupRows of groups.values()) {
    const first = groupRows[0];
    if (!first) continue;
    const offensiveRows = groupRows.filter((row) => row.side === "offense");
    const defensiveRows = groupRows.filter((row) => row.side === "defense");
    const matched = first.entityType === "team" ? await findMatchedTeam(first) : await findMatchedPlayer(first);
    if (matched?.id) matchedProfiles += 1;

    const primary = pickMax(offensiveRows, (row) => row.frequency ?? row.possessions);
    const bestOffense = pickMax(offensiveRows, (row) => row.ppp);
    const weakestDefense = pickMax(defensiveRows, (row) => row.ppp);
    const totalTrackedOffensivePossessions = offensiveRows.reduce((sum: number, row) => sum + (row.possessions ?? 0), 0);
    const totalTrackedDefensivePossessions = defensiveRows.reduce((sum: number, row) => sum + (row.possessions ?? 0), 0);
    const profile: SynergyProfile = {
      season: first.season,
      seasonType: first.seasonType,
      entityType: first.entityType,
      entityId: first.entityId,
      entityName: first.entityName,
      teamId: first.teamId,
      teamName: first.teamName,
      teamAbbreviation: first.teamAbbreviation,
      matchedDbId: matched?.id ?? null,
      updatedAt: new Date().toISOString(),
      playTypes: {
        offense: Object.fromEntries(offensiveRows.map((row) => [row.playType, row])),
        defense: Object.fromEntries(defensiveRows.map((row) => [row.playType, row]))
      },
      summary: {
        primaryOffensivePlayType: primary?.playType ?? null,
        primaryOffensiveFrequency: primary?.frequency ?? null,
        bestOffensivePlayType: bestOffense?.playType ?? null,
        bestOffensivePpp: bestOffense?.ppp ?? null,
        weakestDefensivePlayType: weakestDefense?.playType ?? null,
        weakestDefensivePppAllowed: weakestDefense?.ppp ?? null,
        totalTrackedOffensivePossessions,
        totalTrackedDefensivePossessions,
        profileQuality: profileQuality(offensiveRows, defensiveRows)
      }
    };

    const profileKey = [
      "nba_synergy_profile",
      first.season,
      normalizeKey(first.seasonType),
      first.entityType,
      matched?.id ?? first.entityId ?? normalizeKey(first.entityName),
      first.teamAbbreviation ?? "none"
    ].join(":");

    await prisma.trendCache.upsert({
      where: { cacheKey: profileKey },
      update: {
        scope: "nba_synergy_profile",
        filterJson: toJson({ season: first.season, seasonType: first.seasonType, entityType: first.entityType, entityId: first.entityId, matchedDbId: matched?.id ?? null }),
        payloadJson: toJson(profile),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
      },
      create: {
        cacheKey: profileKey,
        scope: "nba_synergy_profile",
        filterJson: toJson({ season: first.season, seasonType: first.seasonType, entityType: first.entityType, entityId: first.entityId, matchedDbId: matched?.id ?? null }),
        payloadJson: toJson(profile),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
      }
    });
    profilesWritten += 1;
  }

  return { profilesWritten, matchedProfiles };
}

export async function ingestNbaSynergyPlaytypes(args: {
  season?: string;
  seasonType?: string;
  entityTypes?: SynergyEntityType[];
  sides?: SynergySide[];
  playTypes?: string[];
} = {}) {
  const season = args.season ?? currentNbaSeason();
  const seasonType = args.seasonType ?? "Regular Season";
  const entityTypes = args.entityTypes ?? ["player", "team"];
  const sides = args.sides ?? ["offense", "defense"];
  const playTypes = args.playTypes ?? [...PLAY_TYPES];
  const allRows: SynergyRow[] = [];
  const errors: Array<{ entityType: string; side: string; playType: string; message: string }> = [];

  for (const entityType of entityTypes) {
    for (const side of sides) {
      for (const playType of playTypes) {
        try {
          const rows = await fetchSynergyPlayType({ season, seasonType, entityType, side, playType });
          allRows.push(...rows);
        } catch (error) {
          errors.push({
            entityType,
            side,
            playType,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  }

  const persisted = await persistProfiles(allRows);

  await prisma.trendCache.upsert({
    where: { cacheKey: `nba_synergy_ingest_summary:${season}:${normalizeKey(seasonType)}` },
    update: {
      scope: "nba_synergy_ingest_summary",
      filterJson: toJson({ season, seasonType }),
      payloadJson: toJson({ season, seasonType, rowCount: allRows.length, errors, ...persisted, updatedAt: new Date().toISOString() }),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    },
    create: {
      cacheKey: `nba_synergy_ingest_summary:${season}:${normalizeKey(seasonType)}`,
      scope: "nba_synergy_ingest_summary",
      filterJson: toJson({ season, seasonType }),
      payloadJson: toJson({ season, seasonType, rowCount: allRows.length, errors, ...persisted, updatedAt: new Date().toISOString() }),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    }
  });

  return {
    season,
    seasonType,
    rowCount: allRows.length,
    errors,
    ...persisted
  };
}

export async function getCachedNbaSynergyProfile(args: {
  season?: string;
  entityType: SynergyEntityType;
  dbId?: string | null;
  entityName?: string | null;
  teamAbbreviation?: string | null;
}) {
  const season = args.season ?? currentNbaSeason();
  const candidates = [
    args.dbId ? `nba_synergy_profile:${season}:regular_season:${args.entityType}:${args.dbId}:${args.teamAbbreviation ?? "none"}` : null,
    args.dbId ? `nba_synergy_profile:${season}:regular_season:${args.entityType}:${args.dbId}:none` : null,
    args.entityName ? `nba_synergy_profile:${season}:regular_season:${args.entityType}:${normalizeKey(args.entityName)}:${args.teamAbbreviation ?? "none"}` : null,
    args.entityName ? `nba_synergy_profile:${season}:regular_season:${args.entityType}:${normalizeKey(args.entityName)}:none` : null
  ].filter((value): value is string => Boolean(value));

  const cached = candidates.length
    ? await prisma.trendCache.findFirst({
        where: {
          cacheKey: { in: candidates },
          scope: "nba_synergy_profile",
          expiresAt: { gt: new Date() }
        },
        orderBy: { updatedAt: "desc" }
      })
    : null;

  return cached?.payloadJson as SynergyProfile | null;
}
