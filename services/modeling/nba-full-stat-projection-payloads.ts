import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  projectNbaPlayerFullStatProfile,
  type NbaFullStatKey,
  type NbaPropMarketLine
} from "@/services/simulation/nba-player-full-stat-projection";

export type NbaFullStatProjectionPayload = {
  modelKey: string;
  modelVersion: string;
  eventId: string;
  playerId: string;
  statKey: string;
  meanValue: number;
  medianValue: number;
  stdDev: number;
  hitProbOver?: Record<string, number>;
  hitProbUnder?: Record<string, number>;
  metadata: Record<string, unknown>;
};

type ExistingProjectionLike = {
  playerId: string;
  statKey: string;
};

const STAT_STORAGE_KEYS: Record<NbaFullStatKey, string> = {
  points: "player_points",
  rebounds: "player_rebounds",
  assists: "player_assists",
  threes: "player_threes",
  steals: "player_steals",
  blocks: "player_blocks",
  turnovers: "player_turnovers",
  pra: "player_pra",
  pr: "player_pr",
  pa: "player_pa",
  ra: "player_ra"
};

const MARKET_TO_FULL_STAT: Record<string, NbaFullStatKey> = {
  player_points: "points",
  points: "points",
  player_rebounds: "rebounds",
  rebounds: "rebounds",
  player_assists: "assists",
  assists: "assists",
  player_threes: "threes",
  threes: "threes",
  "3pm": "threes",
  player_steals: "steals",
  steals: "steals",
  player_blocks: "blocks",
  blocks: "blocks",
  player_turnovers: "turnovers",
  turnovers: "turnovers",
  player_pra: "pra",
  pra: "pra",
  player_points_rebounds_assists: "pra",
  player_pr: "pr",
  pr: "pr",
  player_points_rebounds: "pr",
  player_pa: "pa",
  pa: "pa",
  player_points_assists: "pa",
  player_ra: "ra",
  ra: "ra",
  player_rebounds_assists: "ra"
};

function projectionKey(playerId: string, statKey: string) {
  return `${playerId}:${statKey}`;
}

function statFromMarketType(marketType: string): NbaFullStatKey | null {
  return MARKET_TO_FULL_STAT[marketType.toLowerCase()] ?? null;
}

function playerStatus(value: unknown): "ACTIVE" | "PROBABLE" | "QUESTIONABLE" | "DOUBTFUL" | "OUT" | "UNKNOWN" {
  const status = String(value ?? "ACTIVE").toUpperCase();
  if (status === "ACTIVE" || status === "PROBABLE" || status === "QUESTIONABLE" || status === "DOUBTFUL" || status === "OUT" || status === "UNKNOWN") return status;
  return "UNKNOWN";
}

function jsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function recentStatRows(playerGameStats: Array<{ statsJson: Prisma.JsonValue; minutes: number | null; starter: boolean; outcomeStatus: string; createdAt: Date; updatedAt: Date }>) {
  return playerGameStats.map((row) => ({
    ...jsonRecord(row.statsJson),
    statsJson: jsonRecord(row.statsJson),
    minutes: row.minutes,
    starter: row.starter,
    outcomeStatus: row.outcomeStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}

function buildMarketLinesByPlayer(
  states: Array<{
    playerId: string | null;
    marketType: string;
    period: string;
    consensusLineValue: number | null;
    bestOverOddsAmerican: number | null;
    bestUnderOddsAmerican: number | null;
  }>
) {
  const map = new Map<string, Partial<Record<NbaFullStatKey, NbaPropMarketLine>>>();
  for (const state of states) {
    if (!state.playerId || state.period !== "full_game") continue;
    const statKey = statFromMarketType(state.marketType);
    if (!statKey) continue;
    const current = map.get(state.playerId) ?? {};
    current[statKey] = {
      line: state.consensusLineValue,
      overOdds: state.bestOverOddsAmerican,
      underOdds: state.bestUnderOddsAmerican
    };
    map.set(state.playerId, current);
  }
  return map;
}

function probabilityRecord(line: number | null, probability: number | null) {
  if (typeof line !== "number" || !Number.isFinite(line) || typeof probability !== "number" || !Number.isFinite(probability)) return undefined;
  return { [String(line)]: probability };
}

function toPayload(args: {
  eventId: string;
  playerId: string;
  statKey: NbaFullStatKey;
  projection: {
    mean: number;
    median: number;
    stdDev: number;
    marketLine: number | null;
    overProbability: number | null;
    underProbability: number | null;
    confidence: number;
    noBet: boolean;
    blockers: string[];
    warnings: string[];
    drivers: string[];
  };
  playerName: string;
  teamName: string | null;
  opponentName: string | null;
  projectedMinutes: number;
  modelOnly: boolean;
}): NbaFullStatProjectionPayload {
  return {
    modelKey: "nba-full-stat-projection",
    modelVersion: "v1",
    eventId: args.eventId,
    playerId: args.playerId,
    statKey: STAT_STORAGE_KEYS[args.statKey],
    meanValue: args.projection.mean,
    medianValue: args.projection.median,
    stdDev: args.projection.stdDev,
    hitProbOver: probabilityRecord(args.projection.marketLine, args.projection.overProbability),
    hitProbUnder: probabilityRecord(args.projection.marketLine, args.projection.underProbability),
    metadata: {
      fullStatProjection: true,
      modelOnly: args.modelOnly,
      canonicalStatKey: args.statKey,
      marketLine: args.projection.marketLine,
      confidence: args.projection.confidence,
      noBet: args.projection.noBet,
      blockers: args.projection.blockers,
      warnings: args.projection.warnings,
      drivers: args.projection.drivers,
      playerName: args.playerName,
      teamName: args.teamName,
      opponentName: args.opponentName,
      projectedMinutes: args.projectedMinutes
    }
  };
}

export async function buildNbaFullStatProjectionPayloadsForEvent(args: {
  eventId: string;
  existingProjections?: ExistingProjectionLike[];
}): Promise<NbaFullStatProjectionPayload[]> {
  const event = await prisma.event.findUnique({
    where: { id: args.eventId },
    include: {
      league: true,
      currentMarketStates: {
        select: {
          playerId: true,
          marketType: true,
          period: true,
          consensusLineValue: true,
          bestOverOddsAmerican: true,
          bestUnderOddsAmerican: true
        }
      },
      participants: {
        include: {
          competitor: {
            include: { team: true }
          }
        }
      }
    }
  });

  if (!event || event.league.key !== "NBA") return [];

  const homeTeam = event.participants.find((participant) => participant.role === "HOME")?.competitor.team ?? null;
  const awayTeam = event.participants.find((participant) => participant.role === "AWAY")?.competitor.team ?? null;
  const teamIds = [homeTeam?.id, awayTeam?.id].filter((value): value is string => typeof value === "string");
  if (!teamIds.length) return [];

  const existing = new Set((args.existingProjections ?? []).map((projection) => projectionKey(projection.playerId, projection.statKey)));
  const marketLinesByPlayer = buildMarketLinesByPlayer(event.currentMarketStates);
  const players = await prisma.player.findMany({
    where: { teamId: { in: teamIds } },
    include: {
      team: true,
      playerGameStats: {
        orderBy: { createdAt: "desc" },
        take: 12
      }
    }
  });

  const payloads: NbaFullStatProjectionPayload[] = [];
  for (const player of players) {
    const recentStats = recentStatRows(player.playerGameStats);
    if (recentStats.length < 5) continue;
    const opponent = player.teamId === homeTeam?.id ? awayTeam : player.teamId === awayTeam?.id ? homeTeam : null;
    const full = projectNbaPlayerFullStatProfile({
      playerId: player.id,
      playerName: player.name,
      team: player.team?.name ?? null,
      position: player.position,
      recentStats,
      playerStatus: playerStatus(player.status),
      marketLinesByStat: marketLinesByPlayer.get(player.id)
    });

    for (const [statKey, projection] of Object.entries(full.stats) as Array<[NbaFullStatKey, typeof full.stats[keyof typeof full.stats]]>) {
      const storageKey = STAT_STORAGE_KEYS[statKey];
      if (existing.has(projectionKey(player.id, storageKey))) continue;
      payloads.push(toPayload({
        eventId: event.id,
        playerId: player.id,
        statKey,
        projection,
        playerName: player.name,
        teamName: player.team?.name ?? null,
        opponentName: opponent?.name ?? null,
        projectedMinutes: full.projectedMinutes,
        modelOnly: projection.marketLine === null
      }));
    }

    for (const [statKey, projection] of Object.entries(full.combos) as Array<[NbaFullStatKey, typeof full.combos[keyof typeof full.combos]]>) {
      const storageKey = STAT_STORAGE_KEYS[statKey];
      if (existing.has(projectionKey(player.id, storageKey))) continue;
      payloads.push(toPayload({
        eventId: event.id,
        playerId: player.id,
        statKey,
        projection,
        playerName: player.name,
        teamName: player.team?.name ?? null,
        opponentName: opponent?.name ?? null,
        projectedMinutes: full.projectedMinutes,
        modelOnly: projection.marketLine === null
      }));
    }
  }

  return payloads;
}
