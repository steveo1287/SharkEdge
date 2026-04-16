export type MlbOutcomeDistribution = {
  homeWinProb: number;
  awayWinProb: number;
  coverProbHome: number;
  coverProbAway: number;
  overProb: number;
  underProb: number;
  expectedMargin: number;
  expectedTotal: number;
};

export type MlbCalibratedOutcome = {
  raw: MlbOutcomeDistribution;
  calibrated: MlbOutcomeDistribution;
  calibrationPenalty: number;
  marketAgreement: number;
  decisionScore: number;
};
