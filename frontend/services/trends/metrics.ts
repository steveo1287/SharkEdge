import type { HistoricalBetOpportunity } from "./types";

export function round(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function americanToImpliedProbability(odds: number) {
  if (!Number.isFinite(odds) || odds === 0) {
    return null;
  }

  if (odds > 0) {
    return 100 / (odds + 100);
  }

  return Math.abs(odds) / (Math.abs(odds) + 100);
}

export function profitUnitsForAmericanOdds(odds: number, won: boolean, push = false) {
  if (push) {
    return 0;
  }

  if (!won) {
    return -1;
  }

  return odds > 0 ? odds / 100 : 100 / Math.abs(odds);
}

export function computeWindowMetrics(rows: HistoricalBetOpportunity[]) {
  const settled = rows.filter((row) => row.won !== null || row.push);
  const wins = settled.filter((row) => row.won === true).length;
  const losses = settled.filter((row) => row.won === false && !row.push).length;
  const pushes = settled.filter((row) => row.push).length;
  const graded = wins + losses;
  const totalProfit = settled.reduce((total, row) => total + (row.profitUnits ?? 0), 0);
  const roi = graded ? totalProfit / graded : null;
  const hitRate = graded ? wins / graded : null;
  const clvRows = settled.filter((row) => typeof row.clvCents === "number");
  const beatCloseRows = settled.filter((row) => typeof row.beatClose === "boolean");

  return {
    sampleSize: settled.length,
    wins,
    losses,
    pushes,
    graded,
    totalProfit: round(totalProfit, 2),
    roi: round(roi, 4),
    hitRate: round(hitRate, 4),
    avgClv: clvRows.length
      ? round(clvRows.reduce((total, row) => total + (row.clvCents ?? 0), 0) / clvRows.length, 2)
      : null,
    beatCloseRate: beatCloseRows.length
      ? round(
          beatCloseRows.filter((row) => row.beatClose === true).length / beatCloseRows.length,
          4
        )
      : null
  };
}

export function getSeasonFromDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  return date.getUTCFullYear();
}
