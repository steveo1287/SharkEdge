import { getNbaFullStatProjectionView, type NbaFullStatProjectionView } from "./nba-full-stat-projection-view";

export type NbaFullStatHealthStatus = "GREEN" | "YELLOW" | "RED";

export type NbaFullStatHealthSummary = {
  ok: true;
  generatedAt: string;
  status: NbaFullStatHealthStatus;
  eventId: string | null;
  hasDatabase: boolean;
  playerCount: number;
  statTileCount: number;
  healthyPlayerCount: number;
  warningPlayerCount: number;
  blockedPlayerCount: number;
  healthyTileCount: number;
  warningTileCount: number;
  blockedTileCount: number;
  modelOnlyTileCount: number;
  marketBackedTileCount: number;
  blockerReasons: Array<{ reason: string; count: number }>;
  warningReasons: Array<{ reason: string; count: number }>;
  topBlockedPlayers: Array<{ playerId: string; playerName: string; reasons: string[] }>;
  warnings: string[];
  actionRule: string;
};

function countReasons(reasons: string[]) {
  const counts = new Map<string, number>();
  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
}

export function summarizeNbaFullStatProjectionHealth(view: NbaFullStatProjectionView): NbaFullStatHealthSummary {
  let healthyPlayerCount = 0;
  let warningPlayerCount = 0;
  let blockedPlayerCount = 0;
  let healthyTileCount = 0;
  let warningTileCount = 0;
  let blockedTileCount = 0;
  let modelOnlyTileCount = 0;
  let marketBackedTileCount = 0;
  const allBlockers: string[] = [];
  const allWarnings: string[] = [];
  const topBlockedPlayers: Array<{ playerId: string; playerName: string; reasons: string[] }> = [];

  for (const player of view.players) {
    const playerBlockers = [...new Set(player.stats.flatMap((stat) => stat.blockers))];
    const playerWarnings = [...new Set(player.stats.flatMap((stat) => stat.warnings))];
    if (playerBlockers.length) {
      blockedPlayerCount += 1;
      topBlockedPlayers.push({ playerId: player.playerId, playerName: player.playerName, reasons: playerBlockers.slice(0, 4) });
    } else if (playerWarnings.length) {
      warningPlayerCount += 1;
    } else {
      healthyPlayerCount += 1;
    }

    allBlockers.push(...playerBlockers);
    allWarnings.push(...playerWarnings);

    for (const stat of player.stats) {
      if (stat.modelOnly) modelOnlyTileCount += 1;
      else marketBackedTileCount += 1;
      if (stat.blockers.length || stat.noBet) {
        blockedTileCount += 1;
        allBlockers.push(...stat.blockers);
      } else if (stat.warnings.length) {
        warningTileCount += 1;
        allWarnings.push(...stat.warnings);
      } else {
        healthyTileCount += 1;
      }
    }
  }

  const status: NbaFullStatHealthStatus = blockedPlayerCount > 0
    ? "RED"
    : warningPlayerCount > 0 || warningTileCount > 0 || view.warnings.length > 0
      ? "YELLOW"
      : view.players.length > 0
        ? "GREEN"
        : "RED";

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    status,
    eventId: view.eventId,
    hasDatabase: view.hasDatabase,
    playerCount: view.playerCount,
    statTileCount: view.statTileCount,
    healthyPlayerCount,
    warningPlayerCount,
    blockedPlayerCount,
    healthyTileCount,
    warningTileCount,
    blockedTileCount,
    modelOnlyTileCount,
    marketBackedTileCount,
    blockerReasons: countReasons(allBlockers),
    warningReasons: countReasons(allWarnings),
    topBlockedPlayers: topBlockedPlayers.slice(0, 10),
    warnings: view.warnings,
    actionRule: "GREEN can be displayed normally. YELLOW display warnings and keep betting conservative. RED means source/projection quality is degraded; force PASS/WATCH and Kelly 0 for affected players."
  };
}

export async function getNbaFullStatHealthSummary(args: {
  eventId?: string | null;
  includeModelOnly?: boolean;
  take?: number;
} = {}) {
  const view = await getNbaFullStatProjectionView({
    eventId: args.eventId ?? null,
    includeModelOnly: args.includeModelOnly ?? true,
    take: args.take ?? 1000
  });
  return summarizeNbaFullStatProjectionHealth(view);
}
