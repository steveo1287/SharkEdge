import { buildNbaPlayerTeamRankingSnapshot } from "@/services/simulation/nba-player-team-rankings";
import {
  buildNbaTeamStrengthRosterImpact,
  type NbaTeamStrengthRosterImpact,
  type NbaTeamStrengthRosterInput
} from "@/services/simulation/nba-team-strength-roster-impact";

export type NbaRankedTeamStrengthRosterImpact = NbaTeamStrengthRosterImpact & {
  rankingSnapshot: ReturnType<typeof buildNbaPlayerTeamRankingSnapshot>;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

export function buildNbaRankedTeamStrengthRosterImpact(input: NbaTeamStrengthRosterInput): NbaRankedTeamStrengthRosterImpact {
  const base = buildNbaTeamStrengthRosterImpact(input);
  const rankingSnapshot = buildNbaPlayerTeamRankingSnapshot({
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    playerStatProjections: input.playerStatProjections ?? []
  });
  const rankingDelta = rankingSnapshot.boundedProbabilityDelta;
  const combinedProbabilityDelta = clamp(base.probabilityDelta + rankingDelta, -0.06, 0.06);
  const boundedProbabilityDelta = round(clamp(base.boundedProbabilityDelta + rankingDelta, -0.04, 0.04), 4);
  const rankingMarginAdjustment = rankingSnapshot.homeCompositeEdge * rankingSnapshot.confidence * 1.35;
  const finalProjectedHomeMargin = round(clamp(base.finalProjectedHomeMargin + rankingMarginAdjustment, -17, 17), 3);
  const confidence = round(clamp((base.confidence * 0.78) + (rankingSnapshot.confidence * 0.22), 0.1, 0.96), 3);

  return {
    ...base,
    rankingSnapshot,
    finalProjectedHomeMargin,
    probabilityDelta: round(combinedProbabilityDelta, 4),
    boundedProbabilityDelta,
    confidence,
    warnings: [...new Set([...base.warnings, ...rankingSnapshot.warnings])],
    drivers: [
      ...base.drivers,
      `ranking overlay delta ${(rankingDelta * 100).toFixed(1)}%`,
      `ranking composite edge ${(rankingSnapshot.homeCompositeEdge * 100).toFixed(1)}%`,
      `ranking confidence ${(rankingSnapshot.confidence * 100).toFixed(1)}%`,
      ...rankingSnapshot.drivers.map((driver) => `ranking: ${driver}`)
    ]
  };
}
