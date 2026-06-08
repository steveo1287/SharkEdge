import type { MlbPlayerStatMarketVariance } from "@/services/simulation/mlb-elite-hitter-context-adjustment";

export type MlbSettledBatterStatMarket = "HITS" | "TOTAL_BASES" | "HOME_RUN" | "WALKS" | "STRIKEOUTS";

export type MlbSettledBatterStatProjectionRow = {
  playerId: string;
  playerName?: string | null;
  market: MlbSettledBatterStatMarket;
  projectedMean: number;
  actualValue: number;
  settledAt?: string | null;
};

export type MlbPlayerStatSettlementFeedback = {
  playerId: string;
  playerName: string | null;
  sampleSize: number;
  marketSamples: Record<MlbSettledBatterStatMarket, number>;
  historicalErrorCorrection: {
    sampleSize: number;
    hitMeanBias: number;
    totalBasesMeanBias: number;
    homeRunMeanBias: number;
    walkMeanBias: number;
    strikeoutMeanBias: number;
  };
  marketVariance: MlbPlayerStatMarketVariance;
  settlementFeedback: {
    sampleSize: number;
    calibrationDrift: number;
    lastUpdated: string | null;
    notes: string[];
  };
};

export type MlbPlayerStatSettlementFeedbackReport = {
  modelVersion: "mlb-player-stat-settlement-feedback-v1";
  players: MlbPlayerStatSettlementFeedback[];
  rejected: Array<{ index: number; reason: string }>;
  warnings: string[];
};

const MARKETS: MlbSettledBatterStatMarket[] = ["HITS", "TOTAL_BASES", "HOME_RUN", "WALKS", "STRIKEOUTS"];

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function marketKey(market: MlbSettledBatterStatMarket) {
  if (market === "HITS") return "hitMeanBias";
  if (market === "TOTAL_BASES") return "totalBasesMeanBias";
  if (market === "HOME_RUN") return "homeRunMeanBias";
  if (market === "WALKS") return "walkMeanBias";
  return "strikeoutMeanBias";
}

function varianceKey(market: MlbSettledBatterStatMarket): keyof MlbPlayerStatMarketVariance {
  if (market === "HITS") return "hits";
  if (market === "TOTAL_BASES") return "totalBases";
  if (market === "HOME_RUN") return "homeRun";
  if (market === "WALKS") return "walks";
  return "strikeouts";
}

function validRow(row: MlbSettledBatterStatProjectionRow) {
  return Boolean(row.playerId && MARKETS.includes(row.market) && Number.isFinite(row.projectedMean) && Number.isFinite(row.actualValue));
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stdev(values: number[]) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function buildMlbPlayerStatSettlementFeedback(rows: MlbSettledBatterStatProjectionRow[]): MlbPlayerStatSettlementFeedbackReport {
  const rejected: MlbPlayerStatSettlementFeedbackReport["rejected"] = [];
  const byPlayer = new Map<string, MlbSettledBatterStatProjectionRow[]>();
  rows.forEach((row, index) => {
    if (!validRow(row)) {
      rejected.push({ index, reason: "invalid settled batter stat projection row" });
      return;
    }
    const bucket = byPlayer.get(row.playerId) ?? [];
    bucket.push(row);
    byPlayer.set(row.playerId, bucket);
  });

  const players = [...byPlayer.entries()].map(([playerId, playerRows]) => {
    const playerName = playerRows.find((row) => row.playerName)?.playerName ?? null;
    const marketSamples = Object.fromEntries(MARKETS.map((market) => [market, playerRows.filter((row) => row.market === market).length])) as Record<MlbSettledBatterStatMarket, number>;
    const correction = {
      sampleSize: playerRows.length,
      hitMeanBias: 0,
      totalBasesMeanBias: 0,
      homeRunMeanBias: 0,
      walkMeanBias: 0,
      strikeoutMeanBias: 0
    };
    const variance: MlbPlayerStatMarketVariance = {
      hits: 1,
      totalBases: 1,
      homeRun: 1,
      walks: 1,
      strikeouts: 1
    };

    for (const market of MARKETS) {
      const rowsForMarket = playerRows.filter((row) => row.market === market);
      const errors = rowsForMarket.map((row) => row.projectedMean - row.actualValue);
      const actuals = rowsForMarket.map((row) => row.actualValue);
      const projected = rowsForMarket.map((row) => row.projectedMean);
      correction[marketKey(market)] = round(mean(errors), 4);
      const avgProjected = Math.max(0.05, mean(projected));
      const actualVol = stdev(actuals) / Math.max(0.25, avgProjected);
      variance[varianceKey(market)] = round(clamp(0.82 + actualVol, 0.72, market === "HOME_RUN" ? 1.9 : 1.55), 3);
    }

    const allErrors = playerRows.map((row) => row.projectedMean - row.actualValue);
    const calibrationDrift = round(mean(allErrors), 4);
    const lastUpdated = playerRows.map((row) => row.settledAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
    return {
      playerId,
      playerName,
      sampleSize: playerRows.length,
      marketSamples,
      historicalErrorCorrection: correction,
      marketVariance: variance,
      settlementFeedback: {
        sampleSize: playerRows.length,
        calibrationDrift,
        lastUpdated,
        notes: [
          `Feedback built from ${playerRows.length} settled player-stat rows.`,
          "Mean bias is projected minus actual; positive bias reduces future projections.",
          "Market variance is derived from observed settled volatility by stat market."
        ]
      }
    };
  });

  const warnings: string[] = [];
  if (!rows.length) warnings.push("No settled batter stat rows supplied.");
  if (!players.length) warnings.push("No valid player settlement feedback generated.");
  if (rejected.length) warnings.push(`${rejected.length} settled row(s) rejected.`);

  return {
    modelVersion: "mlb-player-stat-settlement-feedback-v1",
    players,
    rejected,
    warnings
  };
}
