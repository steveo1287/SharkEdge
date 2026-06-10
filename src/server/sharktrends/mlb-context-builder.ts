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
  home_metadata_json: unknown;
  away_metadata_json: unknown;
  home_external_ids: unknown;
  away_external_ids: unknown;
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
  home_days_rest: number | null;
  away_days_rest: number | null;
  home_opponent_days_rest: number | null;
  away_opponent_days_rest: number | null;
  home_is_back_to_back: boolean | null;
  away_is_back_to_back: boolean | null;
  home_previous_event_id: string | null;
  away_previous_event_id: string | null;
  retrosheet_game_id: string | null;
  retrosheet_park_id: string | null;
  home_retrosheet_team_id: string | null;
  away_retrosheet_team_id: string | null;
  home_pregame_elo: number | null;
  away_pregame_elo: number | null;
  home_starter_pitcher_id: string | null;
  away_starter_pitcher_id: string | null;
  home_starter_rolling_game_score: number | null;
  away_starter_rolling_game_score: number | null;
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

function metadataString(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    if (direct && typeof direct === "object" && !Array.isArray(direct)) {
      for (const nestedValue of Object.values(direct as Record<string, unknown>)) {
        if (typeof nestedValue === "string" && nestedValue.trim()) return nestedValue.trim();
      }
    }
  }
  return null;
}

function divisionFrom(row: WarehouseRow, isHome: boolean) {
  return metadataString(isHome ? row.home_metadata_json : row.away_metadata_json, ["division", "divisionName", "mlbDivision"]);
}

function leagueFrom(row: WarehouseRow, isHome: boolean) {
  return metadataString(isHome ? row.home_metadata_json : row.away_metadata_json, ["league", "leagueName", "mlbLeague"]);
}

function travelSpot(previous: TeamGameHistory | null, currentIsHome: boolean) {
  if (!previous) return null;
  if (previous.isHome && currentIsHome) return "home_stand";
  if (!previous.isHome && !currentIsHome) return "road_trip";
  if (previous.isHome && !currentIsHome) return "home_to_road";
  return "road_to_home";
}

type TeamGameHistory = {
  eventId: string;
  startTime: Date;
  isHome: boolean;
  venue: string | null;
  runsScored: number;
  runsAllowed: number;
};

function daysBetween(previous: Date, current: Date) {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()) - Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth(), previous.getUTCDate())) / oneDay);
}

