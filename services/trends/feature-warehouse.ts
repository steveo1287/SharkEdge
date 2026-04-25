import { prisma } from "@/lib/db/prisma";
import type { TrendEngineResult } from "@/lib/trends/engine";
import type { TrendFilters } from "@/lib/types/domain";

const FEATURE_CACHE_TTL_MS = 30 * 60 * 1000;

export type TrendFeatureSummary = {
  recentWinRate: number | null;
  opponentAdjustedMargin: number | null;
  averageClosingMove: number | null;
  openingToCloseVolatility: number | null;
  averageClv: number | null;
  positiveClvRate: number | null;
  averageRestDays: number | null;
  backToBackRate: number | null;
  revengeRate: number | null;
  restAdvantageDays: number | null;
  scheduleContextScore: number | null;
  travelStressScore: number | null;
  siteStabilityScore: number | null;
  consistencyScore: number | null;
  marketBreadth: number | null;
  holdQuality: number | null;
  marketTightnessScore: number | null;
  bookDisagreementScore: number | null;
  recencyScore: number | null;
  atsCoverRate: number | null;
  totalHitRate: number | null;
  favoriteHitRate: number | null;
  underdogHitRate: number | null;
  favoriteCoverRate: number | null;
  underdogCoverRate: number | null;
  upsetRate: number | null;
  spreadClv: number | null;
  totalClv: number | null;
  moneylineClv: number | null;
  sampleDepth: number;
  marketDepth: number;
};

type HistoricalFeatureRow = {
  marketType: string;
  side: string | null;
  oddsAmerican: number;
  impliedProbability: number | null;
  openingLine: number | null;
  closingLine: number | null;
  eventId: string;
  eventLabel: string;
  selectionCompetitorId: string | null;
  participantNames: string[];
  result: {
    totalPoints: number | null;
    winnerCompetitorId: string | null;
    participantResultsJson: unknown;
  } | null;
  siblingProbabilities: Array<{
    impliedProbability: number | null;
    oddsAmerican: number;
  }>;
};

type RecentFormEvent = {
  id: string;
  participants: Array<{
    competitorId: string;
    name: string;
  }>;
  winnerCompetitorId: string | null;
  margin: number | null;
};

