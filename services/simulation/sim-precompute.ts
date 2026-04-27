import { prisma } from "@/lib/db/prisma";
import { buildAdaptivePlayerSimV2 } from "./player-sim-v2-adaptive";
import { getSimTuning } from "./get-sim-tuning";
import { setCachedSim } from "./sim-cache";

export type PrecomputeMetrics = {
  total: number;
  computed: number;
  failed: number;
  cached: number;
  duration: number;
  timestamp: string;
};

async function isGameTime(): Promise<boolean> {
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();

  const inGameWindow = hour >= 21 || hour < 7;
  const isWeekday = day >= 1 && day <= 5;

  return inGameWindow && isWeekday;
}

export async function precomputeActivePropSims(): Promise<PrecomputeMetrics> {
  const start = Date.now();
  let computed = 0;
  let failed = 0;

  try {
    const tuning = await getSimTuning();
    const gameTime = await isGameTime();

    const props = await prisma.propCardView.findMany({
      where: {
        supportStatus: "LIVE",
        leagueKey: "NBA"
      },
      select: {
        id: true,
        playerId: true,
        playerName: true,
        propType: true,
        line: true,
        bestAvailableOddsAmerican: true,
        oddsAmerican: true,
        teamTotal: true,
        minutes: true,
        matchupRank: true,
        recentHitRate: true,
        leagueKey: true
      },
      take: 50
    });

    for (const prop of props) {
      try {
        const odds = prop.bestAvailableOddsAmerican ?? prop.oddsAmerican;
        if (!odds) continue;

        const sim = await buildAdaptivePlayerSimV2(
          {
            player: prop.playerName,
            propType: prop.propType as any,
            line: prop.line,
            odds,
            teamTotal: prop.teamTotal ?? 110,
            minutes: prop.minutes ?? 34,
            usageRate: 0.24
          },
          tuning
        );

        setCachedSim(
          prop.id,
          prop.playerId ?? "",
          prop.playerName,
          prop.propType,
          prop.line,
          odds,
          sim,
          gameTime
        );

        computed++;
      } catch (error) {
        console.error(`Failed to precompute sim for ${prop.playerName}:`, error);
        failed++;
      }
    }

    return {
      total: props.length,
      computed,
      failed,
      cached: computed,
      duration: Date.now() - start,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Precompute job failed:", error);
    return {
      total: 0,
      computed: 0,
      failed: 1,
      cached: 0,
      duration: Date.now() - start,
      timestamp: new Date().toISOString()
    };
  }
}
