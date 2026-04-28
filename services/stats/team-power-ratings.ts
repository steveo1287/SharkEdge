import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

export type TeamPowerRatingProfile = {
  teamId: string;
  teamName: string;
  teamAbbreviation: string;
  leagueKey: string;
  sampleSize: number;
  weightedOffense: number | null;
  weightedDefenseAllowed: number | null;
  weightedMargin: number | null;
  weightedPace: number | null;
  offensiveRatingProxy: number | null;
  defensiveRatingProxy: number | null;
  netRatingProxy: number | null;
  shootingScore: number;
  ballSecurityScore: number;
  reboundScore: number;
  formScore: number;
  consistencyScore: number;
  powerScore: number;
  powerTier: "ELITE" | "STRONG" | "AVERAGE" | "WEAK" | "BAD";
  updatedAt: string;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
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

function average(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return null;
  const mean = average(values) ?? 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
  return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function percentileish(value: number | null, baseline: number, spread: number, invert = false) {
  if (value === null || !Number.isFinite(value)) return 0.5;
  const raw = clamp(0.5 + (value - baseline) / spread, 0, 1);
  return invert ? 1 - raw : raw;
}

function round(value: number | null, digits = 4) {
  return value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}

function tier(powerScore: number): TeamPowerRatingProfile["powerTier"] {
  if (powerScore >= 0.78) return "ELITE";
  if (powerScore >= 0.63) return "STRONG";
  if (powerScore >= 0.43) return "AVERAGE";
  if (powerScore >= 0.28) return "WEAK";
  return "BAD";
}

function buildProfile(team: {
  id: string;
  name: string;
  abbreviation: string;
  league: { key: string };
  teamGameStats: Array<{ statsJson: Prisma.JsonValue }>;
}): TeamPowerRatingProfile | null {
  const rows = team.teamGameStats;
  if (rows.length < 3) return null;

  const points = rows.map((row) => stat(row, ["points", "PTS", "runs", "R", "goals", "G"]));
  const oppPoints = rows.map((row) => stat(row, ["opp_points", "oppPTS", "points_allowed", "runs_allowed", "RA", "goals_allowed", "GA"]));
  const possessions = rows.map((row) => stat(row, ["possessions", "pace", "plays", "shots"]));
  const fga = rows.map((row) => stat(row, ["fieldGoalsAttempted", "FGA", "shotAttempts"]));
  const fgm = rows.map((row) => stat(row, ["fieldGoalsMade", "FGM", "shotsMade"]));
  const fg3m = rows.map((row) => stat(row, ["threes", "FG3M", "threePointMade"]));
  const fta = rows.map((row) => stat(row, ["freeThrowsAttempted", "FTA"]));
  const turnovers = rows.map((row) => stat(row, ["turnovers", "TO"]));
  const oreb = rows.map((row) => stat(row, ["offensiveRebounds", "OREB"]));
  const margins = points.map((value, index) => {
    const against = oppPoints[index];
    return typeof value === "number" && typeof against === "number" ? value - against : null;
  });

  const weightedOffense = weightedAverage(points);
  const weightedDefenseAllowed = weightedAverage(oppPoints);
  const weightedMargin = weightedAverage(margins);
  const weightedPace = weightedAverage(possessions);
  const totalPoints = points.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalOppPoints = oppPoints.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalPossessions = possessions.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalFga = fga.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalFgm = fgm.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalFg3m = fg3m.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalFta = fta.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalTurnovers = turnovers.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalOreb = oreb.reduce((sum, value) => sum + (value ?? 0), 0);
  const offensiveRatingProxy = totalPossessions > 0 ? totalPoints / totalPossessions * 100 : weightedOffense;
  const defensiveRatingProxy = totalPossessions > 0 ? totalOppPoints / totalPossessions * 100 : weightedDefenseAllowed;
  const netRatingProxy = offensiveRatingProxy !== null && defensiveRatingProxy !== null ? offensiveRatingProxy - defensiveRatingProxy : weightedMargin;
  const effectiveFgPct = totalFga > 0 ? (totalFgm + 0.5 * totalFg3m) / totalFga : null;
  const freeThrowRate = totalFga > 0 ? totalFta / totalFga : null;
  const turnoverPct = totalFga + 0.44 * totalFta + totalTurnovers > 0
    ? totalTurnovers / (totalFga + 0.44 * totalFta + totalTurnovers)
    : null;
  const orebRateProxy = totalFga - totalFgm + totalOreb > 0 ? totalOreb / (totalFga - totalFgm + totalOreb) : null;
  const marginValues = margins.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const marginStd = standardDeviation(marginValues);
  const leagueKey = team.league.key;
  const nbaLike = leagueKey === "NBA" || leagueKey === "NCAAB";
  const nflLike = leagueKey === "NFL" || leagueKey === "NCAAF";
  const scoringBaseline = nbaLike ? 114 : nflLike ? 23.5 : leagueKey === "MLB" ? 4.4 : 50;
  const marginSpread = nbaLike ? 16 : nflLike ? 14 : leagueKey === "MLB" ? 3 : 10;
  const paceBaseline = nbaLike ? 99 : nflLike ? 64 : leagueKey === "MLB" ? 38 : 50;

  const shootingScore = clamp(
    percentileish(effectiveFgPct, 0.54, 0.18) * 0.65 +
    percentileish(freeThrowRate, 0.25, 0.22) * 0.35,
    0,
    1
  );
  const ballSecurityScore = percentileish(turnoverPct, 0.13, 0.12, true);
  const reboundScore = percentileish(orebRateProxy, 0.28, 0.24);
  const formScore = percentileish(weightedMargin, 0, marginSpread);
  const consistencyScore = marginStd === null ? 0.5 : clamp(1 - marginStd / Math.max(6, marginSpread), 0, 1);
  const offenseScore = percentileish(offensiveRatingProxy, scoringBaseline, marginSpread * 1.25);
  const defenseScore = percentileish(defensiveRatingProxy, scoringBaseline, marginSpread * 1.25, true);
  const paceScore = percentileish(weightedPace, paceBaseline, paceBaseline * 0.25);
  const powerScore = clamp(
    offenseScore * 0.23 +
    defenseScore * 0.21 +
    formScore * 0.2 +
    shootingScore * 0.13 +
    ballSecurityScore * 0.08 +
    reboundScore * 0.07 +
    consistencyScore * 0.05 +
    paceScore * 0.03,
    0,
    1
  );

  return {
    teamId: team.id,
    teamName: team.name,
    teamAbbreviation: team.abbreviation,
    leagueKey,
    sampleSize: rows.length,
    weightedOffense: round(weightedOffense),
    weightedDefenseAllowed: round(weightedDefenseAllowed),
    weightedMargin: round(weightedMargin),
    weightedPace: round(weightedPace),
    offensiveRatingProxy: round(offensiveRatingProxy),
    defensiveRatingProxy: round(defensiveRatingProxy),
    netRatingProxy: round(netRatingProxy),
    shootingScore: Number(shootingScore.toFixed(4)),
    ballSecurityScore: Number(ballSecurityScore.toFixed(4)),
    reboundScore: Number(reboundScore.toFixed(4)),
    formScore: Number(formScore.toFixed(4)),
    consistencyScore: Number(consistencyScore.toFixed(4)),
    powerScore: Number(powerScore.toFixed(4)),
    powerTier: tier(powerScore),
    updatedAt: new Date().toISOString()
  };
}

export async function refreshTeamPowerRatings(args: { leagueKey?: string | null; lookbackGames?: number } = {}) {
  const leagueKey = args.leagueKey ?? null;
  const lookbackGames = Math.max(5, Math.min(30, args.lookbackGames ?? 12));
  const teams = await prisma.team.findMany({
    where: leagueKey ? { league: { key: leagueKey } } : undefined,
    include: {
      league: { select: { key: true } },
      teamGameStats: {
        orderBy: { createdAt: "desc" },
        take: lookbackGames
      }
    }
  });

  let profilesWritten = 0;
  for (const team of teams) {
    const profile = buildProfile(team);
    if (!profile) continue;
    await prisma.trendCache.upsert({
      where: { cacheKey: `team_power_rating:${team.id}` },
      update: {
        scope: "team_power_rating",
        filterJson: toJson({ teamId: team.id, leagueKey: team.league.key, lookbackGames }),
        payloadJson: toJson(profile),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
      },
      create: {
        cacheKey: `team_power_rating:${team.id}`,
        scope: "team_power_rating",
        filterJson: toJson({ teamId: team.id, leagueKey: team.league.key, lookbackGames }),
        payloadJson: toJson(profile),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
      }
    });
    profilesWritten += 1;
  }

  await prisma.trendCache.upsert({
    where: { cacheKey: `team_power_rating_summary:${leagueKey ?? "all"}` },
    update: {
      scope: "team_power_rating_summary",
      filterJson: toJson({ leagueKey, lookbackGames }),
      payloadJson: toJson({ leagueKey, lookbackGames, profilesWritten, updatedAt: new Date().toISOString() }),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    },
    create: {
      cacheKey: `team_power_rating_summary:${leagueKey ?? "all"}`,
      scope: "team_power_rating_summary",
      filterJson: toJson({ leagueKey, lookbackGames }),
      payloadJson: toJson({ leagueKey, lookbackGames, profilesWritten, updatedAt: new Date().toISOString() }),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    }
  });

  return { leagueKey, lookbackGames, profilesWritten };
}

export async function getCachedTeamPowerRating(teamId: string) {
  const cached = await prisma.trendCache.findFirst({
    where: {
      cacheKey: `team_power_rating:${teamId}`,
      scope: "team_power_rating",
      expiresAt: { gt: new Date() }
    },
    orderBy: { updatedAt: "desc" }
  });
  return cached?.payloadJson as TeamPowerRatingProfile | null;
}
