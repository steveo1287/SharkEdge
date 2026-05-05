import type { LeagueKey } from "@/lib/types/domain";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildMainSimProjection, mainBrainLabel } from "@/services/simulation/main-sim-brain";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

type SimGame = {
  id: string;
  label: string;
  startTime: string;
  status: string;
  leagueKey: LeagueKey;
  leagueLabel: string;
  scoreboard?: string | null;
};

function round(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function pctDelta(newValue: number | null | undefined, oldValue: number | null | undefined) {
  if (typeof newValue !== "number" || typeof oldValue !== "number" || !Number.isFinite(newValue) || !Number.isFinite(oldValue)) return null;
  return round(newValue - oldValue, 4);
}

function parseLimit(value: number | undefined) {
  return Math.max(1, Math.min(60, Math.round(value ?? 30)));
}

async function fetchMlbGames() {
  const sections = await buildBoardSportSections({ selectedLeague: "MLB", gamesByLeague: {}, maxScoreboardGames: null });
  return sections.flatMap((section) => section.leagueKey === "MLB"
    ? section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel }))
    : []) as SimGame[];
}

function modelLean(projection: Awaited<ReturnType<typeof buildSimProjection>>) {
  const home = projection.distribution.homeWinPct;
  const away = projection.distribution.awayWinPct;
  return home >= away
    ? { side: "HOME" as const, team: projection.matchup.home, probability: home }
    : { side: "AWAY" as const, team: projection.matchup.away, probability: away };
}

function mainBrainMetadata(projection: Awaited<ReturnType<typeof buildMainSimProjection>>) {
  const mlbIntel = projection.mlbIntel as ({ mainBrain?: unknown; playerImpact?: unknown; v7?: unknown } & NonNullable<typeof projection.mlbIntel>) | null | undefined;
  return {
    mainBrain: mlbIntel?.mainBrain ?? null,
    playerImpact: mlbIntel?.playerImpact ?? null,
    v7: mlbIntel?.v7 ?? null,
    governor: projection.mlbIntel?.governor ?? null
  };
}

export async function buildMainSimBrainShadowAudit(args: { limit?: number } = {}) {
  const limit = parseLimit(args.limit);
  const generatedAt = new Date().toISOString();
  const games = (await fetchMlbGames()).filter((game) => game.status !== "FINAL" && game.status !== "POSTPONED" && game.status !== "CANCELED").slice(0, limit);
  const warnings: string[] = [];
  const rows = [];

  for (const game of games) {
    try {
      const [rawProjection, mainProjection] = await Promise.all([
        buildSimProjection(game),
        buildMainSimProjection(game)
      ]);
      const rawLean = modelLean(rawProjection);
      const mainLean = modelLean(mainProjection);
      const metadata = mainBrainMetadata(mainProjection);
      rows.push({
        game: {
          id: game.id,
          label: game.label,
          startTime: game.startTime,
          status: game.status
        },
        raw: {
          lean: rawLean,
          homeWinPct: round(rawProjection.distribution.homeWinPct),
          awayWinPct: round(rawProjection.distribution.awayWinPct),
          avgHome: round(rawProjection.distribution.avgHome, 2),
          avgAway: round(rawProjection.distribution.avgAway, 2),
          tier: rawProjection.mlbIntel?.governor?.tier ?? null,
          noBet: rawProjection.mlbIntel?.governor?.noBet ?? null
        },
        main: {
          lean: mainLean,
          homeWinPct: round(mainProjection.distribution.homeWinPct),
          awayWinPct: round(mainProjection.distribution.awayWinPct),
          avgHome: round(mainProjection.distribution.avgHome, 2),
          avgAway: round(mainProjection.distribution.avgAway, 2),
          tier: mainProjection.mlbIntel?.governor?.tier ?? null,
          noBet: mainProjection.mlbIntel?.governor?.noBet ?? null
        },
        deltas: {
          homeWinPct: pctDelta(mainProjection.distribution.homeWinPct, rawProjection.distribution.homeWinPct),
          awayWinPct: pctDelta(mainProjection.distribution.awayWinPct, rawProjection.distribution.awayWinPct),
          avgHome: pctDelta(mainProjection.distribution.avgHome, rawProjection.distribution.avgHome),
          avgAway: pctDelta(mainProjection.distribution.avgAway, rawProjection.distribution.avgAway),
          leanChanged: rawLean.side !== mainLean.side,
          tierChanged: (rawProjection.mlbIntel?.governor?.tier ?? null) !== (mainProjection.mlbIntel?.governor?.tier ?? null),
          noBetChanged: (rawProjection.mlbIntel?.governor?.noBet ?? null) !== (mainProjection.mlbIntel?.governor?.noBet ?? null)
        },
        metadata
      });
    } catch (error) {
      warnings.push(`${game.label}: ${error instanceof Error ? error.message : "unknown main-brain shadow audit error"}`);
    }
  }

  const leanChanges = rows.filter((row) => row.deltas.leanChanged).length;
  const tierChanges = rows.filter((row) => row.deltas.tierChanged).length;
  const noBetChanges = rows.filter((row) => row.deltas.noBetChanged).length;
  const avgAbsHomeMove = rows.length
    ? rows.reduce((sum, row) => sum + Math.abs(row.deltas.homeWinPct ?? 0), 0) / rows.length
    : 0;

  return {
    ok: true,
    generatedAt,
    modelVersion: "main-sim-brain-v1-shadow-audit",
    brain: mainBrainLabel("MLB"),
    gameCount: games.length,
    rowCount: rows.length,
    summary: {
      leanChanges,
      tierChanges,
      noBetChanges,
      avgAbsHomeWinPctMove: round(avgAbsHomeMove, 4)
    },
    warnings,
    rows
  };
}
