import { americanToImpliedProbability } from "../metrics";
import { matchTrendSystemToRows } from "./system-matcher";
import { passesPriceGuard } from "./price-guard";
import { getTimingState } from "./timing-engine";
import type { ActiveTrendSignal, CandidateTrendSystem, HistoricalBetOpportunity } from "../types";

export function buildActiveTrendSignals(systems: CandidateTrendSystem[], rows: HistoricalBetOpportunity[]) {
  const signals: ActiveTrendSignal[] = [];

  for (const system of systems) {
    const matched = matchTrendSystemToRows(system, rows);
    for (const row of matched) {
      if (!passesPriceGuard(system, row)) {
        continue;
      }

      const trueProb = system.hitRate ?? null;
      const marketProb = americanToImpliedProbability(row.oddsAmerican);
      signals.push({
        systemId: system.id,
        eventId: row.eventId,
        gameDate: row.gameDate,
        league: row.league,
        sport: row.sport,
        marketType: row.marketType,
        side: row.side,
        systemName: system.name,
        currentLine: row.line,
        currentOdds: row.oddsAmerican,
        fairOdds: row.closeOddsAmerican,
        edgePct: trueProb !== null && marketProb !== null ? (trueProb - marketProb) * 100 : null,
        timingState: getTimingState(row),
        confidenceTier: system.tier,
        reasons: system.conditions.map((condition) => condition.label),
        eventLabel: row.homeTeam && row.awayTeam ? `${row.awayTeam} @ ${row.homeTeam}` : row.eventId
      });
    }
  }

  return signals;
}
