import type {
  MlbAtBatProbabilityChain,
  MlbAtBatResolution,
  MlbLeagueTotalsConfig,
  MlbPitcherBatterMatchup
} from "@/lib/types/mlb-sim";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

export function log5(batterProb: number, pitcherAllowedProb: number, leagueProb: number) {
  const b = clamp(batterProb, 0.001, 0.999);
  const p = clamp(pitcherAllowedProb, 0.001, 0.999);
  const l = clamp(leagueProb, 0.001, 0.999);
  return round((b * p / l) / ((b * p / l) + ((1 - b) * (1 - p) / (1 - l))));
}

export function buildMlbAtBatProbabilityChain(
  matchup: MlbPitcherBatterMatchup,
  league: MlbLeagueTotalsConfig
): MlbAtBatResolution {
  const walkProb = log5(0.085 + matchup.batterEye * 0.06, 0.08 + (1 - matchup.pitcherControl) * 0.08, 0.082);
  const strikeoutProb = log5(0.18 + (1 - matchup.batterContact) * 0.18, 0.2 + matchup.pitcherStuff * 0.16, 0.221);
  const contactProb = round(clamp(1 - walkProb - strikeoutProb, 0.1, 0.9));

  const lineDriveProb = round(clamp(0.19 + matchup.batterContact * 0.08 - matchup.pitcherMovement * 0.03, 0.12, 0.32));
  const groundBallProb = round(clamp(0.41 + matchup.pitcherMovement * 0.08 - matchup.batterPower * 0.03, 0.28, 0.56));
  const flyBallProb = round(clamp(1 - lineDriveProb - groundBallProb, 0.16, 0.42));
  const hardHitProb = round(clamp(0.22 + matchup.batterPower * 0.18 - matchup.pitcherMovement * 0.08, 0.1, 0.55));

  const expectedOutcomeValue =
    walkProb * 0.72 +
    strikeoutProb * 0.05 +
    contactProb * (lineDriveProb * 0.91 + flyBallProb * (0.36 + hardHitProb * 0.4) + groundBallProb * 0.22);

  const expectedRunsAdded = round(expectedOutcomeValue * league.runModifier);

  return {
    chain: {
      walkProb,
      strikeoutProb,
      contactProb,
      lineDriveProb,
      groundBallProb,
      flyBallProb,
      hardHitProb
    },
    expectedOutcomeValue: round(expectedOutcomeValue),
    expectedRunsAdded
  };
}
