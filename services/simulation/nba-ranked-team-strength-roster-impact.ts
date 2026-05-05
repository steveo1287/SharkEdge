import { buildNbaPlayerTeamRankingSnapshot } from "@/services/simulation/nba-player-team-rankings";
import { buildNbaPlayerOverallWinnerEdge } from "@/services/simulation/nba-player-overall-winner-edge";
import {
  buildNbaTeamStrengthRosterImpact,
  type NbaTeamStrengthRosterImpact,
  type NbaTeamStrengthRosterInput
} from "@/services/simulation/nba-team-strength-roster-impact";

export type NbaRankedTeamStrengthRosterImpact = NbaTeamStrengthRosterImpact & {
  rankingSnapshot: ReturnType<typeof buildNbaPlayerTeamRankingSnapshot>;
  playerOverallEdge: ReturnType<typeof buildNbaPlayerOverallWinnerEdge>;
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
  const playerOverallEdge = buildNbaPlayerOverallWinnerEdge({
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    playerStatProjections: input.playerStatProjections ?? []
  });
  const rankingDelta = rankingSnapshot.boundedProbabilityDelta;
  const playerOverallProbabilityDelta = playerOverallEdge.probabilityDelta;
  const combinedProbabilityDelta = clamp(base.probabilityDelta + rankingDelta + playerOverallProbabilityDelta, -0.065, 0.065);
  const boundedProbabilityDelta = round(clamp(base.boundedProbabilityDelta + rankingDelta + playerOverallProbabilityDelta, -0.045, 0.045), 4);
  const rankingMarginAdjustment = rankingSnapshot.homeCompositeEdge * rankingSnapshot.confidence * 1.35;
  const playerOverallMarginAdjustment = playerOverallEdge.marginDelta * 0.72;
  const finalProjectedHomeMargin = round(clamp(base.finalProjectedHomeMargin + rankingMarginAdjustment + playerOverallMarginAdjustment, -17, 17), 3);
  const confidence = round(clamp((base.confidence * 0.66) + (rankingSnapshot.confidence * 0.16) + (playerOverallEdge.confidence * 0.18), 0.1, 0.96), 3);

  return {
    ...base,
    rankingSnapshot,
    playerOverallEdge,
    finalProjectedHomeMargin,
    probabilityDelta: round(combinedProbabilityDelta, 4),
    boundedProbabilityDelta,
    confidence,
    warnings: [...new Set([...base.warnings, ...rankingSnapshot.warnings, ...playerOverallEdge.warnings])],
    drivers: [
      ...base.drivers,
      `ranking overlay delta ${(rankingDelta * 100).toFixed(1)}%`,
      `ranking composite edge ${(rankingSnapshot.homeCompositeEdge * 100).toFixed(1)}%`,
      `ranking confidence ${(rankingSnapshot.confidence * 100).toFixed(1)}%`,
      `player overall delta ${(playerOverallProbabilityDelta * 100).toFixed(1)}%`,
      `player overall margin adjustment ${playerOverallMarginAdjustment.toFixed(2)}`,
      `player overall edge ${(playerOverallEdge.homeCompositeEdge * 100).toFixed(1)}%`,
      ...rankingSnapshot.drivers.map((driver) => `ranking: ${driver}`),
      ...playerOverallEdge.drivers.map((driver) => `player overall: ${driver}`)
    ]
  };
}
