import {
  readSimCache,
  SIM_CACHE_KEYS,
  type SimHubSnapshot,
  type SimMarketSnapshot,
  type SimPrioritySnapshot,
  type SimRefreshStatusSnapshot
} from "@/services/simulation/sim-cache";
import {
  buildSimCardViewModels,
  type SimCardViewModel
} from "@/services/simulation/build-sim-card-view-model";
import { SimHubClient } from "@/app/sim-fast/sim-hub-client";

// SimHub is a reader only. Refresh/recompute work must stay in cron or /api/sim/refresh,
// never in the user page request.
export const dynamic = "force-dynamic";
export const revalidate = 0;
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
  return { hub, priority, market, status };
}

export default async function FastSimHubPage() {
  const { hub, priority, market, status } = await readSnapshots();

  const rows = priority?.rows ?? [];
  const marketEdges = (market?.edges ?? []) as Parameters<typeof buildSimCardViewModels>[1];
  const cacheEmpty = rows.length === 0 && !hub && !priority;

  let allModels: SimCardViewModel[] = [];
  try {
    allModels = buildSimCardViewModels(rows, marketEdges);
  } catch (err) {
    console.error("[sim-fast] buildSimCardViewModels failed:", err instanceof Error ? err.message : err);
  }

  const mlbCount = hub?.summary?.mlbCount ?? priority?.summary?.mlbCount ?? marketEdges.length;

  return (
    <SimHubClient
      allModels={allModels}
      simAge={status?.lastSuccessAt ?? priority?.generatedAt ?? hub?.generatedAt ?? null}
      lineCount={market?.lineCount ?? 0}
      mlbCount={mlbCount}
      marketAge={market?.generatedAt ?? null}
      statusReason={status?.reason ?? null}
      cacheEmpty={cacheEmpty}
    />
  );
}
