import { prisma } from "@/lib/db/prisma";
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
  try {
    const prediction = await prisma.simPrediction.create({
      data: {
        eventId: input.eventId,
        eventMarketId: input.eventMarketId,
        playerId: input.playerId,
        league: input.league,
        playerName: input.player,
        propType: input.propType,
        side: input.side,
        line: input.line,
        bookOdds: input.bookOdds,
        simOverPct: input.overPct,
        simUnderPct: input.underPct,
        edgePct: input.edgePct,
        confidence: input.confidence
      }
    });
    return prediction;
  } catch (error) {
    console.error("Failed to log sim prediction:", error);
    return null;
  }
}

export async function getSimPredictionsByEvent(eventId: string) {
  return prisma.simPrediction.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" }
  });
}

export async function getOpenPredictions() {
  return prisma.simPrediction.findMany({
    where: { result: "OPEN" }
  });
}

export async function getPredictionMetrics(league?: string) {
  const where = league ? { league } : {};
  const settled = await prisma.simPrediction.findMany({
    where: { ...where, result: { not: "OPEN" } }
  });

  if (settled.length === 0) {
    return {
      totalPredictions: 0,
      settledCount: 0,
      hitRate: 0,
      roi: 0,
      avgEdge: 0,
      avgConfidence: 0
    };
  }

  const wins = settled.filter((p) => p.result === "WIN").length;
  const losses = settled.filter((p) => p.result === "LOSS").length;
  const pushes = settled.filter((p) => p.result === "PUSH").length;
  const voids = settled.filter((p) => p.result === "VOID").length;

  const hitRate = wins / (wins + losses + pushes);

  const roiBasis = losses + pushes;
  const riskAmount = roiBasis * 110;
  const winAmount = wins * 100;
  const roi = riskAmount > 0 ? (winAmount - riskAmount) / riskAmount : 0;

  const avgEdge = settled.reduce((sum, p) => sum + p.edgePct, 0) / settled.length;
  const avgConfidence = settled.reduce((sum, p) => sum + p.confidence, 0) / settled.length;

  return {
    totalPredictions: settled.length,
    settledCount: settled.length,
    hitRate,
    roi,
    avgEdge,
    avgConfidence,
    wins,
    losses,
    pushes,
    voids
  };
}
