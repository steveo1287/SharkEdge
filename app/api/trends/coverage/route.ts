import { NextResponse } from "next/server";

import { readSimCache, SIM_CACHE_KEYS, type SimBoardSnapshot, type SimMarketSnapshot, type SimPrioritySnapshot } from "@/services/simulation/sim-snapshot-service";
import { readTrendSystemCycleStatus } from "@/services/trends/trend-system-cycle-status";
import { buildTrendSystemRun } from "@/services/trends/trend-system-engine";
import { buildTrendSignals } from "@/services/trends/trends-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type LeagueCoverage = {
  league: "NBA" | "MLB";
  simGames: number;
  priorityRows: number;
  marketEdges: number;
  marketMatchedGames: number;
  signalCount: number;
  signalGames: number;
  systemCount: number;
  activeSystems: number;
  activeSystemMatches: number;
  missingMarketGameIds: string[];
  missingSignalGameIds: string[];
  warnings: string[];
};

function ids(items: Array<{ game?: { id?: string }; id?: string; gameId?: string }>) {
  return new Set(items.map((item) => item.game?.id ?? item.id ?? item.gameId).filter((value): value is string => Boolean(value)));
}

function ageSeconds(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 1000));
}

async function leagueCoverage(league: "NBA" | "MLB", args: {
  board: SimBoardSnapshot | null;
  priority: SimPrioritySnapshot | null;
  market: SimMarketSnapshot | null;
}) : Promise<LeagueCoverage> {
  const signals = await buildTrendSignals({ league, includeHidden: false, includeResearch: false });
  const systems = await buildTrendSystemRun({ league, includeInactive: true });
  const boardGames = args.board?.games ?? [];
  const priorityRows = (args.priority?.rows ?? []).filter((row) => row.leagueKey === league);
  const marketEdges = league === "MLB" ? (args.market?.edges ?? []) : [];
  const boardIds = ids(boardGames);
  const marketIds = ids(marketEdges as any[]);
  const signalIds = ids(signals.signals as any[]);
  const missingMarketGameIds = league === "MLB" ? [...boardIds].filter((id) => !marketIds.has(id)).slice(0, 25) : [];
  const missingSignalGameIds = [...boardIds].filter((id) => !signalIds.has(id)).slice(0, 25);
  const warnings = [
    boardGames.length === 0 ? `${league} sim board has zero games.` : null,
    league === "MLB" && boardGames.length > 0 && marketEdges.length === 0 ? "MLB board has games but no market edges." : null,
    league === "MLB" && missingMarketGameIds.length ? `${missingMarketGameIds.length} MLB sim games have no market edge.` : null,
    boardGames.length > 0 && signalIds.size === 0 ? `${league} board has games but no trend signals.` : null,
    boardGames.length > 2 && signalIds.size <= 2 ? `${league} signal coverage is low: ${signalIds.size}/${boardGames.length} games.` : null,
    systems.summary.systems > 0 && systems.summary.activeMatches === 0 ? `${league} systems loaded but no active matches.` : null
  ].filter((warning): warning is string => Boolean(warning));

  return {
    league,
    simGames: boardGames.length,
    priorityRows: priorityRows.length,
    marketEdges: marketEdges.length,
    marketMatchedGames: marketIds.size,
    signalCount: signals.signals.length,
    signalGames: signalIds.size,
    systemCount: systems.summary.systems,
    activeSystems: systems.summary.activeSystems,
    activeSystemMatches: systems.summary.activeMatches,
    missingMarketGameIds,
    missingSignalGameIds,
    warnings
  };
}

export async function GET() {
  try {
    const [nbaBoard, mlbBoard, priority, market, cycleStatus] = await Promise.all([
      readSimCache<SimBoardSnapshot>(SIM_CACHE_KEYS.nbaBoard),
      readSimCache<SimBoardSnapshot>(SIM_CACHE_KEYS.mlbBoard),
      readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority),
      readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market),
      readTrendSystemCycleStatus()
    ]);

    const [nba, mlb] = await Promise.all([
      leagueCoverage("NBA", { board: nbaBoard, priority, market }),
      leagueCoverage("MLB", { board: mlbBoard, priority, market })
    ]);
    const warnings = [...nba.warnings, ...mlb.warnings];

    return NextResponse.json({
      ok: warnings.length === 0,
      generatedAt: new Date().toISOString(),
      cache: {
        nbaBoard: { hit: Boolean(nbaBoard), stale: Boolean(nbaBoard?.stale), ageSeconds: ageSeconds(nbaBoard?.generatedAt), generatedAt: nbaBoard?.generatedAt ?? null },
        mlbBoard: { hit: Boolean(mlbBoard), stale: Boolean(mlbBoard?.stale), ageSeconds: ageSeconds(mlbBoard?.generatedAt), generatedAt: mlbBoard?.generatedAt ?? null },
        priority: { hit: Boolean(priority), stale: Boolean(priority?.stale), ageSeconds: ageSeconds(priority?.generatedAt), generatedAt: priority?.generatedAt ?? null },
        market: { hit: Boolean(market), stale: Boolean(market?.stale), ageSeconds: ageSeconds(market?.generatedAt), generatedAt: market?.generatedAt ?? null, lineCount: market?.lineCount ?? 0, gameCount: market?.gameCount ?? 0 }
      },
      coverage: { nba, mlb },
      cycleStatus: cycleStatus ?? null,
      warnings,
      nextAction: warnings.length
        ? "Coverage gaps found. Warm sim, market, and trend cycle, then inspect missing IDs."
        : "Slate coverage looks healthy across sim, market, signals, and systems."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to build trends coverage report."
    }, { status: 500 });
  }
}