function applyDerivedTeamForm(rows: SharkTrendContextRow[]) {
  const histories = new Map<string, TeamGameHistory[]>();
  const seen = new Set<string>();

  for (const row of rows) {
    if (row.teamScore == null || row.opponentScore == null) continue;
    const key = `${row.teamCompetitorId}:${row.eventId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const startTime = new Date(row.startTime);
    if (Number.isNaN(startTime.getTime())) continue;
    const history = histories.get(row.teamCompetitorId) ?? [];
    history.push({
      eventId: row.eventId,
      startTime,
      isHome: row.isHome,
      venue: row.venue ?? null,
      runsScored: row.teamScore,
      runsAllowed: row.opponentScore
    });
    histories.set(row.teamCompetitorId, history);
  }

  for (const history of histories.values()) {
    history.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  return rows.map((row) => {
    const startTime = new Date(row.startTime);
    const teamHistory = (histories.get(row.teamCompetitorId) ?? []).filter((game) => game.startTime < startTime && game.eventId !== row.eventId);
    const opponentHistory = row.opponentCompetitorId
      ? (histories.get(row.opponentCompetitorId) ?? []).filter((game) => game.startTime < startTime && game.eventId !== row.eventId)
      : [];
    const previous = teamHistory.at(-1) ?? null;
    const opponentPrevious = opponentHistory.at(-1) ?? null;
    const dayGap = previous ? daysBetween(previous.startTime, startTime) : null;
    const opponentDayGap = opponentPrevious ? daysBetween(opponentPrevious.startTime, startTime) : null;
    const lastTwo = teamHistory.slice(-2);
    const lastThree = teamHistory.slice(-3);
    return {
      ...row,
      previousGameDate: previous?.startTime ?? row.previousGameDate,
      daysRest: row.daysRest ?? (dayGap === null ? null : Math.max(0, dayGap - 1)),
      opponentDaysRest: row.opponentDaysRest ?? (opponentDayGap === null ? null : Math.max(0, opponentDayGap - 1)),
      isBackToBack: row.isBackToBack ?? (dayGap === null ? null : dayGap <= 1),
      travelSpot: row.travelSpot ?? travelSpot(previous, row.isHome),
      lastGameRunsScored: row.lastGameRunsScored ?? previous?.runsScored ?? null,
      lastGameRunsAllowed: row.lastGameRunsAllowed ?? previous?.runsAllowed ?? null,
      lastTwoRunsScored: row.lastTwoRunsScored ?? (lastTwo.length === 2 ? lastTwo.reduce((sum, game) => sum + game.runsScored, 0) : null),
      lastThreeRunsScored: row.lastThreeRunsScored ?? (lastThree.length === 3 ? lastThree.reduce((sum, game) => sum + game.runsScored, 0) : null)
    };
  });
}

export function buildMlbContextRowsFromWarehouse(rows: WarehouseRow[]): SharkTrendContextRow[] {
  const baseRows = rows.flatMap((row) => {
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
    const teamDivision = divisionFrom(row, isHome);
    const opponentDivision = divisionFrom(row, !isHome);
    const teamLeague = leagueFrom(row, isHome);
    const opponentLeague = leagueFrom(row, !isHome);
    const teamPregameElo = isHome ? num(row.home_pregame_elo) : num(row.away_pregame_elo);
    const opponentPregameElo = isHome ? num(row.away_pregame_elo) : num(row.home_pregame_elo);
    const starterPitcherId = isHome ? row.home_starter_pitcher_id : row.away_starter_pitcher_id;
    const starterRollingGameScore = isHome ? num(row.home_starter_rolling_game_score) : num(row.away_starter_rolling_game_score);
    const participantDaysRest = isHome ? num(row.home_days_rest) : num(row.away_days_rest);
    const participantOpponentDaysRest = isHome ? num(row.home_opponent_days_rest) : num(row.away_opponent_days_rest);
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
      parkId: row.retrosheet_park_id,
      divisionGame: teamDivision && opponentDivision ? teamDivision === opponentDivision : null,
      isDayGame: Number.isNaN(startTime.getTime()) ? null : startTime.getUTCHours() < 22,
      isNightGame: Number.isNaN(startTime.getTime()) ? null : startTime.getUTCHours() >= 22,
      daysRest: participantDaysRest,
      opponentDaysRest: participantOpponentDaysRest,
      isBackToBack: isHome ? row.home_is_back_to_back : row.away_is_back_to_back,
      starterPitcherId,
      starterRollingGameScore,
      teamPregameElo,
      opponentPregameElo,
      eloDiff: teamPregameElo !== null && opponentPregameElo !== null ? teamPregameElo - opponentPregameElo : null,
      dataQualityScore: 0,
      dataWarnings: [],
      rawContextJson: {
        snapshotCount: Number(row.snapshot_count ?? 0),
        retrosheetGameId: row.retrosheet_game_id,
        homeRetrosheetTeamId: row.home_retrosheet_team_id,
        awayRetrosheetTeamId: row.away_retrosheet_team_id,
        teamDivision,
        opponentDivision,
        teamLeague,
        opponentLeague,
        previousEventId: isHome ? row.home_previous_event_id : row.away_previous_event_id
      }
    };
    const warnings = rowWarnings(base);
    base.dataQualityScore = scoreContextRow(base);
    base.dataWarnings = warnings;
    return [base];
  });
  return applyDerivedTeamForm(baseRows).map((row) => {
    row.dataQualityScore = scoreContextRow(row);
    row.dataWarnings = rowWarnings(row);
    return row;
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
  return (await prisma.$queryRawUnsafe(`
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
      home_c."metadataJson" AS home_metadata_json,
      away_c."metadataJson" AS away_metadata_json,
      home_c."externalIds" AS home_external_ids,
      away_c."externalIds" AS away_external_ids,
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
      snap_counts.snapshot_count,
      home_ctx."daysRest" AS home_days_rest,
      away_ctx."daysRest" AS away_days_rest,
      home_ctx."opponentRestDays" AS home_opponent_days_rest,
      away_ctx."opponentRestDays" AS away_opponent_days_rest,
      home_ctx."isBackToBack" AS home_is_back_to_back,
      away_ctx."isBackToBack" AS away_is_back_to_back,
      home_ctx."previousEventId" AS home_previous_event_id,
      away_ctx."previousEventId" AS away_previous_event_id,
      retrosheet_match."retrosheetGameId" AS retrosheet_game_id,
      retrosheet_match."parkId" AS retrosheet_park_id,
      ids.home_retrosheet_team_id,
      ids.away_retrosheet_team_id,
      home_elo."postGameElo" AS home_pregame_elo,
      away_elo."postGameElo" AS away_pregame_elo,
      home_starter.pitcher_id AS home_starter_pitcher_id,
      away_starter.pitcher_id AS away_starter_pitcher_id,
      home_starter_roll."rollingGameScore" AS home_starter_rolling_game_score,
      away_starter_roll."rollingGameScore" AS away_starter_rolling_game_score
    FROM event_markets em
    JOIN events e ON e.id = em."eventId"
    JOIN leagues l ON l.id = e."leagueId"
    LEFT JOIN sportsbooks sb ON sb.id = em."sportsbookId"
    LEFT JOIN event_results er ON er."eventId" = e.id
    LEFT JOIN event_participants home ON home."eventId" = e.id AND home.role = 'HOME'
    LEFT JOIN event_participants away ON away."eventId" = e.id AND away.role = 'AWAY'
    LEFT JOIN competitors home_c ON home_c.id = home."competitorId"
    LEFT JOIN competitors away_c ON away_c.id = away."competitorId"
    LEFT JOIN event_participant_context home_ctx ON home_ctx."eventId" = e.id AND home_ctx."competitorId" = home."competitorId"
    LEFT JOIN event_participant_context away_ctx ON away_ctx."eventId" = e.id AND away_ctx."competitorId" = away."competitorId"
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(home_c."externalIds" #>> '{retrosheet,teamId}', home_c."externalIds" #>> '{retrosheet,retrosheetTeamId}', home_c."externalIds"->>'retrosheetTeamId') AS home_retrosheet_team_id,
        COALESCE(away_c."externalIds" #>> '{retrosheet,teamId}', away_c."externalIds" #>> '{retrosheet,retrosheetTeamId}', away_c."externalIds"->>'retrosheetTeamId') AS away_retrosheet_team_id
    ) ids ON TRUE
    LEFT JOIN LATERAL (
      SELECT rg."retrosheetGameId", rg."parkId"
      FROM retrosheet_games rg
      WHERE rg."gameDate"::date = e."startTime"::date
        AND ids.home_retrosheet_team_id IS NOT NULL
        AND ids.away_retrosheet_team_id IS NOT NULL
        AND (
          (rg."homeTeamId" = ids.home_retrosheet_team_id AND rg."awayTeamId" = ids.away_retrosheet_team_id)
          OR (rg."homeTeamId" = ids.away_retrosheet_team_id AND rg."awayTeamId" = ids.home_retrosheet_team_id)
        )
      ORDER BY rg."gameDate" DESC
      LIMIT 1
    ) retrosheet_match ON TRUE
    LEFT JOIN LATERAL (
      SELECT elo."postGameElo"
      FROM mlb_team_elo_snapshots elo
      WHERE elo."teamId" = ids.home_retrosheet_team_id AND elo."gameDate" < e."startTime"
      ORDER BY elo."gameDate" DESC LIMIT 1
    ) home_elo ON TRUE
    LEFT JOIN LATERAL (
      SELECT elo."postGameElo"
      FROM mlb_team_elo_snapshots elo
      WHERE elo."teamId" = ids.away_retrosheet_team_id AND elo."gameDate" < e."startTime"
      ORDER BY elo."gameDate" DESC LIMIT 1
    ) away_elo ON TRUE
    LEFT JOIN LATERAL (
      SELECT p."pitcherId" AS pitcher_id
      FROM retrosheet_pitching_game_stats p
      WHERE p."retrosheetGameId" = retrosheet_match."retrosheetGameId" AND p."teamId" = ids.home_retrosheet_team_id AND p."isStarter" = true
      ORDER BY p.outs DESC LIMIT 1
    ) home_starter ON TRUE
    LEFT JOIN LATERAL (
      SELECT p."pitcherId" AS pitcher_id
      FROM retrosheet_pitching_game_stats p
      WHERE p."retrosheetGameId" = retrosheet_match."retrosheetGameId" AND p."teamId" = ids.away_retrosheet_team_id AND p."isStarter" = true
      ORDER BY p.outs DESC LIMIT 1
    ) away_starter ON TRUE
    LEFT JOIN LATERAL (
      SELECT ps."rollingGameScore"
      FROM mlb_pitcher_rolling_snapshots ps
      WHERE ps."pitcherId" = home_starter.pitcher_id AND ps."gameDate" < e."startTime"
      ORDER BY ps."gameDate" DESC LIMIT 1
    ) home_starter_roll ON TRUE
    LEFT JOIN LATERAL (
      SELECT ps."rollingGameScore"
      FROM mlb_pitcher_rolling_snapshots ps
      WHERE ps."pitcherId" = away_starter.pitcher_id AND ps."gameDate" < e."startTime"
      ORDER BY ps."gameDate" DESC LIMIT 1
    ) away_starter_roll ON TRUE
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
  `)) as WarehouseRow[];
}

function json(value: unknown): Prisma.JsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.JsonValue;
}

function nullableDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
      previous_game_date, days_rest, opponent_days_rest, is_back_to_back, travel_spot,
      last_game_runs_scored, last_game_runs_allowed, last_two_runs_scored, last_three_runs_scored,
      starter_pitcher_id, starter_pitcher_name, starter_rolling_game_score, team_pregame_elo,
      opponent_pregame_elo, elo_diff, weather_temp_f, wind_mph, wind_direction, wind_out, wind_in,
      data_quality_score, data_warnings, raw_context_json, updated_at
    ) VALUES (
      ${row.eventId}, ${row.eventMarketId}, ${row.sourceKey}, ${row.sportsbookKey}, ${row.sportsbookName}, ${row.season}, ${new Date(row.gameDate)}, ${new Date(row.startTime)},
      ${row.teamCompetitorId}, ${row.opponentCompetitorId}, ${row.teamName}, ${row.opponentName}, ${row.teamAbbr}, ${row.opponentAbbr},
      ${row.isHome}, ${row.side}, ${row.marketType}, ${row.line}, ${row.openingLine}, ${row.closingLine}, ${row.oddsAmerican}, ${row.openingOddsAmerican},
      ${row.closingOddsAmerican}, ${row.impliedProbability}, ${row.isFavorite}, ${row.isUnderdog}, ${row.favoritePriceBucket},
      ${row.moneylineBucket}, ${row.spreadBucket}, ${row.totalBucket}, ${row.teamScore}, ${row.opponentScore}, ${row.wonGame}, ${row.coverResult},
      ${row.ouResult}, ${row.totalRuns}, ${row.margin}, ${row.venue}, ${row.parkId}, ${row.divisionGame}, ${row.isDayGame}, ${row.isNightGame},
      ${nullableDate(row.previousGameDate)}, ${row.daysRest}, ${row.opponentDaysRest}, ${row.isBackToBack}, ${row.travelSpot},
      ${row.lastGameRunsScored}, ${row.lastGameRunsAllowed}, ${row.lastTwoRunsScored}, ${row.lastThreeRunsScored},
      ${row.starterPitcherId}, ${row.starterPitcherName}, ${row.starterRollingGameScore}, ${row.teamPregameElo},
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
      previous_game_date = EXCLUDED.previous_game_date,
      days_rest = EXCLUDED.days_rest,
      opponent_days_rest = EXCLUDED.opponent_days_rest,
      is_back_to_back = EXCLUDED.is_back_to_back,
      travel_spot = EXCLUDED.travel_spot,
      last_game_runs_scored = EXCLUDED.last_game_runs_scored,
      last_game_runs_allowed = EXCLUDED.last_game_runs_allowed,
      last_two_runs_scored = EXCLUDED.last_two_runs_scored,
      last_three_runs_scored = EXCLUDED.last_three_runs_scored,
      starter_pitcher_id = EXCLUDED.starter_pitcher_id,
      starter_pitcher_name = EXCLUDED.starter_pitcher_name,
      starter_rolling_game_score = EXCLUDED.starter_rolling_game_score,
      team_pregame_elo = EXCLUDED.team_pregame_elo,
      opponent_pregame_elo = EXCLUDED.opponent_pregame_elo,
      elo_diff = EXCLUDED.elo_diff,
      park_id = EXCLUDED.park_id,
      division_game = EXCLUDED.division_game,
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
