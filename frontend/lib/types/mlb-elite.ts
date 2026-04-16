export type MlbLeagueEnvironment = {
  era: string;
  targetRunsPerGame: number;
  targetHomeRunsPerGame: number;
  targetStrikeoutsPerGame: number;
  targetWalksPerGame: number;
};

export type MlbPitchContext = {
  pitchCount: number;
  pitcherFatigue: number;
  batterFatigue: number;
  leverageIndex: number;
};

export type MlbContactQuality = {
  expectedBattingAverage: number;
  expectedSlugging: number;
  launchAngleScore: number;
  exitVelocityScore: number;
};

export type MlbEliteSimSnapshot = {
  eventId: string;
  leagueEnvironment: MlbLeagueEnvironment;
  homeExpectedRuns: number;
  awayExpectedRuns: number;
  normalizedTotal: number;
  parkWeatherDelta: number;
  bullpenFatigueDelta: number;
  topMicroDrivers: Array<{
    label: string;
    value: number;
    detail: string;
  }>;
};
