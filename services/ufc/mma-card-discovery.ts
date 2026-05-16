import { fetchMvpUpcomingProvider } from "@/services/ufc/upcoming-card-providers";

export type MmaDiscoveredCard = {
  sourceKey: string;
  sourceUrl: string | null;
  eventName: string;
  eventDate: string;
  promotionKey: string | null;
  promotionName: string | null;
  combatSport: string | null;
  location: string | null;
  fightCount: number;
  sourceStatus: string | null;
};

export type MmaCardDiscoveryResult = {
  ok: boolean;
  generatedAt: string;
  cards: MmaDiscoveredCard[];
  warnings: string[];
  errors: string[];
};

function timeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

export async function discoverOfficialMmaCards(options: { timeoutMs?: number; maxEvents?: number } = {}): Promise<MmaCardDiscoveryResult> {
  const generatedAt = new Date().toISOString();
  const fallback: MmaCardDiscoveryResult = {
    ok: false,
    generatedAt,
    cards: [],
    warnings: [`Official card discovery timed out after ${options.timeoutMs ?? 5000}ms.`],
    errors: []
  };

  return timeout((async () => {
    const mvp = await fetchMvpUpcomingProvider({ maxEvents: options.maxEvents ?? 3 });
    return {
      ok: mvp.errors.length === 0,
      generatedAt,
      cards: mvp.events.map((event) => ({
        sourceKey: event.sourceEventId,
        sourceUrl: event.sourceUrl ?? null,
        eventName: event.eventName,
        eventDate: event.eventDate,
        promotionKey: event.promotionKey ?? "mvp",
        promotionName: event.promotionName ?? "Most Valuable Promotions",
        combatSport: event.combatSport ?? "COMBAT",
        location: event.location ?? null,
        fightCount: event.fights.length,
        sourceStatus: event.sourceStatus ?? null
      })),
      warnings: mvp.warnings,
      errors: mvp.errors
    };
  })(), options.timeoutMs ?? 5000, fallback);
}
