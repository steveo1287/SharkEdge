import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

type FreezeClosingLinesInput = {
  leagueKey?: string | null;
  windowBeforeMinutes?: number;
  windowAfterMinutes?: number;
  force?: boolean;
};

type ClosingLineFreezeResult = {
  scannedEvents: number;
  scannedMarkets: number;
  marketsFrozen: number;
  snapshotsWritten: number;
  skippedAlreadyFrozen: number;
  skippedLive: number;
};

function impliedFromAmerican(odds: number) {
  if (odds > 0) return 100 / (odds + 100);
  const abs = Math.abs(odds);
  return abs / (abs + 100);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function marketLine(market: { currentLine: number | null; line: number | null }) {
  return market.currentLine ?? market.line ?? null;
}

function marketOdds(market: { currentOdds: number | null; oddsAmerican: number }) {
  return market.currentOdds ?? market.oddsAmerican;
}

export async function freezeClosingLines(input: FreezeClosingLinesInput = {}): Promise<ClosingLineFreezeResult> {
  const windowBeforeMinutes = Math.max(0, Math.min(360, input.windowBeforeMinutes ?? 30));
  const windowAfterMinutes = Math.max(0, Math.min(360, input.windowAfterMinutes ?? 90));
  const now = new Date();
  const startMin = new Date(now.getTime() - windowAfterMinutes * 60 * 1000);
  const startMax = new Date(now.getTime() + windowBeforeMinutes * 60 * 1000);

  const events = await prisma.event.findMany({
    where: {
      startTime: { gte: startMin, lte: startMax },
      status: { in: ["SCHEDULED", "LIVE", "FINAL"] },
      ...(input.leagueKey ? { league: { key: input.leagueKey } } : {})
    },
    select: {
      id: true,
      startTime: true,
      status: true,
      league: { select: { key: true } }
    },
    orderBy: { startTime: "asc" }
  });

  let scannedMarkets = 0;
  let marketsFrozen = 0;
  let snapshotsWritten = 0;
  let skippedAlreadyFrozen = 0;
  let skippedLive = 0;

  for (const event of events) {
    const markets = await prisma.eventMarket.findMany({
      where: { eventId: event.id },
      orderBy: { updatedAt: "desc" }
    });
    scannedMarkets += markets.length;

    for (const market of markets) {
      if (!input.force && market.closingOdds !== null) {
        skippedAlreadyFrozen += 1;
        continue;
      }

      const line = marketLine(market);
      const odds = marketOdds(market);
      const capturedAt = new Date();

      if (market.isLive && !input.force) {
        skippedLive += 1;
        continue;
      }

      await prisma.eventMarketSnapshot.create({
        data: {
          eventMarketId: market.id,
          capturedAt,
          line,
          oddsAmerican: odds,
          impliedProbability: market.impliedProbability ?? impliedFromAmerican(odds)
        }
      });
      snapshotsWritten += 1;

      await prisma.eventMarket.update({
        where: { id: market.id },
        data: {
          closingLine: line,
          closingOdds: odds,
          currentLine: line,
          currentOdds: odds,
          metadataJson: toJson({
            ...(typeof market.metadataJson === "object" && market.metadataJson !== null && !Array.isArray(market.metadataJson)
              ? market.metadataJson
              : {}),
            closingFrozenAt: capturedAt.toISOString(),
            closingFreezeSource: "internal_freeze_closing_lines",
            closingFreezeEventStatus: event.status,
            closingFreezeWindow: {
              windowBeforeMinutes,
              windowAfterMinutes
            }
          })
        } as any
      });
      marketsFrozen += 1;
    }
  }

  return {
    scannedEvents: events.length,
    scannedMarkets,
    marketsFrozen,
    snapshotsWritten,
    skippedAlreadyFrozen,
    skippedLive
  };
}
