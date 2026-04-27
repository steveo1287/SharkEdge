export type SimTuningParams = {
  calibrationScale: number;
  varianceScale: number;
  matchupWeight: number;
  paceWeight: number;
};

export const DEFAULT_TUNING: SimTuningParams = {
  calibrationScale: 1,
  varianceScale: 1,
  matchupWeight: 1,
  paceWeight: 1
};
