import { buildTrendSystemName } from "../name-builder";
import { expandConditionCombos } from "./combo-builder";
import { scoreTrendCandidate } from "./candidate-scorer";
import type { CandidateTrendSystem, HistoricalBetOpportunity, TrendCondition, TrendDiscoveryConfig } from "../types";

export function runBeamSearch(args: {
  rows: HistoricalBetOpportunity[];
  league: string;
  sport: string;
  marketType: CandidateTrendSystem["marketType"];
  side: CandidateTrendSystem["side"];
  atoms: TrendCondition[];
  config: TrendDiscoveryConfig;
}) {
  let beam: TrendCondition[][] = args.atoms.map((atom) => [atom]);
  const accepted: CandidateTrendSystem[] = [];

  for (let depth = 1; depth <= args.config.maxConditions; depth += 1) {
    const evaluated = beam.map((conditions) => {
      const scored = scoreTrendCandidate(args.rows, conditions);
      const sampleSize = scored.metrics.sampleSize;
      if (sampleSize < args.config.minSample) {
        return null;
      }
      if (scored.seasons.length < args.config.minSeasons) {
        return null;
      }
      if (scored.recentSampleSize < args.config.minRecentSample) {
        return null;
      }
      const id = [args.league, args.marketType, args.side, ...conditions.map((condition) => condition.label)].join(":").replace(/\s+/g, "-").toLowerCase();
      const warnings: string[] = [];
      if ((scored.metrics.avgClv ?? 0) < 0) {
        warnings.push("Negative average CLV.");
      }
      return {
        id,
        sport: args.sport,
        league: args.league,
        marketType: args.marketType,
        side: args.side,
        conditions,
        name: buildTrendSystemName({
          league: args.league,
          marketType: args.marketType,
          side: args.side,
          conditions
        }),
        shortLabel: conditions.map((condition) => condition.label).join(" • "),
        sampleSize: scored.metrics.sampleSize,
        wins: scored.metrics.wins,
        losses: scored.metrics.losses,
        pushes: scored.metrics.pushes,
        hitRate: scored.metrics.hitRate,
        roi: scored.metrics.roi,
        totalProfit: scored.metrics.totalProfit,
        avgClv: scored.metrics.avgClv,
        beatCloseRate: scored.metrics.beatCloseRate,
        seasons: scored.seasons,
        recentSampleSize: scored.recentSampleSize,
        score: scored.score,
        validationScore: scored.score,
        tier: "C",
        warnings,
        triggerEventIds: scored.rows.map((row) => row.eventId)
      } satisfies CandidateTrendSystem;
    }).filter(Boolean) as CandidateTrendSystem[];

    accepted.push(...evaluated);

    const topSeeds = evaluated.sort((left, right) => right.score - left.score).slice(0, args.config.beamWidth);
    beam = expandConditionCombos(
      topSeeds.map((system) => system.conditions),
      args.atoms,
      args.config.maxConditions
    );
  }

  return accepted;
}
