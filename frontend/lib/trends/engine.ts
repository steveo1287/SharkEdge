import { prisma } from "@/lib/db/prisma";
import { americanToImplied, stripVig } from "@/lib/odds";
import type { LeagueKey, SportCode, TrendFilters } from "@/lib/types/domain";
import { buildMatchupHref } from "@/lib/utils/matchups";

const CACHE_TTL_MS = 60 * 60 * 1000;

const DEFAULT_FILTERS: TrendFilters = {
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
  sample: 5
};

type EngineFilter = Partial<TrendFilters>;
type TrendConfidence = "strong" | "moderate" | "weak" | "insufficient";

export type TodayTrendMatch = {
  id: string;
  matchup: string;
  league: LeagueKey;
  sport: SportCode;
  startTime: string;
  tag: "Matches this trend";
  href: string;
};

export type TrendEngineResult = {
  id: string;
  title: string;
  hitRate: number | null;
  roi: number | null;
  sampleSize: number;
  wins: number;
  losses: number;
  pushes: number;
  confidence: TrendConfidence;
  warning: string | null;
  dateRange: string;
  contextLabel: string;
  todayMatches: TodayTrendMatch[];
  extra?: Record<string, unknown>;
};

type CachedValue<T> = {
  cached: boolean;
  value: T;
};

type HistoricalMarketRow = {
  leagueKey: LeagueKey;
  sport: SportCode;
  eventId: string;
  eventExternalId: string | null;
  eventLabel: string;
  marketType: string;
  marketLabel: string;
  selection: string;
  side: string | null;
  sportsbookName: string;
  selectionCompetitorId: string | null;
  participantNames: string[];
  openingLine: number | null;
  closingLine: number | null;
  openingOdds: number | null;
  closingOdds: number | null;
  line: number | null;
  oddsAmerican: number;
  impliedProbability: number | null;
  siblingProbabilities: Array<{
    impliedProbability: number | null;
    oddsAmerican: number;
  }>;
  result: {
    coverResult: unknown;
    ouResult: string | null;
    totalPoints: number | null;
    winnerCompetitorId: string | null;
    participantResultsJson: unknown;
  } | null;
};

type RecentFormRow = {
  leagueKey: LeagueKey;
  sport: SportCode;
  eventExternalId: string | null;
  eventLabel: string;
  participantNames: string[];
  participants: Array<{
    competitorId: string;
    name: string;
    role: string;
  }>;
  winnerCompetitorId: string | null;
};

