import { getServerDatabaseResolution, hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type {
  LeagueKey,
  MatchupTrendCardView,
  PropCardView,
  SavedTrendSystemView,
  SportCode,
  TrendCardView,
  TrendDashboardView,
  TrendFilters,
  TrendMode
} from "@/lib/types/domain";
import { buildMatchupHref } from "@/lib/utils/matchups";
import { trendFiltersSchema } from "@/lib/validation/filters";

import { buildTrendExplanation, parseTrendAiQuery } from "./ai-query";
import { getTodayTrendMatches } from "./matching-games";
import { buildSavedTrendHref, listSavedTrendRows } from "./saved-systems";

const DEFAULT_TREND_FILTERS: TrendFilters = {
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

const SPORT_LABELS: Record<TrendFilters["sport"], string> = {
  ALL: "All sports",
  BASKETBALL: "Basketball",
  BASEBALL: "Baseball",
  HOCKEY: "Hockey",
  FOOTBALL: "Football",
  MMA: "MMA",
  BOXING: "Boxing",
  OTHER: "Other"
};

const MARKET_LABELS: Record<TrendFilters["market"], string> = {
  ALL: "All markets",
  spread: "Spread",
  moneyline: "Moneyline",
  total: "Total",
  team_total: "Team total",
  player_points: "Player points",
  player_rebounds: "Player rebounds",
  player_assists: "Player assists",
  player_threes: "Player threes",
  player_pitcher_outs: "Pitcher outs",
  player_pitcher_strikeouts: "Pitcher strikeouts",
  fight_winner: "Fight winner",
  method_of_victory: "Method of victory",
  round_total: "Round total",
  round_winner: "Round winner",
  other: "Other"
};

type HistoricalRow = {
  id: string;
  eventLabel: string;
  eventExternalId: string | null;
  league: LeagueKey;
  sport: SportCode;
  marketType: TrendFilters["market"];
  marketLabel: string;
  selection: string;
  side: string | null;
  sportsbookName: string;
  participantNames: string[];
  openingLine: number | null;
  closingLine: number | null;
  openingOddsAmerican: number;
  closingOddsAmerican: number;
  movementValue: number | null;
  movementUnit: "pts" | "c";
  outcome: "WIN" | "LOSS" | "PUSH" | "UNAVAILABLE";
  roleBucket:
    | "HOME"
    | "AWAY"
    | "OVER"
    | "UNDER"
    | "FAVORITE"
    | "UNDERDOG"
    | "COMPETITOR_A"
    | "COMPETITOR_B"
    | "UNKNOWN";
};

type SettledTrendBet = {
  id: string;
  sport: SportCode;
  league: LeagueKey;
  marketType: TrendFilters["market"];
  marketLabel: string;
  selection: string;
  riskAmount: number;
  toWin: number;
  payout: number | null;
  result: "WIN" | "LOSS" | "PUSH" | "VOID" | "CASHED_OUT";
  clvPercentage: number | null;
  sportsbookName: string;
  eventLabel: string | null;
  eventExternalId: string | null;
  participantNames: string[];
};

type RecentFormRow = {
  league: LeagueKey;
  sport: SportCode;
  eventExternalId: string | null;
  participantNames: string[];
  participants: Array<{
    competitorId: string;
    name: string;
  }>;
  winnerCompetitorId: string | null;
  margin: number | null;
  totalPoints: number | null;
  method: string | null;
};

type TrendQueryResult = {
  filters: TrendFilters;
  cards: TrendCardView[];
  metrics: TrendDashboardView["metrics"];
  insights: TrendDashboardView["insights"];
  movementRows: TrendDashboardView["movementRows"];
  segmentRows: TrendDashboardView["segmentRows"];
  sourceNote: string;
  sampleNote: string | null;
  querySummary: string;
  savedTrendName: string;
  setup: TrendDashboardView["setup"];
};

type BacktestedSystemCandidate = {
  id: string;
  title: string;
  marketType: "spread" | "moneyline" | "total";
  roleBucket: HistoricalRow["roleBucket"];
  bucketLabel: string;
  sampleSize: number;
  hitRate: number | null;
  roi: number | null;
  avgMovement: number | null;
  note: string;
  href: string | null;
  score: number;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function formatSigned(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatDateWindow(window: TrendFilters["window"]) {
  if (window === "all") {
    return "Full stored range";
  }

  return window === "365d" ? "Last 365 days" : `Last ${window.slice(0, -1)} days`;
}

function getMarketLabel(market: TrendFilters["market"] | string) {
  return MARKET_LABELS[market as keyof typeof MARKET_LABELS] ?? market;
}

function getWindowStart(window: TrendFilters["window"]) {
  if (window === "all") {
    return null;
  }

  const days = window === "30d" ? 30 : window === "90d" ? 90 : 365;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function getActiveSubject(filters: TrendFilters) {
  return filters.team || filters.player || filters.fighter || filters.subject;
}

function buildQuerySummary(filters: TrendFilters) {
  return [
    filters.league !== "ALL" ? filters.league : SPORT_LABELS[filters.sport],
    MARKET_LABELS[filters.market],
    filters.side !== "ALL" ? filters.side : null,
    filters.sportsbook !== "all" ? `book: ${filters.sportsbook}` : null,
    filters.window,
    getActiveSubject(filters) ? `subject: ${getActiveSubject(filters)}` : null,
    filters.opponent ? `opponent: ${filters.opponent}` : null
  ]
    .filter(Boolean)
    .join(" | ");
}

function buildTrendSetupState(error?: unknown): TrendDashboardView["setup"] {
  const message = error instanceof Error ? error.message : "";
  const resolution = getServerDatabaseResolution();

  if (!hasUsableServerDatabaseUrl()) {
    return {
      status: "blocked",
      title: "Historical intelligence needs Postgres",
      detail:
        "The trends engine runs from harvested odds snapshots, normalized event results, and persisted ledger data. This runtime still needs a usable Postgres URL before those cards can render.",
      steps: [
        "Set DATABASE_URL, POSTGRES_PRISMA_URL, or POSTGRES_URL in the server runtime.",
        "Run npx prisma migrate deploy.",
        "Run npm run prisma:seed to load starter rows."
      ]
    };
  }

  if (/does not exist|relation .* does not exist|P2021|P2022/i.test(message)) {
    return {
      status: "blocked",
      title: "Historical intelligence tables are not migrated yet",
      detail:
        "SharkEdge can reach Postgres, but the event-result, odds-snapshot, or trend tables are not ready in this database yet.",
      steps: [
        "Run npx prisma migrate deploy.",
        "Run npm run prisma:seed.",
        "Re-run the historical odds ingestion job."
      ]
    };
  }

  return {
    status: "blocked",
    title: "Historical intelligence is unavailable in this runtime",
    detail:
      "The trend query engine hit a database-backed error and is refusing to backfill fake cards.",
    steps: [
      `Active DB source: ${resolution.key ?? "none"}.`,
      `Latest error: ${message || "Unknown trend query error."}`
    ]
  };
}

export function parseTrendFilters(searchParams: Record<string, string | string[] | undefined>) {
  return trendFiltersSchema.parse({
    sport: Array.isArray(searchParams.sport) ? searchParams.sport[0] : searchParams.sport,
    league: Array.isArray(searchParams.league) ? searchParams.league[0] : searchParams.league,
    market: Array.isArray(searchParams.market) ? searchParams.market[0] : searchParams.market,
    sportsbook: Array.isArray(searchParams.sportsbook)
      ? searchParams.sportsbook[0]
      : searchParams.sportsbook,
    side: Array.isArray(searchParams.side) ? searchParams.side[0] : searchParams.side,
    subject: Array.isArray(searchParams.subject) ? searchParams.subject[0] : searchParams.subject,
    team: Array.isArray(searchParams.team) ? searchParams.team[0] : searchParams.team,
    player: Array.isArray(searchParams.player) ? searchParams.player[0] : searchParams.player,
    fighter: Array.isArray(searchParams.fighter) ? searchParams.fighter[0] : searchParams.fighter,
    opponent: Array.isArray(searchParams.opponent)
      ? searchParams.opponent[0]
      : searchParams.opponent,
    window: Array.isArray(searchParams.window) ? searchParams.window[0] : searchParams.window,
    sample: Array.isArray(searchParams.sample) ? searchParams.sample[0] : searchParams.sample
  });
}

function readTrendFilters(rawFilters?: Partial<TrendFilters> | null) {
  return trendFiltersSchema.parse({
    ...DEFAULT_TREND_FILTERS,
    ...(rawFilters ?? {})
  });
}

function getBetProfit(bet: SettledTrendBet) {
  if (bet.result === "WIN") return Number(bet.toWin.toFixed(2));
  if (bet.result === "LOSS") return Number((-bet.riskAmount).toFixed(2));
  if (bet.result === "CASHED_OUT") {
    return Number(((bet.payout ?? bet.riskAmount) - bet.riskAmount).toFixed(2));
  }
  return 0;
}

function getHitRate(rows: Array<{ outcome: string }>) {
  const graded = rows.filter(
    (row) => row.outcome === "WIN" || row.outcome === "LOSS" || row.outcome === "PUSH"
  );
  if (!graded.length) return null;
  const wins = graded.filter((row) => row.outcome === "WIN").length;
  return Number(((wins / graded.length) * 100).toFixed(1));
}

function getHistoricalRoi(rows: HistoricalRow[]) {
  const graded = rows.filter((row) => row.outcome !== "UNAVAILABLE");
  if (!graded.length) return null;

  const units = graded.reduce((total, row) => {
    if (row.outcome === "WIN") {
      return (
        total +
        (row.closingOddsAmerican > 0
          ? row.closingOddsAmerican / 100
          : 100 / Math.abs(row.closingOddsAmerican))
      );
    }
    if (row.outcome === "LOSS") return total - 1;
    return total;
  }, 0);

  return Number(((units / graded.length) * 100).toFixed(1));
}

function getBetRoi(rows: SettledTrendBet[]) {
  const risked = rows.reduce((total, row) => total + row.riskAmount, 0);
  if (!risked) return null;
  const profit = rows.reduce((total, row) => total + getBetProfit(row), 0);
  return Number(((profit / risked) * 100).toFixed(1));
}

function resolveSummary(event: any) {
  const participants = event.participants.map((participant: any) => ({
    competitorId: participant.competitor.id,
    name: participant.competitor.name,
    role: participant.role,
    score:
      typeof participant.score === "string" && participant.score.trim()
        ? Number(participant.score)
        : null,
    isWinner: participant.isWinner
  }));
  const winnerCompetitorId =
    event.eventResult?.winnerCompetitorId ??
    participants.find((participant: any) => participant.isWinner === true)?.competitorId ??
    null;
  const totalPoints =
    typeof event.eventResult?.totalPoints === "number"
      ? event.eventResult.totalPoints
      : participants.every((participant: any) => typeof participant.score === "number")
        ? participants.reduce(
            (total: number, participant: any) => total + (participant.score ?? 0),
            0
          )
        : null;
  const margin =
    typeof event.eventResult?.margin === "number"
      ? event.eventResult.margin
      : participants.length >= 2 &&
          typeof participants[0]?.score === "number" &&
          typeof participants[1]?.score === "number"
        ? Math.abs((participants[0].score ?? 0) - (participants[1].score ?? 0))
        : null;

  return {
    participants,
    winnerCompetitorId,
    totalPoints,
    margin,
    method: event.eventResult?.method ?? null,
    official:
      event.status === "FINAL" || event.resultState === "OFFICIAL" || Boolean(event.eventResult)
  };
}

function matchesFilters(
  filters: TrendFilters,
  args: { participantNames: string[]; selection: string; marketLabel: string; sportsbookName?: string }
) {
  const activeSubject = normalizeText(getActiveSubject(filters));
  const haystack = [
    ...args.participantNames.map((name) => normalizeText(name)),
    normalizeText(args.selection),
    normalizeText(args.marketLabel)
  ];

  if (activeSubject && !haystack.some((value) => value.includes(activeSubject))) {
    return false;
  }

  if (
    filters.opponent &&
    !haystack.some((value) => value.includes(normalizeText(filters.opponent)))
  ) {
    return false;
  }

  if (filters.sportsbook !== "all" && args.sportsbookName) {
    return normalizeText(args.sportsbookName) === normalizeText(filters.sportsbook);
  }

  return true;
}

function getRoleBucket(market: any, siblings: any[]) {
  const side = market.side ?? "UNKNOWN";
  if (side === "OVER" || side === "UNDER") return side;
  if (!["HOME", "AWAY", "COMPETITOR_A", "COMPETITOR_B"].includes(side)) return "UNKNOWN";
  const opponent = siblings.find((row) => row.id !== market.id);
  if (!opponent) return side;
  const selfProb = typeof market.impliedProbability === "number" ? market.impliedProbability : 0;
  const otherProb =
    typeof opponent.impliedProbability === "number" ? opponent.impliedProbability : 0;
  if (selfProb === otherProb) return side;
  return selfProb > otherProb ? "FAVORITE" : "UNDERDOG";
}

function resolveMarketOutcome(
  market: any,
  summary: ReturnType<typeof resolveSummary>
): HistoricalRow["outcome"] {
  if (!summary.official) return "UNAVAILABLE";

  const participants = Object.fromEntries(
    summary.participants.map((participant: any) => [participant.role, participant])
  );

  if (market.marketType === "moneyline" || market.marketType === "fight_winner") {
    const selectionId =
      market.selectionCompetitorId ??
      (market.side === "HOME"
        ? participants.HOME?.competitorId
        : market.side === "AWAY"
          ? participants.AWAY?.competitorId
          : market.side === "COMPETITOR_A"
            ? participants.COMPETITOR_A?.competitorId
            : market.side === "COMPETITOR_B"
              ? participants.COMPETITOR_B?.competitorId
              : null);
    if (!selectionId || !summary.winnerCompetitorId) return "UNAVAILABLE";
    return selectionId === summary.winnerCompetitorId ? "WIN" : "LOSS";
  }

  if (market.marketType === "spread") {
    const selected =
      market.side === "HOME"
        ? participants.HOME
        : market.side === "AWAY"
          ? participants.AWAY
          : market.side === "COMPETITOR_A"
            ? participants.COMPETITOR_A
            : market.side === "COMPETITOR_B"
              ? participants.COMPETITOR_B
              : null;
    const opponent =
      market.side === "HOME"
        ? participants.AWAY
        : market.side === "AWAY"
          ? participants.HOME
          : market.side === "COMPETITOR_A"
            ? participants.COMPETITOR_B
            : market.side === "COMPETITOR_B"
              ? participants.COMPETITOR_A
              : null;
    if (
      !selected ||
      !opponent ||
      typeof selected.score !== "number" ||
      typeof opponent.score !== "number" ||
      typeof market.line !== "number"
    ) {
      return "UNAVAILABLE";
    }
    const delta = selected.score + market.line - opponent.score;
    return delta > 0 ? "WIN" : delta < 0 ? "LOSS" : "PUSH";
  }

  if (market.marketType === "total" || market.marketType === "round_total") {
    if (typeof summary.totalPoints !== "number" || typeof market.line !== "number") {
      return "UNAVAILABLE";
    }
    const delta = summary.totalPoints - market.line;
    if (market.side === "OVER") return delta > 0 ? "WIN" : delta < 0 ? "LOSS" : "PUSH";
    if (market.side === "UNDER") return delta < 0 ? "WIN" : delta > 0 ? "LOSS" : "PUSH";
    return "UNAVAILABLE";
  }

  if (market.marketType === "method_of_victory") {
    if (!summary.method) return "UNAVAILABLE";
    return normalizeText(summary.method).includes(normalizeText(market.selection))
      ? "WIN"
      : "LOSS";
  }

  return "UNAVAILABLE";
}

function createCard(args: {
  id: string;
  title: string;
  sampleSize: number;
  hitRate: number | null;
  roi: number | null;
  value?: string;
  note: string;
  href?: string | null;
  tone?: TrendCardView["tone"];
  window: TrendFilters["window"];
}) {
  const smallSample = args.sampleSize > 0 && args.sampleSize < 10;
  return {
    id: args.id,
    title: args.title,
    value:
      args.value ??
      (args.hitRate !== null
        ? `${args.hitRate.toFixed(1)}%`
        : args.roi !== null
          ? `${args.roi > 0 ? "+" : ""}${args.roi.toFixed(1)}%`
          : "Limited"),
    hitRate: args.hitRate !== null ? `${args.hitRate.toFixed(1)}%` : null,
    roi: args.roi !== null ? `${args.roi > 0 ? "+" : ""}${args.roi.toFixed(1)}%` : null,
    sampleSize: args.sampleSize,
    dateRange: formatDateWindow(args.window),
    note: args.note,
    explanation: `${args.title} is calculated from ${args.sampleSize} real stored row${args.sampleSize === 1 ? "" : "s"} across ${formatDateWindow(args.window).toLowerCase()}.`,
    whyItMatters:
      args.roi !== null || args.hitRate !== null
        ? `This card matters because it keeps the actual sample, hit rate, and ROI visible in one place instead of letting a trend headline float without context.`
        : `This card matters as market context, but SharkEdge is not inventing ROI or hit rate when the stored sample cannot support it.`,
    caution: smallSample
      ? "Use with caution: this sample is still small and can swing hard."
      : "Trend context is useful, but it is never certainty.",
    href: args.href ?? null,
    tone:
      args.tone ??
      (args.roi !== null && args.roi > 0
        ? "success"
        : args.hitRate !== null && args.hitRate >= 55
          ? "brand"
          : "muted")
  } satisfies TrendCardView;
}

function humanizeRoleBucket(value: HistoricalRow["roleBucket"]) {
  return value.toLowerCase().replace(/_/g, " ");
}

function bucketSpreadLine(value: number | null) {
  if (typeof value !== "number") return null;
  const abs = Math.abs(value);
  if (abs < 1) return "pk to 0.5";
  if (abs <= 3) return "1 to 3";
  if (abs <= 6) return "3.5 to 6";
  if (abs <= 10) return "6.5 to 10";
  return "10+";
}

function bucketMoneylineOdds(value: number) {
  if (value <= -250) return "-250+";
  if (value <= -181) return "-181 to -250";
  if (value <= -141) return "-141 to -180";
  if (value <= -110) return "-110 to -140";
  if (value < 100) return "sub +100";
  if (value <= 140) return "+100 to +140";
  if (value <= 200) return "+141 to +200";
  return "+201+";
}

function bucketTotalLine(value: number | null) {
  if (typeof value !== "number") return null;
  if (value < 210) return "under 210";
  if (value < 225) return "210 to 224.5";
  if (value < 240) return "225 to 239.5";
  return "240+";
}

function buildSystemHref(filters: TrendFilters, market: TrendFilters["market"], side: TrendFilters["side"]) {
  const params = new URLSearchParams();
  if (filters.league !== "ALL") params.set("league", filters.league);
  if (filters.sport !== "ALL") params.set("sport", filters.sport);
  params.set("market", market);
  if (side !== "ALL") params.set("side", side);
  params.set("window", filters.window);
  params.set("sample", String(filters.sample));
  if (filters.sportsbook !== "all") params.set("sportsbook", filters.sportsbook);
  if (filters.subject) params.set("subject", filters.subject);
  if (filters.team) params.set("team", filters.team);
  if (filters.player) params.set("player", filters.player);
  if (filters.fighter) params.set("fighter", filters.fighter);
  if (filters.opponent) params.set("opponent", filters.opponent);
  return `/trends?${params.toString()}`;
}

function buildSystemScore(args: {
  sampleSize: number;
  hitRate: number | null;
  roi: number | null;
  avgMovement: number | null;
}) {
  const sampleWeight = Math.min(args.sampleSize / 50, 1) * 38;
  const hitRateWeight = args.hitRate !== null ? Math.max(args.hitRate - 50, 0) * 0.9 : 0;
  const roiWeight = args.roi !== null ? Math.max(args.roi, 0) * 2.1 : 0;
  const moveWeight = args.avgMovement !== null ? Math.min(args.avgMovement, 10) * 1.2 : 0;
  return Number((sampleWeight + hitRateWeight + roiWeight + moveWeight).toFixed(2));
}

async function buildBacktestedMarketCards(args: {
  historicalRows: HistoricalRow[];
  filters: TrendFilters;
}) {
  const { historicalRows, filters } = args;
  const grouped = new Map<string, { marketType: "spread" | "moneyline" | "total"; roleBucket: HistoricalRow["roleBucket"]; bucketLabel: string; rows: HistoricalRow[] }>();

  for (const row of historicalRows) {
    if (row.outcome === "UNAVAILABLE") continue;
    if (row.marketType !== "spread" && row.marketType !== "moneyline" && row.marketType !== "total") continue;

    let bucketLabel: string | null = null;
    if (row.marketType === "spread") {
      if (!["HOME", "AWAY"].includes(row.roleBucket)) continue;
      bucketLabel = bucketSpreadLine(row.closingLine);
    } else if (row.marketType === "moneyline") {
      if (!["HOME", "AWAY"].includes(row.roleBucket)) continue;
      bucketLabel = bucketMoneylineOdds(row.closingOddsAmerican);
    } else if (row.marketType === "total") {
      if (!["OVER", "UNDER"].includes(row.roleBucket)) continue;
      bucketLabel = bucketTotalLine(row.closingLine);
    }

    if (!bucketLabel) continue;

    const key = `${row.marketType}:${row.roleBucket}:${bucketLabel}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      grouped.set(key, {
        marketType: row.marketType,
        roleBucket: row.roleBucket,
        bucketLabel,
        rows: [row]
      });
    }
  }

  const candidates: BacktestedSystemCandidate[] = [];

  for (const [key, group] of grouped.entries()) {
    if (group.rows.length < Math.max(5, filters.sample)) continue;

    const sampleSize = group.rows.length;
    const hitRate = getHitRate(group.rows);
    const roi = getHistoricalRoi(group.rows);
    const avgMovement = average(
      group.rows
        .map((row) => Math.abs(row.movementValue ?? 0))
        .filter((value) => Number.isFinite(value))
    );
    const score = buildSystemScore({ sampleSize, hitRate, roi, avgMovement: Number.isFinite(avgMovement) ? avgMovement : null });
    const marketLabel = getMarketLabel(group.marketType);
    const title = `${marketLabel} | ${humanizeRoleBucket(group.roleBucket)} ${group.bucketLabel}`;
    const note = `${sampleSize} historical rows · ${hitRate !== null ? `${hitRate.toFixed(1)}% hit` : "hit rate unavailable"}${roi !== null ? ` · ${roi > 0 ? "+" : ""}${roi.toFixed(1)}% ROI` : ""}${Number.isFinite(avgMovement) && avgMovement > 0 ? ` · avg move ${avgMovement.toFixed(group.marketType === "moneyline" ? 0 : 1)} ${group.marketType === "moneyline" ? "c" : "pts"}` : ""}`;
    const href = buildSystemHref(filters, group.marketType, group.roleBucket as TrendFilters["side"]);

    candidates.push({
      id: key.replace(/[^a-z0-9:-]/gi, "-"),
      title,
      marketType: group.marketType,
      roleBucket: group.roleBucket,
      bucketLabel: group.bucketLabel,
      sampleSize,
      hitRate,
      roi,
      avgMovement: Number.isFinite(avgMovement) ? Number(avgMovement.toFixed(group.marketType === "moneyline" ? 0 : 1)) : null,
      note,
      href,
      score
    });
  }

  const selectedCandidates = [
    ...candidates
      .filter((candidate) => candidate.marketType === "spread")
      .sort((left, right) => right.score - left.score)
      .slice(0, 2),
    ...candidates
      .filter((candidate) => candidate.marketType === "moneyline")
      .sort((left, right) => right.score - left.score)
      .slice(0, 2),
    ...candidates
      .filter((candidate) => candidate.marketType === "total")
      .sort((left, right) => right.score - left.score)
      .slice(0, 2)
  ].sort((left, right) => right.score - left.score);

  return Promise.all(
    selectedCandidates.map(async (candidate) => {
      const liveFilters = {
        ...filters,
        market: candidate.marketType,
        side: candidate.roleBucket as TrendFilters["side"]
      } satisfies TrendFilters;
      const liveMatches = await getTodayTrendMatches(liveFilters);
      const liveQualifierNote = liveMatches.matches.length
        ? ` · ${liveMatches.matches.length} live qualifier${liveMatches.matches.length === 1 ? "" : "s"} today`
        : "";

      return createCard({
        id: candidate.id,
        title: `Backtest | ${candidate.title}`,
        sampleSize: candidate.sampleSize,
        hitRate: candidate.hitRate,
        roi: candidate.roi,
        note: `${candidate.note}${liveQualifierNote}`,
        href: candidate.href,
        tone:
          candidate.roi !== null && candidate.roi > 6
            ? "success"
            : candidate.hitRate !== null && candidate.hitRate >= 56
              ? "brand"
              : candidate.marketType === "total"
                ? "premium"
                : "muted",
        window: filters.window
      });
    })
  );
}

async function fetchSourceRows(filters: TrendFilters) {
  const windowStart = getWindowStart(filters.window);

  return Promise.all([
    prisma.eventMarket.findMany({
      where: {
        sourceKey: "oddsharvester_historical",
        ...(filters.market !== "ALL" ? { marketType: filters.market } : {}),
        event: {
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
        event: {
          include: {
            league: { select: { key: true, sport: true } },
            participants: { include: { competitor: { select: { id: true, name: true } } } },
            eventResult: true
          }
        },
        snapshots: { orderBy: { capturedAt: "asc" } }
      },
      orderBy: { updatedAt: "desc" },
      take: 500
    }),
    prisma.bet.findMany({
      where: {
        archivedAt: null,
        result: { not: "OPEN" },
        ...(filters.market !== "ALL" ? { marketType: filters.market } : {}),
        ...(filters.league !== "ALL"
          ? { league: filters.league }
          : filters.sport !== "ALL"
            ? { sport: filters.sport }
            : {}),
        ...(windowStart ? { placedAt: { gte: windowStart } } : {})
      },
      include: {
        sportsbook: { select: { name: true } },
        event: {
          include: {
            participants: { include: { competitor: { select: { name: true } } } }
          }
        }
      },
      orderBy: { placedAt: "desc" },
      take: 500
    }),
    prisma.event.findMany({
      where: {
        status: "FINAL",
        ...(filters.league !== "ALL"
          ? { league: { key: filters.league } }
          : filters.sport !== "ALL"
            ? { league: { sport: filters.sport } }
            : {}),
        ...(windowStart ? { startTime: { gte: windowStart } } : {})
      },
      include: {
        league: { select: { key: true, sport: true } },
        participants: { include: { competitor: { select: { id: true, name: true } } } },
        eventResult: true
      },
      orderBy: { startTime: "desc" },
      take: 300
    })
  ]);
}

export async function getTrendQueryResult(
  rawFilters?: Partial<TrendFilters> | null
): Promise<TrendQueryResult> {
  const filters = readTrendFilters(rawFilters);

  try {
    const [marketRows, betRows, eventRows] = await fetchSourceRows(filters);
    const siblingMap = marketRows.reduce<Map<string, any[]>>((map, market: any) => {
      const key = `${market.eventId}:${market.sportsbookId ?? "book"}:${market.marketType}`;
      map.set(key, [...(map.get(key) ?? []), market]);
      return map;
    }, new Map());

    const historicalRows = marketRows
      .map((market: any) => {
        const summary = resolveSummary(market.event);
        const opening = market.snapshots[0];
        const closing = market.snapshots[market.snapshots.length - 1];
        return {
          id: market.id,
          eventLabel: market.event.name,
          eventExternalId: market.event.externalEventId,
          league: market.event.league.key as LeagueKey,
          sport: market.event.league.sport as SportCode,
          marketType: market.marketType,
          marketLabel: market.marketLabel,
          selection: market.selection,
          side: market.side,
          sportsbookName: market.sportsbook?.name ?? "Historical feed",
          participantNames: market.event.participants.map(
            (participant: any) => participant.competitor.name
          ),
          openingLine: opening?.line ?? market.line,
          closingLine: closing?.line ?? market.line,
          openingOddsAmerican: opening?.oddsAmerican ?? market.oddsAmerican,
          closingOddsAmerican: closing?.oddsAmerican ?? market.oddsAmerican,
          movementValue:
            typeof opening?.line === "number" && typeof closing?.line === "number"
              ? closing.line - opening.line
              : (closing?.oddsAmerican ?? market.oddsAmerican) -
                (opening?.oddsAmerican ?? market.oddsAmerican),
          movementUnit:
            typeof opening?.line === "number" && typeof closing?.line === "number"
              ? "pts"
              : "c",
          outcome: resolveMarketOutcome(market, summary),
          roleBucket: getRoleBucket(
            market,
            siblingMap.get(
              `${market.eventId}:${market.sportsbookId ?? "book"}:${market.marketType}`
            ) ?? []
          )
        } satisfies HistoricalRow;
      })
      .filter((row) => matchesFilters(filters, row))
      .filter((row) => (filters.side === "ALL" ? true : row.roleBucket === filters.side))
      .filter((row) => (filters.market === "ALL" ? true : row.marketType === filters.market));

    const settledBets = betRows
      .map(
        (bet: any) =>
          ({
            id: bet.id,
            sport: bet.sport as SportCode,
            league: bet.league as LeagueKey,
            marketType: bet.marketType,
            marketLabel: bet.marketLabel,
            selection: bet.selection,
            riskAmount: bet.riskAmount,
            toWin: bet.toWin,
            payout: bet.payout,
            result: bet.result,
            clvPercentage: bet.clvPercentage,
            sportsbookName: bet.sportsbook?.name ?? "No book",
            eventLabel: bet.event?.name ?? null,
            eventExternalId: bet.event?.externalEventId ?? null,
            participantNames:
              bet.event?.participants.map((participant: any) => participant.competitor.name) ?? []
          }) satisfies SettledTrendBet
      )
      .filter((bet) => matchesFilters(filters, bet))
      .filter((bet) => (filters.league === "ALL" ? true : bet.league === filters.league))
      .filter((bet) => (filters.sport === "ALL" ? true : bet.sport === filters.sport));

    const recentFormRows = eventRows
      .map((event: any) => {
        const summary = resolveSummary(event);
        return {
          league: event.league.key as LeagueKey,
          sport: event.league.sport as SportCode,
          eventExternalId: event.externalEventId,
          participantNames: event.participants.map((participant: any) => participant.competitor.name),
          participants: event.participants.map((participant: any) => ({
            competitorId: participant.competitor.id,
            name: participant.competitor.name
          })),
          winnerCompetitorId: summary.winnerCompetitorId,
          margin: summary.margin,
          totalPoints: summary.totalPoints,
          method: summary.method
        } satisfies RecentFormRow;
      })
      .filter((row) =>
        matchesFilters(filters, {
          participantNames: row.participantNames,
          selection: "",
          marketLabel: ""
        })
      );

    const atsRows = historicalRows.filter((row) => row.marketType === "spread");
    const totalRows = historicalRows.filter((row) => row.marketType === "total");
    const favoriteRows = historicalRows.filter((row) => row.roleBucket === "FAVORITE");
    const underdogRows = historicalRows.filter((row) => row.roleBucket === "UNDERDOG");
    const pointMovementRows = historicalRows.filter((row) => row.movementUnit === "pts");
    const filteredMarketRows =
      filters.market === "ALL"
        ? historicalRows
        : historicalRows.filter((row) => row.marketType === filters.market);
    const clvBets = settledBets.filter((bet) => typeof bet.clvPercentage === "number");
    const avgClv = average(clvBets.map((bet) => bet.clvPercentage as number));
    const activeSubject = getActiveSubject(filters);
    const recentSubjectRows = activeSubject
      ? recentFormRows.filter((row) =>
          row.participantNames.some((name: string) =>
            normalizeText(name).includes(normalizeText(activeSubject))
          )
        )
      : [];
    const recentWins = recentSubjectRows.filter((row) =>
      row.participants.some(
        (participant: RecentFormRow["participants"][number]) =>
          normalizeText(participant.name).includes(normalizeText(activeSubject)) &&
          participant.competitorId === row.winnerCompetitorId
      )
    ).length;

    const backtestedCards = await buildBacktestedMarketCards({ historicalRows, filters });
    const fallbackCards: TrendCardView[] = [
      createCard({
        id: "ats-trend",
        title: "ATS trend",
        sampleSize: atsRows.length,
        hitRate: getHitRate(atsRows),
        roi: getHistoricalRoi(atsRows),
        note: atsRows.length
          ? "Spread hit rate and synthetic ROI from harvested lines matched to final results."
          : "ATS stays blank until spread history and final results overlap.",
        href:
          filters.league !== "ALL"
            ? `/trends?league=${filters.league}&market=spread`
            : "/trends?market=spread",
        window: filters.window
      }),
      createCard({
        id: "ou-trend",
        title: "O/U trend",
        sampleSize: totalRows.length,
        hitRate: getHitRate(totalRows),
        roi: getHistoricalRoi(totalRows),
        note: totalRows.length
          ? "Totals hit rate and synthetic ROI from stored totals matched to final scores."
          : "Totals stay blank until stored total markets and final scores overlap.",
        href:
          filters.league !== "ALL"
            ? `/trends?league=${filters.league}&market=total`
            : "/trends?market=total",
        window: filters.window
      }),
      createCard({
        id: "favorite-roi",
        title: "Favorite ROI",
        sampleSize: favoriteRows.length,
        hitRate: getHitRate(favoriteRows),
        roi: getHistoricalRoi(favoriteRows),
        note: favoriteRows.length
          ? "Favorites are derived from implied probability inside matched book/event market pairs."
          : "No favorite-tagged historical rows match this query yet.",
        window: filters.window
      }),
      createCard({
        id: "underdog-roi",
        title: "Underdog ROI",
        sampleSize: underdogRows.length,
        hitRate: getHitRate(underdogRows),
        roi: getHistoricalRoi(underdogRows),
        note: underdogRows.length
          ? "Underdog ROI comes from the lower-implied-probability side in matched market pairs."
          : "No underdog-tagged historical rows match this query yet.",
        tone: "premium",
        window: filters.window
      }),
      createCard({
        id: "clv-trend",
        title: "CLV trend",
        sampleSize: clvBets.length,
        hitRate: null,
        roi: null,
        value: clvBets.length ? `${formatSigned(avgClv, 2)}%` : "Unavailable",
        note: clvBets.length
          ? `Average closing-line value across ${clvBets.length} settled bet${clvBets.length === 1 ? "" : "s"} with closing context.`
          : "CLV remains unavailable until closing inputs exist in the ledger or harvested close maps to the ticket.",
        href: clvBets.length ? "/performance" : null,
        window: filters.window
      }),
      createCard({
        id: "line-movement",
        title: "Line movement",
        sampleSize: pointMovementRows.length,
        hitRate: null,
        roi: null,
        value: pointMovementRows.length
          ? `${formatSigned(
              average(pointMovementRows.map((row) => Math.abs(row.movementValue ?? 0))),
              1
            )} avg`
          : "No sample",
        note: pointMovementRows.length
          ? "Average absolute point move from opening to latest stored snapshot across the current query."
          : "No harvested market history matches this query yet.",
        href:
          pointMovementRows[0]?.eventExternalId
            ? buildMatchupHref(pointMovementRows[0].league, pointMovementRows[0].eventExternalId)
            : null,
        tone: "brand",
        window: filters.window
      }),
      createCard({
        id: "market-hit-rate",
        title:
          filters.market === "ALL"
            ? "Market-type hit rate"
            : `${getMarketLabel(filters.market)} hit rate`,
        sampleSize: filteredMarketRows.length || settledBets.length,
        hitRate: filteredMarketRows.length
          ? getHitRate(filteredMarketRows)
          : getHitRate(settledBets.map((bet) => ({ outcome: bet.result }))),
        roi: filteredMarketRows.length ? getHistoricalRoi(filteredMarketRows) : getBetRoi(settledBets),
        note:
          filters.market === "ALL"
            ? "Reads from the full matched market or settled-bet sample."
            : `Current query narrowed to ${getMarketLabel(filters.market)}.`,
        window: filters.window
      }),
      createCard({
        id: "recent-form",
        title: "Recent form",
        sampleSize: recentSubjectRows.length,
        hitRate: recentSubjectRows.length
          ? Number(((recentWins / recentSubjectRows.length) * 100).toFixed(1))
          : null,
        roi: null,
        value: activeSubject
          ? recentSubjectRows.length
            ? `${recentWins}-${recentSubjectRows.length - recentWins}`
            : "No sample"
          : "Filter needed",
        note: activeSubject
          ? `Stored final results for ${activeSubject} only. Sparse history stays labeled.`
          : "Add a team, player, or fighter filter to run a real recent-form query.",
        href:
          activeSubject
            ? `/trends?league=${filters.league}&subject=${encodeURIComponent(activeSubject)}`
            : null,
        tone: activeSubject ? "success" : "muted",
        window: filters.window
      })
    ];

    const cards = backtestedCards.length ? backtestedCards : fallbackCards;

    const movementRows = historicalRows
      .filter((row) => typeof row.movementValue === "number")
      .sort(
        (left, right) => Math.abs(right.movementValue ?? 0) - Math.abs(left.movementValue ?? 0)
      )
      .slice(0, 10)
      .map((row) => ({
        label: `${row.eventLabel} | ${getMarketLabel(row.marketType) ?? row.marketLabel}`,
        movement: `${formatSigned(row.movementValue ?? 0, row.movementUnit === "pts" ? 1 : 0)} ${row.movementUnit}`,
        note: `${row.marketLabel} | ${row.sportsbookName} | ${row.outcome === "UNAVAILABLE" ? "Result pending" : row.outcome}`,
        href: row.eventExternalId ? buildMatchupHref(row.league, row.eventExternalId) : null
      }));

    const segmentRows = [
      ...new Map(
        historicalRows.map((row) => [
          `market:${row.marketType}`,
          {
            label: `MARKET | ${row.marketType}`,
            rows: historicalRows.filter((entry) => entry.marketType === row.marketType)
          }
        ])
      ).values()
    ]
      .filter((entry) => entry.rows.length >= filters.sample)
      .map((entry) => ({
        label: entry.label,
        movement: `${(getHistoricalRoi(entry.rows) ?? 0) > 0 ? "+" : ""}${(getHistoricalRoi(entry.rows) ?? 0).toFixed(1)}% ROI`,
        note: `${entry.rows.length} historical row${entry.rows.length === 1 ? "" : "s"}`
      }));

    const sampleNote =
      !historicalRows.length && !settledBets.length
        ? "No stored historical rows match this query yet. Widen the sport, market, or date window to pull a larger real sample."
        : historicalRows.length < filters.sample && settledBets.length < filters.sample
          ? `This query is running on a sparse real sample (${historicalRows.length} historical rows, ${settledBets.length} settled bet${settledBets.length === 1 ? "" : "s"}). SharkEdge is showing the actual depth instead of faking confidence.`
          : null;

    return {
      filters,
      cards,
      metrics: [
        {
          label: "Sample Size",
          value: `${Math.max(historicalRows.length, settledBets.length)}`,
          note: "Historical market rows or settled bets currently matching this query."
        },
        {
          label: "Tracked Markets",
          value: `${new Set(historicalRows.map((row) => `${row.league}:${row.marketType}:${row.marketLabel}`)).size}`,
          note: "Distinct stored markets linked to this query."
        },
        {
          label: "Tracked CLV Bets",
          value: `${clvBets.length}`,
          note: "Settled tickets with closing context available."
        },
        {
          label: "Date Range",
          value: formatDateWindow(filters.window),
          note: buildQuerySummary(filters)
        }
      ],
      insights: [
        {
          id: "largest-line-move",
          title: "Largest line move",
          value: movementRows[0]?.movement ?? "No data",
          note: movementRows[0]?.label ?? "No harvested movement rows match this query yet.",
          tone: movementRows[0] ? "brand" : "muted"
        },
        {
          id: "average-clv",
          title: "Average CLV",
          value: clvBets.length ? `${formatSigned(avgClv, 2)}%` : "Unavailable",
          note: clvBets.length
            ? `${clvBets.length} settled bet${clvBets.length === 1 ? "" : "s"} with stored closing context.`
            : "Closing-line value stays unavailable until closing inputs are stored.",
          tone: clvBets.length && avgClv > 0 ? "success" : "muted"
        },
        {
          id: "best-card",
          title: "Strongest angle",
          value: cards.find((card) => card.roi)?.title ?? "No data",
          note: "Real trend cards only. Sparse samples stay labeled instead of being inflated.",
          tone: cards.find((card) => card.roi) ? "premium" : "muted"
        },
        {
          id: "query-context",
          title: "Query context",
          value: filters.league !== "ALL" ? filters.league : SPORT_LABELS[filters.sport],
          note:
            filters.market !== "ALL"
              ? `Focused on ${getMarketLabel(filters.market)}.`
              : "Reading across all stored market types in the current filter set.",
          tone: "premium"
        }
      ],
      movementRows,
      segmentRows,
      sourceNote:
        "Trend cards are powered by harvested historical odds snapshots, normalized event results, and persisted settled bets. Small samples stay labeled instead of being inflated into fake certainty.",
      sampleNote,
      querySummary: buildQuerySummary(filters),
      savedTrendName: buildQuerySummary(filters),
      setup: null
    };
  } catch (error) {
    return {
      filters,
      cards: [],
      metrics: [],
      insights: [],
      movementRows: [],
      segmentRows: [],
      sourceNote:
        "Trend cards stay blank until historical odds, normalized event results, and ledger rows exist in the database.",
      sampleNote: null,
      querySummary: buildQuerySummary(filters),
      savedTrendName: buildQuerySummary(filters),
      setup: buildTrendSetupState(error)
    };
  }
}

function savedTrendMatchesParticipants(filters: TrendFilters, participantNames: string[]) {
  const names = participantNames.map((name) => normalizeText(name));
  const activeSubject = normalizeText(getActiveSubject(filters));

  if (activeSubject && !names.some((name) => name.includes(activeSubject))) {
    return false;
  }

  if (filters.opponent && !names.some((name) => name.includes(normalizeText(filters.opponent)))) {
    return false;
  }

  return true;
}

async function getSavedSystemsForDashboard(): Promise<SavedTrendSystemView[]> {
  const rows = await listSavedTrendRows();

  return Promise.all(
    rows.map(async (row) => {
      const result = await getTrendQueryResult(row.filters);
      const matches = row.archivedAt ? { matches: [] } : await getTodayTrendMatches(row.filters);
      const leadCard =
        result.cards.find((card) => card.roi || card.hitRate) ?? result.cards[0] ?? null;

      return {
        id: row.id,
        name: row.name,
        sport: row.sport,
        filters: row.filters,
        aiQuery: row.aiQuery,
        mode: row.mode,
        archivedAt: row.archivedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lastRunAt: row.lastRunAt,
        currentMatchCount: matches.matches.length,
        sampleSize: leadCard?.sampleSize ?? null,
        roi: leadCard?.roi ?? null,
        hitRate: leadCard?.hitRate ?? null,
        href: buildSavedTrendHref(row.id, row.filters, row.mode, row.aiQuery)
      } satisfies SavedTrendSystemView;
    })
  );
}

async function getSavedSystemCountForMatchup(args: {
  leagueKey: LeagueKey;
  participantNames: string[];
}) {
  const rows = await listSavedTrendRows();
  return rows.filter(
    (row) =>
      !row.archivedAt &&
      (row.filters.league === "ALL" || row.filters.league === args.leagueKey) &&
      savedTrendMatchesParticipants(row.filters, args.participantNames)
  ).length;
}

async function getCombatContextCards(args: {
  leagueKey: LeagueKey;
  subject: string;
}): Promise<MatchupTrendCardView[]> {
  const events = await prisma.event.findMany({
    where: {
      league: {
        key: args.leagueKey
      },
      status: "FINAL",
      participants: {
        some: {
          competitor: {
            name: {
              contains: args.subject,
              mode: "insensitive"
            }
          }
        }
      }
    },
    include: {
      eventResult: true
    },
    orderBy: {
      startTime: "desc"
    },
    take: 12
  });

  if (!events.length) {
    return [];
  }

  const finishes = events.filter((event) => {
    const method = normalizeText(event.eventResult?.method ?? "");
    return method.length > 0 && !method.includes("decision");
  }).length;
  const decisions = events.filter((event) =>
    normalizeText(event.eventResult?.method ?? "").includes("decision")
  ).length;
  const rounds = events
    .map((event) => Number(event.eventResult?.period))
    .filter((value) => Number.isFinite(value)) as number[];

  return [
    {
      id: `${args.leagueKey}-finish-rate`,
      title: "Finish rate",
      value: `${((finishes / events.length) * 100).toFixed(1)}%`,
      note: `${finishes} of the last ${events.length} stored fights ended inside the distance.`,
      tone: finishes / events.length >= 0.5 ? "brand" : "muted"
    },
    {
      id: `${args.leagueKey}-decision-mix`,
      title: "Decision vs finish",
      value: `${decisions}-${finishes}`,
      note: "Decision count first, finish count second, from stored official fight results.",
      tone: "premium"
    },
    {
      id: `${args.leagueKey}-round-pattern`,
      title: "Round pattern",
      value: rounds.length ? `${average(rounds).toFixed(1)} avg rounds` : "Unavailable",
      note: rounds.length
        ? "Average official finish round from the stored fight sample."
        : "Round history is too thin to say anything honest.",
      tone: rounds.length ? "success" : "muted"
    }
  ];
}

export async function getTrendDashboard(
  rawFilters?: Partial<TrendFilters> | null,
  options?: {
    mode?: TrendMode;
    aiQuery?: string | null;
    savedTrendId?: string | null;
  }
): Promise<TrendDashboardView> {
  const aiHelper = options?.aiQuery
    ? parseTrendAiQuery(options.aiQuery, readTrendFilters(rawFilters))
    : null;
  const filters = readTrendFilters({
    ...(aiHelper?.parsedFilters ?? {}),
    ...(rawFilters ?? {})
  });
  const result = await getTrendQueryResult(filters);
  const matchResult = result.setup
    ? { matches: [], note: null }
    : await getTodayTrendMatches(result.filters);
  const savedSystems = result.setup ? [] : await getSavedSystemsForDashboard();
  const selectedSavedSystem =
    options?.savedTrendId
      ? savedSystems.find((system) => system.id === options.savedTrendId) ?? null
      : null;
  const leadCard =
    result.cards.find((card) => card.sampleSize >= result.filters.sample && (card.roi || card.hitRate)) ??
    result.cards[0] ??
    null;

  return {
    setup: result.setup,
    mode: options?.mode ?? "simple",
    aiQuery: options?.aiQuery?.trim() ?? "",
    aiHelper,
    explanation: leadCard
      ? buildTrendExplanation({
          headline: `${leadCard.title}: ${leadCard.value}`,
          sampleSize: leadCard.sampleSize,
          roi: leadCard.roi,
          hitRate: leadCard.hitRate,
          querySummary: result.querySummary,
          sampleNote: result.sampleNote
        })
      : null,
    filters: result.filters,
    cards: result.cards,
    metrics: result.metrics,
    insights: result.insights,
    movementRows: result.movementRows,
    segmentRows: result.segmentRows,
    todayMatches: matchResult.matches,
    todayMatchesNote: matchResult.note,
    savedSystems,
    savedTrendName: selectedSavedSystem?.name ?? result.savedTrendName,
    sourceNote: result.sourceNote,
    querySummary: result.querySummary,
    sampleNote: result.sampleNote
  };
}

export async function getTrendApiResponse(
  rawFilters?: Partial<TrendFilters> | null,
  options?: {
    mode?: TrendMode;
    aiQuery?: string | null;
    savedTrendId?: string | null;
  }
) {
  return getTrendDashboard(rawFilters, options);
}

export async function getMatchupTrendCards(args: {
  leagueKey: LeagueKey;
  eventLabel: string;
  eventType: "TEAM_HEAD_TO_HEAD" | "COMBAT_HEAD_TO_HEAD" | "OTHER";
  participantNames: string[];
}): Promise<MatchupTrendCardView[]> {
  if (!hasUsableServerDatabaseUrl()) return [];

  const subject = args.participantNames[0] ?? "";
  const result = await getTrendQueryResult({
    league: args.leagueKey,
    market: args.eventType === "COMBAT_HEAD_TO_HEAD" ? "fight_winner" : "spread",
    subject,
    team: args.eventType === "TEAM_HEAD_TO_HEAD" ? subject : "",
    fighter: args.eventType === "COMBAT_HEAD_TO_HEAD" ? subject : "",
    sample: 10,
    window: "365d"
  });

  const preferredIds =
    args.eventType === "TEAM_HEAD_TO_HEAD"
      ? ["ats-trend", "ou-trend", "line-movement", "recent-form"]
      : ["market-hit-rate", "recent-form", "line-movement", "clv-trend"];
  const selectedCards = preferredIds
    .map((id) => result.cards.find((card) => card.id === id))
    .filter((card): card is TrendCardView => Boolean(card));
  const cards = selectedCards.length ? selectedCards : result.cards.slice(0, 4);
  const savedSystemCount = await getSavedSystemCountForMatchup({
    leagueKey: args.leagueKey,
    participantNames: args.participantNames
  });
  const matchupCards = cards.map((card) => ({
    id: `${args.leagueKey}-${card.id}`,
    title: card.title,
    value: card.value,
    note: card.note,
    href:
      card.href ??
      `/trends?league=${args.leagueKey}&subject=${encodeURIComponent(subject)}`,
    tone: card.tone
  }));
  const combatCards =
    args.eventType === "COMBAT_HEAD_TO_HEAD"
      ? await getCombatContextCards({
          leagueKey: args.leagueKey,
          subject
        })
      : [];
  const savedSystemCard =
    savedSystemCount > 0
      ? [
          {
            id: `${args.leagueKey}-saved-systems`,
            title: "Saved systems",
            value: `${savedSystemCount}`,
            note: `${savedSystemCount} saved trend system${savedSystemCount === 1 ? "" : "s"} match this event right now.`,
            href: `/trends?league=${args.leagueKey}&subject=${encodeURIComponent(subject)}`,
            tone: "premium" as const
          }
        ]
      : [];

  return [...matchupCards, ...combatCards, ...savedSystemCard].slice(0, 5);
}

export async function getPropTrendSummaries(
  props: PropCardView[]
): Promise<Record<string, NonNullable<PropCardView["trendSummary"]>>> {
  if (!hasUsableServerDatabaseUrl() || !props.length) return {};

  const summaries: Record<string, NonNullable<PropCardView["trendSummary"]>> = {};
  const cache = new Map<string, TrendCardView | null>();

  for (const prop of props) {
    const cacheKey = `${prop.leagueKey}:${prop.team.name}:${prop.player.name}:${prop.marketType}`;
    if (!cache.has(cacheKey)) {
      const result = await getTrendQueryResult({
        league: prop.leagueKey,
        market: prop.marketType,
        team: prop.team.name,
        subject: prop.player.name,
        sample: 10,
        window: "365d"
      });
      cache.set(
        cacheKey,
        result.cards.find((card) => card.id === "recent-form") ?? result.cards[0] ?? null
      );
    }

    const card = cache.get(cacheKey);
    if (card && card.sampleSize) {
      summaries[prop.id] = {
        label: card.title,
        value: card.value,
        note: card.note,
        href:
          card.href ??
          `/trends?league=${prop.leagueKey}&team=${encodeURIComponent(prop.team.name)}&subject=${encodeURIComponent(prop.player.name)}&market=${prop.marketType}`
      };
      continue;
    }

    if (prop.analyticsSummary?.sampleSize && prop.analyticsSummary.sampleSize >= 10) {
      summaries[prop.id] = {
        label: "Prop history",
        value:
          typeof prop.analyticsSummary.hitRatePct === "number"
            ? `${prop.analyticsSummary.hitRatePct.toFixed(1)}%`
            : `${prop.analyticsSummary.sampleSize} games`,
        note: prop.analyticsSummary.reason,
        href: `/trends?league=${prop.leagueKey}&team=${encodeURIComponent(prop.team.name)}&subject=${encodeURIComponent(prop.player.name)}&market=${prop.marketType}`
      };
    }
  }

  return summaries;
}
