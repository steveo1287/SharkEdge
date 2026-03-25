import { Prisma } from "@prisma/client";

import { getServerDatabaseResolution, hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { BetIntent, LeakSignal } from "@/lib/types/bet-intelligence";
import type {
  EventOption,
  LedgerBetFormInput,
  LedgerBetResult,
  LedgerSetupState,
  LedgerBetView,
  LedgerFilterWindow,
  LedgerFilters,
  LedgerMarketType,
  LedgerPageData,
  PerformanceDashboardView,
  SportsbookOption,
  SupportedLeagueKey,
  SupportedSportCode
} from "@/lib/types/ledger";
import {
  BET_RESULTS,
  LEAGUE_KEYS,
  LEDGER_MARKET_TYPES,
  SPORT_CODES
} from "@/lib/types/ledger";
import {
  decodeBetIntent
} from "@/lib/utils/bet-intelligence";
import {
  calculateAverageClv,
  calculateLedgerAverageOdds,
  calculateLedgerAverageStake,
  calculateLedgerNetUnits,
  calculateLedgerRoi,
  calculateLedgerWinRate,
  buildBreakdownRows,
  formatRecordString
} from "@/lib/utils/ledger-metrics";
import {
  calculateBetToWin,
  calculateLegClv,
  calculateParlayOddsDecimal,
  calculateParlayToWin,
  decimalToAmerican,
  formatLedgerMarketType,
  formatEventLabelFromParticipants,
  LEAGUE_LABELS,
  LEAGUE_SPORT_MAP,
  MARKET_LABELS,
  SPORT_LABELS
} from "@/lib/utils/ledger";
import { ledgerBetFormSchema, ledgerFiltersSchema } from "@/lib/validation/ledger";
import { getPropById } from "@/services/odds/odds-service";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import {
  buildSweatBoardItem,
  getLedgerEventOptions,
  refreshTrackedEventsForOpenBets,
  syncSupportedEventCatalog
} from "@/services/events/event-service";

const DEFAULT_USER_ID = "user_demo";

const betInclude = {
  sportsbook: true,
  event: {
    include: {
      league: {
        select: {
          key: true
        }
      },
      participants: {
        orderBy: {
          sortOrder: "asc"
        },
        include: {
          competitor: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
              type: true
            }
          }
        }
      }
    }
  },
  legs: {
    orderBy: {
      sortOrder: "asc"
    },
    include: {
      sportsbook: true,
      event: {
        include: {
          league: {
            select: {
              key: true
            }
          },
          participants: {
            orderBy: {
              sortOrder: "asc"
            },
            include: {
              competitor: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                  type: true
                }
              }
            }
          }
        }
      }
    }
  }
} satisfies Prisma.BetInclude;

type BetWithRelations = Prisma.BetGetPayload<{
  include: typeof betInclude;
}>;

function toJsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function mapSportsbookOption(book: {
  id: string;
  key: string;
  name: string;
  region: string;
  logoUrl: string | null;
}): SportsbookOption {
  return {
    id: book.id,
    key: book.key,
    name: book.name,
    region: book.region,
    logoUrl: book.logoUrl
  };
}

function mapEventParticipants(
  participants: Array<{
    id: string;
    role: string;
    sortOrder: number;
    score: string | null;
    record: string | null;
    isWinner: boolean | null;
    competitor: {
      id: string;
      name: string;
      abbreviation: string | null;
      type: string;
    };
  }>
) {
  return participants.map((participant) => ({
    id: participant.id,
    competitorId: participant.competitor.id,
    role: participant.role as EventOption["participants"][number]["role"],
    sortOrder: participant.sortOrder,
    name: participant.competitor.name,
    abbreviation: participant.competitor.abbreviation,
    type: participant.competitor.type as EventOption["participants"][number]["type"],
    score: participant.score,
    record: participant.record,
    isWinner: participant.isWinner
  }));
}

function mapBetView(bet: BetWithRelations): LedgerBetView {
  const rawContext = (bet.contextJson as { legContexts?: Array<LedgerBetView["context"] | null> } & LedgerBetView["context"]) ?? null;
  const betContext =
    rawContext && typeof rawContext === "object" && "sourcePage" in rawContext
      ? (rawContext as LedgerBetView["context"])
      : null;
  const eventLabel = bet.event
    ? formatEventLabelFromParticipants(mapEventParticipants(bet.event.participants))
    : bet.legs[0]?.event
      ? formatEventLabelFromParticipants(mapEventParticipants(bet.legs[0].event.participants))
      : null;

  return {
    id: bet.id,
    placedAt: bet.placedAt.toISOString(),
    settledAt: bet.settledAt?.toISOString() ?? null,
    source: bet.source,
    betType: bet.betType,
    sport: bet.sport as SupportedSportCode,
    league: bet.league as SupportedLeagueKey,
    eventId: bet.eventId,
    eventLabel,
    marketType: bet.marketType as LedgerMarketType,
    marketLabel: bet.marketLabel,
    selection: bet.selection,
    side: bet.side,
    line: bet.line,
    oddsAmerican: bet.oddsAmerican,
    oddsDecimal: bet.oddsDecimal,
    stake: bet.stake,
    riskAmount: bet.riskAmount,
    toWin: bet.toWin,
    payout: bet.payout,
    result: bet.result as LedgerBetResult,
    sportsbook: bet.sportsbook ? mapSportsbookOption(bet.sportsbook) : null,
    notes: bet.notes ?? "",
    tags: Array.isArray(bet.tagsJson) ? bet.tagsJson.map((tag) => String(tag)) : [],
    isLive: bet.isLive,
    archivedAt: bet.archivedAt?.toISOString() ?? null,
    closingLine: bet.closingLine,
    closingOddsAmerican: bet.closingOddsAmerican,
    closingOddsDecimal: bet.closingOddsDecimal,
    clvValue: bet.clvValue,
    clvPercentage: bet.clvPercentage,
    eventStartTime: bet.event?.startTime?.toISOString() ?? null,
    context: betContext,
    legs: bet.legs.map((leg, index) => ({
      id: leg.id,
      eventId: leg.eventId,
      eventLabel: leg.event
        ? formatEventLabelFromParticipants(mapEventParticipants(leg.event.participants))
        : null,
      leagueKey: ((leg.event?.league.key as SupportedLeagueKey | undefined) ?? bet.league) as SupportedLeagueKey,
      marketType: leg.marketType as LedgerMarketType,
      marketLabel: leg.marketLabel,
      selection: leg.selection,
      side: leg.side,
      line: leg.line,
      oddsAmerican: leg.oddsAmerican,
      oddsDecimal: leg.oddsDecimal,
      result: leg.result as LedgerBetResult,
      sportsbook: leg.sportsbook ? mapSportsbookOption(leg.sportsbook) : null,
      closingLine: leg.closingLine,
      closingOddsAmerican: leg.closingOddsAmerican,
      clvValue: leg.clvValue,
      clvPercentage: leg.clvPercentage,
      eventStatus: (leg.event?.status as LedgerBetView["legs"][number]["eventStatus"]) ?? null,
      context: rawContext?.legContexts?.[index] ?? betContext
    }))
  };
}

