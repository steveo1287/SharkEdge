import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export type PlayerLockImpactTeam = {
  teamId: string;
  teamName: string;
  unavailableCount: number;
  questionableCount: number;
  activeCoreCount: number;
  lostMinutes: number;
  lostUsage: number;
  lostValueScore: number;
  scoreDelta: number;
  spreadDelta: number;
  confidence: number;
  drivers: string[];
};

export type PlayerLockImpactSummary = {
  home: PlayerLockImpactTeam;
  away: PlayerLockImpactTeam;
  homeSpreadDelta: number;
  homeScoreDelta: number;
  awayScoreDelta: number;
  totalDelta: number;
  confidence: number;
  drivers: string[];
};

type PlayerWithStats = {
  id: string;
  name: string;
  teamId: string;
  status: string;
  position: string | null;
  playerGameStats: Array<{
    minutes: number | null;
    starter: boolean;
    statsJson: Prisma.JsonValue;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[%,$]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stat(row: { statsJson: Prisma.JsonValue }, keys: string[]) {
  const record = asRecord(row.statsJson);
  for (const key of keys) {
    const value = readNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function average(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function weightedAverage(values: Array<number | null | undefined>, decay = 0.86) {
  let weighted = 0;
  let totalWeight = 0;
  values.forEach((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const weight = decay ** index;
    weighted += value * weight;
    totalWeight += weight;
  });
  return totalWeight ? weighted / totalWeight : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function playerImpact(player: PlayerWithStats) {
  const rows = player.playerGameStats;
  const minutes = rows.map((row) => row.minutes ?? stat(row, ["minutes", "MIN", "MP"]));
  const points = rows.map((row) => stat(row, ["points", "PTS"]));
  const fga = rows.map((row) => stat(row, ["fieldGoalsAttempted", "FGA"]));
  const fta = rows.map((row) => stat(row, ["freeThrowsAttempted", "FTA"]));
  const assists = rows.map((row) => stat(row, ["assists", "AST"]));
  const rebounds = rows.map((row) => stat(row, ["rebounds", "REB"]));
  const turnovers = rows.map((row) => stat(row, ["turnovers", "TO"]));
  const weightedMinutes = weightedAverage(minutes);
  const avgPoints = average(points);
  const avgAssists = average(assists);
  const avgRebounds = average(rebounds);
  const totalFga = fga.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalFta = fta.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalTurnovers = turnovers.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalMinutes = minutes.reduce((sum, value) => sum + (value ?? 0), 0);
  const usageProxy = totalMinutes > 0 ? (totalFga + 0.44 * totalFta + totalTurnovers) / totalMinutes : 0;
  const starterRate = rows.length ? rows.filter((row) => row.starter).length / rows.length : 0;
  const productionValue = avgPoints * 0.055 + avgAssists * 0.07 + avgRebounds * 0.035;
  const usageValue = usageProxy * weightedMinutes * 0.12;
  const roleValue = weightedMinutes * 0.035 + starterRate * 0.9;
  const valueScore = clamp(productionValue + usageValue + roleValue, 0, 7);

  return {
    weightedMinutes,
    usageProxy,
    starterRate,
    valueScore,
    sampleSize: rows.length
  };
}

function statusRisk(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "OUT") return 1;
  if (normalized === "DOUBTFUL") return 0.85;
  if (normalized === "QUESTIONABLE") return 0.38;
  return 0;
}

function buildTeamImpact(args: {
  teamId: string;
  teamName: string;
  players: PlayerWithStats[];
  home: boolean;
}) {
  let lostMinutes = 0;
  let lostUsage = 0;
  let lostValueScore = 0;
  let unavailableCount = 0;
  let questionableCount = 0;
  let activeCoreCount = 0;
  const drivers: string[] = [];

  for (const player of args.players) {
    const impact = playerImpact(player);
    const risk = statusRisk(player.status);
    if (impact.weightedMinutes >= 18 && risk < 0.2) activeCoreCount += 1;
    if (risk <= 0) continue;
    if (risk >= 0.8) unavailableCount += 1;
    else questionableCount += 1;

    lostMinutes += impact.weightedMinutes * risk;
    lostUsage += impact.usageProxy * impact.weightedMinutes * risk;
    lostValueScore += impact.valueScore * risk;

    if (impact.weightedMinutes >= 14 || impact.valueScore >= 2) {
      drivers.push(`${player.name} ${player.status}: ${round(impact.weightedMinutes, 1)} min, value ${round(impact.valueScore, 2)}.`);
    }
  }

  const scoreDelta = -clamp(lostValueScore * 0.55 + lostMinutes * 0.025 + lostUsage * 0.08, 0, 9.5);
  const spreadDelta = scoreDelta;
  const confidence = clamp((unavailableCount + questionableCount * 0.55) / 4 + lostMinutes / 120, 0.05, 0.95);

  return {
    teamId: args.teamId,
    teamName: args.teamName,
    unavailableCount,
    questionableCount,
    activeCoreCount,
    lostMinutes: round(lostMinutes, 2),
    lostUsage: round(lostUsage, 3),
    lostValueScore: round(lostValueScore, 3),
    scoreDelta: round(scoreDelta, 3),
    spreadDelta: round(spreadDelta, 3),
    confidence: round(confidence, 4),
    drivers
  } satisfies PlayerLockImpactTeam;
}

export async function buildPlayerLockImpactForEvent(args: {
  eventId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
}): Promise<PlayerLockImpactSummary> {
  const players = await prisma.player.findMany({
    where: { teamId: { in: [args.homeTeamId, args.awayTeamId] } },
    include: {
      playerGameStats: {
        orderBy: { createdAt: "desc" },
        take: 10
      }
    }
  });

  const home = buildTeamImpact({
    teamId: args.homeTeamId,
    teamName: args.homeTeamName,
    players: players.filter((player) => player.teamId === args.homeTeamId),
    home: true
  });
  const away = buildTeamImpact({
    teamId: args.awayTeamId,
    teamName: args.awayTeamName,
    players: players.filter((player) => player.teamId === args.awayTeamId),
    home: false
  });

  const homeSpreadDelta = round(home.spreadDelta - away.spreadDelta, 3);
  const homeScoreDelta = home.scoreDelta;
  const awayScoreDelta = away.scoreDelta;
  const totalDelta = round(homeScoreDelta + awayScoreDelta, 3);
  const confidence = round(clamp((home.confidence + away.confidence) / 2, 0.05, 0.95), 4);

  return {
    home,
    away,
    homeSpreadDelta,
    homeScoreDelta,
    awayScoreDelta,
    totalDelta,
    confidence,
    drivers: [...home.drivers.map((driver) => `Home ${driver}`), ...away.drivers.map((driver) => `Away ${driver}`)]
  };
}
