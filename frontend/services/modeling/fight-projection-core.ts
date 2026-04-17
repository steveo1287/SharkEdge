import { calibrateProbabilityAgainstMarket } from "@/services/modeling/probability-calibration";

export type FightProjectionInput = {
  sportKey: "UFC" | "BOXING";
  rounds: number;
  fighterA: {
    name: string;
    record: string | null;
    recentWinRate?: number | null;
    recentMargin?: number | null;
    daysRest?: number | null;
    metadata?: Record<string, unknown> | null;
  };
  fighterB: {
    name: string;
    record: string | null;
    recentWinRate?: number | null;
    recentMargin?: number | null;
    daysRest?: number | null;
    metadata?: Record<string, unknown> | null;
  };
  marketProbabilityA?: number | null;
};

export type FightProjectionView = {
  projectedHomeScore: number;
  projectedAwayScore: number;
  projectedTotal: number;
  projectedSpreadHome: number;
  winProbHome: number;
  winProbAway: number;
  metadata: {
    confidenceLabel: "HIGH" | "MEDIUM" | "LOW";
    confidenceScore: number;
    uncertaintyScore: number;
    confidencePenalty: number;
    paceScore: number;
    methodProbabilities: {
      decision: number;
      finish: number;
    };
    finishRoundExpectation: number;
    diagnostics: {
      fighterARecordWinPct: number;
      fighterBRecordWinPct: number;
      fighterAStyleScore: number;
      fighterBStyleScore: number;
      fighterAControlScore: number;
      fighterBControlScore: number;
    };
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseRecord(record: string | null | undefined) {
  const match = (record ?? "").match(/(\d+)-(\d+)(?:-(\d+))?/);
  if (!match) {
    return { wins: 0, losses: 0, draws: 0, winPct: 0.5, sampleSize: 0 };
  }
  const wins = Number(match[1] ?? 0);
  const losses = Number(match[2] ?? 0);
  const draws = Number(match[3] ?? 0);
  const sampleSize = wins + losses + draws;
  const winPct = sampleSize ? (wins + draws * 0.5) / sampleSize : 0.5;
  return { wins, losses, draws, winPct, sampleSize };
}

function getMetadataNumber(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = asNumber(metadata?.[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

export function buildFightProjection(input: FightProjectionInput): FightProjectionView {
  const recordA = parseRecord(input.fighterA.record);
  const recordB = parseRecord(input.fighterB.record);
  const styleKeys =
    input.sportKey === "UFC"
      ? ["sigStrikeDiff", "sigStrikeRate", "strikes_landed", "strikesLandedPerMin"]
      : ["powerScore", "knockdownRate", "jabScore", "strikes_landed"];
  const controlKeys =
    input.sportKey === "UFC"
      ? ["controlScore", "takedownScore", "grapplingScore", "control_time"]
      : ["defenseScore", "ringControlScore", "counterScore"];
  const durabilityKeys = ["durabilityScore", "chinScore", "defenseScore", "damageAbsorption"];
  const reachKeys = ["reachInches", "reach", "heightInches", "height"];
  const ageKeys = ["age"];
  const finishKeys = ["finishRate", "finish_score", "koRate", "submissionRate"];

  const fighterAStyleScore = getMetadataNumber(input.fighterA.metadata, styleKeys) ?? recordA.winPct * 10;
  const fighterBStyleScore = getMetadataNumber(input.fighterB.metadata, styleKeys) ?? recordB.winPct * 10;
  const fighterAControlScore = getMetadataNumber(input.fighterA.metadata, controlKeys) ?? (input.fighterA.recentMargin ?? 0) * 0.3 + 5;
  const fighterBControlScore = getMetadataNumber(input.fighterB.metadata, controlKeys) ?? (input.fighterB.recentMargin ?? 0) * 0.3 + 5;
  const fighterADurability = getMetadataNumber(input.fighterA.metadata, durabilityKeys) ?? clamp(8 - recordA.losses * 0.12, 4.5, 9.5);
  const fighterBDurability = getMetadataNumber(input.fighterB.metadata, durabilityKeys) ?? clamp(8 - recordB.losses * 0.12, 4.5, 9.5);
  const fighterAReach = getMetadataNumber(input.fighterA.metadata, reachKeys) ?? 70;
  const fighterBReach = getMetadataNumber(input.fighterB.metadata, reachKeys) ?? 70;
  const fighterAAge = getMetadataNumber(input.fighterA.metadata, ageKeys) ?? 30;
  const fighterBAge = getMetadataNumber(input.fighterB.metadata, ageKeys) ?? 30;
  const fighterAFinish = clamp((getMetadataNumber(input.fighterA.metadata, finishKeys) ?? 0.42), 0.08, 0.9);
  const fighterBFinish = clamp((getMetadataNumber(input.fighterB.metadata, finishKeys) ?? 0.42), 0.08, 0.9);

  const recordEdge = (recordA.winPct - recordB.winPct) * 22;
  const recentFormEdge = ((input.fighterA.recentWinRate ?? 50) - (input.fighterB.recentWinRate ?? 50)) * 0.14;
  const marginEdge = ((input.fighterA.recentMargin ?? 0) - (input.fighterB.recentMargin ?? 0)) * 0.18;
  const styleEdge = (fighterAStyleScore - fighterBStyleScore) * (input.sportKey === "UFC" ? 0.42 : 0.35);
  const controlEdge = (fighterAControlScore - fighterBControlScore) * (input.sportKey === "UFC" ? 0.34 : 0.18);
  const durabilityEdge = (fighterADurability - fighterBDurability) * 0.38;
  const reachEdge = (fighterAReach - fighterBReach) * 0.09;
  const restEdge = ((input.fighterA.daysRest ?? 35) - (input.fighterB.daysRest ?? 35)) * 0.01;
  const agePenaltyEdge = clamp((fighterBAge - fighterAAge) * 0.08, -1.2, 1.2);

  const rawScoreEdge = recordEdge + recentFormEdge + marginEdge + styleEdge + controlEdge + durabilityEdge + reachEdge + restEdge + agePenaltyEdge;
  const paceScore = clamp(
    input.rounds * (input.sportKey === "UFC" ? 0.95 : 0.72) + (fighterAFinish + fighterBFinish) * 4,
    2.5,
    input.sportKey === "UFC" ? 10.5 : 9.5
  );
  const finishProbability = clamp(
    (fighterAFinish + fighterBFinish) / 2 + Math.abs(styleEdge) * (input.sportKey === "UFC" ? 0.01 : 0.008) - input.rounds * 0.012,
    0.14,
    input.sportKey === "UFC" ? 0.76 : 0.68
  );
  const finishRoundExpectation = round(clamp(input.rounds * (1 - finishProbability * 0.62), 1.4, input.rounds), 2);

  const sampleSize = Math.min(recordA.sampleSize, recordB.sampleSize);
  const uncertaintyScore = clamp(
    Math.round((sampleSize < 12 ? 28 : sampleSize < 20 ? 18 : 10) + Math.abs(fighterAAge - fighterBAge) * 0.4 + (input.sportKey === "BOXING" ? 4 : 0)),
    10,
    74
  );
  const baseProbability = 1 / (1 + Math.exp(-rawScoreEdge / (input.sportKey === "UFC" ? 6.6 : 7.4)));
  const calibrated = calibrateProbabilityAgainstMarket({
    modelProbability: baseProbability,
    marketProbability: input.marketProbabilityA ?? null,
    sampleSize,
    sourceConfidence: clamp(1 - uncertaintyScore / 100, 0.28, 0.84),
    uncertaintyScore
  });
  const confidenceScore = clamp(Math.round(92 - calibrated.confidencePenalty * 2.4 - uncertaintyScore * 0.18), 20, 94);
  const confidenceLabel = confidenceScore >= 74 ? "HIGH" : confidenceScore >= 52 ? "MEDIUM" : "LOW";
  const projectedHomeScore = round(50 + rawScoreEdge * 1.45, 3);
  const projectedAwayScore = round(50 - rawScoreEdge * 1.45, 3);

  return {
    projectedHomeScore,
    projectedAwayScore,
    projectedTotal: round(projectedHomeScore + projectedAwayScore, 3),
    projectedSpreadHome: round(projectedHomeScore - projectedAwayScore, 3),
    winProbHome: round(calibrated.posteriorProbability ?? 0.5, 4),
    winProbAway: round(1 - (calibrated.posteriorProbability ?? 0.5), 4),
    metadata: {
      confidenceLabel,
      confidenceScore,
      uncertaintyScore,
      confidencePenalty: calibrated.confidencePenalty,
      paceScore: round(paceScore, 3),
      methodProbabilities: {
        decision: round(1 - finishProbability, 4),
        finish: round(finishProbability, 4)
      },
      finishRoundExpectation,
      diagnostics: {
        fighterARecordWinPct: round(recordA.winPct, 4),
        fighterBRecordWinPct: round(recordB.winPct, 4),
        fighterAStyleScore: round(fighterAStyleScore, 3),
        fighterBStyleScore: round(fighterBStyleScore, 3),
        fighterAControlScore: round(fighterAControlScore, 3),
        fighterBControlScore: round(fighterBControlScore, 3)
      }
    }
  };
}
