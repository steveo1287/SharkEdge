export type NbaPlayerSimAccuracyInput = {
  propType: string;
  line: number;
  baseMean: number;
  minutes?: number | null;
  projectedMinutes?: number | null;
  seasonAvg?: number | null;
  last5Avg?: number | null;
  last10Avg?: number | null;
  usageRate?: number | null;
  trueShootingPct?: number | null;
  pace?: number | null;
  teamPace?: number | null;
  opponentPace?: number | null;
  opponentDefRating?: number | null;
  opponentRankVsPosition?: number | null;
  injuryStatus?: "ACTIVE" | "QUESTIONABLE" | "DOUBTFUL" | "OUT" | null;
  teammateUsageVacatedPct?: number | null;
  backToBack?: boolean | null;
  restDays?: number | null;
  homeAway?: "home" | "away" | null;
  nba2kRating?: number | null;
  synergyPlayTypePpp?: number | null;
  synergyFrequencyPct?: number | null;
};

export type NbaPlayerSimAccuracyOutput = {
  adjustedMean: number;
  confidenceShift: number;
  varianceShift: number;
  reasons: string[];
  riskFlags: string[];
  componentScores: {
    form: number;
    pace: number;
    matchup: number;
    injury: number;
    role: number;
    ratingPrior: number;
    synergy: number;
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function safe(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function propSensitivity(propType: string) {
  const p = propType.toLowerCase();
  if (p.includes("point")) return { form: 0.28, pace: 0.18, matchup: 0.18, role: 0.26, rating: 0.08, synergy: 0.14 };
  if (p.includes("assist")) return { form: 0.18, pace: 0.16, matchup: 0.12, role: 0.34, rating: 0.06, synergy: 0.10 };
  if (p.includes("rebound")) return { form: 0.20, pace: 0.14, matchup: 0.22, role: 0.28, rating: 0.05, synergy: 0.06 };
  if (p.includes("three")) return { form: 0.30, pace: 0.12, matchup: 0.16, role: 0.22, rating: 0.10, synergy: 0.16 };
  return { form: 0.22, pace: 0.15, matchup: 0.15, role: 0.25, rating: 0.06, synergy: 0.08 };
}

export function applyNbaPlayerSimAccuracyLayer(input: NbaPlayerSimAccuracyInput): NbaPlayerSimAccuracyOutput {
  let adjustedMean = Math.max(0.01, input.baseMean);
  let confidenceShift = 0;
  let varianceShift = 0;
  const reasons: string[] = [];
  const riskFlags: string[] = [];
  const sensitivity = propSensitivity(input.propType);

  const seasonAvg = safe(input.seasonAvg, adjustedMean);
  const last5 = safe(input.last5Avg, seasonAvg);
  const last10 = safe(input.last10Avg, seasonAvg);
  const blendedRecent = last5 * 0.55 + last10 * 0.45;
  const formDelta = clamp((blendedRecent - seasonAvg) / Math.max(seasonAvg, 1), -0.35, 0.35);
  const formAdj = formDelta * sensitivity.form;
  adjustedMean *= 1 + formAdj;
  if (Math.abs(formAdj) > 0.015) reasons.push(`NBA form blend ${formAdj >= 0 ? "+" : ""}${(formAdj * 100).toFixed(1)}%`);

  const leaguePace = 100;
  const pace = safe(input.pace, (safe(input.teamPace, leaguePace) + safe(input.opponentPace, leaguePace)) / 2);
  const paceDelta = clamp((pace - leaguePace) / 10, -0.08, 0.08);
  const paceAdj = paceDelta * sensitivity.pace;
  adjustedMean *= 1 + paceAdj;
  if (Math.abs(paceAdj) > 0.005) reasons.push(`NBA pace context ${paceAdj >= 0 ? "+" : ""}${(paceAdj * 100).toFixed(1)}%`);

  const defRating = input.opponentDefRating;
  if (typeof defRating === "number") {
    const defAdj = clamp((115 - defRating) / 100, -0.08, 0.08) * sensitivity.matchup;
    adjustedMean *= 1 + defAdj;
    if (Math.abs(defAdj) > 0.005) reasons.push(`Opponent defensive rating ${defAdj >= 0 ? "+" : ""}${(defAdj * 100).toFixed(1)}%`);
  }

  if (typeof input.opponentRankVsPosition === "number") {
    const rank = clamp(input.opponentRankVsPosition, 1, 30);
    const rankAdj = ((15 - rank) / 100) * sensitivity.matchup;
    adjustedMean *= 1 + rankAdj;
    if (Math.abs(rankAdj) > 0.006) reasons.push(`Position matchup rank ${rankAdj >= 0 ? "+" : ""}${(rankAdj * 100).toFixed(1)}%`);
  }

  const projectedMinutes = safe(input.projectedMinutes, safe(input.minutes, 32));
  const baselineMinutes = safe(input.minutes, 32);
  const minutesDelta = clamp((projectedMinutes - baselineMinutes) / Math.max(baselineMinutes, 1), -0.25, 0.25);
  const roleAdj = minutesDelta * sensitivity.role;
  adjustedMean *= 1 + roleAdj;
  if (Math.abs(roleAdj) > 0.01) reasons.push(`Projected role/minutes ${roleAdj >= 0 ? "+" : ""}${(roleAdj * 100).toFixed(1)}%`);

  if (typeof input.teammateUsageVacatedPct === "number") {
    const usageBoost = clamp(input.teammateUsageVacatedPct / 100, -0.05, 0.12) * sensitivity.role;
    adjustedMean *= 1 + usageBoost;
    if (usageBoost > 0.006) reasons.push("Vacated teammate usage boosts role");
  }

  if (input.injuryStatus === "OUT") {
    adjustedMean = 0;
    confidenceShift -= 0.4;
    riskFlags.push("Player marked OUT");
  } else if (input.injuryStatus === "DOUBTFUL") {
    adjustedMean *= 0.55;
    confidenceShift -= 0.2;
    varianceShift += 0.18;
    riskFlags.push("Player doubtful injury risk");
  } else if (input.injuryStatus === "QUESTIONABLE") {
    adjustedMean *= 0.9;
    confidenceShift -= 0.08;
    varianceShift += 0.08;
    riskFlags.push("Questionable injury status");
  }

  if (input.backToBack) {
    adjustedMean *= 0.985;
    varianceShift += 0.025;
    riskFlags.push("Back-to-back schedule volatility");
  }

  if (typeof input.restDays === "number") {
    if (input.restDays >= 2) {
      adjustedMean *= 1.01;
      confidenceShift += 0.01;
    }
    if (input.restDays === 0) {
      adjustedMean *= 0.985;
      varianceShift += 0.02;
    }
  }

  if (typeof input.nba2kRating === "number") {
    // Licensed/external rating prior. Treat as a light prior, not ground truth.
    const ratingAdj = clamp((input.nba2kRating - 78) / 100, -0.06, 0.08) * sensitivity.rating;
    adjustedMean *= 1 + ratingAdj;
    reasons.push(`Rating prior ${ratingAdj >= 0 ? "+" : ""}${(ratingAdj * 100).toFixed(1)}%`);
  }

  if (typeof input.synergyPlayTypePpp === "number" || typeof input.synergyFrequencyPct === "number") {
    // Hook for licensed Synergy-style play-type data supplied by user/provider.
    const ppp = safe(input.synergyPlayTypePpp, 1.0);
    const freq = safe(input.synergyFrequencyPct, 18);
    const synergyAdj = clamp((ppp - 1.0) * 0.08 + (freq - 18) / 1000, -0.05, 0.06) * sensitivity.synergy;
    adjustedMean *= 1 + synergyAdj;
    reasons.push(`Play-type efficiency prior ${synergyAdj >= 0 ? "+" : ""}${(synergyAdj * 100).toFixed(1)}%`);
  }

  const componentScores = {
    form: Number(formAdj.toFixed(4)),
    pace: Number(paceAdj.toFixed(4)),
    matchup: Number((((safe(input.opponentRankVsPosition, 15) - 15) * -1) / 100).toFixed(4)),
    injury: input.injuryStatus === "ACTIVE" || !input.injuryStatus ? 0 : input.injuryStatus === "QUESTIONABLE" ? -0.08 : -0.2,
    role: Number(roleAdj.toFixed(4)),
    ratingPrior: typeof input.nba2kRating === "number" ? Number((((input.nba2kRating - 78) / 100) * sensitivity.rating).toFixed(4)) : 0,
    synergy: typeof input.synergyPlayTypePpp === "number" || typeof input.synergyFrequencyPct === "number" ? 1 : 0
  };

  if (!reasons.length) reasons.push("NBA accuracy layer neutral; awaiting richer player inputs");

  return {
    adjustedMean: Number(adjustedMean.toFixed(4)),
    confidenceShift: Number(confidenceShift.toFixed(4)),
    varianceShift: Number(varianceShift.toFixed(4)),
    reasons,
    riskFlags,
    componentScores
  };
}
