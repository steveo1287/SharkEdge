import type { Prisma } from "@prisma/client";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

export type NbaFullStatTile = {
  statKey: string;
  label: string;
  meanValue: number;
  medianValue: number;
  stdDev: number;
  marketLine: number | null;
  overProbability: number | null;
  underProbability: number | null;
  confidence: number | null;
  modelOnly: boolean;
  noBet: boolean;
  warnings: string[];
  blockers: string[];
};

export type NbaPlayerFullStatView = {
  playerId: string;
  playerName: string;
  teamName: string | null;
  projectedMinutes: number | null;
  stats: NbaFullStatTile[];
};

export type NbaFullStatProjectionView = {
  ok: true;
  generatedAt: string;
  hasDatabase: boolean;
  eventId: string | null;
  playerCount: number;
  statTileCount: number;
  players: NbaPlayerFullStatView[];
  warnings: string[];
};

const STAT_ORDER = [
  "player_points",
  "player_rebounds",
  "player_assists",
  "player_threes",
  "player_steals",
  "player_blocks",
  "player_turnovers",
  "player_pra",
  "player_pr",
  "player_pa",
  "player_ra"
];

const STAT_LABELS: Record<string, string> = {
  player_points: "PTS",
  player_rebounds: "REB",
  player_assists: "AST",
  player_threes: "3PM",
  player_steals: "STL",
  player_blocks: "BLK",
  player_turnovers: "TOV",
  player_pra: "PRA",
  player_pr: "PR",
  player_pa: "PA",
  player_ra: "RA"
};

function asRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function probabilityAtFirstLine(value: Prisma.JsonValue | null | undefined) {
  const record = asRecord(value);
  for (const [line, probability] of Object.entries(record)) {
    const parsedLine = Number(line);
    if (Number.isFinite(parsedLine) && typeof probability === "number" && Number.isFinite(probability)) {
      return { line: parsedLine, probability };
    }
  }
  return { line: null, probability: null };
}

function statSort(statKey: string) {
  const index = STAT_ORDER.indexOf(statKey);
  return index === -1 ? 999 : index;
}

function normalizeStatKey(statKey: string) {
  switch (statKey) {
    case "points":
      return "player_points";
    case "rebounds":
      return "player_rebounds";
    case "assists":
      return "player_assists";
    case "threes":
      return "player_threes";
    case "steals":
      return "player_steals";
    case "blocks":
      return "player_blocks";
    case "turnovers":
      return "player_turnovers";
    case "pra":
      return "player_pra";
    case "pr":
      return "player_pr";
    case "pa":
      return "player_pa";
    case "ra":
      return "player_ra";
    default:
      return statKey;
  }
}

export async function getNbaFullStatProjectionView(args: {
  eventId?: string | null;
  playerId?: string | null;
  includeModelOnly?: boolean;
  take?: number;
} = {}): Promise<NbaFullStatProjectionView> {
  if (!hasUsableServerDatabaseUrl()) {
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      hasDatabase: false,
      eventId: args.eventId ?? null,
      playerCount: 0,
      statTileCount: 0,
      players: [],
      warnings: ["DATABASE_URL missing; NBA full-stat projections unavailable."]
    };
  }

  const projections = await prisma.playerProjection.findMany({
    where: {
      ...(args.eventId ? { eventId: args.eventId } : {}),
      ...(args.playerId ? { playerId: args.playerId } : {}),
      statKey: { in: STAT_ORDER }
    },
    include: {
      player: {
        include: { team: true }
      }
    },
    take: Math.max(1, Math.min(args.take ?? 750, 2000))
  });

  const grouped = new Map<string, NbaPlayerFullStatView>();
  const warnings: string[] = [];

  for (const projection of projections) {
    const metadata = asRecord(projection.metadataJson);
    const modelOnly = metadata.modelOnly === true;
    if (modelOnly && args.includeModelOnly === false) continue;
    const statKey = normalizeStatKey(projection.statKey);
    const over = probabilityAtFirstLine(projection.hitProbOver);
    const under = probabilityAtFirstLine(projection.hitProbUnder);
    const marketLine = asNumber(metadata.marketLine) ?? over.line ?? under.line;
    const playerId = projection.playerId;
    const existing = grouped.get(playerId) ?? {
      playerId,
      playerName: projection.player?.name ?? String(metadata.playerName ?? playerId),
      teamName: projection.player?.team?.name ?? (typeof metadata.teamName === "string" ? metadata.teamName : null),
      projectedMinutes: asNumber(metadata.projectedMinutes),
      stats: []
    };

    existing.stats.push({
      statKey,
      label: STAT_LABELS[statKey] ?? statKey.replace(/^player_/, "").toUpperCase(),
      meanValue: projection.meanValue,
      medianValue: projection.medianValue,
      stdDev: projection.stdDev,
      marketLine,
      overProbability: over.probability,
      underProbability: under.probability,
      confidence: asNumber(metadata.confidence),
      modelOnly,
      noBet: metadata.noBet === true,
      warnings: asStringArray(metadata.warnings),
      blockers: asStringArray(metadata.blockers)
    });
    grouped.set(playerId, existing);
  }

  const players = [...grouped.values()]
    .map((player) => ({
      ...player,
      stats: player.stats.sort((left, right) => statSort(left.statKey) - statSort(right.statKey))
    }))
    .sort((left, right) => left.playerName.localeCompare(right.playerName));

  for (const player of players) {
    const existingStats = new Set(player.stats.map((stat) => stat.statKey));
    const missingCore = STAT_ORDER.slice(0, 8).filter((stat) => !existingStats.has(stat));
    if (missingCore.length) {
      warnings.push(`${player.playerName} missing ${missingCore.map((stat) => STAT_LABELS[stat] ?? stat).join("/")} projections.`);
    }
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    hasDatabase: true,
    eventId: args.eventId ?? null,
    playerCount: players.length,
    statTileCount: players.reduce((sum, player) => sum + player.stats.length, 0),
    players,
    warnings
  };
}
