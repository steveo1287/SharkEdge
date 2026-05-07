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

const LEAGUE_TUNING_OVERRIDES: Partial<Record<string, SimTuningParams>> = {
  MLB: { calibrationScale: 1, varianceScale: 1.12, matchupWeight: 1, paceWeight: 1 }
};

export function getLeagueTuning(leagueKey?: string | null): SimTuningParams {
  return (leagueKey ? LEAGUE_TUNING_OVERRIDES[leagueKey] : null) ?? DEFAULT_TUNING;
}
