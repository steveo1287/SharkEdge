import { invalidateHotCache } from "@/lib/cache/live-cache";
import { prisma } from "@/lib/db/prisma";
import { buildEventProjectionFromHistory, buildPlayerPropProjectionsForEvent } from "@/services/modeling/model-engine";
import { recomputeCurrentMarketState, recomputeEdgeSignals } from "@/services/edges/edge-engine";
import { ingestEventProjection, ingestPlayerProjection } from "@/services/market-data/market-data-service";
import { applyMarketCalibrationToPlayerProjection } from "@/services/simulation/prop-projection-calibrator";
import { evaluatePlayerProjectionReadiness } from "@/services/simulation/player-prop-readiness";
import { applyNbaSynergyAdjustmentToProjection } from "@/services/simulation/nba-synergy-projection-adjuster";
import { applyNbaMoneyballAdjustmentToProjection } from "@/services/simulation/nba-moneyball-projection-adjuster";
import { getLatestModelTuningProfile } from "@/services/evaluation/model-tuning-service";
import { applyGameOutcomePowerAdjustment } from "@/services/simulation/game-outcome-power-adjuster";

function isProjection(
  value: Awaited<ReturnType<typeof buildPlayerPropProjectionsForEvent>>[number]
): value is NonNullable<Awaited<ReturnType<typeof buildPlayerPropProjectionsForEvent>>[number]> {
  return value !== null;
}

function withPlayerStatus<T extends { playerId: string; metadata?: Record<string, unknown> | null }>(
  projection: T,
  playerStatusById: Map<string, string>
): T {
  return {
    ...projection,
    metadata: {
      ...(projection.metadata ?? {}),
      playerStatus: playerStatusById.get(projection.playerId) ?? "ACTIVE"
    }
  };
}

export async function edgeRecomputeJob(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      league: true,
      participants: {
        include: {
          competitor: {
            include: { team: true }
          }
        }
      }
    }
  });

  const homeTeam = event?.participants.find((participant) => participant.role === "HOME")?.competitor.team ?? null;
  const awayTeam = event?.participants.find((participant) => participant.role === "AWAY")?.competitor.team ?? null;

  const eventProjection = await buildEventProjectionFromHistory(eventId);
  let gameOutcomePowerAdjusted = false;
  if (eventProjection) {
    const adjustedEventProjection = await applyGameOutcomePowerAdjustment({
      projection: eventProjection,
      leagueKey: event?.league.key ?? "",
      homeTeam,
      awayTeam
    });
    const metadata = adjustedEventProjection.metadata as Record<string, unknown> | undefined;
    gameOutcomePowerAdjusted = metadata?.gameOutcomePowerAdjusted === true;
    await ingestEventProjection(adjustedEventProjection);
  }

  const tuningProfile = event?.league.key
    ? await getLatestModelTuningProfile(event.league.key)
    : null;

  const playerProjections = await buildPlayerPropProjectionsForEvent(eventId);
  const validPlayerProjections = playerProjections.filter(isProjection);
  const playerIds = Array.from(new Set(validPlayerProjections.map((projection) => projection.playerId)));
  const players = playerIds.length
    ? await prisma.player.findMany({
        where: { id: { in: playerIds } },
        include: {
          team: {
            select: { id: true, name: true, abbreviation: true }
          }
        }
      })
    : [];
  const playerStatusById = new Map(players.map((player) => [player.id, player.status]));
  const playerById = new Map(players.map((player) => [player.id, player]));
  const recentStats = playerIds.length
    ? await prisma.playerGameStat.findMany({
        where: { playerId: { in: playerIds } },
        orderBy: { createdAt: "desc" },
        take: Math.max(12, playerIds.length * 12)
      })
    : [];
  const recentStatsByPlayerId = new Map<string, typeof recentStats>();
  for (const stat of recentStats) {
    const existing = recentStatsByPlayerId.get(stat.playerId) ?? [];
    if (existing.length < 12) {
      existing.push(stat);
      recentStatsByPlayerId.set(stat.playerId, existing);
    }
  }

  const removedExistingPlayerProjections = await prisma.playerProjection.deleteMany({
    where: { eventId }
  });

  let calibratedPlayerProjectionCount = 0;
  let eligiblePlayerProjectionCount = 0;
  let skippedPlayerProjectionCount = 0;
  let moneyballAdjustedPlayerProjectionCount = 0;
  let synergyAdjustedPlayerProjectionCount = 0;
  let tunedPlayerProjectionCount = 0;
  const skipReasons: Record<string, number> = {};

  for (const projection of validPlayerProjections) {
    const projectionWithStatus = withPlayerStatus(projection, playerStatusById);
    const readiness = evaluatePlayerProjectionReadiness(
      projectionWithStatus,
      recentStatsByPlayerId.get(projection.playerId) ?? []
    );

    if (!readiness.eligible) {
      skippedPlayerProjectionCount += 1;
      skipReasons[readiness.reason] = (skipReasons[readiness.reason] ?? 0) + 1;
      continue;
    }

    eligiblePlayerProjectionCount += 1;
    const player = playerById.get(projection.playerId) ?? null;
    const opponentTeam = player?.teamId === homeTeam?.id ? awayTeam : player?.teamId === awayTeam?.id ? homeTeam : null;
    const moneyballProjection = event?.league.key === "NBA"
      ? await applyNbaMoneyballAdjustmentToProjection({
          projection: readiness.projection,
          player,
          opponentTeam
        })
      : readiness.projection;
    const moneyballMetadata = moneyballProjection.metadata as Record<string, unknown> | undefined;
    if (moneyballMetadata?.moneyballAdjusted === true) {
      moneyballAdjustedPlayerProjectionCount += 1;
    }

    const synergyProjection = event?.league.key === "NBA"
      ? await applyNbaSynergyAdjustmentToProjection({
          projection: moneyballProjection,
          player,
          opponentTeam
        })
      : moneyballProjection;
    const synergyMetadata = synergyProjection.metadata as Record<string, unknown> | undefined;
    if (synergyMetadata?.synergyAdjusted === true) {
      synergyAdjustedPlayerProjectionCount += 1;
    }

    const tuningRule = tuningProfile?.rules?.[projection.statKey] ?? tuningProfile?.defaultRule ?? null;
    if (tuningRule) {
      tunedPlayerProjectionCount += 1;
    }
    const calibratedProjection = applyMarketCalibrationToPlayerProjection(synergyProjection, { tuningRule });
    const metadata = calibratedProjection.metadata as Record<string, unknown> | undefined;
    if (metadata?.marketCalibrated === true) {
      calibratedPlayerProjectionCount += 1;
    }
    await ingestPlayerProjection(calibratedProjection);
  }

  await recomputeCurrentMarketState(eventId);
  await recomputeEdgeSignals(eventId);

  if (event) {
    await invalidateHotCache("edges:v1:all");
    await invalidateHotCache(`event:v1:${event.id}`);
    await invalidateHotCache(`board:v1:${event.league.key}`);
  }

  return {
    eventId,
    eventProjectionBuilt: Boolean(eventProjection),
    gameOutcomePowerAdjusted,
    playerProjectionCount: validPlayerProjections.length,
    removedExistingPlayerProjectionCount: removedExistingPlayerProjections.count,
    eligiblePlayerProjectionCount,
    skippedPlayerProjectionCount,
    moneyballAdjustedPlayerProjectionCount,
    synergyAdjustedPlayerProjectionCount,
    tunedPlayerProjectionCount,
    calibratedPlayerProjectionCount,
    tuningProfileApplied: Boolean(tuningProfile),
    skipReasons
  };
}
