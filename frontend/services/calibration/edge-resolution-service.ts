import { prisma } from "@/lib/db/prisma";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function americanToProb(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) {
    return null;
  }
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function resolveOutcomeForSide(side: string, marketType: string, eventResult: {
  winnerCompetitorId?: string | null;
  winningSide?: string | null;
  ouResult?: string | null;
  coverResult?: unknown;
}) {
  const normalizedSide = side.toLowerCase();
  const normalizedMarket = marketType.toLowerCase();

  if (normalizedMarket.includes("moneyline")) {
    if (eventResult.winningSide) {
      if (normalizedSide.includes("home")) return eventResult.winningSide.toLowerCase() === "home" ? 1 : 0;
      if (normalizedSide.includes("away")) return eventResult.winningSide.toLowerCase() === "away" ? 1 : 0;
    }
  }

  if (normalizedMarket.includes("total") || normalizedMarket.includes("over_under")) {
    if (eventResult.ouResult) {
      if (normalizedSide.includes("over")) return eventResult.ouResult.toLowerCase() === "over" ? 1 : 0;
      if (normalizedSide.includes("under")) return eventResult.ouResult.toLowerCase() === "under" ? 1 : 0;
    }
  }

  if (normalizedMarket.includes("spread") && typeof eventResult.coverResult === "object" && eventResult.coverResult) {
    const cover = asObject(eventResult.coverResult);
    const winningSide = String(cover?.winningSide ?? "");
    if (normalizedSide.includes("home")) return winningSide.toLowerCase() === "home" ? 1 : 0;
    if (normalizedSide.includes("away")) return winningSide.toLowerCase() === "away" ? 1 : 0;
  }

  return null;
}

export async function resolveEdgeSnapshotsFromResults() {
  const unresolved = await prisma.edgeExplanationSnapshot.findMany({
    where: { realizedOutcome: null },
    include: {
      edgeSignal: {
        include: {
          event: {
            include: {
              eventResult: true,
              currentMarketStates: {
                orderBy: [{ createdAt: "desc" }]
              }
            }
          }
        }
      }
    },
    take: 1000
  });

  let updated = 0;

  for (const snapshot of unresolved) {
    const result = snapshot.edgeSignal.event.eventResult;
    if (!result) continue;

    const realizedOutcome = resolveOutcomeForSide(snapshot.edgeSignal.side, snapshot.marketType, {
      winnerCompetitorId: result.winnerCompetitorId,
      winningSide: result.winningSide,
      ouResult: result.ouResult,
      coverResult: result.coverResult
    });

    const latestState = snapshot.edgeSignal.event.currentMarketStates.find((state) => {
      return String(state.marketType).toLowerCase() === snapshot.marketType.toLowerCase();
    });

    const closingProb = snapshot.closingProb ?? americanToProb((latestState?.oddsAmerican as number | null | undefined) ?? snapshot.edgeSignal.fairOddsAmerican);
    const offeredProb = americanToProb(snapshot.edgeSignal.offeredOddsAmerican);
    const clvPercent =
      offeredProb !== null && closingProb !== null ? round((offeredProb - closingProb) * 100, 4) : null;

    if (realizedOutcome === null) continue;

    await prisma.edgeExplanationSnapshot.update({
      where: { id: snapshot.id },
      data: {
        realizedOutcome,
        closingProb,
        clvPercent,
        resolvedAt: new Date()
      }
    });

    updated += 1;
  }

  return { updated };
}
