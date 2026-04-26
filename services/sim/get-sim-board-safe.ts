import { hasUsableServerDatabaseUrl } from "@/lib/db/prisma";
import { buildFallbackSimBoard } from "./fallback-board";
import { getSimBoardFeed } from "./sim-board-service";

export async function getSimBoardFeedSafe(leagueKey?: string) {
  if (!hasUsableServerDatabaseUrl()) {
    return buildFallbackSimBoard();
  }

  try {
    return await getSimBoardFeed(leagueKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      /database|postgres|prisma|migrate|relation.*does not exist|P202[12]|Cannot read|undefined/i.test(
        message
      )
    ) {
      return buildFallbackSimBoard();
    }

    throw error;
  }
}
