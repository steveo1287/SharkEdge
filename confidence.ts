import type { HistoricalBetOpportunity, TimingState } from "../types";

export function getTimingState(row: HistoricalBetOpportunity): TimingState {
  const start = new Date(row.gameDate).getTime();
  const deltaMinutes = (start - Date.now()) / 60000;

  if (deltaMinutes > 720) {
    return "EARLY";
  }
  if (deltaMinutes > 180) {
    return "BUILDING";
  }
  if (deltaMinutes > 45) {
    return "PEAK";
  }
  if (deltaMinutes > 0) {
    return "LATE";
  }
  return "DEAD";
}
