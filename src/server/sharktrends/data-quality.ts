import type { SharkTrendContextRow } from "./types";

export function scoreContextRow(row: Partial<SharkTrendContextRow>) {
  let score = 0;
  if (row.wonGame !== null && row.wonGame !== undefined || row.ouResult || row.coverResult) score += 25;
  if (typeof row.oddsAmerican === "number" || typeof row.closingOddsAmerican === "number") score += 20;
  if (typeof row.openingOddsAmerican === "number" || typeof row.openingLine === "number") score += 15;
  if (typeof row.closingOddsAmerican === "number" || typeof row.closingLine === "number") score += 15;
  if (row.sportsbookName || row.sportsbookKey) score += 10;
  if (row.teamPregameElo !== null && row.teamPregameElo !== undefined || row.starterRollingGameScore !== null && row.starterRollingGameScore !== undefined || row.parkId) score += 10;
  if (row.weatherTempF !== null && row.weatherTempF !== undefined || row.windMph !== null && row.windMph !== undefined) score += 5;
  return Math.min(100, score);
}

export function rowWarnings(row: Partial<SharkTrendContextRow>) {
  const warnings: string[] = [];
  if (row.wonGame === null || row.wonGame === undefined) warnings.push("No official result available for grading.");
  if (row.oddsAmerican === null || row.oddsAmerican === undefined) warnings.push("No usable pregame odds.");
  if (row.openingOddsAmerican === null || row.openingOddsAmerican === undefined) warnings.push("No opening line snapshot.");
  if (row.closingOddsAmerican === null || row.closingOddsAmerican === undefined) warnings.push("No pregame closing line snapshot.");
  if (!row.sportsbookName && !row.sportsbookKey) warnings.push("Sportsbook missing.");
  if (!row.parkId && row.teamPregameElo == null && row.starterRollingGameScore == null) warnings.push("Retrosheet context missing.");
  if (row.windMph == null && row.weatherTempF == null) warnings.push("Weather context missing.");
  return warnings;
}

export function summarizeBacktestQuality(rows: Array<Partial<SharkTrendContextRow>>) {
  const warnings: string[] = [];
  const avg = rows.length ? rows.reduce((sum, row) => sum + (row.dataQualityScore ?? scoreContextRow(row)), 0) / rows.length : 0;
  const sourceKeys = new Set(rows.map((row) => row.sourceKey).filter(Boolean));
  const books = new Set(rows.map((row) => row.sportsbookName ?? row.sportsbookKey).filter(Boolean));
  if (rows.length < 5) warnings.push("Insufficient sample: fewer than 5 graded games.");
  else if (rows.length < 20) warnings.push("Small sample: treat as research, not a signal.");
  if (sourceKeys.size <= 1) warnings.push("Thin source coverage: only one historical source key represented.");
  if (books.size <= 1) warnings.push("One-book-only data may bias prices and ROI.");
  if (rows.some((row) => row.closingOddsAmerican == null && row.closingLine == null)) warnings.push("Some rows are missing closing line context.");
  if (rows.some((row) => row.windMph == null && row.weatherTempF == null)) warnings.push("Weather context is missing on some rows.");
  if (rows.some((row) => row.teamPregameElo == null && row.starterRollingGameScore == null && !row.parkId)) warnings.push("Retrosheet context is missing on some rows.");
  return { dataQualityScore: Math.round(avg), warnings };
}

export function createTrendWarnings(result: { sampleSize?: number; dataQualityScore?: number; warningFlags?: string[] }) {
  const warnings = [...(result.warningFlags ?? [])];
  if ((result.sampleSize ?? 0) < 5) warnings.push("Insufficient sample.");
  else if ((result.sampleSize ?? 0) < 20) warnings.push("Small sample.");
  if ((result.dataQualityScore ?? 0) < 60) warnings.push("Thin data quality.");
  return [...new Set(warnings)];
}
