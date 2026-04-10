import { filterRowsByConditions } from "../discovery/helpers";
import type { CandidateTrendSystem, HistoricalBetOpportunity } from "../types";

export function matchTrendSystemToRows(system: CandidateTrendSystem, rows: HistoricalBetOpportunity[]) {
  return filterRowsByConditions(
    rows.filter((row) => row.marketType === system.marketType && row.side === system.side && row.league === system.league),
    system.conditions
  );
}
