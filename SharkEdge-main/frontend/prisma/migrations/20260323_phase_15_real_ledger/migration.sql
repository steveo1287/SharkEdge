-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SportCode" AS ENUM ('BASKETBALL', 'BASEBALL', 'HOCKEY', 'FOOTBALL', 'MMA', 'BOXING', 'OTHER');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('PREGAME', 'LIVE', 'FINAL', 'POSTPONED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINAL', 'POSTPONED', 'CANCELED', 'DELAYED');

-- CreateEnum
CREATE TYPE "EventResultState" AS ENUM ('PENDING', 'OFFICIAL', 'VOID', 'NO_CONTEST');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('TEAM_HEAD_TO_HEAD', 'COMBAT_HEAD_TO_HEAD', 'OTHER');

-- CreateEnum
CREATE TYPE "CompetitorType" AS ENUM ('TEAM', 'ATHLETE', 'FIGHTER', 'OTHER');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('HOME', 'AWAY', 'COMPETITOR_A', 'COMPETITOR_B', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EventSyncState" AS ENUM ('FRESH', 'STALE', 'UNSUPPORTED', 'ERROR');

-- CreateEnum
CREATE TYPE "MarketType" AS ENUM ('spread', 'moneyline', 'total', 'team_total', 'player_points', 'player_rebounds', 'player_assists', 'player_threes', 'fight_winner', 'method_of_victory', 'round_total', 'round_winner', 'other');

-- CreateEnum
CREATE TYPE "PlayerStatus" AS ENUM ('ACTIVE', 'QUESTIONABLE', 'DOUBTFUL', 'OUT');

-- CreateEnum
CREATE TYPE "BetResult" AS ENUM ('OPEN', 'WIN', 'LOSS', 'PUSH', 'VOID', 'CASHED_OUT');

-- CreateEnum
CREATE TYPE "BetSource" AS ENUM ('MANUAL', 'IMPORTED', 'SYNCED');

-- CreateEnum
CREATE TYPE "BetType" AS ENUM ('STRAIGHT', 'PARLAY');

-- CreateTable
CREATE TABLE "sports" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" "SportCode" NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leagues" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sport" "SportCode" NOT NULL,
    "sportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leagues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "externalIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "externalIds" JSONB NOT NULL,
    "status" "PlayerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'PREGAME',
    "venue" TEXT,
    "scoreJson" JSONB,
    "liveStateJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "leagueId" TEXT,
    "teamId" TEXT,
    "playerId" TEXT,
    "key" TEXT NOT NULL,
    "type" "CompetitorType" NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "abbreviation" TEXT,
    "externalIds" JSONB,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "externalEventId" TEXT,
    "providerKey" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "resultState" "EventResultState" NOT NULL DEFAULT 'PENDING',
    "eventType" "EventType" NOT NULL DEFAULT 'TEAM_HEAD_TO_HEAD',
    "venue" TEXT,
    "scoreJson" JSONB,
    "stateJson" JSONB,
    "resultJson" JSONB,
    "metadataJson" JSONB,
    "syncState" "EventSyncState" NOT NULL DEFAULT 'STALE',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_participants" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'UNKNOWN',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isHome" BOOLEAN,
    "isWinner" BOOLEAN,
    "score" TEXT,
    "record" TEXT,
    "metadataJson" JSONB,

    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sportsbooks" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "logoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sportsbooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "markets" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "sportsbookId" TEXT NOT NULL,
    "marketType" "MarketType" NOT NULL,
    "period" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "playerId" TEXT,
    "line" DOUBLE PRECISION,
    "oddsAmerican" INTEGER NOT NULL,
    "oddsDecimal" DOUBLE PRECISION NOT NULL,
    "impliedProbability" DOUBLE PRECISION NOT NULL,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_markets" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sportsbookId" TEXT,
    "marketType" "MarketType" NOT NULL,
    "marketLabel" TEXT NOT NULL,
    "period" TEXT,
    "selection" TEXT NOT NULL,
    "side" TEXT,
    "line" DOUBLE PRECISION,
    "oddsAmerican" INTEGER NOT NULL,
    "oddsDecimal" DOUBLE PRECISION NOT NULL,
    "impliedProbability" DOUBLE PRECISION,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "sourceKey" TEXT,
    "selectionCompetitorId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_snapshots" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "line" DOUBLE PRECISION,
    "oddsAmerican" INTEGER NOT NULL,
    "impliedProbability" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "market_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_market_snapshots" (
    "id" TEXT NOT NULL,
    "eventMarketId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "line" DOUBLE PRECISION,
    "oddsAmerican" INTEGER NOT NULL,
    "impliedProbability" DOUBLE PRECISION,

    CONSTRAINT "event_market_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_game_stats" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "statsJson" JSONB NOT NULL,
    "minutes" DOUBLE PRECISION,
    "starter" BOOLEAN NOT NULL DEFAULT false,
    "outcomeStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_game_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_game_stats" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "statsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_game_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "injuries" (
    "id" TEXT NOT NULL,
    "playerId" TEXT,
    "teamId" TEXT,
    "gameId" TEXT,
    "status" "PlayerStatus" NOT NULL,
    "source" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "injuries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "bankrollSettingsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bets" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "source" "BetSource" NOT NULL DEFAULT 'MANUAL',
    "betType" "BetType" NOT NULL DEFAULT 'STRAIGHT',
    "sport" "SportCode" NOT NULL,
    "league" TEXT NOT NULL,
    "eventId" TEXT,
    "gameId" TEXT,
    "playerId" TEXT,
    "primaryCompetitorId" TEXT,
    "marketType" "MarketType" NOT NULL,
    "marketLabel" TEXT NOT NULL,
    "selection" TEXT NOT NULL,
    "side" TEXT,
    "line" DOUBLE PRECISION,
    "oddsAmerican" INTEGER NOT NULL,
    "oddsDecimal" DOUBLE PRECISION NOT NULL,
    "impliedProbability" DOUBLE PRECISION,
    "sportsbookId" TEXT,
    "stake" DOUBLE PRECISION NOT NULL,
    "riskAmount" DOUBLE PRECISION NOT NULL,
    "toWin" DOUBLE PRECISION NOT NULL,
    "payout" DOUBLE PRECISION,
    "result" "BetResult" NOT NULL DEFAULT 'OPEN',
    "closingLine" DOUBLE PRECISION,
    "closingOddsAmerican" INTEGER,
    "closingOddsDecimal" DOUBLE PRECISION,
    "closingImpliedProbability" DOUBLE PRECISION,
    "clvValue" DOUBLE PRECISION,
    "clvPercentage" DOUBLE PRECISION,
    "notes" TEXT,
    "tagsJson" JSONB,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bet_legs" (
    "id" TEXT NOT NULL,
    "betId" TEXT NOT NULL,
    "eventId" TEXT,
    "eventMarketId" TEXT,
    "sportsbookId" TEXT,
    "playerId" TEXT,
    "selectionCompetitorId" TEXT,
    "marketType" "MarketType" NOT NULL,
    "marketLabel" TEXT NOT NULL,
    "selection" TEXT NOT NULL,
    "side" TEXT,
    "line" DOUBLE PRECISION,
    "oddsAmerican" INTEGER NOT NULL,
    "oddsDecimal" DOUBLE PRECISION NOT NULL,
    "impliedProbability" DOUBLE PRECISION,
    "result" "BetResult" NOT NULL DEFAULT 'OPEN',
    "closingLine" DOUBLE PRECISION,
    "closingOddsAmerican" INTEGER,
    "closingOddsDecimal" DOUBLE PRECISION,
    "closingImpliedProbability" DOUBLE PRECISION,
    "clvValue" DOUBLE PRECISION,
    "clvPercentage" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bet_legs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_trends" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sport" "SportCode" NOT NULL,
    "queryJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_trends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_runs" (
    "id" TEXT NOT NULL,
    "savedTrendId" TEXT,
    "userId" TEXT,
    "queryJson" JSONB NOT NULL,
    "resultJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trend_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sports_key_key" ON "sports"("key");

-- CreateIndex
CREATE INDEX "sports_code_key_idx" ON "sports"("code", "key");

-- CreateIndex
CREATE UNIQUE INDEX "leagues_key_key" ON "leagues"("key");

-- CreateIndex
CREATE INDEX "leagues_sport_key_idx" ON "leagues"("sport", "key");

-- CreateIndex
CREATE INDEX "leagues_sportId_key_idx" ON "leagues"("sportId", "key");

-- CreateIndex
CREATE INDEX "teams_leagueId_abbreviation_idx" ON "teams"("leagueId", "abbreviation");

-- CreateIndex
CREATE INDEX "players_leagueId_teamId_idx" ON "players"("leagueId", "teamId");

-- CreateIndex
CREATE INDEX "players_name_idx" ON "players"("name");

-- CreateIndex
CREATE UNIQUE INDEX "games_externalEventId_key" ON "games"("externalEventId");

-- CreateIndex
CREATE INDEX "games_leagueId_startTime_idx" ON "games"("leagueId", "startTime");

-- CreateIndex
CREATE INDEX "games_status_startTime_idx" ON "games"("status", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "competitors_key_key" ON "competitors"("key");

-- CreateIndex
CREATE INDEX "competitors_sportId_leagueId_name_idx" ON "competitors"("sportId", "leagueId", "name");

-- CreateIndex
CREATE INDEX "competitors_teamId_idx" ON "competitors"("teamId");

-- CreateIndex
CREATE INDEX "competitors_playerId_idx" ON "competitors"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "events_externalEventId_key" ON "events"("externalEventId");

-- CreateIndex
CREATE INDEX "events_leagueId_startTime_idx" ON "events"("leagueId", "startTime");

-- CreateIndex
CREATE INDEX "events_status_startTime_idx" ON "events"("status", "startTime");

-- CreateIndex
CREATE INDEX "events_sportId_startTime_idx" ON "events"("sportId", "startTime");

-- CreateIndex
CREATE INDEX "event_participants_eventId_role_sortOrder_idx" ON "event_participants"("eventId", "role", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "event_participants_eventId_competitorId_key" ON "event_participants"("eventId", "competitorId");

-- CreateIndex
CREATE UNIQUE INDEX "sportsbooks_key_key" ON "sportsbooks"("key");

-- CreateIndex
CREATE INDEX "sportsbooks_region_key_idx" ON "sportsbooks"("region", "key");

-- CreateIndex
CREATE INDEX "markets_gameId_marketType_sportsbookId_idx" ON "markets"("gameId", "marketType", "sportsbookId");

-- CreateIndex
CREATE INDEX "markets_playerId_marketType_idx" ON "markets"("playerId", "marketType");

-- CreateIndex
CREATE INDEX "markets_updatedAt_idx" ON "markets"("updatedAt");

-- CreateIndex
CREATE INDEX "event_markets_eventId_marketType_sportsbookId_idx" ON "event_markets"("eventId", "marketType", "sportsbookId");

-- CreateIndex
CREATE INDEX "event_markets_selectionCompetitorId_marketType_idx" ON "event_markets"("selectionCompetitorId", "marketType");

-- CreateIndex
CREATE INDEX "event_markets_updatedAt_idx" ON "event_markets"("updatedAt");

-- CreateIndex
CREATE INDEX "market_snapshots_marketId_capturedAt_idx" ON "market_snapshots"("marketId", "capturedAt");

-- CreateIndex
CREATE INDEX "event_market_snapshots_eventMarketId_capturedAt_idx" ON "event_market_snapshots"("eventMarketId", "capturedAt");

-- CreateIndex
CREATE INDEX "player_game_stats_playerId_gameId_idx" ON "player_game_stats"("playerId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "player_game_stats_gameId_playerId_key" ON "player_game_stats"("gameId", "playerId");

-- CreateIndex
CREATE INDEX "team_game_stats_teamId_gameId_idx" ON "team_game_stats"("teamId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "team_game_stats_gameId_teamId_key" ON "team_game_stats"("gameId", "teamId");

-- CreateIndex
CREATE INDEX "injuries_gameId_status_idx" ON "injuries"("gameId", "status");

-- CreateIndex
CREATE INDEX "injuries_teamId_reportedAt_idx" ON "injuries"("teamId", "reportedAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "bets_placedAt_result_idx" ON "bets"("placedAt", "result");

-- CreateIndex
CREATE INDEX "bets_sport_league_result_idx" ON "bets"("sport", "league", "result");

-- CreateIndex
CREATE INDEX "bets_sportsbookId_result_idx" ON "bets"("sportsbookId", "result");

-- CreateIndex
CREATE INDEX "bets_eventId_result_idx" ON "bets"("eventId", "result");

-- CreateIndex
CREATE INDEX "bets_archivedAt_result_idx" ON "bets"("archivedAt", "result");

-- CreateIndex
CREATE INDEX "bet_legs_betId_sortOrder_idx" ON "bet_legs"("betId", "sortOrder");

-- CreateIndex
CREATE INDEX "bet_legs_eventId_result_idx" ON "bet_legs"("eventId", "result");

-- CreateIndex
CREATE INDEX "bet_legs_selectionCompetitorId_idx" ON "bet_legs"("selectionCompetitorId");

-- CreateIndex
CREATE INDEX "saved_trends_userId_sport_idx" ON "saved_trends"("userId", "sport");

-- CreateIndex
CREATE INDEX "trend_runs_userId_createdAt_idx" ON "trend_runs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "trend_runs_savedTrendId_createdAt_idx" ON "trend_runs"("savedTrendId", "createdAt");

-- AddForeignKey
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "sports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_sportsbookId_fkey" FOREIGN KEY ("sportsbookId") REFERENCES "sportsbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_markets" ADD CONSTRAINT "event_markets_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_markets" ADD CONSTRAINT "event_markets_sportsbookId_fkey" FOREIGN KEY ("sportsbookId") REFERENCES "sportsbooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_markets" ADD CONSTRAINT "event_markets_selectionCompetitorId_fkey" FOREIGN KEY ("selectionCompetitorId") REFERENCES "competitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_market_snapshots" ADD CONSTRAINT "event_market_snapshots_eventMarketId_fkey" FOREIGN KEY ("eventMarketId") REFERENCES "event_markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_game_stats" ADD CONSTRAINT "team_game_stats_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_game_stats" ADD CONSTRAINT "team_game_stats_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_primaryCompetitorId_fkey" FOREIGN KEY ("primaryCompetitorId") REFERENCES "competitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_sportsbookId_fkey" FOREIGN KEY ("sportsbookId") REFERENCES "sportsbooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bet_legs" ADD CONSTRAINT "bet_legs_betId_fkey" FOREIGN KEY ("betId") REFERENCES "bets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bet_legs" ADD CONSTRAINT "bet_legs_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bet_legs" ADD CONSTRAINT "bet_legs_eventMarketId_fkey" FOREIGN KEY ("eventMarketId") REFERENCES "event_markets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bet_legs" ADD CONSTRAINT "bet_legs_sportsbookId_fkey" FOREIGN KEY ("sportsbookId") REFERENCES "sportsbooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bet_legs" ADD CONSTRAINT "bet_legs_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bet_legs" ADD CONSTRAINT "bet_legs_selectionCompetitorId_fkey" FOREIGN KEY ("selectionCompetitorId") REFERENCES "competitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_trends" ADD CONSTRAINT "saved_trends_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_runs" ADD CONSTRAINT "trend_runs_savedTrendId_fkey" FOREIGN KEY ("savedTrendId") REFERENCES "saved_trends"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_runs" ADD CONSTRAINT "trend_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

