import { buildNbaPlayerTeamRankingSnapshot } from "@/services/simulation/nba-player-team-rankings";
import { buildNbaPlayerOverallWinnerEdge } from "@/services/simulation/nba-player-overall-winner-edge";
import { buildNbaPossessionScoreModel } from "@/services/simulation/nba-possession-score-model";
import { buildNbaDefensiveEventEdge } from "@/services/simulation/nba-defensive-event-edge";
import { buildNbaCloseGameLeverageEdge } from "@/services/simulation/nba-close-game-leverage-edge";
import { buildNbaCoachingPaceProfile } from "@/services/simulation/nba-coaching-pace-profile";
import { buildNbaRestFatigueEdge } from "@/services/simulation/nba-rest-fatigue-edge";
import { buildNbaWinnerSignalConsensus } from "@/services/simulation/nba-winner-signal-consensus";
import {
  buildNbaTeamStrengthRosterImpact,
  type NbaTeamStrengthRosterImpact,
  type NbaTeamStrengthRosterInput
} from "@/services/simulation/nba-team-strength-roster-impact";

export type NbaRankedTeamStrengthRosterImpact = NbaTeamStrengthRosterImpact & {
  rankingSnapshot: ReturnType<typeof buildNbaPlayerTeamRankingSnapshot>;
  playerOverallEdge: ReturnType<typeof buildNbaPlayerOverallWinnerEdge>;
  possessionScoreModel: ReturnType<typeof buildNbaPossessionScoreModel>;
  defensiveEventEdge: ReturnType<typeof buildNbaDefensiveEventEdge>;
  closeGameLeverageEdge: ReturnType<typeof buildNbaCloseGameLeverageEdge>;
  coachingPaceProfile: ReturnType<typeof buildNbaCoachingPaceProfile>;
  restFatigueEdge: ReturnType<typeof buildNbaRestFatigueEdge>;
  signalConsensus: ReturnType<typeof buildNbaWinnerSignalConsensus>;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function consensusCap(status: ReturnType<typeof buildNbaWinnerSignalConsensus>["status"]) {
  switch (status) {
    case "GREEN": return 0.0525;
    case "YELLOW": return 0.035;
    case "RED": return 0.0125;
    case "INSUFFICIENT": return 0.018;
  }
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
  const defensiveEventEdge = buildNbaDefensiveEventEdge({
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    playerStatProjections: input.playerStatProjections ?? []
  });
  const closeGameLeverageEdge = buildNbaCloseGameLeverageEdge({
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    projectedHomeMargin: input.projectedHomeMargin,
    playerStatProjections: input.playerStatProjections ?? []
  });
  const coachingPaceProfile = buildNbaCoachingPaceProfile({
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    projectedHomeMargin: input.projectedHomeMargin,
    projectedTotal: input.projectedTotal,
    realityIntel: input.realityIntel,
    playerStatProjections: input.playerStatProjections ?? []
  });
  const restFatigueEdge = buildNbaRestFatigueEdge({
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    projectedHomeMargin: input.projectedHomeMargin,
    realityIntel: input.realityIntel,
    playerStatProjections: input.playerStatProjections ?? []
  });

  const baseMarginAdjustment = clamp(base.finalProjectedHomeMargin - input.projectedHomeMargin, -5.5, 5.5);
  const rankingDelta = rankingSnapshot.boundedProbabilityDelta;
  const rankingMarginAdjustment = rankingSnapshot.homeCompositeEdge * rankingSnapshot.confidence * 1.35;
  const playerOverallProbabilityDelta = playerOverallEdge.probabilityDelta;
  const playerOverallMarginAdjustment = playerOverallEdge.marginDelta * 0.72;
  const possessionProbabilityDelta = clamp(possessionScoreModel.marginDelta * possessionScoreModel.confidence * 0.01, -0.022, 0.022);
  const possessionMarginAdjustment = possessionScoreModel.marginDelta * 0.58;
  const defensiveEventProbabilityDelta = defensiveEventEdge.probabilityDelta;
  const defensiveEventMarginAdjustment = defensiveEventEdge.marginDelta * 0.56;
  const closeGameProbabilityDelta = closeGameLeverageEdge.probabilityDelta;
  const closeGameMarginAdjustment = closeGameLeverageEdge.marginDelta * 0.62;
  const coachingProbabilityDelta = coachingPaceProfile.probabilityDelta;
  const coachingMarginAdjustment = coachingPaceProfile.marginDelta * 0.58;
  const restFatigueProbabilityDelta = restFatigueEdge.probabilityDelta;
  const restFatigueMarginAdjustment = restFatigueEdge.marginDelta * 0.62;

  const signalConsensus = buildNbaWinnerSignalConsensus([
    {
      key: "base-roster",
      label: "base roster/team strength",
      probabilityDelta: base.boundedProbabilityDelta,
      marginDelta: baseMarginAdjustment,
      confidence: base.confidence,
      weight: 1.12
    },
    {
      key: "ranking",
      label: "player/team ranking overlay",
      probabilityDelta: rankingDelta,
      marginDelta: rankingMarginAdjustment,
      confidence: rankingSnapshot.confidence,
      weight: 0.78
    },
    {
      key: "player-overall",
      label: "player overall edge",
      probabilityDelta: playerOverallProbabilityDelta,
      marginDelta: playerOverallMarginAdjustment,
      confidence: playerOverallEdge.confidence,
      weight: 0.92
    },
    {
      key: "possession-score",
      label: "possession score model",
      probabilityDelta: possessionProbabilityDelta,
      marginDelta: possessionMarginAdjustment,
      confidence: possessionScoreModel.confidence,
      weight: 0.86
    },
    {
      key: "defensive-event",
      label: "defensive event edge",
      probabilityDelta: defensiveEventProbabilityDelta,
      marginDelta: defensiveEventMarginAdjustment,
      confidence: defensiveEventEdge.confidence,
      weight: 0.72
    },
    {
      key: "close-game",
      label: "close-game leverage",
      probabilityDelta: closeGameProbabilityDelta,
      marginDelta: closeGameMarginAdjustment,
      confidence: closeGameLeverageEdge.confidence,
      weight: 0.74
    },
    {
      key: "coaching-pace",
      label: "coaching/pace profile",
      probabilityDelta: coachingProbabilityDelta,
      marginDelta: coachingMarginAdjustment,
      confidence: coachingPaceProfile.confidence,
      weight: 0.7
    },
    {
      key: "rest-fatigue",
      label: "rest/fatigue edge",
      probabilityDelta: restFatigueProbabilityDelta,
      marginDelta: restFatigueMarginAdjustment,
      confidence: restFatigueEdge.confidence,
      weight: 0.68
    }
  ]);

  const cap = consensusCap(signalConsensus.status);
  const probabilityDelta = round(clamp(signalConsensus.consensusProbabilityDelta, -0.0775, 0.0775), 4);
  const boundedProbabilityDelta = round(clamp(signalConsensus.consensusProbabilityDelta, -cap, cap), 4);
  const finalProjectedHomeMargin = round(clamp(input.projectedHomeMargin + signalConsensus.consensusMarginDelta, -17, 17), 3);
  const confidence = round(clamp((base.confidence * 0.28) + (rankingSnapshot.confidence * 0.09) + (playerOverallEdge.confidence * 0.11) + (possessionScoreModel.confidence * 0.09) + (defensiveEventEdge.confidence * 0.07) + (closeGameLeverageEdge.confidence * 0.07) + (coachingPaceProfile.confidence * 0.07) + (restFatigueEdge.confidence * 0.07) + (signalConsensus.directionalConfidence * 0.15), 0.1, 0.96), 3);

  return {
    ...base,
    rankingSnapshot,
    playerOverallEdge,
    possessionScoreModel,
    defensiveEventEdge,
    closeGameLeverageEdge,
    coachingPaceProfile,
    restFatigueEdge,
    signalConsensus,
    finalProjectedHomeMargin,
    probabilityDelta,
    boundedProbabilityDelta,
    confidence,
    warnings: [...new Set([
      ...base.warnings,
      ...rankingSnapshot.warnings,
      ...playerOverallEdge.warnings,
      ...possessionScoreModel.warnings,
      ...defensiveEventEdge.warnings,
      ...closeGameLeverageEdge.warnings,
      ...coachingPaceProfile.warnings,
      ...restFatigueEdge.warnings,
      ...signalConsensus.warnings,
      ...signalConsensus.blockers.map((blocker) => `signal consensus blocker: ${blocker}`)
    ])],
    drivers: [
      ...base.drivers,
      `signal consensus status ${signalConsensus.status}`,
      `signal consensus probability delta ${(signalConsensus.consensusProbabilityDelta * 100).toFixed(1)}%`,
      `signal consensus bounded cap ${(cap * 100).toFixed(1)}%`,
      `signal consensus margin delta ${signalConsensus.consensusMarginDelta.toFixed(2)}`,
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
      `defensive event delta ${(defensiveEventProbabilityDelta * 100).toFixed(1)}%`,
      `defensive event margin adjustment ${defensiveEventMarginAdjustment.toFixed(2)}`,
      `defensive event extra possessions ${defensiveEventEdge.homeExpectedExtraPossessions.toFixed(2)}`,
      `close-game delta ${(closeGameProbabilityDelta * 100).toFixed(1)}%`,
      `close-game margin adjustment ${closeGameMarginAdjustment.toFixed(2)}`,
      `close-game spread leverage ${(closeGameLeverageEdge.spreadLeverage * 100).toFixed(1)}%`,
      `coaching pace delta ${(coachingProbabilityDelta * 100).toFixed(1)}%`,
      `coaching margin adjustment ${coachingMarginAdjustment.toFixed(2)}`,
      `coaching total delta ${coachingPaceProfile.totalDelta.toFixed(2)}`,
      `coaching possession delta ${coachingPaceProfile.projectedPossessionDelta.toFixed(2)}`,
      `rest fatigue delta ${(restFatigueProbabilityDelta * 100).toFixed(1)}%`,
      `rest fatigue margin adjustment ${restFatigueMarginAdjustment.toFixed(2)}`,
      `rest fatigue total delta ${restFatigueEdge.totalDelta.toFixed(2)}`,
      ...signalConsensus.drivers.map((driver) => `consensus: ${driver}`),
      ...rankingSnapshot.drivers.map((driver) => `ranking: ${driver}`),
      ...playerOverallEdge.drivers.map((driver) => `player overall: ${driver}`),
      ...possessionScoreModel.drivers.map((driver) => `possession: ${driver}`),
      ...defensiveEventEdge.drivers.map((driver) => `defense event: ${driver}`),
      ...closeGameLeverageEdge.drivers.map((driver) => `close game: ${driver}`),
      ...coachingPaceProfile.drivers.map((driver) => `coaching pace: ${driver}`),
      ...restFatigueEdge.drivers.map((driver) => `rest fatigue: ${driver}`)
    ]
  };
}
