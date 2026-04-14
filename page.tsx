import { ScoreStrip } from "@/components/intelligence/score-strip";
import { StorylineStack } from "@/components/intelligence/storyline-stack";
import { TeamSpotlightCard } from "@/components/intelligence/team-spotlight-card";
import { SectionTitle } from "@/components/ui/section-title";
import type { LeagueKey, LeagueSnapshotView, PropCardView } from "@/lib/types/domain";
import { getBoardPageData, parseBoardFilters } from "@/services/odds/board-service";
import { getPropsExplorerData } from "@/services/odds/props-service";
import { getLeagueSnapshots } from "@/services/stats/stats-service";

export const dynamic = "force-dynamic";

type TeamSpotlightRow = {
  team: PropCardView["team"];
  leagueKey: LeagueKey;
  propCount: number;
  verifiedGames: number;
  bestEv: number | null;
  record: string | null;
  streak: string | null;
  rank: number | null;
  recentSummary: string[];
};

function buildSnapshotIndexes(snapshots: LeagueSnapshotView[]) {
  const standingMap = new Map<string, { rank: number; record: string; streak: string }>();
  const recentMap = new Map<string, string[]>();

  for (const snapshot of snapshots) {
    for (const standing of snapshot.standings) {
      standingMap.set(`${snapshot.league.key}:${standing.team.id}`, {
        rank: standing.rank,
        record: standing.record,
        streak: standing.streak
      });
    }

    for (const game of snapshot.previousGames) {
      const awayWon = game.awayScore > game.homeScore;
      const homeWon = game.homeScore > game.awayScore;

      recentMap.set(`${snapshot.league.key}:${game.awayTeam.id}`, [
        ...(recentMap.get(`${snapshot.league.key}:${game.awayTeam.id}`) ?? []),
        `${awayWon ? "W" : "L"} ${game.awayScore}-${game.homeScore} vs ${game.homeTeam.abbreviation}`
      ]);
      recentMap.set(`${snapshot.league.key}:${game.homeTeam.id}`, [
        ...(recentMap.get(`${snapshot.league.key}:${game.homeTeam.id}`) ?? []),
        `${homeWon ? "W" : "L"} ${game.homeScore}-${game.awayScore} vs ${game.awayTeam.abbreviation}`
      ]);
    }
  }

  return { standingMap, recentMap };
}

function buildRows(props: PropCardView[], verifiedGames: Map<string, number>, snapshots: LeagueSnapshotView[]) {
  const grouped = new Map<string, PropCardView[]>();
  const { standingMap, recentMap } = buildSnapshotIndexes(snapshots);

  for (const prop of props) {
    const key = `${prop.leagueKey}:${prop.team.id}`;
    grouped.set(key, [...(grouped.get(key) ?? []), prop]);
  }

  return Array.from(grouped.entries())
    .map(([key, rows]) => {
      const best = [...rows].sort((a, b) => (b.expectedValuePct ?? -999) - (a.expectedValuePct ?? -999))[0];
      const standing = standingMap.get(key);
      return {
        team: best.team,
        leagueKey: best.leagueKey,
        propCount: rows.length,
        verifiedGames: verifiedGames.get(best.team.id) ?? 0,
        bestEv: best.expectedValuePct ?? null,
        record: standing?.record ?? null,
        streak: standing?.streak ?? null,
        rank: standing?.rank ?? null,
        recentSummary: recentMap.get(key) ?? []
      } satisfies TeamSpotlightRow;
    })
    .sort((a, b) => {
      const rankDelta = (a.rank ?? 999) - (b.rank ?? 999);
      if (rankDelta !== 0) return rankDelta;
      return (b.bestEv ?? -999) - (a.bestEv ?? -999);
    })
    .slice(0, 18);
}

export default async function TeamsPage() {
  const [boardData, propsData, snapshots] = await Promise.all([
    getBoardPageData(
      parseBoardFilters({ league: "ALL", date: "today", sportsbook: "best", market: "all", status: "all" })
    ),
    getPropsExplorerData({
      league: "ALL",
      marketType: "ALL",
      team: "all",
      player: "all",
      sportsbook: "all",
      valueFlag: "all",
      sortBy: "edge_score"
    }),
    getLeagueSnapshots("ALL")
  ]);

  const verifiedGames = new Map<string, number>();
  for (const game of boardData.games.filter((game) => game.bestBookCount > 0)) {
    verifiedGames.set(game.awayTeam.id, (verifiedGames.get(game.awayTeam.id) ?? 0) + 1);
    verifiedGames.set(game.homeTeam.id, (verifiedGames.get(game.homeTeam.id) ?? 0) + 1);
  }

  const rows = buildRows(propsData.props, verifiedGames, snapshots);

  return (
    <div className="grid gap-8">
      <section className="surface-panel-strong px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div className="grid gap-4">
            <div className="section-kicker">Team intelligence</div>
            <div className="max-w-4xl font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              Team pages should feel alive: standings, recent results, prop pressure, and where to enter the board next.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300">
              This pass turns the team hub into a routing surface for real decisions instead of a static list of names.
            </div>
          </div>
          <div className="rounded-[1.55rem] border border-white/8 bg-[#09131f]/85 p-5 text-sm leading-6 text-slate-300">
            {rows.length} teams surfaced across standings, verified board presence, and current prop opportunity.
          </div>
        </div>
      </section>

      <ScoreStrip snapshots={snapshots} />

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Open first"
          title="Teams worth dropping into right now"
          description="The better this page gets, the less it feels like a dead index and the more it feels like a team intelligence desk."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => <TeamSpotlightCard key={`${row.leagueKey}-${row.team.id}`} {...row} />)}
        </div>
      </section>

      <StorylineStack snapshots={snapshots} title="News threads affecting team context" />
    </div>
  );
}