function getWindowStart(window: LedgerFilterWindow) {
  const now = new Date();

  switch (window) {
    case "today":
      now.setHours(0, 0, 0, 0);
      return now;
    case "7d":
      return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

function buildWhere(filters: LedgerFilters): Prisma.BetWhereInput {
  const where: Prisma.BetWhereInput = {
    archivedAt: null
  };

  if (filters.status === "OPEN") {
    where.result = "OPEN";
  } else if (filters.status === "SETTLED") {
    where.result = {
      not: "OPEN"
    };
  } else if (BET_RESULTS.includes(filters.status as LedgerBetResult)) {
    where.result = filters.status as LedgerBetResult;
  }

  if (filters.sport !== "ALL") {
    where.sport = filters.sport;
  }

  if (filters.league !== "ALL") {
    where.league = filters.league;
  }

  if (filters.market !== "ALL") {
    where.marketType = filters.market;
  }

  if (filters.sportsbook !== "all") {
    where.sportsbook = {
      key: filters.sportsbook
    };
  }

  const windowStart = getWindowStart(filters.window);
  if (windowStart) {
    where.placedAt = {
      gte: windowStart
    };
  }

  return where;
}

function sortBets(bets: LedgerBetView[], filters: LedgerFilters) {
  const direction = filters.direction === "asc" ? 1 : -1;

  return [...bets].sort((left, right) => {
    if (filters.sort === "stake") {
      return direction * (left.riskAmount - right.riskAmount);
    }

    if (filters.sort === "result") {
      return direction * left.result.localeCompare(right.result);
    }

    if (filters.sort === "clv") {
      return direction * ((left.clvPercentage ?? -999) - (right.clvPercentage ?? -999));
    }

    return direction * left.placedAt.localeCompare(right.placedAt);
  });
}

function buildEmptySummary() {
  return {
    record: "0-0-0",
    winRate: 0,
    roi: 0,
    netUnits: 0,
    averageOdds: 0,
    averageStake: 0,
    totalBets: 0,
    openBets: 0,
    settledBets: 0,
    trackedClvBets: 0,
    averageClv: null,
    averageEv: null
  };
}

function getStaticLeagueOptions() {
  return LEAGUE_KEYS.map((leagueKey) => ({
    key: leagueKey,
    label: LEAGUE_LABELS[leagueKey] ?? leagueKey,
    sportCode: LEAGUE_SPORT_MAP[leagueKey]
  }));
}

function getSetupErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String(error.code);
  }

  return null;
}

function getSetupErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown ledger service error.";
}

function buildLedgerSetupState(error?: unknown): LedgerSetupState {
  const message = getSetupErrorMessage(error);
  const code = getSetupErrorCode(error);
  const resolution = getServerDatabaseResolution();

  if (!hasUsableServerDatabaseUrl()) {
    return {
      status: "blocked",
      title: "Ledger database is not configured",
      detail:
        "The Phase 1.5 ledger UI is live, but this server runtime does not have a usable database URL yet. Bets, active tracking, and performance can render only after the server can reach Postgres.",
      steps: [
        "Set one of DATABASE_URL, POSTGRES_PRISMA_URL, or POSTGRES_URL in the server runtime.",
        "Run npx prisma migrate deploy against that database.",
        "Run npm run prisma:seed once to load the starter ledger data."
      ]
    };
  }

  if (code === "P2021" || code === "P2022" || /does not exist|no such table|relation .* does not exist/i.test(message)) {
    return {
      status: "blocked",
      title: "Ledger tables are missing in the database",
      detail:
        "The app can reach Postgres, but the Phase 1.5 Prisma migration has not been applied yet. Until that happens, the ledger and performance pages stay in setup mode instead of falling back to the old shell.",
      steps: [
        "Run npx prisma migrate deploy.",
        "Run npm run prisma:seed to load the starter sportsbook, event, and bet rows.",
        "Redeploy the frontend after the migration completes."
      ]
    };
  }

  if (code === "P1001" || /can't reach database server|connect|connection/i.test(message)) {
    return {
      status: "blocked",
      title: "Ledger database is unreachable",
      detail:
        "The frontend is pointed at a Postgres database, but Prisma cannot reach it from this runtime. The UI is intentionally showing a setup-blocked state rather than pretending the ledger is empty.",
      steps: [
        `Verify ${resolution.key ?? "the configured database URL"} points to the correct Postgres host.`,
        "Confirm the database accepts connections from the deployment environment.",
        "Redeploy once the connection test succeeds."
      ]
    };
  }

  return {
    status: "blocked",
    title: "Ledger services are unavailable",
    detail:
      "The Phase 1.5 ledger code is present, but the runtime could not initialize the database-backed ledger services cleanly.",
    steps: [
      "Check the deployment logs for the underlying Prisma error.",
      "Verify the server DB URL and the Phase 1.5 migration are both in place.",
      `Latest error: ${message}`
    ]
  };
}