function normalizeFilters(raw?: EngineFilter | null): TrendFilters {
  return {
    ...DEFAULT_FILTERS,
    ...(raw ?? {})
  };
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

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function getWindowStart(window: TrendFilters["window"]) {
  if (window === "all") return null;
  const days = window === "30d" ? 30 : window === "90d" ? 90 : 365;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function formatDateRange(filters: TrendFilters) {
  if (filters.window === "all") return "Full stored range";
  return filters.window === "365d" ? "Last 365 days" : `Last ${filters.window.slice(0, -1)} days`;
}

function getConfidence(sampleSize: number): TrendConfidence {
  if (sampleSize > 100) return "strong";
  if (sampleSize >= 30) return "moderate";
  if (sampleSize >= 10) return "weak";
  return "insufficient";
}

function getWarning(sampleSize: number) {
  return sampleSize < 10 ? `Only ${sampleSize} real rows match this trend right now.` : null;
}

function getActiveSubject(filters: TrendFilters) {
  return filters.team || filters.player || filters.fighter || filters.subject;
}

function buildContextLabel(filters: TrendFilters, title: string) {
  return [
    title,
    filters.league !== "ALL" ? filters.league : filters.sport !== "ALL" ? filters.sport : null,
    filters.market !== "ALL" ? filters.market : null,
    getActiveSubject(filters) ? `subject: ${getActiveSubject(filters)}` : null,
    filters.opponent ? `opponent: ${filters.opponent}` : null
  ]
    .filter(Boolean)
    .join(" | ");
}

function getProfitFromAmericanOdds(odds: number) {
  return odds > 0 ? odds / 100 : 100 / Math.abs(odds);
}

function computeStats(outcomes: Array<"WIN" | "LOSS" | "PUSH">, odds: number[] = []) {
  const wins = outcomes.filter((entry) => entry === "WIN").length;
  const losses = outcomes.filter((entry) => entry === "LOSS").length;
  const pushes = outcomes.filter((entry) => entry === "PUSH").length;
  const sampleSize = outcomes.length;
  const hitRate = sampleSize ? Number(((wins / sampleSize) * 100).toFixed(1)) : null;
  const roi =
    sampleSize && odds.length === sampleSize
      ? Number(
          (
            outcomes.reduce((total, outcome, index) => {
              if (outcome === "WIN") return total + getProfitFromAmericanOdds(odds[index] ?? -110);
              if (outcome === "LOSS") return total - 1;
              return total;
            }, 0) /
            sampleSize *
            100
          ).toFixed(1)
        )
      : null;

  return { sampleSize, wins, losses, pushes, hitRate, roi };
}

async function withTrendCache<T>(scope: string, filters: TrendFilters, build: () => Promise<T>): Promise<CachedValue<T>> {
  const cacheKey = `${scope}:${stableStringify(filters)}`;
  const now = new Date();

  try {
    const cached = await prisma.trendCache.findUnique({ where: { cacheKey } });
    if (cached && cached.expiresAt > now) {
      return { cached: true, value: cached.payloadJson as T };
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
        expiresAt: new Date(Date.now() + CACHE_TTL_MS)
      },
      create: {
        cacheKey,
        scope,
        filterJson: filters,
        payloadJson: value as object,
        expiresAt: new Date(Date.now() + CACHE_TTL_MS)
      }
    });
  } catch {}

  return { cached: false, value };
}

