import { Prisma } from "@prisma/client";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

import { scoreContextRow, rowWarnings } from "./data-quality";
import { HISTORICAL_SOURCE_KEYS, type SharkTrendContextRow, type SharkTrendMarketType } from "./types";

type BuildArgs = {
  seasons?: number[];
  sourceKeys?: string[];
  marketTypes?: SharkTrendMarketType[];
  rebuild?: boolean;
  limit?: number;
  dryRun?: boolean;
};

export type WarehouseRow = {
  event_id: string;
  event_market_id: string;
  source_key: string;
  sportsbook_key: string | null;
  sportsbook_name: string | null;
  season: number;
  start_time: Date;
  venue: string | null;
  status: string;
  market_type: string;
  side: string | null;
  selection: string;
  line: number | null;
  odds_american: number | null;
  implied_probability: number | null;
  selection_competitor_id: string | null;
  home_competitor_id: string | null;
  away_competitor_id: string | null;
  home_name: string | null;
  away_name: string | null;
  home_abbr: string | null;
  away_abbr: string | null;
  home_score: string | null;
  away_score: string | null;
  winner_competitor_id: string | null;
  margin: number | null;
  total_points: number | null;
  ou_result: string | null;
  cover_result: unknown;
  opening_line: number | null;
  opening_odds: number | null;
  closing_line: number | null;
  closing_odds: number | null;
  snapshot_count: bigint | number | string | null;
};

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function int(value: unknown) {
  const parsed = num(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function sideFor(row: WarehouseRow) {
  const raw = String(row.side ?? row.selection ?? "").toUpperCase();
  if (row.market_type === "total") {
    if (raw.includes("UNDER")) return "UNDER";
    return "OVER";
  }
  if (row.selection_competitor_id && row.selection_competitor_id === row.home_competitor_id) return "HOME";
  if (row.selection_competitor_id && row.selection_competitor_id === row.away_competitor_id) return "AWAY";
  if (raw.includes("HOME")) return "HOME";
  if (raw.includes("AWAY")) return "AWAY";
  return raw || "TEAM";
}

function bucketMoneyline(price: number | null) {
  if (price === null) return null;
  const abs = Math.abs(price);
  if (price < 0) {
    if (abs < 120) return "favorite -100 to -119";
    if (abs < 140) return "favorite -120 to -139";
    if (abs < 165) return "favorite -140 to -164";
    if (abs < 181) return "favorite -165 to -180";
    if (abs < 220) return "favorite -181 to -219";
    return "favorite -220+";
  }
  if (abs < 120) return "underdog +100 to +119";
  if (abs < 150) return "underdog +120 to +149";
  if (abs < 200) return "underdog +150 to +199";
  return "underdog +200+";
}

function bucketSpread(line: number | null) {
  if (line === null) return null;
  if (line <= -2.5) return "favorite -2.5 or more";
  if (line < 0) return "favorite small spread";
  if (line === 0) return "pick";
  if (line < 2.5) return "underdog small spread";
  return "underdog +2.5 or more";
}

function bucketTotal(line: number | null) {
  if (line === null) return null;
  if (line < 7.5) return "under 7.5";
  if (line < 8.5) return "7.5-8";
  if (line < 9.5) return "8.5-9";
  if (line < 10.5) return "9.5-10";
  return "10.5+";
}

function grade(row: WarehouseRow, teamId: string, isHome: boolean, side: string, closingLine: number | null) {
  const homeScore = int(row.home_score);
  const awayScore = int(row.away_score);
  const teamScore = isHome ? homeScore : awayScore;
  const opponentScore = isHome ? awayScore : homeScore;
  const totalRuns = homeScore !== null && awayScore !== null ? homeScore + awayScore : int(row.total_points);
  const margin = teamScore !== null && opponentScore !== null ? teamScore - opponentScore : null;
  const wonGame = row.winner_competitor_id ? row.winner_competitor_id === teamId : margin === null ? null : margin > 0;
  let coverResult: string | null = null;
  let ouResult: string | null = row.ou_result;

  if (row.market_type === "spread" && margin !== null && closingLine !== null) {
    const spreadScore = margin + closingLine;
    coverResult = spreadScore > 0 ? "WIN" : spreadScore < 0 ? "LOSS" : "PUSH";
  }
  if (row.market_type === "total" && totalRuns !== null && closingLine !== null) {
    if (totalRuns === closingLine) ouResult = "PUSH";
    else if (side === "OVER") ouResult = totalRuns > closingLine ? "WIN" : "LOSS";
    else if (side === "UNDER") ouResult = totalRuns < closingLine ? "WIN" : "LOSS";
  }

  return { teamScore, opponentScore, totalRuns, margin, wonGame, coverResult, ouResult };
}

export function buildMlbContextRowsFromWarehouse(rows: WarehouseRow[]): SharkTrendContextRow[] {
  return rows.flatMap((row) => {
    const startTime = new Date(row.start_time);
    const side = sideFor(row);
    const isTotal = row.market_type === "total";
    const teamId = isTotal
      ? row.home_competitor_id
      : row.selection_competitor_id ?? (side === "HOME" ? row.home_competitor_id : row.away_competitor_id);
    if (!teamId) return [];
    const isHome = teamId === row.home_competitor_id;
    const opponentId = isHome ? row.away_competitor_id : row.home_competitor_id;
    const teamName = isHome ? row.home_name : row.away_name;
    const opponentName = isHome ? row.away_name : row.home_name;
    if (!teamName) return [];
    const openingLine = num(row.opening_line);
    const closingLine = num(row.closing_line) ?? num(row.line);
    const openingOdds = int(row.opening_odds);
    const closingOdds = int(row.closing_odds) ?? int(row.odds_american);
    const price = closingOdds ?? int(row.odds_american);
    const result = grade(row, teamId, isHome, side, closingLine);
    const base: SharkTrendContextRow = {
      eventId: row.event_id,
      eventMarketId: row.event_market_id,
      sourceKey: row.source_key,
      sportsbookKey: row.sportsbook_key,
      sportsbookName: row.sportsbook_name,
      season: Number(row.season),
      gameDate: startTime,
      startTime,
      teamCompetitorId: teamId,
      opponentCompetitorId: opponentId,
      teamName,
      opponentName,
      teamAbbr: isHome ? row.home_abbr : row.away_abbr,
      opponentAbbr: isHome ? row.away_abbr : row.home_abbr,
      isHome,
      side,
      marketType: row.market_type,
      line: num(row.line),
      openingLine,
      closingLine,
      oddsAmerican: price,
      openingOddsAmerican: openingOdds,
      closingOddsAmerican: closingOdds,
      impliedProbability: num(row.implied_probability),
      isFavorite: price === null ? null : price < 0,
      isUnderdog: price === null ? null : price > 0,
      favoritePriceBucket: price !== null && price < 0 ? bucketMoneyline(price) : null,
      moneylineBucket: row.market_type === "moneyline" ? bucketMoneyline(price) : null,
      spreadBucket: row.market_type === "spread" ? bucketSpread(closingLine) : null,
      totalBucket: row.market_type === "total" ? bucketTotal(closingLine) : null,
      teamScore: result.teamScore,
      opponentScore: result.opponentScore,
      wonGame: result.wonGame,
      coverResult: result.coverResult,
      ouResult: result.ouResult,
      totalRuns: result.totalRuns,
      margin: result.margin,
      venue: row.venue,
      parkId: null,
      divisionGame: null,
      isDayGame: Number.isNaN(startTime.getTime()) ? null : startTime.getUTCHours() < 22,
      isNightGame: Number.isNaN(startTime.getTime()) ? null : startTime.getUTCHours() >= 22,
      dataQualityScore: 0,
      dataWarnings: [],
      rawContextJson: { snapshotCount: Number(row.snapshot_count ?? 0) }
    };
    const warnings = rowWarnings(base);
    base.dataQualityScore = scoreContextRow(base);
    base.dataWarnings = warnings;
    return [base];
  });
}

function sourceWhere(keys: string[]) {
  return keys.map((key) => `'${key.replace(/'/g, "''")}'`).join(",");
}

export async function fetchMlbWarehouseRows(args: BuildArgs = {}) {
  const sourceKeys = args.sourceKeys?.length ? args.sourceKeys : [...HISTORICAL_SOURCE_KEYS];
  const marketTypes = args.marketTypes?.length ? args.marketTypes : ["moneyline", "spread", "total"];
  const seasonClause = args.seasons?.length ? `AND EXTRACT(YEAR FROM e."startTime")::int IN (${args.seasons.map(Number).join(",")})` : "";
  const limitClause = args.limit ? `LIMIT ${Math.max(1, Math.floor(args.limit))}` : "";
  return prisma.$queryRawUnsafe<WarehouseRow[]>(`
    SELECT
      e.id AS event_id,
      em.id AS event_market_id,
      em."sourceKey" AS source_key,
      sb.key AS sportsbook_key,
      sb.name AS sportsbook_name,
      EXTRACT(YEAR FROM e."startTime")::int AS season,
      e."startTime" AS start_time,
      e.venue,
      e.status::text AS status,
      em."marketType"::text AS market_type,
      em.side,
      em.selection,
      em.line,
      em."oddsAmerican" AS odds_american,
      em."impliedProbability" AS implied_probability,
      em."selectionCompetitorId" AS selection_competitor_id,
      home."competitorId" AS home_competitor_id,
      away."competitorId" AS away_competitor_id,
      home_c.name AS home_name,
      away_c.name AS away_name,
      home_c.abbreviation AS home_abbr,
      away_c.abbreviation AS away_abbr,
      home.score AS home_score,
      away.score AS away_score,
      er."winnerCompetitorId" AS winner_competitor_id,
      er.margin,
      er."totalPoints" AS total_points,
      er."ouResult" AS ou_result,
      er."coverResult" AS cover_result,
      open_snap.line AS opening_line,
      open_snap."oddsAmerican" AS opening_odds,
      close_snap.line AS closing_line,
      close_snap."oddsAmerican" AS closing_odds,
      snap_counts.snapshot_count
    FROM event_markets em
    JOIN events e ON e.id = em."eventId"
    JOIN leagues l ON l.id = e."leagueId"
    LEFT JOIN sportsbooks sb ON sb.id = em."sportsbookId"
    LEFT JOIN event_results er ON er."eventId" = e.id
    LEFT JOIN event_participants home ON home."eventId" = e.id AND home.role = 'HOME'
    LEFT JOIN event_participants away ON away."eventId" = e.id AND away.role = 'AWAY'
    LEFT JOIN competitors home_c ON home_c.id = home."competitorId"
    LEFT JOIN competitors away_c ON away_c.id = away."competitorId"
    LEFT JOIN LATERAL (
      SELECT s.line, s."oddsAmerican" FROM event_market_snapshots s
      WHERE s."eventMarketId" = em.id AND s."capturedAt" <= e."startTime"
      ORDER BY s."capturedAt" ASC LIMIT 1
    ) open_snap ON TRUE
    LEFT JOIN LATERAL (
      SELECT s.line, s."oddsAmerican" FROM event_market_snapshots s
      WHERE s."eventMarketId" = em.id AND s."capturedAt" <= e."startTime"
      ORDER BY s."capturedAt" DESC LIMIT 1
    ) close_snap ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS snapshot_count FROM event_market_snapshots s
      WHERE s."eventMarketId" = em.id AND s."capturedAt" <= e."startTime"
    ) snap_counts ON TRUE
    WHERE l.key = 'MLB'
      AND em."sourceKey" IN (${sourceWhere(sourceKeys)})
      AND em."marketType"::text IN (${sourceWhere(marketTypes)})
      AND COALESCE(em."isLive", false) = false
      ${seasonClause}
    ORDER BY e."startTime" ASC, em.id ASC
    ${limitClause}
  `);
}

function json(value: unknown): Prisma.JsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.JsonValue;
}

async function upsertContextRow(row: SharkTrendContextRow) {
  await prisma.$executeRaw`
    INSERT INTO mlb_game_context (
      event_id, event_market_id, source_key, sportsbook_key, sportsbook_name, season, game_date, start_time,
      team_competitor_id, opponent_competitor_id, team_name, opponent_name, team_abbr, opponent_abbr,
      is_home, side, market_type, line, opening_line, closing_line, odds_american, opening_odds_american,
      closing_odds_american, implied_probability, is_favorite, is_underdog, favorite_price_bucket,
      moneyline_bucket, spread_bucket, total_bucket, team_score, opponent_score, won_game, cover_result,
      ou_result, total_runs, margin, venue, park_id, division_game, is_day_game, is_night_game,
      days_rest, opponent_days_rest, is_back_to_back, last_game_runs_scored, last_game_runs_allowed,
      last_two_runs_scored, last_three_runs_scored, starter_rolling_game_score, team_pregame_elo,
      opponent_pregame_elo, elo_diff, weather_temp_f, wind_mph, wind_direction, wind_out, wind_in,
      data_quality_score, data_warnings, raw_context_json, updated_at
    ) VALUES (
      ${row.eventId}, ${row.eventMarketId}, ${row.sourceKey}, ${row.sportsbookKey}, ${row.sportsbookName}, ${row.season}, ${new Date(row.gameDate)}, ${new Date(row.startTime)},
      ${row.teamCompetitorId}, ${row.opponentCompetitorId}, ${row.teamName}, ${row.opponentName}, ${row.teamAbbr}, ${row.opponentAbbr},
      ${row.isHome}, ${row.side}, ${row.marketType}, ${row.line}, ${row.openingLine}, ${row.closingLine}, ${row.oddsAmerican}, ${row.openingOddsAmerican},
      ${row.closingOddsAmerican}, ${row.impliedProbability}, ${row.isFavorite}, ${row.isUnderdog}, ${row.favoritePriceBucket},
      ${row.moneylineBucket}, ${row.spreadBucket}, ${row.totalBucket}, ${row.teamScore}, ${row.opponentScore}, ${row.wonGame}, ${row.coverResult},
      ${row.ouResult}, ${row.totalRuns}, ${row.margin}, ${row.venue}, ${row.parkId}, ${row.divisionGame}, ${row.isDayGame}, ${row.isNightGame},
      ${row.daysRest}, ${row.opponentDaysRest}, ${row.isBackToBack}, ${row.lastGameRunsScored}, ${row.lastGameRunsAllowed},
      ${row.lastTwoRunsScored}, ${row.lastThreeRunsScored}, ${row.starterRollingGameScore}, ${row.teamPregameElo},
      ${row.opponentPregameElo}, ${row.eloDiff}, ${row.weatherTempF}, ${row.windMph}, ${row.windDirection}, ${row.windOut}, ${row.windIn},
      ${row.dataQualityScore}, ${json(row.dataWarnings)}, ${json(row.rawContextJson)}, now()
    )
    ON CONFLICT (event_id, event_market_id, team_competitor_id, market_type, side) DO UPDATE SET
      source_key = EXCLUDED.source_key,
      sportsbook_key = EXCLUDED.sportsbook_key,
      sportsbook_name = EXCLUDED.sportsbook_name,
      season = EXCLUDED.season,
      game_date = EXCLUDED.game_date,
      start_time = EXCLUDED.start_time,
      team_name = EXCLUDED.team_name,
      opponent_name = EXCLUDED.opponent_name,
      line = EXCLUDED.line,
      opening_line = EXCLUDED.opening_line,
      closing_line = EXCLUDED.closing_line,
      odds_american = EXCLUDED.odds_american,
      opening_odds_american = EXCLUDED.opening_odds_american,
      closing_odds_american = EXCLUDED.closing_odds_american,
      won_game = EXCLUDED.won_game,
      cover_result = EXCLUDED.cover_result,
      ou_result = EXCLUDED.ou_result,
      data_quality_score = EXCLUDED.data_quality_score,
      data_warnings = EXCLUDED.data_warnings,
      raw_context_json = EXCLUDED.raw_context_json,
      updated_at = now()
  `;
}

export async function buildMlbGameContext(args: BuildArgs = {}) {
  const startedAt = Date.now();
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: false, dryRun: Boolean(args.dryRun), builtRows: 0, insertedRows: 0, warnings: ["DATABASE_URL unavailable."], elapsedMs: 0 };
  }
  if (args.rebuild && !args.dryRun) {
    await prisma.$executeRaw`DELETE FROM mlb_game_context`;
  }
  const warehouseRows = await fetchMlbWarehouseRows(args);
  const contextRows = buildMlbContextRowsFromWarehouse(warehouseRows);
  let insertedRows = 0;
  if (!args.dryRun) {
    for (const row of contextRows) {
      await upsertContextRow(row);
      insertedRows += 1;
    }
  }
  return {
    ok: true,
    dryRun: Boolean(args.dryRun),
    sourceRows: warehouseRows.length,
    builtRows: contextRows.length,
    insertedRows,
    warnings: contextRows.length === 0 ? ["No MLB historical context rows were built from the current warehouse."] : [],
    elapsedMs: Date.now() - startedAt
  };
}
