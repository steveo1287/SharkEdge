import { americanToImpliedProbability } from "../metrics";
import { matchTrendSystemToRows } from "./system-matcher";
import { passesPriceGuard } from "./price-guard";
import { getTimingState } from "./timing-engine";
import { buildTrendPosterior } from "../posterior/trend-posterior";
import type { ActiveTrendSignal, CandidateTrendSystem, HistoricalBetOpportunity } from "../types";

export function buildActiveTrendSignals(systems: CandidateTrendSystem[], rows: HistoricalBetOpportunity[]) {
  const signals: ActiveTrendSignal[] = [];

  for (const system of systems) {
    const matched = matchTrendSystemToRows(system, rows);
    for (const row of matched) {
      if (!passesPriceGuard(system, row)) {
        continue;
      }

      const marketProb = americanToImpliedProbability(row.oddsAmerican);
      const posterior = buildTrendPosterior({
        hitRate: system.hitRate ?? null,
        marketProbability: marketProb,
        sampleSize: system.sampleSize,
        recentSampleSize: system.recentSampleSize,
        avgClv: system.avgClv,
        beatCloseRate: system.beatCloseRate,
        validationScore: system.validationScore
      });

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
        fairOdds: posterior.fairOddsAmerican,
        edgePct:
          posterior.posteriorProbability !== null && marketProb !== null
            ? Number(((posterior.posteriorProbability - marketProb) * 100).toFixed(2))
            : null,
        posteriorProbability: posterior.posteriorProbability,
        marketProbability: posterior.baselineProbability,
        trendLiftPct: posterior.shrunkLiftPct,
        uncertaintyScore: posterior.uncertaintyScore,
        reliabilityScore: posterior.reliabilityScore,
        supportScore: posterior.supportScore,
        timingState: getTimingState(row),
        confidenceTier: system.tier,
        reasons: [
          ...system.conditions.map((condition) => condition.label),
          posterior.summary
        ],
        eventLabel: row.homeTeam && row.awayTeam ? `${row.awayTeam} @ ${row.homeTeam}` : row.eventId
      });
    }
  }

  return signals;
}
