import {
  readSimCache,
  SIM_CACHE_KEYS,
  type SimHubSnapshot,
  type SimMarketSnapshot,
  type SimPrioritySnapshot,
  type SimRefreshStatusSnapshot
} from "@/services/simulation/sim-snapshot-service";
import {
  buildSimCardViewModels,
  type SimCardViewModel
} from "@/services/simulation/build-sim-card-view-model";
import { SimHubClient } from "@/app/sim-fast/sim-hub-client";

// ISR: cached HTML served from CDN edge, re-generated in background every 2 min.
// The /api/cron/sim-refresh cron keeps Redis warm so the inline cold-cache path
// (below) virtually never fires in production.
export const revalidate = 120;
export const maxDuration = 35;

async function readAll() {
  return Promise.all([
    readSimCache<SimHubSnapshot>(SIM_CACHE_KEYS.hub).catch(() => null),
    readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority).catch(() => null),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market).catch(() => null),
    readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus).catch(() => null)
  ]);
}

async function readSnapshots() {
  const [hub, priority, market, status] = await readAll();

  if ((priority?.rows?.length ?? 0) > 0) {
    return { hub, priority, market, status };
  }

  // Cold cache (first deploy / Redis flush): run projections inline with a
  // 25s cap — safely under the 35s maxDuration. Falls through gracefully on
  // timeout; the loading state shows with a manual Reload button.
  try {
    const { refreshFullSimSnapshots } = await import("@/services/simulation/sim-snapshot-service");
    await Promise.race([
      refreshFullSimSnapshots(),
      new Promise<void>((resolve) => setTimeout(resolve, 25_000))
    ]);
  } catch {
    // best-effort
  }

  const [fHub, fPriority, fMarket, fStatus] = await readAll();
  return { hub: fHub, priority: fPriority, market: fMarket, status: fStatus };
}

export default async function FastSimHubPage() {
  const { hub, priority, market, status } = await readSnapshots();

  const rows = priority?.rows ?? [];
  const marketEdges = (market?.edges ?? []) as NonNullable<SimMarketSnapshot["edges"]>;
  const cacheEmpty = rows.length === 0 && !hub && !priority;

  let allModels: SimCardViewModel[] = [];
  try {
    allModels = buildSimCardViewModels(rows, marketEdges);
  } catch (err) {
    console.error("[sim-fast] buildSimCardViewModels failed:", err instanceof Error ? err.message : err);
  }

  return (
    <SimHubClient
      allModels={allModels}
      simAge={status?.lastSuccessAt ?? priority?.generatedAt ?? hub?.generatedAt ?? null}
      lineCount={market?.lineCount ?? 0}
      mlbCount={hub?.summary?.mlbCount ?? priority?.summary?.mlbCount ?? marketEdges.length}
      marketAge={market?.generatedAt ?? null}
      statusReason={status?.reason ?? null}
      cacheEmpty={cacheEmpty}
    />
  );
}
