import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { buildPlayerSimV2 } from "./player-sim-v2";
import { setCachedSim, getCachedSim } from "./sim-cache";
import { getLeagueTuning } from "./sim-tuning";

export type PrecomputeMetrics = {
  total: number;
  computed: number;
  failed: number;
  cached: number;
  duration: number;
  timestamp: string;
};

const WINDOW_HOURS = 4;
const PROP_STAT_KEYS = ["player_points", "player_rebounds", "player_assists", "player_threes", "player_pitcher_strikeouts", "player_pitcher_outs"];
const CACHE_SCOPE = "precomputed_sim";

function statKeyToSimType(statKey: string): string {
  switch (statKey) {
    case "player_points": return "Points";
    case "player_rebounds": return "Rebounds";
    case "player_assists": return "Assists";
    case "player_threes": return "Threes";
    case "player_pitcher_strikeouts": return "Strikeouts";
    case "player_pitcher_outs": return "Outs";
    default: return "Points";
  }
}

function precomputeCacheKey(playerId: string, statKey: string, eventId: string) {
  return `${CACHE_SCOPE}:${playerId}:${statKey}:${eventId}`;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function precomputeActivePropSims(): Promise<PrecomputeMetrics> {
  const start = Date.now();
  const windowCutoff = new Date(Date.now() + WINDOW_HOURS * 60 * 60 * 1000);

  const projections = await prisma.playerProjection.findMany({
    where: {
      event: {
        startTime: { lte: windowCutoff },
        status: { in: ["SCHEDULED"] }
      },
      statKey: { in: PROP_STAT_KEYS }
    },
    include: {
      player: { select: { id: true, name: true } },
      event: { select: { id: true, leagueId: true } }
    },
    orderBy: { event: { startTime: "asc" } },
    take: 300
  });

  let computed = 0;
  let failed = 0;
  let cached = 0;

  for (const proj of projections) {
    const propId = precomputeCacheKey(proj.playerId, proj.statKey, proj.eventId);

    if (getCachedSim(propId)) {
      cached++;
      continue;
    }

    // Check TrendCache for a recently computed result (cross-instance persistence)
    const persisted = await prisma.trendCache.findFirst({
      where: { cacheKey: propId, scope: CACHE_SCOPE, expiresAt: { gt: new Date() } }
    }).catch(() => null);

    if (persisted?.payloadJson) {
      cached++;
      continue;
    }

    try {
      const market = await prisma.currentMarketState.findFirst({
        where: { eventId: proj.eventId, playerId: proj.playerId }
      }).catch(() => null);

      const line = market?.consensusLineValue ?? proj.meanValue;
      const odds = market?.bestOverOddsAmerican ?? -110;
      const simType = statKeyToSimType(proj.statKey);
      const tuning = getLeagueTuning(proj.event.leagueId);

      const result = buildPlayerSimV2(
        {
          player: proj.player.name,
          propType: simType as any,
          line,
          odds,
          teamTotal: 100,
          minutes: simType === "Strikeouts" || simType === "Outs" ? 0 : 30,
          usageRate: simType === "Strikeouts" || simType === "Outs" ? 1 : 0.22
        },
        tuning
      );

      // Warm in-memory cache for same-instance requests
      setCachedSim(propId, proj.playerId, proj.player.name, simType, line, odds, result);

      // Persist to TrendCache so other instances can skip recomputation
      await prisma.trendCache.upsert({
        where: { cacheKey: propId },
        update: {
          scope: CACHE_SCOPE,
          filterJson: toJson({ playerId: proj.playerId, statKey: proj.statKey, eventId: proj.eventId }),
          payloadJson: toJson(result),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000)
        },
        create: {
          cacheKey: propId,
          scope: CACHE_SCOPE,
          filterJson: toJson({ playerId: proj.playerId, statKey: proj.statKey, eventId: proj.eventId }),
          payloadJson: toJson(result),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000)
        }
      }).catch(() => null);

      computed++;
    } catch {
      failed++;
    }
  }

  return {
    total: projections.length,
    computed,
    failed,
    cached,
    duration: Date.now() - start,
    timestamp: new Date().toISOString()
  };
}
