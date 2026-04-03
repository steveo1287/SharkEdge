import type { TrendMatchResult, TrendStatsSummary } from "@/types/trends";

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function americanToBreakeven(oddsAmerican: number) {
  if (oddsAmerican < 0) {
    const abs = Math.abs(oddsAmerican);
    return abs / (abs + 100);
  }
  return 100 / (oddsAmerican + 100);
}

function erf(x: number) {
  const sign = x < 0 ? -1 : 1;
  const value = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * value);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-value * value);
  return sign * y;
}

function erfc(x: number) {
  return 1 - erf(x);
}

function getSampleSizeRating(totalGames: number): TrendStatsSummary["sampleSizeRating"] {
  if (totalGames >= 200) return "ELITE";
  if (totalGames >= 100) return "LARGE";
  if (totalGames >= 50) return "MEDIUM";
  return "SMALL";
}

function getConfidenceScore(totalGames: number, pValue: number, roi: number) {
  const sampleComponent =
    totalGames < 30 ? 0 : totalGames < 50 ? 25 : totalGames < 100 ? 50 : totalGames < 200 ? 75 : 100;
  const significanceComponent = pValue > 0.1 ? 0 : pValue >= 0.05 ? 50 : 100;
  const roiComponent = roi < 5 ? 0 : roi < 10 ? 33 : roi < 20 ? 66 : 100;
  return round(sampleComponent * 0.4 + significanceComponent * 0.3 + roiComponent * 0.3, 1);
}

export function calculateTrendStats(matches: TrendMatchResult[]): TrendStatsSummary {
  const ordered = [...matches].sort(
    (left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
  );
  const graded = ordered.filter((match) => match.betResult !== "PENDING");
  const wins = graded.filter((match) => match.betResult === "W").length;
  const losses = graded.filter((match) => match.betResult === "L").length;
  const pushes = graded.filter((match) => match.betResult === "P").length;
  const gradedCount = wins + losses;
  const totalGames = graded.length;
  const totalProfit = round(graded.reduce((sum, match) => sum + match.unitsWon, 0), 2);
  const roi = totalGames ? round((totalProfit / totalGames) * 100, 2) : 0;
  const winPercentage = gradedCount ? round((wins / gradedCount) * 100, 1) : 0;

  let currentStreak = 0;
  let streakType: "W" | "L" | null = null;
  for (let index = graded.length - 1; index >= 0; index -= 1) {
    const result = graded[index]?.betResult;
    if (result !== "W" && result !== "L") continue;
    if (!streakType) {
      streakType = result;
      currentStreak = 1;
      continue;
    }
    if (result === streakType) {
      currentStreak += 1;
      continue;
    }
    break;
  }

  const expectedWinRate = gradedCount
    ? graded
        .filter((match) => match.betResult === "W" || match.betResult === "L")
        .reduce((sum, match) => sum + americanToBreakeven(match.oddsAmerican), 0) / gradedCount
    : 0.5238;
  const expectedWins = gradedCount * expectedWinRate;
  const expectedLosses = gradedCount - expectedWins;
  const chiSquareStat =
    gradedCount && expectedWins > 0 && expectedLosses > 0
      ? round(
          ((wins - expectedWins) ** 2) / expectedWins +
            ((losses - expectedLosses) ** 2) / expectedLosses,
          4
        )
      : 0;
  const pValue = gradedCount ? round(erfc(Math.sqrt(chiSquareStat / 2)), 6) : 1;
  const confidenceScore = getConfidenceScore(totalGames, pValue, roi);

  const warnings: string[] = [];
  if (totalGames < 30) warnings.push("Small sample size (< 30 games)");
  if (pValue >= 0.05) warnings.push("Not statistically significant at p < 0.05");
  if (roi < 5) warnings.push("ROI is below the strong-signal threshold");

  return {
    totalGames,
    wins,
    losses,
    pushes,
    winPercentage,
    roi,
    totalProfit,
    currentStreak,
    streakType,
    pValue,
    chiSquareStat,
    isStatisticallySignificant: pValue < 0.05,
    confidenceScore,
    sampleSizeRating: getSampleSizeRating(totalGames),
    warnings
  };
}
