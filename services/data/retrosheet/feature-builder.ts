import { MLB_POSTSEASON_K, MLB_REGULAR_SEASON_K } from "@/services/analytics/team-strength/mlb-elo-adjustments";

export type MlbEloGameInput = {
  retrosheetGameId: string;
  gameDate: Date;
  season: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  isPostseason?: boolean | null;
};

export type MlbTeamEloSnapshotInput = {
  teamId: string;
  season: number;
  gameDate: Date;
  retrosheetGameId: string;
  preGameElo: number;
  postGameElo: number;
  opponentTeamId: string;
  expectedWinProbability: number;
  actualResult: number;
  kFactor: number;
  isPostseason: boolean;
};

export function eloExpectedWinProbability(ratingA: number, ratingB: number) {
  assertFinite(ratingA, "ratingA");
  assertFinite(ratingB, "ratingB");
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export function updateMlbEloRatings(params: {
  homeRating: number;
  awayRating: number;
  homeScore: number;
  awayScore: number;
  isPostseason?: boolean | null;
}) {
  const expectedHome = eloExpectedWinProbability(params.homeRating, params.awayRating);
  const actualHome =
    params.homeScore > params.awayScore ? 1 : params.homeScore < params.awayScore ? 0 : 0.5;
  const kFactor = params.isPostseason ? MLB_POSTSEASON_K : MLB_REGULAR_SEASON_K;
  const homeDelta = kFactor * (actualHome - expectedHome);

  return {
    expectedHome,
    actualHome,
    kFactor,
    homePost: params.homeRating + homeDelta,
    awayPost: params.awayRating - homeDelta
  };
}

export function buildRollingMlbEloSnapshots(games: MlbEloGameInput[], baseRating = 1500) {
  const ratings = new Map<string, number>();
  const snapshots: MlbTeamEloSnapshotInput[] = [];

  [...games]
    .sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime() || a.retrosheetGameId.localeCompare(b.retrosheetGameId))
    .forEach((game) => {
      const homePre = ratings.get(game.homeTeamId) ?? baseRating;
      const awayPre = ratings.get(game.awayTeamId) ?? baseRating;
      const update = updateMlbEloRatings({
        homeRating: homePre,
        awayRating: awayPre,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        isPostseason: game.isPostseason
      });

      snapshots.push({
        teamId: game.homeTeamId,
        season: game.season,
        gameDate: game.gameDate,
        retrosheetGameId: game.retrosheetGameId,
        preGameElo: homePre,
        postGameElo: update.homePost,
        opponentTeamId: game.awayTeamId,
        expectedWinProbability: update.expectedHome,
        actualResult: update.actualHome,
        kFactor: update.kFactor,
        isPostseason: Boolean(game.isPostseason)
      });
      snapshots.push({
        teamId: game.awayTeamId,
        season: game.season,
        gameDate: game.gameDate,
        retrosheetGameId: game.retrosheetGameId,
        preGameElo: awayPre,
        postGameElo: update.awayPost,
        opponentTeamId: game.homeTeamId,
        expectedWinProbability: 1 - update.expectedHome,
        actualResult: 1 - update.actualHome,
        kFactor: update.kFactor,
        isPostseason: Boolean(game.isPostseason)
      });

      ratings.set(game.homeTeamId, update.homePost);
      ratings.set(game.awayTeamId, update.awayPost);
    });

  return snapshots;
}

function assertFinite(value: number, field: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`MLB Elo requires finite ${field}`);
  }
}
