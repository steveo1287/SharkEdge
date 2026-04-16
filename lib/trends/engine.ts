import { prisma } from "@/lib/db/prisma";
import { americanToImplied, stripVig } from "@/lib/odds";
import type { LeagueKey, SportCode, TrendFilters } from "@/lib/types/domain";
import { buildMatchupHref } from "@/lib/utils/matchups";
import {
  buildTrendContextVariables,
  type TrendContextVariables,
  summarizeContextForDisplay
} from "./context-variables";
import { computeContextAdjustedConfidence } from "./statisticalValidator";

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
  sample: 10
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
  profitUnits: number | null;
  sampleSize: number;
  wins: number;
  losses: number;
  pushes: number;
  streak: string | null;
  confidence: TrendConfidence;
  /** Context-adjusted confidence score 0-100 */
  adjustedConfidenceScore: number | null;
  /** Delta applied by context adjustment */
  contextAdjustmentDelta: number | null;
  /** Human-readable signals that drove the adjustment */
  contextSignals: string[];
  warning: string | null;
  dateRange: string;
  contextLabel: string;
  todayMatches: TodayTrendMatch[];
  /** Aggregated context variables across all enriched rows */
  contextSummary: {
    steamMovePct: number;
    clvBeatPct: number;
    backToBackPct: number;
    avgWeatherImpact: number;
    avgCompositeEdgeScore: number;
    topSignals: string[];
    weatherNote: string | null;
    scheduleNote: string | null;
    marketNote: string | null;
  } | null;
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
  startTime: Date | null;
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
  /** Enriched context variables — populated after fetchHistoricalMarkets */
  context: TrendContextVariables | null;
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

