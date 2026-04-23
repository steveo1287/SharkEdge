// trimmed for brevity
// IMPORTANT CHANGE: removed therundown usage

import { backendCurrentOddsProvider } from "@/services/current-odds/backend-provider";

async function fetchLiveBoardResponse() {
  const cached = await readHotCache<CurrentOddsBoardResponse>(LIVE_BOARD_CACHE_KEY);
  if (cached && !isHardStale(cached.generated_at, LIVE_BOARD_SOFT_STALE_MINUTES)) {
    return cached;
  }

  const backendResponse = await backendCurrentOddsProvider.fetchBoard();

  if (!backendResponse?.configured) {
    if (cached && !isHardStale(cached.generated_at, LIVE_BOARD_HARD_STALE_MINUTES)) {
      return cached;
    }
    return null;
  }

  await writeHotCache(LIVE_BOARD_CACHE_KEY, backendResponse, LIVE_BOARD_CACHE_TTL_SECONDS);
  return backendResponse;
}
