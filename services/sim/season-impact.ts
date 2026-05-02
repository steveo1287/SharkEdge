export type SeasonImpactSnapshot = {
  leverageScore: number;
  leverageLabel: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  leverageReasons: string[];
  homeWinImpact: {
    playoffOddsDeltaPct: number;
    divisionOddsDeltaPct: number;
    titleOddsDeltaPct: number;
    projectedWinsDelta: number;
  };
  awayWinImpact: {
    playoffOddsDeltaPct: number;
    divisionOddsDeltaPct: number;
    titleOddsDeltaPct: number;
    projectedWinsDelta: number;
  };
  volatility: {
    swingPct: number;
    upsetLeveragePct: number;
  };
};

type ImpactInput = {
  league: string;
  gameId: string;
  eventLabel: string;
  status: string;
  homeWinPct: number;
  awayWinPct: number;
  projectedSpread: number;
  projectedTotal: number;
  trustGrade: string;
  marketEdgePct: number | null;
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seeded(seed: number, shift: number) {
  const value = (seed ^ (shift * 1103515245)) >>> 0;
  return (value % 10000) / 10000;
}

function leagueMultiplier(league: string) {
  const value = league.toUpperCase();
  if (value === "NFL" || value === "NCAAF") return 1.35;
  if (value === "MLB") return 0.82;
  if (value === "NHL") return 1.1;
  if (value === "NBA") return 1.0;
  return 0.9;
}

function trustMultiplier(grade: string) {
  if (grade === "A") return 1.15;
  if (grade === "B") return 1.05;
  if (grade === "C") return 0.95;
  if (grade === "D") return 0.82;
  return 0.65;
}

function labelFor(score: number): SeasonImpactSnapshot["leverageLabel"] {
  if (score >= 8.5) return "EXTREME";
  if (score >= 6.5) return "HIGH";
  if (score >= 4) return "MEDIUM";
  return "LOW";
}

function reasonSet(input: ImpactInput, score: number, swingPct: number) {
  const reasons: string[] = [];
  const favoritePct = Math.max(input.homeWinPct, input.awayWinPct);
  const marketEdgeAbs = Math.abs(input.marketEdgePct ?? 0);

  if (score >= 8.5) reasons.push("Extreme game leverage profile for the current simulation context.");
  else if (score >= 6.5) reasons.push("High game leverage profile; this result should be tracked closely.");
  else if (score >= 4) reasons.push("Medium leverage; relevant for model pathing but not a slate-defining game.");
  else reasons.push("Lower leverage; useful for model grading but limited season-path impact in v1.");

  if (favoritePct < 0.58) reasons.push("Near coin-flip probability creates a larger path swing.");
  if (marketEdgeAbs >= 3) reasons.push("Model-market disagreement increases review priority.");
  if (swingPct >= 6) reasons.push("Projected win/loss outcome produces a meaningful playoff-path delta.");
  if (input.trustGrade === "D" || input.trustGrade === "F") reasons.push("Trust grade limits confidence; keep this as an audit signal until calibration improves.");

  return reasons;
}

export function buildSeasonImpact(input: ImpactInput): SeasonImpactSnapshot {
  const seed = hashSeed(`${input.league}:${input.gameId}:${input.eventLabel}`);
  const leagueWeight = leagueMultiplier(input.league);
  const trustWeight = trustMultiplier(input.trustGrade);
  const favoritePct = Math.max(input.homeWinPct, input.awayWinPct);
  const uncertainty = clamp(1 - Math.abs(input.homeWinPct - input.awayWinPct), 0, 1);
  const marketEdge = Math.abs(input.marketEdgePct ?? 0) / 100;
  const spreadLeverage = clamp(1 - Math.abs(input.projectedSpread) / 14, 0.15, 1);
  const randomPath = 0.75 + seeded(seed, 3) * 0.5;

  const rawScore = (
    uncertainty * 4.2 +
    marketEdge * 18 +
    spreadLeverage * 2.2 +
    leagueWeight * 1.4
  ) * trustWeight * randomPath;
  const leverageScore = round(clamp(rawScore, 1, 10), 1);
  const swingPct = round(clamp(leverageScore * leagueWeight * (0.55 + uncertainty * 0.5), 0.4, 12), 2);
  const upsetLeveragePct = round(clamp((1 - favoritePct) * leverageScore * leagueWeight, 0.1, 8), 2);

  const homePathBias = 0.85 + seeded(seed, 7) * 0.3;
  const awayPathBias = 0.85 + seeded(seed, 11) * 0.3;
  const homePlayoffDelta = round(swingPct * homePathBias, 2);
  const awayPlayoffDelta = round(swingPct * awayPathBias, 2);

  return {
    leverageScore,
    leverageLabel: labelFor(leverageScore),
    leverageReasons: reasonSet(input, leverageScore, swingPct),
    homeWinImpact: {
      playoffOddsDeltaPct: homePlayoffDelta,
      divisionOddsDeltaPct: round(homePlayoffDelta * 0.42, 2),
      titleOddsDeltaPct: round(homePlayoffDelta * 0.08, 2),
      projectedWinsDelta: 1
    },
    awayWinImpact: {
      playoffOddsDeltaPct: awayPlayoffDelta,
      divisionOddsDeltaPct: round(awayPlayoffDelta * 0.42, 2),
      titleOddsDeltaPct: round(awayPlayoffDelta * 0.08, 2),
      projectedWinsDelta: 1
    },
    volatility: {
      swingPct,
      upsetLeveragePct
    }
  };
}
