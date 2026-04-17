import { americanToImpliedProbability } from "../metrics";
import type { CandidateTrendSystem, HistoricalBetOpportunity } from "../types";

function getMetadataNumber(row: HistoricalBetOpportunity, key: string) {
  const value = row.metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getTrueProbability(system: CandidateTrendSystem, row: HistoricalBetOpportunity) {
  const projectionProbability =
    row.side === "over"
      ? getMetadataNumber(row, "projectionOverProb")
      : row.side === "under"
        ? getMetadataNumber(row, "projectionUnderProb")
        : null;

  return projectionProbability ?? system.hitRate ?? null;
}

function getMinimumEdgePct(row: HistoricalBetOpportunity) {
  if (row.playerId) {
    return 2.5;
  }

  if (row.marketType === "moneyline") {
    return 2;
  }

  return 1.5;
}

function projectionDirectionSupportsSide(row: HistoricalBetOpportunity) {
  if (typeof row.projectionDelta !== "number") {
    return true;
  }

  if (row.side === "over") {
    return row.projectionDelta > 0;
  }

  if (row.side === "under") {
    return row.projectionDelta < 0;
  }

  return true;
}

export function passesPriceGuard(system: CandidateTrendSystem, row: HistoricalBetOpportunity) {
  if (typeof row.oddsAmerican !== "number") {
    return false;
  }

  if (!projectionDirectionSupportsSide(row)) {
    return false;
  }

  const trueProbability = getTrueProbability(system, row);
  const marketProbability = americanToImpliedProbability(row.oddsAmerican);

  if (trueProbability !== null && marketProbability !== null) {
    const edgePct = (trueProbability - marketProbability) * 100;
    if (edgePct < getMinimumEdgePct(row)) {
      return false;
    }
  }

  if (row.marketType === "total" || row.marketType === "spread") {
    return true;
  }

  const fair = row.closeOddsAmerican ?? row.oddsAmerican;
  return Math.abs(row.oddsAmerican - fair) <= (row.playerId ? 55 : 40);
}
