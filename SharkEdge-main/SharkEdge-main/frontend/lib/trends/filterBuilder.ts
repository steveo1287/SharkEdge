import type { Prisma } from "@prisma/client";

import { filterConditionsSchema, type FilterConditions } from "@/types/trends";

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function inRange(value: number | null | undefined, range?: { min: number; max: number } | null) {
  if (!range) return true;
  if (typeof value !== "number" || Number.isNaN(value)) return false;
  return value >= range.min && value <= range.max;
}

export type TrendFilterBuilderResult = {
  filters: FilterConditions;
  where: Prisma.EventWhereInput;
};

export function buildTrendEventWhere(rawFilters: unknown, options?: { activeOnly?: boolean }) {
  const filters = filterConditionsSchema.parse(rawFilters);
  const now = new Date();

  const where: Prisma.EventWhereInput = {
    ...(filters.sport !== "ALL" ? { sport: { code: filters.sport } } : {}),
    ...(filters.league !== "ALL" ? { league: { key: filters.league } } : {}),
    ...(options?.activeOnly
      ? { OR: [{ status: "LIVE" }, { status: "SCHEDULED", startTime: { gte: now } }] }
      : { OR: [{ status: "FINAL" }, { resultState: "OFFICIAL" }] }),
    markets: {
      some: {
        marketType: filters.marketType
      }
    },
    ...(filters.team
      ? {
          participants: {
            some: {
              competitor: {
                name: {
                  contains: filters.team,
                  mode: "insensitive"
                }
              }
            }
          }
        }
      : {}),
    ...(filters.opponentName
      ? {
          participants: {
            some: {
              competitor: {
                name: {
                  contains: filters.opponentName,
                  mode: "insensitive"
                }
              }
            }
          }
        }
      : {})
  };

  return { filters, where } satisfies TrendFilterBuilderResult;
}

export type RuntimeTrendCandidate = {
  eventId: string;
  startTime: Date;
  side: string;
  role: "HOME" | "AWAY" | "OVER" | "UNDER" | "FAVORITE" | "UNDERDOG" | "COMPETITOR_A" | "COMPETITOR_B";
  subjectName: string;
  opponentName: string | null;
  line: number | null;
  oddsAmerican: number;
  totalLine: number | null;
  moneyline: number | null;
  isFavorite: boolean | null;
  isUnderdog: boolean | null;
  isNeutralSite: boolean | null;
  isDivisionalGame: boolean | null;
  restDays: number | null;
  backToBack: boolean | null;
  winStreak: number | null;
  lossStreak: number | null;
  travelMiles: number | null;
  offensiveRating: number | null;
  defensiveRating: number | null;
  opponentRestDays: number | null;
  opponentWinStreak: number | null;
  opponentOffensiveRating: number | null;
  opponentDefensiveRating: number | null;
};

export function candidateMatchesFilters(candidate: RuntimeTrendCandidate, filters: FilterConditions) {
  const month = candidate.startTime.getUTCMonth() + 1;
  const dayOfWeek = candidate.startTime.getUTCDay();
  const hour = candidate.startTime.getUTCHours();

  if (filters.homeAway !== "EITHER" && candidate.role !== filters.homeAway) return false;
  if (filters.isFavorite === true && candidate.isFavorite !== true) return false;
  if (filters.isUnderdog === true && candidate.isUnderdog !== true) return false;
  if (filters.isNeutralSite !== null && filters.isNeutralSite !== undefined && candidate.isNeutralSite !== filters.isNeutralSite) return false;
  if (filters.isDivisionalGame !== null && filters.isDivisionalGame !== undefined && candidate.isDivisionalGame !== filters.isDivisionalGame) return false;
  if (!inRange(candidate.restDays, filters.restDays)) return false;
  if (!inRange(candidate.winStreak, filters.winStreak)) return false;
  if (!inRange(candidate.lossStreak, filters.lossStreak)) return false;
  if (!inRange(candidate.travelMiles, filters.travelMiles)) return false;
  if (filters.backToBack !== null && filters.backToBack !== undefined && candidate.backToBack !== filters.backToBack) return false;
  if (!inRange(candidate.offensiveRating, filters.offensiveRatingRange)) return false;
  if (!inRange(candidate.defensiveRating, filters.defensiveRatingRange)) return false;
  if (!inRange(candidate.line, filters.spreadRange)) return false;
  if (!inRange(candidate.totalLine, filters.totalRange)) return false;
  if (!inRange(candidate.moneyline, filters.moneylineRange)) return false;
  if (filters.month?.length && !filters.month.includes(month)) return false;
  if (filters.dayOfWeek?.length && !filters.dayOfWeek.includes(dayOfWeek)) return false;
  if (filters.gameTimeRange && (hour < filters.gameTimeRange.startHour || hour > filters.gameTimeRange.endHour)) return false;
  if (filters.team && !normalizeText(candidate.subjectName).includes(normalizeText(filters.team))) return false;
  if (filters.opponentName && !normalizeText(candidate.opponentName).includes(normalizeText(filters.opponentName))) return false;

  if (filters.subject) {
    const subject = normalizeText(filters.subject);
    const haystack = `${normalizeText(candidate.subjectName)} ${normalizeText(candidate.opponentName)}`;
    if (!haystack.includes(subject)) return false;
  }

  if (filters.opponent) {
    if (!inRange(candidate.opponentRestDays, filters.opponent.restDays)) return false;
    if (!inRange(candidate.opponentWinStreak, filters.opponent.winStreak)) return false;
    if (!inRange(candidate.opponentOffensiveRating, filters.opponent.offensiveRatingRange)) return false;
    if (!inRange(candidate.opponentDefensiveRating, filters.opponent.defensiveRatingRange)) return false;
  }

  return true;
}