function matchesFilters(
  filters: TrendFilters,
  participantNames: string[],
  selection?: string,
  marketLabel?: string,
  sportsbookName?: string
) {
  const haystack = [
    ...participantNames.map(normalizeText),
    normalizeText(selection),
    normalizeText(marketLabel)
  ];
  const subject = normalizeText(getActiveSubject(filters));

  if (subject && !haystack.some((value) => value.includes(subject))) return false;
  if (filters.opponent && !haystack.some((value) => value.includes(normalizeText(filters.opponent)))) return false;
  if (filters.sportsbook !== "all" && sportsbookName && normalizeText(sportsbookName) !== normalizeText(filters.sportsbook)) return false;

  return true;
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

function resolveSpreadOutcome(row: HistoricalMarketRow): "WIN" | "LOSS" | "PUSH" | null {
  if (row.result?.coverResult && typeof row.result.coverResult === "object" && row.side) {
    const explicit = (row.result.coverResult as Record<string, unknown>)[row.side];
    if (explicit === "WIN" || explicit === "LOSS" || explicit === "PUSH") return explicit;
  }

  if (!row.result || typeof row.line !== "number" || !row.side) return null;

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

  const delta = selectedScore + row.line - opponentScore;
  return delta > 0 ? "WIN" : delta < 0 ? "LOSS" : "PUSH";
}

function resolveOuOutcome(row: HistoricalMarketRow): "WIN" | "LOSS" | "PUSH" | null {
  if (!row.result || !row.side) return null;

  if (row.result.ouResult === "OVER" || row.result.ouResult === "UNDER" || row.result.ouResult === "PUSH") {
    if (row.result.ouResult === "PUSH") return "PUSH";
    return row.result.ouResult === row.side ? "WIN" : "LOSS";
  }

  if (typeof row.result.totalPoints !== "number" || typeof row.line !== "number") return null;

  const delta = row.result.totalPoints - row.line;
  if (delta === 0) return "PUSH";
  if (row.side === "OVER") return delta > 0 ? "WIN" : "LOSS";
  if (row.side === "UNDER") return delta < 0 ? "WIN" : "LOSS";
  return null;
}

function resolveMoneylineOutcome(row: HistoricalMarketRow): "WIN" | "LOSS" | null {
  if (!row.result?.winnerCompetitorId) return null;
  if (row.selectionCompetitorId) {
    return row.result.winnerCompetitorId === row.selectionCompetitorId ? "WIN" : "LOSS";
  }

  const participantScores = resolveParticipantScores(row.result.participantResultsJson);
  const homeCompetitorId = Object.values(participantScores).find((entry) => entry.role === "HOME")?.competitorId ?? null;
  const awayCompetitorId = Object.values(participantScores).find((entry) => entry.role === "AWAY")?.competitorId ?? null;

  if (row.side === "HOME" && homeCompetitorId) {
    return row.result.winnerCompetitorId === homeCompetitorId ? "WIN" : "LOSS";
  }

  if (row.side === "AWAY" && awayCompetitorId) {
    return row.result.winnerCompetitorId === awayCompetitorId ? "WIN" : "LOSS";
  }

  return null;
}

function getMarketRole(row: HistoricalMarketRow): "FAVORITE" | "UNDERDOG" | "OTHER" {
  if (!row.siblingProbabilities.length) return "OTHER";

  const rawProbabilities = row.siblingProbabilities.map((entry) =>
    typeof entry.impliedProbability === "number"
      ? entry.impliedProbability
      : americanToImplied(entry.oddsAmerican) ?? 0
  );
  const stripped = stripVig(rawProbabilities);
  const selfProbability =
    typeof row.impliedProbability === "number"
      ? row.impliedProbability
      : americanToImplied(row.oddsAmerican) ?? 0;
  const selfIndex = rawProbabilities.findIndex((probability) => probability === selfProbability);
  const normalizedProbabilities =
    stripped.length === rawProbabilities.length
      ? stripped
      : rawProbabilities;
  const normalizedSelf =
    selfIndex >= 0 ? normalizedProbabilities[selfIndex] ?? selfProbability : selfProbability;
  const max = Math.max(...normalizedProbabilities);
  const min = Math.min(...normalizedProbabilities);

  if (max === min) return "OTHER";
  if (normalizedSelf === max) return "FAVORITE";
  if (normalizedSelf === min) return "UNDERDOG";
  return "OTHER";
}

async function fetchHistoricalMarkets(filters: TrendFilters): Promise<HistoricalMarketRow[]> {
  const windowStart = getWindowStart(filters.window);
  const rows = await prisma.eventMarket.findMany({
    where: {
      ...(filters.market !== "ALL" ? { marketType: filters.market } : {}),
      ...(filters.sportsbook !== "all"
        ? { sportsbook: { name: { equals: filters.sportsbook, mode: "insensitive" } } }
        : {}),
      event: {
        status: "FINAL",
        eventResult: { isNot: null },
        ...(filters.league !== "ALL"
          ? { league: { key: filters.league } }
          : filters.sport !== "ALL"
            ? { league: { sport: filters.sport } }
            : {}),
        ...(windowStart ? { startTime: { gte: windowStart } } : {})
      }
    },
    include: {
      sportsbook: { select: { name: true } },
      selectionCompetitor: { select: { id: true } },
      snapshots: {
        orderBy: { capturedAt: "asc" },
        select: { line: true, oddsAmerican: true }
      },
      event: {
        include: {
          league: { select: { key: true, sport: true } },
          participants: {
            orderBy: { sortOrder: "asc" },
            include: { competitor: { select: { name: true } } }
          },
          eventResult: {
            select: {
              coverResult: true,
              ouResult: true,
              totalPoints: true,
              winnerCompetitorId: true,
              participantResultsJson: true
            }
          },
          markets: {
            where: {
              marketType: {
                in: ["moneyline", "fight_winner", "spread", "total", "round_total"]
              }
            },
            select: {
              impliedProbability: true,
              oddsAmerican: true,
              sportsbookId: true,
              marketType: true,
              eventId: true
            }
          }
        }
      }
    },
    orderBy: { event: { startTime: "desc" } },
    take: 2000
  });

  return rows
    .map((row) => {
      const openingSnapshot = row.snapshots[0] ?? null;
      const closingSnapshot = row.snapshots[row.snapshots.length - 1] ?? null;
      const siblingProbabilities = row.event.markets
        .filter(
          (market) =>
            market.eventId === row.eventId &&
            market.sportsbookId === row.sportsbookId &&
            market.marketType === row.marketType
        )
        .map((market) => ({
          impliedProbability: market.impliedProbability,
          oddsAmerican: market.oddsAmerican
        }));

      return {
        leagueKey: row.event.league.key as LeagueKey,
        sport: row.event.league.sport,
        eventId: row.eventId,
        eventExternalId: row.event.externalEventId,
        eventLabel: row.event.name,
        marketType: row.marketType,
        marketLabel: row.marketLabel,
        selection: row.selection,
        side: row.side,
        sportsbookName: row.sportsbook?.name ?? "Unknown book",
        selectionCompetitorId: row.selectionCompetitor?.id ?? row.selectionCompetitorId ?? null,
        participantNames: row.event.participants.map((participant) => participant.competitor.name),
        openingLine: row.openingLine ?? openingSnapshot?.line ?? row.line ?? null,
        closingLine: row.closingLine ?? closingSnapshot?.line ?? row.line ?? null,
        openingOdds: row.openingOdds ?? openingSnapshot?.oddsAmerican ?? row.oddsAmerican,
        closingOdds: row.closingOdds ?? closingSnapshot?.oddsAmerican ?? row.oddsAmerican,
        line: row.line,
        oddsAmerican: row.oddsAmerican,
        impliedProbability: row.impliedProbability,
        siblingProbabilities,
        result: row.event.eventResult
      } satisfies HistoricalMarketRow;
    })
    .filter((row) =>
      matchesFilters(filters, row.participantNames, row.selection, row.marketLabel, row.sportsbookName)
    );
}

async function fetchRecentFormRows(filters: TrendFilters): Promise<RecentFormRow[]> {
  const windowStart = getWindowStart(filters.window);
  const rows = await prisma.event.findMany({
    where: {
      status: "FINAL",
      eventResult: { isNot: null },
      ...(filters.league !== "ALL"
        ? { league: { key: filters.league } }
        : filters.sport !== "ALL"
          ? { league: { sport: filters.sport } }
          : {}),
      ...(windowStart ? { startTime: { gte: windowStart } } : {})
    },
    include: {
      league: { select: { key: true, sport: true } },
      participants: {
        orderBy: { sortOrder: "asc" },
        include: { competitor: { select: { id: true, name: true } } }
      },
      eventResult: { select: { winnerCompetitorId: true } }
    },
    orderBy: { startTime: "desc" },
    take: 500
  });

  return rows
    .map((row) => ({
      leagueKey: row.league.key as LeagueKey,
      sport: row.league.sport,
      eventExternalId: row.externalEventId,
      eventLabel: row.name,
      participantNames: row.participants.map((participant) => participant.competitor.name),
      participants: row.participants.map((participant) => ({
        competitorId: participant.competitor.id,
        name: participant.competitor.name,
        role: participant.role
      })),
      winnerCompetitorId: row.eventResult?.winnerCompetitorId ?? null
    }))
    .filter((row) => matchesFilters(filters, row.participantNames));
}

async function getTodayMatchingGames(filters: TrendFilters): Promise<TodayTrendMatch[]> {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const events = await prisma.event.findMany({
    where: {
      ...(filters.league !== "ALL"
        ? { league: { key: filters.league } }
        : filters.sport !== "ALL"
          ? { league: { sport: filters.sport } }
          : {}),
      OR: [{ startTime: { gte: now, lte: end } }, { status: "LIVE" }]
    },
    include: {
      league: { select: { key: true, sport: true } },
      participants: {
        orderBy: { sortOrder: "asc" },
        include: { competitor: { select: { name: true } } }
      }
    },
    orderBy: [{ status: "asc" }, { startTime: "asc" }],
    take: 50
  });

  return events
    .filter((event) =>
      matchesFilters(
        filters,
        event.participants.map((participant) => participant.competitor.name)
      )
    )
    .map((event) => ({
      id: event.id,
      matchup: event.participants.map((participant) => participant.competitor.name).join(" vs "),
      league: event.league.key as LeagueKey,
      sport: event.league.sport,
      startTime: event.startTime.toISOString(),
      tag: "Matches this trend" as const,
      href: buildMatchupHref(event.league.key as LeagueKey, event.externalEventId ?? event.id)
    }));
}

async function buildTrendResult(
  scope: string,
  filters: TrendFilters,
  title: string,
  builder: () => Promise<Omit<TrendEngineResult, "id" | "title" | "confidence" | "warning" | "dateRange" | "contextLabel" | "todayMatches">>
): Promise<CachedValue<TrendEngineResult>> {
  return withTrendCache(scope, filters, async () => {
    const base = await builder();
    return {
      id: scope,
      title,
      ...base,
      confidence: getConfidence(base.sampleSize),
      warning: getWarning(base.sampleSize),
      dateRange: formatDateRange(filters),
      contextLabel: buildContextLabel(filters, title),
      todayMatches: await getTodayMatchingGames(filters)
    };
  });
}

function emptyTrend(id: string, title: string, filters: TrendFilters, warning: string): CachedValue<TrendEngineResult> {
  return {
    cached: false,
    value: {
      id,
      title,
      hitRate: null,
      roi: null,
      sampleSize: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      confidence: "insufficient",
      warning,
      dateRange: formatDateRange(filters),
      contextLabel: buildContextLabel(filters, title),
      todayMatches: []
    }
  };
}

export async function getATSTrend(rawFilters?: EngineFilter | null): Promise<CachedValue<TrendEngineResult>> {
  const filters = normalizeFilters({ ...rawFilters, market: "spread" });
  try {
    return await buildTrendResult("ats", filters, "ATS trend", async () => {
      const graded = (await fetchHistoricalMarkets(filters))
        .map((row) => ({ row, outcome: resolveSpreadOutcome(row) }))
        .filter((entry): entry is { row: HistoricalMarketRow; outcome: "WIN" | "LOSS" | "PUSH" } => Boolean(entry.outcome));
      const stats = computeStats(
        graded.map((entry) => entry.outcome),
        graded.map((entry) => entry.row.closingOdds ?? entry.row.oddsAmerican)
      );
      return stats;
    });
  } catch {
    return emptyTrend("ats", "ATS trend", filters, "ATS trend is unavailable because stored spread history could not be read.");
  }
}

export async function getOUTrend(rawFilters?: EngineFilter | null): Promise<CachedValue<TrendEngineResult>> {
  const filters = normalizeFilters({
    ...rawFilters,
    market: rawFilters?.market && rawFilters.market !== "ALL" ? rawFilters.market : "total"
  });
  try {
    return await buildTrendResult("ou", filters, "O/U trend", async () => {
      const graded = (await fetchHistoricalMarkets(filters))
        .filter((row) => row.marketType === "total" || row.marketType === "round_total")
        .map((row) => ({ row, outcome: resolveOuOutcome(row) }))
        .filter((entry): entry is { row: HistoricalMarketRow; outcome: "WIN" | "LOSS" | "PUSH" } => Boolean(entry.outcome));
      const stats = computeStats(
        graded.map((entry) => entry.outcome),
        graded.map((entry) => entry.row.closingOdds ?? entry.row.oddsAmerican)
      );
      return stats;
    });
  } catch {
    return emptyTrend("ou", "O/U trend", filters, "O/U trend is unavailable because stored totals history could not be read.");
  }
}

export async function getFavoriteROI(rawFilters?: EngineFilter | null): Promise<CachedValue<TrendEngineResult>> {
  const filters = normalizeFilters({
    ...rawFilters,
    market: rawFilters?.market && rawFilters.market !== "ALL" ? rawFilters.market : "moneyline"
  });
  try {
    return await buildTrendResult("favorite-roi", filters, "Favorite ROI", async () => {
      const graded = (await fetchHistoricalMarkets(filters))
        .filter((row) => (row.marketType === "moneyline" || row.marketType === "fight_winner") && getMarketRole(row) === "FAVORITE")
        .map((row) => ({ row, outcome: resolveMoneylineOutcome(row) }))
        .filter((entry): entry is { row: HistoricalMarketRow; outcome: "WIN" | "LOSS" } => Boolean(entry.outcome));
      const stats = computeStats(
        graded.map((entry) => entry.outcome),
        graded.map((entry) => entry.row.closingOdds ?? entry.row.oddsAmerican)
      );
      return stats;
    });
  } catch {
    return emptyTrend("favorite-roi", "Favorite ROI", filters, "Favorite ROI is unavailable because matched moneyline rows could not be read.");
  }
}

export async function getUnderdogROI(rawFilters?: EngineFilter | null): Promise<CachedValue<TrendEngineResult>> {
  const filters = normalizeFilters({
    ...rawFilters,
    market: rawFilters?.market && rawFilters.market !== "ALL" ? rawFilters.market : "moneyline"
  });
  try {
    return await buildTrendResult("underdog-roi", filters, "Underdog ROI", async () => {
      const graded = (await fetchHistoricalMarkets(filters))
        .filter((row) => (row.marketType === "moneyline" || row.marketType === "fight_winner") && getMarketRole(row) === "UNDERDOG")
        .map((row) => ({ row, outcome: resolveMoneylineOutcome(row) }))
        .filter((entry): entry is { row: HistoricalMarketRow; outcome: "WIN" | "LOSS" } => Boolean(entry.outcome));
      const stats = computeStats(
        graded.map((entry) => entry.outcome),
        graded.map((entry) => entry.row.closingOdds ?? entry.row.oddsAmerican)
      );
      return stats;
    });
  } catch {
    return emptyTrend("underdog-roi", "Underdog ROI", filters, "Underdog ROI is unavailable because matched moneyline rows could not be read.");
  }
}

export async function getCLVTrend(rawFilters?: EngineFilter | null): Promise<CachedValue<TrendEngineResult>> {
  const filters = normalizeFilters(rawFilters);
  try {
    return await buildTrendResult("clv", filters, "CLV trend", async () => {
      const windowStart = getWindowStart(filters.window);
      const rows = await prisma.bet.findMany({
        where: {
          archivedAt: null,
          result: { not: "OPEN" },
          clvPercentage: { not: null },
          ...(filters.league !== "ALL"
            ? { league: filters.league }
            : filters.sport !== "ALL"
              ? { sport: filters.sport }
              : {}),
          ...(filters.market !== "ALL" ? { marketType: filters.market } : {}),
          ...(windowStart ? { placedAt: { gte: windowStart } } : {})
        },
        take: 500
      });
      const averageClv = rows.length
        ? Number((rows.reduce((total, row) => total + (row.clvPercentage ?? 0), 0) / rows.length).toFixed(2))
        : null;
      return {
        hitRate: averageClv,
        roi: null,
        sampleSize: rows.length,
        wins: rows.filter((row) => (row.clvPercentage ?? 0) > 0).length,
        losses: rows.filter((row) => (row.clvPercentage ?? 0) < 0).length,
        pushes: rows.filter((row) => (row.clvPercentage ?? 0) === 0).length,
        extra: { averageClv }
      };
    });
  } catch {
    return emptyTrend("clv", "CLV trend", filters, "CLV trend is unavailable because settled bets with closing context could not be read.");
  }
}

export async function getLineMovement(rawFilters?: EngineFilter | null): Promise<CachedValue<TrendEngineResult>> {
  const filters = normalizeFilters(rawFilters);
  try {
    return await buildTrendResult("line-movement", filters, "Line movement", async () => {
      const rows = (await fetchHistoricalMarkets(filters)).filter(
        (row) => typeof row.openingLine === "number" && typeof row.closingLine === "number"
      );
      const averageMovement = rows.length
        ? Number(
            (
              rows.reduce((total, row) => total + Math.abs((row.closingLine ?? 0) - (row.openingLine ?? 0)), 0) /
              rows.length
            ).toFixed(2)
          )
        : null;

      return {
        hitRate: null,
        roi: null,
        sampleSize: rows.length,
        wins: 0,
        losses: 0,
        pushes: 0,
        extra: { averageMovement }
      };
    });
  } catch {
    return emptyTrend("line-movement", "Line movement", filters, "Line movement is unavailable because snapshot history could not be read.");
  }
}

export async function getRecentForm(team: string, sport: SportCode | "ALL" = "ALL", rawFilters?: EngineFilter | null): Promise<CachedValue<TrendEngineResult>> {
  const filters = normalizeFilters({ ...rawFilters, sport, team, subject: team });
  try {
    return await buildTrendResult("recent-form", filters, "Recent form", async () => {
      const rows = (await fetchRecentFormRows(filters)).slice(0, 10);
      const subject = normalizeText(team);
      const outcomes = rows
        .map((row) => {
          const participant = row.participants.find((entry) => normalizeText(entry.name).includes(subject));
          if (!participant || !row.winnerCompetitorId) return null;
          return row.winnerCompetitorId === participant.competitorId ? "WIN" : "LOSS";
        })
        .filter((value): value is "WIN" | "LOSS" => Boolean(value));
      const stats = computeStats(outcomes);
      return stats;
    });
  } catch {
    return emptyTrend("recent-form", "Recent form", filters, "Recent form is unavailable because stored event results could not be read.");
  }
}

export async function getTrendBundle(rawFilters?: EngineFilter | null) {
  const filters = normalizeFilters(rawFilters);
  const [ats, ou, favorite, underdog] = await Promise.all([
    getATSTrend(filters),
    getOUTrend(filters),
    getFavoriteROI(filters),
    getUnderdogROI(filters)
  ]);
  const data = [ats.value, ou.value, favorite.value, underdog.value];
  return {
    data,
    meta: {
      cached: ats.cached && ou.cached && favorite.cached && underdog.cached,
      sampleWarning: data.find((entry) => entry.warning)?.warning
    }
  };
}

export async function getTeamTrendBundle(team: string, rawFilters?: EngineFilter | null) {
  const filters = normalizeFilters({ ...rawFilters, team, subject: team });
  const [ats, ou, recentForm] = await Promise.all([
    getATSTrend(filters),
    getOUTrend(filters),
    getRecentForm(team, filters.sport, filters)
  ]);
  const data = [ats.value, ou.value, recentForm.value];
  return {
    data,
    meta: {
      cached: ats.cached && ou.cached && recentForm.cached,
      sampleWarning: data.find((entry) => entry.warning)?.warning
    }
  };
}

export async function getMatchupTrendCards(args: {
  leagueKey: LeagueKey;
  participantNames: string[];
}) {
  const subject = args.participantNames[0] ?? "";
  const filters = normalizeFilters({
    league: args.leagueKey,
    team: subject,
    subject,
    sample: 3,
    window: "365d"
  });
  const [ats, ou, lineMovement, recentForm] = await Promise.all([
    getATSTrend(filters),
    getOUTrend(filters),
    getLineMovement(filters),
    getRecentForm(subject, filters.sport, filters)
  ]);

  return [ats.value, ou.value, lineMovement.value, recentForm.value].map((result) => {
    const tone =
      result.confidence === "strong"
        ? "success"
        : result.confidence === "moderate"
          ? "brand"
          : result.confidence === "weak"
            ? "premium"
            : "muted";

    return {
      id: `${args.leagueKey}-${result.id}`,
      title: result.title,
      value:
        result.hitRate !== null
          ? `${result.hitRate.toFixed(1)}%`
          : typeof result.extra?.averageMovement === "number"
            ? `${result.extra.averageMovement.toFixed(2)} avg`
            : result.sampleSize
              ? `${result.sampleSize} sample`
              : "No sample",
      note:
        result.warning ??
        `${result.wins}-${result.losses}${result.pushes ? `-${result.pushes}` : ""} across ${result.sampleSize} real row${result.sampleSize === 1 ? "" : "s"}.`,
      href: `/trends?league=${args.leagueKey}&team=${encodeURIComponent(subject)}`,
      tone
    } as const;
  });
}
