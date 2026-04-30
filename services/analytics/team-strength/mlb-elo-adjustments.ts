export type MlbPitcherGameScoreInput = {
  strikeouts: number;
  outs: number;
  walks: number;
  hits: number;
  runs: number;
  homeRuns: number;
};

export type MlbPregameEloAdjustmentInput = {
  isHome?: boolean | null;
  noFans?: boolean | null;
  milesTraveled?: number | null;
  restDays?: number | null;
  pitcherRollingGameScore?: number | null;
  teamRollingGameScore?: number | null;
  isOpener?: boolean | null;
};

export type MlbPregameEloAdjustment = {
  homeFieldAdjustment: number;
  travelAdjustment: number;
  restAdjustment: number;
  pitcherAdjustment: number;
  totalAdjustment: number;
  notes: string[];
};

export const MLB_ELO_BASE_RATING = 1500;
export const MLB_HOME_FIELD_ELO = 24;
export const MLB_NO_FANS_HOME_FIELD_ELO = 9.6;
export const MLB_TRAVEL_COEFFICIENT = -0.31;
export const MLB_REST_ELO_PER_DAY = 2.3;
export const MLB_MAX_REST_DAYS_CREDITED = 3;
export const MLB_PITCHER_RGS_MULTIPLIER = 4.7;
export const MLB_REGULAR_SEASON_K = 4;
export const MLB_POSTSEASON_K = 6;

export function mlbPitcherGameScore(params: MlbPitcherGameScoreInput) {
  assertNonNegative(params.strikeouts, "strikeouts");
  assertNonNegative(params.outs, "outs");
  assertNonNegative(params.walks, "walks");
  assertNonNegative(params.hits, "hits");
  assertNonNegative(params.runs, "runs");
  assertNonNegative(params.homeRuns, "homeRuns");

  return (
    47.4 +
    params.strikeouts +
    params.outs * 1.5 -
    params.walks * 2 -
    params.hits * 2 -
    params.runs * 3 -
    params.homeRuns * 4
  );
}

export function mlbTravelAdjustment(milesTraveled: number | null | undefined) {
  if (milesTraveled == null) return 0;
  assertNonNegative(milesTraveled, "milesTraveled");
  return Math.max(-4, Math.pow(milesTraveled, 1 / 3) * MLB_TRAVEL_COEFFICIENT);
}

export function mlbRestAdjustment(restDays: number | null | undefined) {
  if (restDays == null) return 0;
  assertNonNegative(restDays, "restDays");
  return Math.min(restDays, MLB_MAX_REST_DAYS_CREDITED) * MLB_REST_ELO_PER_DAY;
}

export function mlbHomeFieldAdjustment(params?: { isHome?: boolean | null; noFans?: boolean | null }) {
  if (!params?.isHome) return 0;
  return params.noFans ? MLB_NO_FANS_HOME_FIELD_ELO : MLB_HOME_FIELD_ELO;
}

export function mlbStartingPitcherAdjustment(params: {
  pitcherRollingGameScore?: number | null;
  teamRollingGameScore?: number | null;
  isOpener?: boolean | null;
}) {
  if (params.isOpener) return 0;
  if (params.pitcherRollingGameScore == null || params.teamRollingGameScore == null) return 0;
  assertFinite(params.pitcherRollingGameScore, "pitcherRollingGameScore");
  assertFinite(params.teamRollingGameScore, "teamRollingGameScore");
  return MLB_PITCHER_RGS_MULTIPLIER * (params.pitcherRollingGameScore - params.teamRollingGameScore);
}

export function mlbPregameEloAdjustment(params: MlbPregameEloAdjustmentInput): MlbPregameEloAdjustment {
  const homeFieldAdjustment = mlbHomeFieldAdjustment({
    isHome: params.isHome,
    noFans: params.noFans
  });
  const travelAdjustment = mlbTravelAdjustment(params.milesTraveled);
  const restAdjustment = mlbRestAdjustment(params.restDays);
  const pitcherAdjustment = mlbStartingPitcherAdjustment({
    pitcherRollingGameScore: params.pitcherRollingGameScore,
    teamRollingGameScore: params.teamRollingGameScore,
    isOpener: params.isOpener
  });
  const notes: string[] = [];

  if (homeFieldAdjustment !== 0) notes.push(`Home-field Elo ${round(homeFieldAdjustment, 1)}`);
  if (travelAdjustment !== 0) notes.push(`Travel Elo ${round(travelAdjustment, 1)}`);
  if (restAdjustment !== 0) notes.push(`Rest Elo ${round(restAdjustment, 1)}`);
  if (pitcherAdjustment !== 0) notes.push(`Starting pitcher Elo ${round(pitcherAdjustment, 1)}`);
  if (params.isOpener) notes.push("Opener detected: pitcher-specific adjustment suppressed");

  const totalAdjustment = homeFieldAdjustment + travelAdjustment + restAdjustment + pitcherAdjustment;

  return {
    homeFieldAdjustment,
    travelAdjustment,
    restAdjustment,
    pitcherAdjustment,
    totalAdjustment,
    notes
  };
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function assertFinite(value: number, field: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`MLB Elo adjustment requires finite ${field}`);
  }
}

function assertNonNegative(value: number, field: string) {
  assertFinite(value, field);
  if (value < 0) {
    throw new Error(`MLB Elo adjustment requires non-negative ${field}`);
  }
}