function isTrendPayloadStale(scope: string, payload: unknown) {
  if (
    !["ats", "ou", "favorite-roi", "underdog-roi", "clv", "line-movement", "recent-form"].includes(
      scope
    )
  ) {
    return false;
  }

  if (!payload || typeof payload !== "object") {
    return true;
  }

  return !Object.prototype.hasOwnProperty.call(payload, "streak");
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

function computeStreak(outcomes: Array<"WIN" | "LOSS" | "PUSH">) {
  const leader = outcomes.find((outcome) => outcome === "WIN" || outcome === "LOSS" || outcome === "PUSH");
  if (!leader) {
    return null;
  }

  let length = 0;
  for (const outcome of outcomes) {
    if (outcome !== leader) {
      break;
    }
    length += 1;
  }

  const prefix = leader === "WIN" ? "W" : leader === "LOSS" ? "L" : "P";
  return `${prefix}${length}`;
}

function computeStats(outcomes: Array<"WIN" | "LOSS" | "PUSH">, odds: number[] = []) {
  const wins = outcomes.filter((entry) => entry === "WIN").length;
  const losses = outcomes.filter((entry) => entry === "LOSS").length;
  const pushes = outcomes.filter((entry) => entry === "PUSH").length;
  const sampleSize = outcomes.length;
  const hitRate = sampleSize ? Number(((wins / sampleSize) * 100).toFixed(1)) : null;
  const profitUnits =
    sampleSize && odds.length === sampleSize
      ? Number(
          outcomes
            .reduce((total, outcome, index) => {
              if (outcome === "WIN") return total + getProfitFromAmericanOdds(odds[index] ?? -110);
              if (outcome === "LOSS") return total - 1;
              return total;
            }, 0)
            .toFixed(2)
        )
      : null;
  const roi =
    typeof profitUnits === "number" && sampleSize
      ? Number(((profitUnits / sampleSize) * 100).toFixed(1))
      : null;

  return {
    sampleSize,
    wins,
    losses,
    pushes,
    streak: computeStreak(outcomes),
    hitRate,
    profitUnits,
    roi
  };
}

async function withTrendCache<T>(scope: string, filters: TrendFilters, build: () => Promise<T>): Promise<CachedValue<T>> {
  const cacheKey = `${scope}:${stableStringify(filters)}`;
  const now = new Date();

  try {
    const cached = await prisma.trendCache.findUnique({ where: { cacheKey } });
    if (cached && cached.expiresAt > now && !isTrendPayloadStale(scope, cached.payloadJson)) {
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
          // startTime needed for situational context (day of week, primetime, late season)
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
      // startTime is selected via the event include above
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

      const openingLine = row.openingLine ?? openingSnapshot?.line ?? row.line ?? null;
      const closingLine = row.closingLine ?? closingSnapshot?.line ?? row.line ?? null;
      const openingOdds = row.openingOdds ?? openingSnapshot?.oddsAmerican ?? row.oddsAmerican;
      const closingOdds = row.closingOdds ?? closingSnapshot?.oddsAmerican ?? row.oddsAmerican;

      const context = buildTrendContextVariables({
        side: row.side,
        sport: row.event.league.sport,
        leagueKey: row.event.league.key,
        startTime: row.event.startTime ?? null,
        openingLine,
        closingLine,
        openingOdds,
        closingOdds,
        offeredOdds: row.oddsAmerican
      });

      return {
        leagueKey: row.event.league.key as LeagueKey,
        sport: row.event.league.sport,
        eventId: row.eventId,
        eventExternalId: row.event.externalEventId,
        eventLabel: row.event.name,
        startTime: row.event.startTime ?? null,
        marketType: row.marketType,
        marketLabel: row.marketLabel,
        selection: row.selection,
        side: row.side,
        sportsbookName: row.sportsbook?.name ?? "Unknown book",
        selectionCompetitorId: row.selectionCompetitor?.id ?? row.selectionCompetitorId ?? null,
        participantNames: row.event.participants.map((participant) => participant.competitor.name),
        openingLine,
        closingLine,
        openingOdds,
        closingOdds,
        line: row.line,
        oddsAmerican: row.oddsAmerican,
        impliedProbability: row.impliedProbability,
        siblingProbabilities,
        result: row.event.eventResult,
        context
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
  const end = new Date(now.getTime() + 72 * 60 * 60 * 1000);

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

// ---------------------------------------------------------------------------
// Aggregate context variables across a set of enriched rows
// ---------------------------------------------------------------------------
function buildContextSummary(
  contextRows: TrendContextVariables[]
): TrendEngineResult["contextSummary"] {
  if (!contextRows.length) return null;

  const n = contextRows.length;
  const steamMovePct = Math.round((contextRows.filter((r) => r.market.isSteamMove).length / n) * 100);
  const clvBeatPct = Math.round((contextRows.filter((r) => r.clv.beatClosingLine).length / n) * 100);
  const backToBackPct = Math.round((contextRows.filter((r) => r.schedule.isBackToBack).length / n) * 100);
  const avgWeatherImpact = Math.round(
    contextRows.reduce((sum, r) => sum + r.weather.weatherImpactScore, 0) / n
  );
  const avgCompositeEdgeScore = Math.round(
    contextRows.reduce((sum, r) => sum + r.compositeEdgeScore, 0) / n
  );

  // Pick the most representative row for display signals
  const bestRow = [...contextRows].sort((a, b) => b.compositeEdgeScore - a.compositeEdgeScore)[0];
  const display = bestRow ? summarizeContextForDisplay(bestRow) : null;

  // Aggregate top signals across all rows (frequency-weighted)
  const signalCounts = new Map<string, number>();
  for (const row of contextRows) {
    for (const signal of row.topSignals) {
      signalCounts.set(signal, (signalCounts.get(signal) ?? 0) + 1);
    }
  }
  const topSignals = Array.from(signalCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label]) => label);

  return {
    steamMovePct,
    clvBeatPct,
    backToBackPct,
    avgWeatherImpact,
    avgCompositeEdgeScore,
    topSignals,
    weatherNote: display?.weatherNote ?? null,
    scheduleNote: display?.scheduleNote ?? null,
    marketNote: display?.marketNote ?? null
  };
}

async function buildTrendResult(
  scope: string,
  filters: TrendFilters,
  title: string,
  builder: () => Promise<
    Omit<TrendEngineResult, "id" | "title" | "confidence" | "adjustedConfidenceScore" | "contextAdjustmentDelta" | "contextSignals" | "warning" | "dateRange" | "contextLabel" | "todayMatches" | "contextSummary"> & {
      contextRows?: TrendContextVariables[];
    }
  >
): Promise<CachedValue<TrendEngineResult>> {
  return withTrendCache(scope, filters, async () => {
    const base = await builder();
    const contextRows = base.contextRows ?? [];
    const baseConfidence = getConfidence(base.sampleSize);
    const baseScore =
      baseConfidence === "strong" ? 85
      : baseConfidence === "moderate" ? 65
      : baseConfidence === "weak" ? 40
      : 15;
    const contextAdj = computeContextAdjustedConfidence(baseScore, contextRows);
    const contextSummary = buildContextSummary(contextRows);

    const { contextRows: _dropped, ...baseWithoutContextRows } = base;

    return {
      id: scope,
      title,
      ...baseWithoutContextRows,
      confidence: baseConfidence,
      adjustedConfidenceScore: contextRows.length ? contextAdj.adjustedScore : null,
      contextAdjustmentDelta: contextRows.length ? contextAdj.adjustmentDelta : null,
      contextSignals: contextAdj.contextSignals,
      warning: getWarning(base.sampleSize),
      dateRange: formatDateRange(filters),
      contextLabel: buildContextLabel(filters, title),
      todayMatches: await getTodayMatchingGames(filters),
      contextSummary
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
      profitUnits: null,
      sampleSize: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      streak: null,
      confidence: "insufficient",
      adjustedConfidenceScore: null,
      contextAdjustmentDelta: null,
      contextSignals: [],
      warning,
      dateRange: formatDateRange(filters),
      contextLabel: buildContextLabel(filters, title),
      todayMatches: [],
      contextSummary: null
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
      return { ...stats, contextRows: graded.map((e) => e.row.context).filter((c): c is TrendContextVariables => c !== null) };
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
      return { ...stats, contextRows: graded.map((e) => e.row.context).filter((c): c is TrendContextVariables => c !== null) };
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
      return { ...stats, contextRows: graded.map((e) => e.row.context).filter((c): c is TrendContextVariables => c !== null) };
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
      return { ...stats, contextRows: graded.map((e) => e.row.context).filter((c): c is TrendContextVariables => c !== null) };
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
        profitUnits: null,
        sampleSize: rows.length,
        wins: rows.filter((row) => (row.clvPercentage ?? 0) > 0).length,
        losses: rows.filter((row) => (row.clvPercentage ?? 0) < 0).length,
        pushes: rows.filter((row) => (row.clvPercentage ?? 0) === 0).length,
        streak: null,
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
        profitUnits: null,
        sampleSize: rows.length,
        wins: 0,
        losses: 0,
        pushes: 0,
        streak: null,
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
  externalEventId?: string | null;
  limit?: number;
}) {
  const subjects = args.participantNames.filter(Boolean).slice(0, 2);
  if (!subjects.length) {
    return [];
  }

  const isTeamLeague = ["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF"].includes(args.leagueKey);
  const candidateEntries = (
    await Promise.all(
      subjects.flatMap((subject) => {
        const filters = normalizeFilters({
          league: args.leagueKey,
          team: subject,
          subject,
          sample: 10,
          window: "365d"
        });

        const candidates: Array<Promise<{ subject: string; result: TrendEngineResult }>> = [
          getRecentForm(subject, filters.sport, filters).then((entry) => ({
            subject,
            result: entry.value
          })),
          getFavoriteROI(filters).then((entry) => ({
            subject,
            result: entry.value
          })),
          getUnderdogROI(filters).then((entry) => ({
            subject,
            result: entry.value
          })),
          getLineMovement(filters).then((entry) => ({
            subject,
            result: entry.value
          }))
        ];

        if (isTeamLeague) {
          candidates.push(
            getATSTrend(filters).then((entry) => ({
              subject,
              result: entry.value
            })),
            getOUTrend(filters).then((entry) => ({
              subject,
              result: entry.value
            }))
          );
        }

        return candidates;
      })
    )
  ).flat();

  function getTrendScore(result: TrendEngineResult) {
    const confidenceWeight =
      result.confidence === "strong"
        ? 400
        : result.confidence === "moderate"
          ? 250
          : result.confidence === "weak"
            ? 125
            : 0;
    const hitRateEdge =
      typeof result.hitRate === "number" ? Math.abs(result.hitRate - 50) * 2 : 0;
    const roiEdge = typeof result.roi === "number" ? Math.abs(result.roi) * 3 : 0;
    const movementEdge =
      typeof result.extra?.averageMovement === "number"
        ? Math.abs(result.extra.averageMovement) * 30
        : 0;
    const liveMatchBonus = result.todayMatches.length * 20;
    const warningPenalty = result.warning ? 35 : 0;

    return confidenceWeight + result.sampleSize + hitRateEdge + roiEdge + movementEdge + liveMatchBonus - warningPenalty;
  }

  function formatTrendValue(result: TrendEngineResult) {
    if (typeof result.roi === "number" && typeof result.hitRate === "number") {
      return `${result.hitRate.toFixed(1)}% | ROI ${result.roi > 0 ? "+" : ""}${result.roi.toFixed(1)}%`;
    }

    if (typeof result.hitRate === "number") {
      return `${result.hitRate.toFixed(1)}%`;
    }

    if (typeof result.extra?.averageMovement === "number") {
      return `${result.extra.averageMovement.toFixed(2)} avg move`;
    }

    return result.sampleSize ? `${result.sampleSize} sample` : "No sample";
  }

  function formatTrendNote(subject: string, result: TrendEngineResult) {
    const record =
      result.sampleSize > 0
        ? `${result.wins}-${result.losses}${result.pushes ? `-${result.pushes}` : ""} over ${result.sampleSize} real row${result.sampleSize === 1 ? "" : "s"}`
        : "No qualifying historical rows yet";
    const currentMatchHref =
      args.externalEventId ? buildMatchupHref(args.leagueKey, args.externalEventId) : null;
    const matchesToday = currentMatchHref
      ? result.todayMatches.some((match) => match.href === currentMatchHref)
      : false;

    if (result.warning) {
      return matchesToday
        ? `${result.warning} This matchup is one of today's live matches for ${subject}.`
        : result.warning;
    }

    if (matchesToday) {
      return `${record}. This matchup matches the trend today.`;
    }

    if (result.todayMatches.length) {
      return `${record}. ${result.todayMatches.length} game${result.todayMatches.length === 1 ? "" : "s"} also match today.`;
    }

    return record;
  }

  function formatMatchupTrendTitle(subject: string, result: TrendEngineResult) {
    switch (result.id) {
      case "recent-form":
        return `${subject} recent form`;
      case "favorite-roi":
        return `${subject} as favorite`;
      case "underdog-roi":
        return `${subject} as underdog`;
      case "ats":
        return `${subject} against the spread`;
      case "ou":
        return `${subject} totals profile`;
      case "line-movement":
        return `${subject} line movement`;
      default:
        return `${subject} ${result.title}`;
    }
  }

  const rankedCards = candidateEntries
    .filter((entry) => entry.result.sampleSize > 0)
    .sort((left, right) => getTrendScore(right.result) - getTrendScore(left.result))
    .filter((entry, index, all) => {
      const dedupeKey = `${normalizeText(entry.subject)}|${entry.result.id}`;
      return all.findIndex((candidate) => `${normalizeText(candidate.subject)}|${candidate.result.id}` === dedupeKey) === index;
    })
    .slice(0, args.limit ?? 3)
    .map((entry) => {
      const result = entry.result;
      const tone =
        result.confidence === "strong"
          ? "success"
          : result.confidence === "moderate"
            ? "brand"
            : result.confidence === "weak"
              ? "premium"
              : "muted";

      return {
        id: `${args.leagueKey}-${normalizeText(entry.subject)}-${result.id}`,
        title: formatMatchupTrendTitle(entry.subject, result),
        value: formatTrendValue(result),
        note: formatTrendNote(entry.subject, result),
        href: `/trends?league=${args.leagueKey}&team=${encodeURIComponent(entry.subject)}`,
        tone
      } as const;
    });

  return rankedCards;
}
