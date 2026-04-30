import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { RETROSHEET_ATTRIBUTION, requiresRetrosheetAttribution } from "@/services/data/retrosheet/attribution";
import type { MlbPregameEloContext } from "@/services/simulation/contextual-game-sim";

const SOURCE_KEY = "RETROSHEET";

export type RetrosheetTeamStrengthContext = {
  scored: number;
  allowed: number;
};

export type RetrosheetModelContext = {
  retrosheetTeamId: string | null;
  teamStrengthContext: RetrosheetTeamStrengthContext | null;
  mlbPregameEloContext: MlbPregameEloContext | null;
  metadata: {
    sourceKey: typeof SOURCE_KEY;
    retrosheetTeamId: string | null;
    teamStrengthGames: number;
    eloSnapshotAt: string | null;
    pitcherRollingSnapshotAt: string | null;
    teamStarterRollingGames: number;
    attribution: string;
  } | null;
  requiresRetrosheetAttribution: boolean;
};

export async function buildMlbRetrosheetModelContext(args: {
  teamExternalIds: Prisma.JsonValue;
  eventStartTime: Date;
  isHome: boolean;
  restDays?: number | null;
  milesTraveled?: number | null;
  probableStarterExternalIds?: Prisma.JsonValue | null;
  isOpener?: boolean | null;
  noFans?: boolean | null;
}): Promise<RetrosheetModelContext> {
  const retrosheetTeamId = getRetrosheetExternalId(args.teamExternalIds, ["teamId", "retrosheetTeamId"]);
  if (!retrosheetTeamId) {
    return emptyMlbRetrosheetModelContext(null);
  }

  const [recentTeamStats, latestElo, starterSnapshot, teamStarterSnapshots] = await Promise.all([
    prisma.retrosheetTeamGameStat.findMany({
      where: {
        sourceKey: SOURCE_KEY,
        teamId: retrosheetTeamId,
        gameDate: { lt: args.eventStartTime }
      },
      orderBy: { gameDate: "desc" },
      take: 12
    }),
    prisma.mlbTeamEloSnapshot.findFirst({
      where: {
        sourceKey: SOURCE_KEY,
        teamId: retrosheetTeamId,
        gameDate: { lt: args.eventStartTime }
      },
      orderBy: { gameDate: "desc" }
    }),
    getProbableStarterRollingSnapshot(args.probableStarterExternalIds, args.eventStartTime),
    prisma.mlbPitcherRollingSnapshot.findMany({
      where: {
        sourceKey: SOURCE_KEY,
        teamId: retrosheetTeamId,
        gameDate: { lt: args.eventStartTime }
      },
      orderBy: { gameDate: "desc" },
      take: 12
    })
  ]);

  const teamStrengthContext =
    recentTeamStats.length >= 2
      ? {
          scored: recentTeamStats.reduce((sum, row) => sum + row.runs, 0),
          allowed: recentTeamStats.reduce((sum, row) => sum + row.runsAllowed, 0)
        }
      : null;

  const teamRollingGameScore =
    teamStarterSnapshots.length > 0
      ? teamStarterSnapshots.reduce((sum, row) => sum + row.rollingGameScore, 0) / teamStarterSnapshots.length
      : null;

  const mlbPregameEloContext: MlbPregameEloContext | null =
    latestElo || starterSnapshot || teamRollingGameScore != null || args.restDays != null || args.milesTraveled != null
      ? {
          rating: latestElo?.postGameElo ?? null,
          milesTraveled: args.milesTraveled ?? null,
          restDays: args.restDays ?? null,
          pitcherRollingGameScore: starterSnapshot?.rollingGameScore ?? null,
          teamRollingGameScore,
          isOpener: args.isOpener ?? null,
          noFans: args.noFans ?? null
        }
      : null;

  const sourceKeys =
    recentTeamStats.length || latestElo || starterSnapshot || teamStarterSnapshots.length
      ? [SOURCE_KEY]
      : [];

  return {
    retrosheetTeamId,
    teamStrengthContext,
    mlbPregameEloContext,
    metadata: sourceKeys.length
      ? {
          sourceKey: SOURCE_KEY,
          retrosheetTeamId,
          teamStrengthGames: recentTeamStats.length,
          eloSnapshotAt: latestElo?.gameDate.toISOString() ?? null,
          pitcherRollingSnapshotAt: starterSnapshot?.gameDate.toISOString() ?? null,
          teamStarterRollingGames: teamStarterSnapshots.length,
          attribution: RETROSHEET_ATTRIBUTION
        }
      : null,
    requiresRetrosheetAttribution: requiresRetrosheetAttribution(sourceKeys)
  };
}

export function emptyMlbRetrosheetModelContext(retrosheetTeamId: string | null = null): RetrosheetModelContext {
  return {
    retrosheetTeamId,
    teamStrengthContext: null,
    mlbPregameEloContext: null,
    metadata: null,
    requiresRetrosheetAttribution: false
  };
}

async function getProbableStarterRollingSnapshot(externalIds: Prisma.JsonValue | null | undefined, eventStartTime: Date) {
  const retrosheetPitcherId = getRetrosheetExternalId(externalIds, ["playerId", "pitcherId", "retrosheetPitcherId"]);
  if (!retrosheetPitcherId) return null;

  return prisma.mlbPitcherRollingSnapshot.findFirst({
    where: {
      sourceKey: SOURCE_KEY,
      pitcherId: retrosheetPitcherId,
      gameDate: { lt: eventStartTime }
    },
    orderBy: { gameDate: "desc" }
  });
}

export function getRetrosheetExternalId(
  externalIds: Prisma.JsonValue | null | undefined,
  preferredKeys: string[]
) {
  if (!externalIds || typeof externalIds !== "object" || Array.isArray(externalIds)) return null;
  const object = externalIds as Record<string, unknown>;
  const retrosheet = object.retrosheet;

  if (typeof retrosheet === "string" && retrosheet.trim()) return retrosheet.trim();
  if (retrosheet && typeof retrosheet === "object" && !Array.isArray(retrosheet)) {
    const nested = retrosheet as Record<string, unknown>;
    for (const key of preferredKeys) {
      const value = nested[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  for (const key of preferredKeys) {
    const value = object[key] ?? object[`retrosheet${capitalize(key)}`];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

function capitalize(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}
