import { buildCommandBoardV2, type CommandBoardV2Payload } from "@/services/trends/command-board-v2";

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "unknown command board error";
}

export function buildFallbackCommandBoardV2(error: unknown): CommandBoardV2Payload {
  const message = errorMessage(error);
  return {
    generatedAt: new Date().toISOString(),
    sourceNote: `SharkTrends recovery mode: ${message}`,
    games: [],
    stats: {
      games: 0,
      action: 0,
      watch: 0,
      research: 0,
      blocked: 0,
      nativeTrends: 0,
      generatedAttached: 0,
      verifiedGenerated: 0,
      marketSourced: 0
    }
  };
}

export async function buildSafeCommandBoardV2(options: Parameters<typeof buildCommandBoardV2>[0] = {}) {
  try {
    return await buildCommandBoardV2(options);
  } catch (error) {
    console.error("[sharktrends] command board fallback activated", error);
    return buildFallbackCommandBoardV2(error);
  }
}
