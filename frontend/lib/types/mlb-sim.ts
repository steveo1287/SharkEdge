export type MlbLeagueTotalsConfig = {
  targetRunsPerGame: number;
  targetHomeRunsPerGame: number;
  homeRunModifier: number;
  runModifier: number;
};

export type MlbAtBatProbabilityChain = {
  walkProb: number;
  strikeoutProb: number;
  contactProb: number;
  lineDriveProb: number;
  groundBallProb: number;
  flyBallProb: number;
  hardHitProb: number;
};

export type MlbPitcherBatterMatchup = {
  batterContact: number;
  batterPower: number;
  batterEye: number;
  pitcherStuff: number;
  pitcherControl: number;
  pitcherMovement: number;
};

export type MlbAtBatResolution = {
  chain: MlbAtBatProbabilityChain;
  expectedOutcomeValue: number;
  expectedRunsAdded: number;
};
