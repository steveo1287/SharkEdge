import type { TrendMatchResult, TrendStatsSummary } from "@/types/trends";
import type { TrendContextVariables } from "./context-variables";

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

  // ROI formula: assume 1 unit risked per bet.
  // Win on favorite (e.g. -150): profit = 100/150 = 0.667 units
  // Win on underdog (e.g. +130): profit = 130/100 = 1.30 units
  // Loss: profit = -1 unit
  // Push: profit = 0
  // ROI = (total_profit / total_games_risked) * 100
  const totalProfit = round(graded.reduce((sum, match) => sum + match.unitsWon, 0), 2);
  const roi = totalGames ? round((totalProfit / totalGames) * 100, 2) : 0;

  // Win rate = wins / (wins + losses), excludes pushes
  const winPercentage = gradedCount ? round((wins / gradedCount) * 100, 1) : 0;

  // Current streak: walk backwards from most recent graded result
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

  // Longest streak: walk forward through all graded results chronologically.
  // Pushes reset both counters — a push ends a streak.
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let winRun = 0;
  let lossRun = 0;
  for (const match of graded) {
    const r = match.betResult;
    if (r === "W") {
      winRun += 1;
      lossRun = 0;
      if (winRun > longestWinStreak) longestWinStreak = winRun;
    } else if (r === "L") {
      lossRun += 1;
      winRun = 0;
      if (lossRun > longestLossStreak) longestLossStreak = lossRun;
    } else {
      winRun = 0;
      lossRun = 0;
    }
  }

  // Average margin of victory: mean cover margin across winning bets that have margin data.
  // For spreads: positive delta means covered by that many points.
  // For totals: positive delta means over hit by that many points.
  // For moneyline: absolute score difference.
  const winMargins = graded
    .filter((match) => match.betResult === "W" && typeof match.coverMargin === "number")
    .map((match) => match.coverMargin as number);
  const avgMarginOfVictory = winMargins.length
    ? round(winMargins.reduce((sum, m) => sum + m, 0) / winMargins.length, 2)
    : null;

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
    longestWinStreak,
    longestLossStreak,
    avgMarginOfVictory,
    pValue,
    chiSquareStat,
    isStatisticallySignificant: pValue < 0.05,
    confidenceScore,
    sampleSizeRating: getSampleSizeRating(totalGames),
    warnings
  };
}

/**
 * Compute context-adjusted confidence score.
 * Applies bonuses/penalties based on situational variable quality.
 * Returns a 0-100 score that accounts for:
 *   - Base statistical confidence
 *   - Proportion of rows with steam moves (sharp money signal)
 *   - Proportion of rows that beat the closing line (CLV quality)
 *   - Weather impact (suppresses confidence for high-variance conditions)
 *   - Schedule stress (back-to-backs reduce reliability)
 *   - Sample recency (recent samples weighted higher)
 */
export function computeContextAdjustedConfidence(
  baseConfidence: number,
  contextRows: TrendContextVariables[]
): {
  adjustedScore: number;
  adjustmentDelta: number;
  contextSignals: string[];
} {
  if (!contextRows.length) {
    return { adjustedScore: baseConfidence, adjustmentDelta: 0, contextSignals: [] };
  }

  const signals: string[] = [];
  let delta = 0;

  const steamPct = contextRows.filter((r) => r.market.isSteamMove).length / contextRows.length;
  if (steamPct >= 0.4) {
    delta += 12;
    signals.push(`${Math.round(steamPct * 100)}% of rows had sharp steam moves`);
  } else if (steamPct >= 0.2) {
    delta += 6;
    signals.push(`${Math.round(steamPct * 100)}% of rows had steam moves`);
  }

  const clvBeatPct = contextRows.filter((r) => r.clv.isStrongCLV).length / contextRows.length;
  if (clvBeatPct >= 0.5) {
    delta += 10;
    signals.push(`${Math.round(clvBeatPct * 100)}% of rows beat closing line strongly`);
  } else if (clvBeatPct >= 0.3) {
    delta += 5;
    signals.push(`${Math.round(clvBeatPct * 100)}% of rows beat closing line`);
  }

  const avgWeatherImpact =
    contextRows.reduce((sum, r) => sum + r.weather.weatherImpactScore, 0) / contextRows.length;
  if (avgWeatherImpact >= 40) {
    delta -= 10;
    signals.push(`High avg weather impact (${Math.round(avgWeatherImpact)}/100) — variance elevated`);
  } else if (avgWeatherImpact >= 20) {
    delta -= 4;
    signals.push(`Moderate weather impact (${Math.round(avgWeatherImpact)}/100)`);
  }

  const b2bPct = contextRows.filter((r) => r.schedule.isBackToBack).length / contextRows.length;
  if (b2bPct >= 0.5) {
    delta -= 8;
    signals.push(`${Math.round(b2bPct * 100)}% of rows were back-to-back games`);
  }

  const avgComposite =
    contextRows.reduce((sum, r) => sum + r.compositeEdgeScore, 0) / contextRows.length;
  if (avgComposite >= 65) {
    delta += 8;
    signals.push(`High avg composite edge score (${Math.round(avgComposite)}/100)`);
  } else if (avgComposite <= 35) {
    delta -= 5;
    signals.push(`Low avg composite edge score (${Math.round(avgComposite)}/100)`);
  }

  const adjustedScore = Math.max(0, Math.min(100, Math.round(baseConfidence + delta)));
  return { adjustedScore, adjustmentDelta: delta, contextSignals: signals };
}
