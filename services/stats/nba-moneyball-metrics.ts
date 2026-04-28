import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

type PlayerMoneyballProfile = {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  teamAbbreviation: string;
  sampleSize: number;
  minutesSampleSize: number;
  avgMinutes: number;
  weightedMinutes: number;
  roleStability: number;
  starterRate: number;
  trueShootingPct: number | null;
  effectiveFgPct: number | null;
  usageProxy: number | null;
  pointsPerScoringChance: number | null;
  assistPerMinute: number | null;
  reboundPerMinute: number | null;
  threeAttemptRate: number | null;
  threePointPct: number | null;
  freeThrowRate: number | null;
  turnoverPerChance: number | null;
  consistencyScore: number;
  efficiencyScore: number;
  roleScore: number;
  valueScore: number;
  undervaluedFlags: string[];
  updatedAt: string;
};

type TeamMoneyballProfile = {
  teamId: string;
  teamName: string;
  teamAbbreviation: string;
  sampleSize: number;
  pace: number | null;
  offensiveRatingProxy: number | null;
  defensiveRatingProxy: number | null;
  netRatingProxy: number | null;
  effectiveFgPct: number | null;
  freeThrowRate: number | null;
  turnoverPct: number | null;
  offensiveReboundRateProxy: number | null;
  possessionQualityScore: number;
  shootingQualityScore: number;
  ballSecurityScore: number;
  updatedAt: string;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[%,$]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
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
  return clean.length ? clean.reduce((sum: number, value) => sum + value, 0) / clean.length : null;
}

