import { writeHotCache } from "@/lib/cache/live-cache";
import type { BoardSportSectionView, LeagueKey } from "@/lib/types/domain";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildMainSimProjection } from "@/services/simulation/main-sim-brain";
import {
  SIM_CACHE_KEYS,
  type CachedSimGameProjection,
  type CachedSimProjection,
  type SimBoardSnapshot,
  type SimGame
} from "@/services/simulation/sim-snapshot-service";

const FULL_SIM_RETENTION_SECONDS = 36 * 60 * 60;
const FULL_SIM_TTL_SECONDS = 75 * 60;

function expiresAt(secondsFromNow: number) {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString();
}

function flattenMlb(sections: BoardSportSectionView[]): SimGame[] {
  return sections.flatMap((section) => section.leagueKey === "MLB"
    ? section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey as LeagueKey, leagueLabel: section.leagueLabel }))
    : []);
}

function compactProjection(projection: Awaited<ReturnType<typeof buildMainSimProjection>>): CachedSimProjection {
  return {
    matchup: projection.matchup,
    distribution: projection.distribution,
    read: projection.read,
    statSheet: projection.statSheet,
    nbaIntel: projection.nbaIntel
      ? {
        modelVersion: projection.nbaIntel.modelVersion,
        dataSource: projection.nbaIntel.dataSource,
        confidence: projection.nbaIntel.confidence,
        noBet: projection.nbaIntel.noBet,
        tier: projection.nbaIntel.tier,
        reasons: projection.nbaIntel.reasons,
        projectedTotal: projection.nbaIntel.projectedTotal,
        volatilityIndex: projection.nbaIntel.volatilityIndex,
        playerStatProjectionCount: projection.nbaIntel.playerStatProjections.length
      }
      : null,
    realityIntel: projection.realityIntel,
    mlbIntel: projection.mlbIntel
  };
}

export async function refreshMainMlbSimSnapshot() {
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];
  const sourceStatus: Record<string, unknown> = {
    cacheVersion: "main-sim-brain-v1",
    mainBrain: "mlb-intel-v8-player-impact+mlb-intel-v7-calibration"
  };

  const sections = await buildBoardSportSections({ selectedLeague: "MLB", gamesByLeague: {}, maxScoreboardGames: null });
  const games = flattenMlb(sections);
  const settled = await Promise.allSettled(games.map(async (game) => ({
    game,
    projection: compactProjection(await buildMainSimProjection(game))
  })));
  const rows: CachedSimGameProjection[] = [];

  for (const result of settled) {
    if (result.status === "fulfilled") rows.push(result.value);
    else warnings.push(`Main MLB brain projection failed: ${result.reason instanceof Error ? result.reason.message : "unknown projection error"}`);
  }

  if (!rows.length) {
    return { ok: false, gameCount: games.length, rowCount: 0, warnings: ["Main MLB brain produced zero rows.", ...warnings] };
  }

  const snapshot: SimBoardSnapshot = {
    generatedAt,
    expiresAt: expiresAt(FULL_SIM_TTL_SECONDS),
    stale: false,
    games: rows,
    warnings,
    sourceStatus
  };

  await writeHotCache(SIM_CACHE_KEYS.mlbBoard, snapshot, FULL_SIM_RETENTION_SECONDS);
  return { ok: true, gameCount: games.length, rowCount: rows.length, warnings };
}
