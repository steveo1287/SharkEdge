-- Retrosheet historical MLB warehouse and derived feature snapshots.
-- Data is imported only from local CSV files; no runtime request path downloads Retrosheet data.

CREATE TABLE "retrosheet_games" (
    "id" TEXT NOT NULL,
    "retrosheetGameId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL DEFAULT 'RETROSHEET',
    "gameDate" TIMESTAMP(3) NOT NULL,
    "season" INTEGER NOT NULL,
    "gameNumber" INTEGER,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "parkId" TEXT,
    "isPostseason" BOOLEAN NOT NULL DEFAULT false,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "retrosheet_games_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retrosheet_team_game_stats" (
    "id" TEXT NOT NULL,
    "retrosheetGameId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "opponentTeamId" TEXT,
    "isHome" BOOLEAN NOT NULL,
    "sourceKey" TEXT NOT NULL DEFAULT 'RETROSHEET',
    "gameDate" TIMESTAMP(3) NOT NULL,
    "season" INTEGER NOT NULL,
    "runs" INTEGER NOT NULL,
    "runsAllowed" INTEGER NOT NULL,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "retrosheet_team_game_stats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retrosheet_pitching_game_stats" (
    "id" TEXT NOT NULL,
    "retrosheetGameId" TEXT NOT NULL,
    "pitcherId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL DEFAULT 'RETROSHEET',
    "gameDate" TIMESTAMP(3) NOT NULL,
    "season" INTEGER NOT NULL,
    "isStarter" BOOLEAN NOT NULL DEFAULT false,
    "isHome" BOOLEAN,
    "outs" INTEGER NOT NULL,
    "strikeouts" INTEGER NOT NULL,
    "walks" INTEGER NOT NULL,
    "hits" INTEGER NOT NULL,
    "runs" INTEGER NOT NULL,
    "homeRuns" INTEGER NOT NULL,
    "gameScore" DOUBLE PRECISION NOT NULL,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "retrosheet_pitching_game_stats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mlb_team_elo_snapshots" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL DEFAULT 'RETROSHEET',
    "teamId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "gameDate" TIMESTAMP(3) NOT NULL,
    "retrosheetGameId" TEXT,
    "preGameElo" DOUBLE PRECISION NOT NULL,
    "postGameElo" DOUBLE PRECISION NOT NULL,
    "opponentTeamId" TEXT,
    "expectedWinProbability" DOUBLE PRECISION,
    "actualResult" DOUBLE PRECISION,
    "kFactor" DOUBLE PRECISION NOT NULL,
    "isPostseason" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mlb_team_elo_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mlb_pitcher_rolling_snapshots" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL DEFAULT 'RETROSHEET',
    "pitcherId" TEXT NOT NULL,
    "teamId" TEXT,
    "season" INTEGER NOT NULL,
    "gameDate" TIMESTAMP(3) NOT NULL,
    "retrosheetGameId" TEXT,
    "rollingGameScore" DOUBLE PRECISION NOT NULL,
    "gamesIncluded" INTEGER NOT NULL,
    "gameScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mlb_pitcher_rolling_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "retrosheet_games_retrosheetGameId_key" ON "retrosheet_games"("retrosheetGameId");
CREATE INDEX "retrosheet_games_season_gameDate_idx" ON "retrosheet_games"("season", "gameDate");
CREATE INDEX "retrosheet_games_homeTeamId_gameDate_idx" ON "retrosheet_games"("homeTeamId", "gameDate");
CREATE INDEX "retrosheet_games_awayTeamId_gameDate_idx" ON "retrosheet_games"("awayTeamId", "gameDate");

CREATE UNIQUE INDEX "retrosheet_team_game_stats_retrosheetGameId_teamId_key" ON "retrosheet_team_game_stats"("retrosheetGameId", "teamId");
CREATE INDEX "retrosheet_team_game_stats_teamId_gameDate_idx" ON "retrosheet_team_game_stats"("teamId", "gameDate");
CREATE INDEX "retrosheet_team_game_stats_sourceKey_teamId_gameDate_idx" ON "retrosheet_team_game_stats"("sourceKey", "teamId", "gameDate");

CREATE UNIQUE INDEX "retrosheet_pitching_game_stats_retrosheetGameId_pitcherId_teamId_key" ON "retrosheet_pitching_game_stats"("retrosheetGameId", "pitcherId", "teamId");
CREATE INDEX "retrosheet_pitching_game_stats_pitcherId_gameDate_idx" ON "retrosheet_pitching_game_stats"("pitcherId", "gameDate");
CREATE INDEX "retrosheet_pitching_game_stats_teamId_gameDate_idx" ON "retrosheet_pitching_game_stats"("teamId", "gameDate");
CREATE INDEX "retrosheet_pitching_game_stats_sourceKey_pitcherId_gameDate_idx" ON "retrosheet_pitching_game_stats"("sourceKey", "pitcherId", "gameDate");

CREATE UNIQUE INDEX "mlb_team_elo_snapshots_teamId_retrosheetGameId_key" ON "mlb_team_elo_snapshots"("teamId", "retrosheetGameId");
CREATE INDEX "mlb_team_elo_snapshots_teamId_gameDate_idx" ON "mlb_team_elo_snapshots"("teamId", "gameDate");
CREATE INDEX "mlb_team_elo_snapshots_sourceKey_teamId_gameDate_idx" ON "mlb_team_elo_snapshots"("sourceKey", "teamId", "gameDate");

CREATE UNIQUE INDEX "mlb_pitcher_rolling_snapshots_pitcherId_retrosheetGameId_key" ON "mlb_pitcher_rolling_snapshots"("pitcherId", "retrosheetGameId");
CREATE INDEX "mlb_pitcher_rolling_snapshots_pitcherId_gameDate_idx" ON "mlb_pitcher_rolling_snapshots"("pitcherId", "gameDate");
CREATE INDEX "mlb_pitcher_rolling_snapshots_teamId_gameDate_idx" ON "mlb_pitcher_rolling_snapshots"("teamId", "gameDate");
CREATE INDEX "mlb_pitcher_rolling_snapshots_sourceKey_pitcherId_gameDate_idx" ON "mlb_pitcher_rolling_snapshots"("sourceKey", "pitcherId", "gameDate");

ALTER TABLE "retrosheet_team_game_stats" ADD CONSTRAINT "retrosheet_team_game_stats_retrosheetGameId_fkey" FOREIGN KEY ("retrosheetGameId") REFERENCES "retrosheet_games"("retrosheetGameId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retrosheet_pitching_game_stats" ADD CONSTRAINT "retrosheet_pitching_game_stats_retrosheetGameId_fkey" FOREIGN KEY ("retrosheetGameId") REFERENCES "retrosheet_games"("retrosheetGameId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mlb_team_elo_snapshots" ADD CONSTRAINT "mlb_team_elo_snapshots_retrosheetGameId_fkey" FOREIGN KEY ("retrosheetGameId") REFERENCES "retrosheet_games"("retrosheetGameId") ON DELETE SET NULL ON UPDATE CASCADE;
