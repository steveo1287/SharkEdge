import { prisma } from "@/lib/db/prisma";

import { getMlbHistoricalOddsCoverage } from "./coverage";
import { summarizeBacktestQuality } from "./data-quality";
import { buildSharkTrendProof } from "./proof";
import { parseSharkTrendQuery } from "./query-parser";
import { sharkTrendFilterZodSchema, type SharkTrendContextRow, type SharkTrendFilter } from "./types";

export type SharkTrendBacktestArgs = {
  filters: SharkTrendFilter;
  explanation?: string;
  limit?: number;
  includeMatches?: boolean;
};

type RawContextRow = Record<string, unknown>;

type Grade = "WIN" | "LOSS" | "PUSH" | "VOID";

type SplitBucket = Record<string, { sampleSize: number; wins: number; losses: number; pushes: number; units: number; roi: number }>;

function n(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function b(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function s(value: unknown) {
  return typeof value === "string" && value.length ? value : null;
}

function toDateString(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function rawContextToRow(row: RawContextRow): SharkTrendContextRow {
  return {
    id: s(row.id) ?? undefined,
    eventId: s(row.event_id) ?? "",
    eventMarketId: s(row.event_market_id),
    sourceKey: s(row.source_key) ?? "unknown",
    sportsbookKey: s(row.sportsbook_key),
    sportsbookName: s(row.sportsbook_name),
    season: n(row.season) ?? 0,
    gameDate: toDateString(row.game_date) ?? "",
    startTime: toDateString(row.start_time) ?? "",
    teamCompetitorId: s(row.team_competitor_id) ?? "",
    opponentCompetitorId: s(row.opponent_competitor_id),
    teamName: s(row.team_name) ?? "Unknown",
    opponentName: s(row.opponent_name),
    teamAbbr: s(row.team_abbr),
    opponentAbbr: s(row.opponent_abbr),
    isHome: Boolean(row.is_home),
    side: s(row.side) ?? "TEAM",
    marketType: s(row.market_type) ?? "moneyline",
    line: n(row.line),
    openingLine: n(row.opening_line),
    closingLine: n(row.closing_line),
    oddsAmerican: n(row.odds_american),
    openingOddsAmerican: n(row.opening_odds_american),
    closingOddsAmerican: n(row.closing_odds_american),
    impliedProbability: n(row.implied_probability),
    isFavorite: b(row.is_favorite),
    isUnderdog: b(row.is_underdog),
    favoritePriceBucket: s(row.favorite_price_bucket),
    moneylineBucket: s(row.moneyline_bucket),
    spreadBucket: s(row.spread_bucket),
    totalBucket: s(row.total_bucket),
    teamScore: n(row.team_score),
    opponentScore: n(row.opponent_score),
    wonGame: b(row.won_game),
    coverResult: s(row.cover_result),
    ouResult: s(row.ou_result),
    totalRuns: n(row.total_runs),
    margin: n(row.margin),
    venue: s(row.venue),
    parkId: s(row.park_id),
    divisionGame: b(row.division_game),
    isDayGame: b(row.is_day_game),
    isNightGame: b(row.is_night_game),
    previousGameDate: toDateString(row.previous_game_date),
    daysRest: n(row.days_rest),
    opponentDaysRest: n(row.opponent_days_rest),
    isBackToBack: b(row.is_back_to_back),
    travelSpot: s(row.travel_spot),
    lastGameRunsScored: n(row.last_game_runs_scored),
    lastGameRunsAllowed: n(row.last_game_runs_allowed),
    lastTwoRunsScored: n(row.last_two_runs_scored),
    lastThreeRunsScored: n(row.last_three_runs_scored),
    starterPitcherId: s(row.starter_pitcher_id),
    starterPitcherName: s(row.starter_pitcher_name),
    starterRollingGameScore: n(row.starter_rolling_game_score),
    teamPregameElo: n(row.team_pregame_elo),
    opponentPregameElo: n(row.opponent_pregame_elo),
    eloDiff: n(row.elo_diff),
    weatherTempF: n(row.weather_temp_f),
    windMph: n(row.wind_mph),
    windDirection: s(row.wind_direction),
    windOut: b(row.wind_out),
    windIn: b(row.wind_in),
    dataQualityScore: n(row.data_quality_score) ?? 0,
    dataWarnings: row.data_warnings,
    rawContextJson: row.raw_context_json
  };
}

function includesText(value: string | null | undefined, needle: string | undefined) {
  if (!needle) return true;
  return String(value ?? "").toLowerCase().includes(needle.toLowerCase());
}

function inRange(value: number | null | undefined, min?: number, max?: number) {
  if (min === undefined && max === undefined) return true;
  if (value === null || value === undefined || !Number.isFinite(value)) return false;
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

export function rowMatchesFilter(row: SharkTrendContextRow, filters: SharkTrendFilter) {
  if (filters.marketType && row.marketType !== filters.marketType) return false;
  if (filters.seasons?.length && !filters.seasons.includes(row.season)) return false;
  if (!includesText(row.teamName, filters.team)) return false;
  if (!includesText(row.opponentName, filters.opponent)) return false;
  if (filters.homeAway === "HOME" && !row.isHome) return false;
  if (filters.homeAway === "AWAY" && row.isHome) return false;
  if (filters.side === "HOME" && !row.isHome) return false;
  if (filters.side === "AWAY" && row.isHome) return false;
  if (filters.side === "FAVORITE" && row.isFavorite !== true) return false;
  if (filters.side === "UNDERDOG" && row.isUnderdog !== true) return false;
  if (filters.side === "OVER" && row.side !== "OVER") return false;
  if (filters.side === "UNDER" && row.side !== "UNDER") return false;
  if (!inRange(row.oddsAmerican, filters.oddsMin, filters.oddsMax)) return false;
  if (filters.favoriteMinAbsPrice !== undefined || filters.favoriteMaxAbsPrice !== undefined) {
    if (row.oddsAmerican === null || row.oddsAmerican === undefined || row.oddsAmerican >= 0) return false;
    if (!inRange(Math.abs(row.oddsAmerican), filters.favoriteMinAbsPrice, filters.favoriteMaxAbsPrice)) return false;
  }
  const line = row.closingLine ?? row.line;
  if (!inRange(line, filters.totalMin, filters.totalMax)) return false;
  if (row.marketType === "spread" && !inRange(line, filters.spreadMin, filters.spreadMax)) return false;
  if (filters.divisionGame !== undefined && row.divisionGame !== filters.divisionGame) return false;
  if (filters.dayGame !== undefined && row.isDayGame !== filters.dayGame) return false;
  if (filters.nightGame !== undefined && row.isNightGame !== filters.nightGame) return false;
  if (!inRange(row.daysRest, filters.daysRestMin, filters.daysRestMax)) return false;
  if (!inRange(row.opponentDaysRest, filters.opponentDaysRestMin, filters.opponentDaysRestMax)) return false;
  if (filters.travelSpot && row.travelSpot !== filters.travelSpot) return false;
  if (filters.previousRunsScoredMax !== undefined && !inRange(row.lastGameRunsScored, undefined, filters.previousRunsScoredMax)) return false;
  if (filters.previousRunsAllowedMin !== undefined && !inRange(row.lastGameRunsAllowed, filters.previousRunsAllowedMin, undefined)) return false;
  if (filters.lastTwoRunsScoredMax !== undefined && !inRange(row.lastTwoRunsScored, undefined, filters.lastTwoRunsScoredMax)) return false;
  if (filters.lastThreeRunsScoredMax !== undefined && !inRange(row.lastThreeRunsScored, undefined, filters.lastThreeRunsScoredMax)) return false;
  if (filters.windOut !== undefined && row.windOut !== filters.windOut) return false;
  if (filters.windIn !== undefined && row.windIn !== filters.windIn) return false;
  if (!inRange(row.windMph, filters.windMphMin, filters.windMphMax)) return false;
  if (!includesText(row.venue, filters.venue)) return false;
  if (!includesText(row.parkId, filters.parkId)) return false;
  if (!inRange(row.starterRollingGameScore, filters.starterRollingGameScoreMin, filters.starterRollingGameScoreMax)) return false;
  if (!inRange(row.eloDiff, filters.eloDiffMin, filters.eloDiffMax)) return false;
  if (filters.sportsbookKey && row.sportsbookKey !== filters.sportsbookKey) return false;
  if (filters.sourceKeys?.length && !filters.sourceKeys.includes(row.sourceKey)) return false;
  if (filters.minDataQualityScore !== undefined && row.dataQualityScore < filters.minDataQualityScore) return false;
  return true;
}

export function gradeTrendRow(row: SharkTrendContextRow): Grade {
  if (row.marketType === "moneyline") {
    if (row.wonGame === true) return "WIN";
    if (row.wonGame === false) return "LOSS";
    return "VOID";
  }
  if (row.marketType === "spread") {
    const result = String(row.coverResult ?? "").toUpperCase();
    if (result === "WIN" || result === "LOSS" || result === "PUSH") return result as Grade;
    return "VOID";
  }
  if (row.marketType === "total") {
    const result = String(row.ouResult ?? "").toUpperCase();
    if (result === "WIN" || result === "LOSS" || result === "PUSH") return result as Grade;
    return "VOID";
  }
  return "VOID";
}

export function americanWinProfit(odds: number | null | undefined) {
  if (!odds || !Number.isFinite(odds)) return 0.9;
  return odds > 0 ? odds / 100 : 100 / Math.abs(odds);
}

function splitRecord() {
  return { sampleSize: 0, wins: 0, losses: 0, pushes: 0, units: 0, roi: 0 };
}

function addSplit(splits: SplitBucket, key: string, grade: Grade, units: number) {
  const bucket = splits[key || "Unknown"] ?? splitRecord();
  if (grade !== "VOID") bucket.sampleSize += 1;
  if (grade === "WIN") bucket.wins += 1;
  if (grade === "LOSS") bucket.losses += 1;
  if (grade === "PUSH") bucket.pushes += 1;
  bucket.units += units;
  bucket.roi = bucket.sampleSize ? bucket.units / bucket.sampleSize : 0;
  splits[key || "Unknown"] = bucket;
}

function confidenceGrade(sampleSize: number, quality: number, warningFlags: string[]) {
  if (sampleSize < 5) return "F";
  if (sampleSize < 20 || quality < 60) return "D";
  if (sampleSize >= 75 && quality >= 80 && warningFlags.length === 0) return "A";
  if (sampleSize >= 40 && quality >= 70) return "B";
  return "C";
}

function oddsBucket(row: SharkTrendContextRow) {
  return row.moneylineBucket ?? row.favoritePriceBucket ?? row.spreadBucket ?? row.totalBucket ?? "Unbucketed";
}

function restBucket(value: number | null | undefined) {
  if (value === null || value === undefined) return "Unknown";
  if (value <= 0) return "0 days";
  if (value === 1) return "1 day";
  if (value === 2) return "2 days";
  return "3+ days";
}

export function summarizeBacktestRows(rows: SharkTrendContextRow[], filters: SharkTrendFilter, includeMatches = false, limit = 100) {
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let voids = 0;
  let units = 0;
  let oddsSum = 0;
  let closingOddsSum = 0;
  let lineSum = 0;
  let closingLineSum = 0;
  let clvSum = 0;
  let clvCount = 0;
  let graded = 0;

  const splits = {
    bySeason: {} as SplitBucket,
    byHomeAway: {} as SplitBucket,
    byFavoriteUnderdog: {} as SplitBucket,
    byOddsBucket: {} as SplitBucket,
    byTotalBucket: {} as SplitBucket,
    byRestBucket: {} as SplitBucket,
    byTravelSpot: {} as SplitBucket,
    byStarterForm: {} as SplitBucket,
    bySportsbook: {} as SplitBucket,
    bySourceKey: {} as SplitBucket
  };

  const matches = [] as unknown[];

  for (const row of rows) {
    const grade = gradeTrendRow(row);
    let rowUnits = 0;
    if (grade === "WIN") {
      wins += 1;
      rowUnits = americanWinProfit(row.oddsAmerican ?? row.closingOddsAmerican);
    } else if (grade === "LOSS") {
      losses += 1;
      rowUnits = -1;
    } else if (grade === "PUSH") {
      pushes += 1;
    } else {
      voids += 1;
    }
    if (grade !== "VOID") {
      graded += 1;
      units += rowUnits;
      oddsSum += row.oddsAmerican ?? 0;
      closingOddsSum += row.closingOddsAmerican ?? row.oddsAmerican ?? 0;
      lineSum += row.line ?? 0;
      closingLineSum += row.closingLine ?? row.line ?? 0;
      if (row.oddsAmerican !== null && row.oddsAmerican !== undefined && row.closingOddsAmerican !== null && row.closingOddsAmerican !== undefined) {
        clvSum += row.closingOddsAmerican - row.oddsAmerican;
        clvCount += 1;
      }
      addSplit(splits.bySeason, String(row.season), grade, rowUnits);
      addSplit(splits.byHomeAway, row.isHome ? "Home" : "Away", grade, rowUnits);
      addSplit(splits.byFavoriteUnderdog, row.isFavorite ? "Favorite" : row.isUnderdog ? "Underdog" : "Pick", grade, rowUnits);
      addSplit(splits.byOddsBucket, oddsBucket(row), grade, rowUnits);
      addSplit(splits.byTotalBucket, row.totalBucket ?? "N/A", grade, rowUnits);
      addSplit(splits.byRestBucket, restBucket(row.daysRest), grade, rowUnits);
      addSplit(splits.byTravelSpot, row.travelSpot ?? "Unknown", grade, rowUnits);
      addSplit(splits.byStarterForm, row.starterRollingGameScore == null ? "Unknown" : row.starterRollingGameScore >= 58 ? "Hot starter" : row.starterRollingGameScore <= 45 ? "Cold starter" : "Neutral starter", grade, rowUnits);
      addSplit(splits.bySportsbook, row.sportsbookName ?? row.sportsbookKey ?? "Unknown", grade, rowUnits);
      addSplit(splits.bySourceKey, row.sourceKey, grade, rowUnits);
    }
    if (includeMatches && matches.length < limit) {
      matches.push({
        eventId: row.eventId,
        date: toDateString(row.startTime),
        season: row.season,
        team: row.teamName,
        opponent: row.opponentName,
        isHome: row.isHome,
        marketType: row.marketType,
        side: row.side,
        line: row.line,
        closingLine: row.closingLine,
        oddsAmerican: row.oddsAmerican,
        closingOddsAmerican: row.closingOddsAmerican,
        result: grade,
        teamScore: row.teamScore,
        opponentScore: row.opponentScore,
        daysRest: row.daysRest,
        opponentDaysRest: row.opponentDaysRest,
        travelSpot: row.travelSpot,
        lastGameRunsScored: row.lastGameRunsScored,
        lastGameRunsAllowed: row.lastGameRunsAllowed,
        lastTwoRunsScored: row.lastTwoRunsScored,
        starterRollingGameScore: row.starterRollingGameScore,
        eloDiff: row.eloDiff,
        sportsbookName: row.sportsbookName,
        sourceKey: row.sourceKey,
        dataQualityScore: row.dataQualityScore,
        warnings: row.dataWarnings ?? []
      });
    }
  }

  const quality = summarizeBacktestQuality(rows);
  const warningFlags = quality.warnings;
  const sampleSize = graded;
  const result = {
    sampleSize,
    wins,
    losses,
    pushes,
    voids,
    winRate: sampleSize ? wins / sampleSize : 0,
    winRateExPushes: wins + losses ? wins / (wins + losses) : 0,
    pushRate: sampleSize ? pushes / sampleSize : 0,
    roiFlatStake: sampleSize ? units / sampleSize : 0,
    unitsFlatStake: units,
    avgOddsAmerican: sampleSize ? oddsSum / sampleSize : null,
    avgClosingOddsAmerican: sampleSize ? closingOddsSum / sampleSize : null,
    avgLine: sampleSize ? lineSum / sampleSize : null,
    avgClosingLine: sampleSize ? closingLineSum / sampleSize : null,
    clvAverage: clvCount ? clvSum / clvCount : null,
    confidenceGrade: confidenceGrade(sampleSize, quality.dataQualityScore, warningFlags),
    dataQualityScore: quality.dataQualityScore,
    warningFlags
  };

  return {
    ok: true as const,
    query: { filters, explanation: "Structured MLB SharkTrends backtest." },
    result,
    splits,
    matches,
    proof: buildSharkTrendProof({ filters, result, splits, warnings: warningFlags }),
    warnings: warningFlags
  };
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildWhere(filters: SharkTrendFilter) {
  const clauses = ["1=1"];
  if (filters.marketType) clauses.push(`market_type = ${sqlString(filters.marketType)}`);
  if (filters.seasons?.length) clauses.push(`season IN (${filters.seasons.map((v) => Math.floor(v)).join(",")})`);
  if (filters.team) clauses.push(`LOWER(team_name) LIKE ${sqlString(`%${filters.team.toLowerCase()}%`)}`);
  if (filters.opponent) clauses.push(`LOWER(COALESCE(opponent_name, '')) LIKE ${sqlString(`%${filters.opponent.toLowerCase()}%`)}`);
  if (filters.homeAway === "HOME") clauses.push("is_home = true");
  if (filters.homeAway === "AWAY") clauses.push("is_home = false");
  if (filters.side === "FAVORITE") clauses.push("is_favorite = true");
  if (filters.side === "UNDERDOG") clauses.push("is_underdog = true");
  if (filters.side === "OVER") clauses.push("side = 'OVER'");
  if (filters.side === "UNDER") clauses.push("side = 'UNDER'");
  if (filters.oddsMin !== undefined) clauses.push(`odds_american >= ${Number(filters.oddsMin)}`);
  if (filters.oddsMax !== undefined) clauses.push(`odds_american <= ${Number(filters.oddsMax)}`);
  if (filters.favoriteMinAbsPrice !== undefined) clauses.push(`odds_american < 0 AND ABS(odds_american) >= ${Number(filters.favoriteMinAbsPrice)}`);
  if (filters.favoriteMaxAbsPrice !== undefined) clauses.push(`odds_american < 0 AND ABS(odds_american) <= ${Number(filters.favoriteMaxAbsPrice)}`);
  if (filters.totalMin !== undefined) clauses.push(`COALESCE(closing_line, line) >= ${Number(filters.totalMin)}`);
  if (filters.totalMax !== undefined) clauses.push(`COALESCE(closing_line, line) <= ${Number(filters.totalMax)}`);
  if (filters.divisionGame !== undefined) clauses.push(`division_game = ${filters.divisionGame ? "true" : "false"}`);
  if (filters.dayGame !== undefined) clauses.push(`is_day_game = ${filters.dayGame ? "true" : "false"}`);
  if (filters.nightGame !== undefined) clauses.push(`is_night_game = ${filters.nightGame ? "true" : "false"}`);
  if (filters.windOut !== undefined) clauses.push(`wind_out = ${filters.windOut ? "true" : "false"}`);
  if (filters.windIn !== undefined) clauses.push(`wind_in = ${filters.windIn ? "true" : "false"}`);
  if (filters.travelSpot) clauses.push(`travel_spot = ${sqlString(filters.travelSpot)}`);
  if (filters.venue) clauses.push(`LOWER(COALESCE(venue, '')) LIKE ${sqlString(`%${filters.venue.toLowerCase()}%`)}`);
  if (filters.sportsbookKey) clauses.push(`sportsbook_key = ${sqlString(filters.sportsbookKey)}`);
  if (filters.sourceKeys?.length) clauses.push(`source_key IN (${filters.sourceKeys.map(sqlString).join(",")})`);
  if (filters.minDataQualityScore !== undefined) clauses.push(`data_quality_score >= ${Number(filters.minDataQualityScore)}`);
  return clauses.join(" AND ");
}

export async function fetchBacktestRows(filters: SharkTrendFilter, limit = 5000) {
  const parsed = sharkTrendFilterZodSchema.parse(filters);
  const rows = await prisma.$queryRawUnsafe<RawContextRow[]>(`
    SELECT *
    FROM mlb_game_context
    WHERE ${buildWhere(parsed)}
    ORDER BY start_time DESC
    LIMIT ${Math.max(1, Math.min(10000, Math.floor(limit)))}
  `);
  return rows.map(rawContextToRow).filter((row) => rowMatchesFilter(row, parsed));
}

export async function runSharkTrendBacktest(args: SharkTrendBacktestArgs) {
  const filters = sharkTrendFilterZodSchema.parse(args.filters);
  const [coverage, rows] = await Promise.all([
    getMlbHistoricalOddsCoverage(prisma),
    fetchBacktestRows(filters, args.limit ?? 5000)
  ]);
  const summary = summarizeBacktestRows(rows, filters, Boolean(args.includeMatches), args.limit ?? 100);
  const coverageSummary = {
    minDate: coverage.minEventStartTime,
    maxDate: coverage.maxEventStartTime,
    seasonsAvailable: coverage.seasonsAvailable,
    sourceKeys: coverage.sourceKeys,
    marketCount: coverage.marketCount,
    snapshotCount: coverage.snapshotCount
  };
  const warnings = [...coverage.warnings, ...summary.warnings];
  return {
    ...summary,
    query: { filters, explanation: args.explanation ?? summary.query.explanation },
    coverage: coverageSummary,
    proof: buildSharkTrendProof({ filters, result: summary.result, splits: summary.splits, warnings, coverage: coverageSummary }),
    warnings
  };
}

export async function runSharkTrendBacktestFromRequest(body: { input?: string; filters?: unknown; includeMatches?: boolean; limit?: number }) {
  const parsed = body.input ? parseSharkTrendQuery(body.input) : null;
  const filters = sharkTrendFilterZodSchema.parse(body.filters ?? parsed?.filters ?? { league: "MLB" });
  return runSharkTrendBacktest({
    filters,
    explanation: parsed?.explanation,
    includeMatches: body.includeMatches,
    limit: body.limit
  });
}