function buildEmptyLedgerPage(
  filters: LedgerFilters,
  prefill: LedgerBetFormInput | null,
  setup: LedgerSetupState
): LedgerPageData {
  return {
    setup,
    filters,
    summary: buildEmptySummary(),
    bets: [],
    openBets: [],
    settledBets: [],
    sweatBoard: [],
    sports: SPORT_CODES.filter((sport) => sport !== "OTHER").map((sport) => ({
      code: sport,
      label: SPORT_LABELS[sport]
    })),
    leagues: getStaticLeagueOptions(),
    sportsbooks: [],
    events: [],
    marketOptions: [...LEDGER_MARKET_TYPES].map((value) => ({
      value,
      label: MARKET_LABELS[value]
    })),
    lastUpdatedAt: null,
    liveNotes: [
      "Ledger reads are blocked until Postgres is configured and migrated. Live event sync will populate once the database-backed ledger is available."
    ],
    prefill
  };
}

function buildEmptyPerformanceDashboard(setup: LedgerSetupState): PerformanceDashboardView {
  return {
    setup,
    summary: buildEmptySummary(),
    bySport: [],
    byLeague: [],
    byMarket: [],
    bySportsbook: [],
    byDayOfWeek: [],
    byTiming: [],
    byWeek: [],
    byMonth: [],
    trend: [],
    recentForm: [],
    bestSegments: [],
    worstSegments: [],
    leakSignals: []
  };
}

function assertLedgerWritesAvailable() {
  if (!hasUsableServerDatabaseUrl()) {
    throw new Error(
      "Ledger database is not configured. Set DATABASE_URL, POSTGRES_PRISMA_URL, or POSTGRES_URL and apply the Prisma migration before creating or editing bets."
    );
  }
}

async function ensureDefaultUser() {
  await prisma.user.upsert({
    where: {
      id: DEFAULT_USER_ID
    },
    update: {},
    create: {
      id: DEFAULT_USER_ID,
      username: "demo_bettor",
      bankrollSettingsJson: {
        unitSize: 100,
        bankroll: 5000
      }
    }
  });
}

async function getBooks() {
  const books = await prisma.sportsbook.findMany({
    where: {
      isActive: true
    },
    orderBy: {
      name: "asc"
    }
  });

  return books.map(mapSportsbookOption);
}

async function getLeagueOptions() {
  return getStaticLeagueOptions();
}

async function getSportOptions() {
  return SPORT_CODES.filter((sport) => sport !== "OTHER").map((sport) => ({
    code: sport,
    label: SPORT_LABELS[sport]
  }));
}

async function getBets(filters: LedgerFilters) {
  return prisma.bet.findMany({
    where: buildWhere(filters),
    include: betInclude,
    orderBy: {
      placedAt: "desc"
    }
  });
}

function buildSummary(bets: LedgerBetView[]) {
  const settled = bets.filter((bet) => bet.result !== "OPEN");
  const results = settled.map((bet) => bet.result);
  const trackedEv = bets.filter((bet) => typeof bet.context?.expectedValuePct === "number");

  return {
    record: formatRecordString(results),
    winRate: calculateLedgerWinRate(results),
    roi: calculateLedgerRoi(settled),
    netUnits: calculateLedgerNetUnits(settled),
    averageOdds: calculateLedgerAverageOdds(settled),
    averageStake: calculateLedgerAverageStake(bets),
    totalBets: bets.length,
    openBets: bets.filter((bet) => bet.result === "OPEN").length,
    settledBets: settled.length,
    trackedClvBets: bets.filter((bet) => typeof bet.clvPercentage === "number").length,
    averageClv: calculateAverageClv(bets),
    averageEv: trackedEv.length
      ? Number(
          (
            trackedEv.reduce(
              (total, bet) => total + (bet.context?.expectedValuePct ?? 0),
              0
            ) / trackedEv.length
          ).toFixed(2)
        )
      : null
  };
}

function toDayOfWeekLabel(dateString: string) {
  return new Date(dateString).toLocaleString("en-US", {
    weekday: "short",
    timeZone: "UTC"
  });
}

function getBetTimingLabel(bet: LedgerBetView) {
  if (bet.isLive) {
    return "Live";
  }

  if (!bet.eventStartTime) {
    return "Unlinked";
  }

  const deltaMinutes =
    (new Date(bet.eventStartTime).getTime() - new Date(bet.placedAt).getTime()) / 60000;

  if (deltaMinutes <= 120) {
    return "Late";
  }

  if (deltaMinutes <= 1440) {
    return "Same Day";
  }

  return "Early";
}

