import { getLeagueTuning, SimTuningParams } from "./sim-tuning";

export async function getSimTuning(leagueKey?: string | null): Promise<SimTuningParams> {
  return getLeagueTuning(leagueKey);
}
