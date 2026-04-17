import { americanToImpliedProbability } from "../metrics";
import { matchTrendSystemToRows } from "./system-matcher";
import { passesPriceGuard } from "./price-guard";
import { getTimingState } from "./timing-engine";
import type { ActiveTrendSignal, CandidateTrendSystem, HistoricalBetOpportunity } from "../types";

function getMetadataNumber(row: HistoricalBetOpportunity, key: string) {
  const value = row.metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function impliedProbabilityToAmerican(probability: number | null) {
  if (typeof probability !== "number" || !Number.isFinite(probability) || probability <= 0 || probability >= 1) {
    return null;
  }

  if (probability >= 0.5) {
    return Math.round((-100 * probability) / (1 - probability));
  }

  return Math.round((100 * (1 - probability)) / probability);
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

function getTrueProbability(row: HistoricalBetOpportunity, system: CandidateTrendSystem) {
  const selectedProjectionProbability =
    row.side === "over"
      ? getMetadataNumber(row, "projectionOverProb")
      : row.side === "under"
        ? getMetadataNumber(row, "projectionUnderProb")
        : null;

  if (selectedProjectionProbability !== null) {
    return selectedProjectionProbability;
  }

  return system.hitRate ?? null;
}

function getEdgeBand(edgePct: number | null): ActiveTrendSignal["edgeBand"] {
  if (edgePct === null) return "pass";
  if (edgePct >= 5) return "elite";
  if (edgePct >= 3) return "strong";
  if (edgePct >= 1.5) return "watch";
  return "pass";
}

function getPlayableOdds(trueProbability: number | null, row: HistoricalBetOpportunity) {
  if (trueProbability === null) {
    return null;
  }

  const requiredEdge = getMinimumEdgePct(row) / 100;
  const playableProbability = trueProbability - requiredEdge;
  return impliedProbabilityToAmerican(playableProbability > 0.01 && playableProbability < 0.99 ? playableProbability : null);
}

function buildFlags(system: CandidateTrendSystem, row: HistoricalBetOpportunity, edgePct: number | null) {
  const flags: string[] = [];

  if (row.playerId) {
    flags.push("prop");
  }

  if ((row.side === "over" || row.side === "under") && getMetadataNumber(row, `projection${row.side === "over" ? "Over" : "Under"}Prob`) !== null) {
    flags.push("projection-backed");
  }

  if ((system.avgClv ?? 0) > 0) {
    flags.push("clv-positive");
  }

  if ((system.beatCloseRate ?? 0) >= 0.54) {
    flags.push("beats-close");
  }

  if ((system.validationScore ?? 0) >= 80) {
    flags.push("validated");
  }

  if (edgePct !== null && edgePct >= 5) {
    flags.push("elite-edge");
  }

  return flags;
}

function buildReasons(system: CandidateTrendSystem, row: HistoricalBetOpportunity, edgePct: number | null) {
  const reasons = [...system.conditions.map((condition) => condition.label)];

  if (row.playerName && typeof row.projectionDelta === "number") {
    reasons.push(
      `${row.playerName} projection delta ${row.projectionDelta > 0 ? "+" : ""}${row.projectionDelta.toFixed(1)}`
    );
  }

  const projectionProbability =
    row.side === "over"
      ? getMetadataNumber(row, "projectionOverProb")
      : row.side === "under"
        ? getMetadataNumber(row, "projectionUnderProb")
        : null;

  if (projectionProbability !== null) {
    reasons.push(`projection ${(projectionProbability * 100).toFixed(1)}% for ${row.side}`);
  }

  if (typeof edgePct === "number") {
    reasons.push(`live edge ${edgePct > 0 ? "+" : ""}${edgePct.toFixed(2)}%`);
  }

  if (typeof system.avgClv === "number") {
    reasons.push(`avg CLV ${system.avgClv > 0 ? "+" : ""}${system.avgClv.toFixed(1)}c`);
  }

  return reasons;
}

export function buildActiveTrendSignals(systems: CandidateTrendSystem[], rows: HistoricalBetOpportunity[]) {
  const signals: ActiveTrendSignal[] = [];

  for (const system of systems) {
    const matched = matchTrendSystemToRows(system, rows);
    for (const row of matched) {
      if (!passesPriceGuard(system, row)) {
        continue;
      }

      const trueProbability = getTrueProbability(row, system);
      const marketProbability = americanToImpliedProbability(row.oddsAmerican);
      const edgePct =
        trueProbability !== null && marketProbability !== null ? (trueProbability - marketProbability) * 100 : null;
      const fairOdds = impliedProbabilityToAmerican(trueProbability);
      const playableOdds = getPlayableOdds(trueProbability, row);
      const edgeBand = getEdgeBand(edgePct);

      signals.push({
        systemId: system.id,
        eventId: row.eventId,
        gameDate: row.gameDate,
        league: row.league,
        sport: row.sport,
        marketType: row.marketType,
        side: row.side,
        systemName: system.name,
        currentLine: row.line,
        currentOdds: row.oddsAmerican,
        fairOdds,
        playableOdds,
        trueProbability,
        marketProbability,
        edgePct,
        edgeBand,
        timingState: getTimingState(row),
        confidenceTier: system.tier,
        reasons: buildReasons(system, row, edgePct),
        flags: buildFlags(system, row, edgePct),
        eventLabel: row.homeTeam && row.awayTeam ? `${row.awayTeam} @ ${row.homeTeam}` : row.eventId
      });
    }
  }

  return signals;
}