function sum(values: Array<number | null | undefined>) {
  return values.reduce((total: number, value) => total + (typeof value === "number" && Number.isFinite(value) ? value : 0), 0);
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
  return totalWeight ? weighted / totalWeight : null;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return null;
  const mean = average(values) ?? 0;
  const variance = values.reduce((total: number, value) => total + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
  return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function safeRate(numerator: number | null, denominator: number | null) {
  if (typeof numerator !== "number" || typeof denominator !== "number" || denominator <= 0) return null;
  return numerator / denominator;
}

function percentileish(value: number | null, baseline: number, spread: number, invert = false) {
  if (value === null || !Number.isFinite(value)) return 0.5;
  const raw = clamp(0.5 + (value - baseline) / spread, 0, 1);
  return invert ? 1 - raw : raw;
}

function round(value: number | null, digits = 4) {
  return value === null ? null : Number(value.toFixed(digits));
}

function playerProfile(player: {
  id: string;
  name: string;
  teamId: string;
  team: { id: string; name: string; abbreviation: string };
  playerGameStats: Array<{ statsJson: Prisma.JsonValue; minutes: number | null; starter: boolean; outcomeStatus: string }>;
}): PlayerMoneyballProfile | null {
  const rows = player.playerGameStats;
  if (!rows.length) return null;

  const minutes = rows
    .map((row) => row.minutes ?? stat(row, ["minutes", "MIN", "MP"]))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  const points = rows.map((row) => stat(row, ["points", "PTS"]));
  const fga = rows.map((row) => stat(row, ["fieldGoalsAttempted", "FGA"]));
  const fgm = rows.map((row) => stat(row, ["fieldGoalsMade", "FGM"]));
  const fta = rows.map((row) => stat(row, ["freeThrowsAttempted", "FTA"]));
  const fg3a = rows.map((row) => stat(row, ["threePointAttempts", "FG3A", "3PA"]));
  const fg3m = rows.map((row) => stat(row, ["threes", "FG3M", "3PM"]));
  const assists = rows.map((row) => stat(row, ["assists", "AST"]));
  const rebounds = rows.map((row) => stat(row, ["rebounds", "REB"]));
  const turnovers = rows.map((row) => stat(row, ["turnovers", "TO"]));

  const totalPoints = sum(points);
  const totalFga = sum(fga);
  const totalFgm = sum(fgm);
  const totalFta = sum(fta);
  const totalFg3m = sum(fg3m);
  const totalFg3a = sum(fg3a);
  const totalAssists = sum(assists);
  const totalRebounds = sum(rebounds);
  const totalTurnovers = sum(turnovers);
  const totalMinutes = sum(minutes);
  const scoringChances = totalFga + 0.44 * totalFta;
  const usageChances = scoringChances + totalTurnovers;
  const avgMinutes = average(minutes) ?? 0;
  const weightedMinutes = weightedAverage(minutes) ?? avgMinutes;
  const minutesStd = standardDeviation(minutes) ?? 0;
  const roleStability = clamp(1 - minutesStd / Math.max(6, avgMinutes), 0.05, 1);
  const starterRate = rows.length ? rows.filter((row) => row.starter).length / rows.length : 0;
  const trueShootingPct = safeRate(totalPoints, 2 * scoringChances);
  const effectiveFgPct = safeRate(totalFgm + 0.5 * totalFg3m, totalFga);
  const usageProxy = safeRate(usageChances, totalMinutes);
  const pointsPerScoringChance = safeRate(totalPoints, scoringChances);
  const assistPerMinute = safeRate(totalAssists, totalMinutes);
  const reboundPerMinute = safeRate(totalRebounds, totalMinutes);
  const threeAttemptRate = safeRate(totalFg3a, totalMinutes);
  const threePointPct = safeRate(totalFg3m, totalFg3a);
  const freeThrowRate = safeRate(totalFta, totalFga);
  const turnoverPerChance = safeRate(totalTurnovers, usageChances);
  const pointValues = points.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const pointsStd = standardDeviation(pointValues) ?? 0;
  const consistencyScore = clamp(1 - pointsStd / Math.max(6, average(pointValues) ?? 0), 0.05, 1);
  const efficiencyScore = clamp(
    percentileish(trueShootingPct, 0.57, 0.18) * 0.38 +
    percentileish(effectiveFgPct, 0.53, 0.18) * 0.32 +
    percentileish(pointsPerScoringChance, 1.12, 0.45) * 0.2 +
    percentileish(turnoverPerChance, 0.105, 0.11, true) * 0.1,
    0,
    1
  );
  const roleScore = clamp(
    percentileish(weightedMinutes, 22, 18) * 0.42 +
    roleStability * 0.34 +
    starterRate * 0.24,
    0,
    1
  );
  const valueScore = clamp(efficiencyScore * 0.48 + roleScore * 0.32 + consistencyScore * 0.2, 0, 1);
  const undervaluedFlags: string[] = [];
  if (trueShootingPct !== null && trueShootingPct >= 0.61 && usageProxy !== null && usageProxy >= 0.34) undervaluedFlags.push("efficient_high_usage");
  if (roleStability >= 0.72 && weightedMinutes >= 26 && starterRate < 0.5) undervaluedFlags.push("stable_bench_minutes");
  if (threeAttemptRate !== null && threeAttemptRate >= 0.18 && threePointPct !== null && threePointPct >= 0.37) undervaluedFlags.push("plus_spacing_volume");
  if (assistPerMinute !== null && assistPerMinute >= 0.18 && turnoverPerChance !== null && turnoverPerChance <= 0.11) undervaluedFlags.push("efficient_creator");
  if (reboundPerMinute !== null && reboundPerMinute >= 0.29 && avgMinutes >= 18) undervaluedFlags.push("rebound_rate_specialist");

  return {
    playerId: player.id,
    playerName: player.name,
    teamId: player.teamId,
    teamName: player.team.name,
    teamAbbreviation: player.team.abbreviation,
    sampleSize: rows.length,
    minutesSampleSize: minutes.length,
    avgMinutes: Number(avgMinutes.toFixed(2)),
    weightedMinutes: Number(weightedMinutes.toFixed(2)),
    roleStability: Number(roleStability.toFixed(4)),
    starterRate: Number(starterRate.toFixed(4)),
    trueShootingPct: round(trueShootingPct),
    effectiveFgPct: round(effectiveFgPct),
    usageProxy: round(usageProxy),
    pointsPerScoringChance: round(pointsPerScoringChance),
    assistPerMinute: round(assistPerMinute),
    reboundPerMinute: round(reboundPerMinute),
    threeAttemptRate: round(threeAttemptRate),
    threePointPct: round(threePointPct),
    freeThrowRate: round(freeThrowRate),
    turnoverPerChance: round(turnoverPerChance),
    consistencyScore: Number(consistencyScore.toFixed(4)),
    efficiencyScore: Number(efficiencyScore.toFixed(4)),
    roleScore: Number(roleScore.toFixed(4)),
    valueScore: Number(valueScore.toFixed(4)),
    undervaluedFlags,
    updatedAt: new Date().toISOString()
  };
}

function teamProfile(team: {
  id: string;
  name: string;
  abbreviation: string;
  teamGameStats: Array<{ statsJson: Prisma.JsonValue }>;
}): TeamMoneyballProfile | null {
  const rows = team.teamGameStats;
  if (!rows.length) return null;

  const points = rows.map((row) => stat(row, ["points", "PTS"]));
  const oppPoints = rows.map((row) => stat(row, ["opp_points", "oppPTS"]));
  const possessions = rows.map((row) => stat(row, ["possessions", "pace"]));
  const fga = rows.map((row) => stat(row, ["fieldGoalsAttempted", "FGA"]));
  const fgm = rows.map((row) => stat(row, ["fieldGoalsMade", "FGM"]));
  const fg3m = rows.map((row) => stat(row, ["threes", "FG3M"]));
  const fta = rows.map((row) => stat(row, ["freeThrowsAttempted", "FTA"]));
  const turnovers = rows.map((row) => stat(row, ["turnovers", "TO"]));
  const oreb = rows.map((row) => stat(row, ["offensiveRebounds", "OREB"]));
  const avgPossessions = average(possessions);
  const totalPoints = sum(points);
  const totalOppPoints = sum(oppPoints);
  const totalPossessions = sum(possessions);
  const totalFga = sum(fga);
  const totalFgm = sum(fgm);
  const totalFg3m = sum(fg3m);
  const totalFta = sum(fta);
  const totalTurnovers = sum(turnovers);
  const totalOreb = sum(oreb);
  const offensiveRatingProxy = totalPossessions > 0 ? totalPoints / totalPossessions * 100 : null;
  const defensiveRatingProxy = totalPossessions > 0 ? totalOppPoints / totalPossessions * 100 : null;
  const netRatingProxy = offensiveRatingProxy !== null && defensiveRatingProxy !== null ? offensiveRatingProxy - defensiveRatingProxy : null;
  const effectiveFgPct = safeRate(totalFgm + 0.5 * totalFg3m, totalFga);
  const freeThrowRate = safeRate(totalFta, totalFga);
  const turnoverPct = safeRate(totalTurnovers, totalFga + 0.44 * totalFta + totalTurnovers);
  const offensiveReboundRateProxy = safeRate(totalOreb, totalFga - totalFgm + totalOreb);
  const possessionQualityScore = clamp(
    percentileish(offensiveRatingProxy, 114, 16) * 0.52 +
    percentileish(netRatingProxy, 0, 18) * 0.32 +
    percentileish(avgPossessions, 100, 16) * 0.16,
    0,
    1
  );
  const shootingQualityScore = clamp(
    percentileish(effectiveFgPct, 0.54, 0.16) * 0.72 +
    percentileish(freeThrowRate, 0.25, 0.2) * 0.28,
    0,
    1
  );
  const ballSecurityScore = percentileish(turnoverPct, 0.13, 0.12, true);

  return {
    teamId: team.id,
    teamName: team.name,
    teamAbbreviation: team.abbreviation,
    sampleSize: rows.length,
    pace: round(avgPossessions),
    offensiveRatingProxy: round(offensiveRatingProxy),
    defensiveRatingProxy: round(defensiveRatingProxy),
    netRatingProxy: round(netRatingProxy),
    effectiveFgPct: round(effectiveFgPct),
    freeThrowRate: round(freeThrowRate),
    turnoverPct: round(turnoverPct),
    offensiveReboundRateProxy: round(offensiveReboundRateProxy),
    possessionQualityScore: Number(possessionQualityScore.toFixed(4)),
    shootingQualityScore: Number(shootingQualityScore.toFixed(4)),
    ballSecurityScore: Number(ballSecurityScore.toFixed(4)),
    updatedAt: new Date().toISOString()
  };
}

async function persistProfile(cacheKey: string, scope: string, filterJson: JsonRecord, payloadJson: unknown) {
  await prisma.trendCache.upsert({
    where: { cacheKey },
    update: {
      scope,
      filterJson: toJson(filterJson),
      payloadJson: toJson(payloadJson),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    },
    create: {
      cacheKey,
      scope,
      filterJson: toJson(filterJson),
      payloadJson: toJson(payloadJson),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    }
  });
}

export async function refreshNbaMoneyballMetrics(args: { lookbackGames?: number } = {}) {
  const lookbackGames = Math.max(5, Math.min(30, args.lookbackGames ?? 12));
  const league = await prisma.league.findUnique({ where: { key: "NBA" } });
  if (!league) {
    return { playerProfilesWritten: 0, teamProfilesWritten: 0, error: "NBA league missing" };
  }

  const [players, teams] = await Promise.all([
    prisma.player.findMany({
      where: { leagueId: league.id },
      include: {
        team: { select: { id: true, name: true, abbreviation: true } },
        playerGameStats: {
          orderBy: { createdAt: "desc" },
          take: lookbackGames
        }
      }
    }),
    prisma.team.findMany({
      where: { leagueId: league.id },
      include: {
        teamGameStats: {
          orderBy: { createdAt: "desc" },
          take: lookbackGames
        }
      }
    })
  ]);

  let playerProfilesWritten = 0;
  let teamProfilesWritten = 0;

  for (const player of players) {
    const profile = playerProfile(player);
    if (!profile || profile.sampleSize < 3) continue;
    await persistProfile(
      `nba_moneyball_player:${player.id}`,
      "nba_moneyball_player",
      { playerId: player.id, teamId: player.teamId, lookbackGames },
      profile
    );
    playerProfilesWritten += 1;
  }

  for (const team of teams) {
    const profile = teamProfile(team);
    if (!profile || profile.sampleSize < 3) continue;
    await persistProfile(
      `nba_moneyball_team:${team.id}`,
      "nba_moneyball_team",
      { teamId: team.id, lookbackGames },
      profile
    );
    teamProfilesWritten += 1;
  }

  await persistProfile(
    "nba_moneyball_summary",
    "nba_moneyball_summary",
    { lookbackGames },
    {
      lookbackGames,
      playerProfilesWritten,
      teamProfilesWritten,
      updatedAt: new Date().toISOString()
    }
  );

  return { lookbackGames, playerProfilesWritten, teamProfilesWritten };
}

export async function getCachedNbaMoneyballPlayerProfile(playerId: string) {
  const cached = await prisma.trendCache.findFirst({
    where: {
      cacheKey: `nba_moneyball_player:${playerId}`,
      scope: "nba_moneyball_player",
      expiresAt: { gt: new Date() }
    },
    orderBy: { updatedAt: "desc" }
  });
  return cached?.payloadJson as PlayerMoneyballProfile | null;
}

export async function getCachedNbaMoneyballTeamProfile(teamId: string) {
  const cached = await prisma.trendCache.findFirst({
    where: {
      cacheKey: `nba_moneyball_team:${teamId}`,
      scope: "nba_moneyball_team",
      expiresAt: { gt: new Date() }
    },
    orderBy: { updatedAt: "desc" }
  });
  return cached?.payloadJson as TeamMoneyballProfile | null;
}