function buildLeakSignals(args: {
  byMarket: PerformanceDashboardView["byMarket"];
  bySportsbook: PerformanceDashboardView["bySportsbook"];
  byTiming: PerformanceDashboardView["byTiming"];
  settled: LedgerBetView[];
}): LeakSignal[] {
  const signals: LeakSignal[] = [];

  for (const row of args.byMarket) {
    if (row.bets >= 10 && row.roi < 0) {
      signals.push({
        id: `market-${row.label}`,
        title: `${row.label} is leaking`,
        detail: `${row.label} is down ${Math.abs(row.roi).toFixed(1)}% ROI over ${row.bets} settled bets.`,
        sampleSize: row.bets,
        severity: "danger"
      });
    }
  }

  for (const row of args.bySportsbook) {
    if (row.bets >= 10 && row.roi < 0) {
      signals.push({
        id: `sportsbook-${row.label}`,
        title: `${row.label} underperforms`,
        detail: `${row.label} has ${row.roi.toFixed(1)}% ROI over ${row.bets} bets. Re-check whether this is a weak price source for you.`,
        sampleSize: row.bets,
        severity: "premium"
      });
    }
  }

  const late = args.byTiming.find((row) => row.label === "Late");
  if (late && late.bets >= 10 && late.roi < 0) {
    signals.push({
      id: "timing-late",
      title: "Late entries are underperforming",
      detail: `Late bets are returning ${late.roi.toFixed(1)}% ROI across ${late.bets} settled entries.`,
      sampleSize: late.bets,
      severity: "danger"
    });
  }

  const trackedClv = args.settled.filter((bet) => typeof bet.clvPercentage === "number");
  if (trackedClv.length >= 10) {
    const averageClv =
      trackedClv.reduce((total, bet) => total + (bet.clvPercentage ?? 0), 0) / trackedClv.length;

    if (averageClv < 0) {
      signals.push({
        id: "clv-negative",
        title: "Average CLV is negative",
        detail: `Tracked closing-line value is ${averageClv.toFixed(2)}% across ${trackedClv.length} bets. Price entry timing needs work.`,
        sampleSize: trackedClv.length,
        severity: "danger"
      });
    }
  }

  return signals.slice(0, 6);
}

