import { getLiveBoardPageData } from "@/services/odds/live-board-data";
// rest unchanged

export async function getBoardPageData(filters: BoardFilters): Promise<BoardPageData> {
  const liveData = await withTimeoutFallback(getLiveBoardPageData(filters), {
    timeoutMs: LIVE_BOARD_TIMEOUT_MS,
    fallback: null
  });

  if (liveData) {
    return liveData;
  }

  const dbData = await withTimeoutFallback(getDbBackedBoardPageData(filters), {
    timeoutMs: LIVE_BOARD_TIMEOUT_MS,
    fallback: null
  });

  if (dbData) {
    return dbData;
  }

  return getMockBoardPageData(filters);
}