type ParticipantContextRow = {
  competitorName: string;
  daysRest: number | null;
  restAdvantageDays: number | null;
  gamesLast7: number;
  gamesLast14: number;
  isBackToBack: boolean;
  siteStreak: number;
  isRematch: boolean;
  revengeSpot: boolean;
  recentWinRate: number | null;
  recentMargin: number | null;
  scheduleDensityScore: number | null;
  travelProxyScore: number | null;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function round(value: number | null, digits = 2) {
  return typeof value === "number" ? Number(value.toFixed(digits)) : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function variance(values: number[]) {
  const mean = average(values);
  if (mean === null || values.length < 2) {
    return null;
  }

  return average(values.map((value) => (value - mean) ** 2));
}

function getWindowStart(window: TrendFilters["window"]) {
  if (window === "all") return null;
  const days = window === "30d" ? 30 : window === "90d" ? 90 : 365;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function getSubject(filters?: Partial<TrendFilters> | null) {
  return filters?.team || filters?.subject || filters?.player || filters?.fighter || "";
}

function resolveParticipantScores(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, { role?: string; competitorId?: string; score?: number | string | null }>)
    : {};
}

function numericScore(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function americanToImplied(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function getMarketRole(row: HistoricalFeatureRow): "FAVORITE" | "UNDERDOG" | "OTHER" {
  const rawProbabilities = row.siblingProbabilities
    .map((entry) =>
      typeof entry.impliedProbability === "number"
        ? entry.impliedProbability
        : americanToImplied(entry.oddsAmerican)
    )
    .filter((value): value is number => typeof value === "number");

  const selfProbability =
    typeof row.impliedProbability === "number" ? row.impliedProbability : americanToImplied(row.oddsAmerican);

  if (!rawProbabilities.length || typeof selfProbability !== "number") {
    return "OTHER";
  }

  const max = Math.max(...rawProbabilities);
  const min = Math.min(...rawProbabilities);
  if (max === min) return "OTHER";
  if (selfProbability === max) return "FAVORITE";
  if (selfProbability === min) return "UNDERDOG";
  return "OTHER";
}

function resolveSpreadOutcome(row: HistoricalFeatureRow): "WIN" | "LOSS" | "PUSH" | null {
  if (!row.result || typeof row.closingLine !== "number" || !row.side) return null;
  const scores = Object.values(resolveParticipantScores(row.result.participantResultsJson));
  const home = scores.find((entry) => entry.role === "HOME");
  const away = scores.find((entry) => entry.role === "AWAY");
  const compA = scores.find((entry) => entry.role === "COMPETITOR_A");
  const compB = scores.find((entry) => entry.role === "COMPETITOR_B");
  const selected =
    row.side === "HOME" ? home : row.side === "AWAY" ? away : row.side === "COMPETITOR_A" ? compA : row.side === "COMPETITOR_B" ? compB : null;
  const opponent =
    row.side === "HOME" ? away : row.side === "AWAY" ? home : row.side === "COMPETITOR_A" ? compB : row.side === "COMPETITOR_B" ? compA : null;
  const selectedScore = numericScore(selected?.score);
  const opponentScore = numericScore(opponent?.score);
  if (selectedScore === null || opponentScore === null) return null;
  const delta = selectedScore + row.closingLine - opponentScore;
  return delta > 0 ? "WIN" : delta < 0 ? "LOSS" : "PUSH";
}

function resolveTotalOutcome(row: HistoricalFeatureRow): "WIN" | "LOSS" | "PUSH" | null {
  if (!row.result || typeof row.result.totalPoints !== "number" || typeof row.closingLine !== "number" || !row.side) {
    return null;
  }

  const delta = row.result.totalPoints - row.closingLine;
  if (delta === 0) return "PUSH";
  if (row.side === "OVER") return delta > 0 ? "WIN" : "LOSS";
  if (row.side === "UNDER") return delta < 0 ? "WIN" : "LOSS";
  return null;
}

function resolveMoneylineOutcome(row: HistoricalFeatureRow): "WIN" | "LOSS" | null {
  if (!row.result?.winnerCompetitorId || !row.selectionCompetitorId) return null;
  return row.result.winnerCompetitorId === row.selectionCompetitorId ? "WIN" : "LOSS";
}

function getClvFromMarket(row: HistoricalFeatureRow) {
  if (typeof row.openingLine === "number" && typeof row.closingLine === "number") {
    return Math.abs(row.closingLine - row.openingLine);
  }
  return null;
}

async function withFeatureCache<T>(scope: string, filters: TrendFilters, build: () => Promise<T>): Promise<T> {
  const cacheKey = `${scope}:${stableStringify(filters)}`;
  const now = new Date();

  try {
    const cached = await prisma.trendCache.findUnique({ where: { cacheKey } });
    if (cached && cached.expiresAt > now) {
      return cached.payloadJson as T;
    }
  } catch {}

  const value = await build();

  try {
    await prisma.trendCache.upsert({
      where: { cacheKey },
      update: {
        scope,
        filterJson: filters,
        payloadJson: value as object,
        expiresAt: new Date(Date.now() + FEATURE_CACHE_TTL_MS)
      },
      create: {
        cacheKey,
        scope,
        filterJson: filters,
        payloadJson: value as object,
        expiresAt: new Date(Date.now() + FEATURE_CACHE_TTL_MS)
      }
    });
  } catch {}

  return value;
}

async function fetchHistoricalFeatureRows(filters: TrendFilters) {
  const windowStart = getWindowStart(filters.window);
  const subject = normalizeText(getSubject(filters));
  const leagueKey = filters.league !== "ALL" ? filters.league : null;
  const sportCode = filters.sport !== "ALL" ? filters.sport : null;

  const [marketRows, recentEvents, settledBets, participantContexts] = await Promise.all([
    prisma.eventMarket.findMany({
      where: {
        event: {
          status: "FINAL",
          eventResult: { isNot: null },
          ...(leagueKey ? { league: { key: leagueKey } } : sportCode ? { league: { sport: sportCode } } : {}),
          ...(windowStart ? { startTime: { gte: windowStart } } : {})
        }
      },
      include: {
        event: {
          include: {
            participants: {
              include: {
                competitor: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            },
            eventResult: {
              select: {
                totalPoints: true,
                winnerCompetitorId: true,
                participantResultsJson: true
              }
            }
          }
        },
        sportsbook: { select: { id: true, name: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 2500
    }),
    prisma.event.findMany({
      where: {
        status: "FINAL",
        eventResult: { isNot: null },
        ...(leagueKey ? { league: { key: leagueKey } } : sportCode ? { league: { sport: sportCode } } : {}),
        ...(windowStart ? { startTime: { gte: windowStart } } : {})
      },
      include: {
        participants: {
          include: {
            competitor: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        eventResult: {
          select: {
            winnerCompetitorId: true,
            margin: true
          }
        }
      },
      orderBy: { startTime: "desc" },
      take: subject ? 160 : 80
    }),
    prisma.bet.findMany({
      where: {
        archivedAt: null,
        result: { not: "OPEN" },
        clvPercentage: { not: null },
        ...(leagueKey ? { league: leagueKey } : {}),
        ...(sportCode ? { sport: sportCode } : {})
      },
      select: {
        marketType: true,
        clvPercentage: true
      },
      take: 300
    }),
    prisma.eventParticipantContext
      .findMany({
        where: {
          event: {
            ...(leagueKey ? { league: { key: leagueKey } } : sportCode ? { league: { sport: sportCode } } : {}),
            ...(windowStart ? { startTime: { gte: windowStart } } : {})
          }
        },
        include: {
          competitor: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          updatedAt: "desc"
        },
        take: subject ? 400 : 250
      })
      .catch(() => [])
  ]);

  const siblingGroups = marketRows.reduce<Map<string, HistoricalFeatureRow["siblingProbabilities"]>>((acc, row) => {
    const key = `${row.eventId}:${row.sportsbookId}:${row.marketType}`;
    const existing = acc.get(key) ?? [];
    existing.push({
      impliedProbability: row.impliedProbability,
      oddsAmerican: row.oddsAmerican
    });
    acc.set(key, existing);
    return acc;
  }, new Map());

  const normalizedMarkets: HistoricalFeatureRow[] = marketRows
    .map((row) => ({
      marketType: row.marketType,
      side: row.side,
      oddsAmerican: row.closingOdds ?? row.oddsAmerican,
      impliedProbability: row.impliedProbability,
      openingLine: row.openingLine,
      closingLine: row.closingLine ?? row.currentLine ?? row.line,
      eventId: row.eventId,
      eventLabel: row.event.name,
      selectionCompetitorId: row.selectionCompetitorId,
      participantNames: row.event.participants.map((participant) => participant.competitor.name),
      result: row.event.eventResult,
      siblingProbabilities: siblingGroups.get(`${row.eventId}:${row.sportsbookId}:${row.marketType}`) ?? []
    }))
    .filter((row) => {
      if (!subject) return true;
      return row.participantNames.some((name) => normalizeText(name).includes(subject));
    });

  const normalizedRecentEvents: RecentFormEvent[] = recentEvents
    .map((event) => ({
      id: event.id,
      participants: event.participants.map((participant) => ({
        competitorId: participant.competitor.id,
        name: participant.competitor.name
      })),
      winnerCompetitorId: event.eventResult?.winnerCompetitorId ?? null,
      margin: event.eventResult?.margin ?? null
    }))
    .filter((event) => {
      if (!subject) return true;
      return event.participants.some((participant) => normalizeText(participant.name).includes(subject));
    });

  const normalizedParticipantContexts: ParticipantContextRow[] = participantContexts
    .map((context) => ({
      competitorName: context.competitor.name,
      daysRest: context.daysRest,
      restAdvantageDays: context.restAdvantageDays,
      gamesLast7: context.gamesLast7,
      gamesLast14: context.gamesLast14,
      isBackToBack: context.isBackToBack,
      siteStreak: context.siteStreak,
      isRematch: context.isRematch,
      revengeSpot: context.revengeSpot,
      recentWinRate: context.recentWinRate,
      recentMargin: context.recentMargin,
      scheduleDensityScore: context.scheduleDensityScore,
      travelProxyScore: context.travelProxyScore
    }))
    .filter((context) => {
      if (!subject) return true;
      return normalizeText(context.competitorName).includes(subject);
    });

  return {
    marketRows: normalizedMarkets,
    recentEvents: normalizedRecentEvents,
    settledBets,
    participantContexts: normalizedParticipantContexts
  };
}

export async function getTrendFeatureSummary(
  result: TrendEngineResult,
  rawFilters?: Partial<TrendFilters> | null
): Promise<TrendFeatureSummary> {
  const filters: TrendFilters = {
    sport: "ALL",
    league: "ALL",
    market: "ALL",
    sportsbook: "all",
    side: "ALL",
    subject: "",
    team: "",
    player: "",
    fighter: "",
    opponent: "",
    window: "90d",
    sample: 10,
    ...(rawFilters ?? {})
  };

  return withFeatureCache(`trend-feature-summary:${result.id}`, filters, async () => {
    const { marketRows, recentEvents, settledBets, participantContexts } = await fetchHistoricalFeatureRows(filters);
    const subject = normalizeText(getSubject(filters));

    const subjectOutcomes = subject
      ? recentEvents
          .map((event) => {
            const participant = event.participants.find((entry) => normalizeText(entry.name).includes(subject));
            if (!participant || !event.winnerCompetitorId) return null;
            return event.winnerCompetitorId === participant.competitorId ? 1 : 0;
          })
          .filter((value): value is 0 | 1 => value !== null)
          .map((value) => Number(value))
      : [];

    const recentWinRate = subjectOutcomes.length ? round((average(subjectOutcomes) ?? 0) * 100, 1) : null;

    const opponentAdjustedMargins = subject
      ? recentEvents
          .map((event) => {
            const participant = event.participants.find((entry) => normalizeText(entry.name).includes(subject));
            if (!participant || typeof event.margin !== "number") return null;
            const won = event.winnerCompetitorId === participant.competitorId;
            return won ? event.margin : -event.margin;
          })
          .filter((value): value is number => typeof value === "number")
      : [];

    const consistencyScore = subjectOutcomes.length >= 8
      ? round(
          clamp(
            100 -
              subjectOutcomes.reduce((swings, outcome, index, all) => {
                if (index === 0) return swings;
                return swings + (all[index - 1] === outcome ? 0 : 1);
              }, 0) *
                8,
            0,
            100
          ),
          1
        )
      : null;

    const recencyScore = subjectOutcomes.length
      ? round(
          subjectOutcomes.reduce((total, outcome, index) => total + outcome * Math.max(1, 10 - index), 0) /
            subjectOutcomes.reduce((total, _, index) => total + Math.max(1, 10 - index), 0) *
            100,
          1
        )
      : null;

    const averageRestDays = round(
      average(
        participantContexts
          .map((context) => context.daysRest)
          .filter((value): value is number => typeof value === "number")
      )
    );
    const restAdvantageDays = round(
      average(
        participantContexts
          .map((context) => context.restAdvantageDays)
          .filter((value): value is number => typeof value === "number")
      )
    );
    const backToBackRate = participantContexts.length
      ? round(
          (average(participantContexts.map((context) => (context.isBackToBack ? 1 : 0))) ?? 0) * 100,
          1
        )
      : null;
    const revengeRate = participantContexts.length
      ? round(
          (average(participantContexts.map((context) => (context.revengeSpot ? 1 : 0))) ?? 0) * 100,
          1
        )
      : null;
    const scheduleContextScore = round(
      average(
        participantContexts
          .map((context) => context.scheduleDensityScore)
          .filter((value): value is number => typeof value === "number")
      )
    );
    const travelStressScore = round(
      average(
        participantContexts
          .map((context) => context.travelProxyScore)
          .filter((value): value is number => typeof value === "number")
      )
    );
    const siteStabilityScore = round(
      average(participantContexts.map((context) => context.siteStreak))
    );

    const spreadRows = marketRows.filter((row) => row.marketType === "spread");
    const totalRows = marketRows.filter((row) => row.marketType === "total" || row.marketType === "round_total");
    const moneylineRows = marketRows.filter((row) => row.marketType === "moneyline" || row.marketType === "fight_winner");
    const favoriteRows = moneylineRows.filter((row) => getMarketRole(row) === "FAVORITE");
    const underdogRows = moneylineRows.filter((row) => getMarketRole(row) === "UNDERDOG");

    const gradedSpreadRows = spreadRows
      .map((row) => resolveSpreadOutcome(row))
      .filter((value): value is "WIN" | "LOSS" | "PUSH" => value !== null);
    const atsCoverRate = gradedSpreadRows.length
      ? round(
          (average(gradedSpreadRows.map((value) => (value === "WIN" ? 1 : 0))) ?? 0) * 100,
          1
        )
      : null;

    const gradedTotalRows = totalRows
      .map((row) => resolveTotalOutcome(row))
      .filter((value): value is "WIN" | "LOSS" | "PUSH" => value !== null);
    const totalHitRate = gradedTotalRows.length
      ? round(
          (average(gradedTotalRows.map((value) => (value === "WIN" ? 1 : 0))) ?? 0) * 100,
          1
        )
      : null;

    const gradedFavoriteRows = favoriteRows
      .map((row) => resolveMoneylineOutcome(row))
      .filter((value): value is "WIN" | "LOSS" => value !== null);
    const favoriteHitRate = gradedFavoriteRows.length
      ? round(
          (average(gradedFavoriteRows.map((value) => (value === "WIN" ? 1 : 0))) ?? 0) * 100,
          1
        )
      : null;

    const gradedUnderdogRows = underdogRows
      .map((row) => resolveMoneylineOutcome(row))
      .filter((value): value is "WIN" | "LOSS" => value !== null);
    const underdogHitRate = gradedUnderdogRows.length
      ? round(
          (average(gradedUnderdogRows.map((value) => (value === "WIN" ? 1 : 0))) ?? 0) * 100,
          1
        )
      : null;

    const groupedByEventAndMarket = marketRows.reduce<Map<string, HistoricalFeatureRow[]>>((acc, row) => {
      const key = `${row.eventId}:${row.marketType}`;
      const existing = acc.get(key) ?? [];
      existing.push(row);
      acc.set(key, existing);
      return acc;
    }, new Map());

    const marketBreadth = round(
      average(Array.from(groupedByEventAndMarket.values()).map((rows) => rows.length)),
      1
    );

    const groupLineRanges = Array.from(groupedByEventAndMarket.values())
      .map((rows) => {
        const lines = rows
          .map((row) => row.closingLine)
          .filter((value): value is number => typeof value === "number");
        if (lines.length < 2) {
          return null;
        }
        return Math.max(...lines) - Math.min(...lines);
      })
      .filter((value): value is number => typeof value === "number");

    const groupProbabilityRanges = Array.from(groupedByEventAndMarket.values())
      .map((rows) => {
        const probabilities = rows
          .map((row) =>
            typeof row.impliedProbability === "number"
              ? row.impliedProbability
              : americanToImplied(row.oddsAmerican)
          )
          .filter((value): value is number => typeof value === "number");
        if (probabilities.length < 2) {
          return null;
        }
        return Math.max(...probabilities) - Math.min(...probabilities);
      })
      .filter((value): value is number => typeof value === "number");

    const groupProbabilityVariance = Array.from(groupedByEventAndMarket.values())
      .map((rows) => {
        const probabilities = rows
          .map((row) =>
            typeof row.impliedProbability === "number"
              ? row.impliedProbability
              : americanToImplied(row.oddsAmerican)
          )
          .filter((value): value is number => typeof value === "number");
        return variance(probabilities);
      })
      .filter((value): value is number => typeof value === "number");

    const holdValues = marketRows
      .map((row) => row.siblingProbabilities)
      .filter((entries) => entries.length >= 2)
      .map((entries) =>
        entries.reduce((total, entry) => {
          const probability =
            typeof entry.impliedProbability === "number"
              ? entry.impliedProbability
              : americanToImplied(entry.oddsAmerican) ?? 0;
          return total + probability;
        }, 0) - 1
      );

    const holdQuality = holdValues.length
      ? round(clamp((0.09 - (average(holdValues) ?? 0)) * 1000, 0, 100), 1)
      : null;

    const marketTightnessScore =
      groupLineRanges.length || groupProbabilityRanges.length
        ? round(
            clamp(
              100 -
                ((average(groupLineRanges) ?? 0) * 18 +
                  (average(groupProbabilityRanges) ?? 0) * 550 +
                  (average(holdValues) ?? 0) * 220),
              0,
              100
            ),
            1
          )
        : null;

    const bookDisagreementScore =
      groupLineRanges.length || groupProbabilityVariance.length
        ? round(
            clamp(
              (average(groupLineRanges) ?? 0) * 24 +
                Math.sqrt(Math.max(average(groupProbabilityVariance) ?? 0, 0)) * 280,
              0,
              100
            ),
            1
          )
        : null;

    const spreadClv = round(
      average(
        settledBets
          .filter((bet) => bet.marketType === "spread")
          .map((bet) => bet.clvPercentage)
          .filter((value): value is number => typeof value === "number")
      )
    );
    const totalClv = round(
      average(
        settledBets
          .filter((bet) => bet.marketType === "total" || bet.marketType === "round_total")
          .map((bet) => bet.clvPercentage)
          .filter((value): value is number => typeof value === "number")
      )
    );
    const moneylineClv = round(
      average(
        settledBets
          .filter((bet) => bet.marketType === "moneyline" || bet.marketType === "fight_winner")
          .map((bet) => bet.clvPercentage)
          .filter((value): value is number => typeof value === "number")
      )
    );

    const trackedClvValues = settledBets
      .map((bet) => bet.clvPercentage)
      .filter((value): value is number => typeof value === "number");
    const positiveClvRate = trackedClvValues.length
      ? round(
          (average(trackedClvValues.map((value) => (value > 0 ? 1 : 0))) ?? 0) * 100,
          1
        )
      : null;

    const favoriteSpreadRows = spreadRows.filter((row) => getMarketRole(row) === "FAVORITE");
    const underdogSpreadRows = spreadRows.filter((row) => getMarketRole(row) === "UNDERDOG");
    const favoriteCoverRate = favoriteSpreadRows.length
      ? round(
          (average(
            favoriteSpreadRows.map((row) => {
              const outcome = resolveSpreadOutcome(row);
              return outcome === "WIN" ? 1 : 0;
            })
          ) ?? 0) * 100,
          1
        )
      : null;
    const underdogCoverRate = underdogSpreadRows.length
      ? round(
          (average(
            underdogSpreadRows.map((row) => {
              const outcome = resolveSpreadOutcome(row);
              return outcome === "WIN" ? 1 : 0;
            })
          ) ?? 0) * 100,
          1
        )
      : null;

    const upsetRate = underdogRows.length
      ? round(
          (average(
            underdogRows.map((row) => {
              const outcome = resolveMoneylineOutcome(row);
              return outcome === "WIN" ? 1 : 0;
            })
          ) ?? 0) * 100,
          1
        )
      : null;

    return {
      recentWinRate,
      opponentAdjustedMargin: round(average(opponentAdjustedMargins)),
      averageClosingMove: round(
        average(
          marketRows
            .map((row) => getClvFromMarket(row))
            .filter((value): value is number => typeof value === "number")
        )
      ),
      openingToCloseVolatility: round(
        average(
          marketRows
            .map((row) =>
              typeof row.openingLine === "number" && typeof row.closingLine === "number"
                ? Math.abs(row.closingLine - row.openingLine)
                : null
            )
            .filter((value): value is number => typeof value === "number")
        )
      ),
      averageClv: round(
        average(
          settledBets
            .map((bet) => bet.clvPercentage)
            .filter((value): value is number => typeof value === "number")
        )
      ),
      positiveClvRate,
      averageRestDays,
      backToBackRate,
      revengeRate,
      restAdvantageDays,
      scheduleContextScore,
      travelStressScore,
      siteStabilityScore,
      consistencyScore,
      marketBreadth,
      holdQuality,
      marketTightnessScore,
      bookDisagreementScore,
      recencyScore,
      atsCoverRate,
      totalHitRate,
      favoriteHitRate,
      underdogHitRate,
      favoriteCoverRate,
      underdogCoverRate,
      upsetRate,
      spreadClv,
      totalClv,
      moneylineClv,
      sampleDepth: recentEvents.length,
      marketDepth: marketRows.length
    } satisfies TrendFeatureSummary;
  });
}

export async function refreshTrendFeatureWarehouse(args?: {
  leagues?: string[];
  days?: number;
}) {
  const leagues = args?.leagues?.length ? args.leagues : ["NBA", "MLB", "NHL", "NFL", "NCAAF"];
  const window: TrendFilters["window"] =
    typeof args?.days === "number" && args.days <= 30 ? "30d" : typeof args?.days === "number" && args.days <= 90 ? "90d" : "365d";

  const filtersToWarm: TrendFilters[] = [
    {
      sport: "ALL",
      league: "ALL",
      market: "ALL",
      sportsbook: "all",
      side: "ALL",
      subject: "",
      team: "",
      player: "",
      fighter: "",
      opponent: "",
      window,
      sample: 10
    },
    ...leagues.map((league) => ({
      sport: "ALL" as const,
      league: league as TrendFilters["league"],
      market: "ALL" as const,
      sportsbook: "all",
      side: "ALL" as const,
      subject: "",
      team: "",
      player: "",
      fighter: "",
      opponent: "",
      window,
      sample: 10
    }))
  ];

  let warmed = 0;
  for (const filters of filtersToWarm) {
    const baseTrendResult = {
      hitRate: null,
      roi: null,
      profitUnits: null,
      sampleSize: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      streak: null,
      confidence: "insufficient" as const,
      adjustedConfidenceScore: null,
      contextAdjustmentDelta: null,
      contextSignals: [] as string[],
      warning: null,
      dateRange: "",
      contextLabel: "",
      todayMatches: [] as any[],
      contextSummary: {
        steamMovePct: 0,
        clvBeatPct: 0,
        backToBackPct: 0,
        avgWeatherImpact: 0,
        avgCompositeEdgeScore: 0,
        topSignals: [] as string[],
        weatherNote: null,
        scheduleNote: null,
        marketNote: null
      }
    };
    await Promise.all([
      getTrendFeatureSummary({ id: "ats", title: "", ...baseTrendResult }, filters),
      getTrendFeatureSummary({ id: "ou", title: "", ...baseTrendResult }, filters),
      getTrendFeatureSummary({ id: "favorite-roi", title: "", ...baseTrendResult }, filters),
      getTrendFeatureSummary({ id: "underdog-roi", title: "", ...baseTrendResult }, filters)
    ]);
    warmed += 1;
  }

  return {
    warmed,
    leagues,
    window
  };
}