function toWeekLabel(dateString: string) {
  const date = new Date(dateString);
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((copy.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${copy.getUTCFullYear()} W${String(week).padStart(2, "0")}`;
}

function toMonthLabel(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
}

function buildPerformanceDashboardData(bets: LedgerBetView[]): PerformanceDashboardView {
  const settled = bets.filter((bet) => bet.result !== "OPEN");
  const trend = settled
    .slice()
    .sort((left, right) => left.placedAt.localeCompare(right.placedAt))
    .map((bet) => ({
      label: bet.placedAt.slice(5, 10),
      units:
        bet.result === "WIN"
          ? bet.toWin
          : bet.result === "LOSS"
            ? -bet.riskAmount
            : bet.result === "CASHED_OUT"
              ? (bet.payout ?? bet.riskAmount) - bet.riskAmount
              : 0
    }));

  const recentSlices = [7, 14, 30]
    .map((size) => settled.slice(-size))
    .filter((slice) => slice.length)
    .map((slice) => ({
      label: `Last ${slice.length}`,
      record: formatRecordString(slice.map((bet) => bet.result)),
      units: calculateLedgerNetUnits(slice)
    }));

  const bySport = buildBreakdownRows(settled, (bet) => SPORT_LABELS[bet.sport]);
  const byLeague = buildBreakdownRows(settled, (bet) => bet.league);
  const byMarket = buildBreakdownRows(settled, (bet) => formatLedgerMarketType(bet.marketType));
  const bySportsbook = buildBreakdownRows(settled, (bet) => bet.sportsbook?.name ?? "No book");
  const byDayOfWeek = buildBreakdownRows(settled, (bet) => toDayOfWeekLabel(bet.placedAt));
  const byTiming = buildBreakdownRows(settled, (bet) => getBetTimingLabel(bet));
  const byWeek = buildBreakdownRows(settled, (bet) => toWeekLabel(bet.placedAt));
  const byMonth = buildBreakdownRows(settled, (bet) => toMonthLabel(bet.placedAt));

  const rankedSegments = [...byMarket, ...bySportsbook, ...bySport].sort(
    (left, right) => right.units - left.units
  );

  return {
    setup: null,
    summary: buildSummary(bets),
    bySport,
    byLeague,
    byMarket,
    bySportsbook,
    byDayOfWeek,
    byTiming,
    byWeek,
    byMonth,
    trend,
    recentForm: recentSlices,
    bestSegments: rankedSegments.slice(0, 3).map(
      (row) => `${row.label}: ${row.units > 0 ? "+" : ""}${row.units.toFixed(2)}u, ${row.winRate.toFixed(1)}% win rate`
    ),
    worstSegments: rankedSegments
      .slice()
      .reverse()
      .slice(0, 3)
      .map(
        (row) => `${row.label}: ${row.units > 0 ? "+" : ""}${row.units.toFixed(2)}u, ${row.roi.toFixed(1)}% ROI`
      ),
    leakSignals: buildLeakSignals({
      byMarket,
      bySportsbook,
      byTiming,
      settled
    })
  };
}

function mapPrefillFromProp(prop: Awaited<ReturnType<typeof getPropById>>) {
  if (!prop) {
    return null;
  }

  return {
    placedAt: new Date().toISOString().slice(0, 16),
    source: "MANUAL",
    betType: "STRAIGHT",
    sport: "BASKETBALL",
    league: prop.leagueKey,
    eventId: null,
    sportsbookId: null,
    status: "OPEN",
    stake: 1,
    notes: prop.gameLabel
      ? `Logged from ${prop.gameLabel}`
      : `${prop.player.name} ${formatLedgerMarketType(prop.marketType as LedgerMarketType)}`,
    tags: "props,quick-log",
    isLive: false,
    context: {
      sourcePage: "props",
      sourceLabel: "Props Explorer",
      sourcePath: "/props",
      eventLabel:
        prop.gameLabel ?? `${prop.team.abbreviation} vs ${prop.opponent.abbreviation}`,
      matchupHref: prop.gameHref ?? `/game/${prop.gameId}`,
      externalEventId: prop.gameId,
      sportsbookKey: prop.sportsbook.key,
      sportsbookName: prop.bestAvailableSportsbookName ?? prop.sportsbook.name,
      supportStatus: prop.supportStatus ?? null,
      supportNote: prop.supportNote ?? null,
      marketDeltaAmerican: prop.marketDeltaAmerican ?? null,
      expectedValuePct: prop.expectedValuePct ?? null,
      edgeScore: prop.edgeScore.score,
      edgeLabel: prop.edgeScore.label,
      confidenceTier: null,
      valueFlag: prop.valueFlag ?? null,
      capturedAt: new Date().toISOString()
    },
    legs: [
      {
        eventId: null,
        sportsbookId: null,
        marketType: prop.marketType as LedgerMarketType,
        marketLabel: formatLedgerMarketType(prop.marketType as LedgerMarketType),
        selection: `${prop.player.name} ${prop.side} ${prop.line}`,
        side: prop.side,
        line: prop.line,
        oddsAmerican: prop.bestAvailableOddsAmerican ?? prop.oddsAmerican,
        closingLine: null,
        closingOddsAmerican: null,
        notes: "",
        context: {
          sourcePage: "props",
          sourceLabel: "Props Explorer",
          sourcePath: "/props",
          eventLabel:
            prop.gameLabel ?? `${prop.team.abbreviation} vs ${prop.opponent.abbreviation}`,
          matchupHref: prop.gameHref ?? `/game/${prop.gameId}`,
          externalEventId: prop.gameId,
          sportsbookKey: prop.sportsbook.key,
          sportsbookName: prop.bestAvailableSportsbookName ?? prop.sportsbook.name,
          supportStatus: prop.supportStatus ?? null,
          supportNote: prop.supportNote ?? null,
          marketDeltaAmerican: prop.marketDeltaAmerican ?? null,
          expectedValuePct: prop.expectedValuePct ?? null,
          edgeScore: prop.edgeScore.score,
          edgeLabel: prop.edgeScore.label,
          confidenceTier: null,
          valueFlag: prop.valueFlag ?? null,
          capturedAt: new Date().toISOString()
        }
      }
    ]
  } satisfies LedgerBetFormInput;
}

async function resolveLinkedEventId(
  league: SupportedLeagueKey,
  externalEventId: string | null | undefined,
  matchupHref: string | null | undefined
) {
  if (externalEventId) {
    const event = await prisma.event.findFirst({
      where: {
        externalEventId,
        league: {
          key: league
        }
      },
      select: {
        id: true
      }
    });

    if (event?.id) {
      return event.id;
    }
  }

  if (matchupHref?.includes("/game/")) {
    const routeId = matchupHref.split("/game/")[1] ?? null;
    if (routeId) {
      const detail = await getMatchupDetail(routeId);
      if (detail?.externalEventId) {
        const matchedEvent = await prisma.event.findFirst({
          where: {
            externalEventId: detail.externalEventId,
            league: {
              key: league
            }
          },
          select: {
            id: true
          }
        });

        return matchedEvent?.id ?? null;
      }
    }
  }

  return null;
}

function resolveSportsbookIdFromContext(
  books: SportsbookOption[],
  sportsbookKey: string | null | undefined,
  sportsbookName: string | null | undefined
) {
  return (
    books.find((book) => book.key === sportsbookKey)?.id ??
    books.find((book) => book.name === sportsbookName)?.id ??
    null
  );
}

async function mapPrefillFromIntent(
  intent: BetIntent,
  books: SportsbookOption[]
): Promise<LedgerBetFormInput> {
  const linkedEventId =
    intent.eventId ??
    (await resolveLinkedEventId(
      intent.league,
      intent.externalEventId ?? intent.legs[0]?.externalEventId ?? null,
      intent.matchupHref ?? intent.context?.matchupHref ?? null
    ));
  const sportsbookId = resolveSportsbookIdFromContext(
    books,
    intent.sportsbookKey ?? intent.context?.sportsbookKey,
    intent.sportsbookName ?? intent.context?.sportsbookName
  );
  const eventLinkNote = linkedEventId
    ? ""
    : " Event link is not available yet for this ticket, so live sync and auto-grading may require a manual relink.";

  return {
    placedAt: new Date().toISOString().slice(0, 16),
    source: intent.source,
    betType: intent.betType,
    sport: intent.sport,
    league: intent.league,
    eventId: linkedEventId,
    sportsbookId,
    status: "OPEN",
    stake: 1,
    notes: `${intent.notes ?? `Logged from ${intent.context?.sourceLabel ?? "SharkEdge"}.`}${eventLinkNote}`.trim(),
    tags: Array.from(new Set([...(intent.tags ?? []), "phase4"])).join(", "),
    isLive: intent.isLive,
    context: intent.context ?? null,
    legs: intent.legs.map((leg) => ({
      eventId: linkedEventId,
      sportsbookId:
        resolveSportsbookIdFromContext(
          books,
          leg.sportsbookKey ?? intent.sportsbookKey ?? intent.context?.sportsbookKey,
          leg.sportsbookName ?? intent.sportsbookName ?? intent.context?.sportsbookName
        ) ?? sportsbookId,
      marketType: leg.marketType,
      marketLabel: leg.marketLabel,
      selection: leg.selection,
      side: leg.side ?? null,
      line: leg.line ?? null,
      oddsAmerican: leg.oddsAmerican,
      closingLine: null,
      closingOddsAmerican: null,
      notes: leg.notes ?? "",
      context: leg.context ?? intent.context ?? null
    }))
  };
}

export function parseBetFilters(searchParams: Record<string, string | string[] | undefined>) {
  return ledgerFiltersSchema.parse({
    status: Array.isArray(searchParams.status) ? searchParams.status[0] : searchParams.status,
    sport: Array.isArray(searchParams.sport) ? searchParams.sport[0] : searchParams.sport,
    league: Array.isArray(searchParams.league) ? searchParams.league[0] : searchParams.league,
    market: Array.isArray(searchParams.market) ? searchParams.market[0] : searchParams.market,
    sportsbook: Array.isArray(searchParams.sportsbook)
      ? searchParams.sportsbook[0]
      : searchParams.sportsbook,
    window: Array.isArray(searchParams.window) ? searchParams.window[0] : searchParams.window,
    sort: Array.isArray(searchParams.sort) ? searchParams.sort[0] : searchParams.sort,
    direction: Array.isArray(searchParams.direction)
      ? searchParams.direction[0]
      : searchParams.direction
  }) satisfies LedgerFilters;
}

export async function getBetPrefill(
  selection: string | undefined,
  prefillParam: string | undefined,
  books: SportsbookOption[]
) {
  const decodedIntent = decodeBetIntent(prefillParam);
  if (decodedIntent) {
    return mapPrefillFromIntent(decodedIntent, books);
  }

  if (!selection) {
    return null;
  }

  const prop = await getPropById(selection);
  return mapPrefillFromProp(prop);
}

export async function getBetTrackerData(
  filters: LedgerFilters,
  selection?: string,
  prefillParam?: string
): Promise<LedgerPageData> {
  try {
    await ensureDefaultUser();
    await syncSupportedEventCatalog();
    const liveRefresh = await refreshTrackedEventsForOpenBets();
    const [books, events, leagues, sports, bets] = await Promise.all([
      getBooks(),
      getLedgerEventOptions(),
      getLeagueOptions(),
      getSportOptions(),
      getBets(filters)
    ]);
    const prefill = await getBetPrefill(selection, prefillParam, books).catch(() => null);

    const mapped = sortBets(bets.map(mapBetView), filters);
    const summary = buildSummary(mapped);
    const openBets = mapped.filter((bet) => bet.result === "OPEN");
    const settledBets = mapped.filter((bet) => bet.result !== "OPEN");

    return {
      setup: null,
      filters,
      summary,
      bets: mapped,
      openBets,
      settledBets,
      sweatBoard: openBets.map((bet) =>
        buildSweatBoardItem({
          betId: bet.id,
          label: bet.betType === "PARLAY" ? `${bet.legs.length}-leg parlay` : bet.selection,
          sport: bet.sport,
          league: bet.league,
          betType: bet.betType,
          result: bet.result,
          placedAt: bet.placedAt,
          startTime: bet.eventStartTime,
          exposure: {
            riskAmount: bet.riskAmount,
            toWin: bet.toWin,
            potentialPayout: bet.payout
          },
          event: bets.find((entry) => entry.id === bet.id)?.event
            ? {
                status: bets.find((entry) => entry.id === bet.id)?.event?.status ?? "SCHEDULED",
                lastSyncedAt: bets.find((entry) => entry.id === bet.id)?.event?.lastSyncedAt ?? null,
                stateJson:
                  (bets.find((entry) => entry.id === bet.id)?.event?.stateJson as Record<string, unknown> | null) ??
                  null,
                participants:
                  bets.find((entry) => entry.id === bet.id)?.event?.participants.map((participant) => ({
                    id: participant.id,
                    role: participant.role,
                    sortOrder: participant.sortOrder,
                    score: participant.score,
                    record: participant.record,
                    isWinner: participant.isWinner,
                    competitor: {
                      id: participant.competitor.id,
                      name: participant.competitor.name,
                      abbreviation: participant.competitor.abbreviation,
                      type: participant.competitor.type
                    }
                  })) ?? [],
                league: {
                  key: bets.find((entry) => entry.id === bet.id)?.event?.league.key ?? bet.league
                }
              }
            : null,
          legs:
            bets.find((entry) => entry.id === bet.id)?.legs.map((leg) => ({
              id: leg.id,
              marketLabel: leg.marketLabel,
              selection: leg.selection,
              result: leg.result as LedgerBetResult,
              event: leg.event
                ? {
                    id: leg.event.id,
                    status: leg.event.status,
                    participants: leg.event.participants.map((participant) => ({
                      id: participant.id,
                      role: participant.role,
                      sortOrder: participant.sortOrder,
                      score: participant.score,
                      record: participant.record,
                      isWinner: participant.isWinner,
                      competitor: {
                        id: participant.competitor.id,
                        name: participant.competitor.name,
                        abbreviation: participant.competitor.abbreviation,
                        type: participant.competitor.type
                      }
                    }))
                  }
                : null
            })) ?? []
        })
      ),
      sports,
      leagues,
      sportsbooks: books,
      events,
      marketOptions: [...LEDGER_MARKET_TYPES].map((value) => ({
        value,
        label: MARKET_LABELS[value]
      })),
      lastUpdatedAt: new Date().toISOString(),
      liveNotes: liveRefresh.liveNotes,
      prefill
    };
  } catch (error) {
    const prefill = await getBetPrefill(selection, prefillParam, []).catch(() => null);
    return buildEmptyLedgerPage(filters, prefill, buildLedgerSetupState(error));
  }
}

async function getEventById(eventId: string | null | undefined) {
  if (!eventId) {
    return null;
  }

  return prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      league: {
        select: {
          key: true
        }
      }
    }
  });
}

function normalizeLegInput(
  leg: LedgerBetFormInput["legs"][number],
  sportsbookId: string | null | undefined
) {
  const oddsDecimal = calculateParlayOddsDecimal([leg.oddsAmerican]);
  const clv = calculateLegClv(
    leg.oddsAmerican,
    leg.closingOddsAmerican ?? null,
    leg.line ?? null,
    leg.closingLine ?? null,
    leg.marketType,
    leg.selection
  );

  return {
    eventId: leg.eventId ?? null,
    sportsbookId: leg.sportsbookId ?? sportsbookId ?? null,
    marketType: leg.marketType,
    marketLabel: leg.marketLabel,
    selection: leg.selection,
    side: leg.side ?? null,
    line: leg.line ?? null,
    oddsAmerican: leg.oddsAmerican,
    oddsDecimal,
    impliedProbability: Number((1 / oddsDecimal).toFixed(4)),
    result: "OPEN" as const,
    closingLine: leg.closingLine ?? null,
    closingOddsAmerican: leg.closingOddsAmerican ?? null,
    closingOddsDecimal:
      typeof leg.closingOddsAmerican === "number"
        ? calculateParlayOddsDecimal([leg.closingOddsAmerican])
        : null,
    closingImpliedProbability:
      typeof leg.closingOddsAmerican === "number"
        ? Number((1 / calculateParlayOddsDecimal([leg.closingOddsAmerican])).toFixed(4))
        : null,
    clvValue: clv.line ?? clv.price,
    clvPercentage: clv.price,
    notes: leg.notes ?? ""
  };
}

async function buildCreatePayload(input: LedgerBetFormInput) {
  const event = await getEventById(input.eventId);
  const resolvedLeague = (event?.league.key as SupportedLeagueKey | undefined) ?? input.league;
  const resolvedSport = LEAGUE_SPORT_MAP[resolvedLeague];
  const normalizedLegs = input.legs.map((leg) => normalizeLegInput(leg, input.sportsbookId));
  const marketType =
    input.betType === "STRAIGHT" ? normalizedLegs[0].marketType : ("other" as LedgerMarketType);
  const marketLabel =
    input.betType === "STRAIGHT"
      ? normalizedLegs[0].marketLabel
      : `${normalizedLegs.length}-Leg Parlay`;
  const selection =
    input.betType === "STRAIGHT"
      ? normalizedLegs[0].selection
      : normalizedLegs.map((leg) => leg.selection).join(" / ");
  const oddsDecimal =
    input.betType === "STRAIGHT"
      ? normalizedLegs[0].oddsDecimal
      : calculateParlayOddsDecimal(normalizedLegs.map((leg) => leg.oddsAmerican));
  const oddsAmerican =
    input.betType === "STRAIGHT"
      ? normalizedLegs[0].oddsAmerican
      : decimalToAmerican(oddsDecimal);
  const toWin =
    input.betType === "STRAIGHT"
      ? calculateBetToWin(input.stake, normalizedLegs[0].oddsAmerican)
      : calculateParlayToWin(input.stake, normalizedLegs.map((leg) => leg.oddsAmerican));
  const payout = Number((input.stake + toWin).toFixed(2));
  const trackedClv = normalizedLegs.filter((leg) => typeof leg.clvPercentage === "number");

  return {
    userId: DEFAULT_USER_ID,
    placedAt: new Date(input.placedAt),
    settledAt:
      input.status !== "OPEN"
        ? input.settledAt
          ? new Date(input.settledAt)
          : new Date()
        : null,
    source: input.source,
    betType: input.betType,
    sport: resolvedSport,
    league: resolvedLeague,
    eventId: input.eventId ?? normalizedLegs[0]?.eventId ?? null,
    marketType,
    marketLabel,
    selection,
    side: input.betType === "STRAIGHT" ? normalizedLegs[0].side : null,
    line: input.betType === "STRAIGHT" ? normalizedLegs[0].line : null,
    oddsAmerican,
    oddsDecimal,
    impliedProbability: Number((1 / oddsDecimal).toFixed(4)),
    sportsbookId: input.sportsbookId ?? normalizedLegs[0]?.sportsbookId ?? null,
    stake: input.stake,
    riskAmount: input.stake,
    toWin,
    payout,
    result: input.status,
    closingLine:
      input.betType === "STRAIGHT" ? normalizedLegs[0].closingLine ?? null : null,
    closingOddsAmerican:
      input.betType === "STRAIGHT" ? normalizedLegs[0].closingOddsAmerican ?? null : null,
    closingOddsDecimal:
      input.betType === "STRAIGHT" ? normalizedLegs[0].closingOddsDecimal ?? null : null,
    closingImpliedProbability:
      input.betType === "STRAIGHT" ? normalizedLegs[0].closingImpliedProbability ?? null : null,
    clvValue:
      trackedClv.length > 0
        ? Number(
            (
              trackedClv.reduce((total, leg) => total + (leg.clvValue ?? 0), 0) / trackedClv.length
            ).toFixed(2)
          )
        : null,
    clvPercentage:
      trackedClv.length > 0
        ? Number(
            (
              trackedClv.reduce((total, leg) => total + (leg.clvPercentage ?? 0), 0) /
              trackedClv.length
            ).toFixed(2)
          )
        : null,
    notes: input.notes,
    tagsJson: input.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    contextJson:
      input.context || input.legs.some((leg) => leg.context)
        ? toJsonInput({
            ...(input.context ?? {}),
            legContexts: input.legs.map((leg) => leg.context ?? null)
          })
        : null,
    isLive: input.isLive,
    legs: normalizedLegs
  };
}

export async function createBet(input: LedgerBetFormInput) {
  assertLedgerWritesAvailable();
  await ensureDefaultUser();
  const parsed = ledgerBetFormSchema.parse(input);
  const payload = await buildCreatePayload(parsed);

  const created = await prisma.bet.create({
    data: {
      userId: payload.userId,
      placedAt: payload.placedAt,
      settledAt: payload.settledAt,
      source: payload.source,
      betType: payload.betType,
      sport: payload.sport,
      league: payload.league,
      eventId: payload.eventId,
      marketType: payload.marketType,
      marketLabel: payload.marketLabel,
      selection: payload.selection,
      side: payload.side,
      line: payload.line,
      oddsAmerican: payload.oddsAmerican,
      oddsDecimal: payload.oddsDecimal,
      impliedProbability: payload.impliedProbability,
      sportsbookId: payload.sportsbookId,
      stake: payload.stake,
      riskAmount: payload.riskAmount,
      toWin: payload.toWin,
      payout: payload.payout,
      result: payload.result,
      closingLine: payload.closingLine,
      closingOddsAmerican: payload.closingOddsAmerican,
      closingOddsDecimal: payload.closingOddsDecimal,
      closingImpliedProbability: payload.closingImpliedProbability,
      clvValue: payload.clvValue,
      clvPercentage: payload.clvPercentage,
      notes: payload.notes,
      tagsJson: payload.tagsJson,
      contextJson: payload.contextJson ?? Prisma.JsonNull,
      isLive: payload.isLive,
      legs: {
        create: payload.legs.map((leg, index) => ({
          ...leg,
          sortOrder: index,
          result: payload.result === "OPEN" ? "OPEN" : payload.result
        }))
      }
    },
    include: betInclude
  });

  return mapBetView(created);
}

export async function updateBet(id: string, input: LedgerBetFormInput) {
  assertLedgerWritesAvailable();
  await ensureDefaultUser();
  const parsed = ledgerBetFormSchema.parse({
    ...input,
    id
  });
  const payload = await buildCreatePayload(parsed);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.betLeg.deleteMany({
      where: {
        betId: id
      }
    });

    await tx.bet.update({
      where: {
        id
      },
      data: {
        placedAt: payload.placedAt,
        settledAt: payload.settledAt,
        source: payload.source,
        betType: payload.betType,
        sport: payload.sport,
        league: payload.league,
        eventId: payload.eventId,
        marketType: payload.marketType,
        marketLabel: payload.marketLabel,
        selection: payload.selection,
        side: payload.side,
        line: payload.line,
        oddsAmerican: payload.oddsAmerican,
        oddsDecimal: payload.oddsDecimal,
        impliedProbability: payload.impliedProbability,
        sportsbookId: payload.sportsbookId,
        stake: payload.stake,
        riskAmount: payload.riskAmount,
        toWin: payload.toWin,
        payout: payload.payout,
        result: payload.result,
        closingLine: payload.closingLine,
        closingOddsAmerican: payload.closingOddsAmerican,
        closingOddsDecimal: payload.closingOddsDecimal,
        closingImpliedProbability: payload.closingImpliedProbability,
        clvValue: payload.clvValue,
        clvPercentage: payload.clvPercentage,
        notes: payload.notes,
        tagsJson: payload.tagsJson,
        contextJson: payload.contextJson ?? Prisma.JsonNull,
        isLive: payload.isLive,
        legs: {
          create: payload.legs.map((leg, index) => ({
            ...leg,
            sortOrder: index,
            result: payload.result === "OPEN" ? "OPEN" : payload.result
          }))
        }
      }
    });

    return tx.bet.findUniqueOrThrow({
      where: {
        id
      },
      include: betInclude
    });
  });

  return mapBetView(updated);
}

export async function settleBet(
  id: string,
  input: {
    result: Exclude<LedgerBetResult, "OPEN">;
    settledAt?: string | null;
  }
) {
  assertLedgerWritesAvailable();

  const existing = await prisma.bet.findUniqueOrThrow({
    where: {
      id
    },
    include: {
      legs: true
    }
  });

  const settledAt = input.settledAt ? new Date(input.settledAt) : new Date();

  const updated = await prisma.$transaction(async (tx) => {
    await tx.betLeg.updateMany({
      where: {
        betId: id,
        result: "OPEN"
      },
      data: {
        result: input.result
      }
    });

    await tx.bet.update({
      where: {
        id
      },
      data: {
        result: input.result,
        settledAt,
        payout:
          input.result === "WIN"
            ? existing.stake + existing.toWin
            : input.result === "PUSH" || input.result === "VOID"
              ? existing.stake
              : existing.payout
      }
    });

    return tx.bet.findUniqueOrThrow({
      where: {
        id
      },
      include: betInclude
    });
  });

  return mapBetView(updated);
}

export async function archiveBet(id: string) {
  assertLedgerWritesAvailable();
  await prisma.bet.update({
    where: {
      id
    },
    data: {
      archivedAt: new Date()
    }
  });
}

export async function deleteBet(id: string) {
  assertLedgerWritesAvailable();
  await prisma.bet.delete({
    where: {
      id
    }
  });
}

export async function getPerformanceDashboard(): Promise<PerformanceDashboardView> {
  try {
    const bets = await prisma.bet.findMany({
      where: {
        archivedAt: null
      },
      include: betInclude,
      orderBy: {
        placedAt: "asc"
      }
    });

    return buildPerformanceDashboardData(bets.map(mapBetView));
  } catch (error) {
    return buildEmptyPerformanceDashboard(buildLedgerSetupState(error));
  }
}
