import { prisma } from "@/lib/db/prisma";

export async function alertDispatchJob() {
  const subscriptions = await prisma.alertSubscription.findMany({
    where: { isActive: true }
  });

  const matched: Array<{ subscriptionId: string; signalId: string }> = [];

  for (const subscription of subscriptions) {
    const signals = await prisma.edgeSignal.findMany({
      where: {
        isActive: true,
        ...(subscription.sportId ? { event: { sportId: subscription.sportId } } : {}),
        ...(subscription.leagueId ? { event: { leagueId: subscription.leagueId } } : {}),
        ...(subscription.marketType ? { marketType: subscription.marketType } : {}),
        ...(subscription.playerId ? { playerId: subscription.playerId } : {}),
        evPercent: subscription.minEvPercent ? { gte: subscription.minEvPercent } : undefined,
        confidenceScore: subscription.minConfidenceScore
          ? { gte: subscription.minConfidenceScore }
          : undefined
      },
      take: 20
    });

    matched.push(
      ...signals.map((signal) => ({
        subscriptionId: subscription.id,
        signalId: signal.id
      }))
    );
  }

  return {
    subscriptions: subscriptions.length,
    matched
  };
}
