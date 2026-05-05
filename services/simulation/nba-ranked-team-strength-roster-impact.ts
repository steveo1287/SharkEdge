import { buildNbaPlayerTeamRankingSnapshot } from "@/services/simulation/nba-player-team-rankings";
import { buildNbaPlayerOverallWinnerEdge } from "@/services/simulation/nba-player-overall-winner-edge";
import { buildNbaPossessionScoreModel } from "@/services/simulation/nba-possession-score-model";
import {
  buildNbaTeamStrengthRosterImpact,
  type NbaTeamStrengthRosterImpact,
  type NbaTeamStrengthRosterInput
} from "@/services/simulation/nba-team-strength-roster-impact";

export type NbaRankedTeamStrengthRosterImpact = NbaTeamStrengthRosterImpact & {
  rankingSnapshot: ReturnType<typeof buildNbaPlayerTeamRankingSnapshot>;
  playerOverallEdge: ReturnType<typeof buildNbaPlayerOverallWinnerEdge>;
  possessionScoreModel: ReturnType<typeof buildNbaPossessionScoreModel>;
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
  const possessionScoreModel = buildNbaPossessionScoreModel({
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    projectedHomeMargin: input.projectedHomeMargin,
    projectedTotal: input.projectedTotal,
    playerStatProjections: input.playerStatProjections ?? []
  });
  const rankingDelta = rankingSnapshot.boundedProbabilityDelta;
  const playerOverallProbabilityDelta = playerOverallEdge.probabilityDelta;
  const possessionProbabilityDelta = clamp(possessionScoreModel.marginDelta * possessionScoreModel.confidence * 0.01, -0.022, 0.022);
  const combinedProbabilityDelta = clamp(base.probabilityDelta + rankingDelta + playerOverallProbabilityDelta + possessionProbabilityDelta, -0.07, 0.07);
  const boundedProbabilityDelta = round(clamp(base.boundedProbabilityDelta + rankingDelta + playerOverallProbabilityDelta + possessionProbabilityDelta, -0.0475, 0.0475), 4);
  const rankingMarginAdjustment = rankingSnapshot.homeCompositeEdge * rankingSnapshot.confidence * 1.35;
  const playerOverallMarginAdjustment = playerOverallEdge.marginDelta * 0.72;
  const possessionMarginAdjustment = possessionScoreModel.marginDelta * 0.58;
  const finalProjectedHomeMargin = round(clamp(base.finalProjectedHomeMargin + rankingMarginAdjustment + playerOverallMarginAdjustment + possessionMarginAdjustment, -17, 17), 3);
  const confidence = round(clamp((base.confidence * 0.56) + (rankingSnapshot.confidence * 0.14) + (playerOverallEdge.confidence * 0.16) + (possessionScoreModel.confidence * 0.14), 0.1, 0.96), 3);

  return {
    ...base,
    rankingSnapshot,
    playerOverallEdge,
    possessionScoreModel,
    finalProjectedHomeMargin,
    probabilityDelta: round(combinedProbabilityDelta, 4),
    boundedProbabilityDelta,
    confidence,
    warnings: [...new Set([...base.warnings, ...rankingSnapshot.warnings, ...playerOverallEdge.warnings, ...possessionScoreModel.warnings])],
    drivers: [
      ...base.drivers,
      `ranking overlay delta ${(rankingDelta * 100).toFixed(1)}%`,
      `ranking composite edge ${(rankingSnapshot.homeCompositeEdge * 100).toFixed(1)}%`,
      `ranking confidence ${(rankingSnapshot.confidence * 100).toFixed(1)}%`,
      `player overall delta ${(playerOverallProbabilityDelta * 100).toFixed(1)}%`,
      `player overall margin adjustment ${playerOverallMarginAdjustment.toFixed(2)}`,
      `player overall edge ${(playerOverallEdge.homeCompositeEdge * 100).toFixed(1)}%`,
      `possession score delta ${(possessionProbabilityDelta * 100).toFixed(1)}%`,
      `possession margin adjustment ${possessionMarginAdjustment.toFixed(2)}`,
      `possession projected score ${possessionScoreModel.projectedHomeScore.toFixed(1)}-${possessionScoreModel.projectedAwayScore.toFixed(1)}`,
      `possession projected total ${possessionScoreModel.projectedTotal.toFixed(1)}`,
      ...rankingSnapshot.drivers.map((driver) => `ranking: ${driver}`),
      ...playerOverallEdge.drivers.map((driver) => `player overall: ${driver}`),
      ...possessionScoreModel.drivers.map((driver) => `possession: ${driver}`)
    ]
  };
}
