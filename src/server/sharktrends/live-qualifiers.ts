import { prisma } from "@/lib/db/prisma";

import { rowMatchesFilter } from "./backtest-engine";
import { sharkTrendFilterZodSchema, type SharkTrendContextRow, type SharkTrendFilter } from "./types";

export type LiveQualifier = {
  eventId: string;
  eventLabel: string;
  startTime: string;
  team: string;
  opponent: string | null;
  marketType: string;
  side: string;
  currentLine: number | null;
  currentOddsAmerican: number | null;
  sportsbookName: string | null;
  matchScore: number;
  matchedConditions: string[];
  missingConditions: string[];
  warnings: string[];
  matchupHref: string;
  boardHref: string;
};

type UpcomingRow = Record<string, unknown>;

function n(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function s(value: unknown) {
  return typeof value === "string" && value.length ? value : null;
}

function bool(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function asDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function liveRowToContext(row: UpcomingRow): SharkTrendContextRow {
  const startTime = asDate(row.start_time);
  const odds = n(row.odds_american);
  const marketType = s(row.market_type) ?? "moneyline";
  const isHome = bool(row.is_home) ?? false;
  return {
    eventId: s(row.event_id) ?? "",
    eventMarketId: s(row.event_market_id),
    sourceKey: s(row.source_key) ?? "live_market",
    sportsbookKey: s(row.sportsbook_key),
    sportsbookName: s(row.sportsbook_name),
    season: startTime.getUTCFullYear(),
    gameDate: startTime,
    startTime,
    teamCompetitorId: s(row.team_competitor_id) ?? "",
    opponentCompetitorId: s(row.opponent_competitor_id),
    teamName: s(row.team_name) ?? "Unknown",
    opponentName: s(row.opponent_name),
    teamAbbr: s(row.team_abbr),
    opponentAbbr: s(row.opponent_abbr),
    isHome,
    side: s(row.side) ?? (isHome ? "HOME" : "AWAY"),
    marketType,
    line: n(row.line),
    openingLine: null,
    closingLine: n(row.line),
    oddsAmerican: odds,
    openingOddsAmerican: null,
    closingOddsAmerican: odds,
    isFavorite: odds === null ? null : odds < 0,
    isUnderdog: odds === null ? null : odds > 0,
    venue: s(row.venue),
    dataQualityScore: 50,
    dataWarnings: []
  };
}

function requiredMissing(row: SharkTrendContextRow, filters: SharkTrendFilter) {
  const missing: string[] = [];
  if (filters.windOut !== undefined && row.windOut === null) missing.push("wind direction");
  if (filters.windIn !== undefined && row.windIn === null) missing.push("wind direction");
  if ((filters.windMphMin !== undefined || filters.windMphMax !== undefined) && row.windMph === null) missing.push("wind speed");
  if ((filters.daysRestMin !== undefined || filters.daysRestMax !== undefined) && row.daysRest === null) missing.push("days rest");
  if ((filters.previousRunsScoredMax !== undefined || filters.previousRunsAllowedMin !== undefined) && row.lastGameRunsScored === null) missing.push("previous game scoring");
  if ((filters.starterRollingGameScoreMin !== undefined || filters.starterRollingGameScoreMax !== undefined) && row.starterRollingGameScore === null) missing.push("starter rolling game score");
  if ((filters.eloDiffMin !== undefined || filters.eloDiffMax !== undefined) && row.eloDiff === null) missing.push("Elo differential");
  return missing;
}

export function evaluateLiveQualifier(row: SharkTrendContextRow, filters: SharkTrendFilter): LiveQualifier | null {
  const missingConditions = requiredMissing(row, filters);
  if (missingConditions.length > 0) return null;
  if (!rowMatchesFilter(row, filters)) return null;

  const matchedConditions = [
    filters.marketType ? `market ${filters.marketType}` : "any market",
    filters.team ? `team matches ${filters.team}` : null,
    filters.homeAway && filters.homeAway !== "ALL" ? filters.homeAway.toLowerCase() : null,
    filters.side ? `side ${filters.side}` : null,
    filters.oddsMin !== undefined || filters.oddsMax !== undefined ? "odds range" : null,
    filters.totalMin !== undefined || filters.totalMax !== undefined ? "line range" : null
  ].filter(Boolean) as string[];

  const eventLabel = `${row.opponentName ?? "Opponent"} @ ${row.teamName}`;
  return {
    eventId: row.eventId,
    eventLabel,
    startTime: new Date(row.startTime).toISOString(),
    team: row.teamName,
    opponent: row.opponentName ?? null,
    marketType: String(row.marketType),
    side: row.side,
    currentLine: row.line ?? null,
    currentOddsAmerican: row.oddsAmerican ?? null,
    sportsbookName: row.sportsbookName ?? null,
    matchScore: Math.max(50, 100 - missingConditions.length * 15),
    matchedConditions,
    missingConditions,
    warnings: row.dataWarnings as string[] ?? [],
    matchupHref: `/matchup/mlb/${row.eventId}`,
    boardHref: `/board?league=MLB`
  };
}

export async function fetchUpcomingMlbRows(daysAhead = 7) {
  return prisma.$queryRawUnsafe<UpcomingRow[]>(`
    SELECT
      e.id AS event_id,
      em.id AS event_market_id,
      em."sourceKey" AS source_key,
      sb.key AS sportsbook_key,
      sb.name AS sportsbook_name,
      e."startTime" AS start_time,
      e.venue,
      em."marketType"::text AS market_type,
      em.side,
      em.line,
      em."oddsAmerican" AS odds_american,
      em."selectionCompetitorId" AS team_competitor_id,
      CASE WHEN em."selectionCompetitorId" = home."competitorId" THEN away."competitorId" ELSE home."competitorId" END AS opponent_competitor_id,
      CASE WHEN em."selectionCompetitorId" = home."competitorId" THEN home_c.name ELSE away_c.name END AS team_name,
      CASE WHEN em."selectionCompetitorId" = home."competitorId" THEN away_c.name ELSE home_c.name END AS opponent_name,
      CASE WHEN em."selectionCompetitorId" = home."competitorId" THEN home_c.abbreviation ELSE away_c.abbreviation END AS team_abbr,
      CASE WHEN em."selectionCompetitorId" = home."competitorId" THEN away_c.abbreviation ELSE home_c.abbreviation END AS opponent_abbr,
      em."selectionCompetitorId" = home."competitorId" AS is_home
    FROM event_markets em
    JOIN events e ON e.id = em."eventId"
    JOIN leagues l ON l.id = e."leagueId"
    LEFT JOIN sportsbooks sb ON sb.id = em."sportsbookId"
    LEFT JOIN event_participants home ON home."eventId" = e.id AND home.role = 'HOME'
    LEFT JOIN event_participants away ON away."eventId" = e.id AND away.role = 'AWAY'
    LEFT JOIN competitors home_c ON home_c.id = home."competitorId"
    LEFT JOIN competitors away_c ON away_c.id = away."competitorId"
    WHERE l.key = 'MLB'
      AND e."startTime" >= now()
      AND e."startTime" <= now() + (${Math.max(1, Math.min(30, Math.floor(daysAhead)))} || ' days')::interval
      AND em."marketType"::text IN ('moneyline','spread','total')
    ORDER BY e."startTime" ASC
    LIMIT 500
  `);
}

export async function findLiveSharkTrendQualifiers(args: { filters: SharkTrendFilter; daysAhead?: number }) {
  const filters = sharkTrendFilterZodSchema.parse(args.filters);
  const rows = await fetchUpcomingMlbRows(args.daysAhead ?? 7);
  const qualifiers = rows
    .map(liveRowToContext)
    .map((row) => evaluateLiveQualifier(row, filters))
    .filter((row): row is LiveQualifier => Boolean(row));

  return {
    qualifiers,
    warnings: qualifiers.length === 0 ? ["No upcoming MLB qualifiers matched every required condition with currently available fields."] : []
  };
}
