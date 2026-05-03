import type { NbaFullStatProjectionView } from "./nba-full-stat-projection-view";

export type NbaFullStatViewHealthStatus = "GREEN" | "YELLOW" | "RED";

export type NbaFullStatViewHealth = {
  status: NbaFullStatViewHealthStatus;
  playerCount: number;
  blockedPlayerCount: number;
  warningPlayerCount: number;
  healthyPlayerCount: number;
  topReason: string;
};

type FullStatPlayer = NbaFullStatProjectionView["players"][number];

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function nbaFullStatPlayerBlockers(player: FullStatPlayer | null | undefined) {
  if (!player) return [];
  return unique([
    ...(player.lineupTruth?.blockers ?? []),
    ...(player.lineupTruth?.status === "RED" ? ["lineup truth RED"] : []),
    ...(player.lineupTruth && player.lineupTruth.injuryReportFresh !== true ? ["stale or missing injury report"] : []),
    ...(player.lineupTruth && player.lineupTruth.minutesTrusted !== true ? ["minutes not trusted by lineup truth"] : []),
    ...(player.minutes?.blockers ?? []),
    ...player.stats.flatMap((stat) => stat.blockers),
    ...player.stats.flatMap((stat) => stat.noBet ? ["projection marked no-bet"] : [])
  ]);
}

export function nbaFullStatPlayerWarnings(player: FullStatPlayer | null | undefined) {
  if (!player) return [];
  return unique([
    ...(player.lineupTruth?.warnings ?? []),
    ...(player.lineupTruth?.status === "YELLOW" ? ["lineup truth YELLOW"] : []),
    ...(player.minutes?.warnings ?? []),
    ...player.stats.flatMap((stat) => stat.warnings)
  ]);
}

export function summarizeNbaFullStatViewHealth(view: Pick<NbaFullStatProjectionView, "players"> | null | undefined): NbaFullStatViewHealth {
  const players = view?.players ?? [];
  let blockedPlayerCount = 0;
  let warningPlayerCount = 0;
  const reasons: string[] = [];

  for (const player of players) {
    const blockers = nbaFullStatPlayerBlockers(player);
    const warnings = nbaFullStatPlayerWarnings(player);
    if (blockers.length) {
      blockedPlayerCount += 1;
      reasons.push(blockers[0]);
    } else if (warnings.length) {
      warningPlayerCount += 1;
      reasons.push(warnings[0]);
    }
  }

  const status: NbaFullStatViewHealthStatus = blockedPlayerCount > 0
    ? "RED"
    : warningPlayerCount > 0
      ? "YELLOW"
      : players.length > 0
        ? "GREEN"
        : "RED";

  return {
    status,
    playerCount: players.length,
    blockedPlayerCount,
    warningPlayerCount,
    healthyPlayerCount: Math.max(0, players.length - blockedPlayerCount - warningPlayerCount),
    topReason: reasons[0] ?? (players.length ? "No V2 projection quality issues detected." : "No V2 full-stat rows available.")
  };
}
