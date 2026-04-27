import type { MarketType } from "@prisma/client";

export type SimPredictionInput = {
  eventId: string;
  eventMarketId?: string;
  playerId?: string;
  league: string;
  player: string;
  propType: MarketType;
  side: string;
  line: number;
  bookOdds: number;
  overPct: number;
  underPct: number;
  edgePct: number;
  confidence: number;
};

export async function logSimPrediction(input: SimPredictionInput) {
  // Prediction logging disabled - database schema not yet set up
  return null;
}

export async function getSimPredictionsByEvent(eventId: string) {
  // Prediction retrieval disabled - database schema not yet set up
  return [];
}

export async function getOpenPredictions() {
  // Prediction retrieval disabled - database schema not yet set up
  return [];
}

export async function getPredictionMetrics(league?: string) {
  return {
    totalPredictions: 0,
    settledCount: 0,
    hitRate: 0,
    roi: 0,
    avgEdge: 0,
    avgConfidence: 0
  };
}
