import { prisma } from "@/lib/db/prisma";

function americanToProb(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) {
    return null;
  }
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

export async function capturePreLockCloseLines() {
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 60 * 1000);

  const snapshots = await prisma.edgeExplanationSnapshot.findMany({
    where: {
      closingProb: null,
      edgeSignal: {
        event: {
          startTime: {
            gte: now,
            lte: soon
          }
        }
      }
    },
    include: {
      edgeSignal: {
        include: {
          event: {
            include: {
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

  for (const snapshot of snapshots) {
    const state = snapshot.edgeSignal.event.currentMarketStates.find((item) =>
      String(item.marketType).toLowerCase() === snapshot.marketType.toLowerCase()
    );

    const closingProb = americanToProb((state?.oddsAmerican as number | null | undefined) ?? snapshot.edgeSignal.fairOddsAmerican);
    if (closingProb === null) continue;

    await prisma.edgeExplanationSnapshot.update({
      where: { id: snapshot.id },
      data: {
        closingProb
      }
    });
    updated += 1;
  }

  return { updated };
}
