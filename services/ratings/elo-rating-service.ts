import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

type EloTeamRating = {
  teamId: string;
  teamName: string;
  abbreviation: string;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  avgMargin: number;
  lastGameAt: string | null;
};

type EloRunResult = {
  leagueKey: string;
  lookbackDays: number;
  baseRating: number;
  homeFieldElo: number;
  kFactor: number;
  teamsRated: number;
  gamesProcessed: number;
  brier: number | null;
  logLoss: number | null;
  accuracy: number | null;
  ratings: EloTeamRating[];
  generatedAt: string;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function probabilityFromElo(diff: number) {
  return 1 / (1 + 10 ** (-diff / 400));
}

function marginMultiplier(margin: number, ratingDiff: number) {
  const absMargin = Math.max(1, Math.abs(margin));
  return Math.log(absMargin + 1) * (2.2 / (Math.abs(ratingDiff) * 0.001 + 2.2));
}

function safeLogLoss(probability: number, actual: number) {
  const p = clamp(probability, 0.01, 0.99);
  return -(actual * Math.log(p) + (1 - actual) * Math.log(1 - p));
}

function extractScore(scoreJson: unknown, side: "home" | "away") {
  const score = asRecord(scoreJson);
  const keys = side === "home"
    ? ["homeScore", "home", "home_score", "homeRuns", "home_points"]
    : ["awayScore", "away", "away_score", "awayRuns", "away_points"];
  for (const key of keys) {
    const value = readNumber(score[key]);
    if (value !== null) return value;
  }
  return null;
}

function eventResultScore(resultJson: unknown, scoreJson: unknown, stateJson: unknown, side: "home" | "away") {
  return extractScore(resultJson, side) ?? extractScore(scoreJson, side) ?? extractScore(stateJson, side);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function makeDefault(team: { id: string; name: string; abbreviation: string }, baseRating: number): EloTeamRating {
  return {
    teamId: team.id,
    teamName: team.name,
    abbreviation: team.abbreviation,
    rating: baseRating,
    games: 0,
    wins: 0,
    losses: 0,
    avgMargin: 0,
    lastGameAt: null
  };
}

export async function rebuildEloRatings(args: {
  leagueKey: string;
  lookbackDays?: number;
  baseRating?: number;
  homeFieldElo?: number;
  kFactor?: number;
}): Promise<EloRunResult> {
  const leagueKey = args.leagueKey;
  const lookbackDays = Math.max(7, Math.min(3650, args.lookbackDays ?? 365));
  const baseRating = args.baseRating ?? 1500;
  const homeFieldElo = args.homeFieldElo ?? (leagueKey === "MLB" ? 24 : leagueKey === "NBA" ? 55 : 45);
  const kFactor = args.kFactor ?? (leagueKey === "MLB" ? 18 : leagueKey === "NBA" ? 20 : 22);
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const league = await prisma.league.findUnique({ where: { key: leagueKey } });
  if (!league) {
    return { leagueKey, lookbackDays, baseRating, homeFieldElo, kFactor, teamsRated: 0, gamesProcessed: 0, brier: null, logLoss: null, accuracy: null, ratings: [], generatedAt: new Date().toISOString() };
  }

  const teams = await prisma.team.findMany({ where: { leagueId: league.id } });
  const ratings = new Map<string, EloTeamRating>();
  for (const team of teams) ratings.set(team.id, makeDefault(team, baseRating));

  const games = await prisma.game.findMany({
    where: { leagueId: league.id, status: "FINAL", startTime: { gte: since } },
    orderBy: { startTime: "asc" },
    include: {
      homeTeam: { select: { id: true, name: true, abbreviation: true } },
      awayTeam: { select: { id: true, name: true, abbreviation: true } }
    },
    take: 5000
  });

  const briers: number[] = [];
  const losses: number[] = [];
  let correct = 0;
  let gamesProcessed = 0;

  for (const game of games) {
    const homeScore = eventResultScore(game.scoreJson, game.scoreJson, game.liveStateJson, "home");
    const awayScore = eventResultScore(game.scoreJson, game.scoreJson, game.liveStateJson, "away");
    if (homeScore === null || awayScore === null || homeScore === awayScore) continue;

    const home = ratings.get(game.homeTeamId) ?? makeDefault(game.homeTeam, baseRating);
    const away = ratings.get(game.awayTeamId) ?? makeDefault(game.awayTeam, baseRating);
    const ratingDiff = home.rating + homeFieldElo - away.rating;
    const expectedHome = probabilityFromElo(ratingDiff);
    const actualHome = homeScore > awayScore ? 1 : 0;
    const margin = homeScore - awayScore;
    const multiplier = marginMultiplier(margin, ratingDiff);
    const delta = kFactor * multiplier * (actualHome - expectedHome);

    home.rating += delta;
    away.rating -= delta;
    home.games += 1;
    away.games += 1;
    home.wins += actualHome ? 1 : 0;
    home.losses += actualHome ? 0 : 1;
    away.wins += actualHome ? 0 : 1;
    away.losses += actualHome ? 1 : 0;
    home.avgMargin = ((home.avgMargin * (home.games - 1)) + margin) / home.games;
    away.avgMargin = ((away.avgMargin * (away.games - 1)) - margin) / away.games;
    home.lastGameAt = game.startTime.toISOString();
    away.lastGameAt = game.startTime.toISOString();
    ratings.set(game.homeTeamId, home);
    ratings.set(game.awayTeamId, away);

    briers.push((expectedHome - actualHome) ** 2);
    losses.push(safeLogLoss(expectedHome, actualHome));
    if ((expectedHome >= 0.5 && actualHome === 1) || (expectedHome < 0.5 && actualHome === 0)) correct += 1;
    gamesProcessed += 1;
  }

  const sortedRatings = Array.from(ratings.values())
    .filter((rating) => rating.games > 0)
    .sort((a, b) => b.rating - a.rating)
    .map((rating) => ({ ...rating, rating: Number(rating.rating.toFixed(2)), avgMargin: Number(rating.avgMargin.toFixed(3)) }));
  const result: EloRunResult = {
    leagueKey,
    lookbackDays,
    baseRating,
    homeFieldElo,
    kFactor,
    teamsRated: sortedRatings.length,
    gamesProcessed,
    brier: average(briers) === null ? null : Number((average(briers) as number).toFixed(5)),
    logLoss: average(losses) === null ? null : Number((average(losses) as number).toFixed(5)),
    accuracy: gamesProcessed ? Number((correct / gamesProcessed).toFixed(4)) : null,
    ratings: sortedRatings,
    generatedAt: new Date().toISOString()
  };

  await prisma.trendCache.upsert({
    where: { cacheKey: `elo_ratings:${leagueKey}` },
    update: {
      scope: "elo_ratings",
      filterJson: toJson({ leagueKey, lookbackDays, baseRating, homeFieldElo, kFactor }),
      payloadJson: toJson(result),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    },
    create: {
      cacheKey: `elo_ratings:${leagueKey}`,
      scope: "elo_ratings",
      filterJson: toJson({ leagueKey, lookbackDays, baseRating, homeFieldElo, kFactor }),
      payloadJson: toJson(result),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    }
  });

  for (const rating of sortedRatings) {
    await prisma.trendCache.upsert({
      where: { cacheKey: `elo_team_rating:${leagueKey}:${rating.teamId}` },
      update: {
        scope: "elo_team_rating",
        filterJson: toJson({ leagueKey, teamId: rating.teamId }),
        payloadJson: toJson(rating),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
      },
      create: {
        cacheKey: `elo_team_rating:${leagueKey}:${rating.teamId}`,
        scope: "elo_team_rating",
        filterJson: toJson({ leagueKey, teamId: rating.teamId }),
        payloadJson: toJson(rating),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
      }
    });
  }

  return result;
}

export async function getCachedTeamElo(args: { leagueKey: string; teamId: string }) {
  const cached = await prisma.trendCache.findFirst({
    where: { cacheKey: `elo_team_rating:${args.leagueKey}:${args.teamId}`, scope: "elo_team_rating", expiresAt: { gt: new Date() } },
    orderBy: { updatedAt: "desc" }
  });
  return cached?.payloadJson as EloTeamRating | null;
}

export function eloWinProbability(args: { homeElo: number; awayElo: number; homeFieldElo?: number }) {
  return probabilityFromElo(args.homeElo + (args.homeFieldElo ?? 0) - args.awayElo);
}
