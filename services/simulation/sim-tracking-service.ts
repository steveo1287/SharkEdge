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
  return prisma.simPrediction.create({
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
}

export async function getSimPredictionsByEvent(eventId: string) {
  return prisma.simPrediction.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" }
  });
}

export async function getOpenPredictions() {
  return prisma.simPrediction.findMany({
    where: { result: "OPEN" },
    orderBy: { createdAt: "desc" }
  });
}

export async function getPredictionMetrics(league?: string) {
  const where = league ? { league } : {};

  const [totalPredictions, settledCount, settled] = await Promise.all([
    prisma.simPrediction.count({ where }),
    prisma.simPrediction.count({
      where: { ...where, result: { in: ["WIN", "LOSS", "PUSH"] } }
    }),
    prisma.simPrediction.findMany({
      where: { ...where, result: { in: ["WIN", "LOSS"] } },
      select: { result: true, edgePct: true, confidence: true }
    })
  ]);

  const wins = settled.filter((r) => r.result === "WIN").length;
  const hitRate = settled.length > 0 ? wins / settled.length : 0;
  const avgEdge = settled.length > 0
    ? settled.reduce((sum, r) => sum + r.edgePct, 0) / settled.length
    : 0;
  const avgConfidence = settled.length > 0
    ? settled.reduce((sum, r) => sum + r.confidence, 0) / settled.length
    : 0;

  return {
    totalPredictions,
    settledCount,
    hitRate,
    roi: 0,
    avgEdge,
    avgConfidence
  };
}
