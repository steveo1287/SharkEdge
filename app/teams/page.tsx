import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ResearchStatusNotice } from "@/components/ui/research-status-notice";
import { SectionTitle } from "@/components/ui/section-title";
import type { LeagueKey, PropCardView, TeamRecord } from "@/lib/types/domain";
import { getBoardPageData, parseBoardFilters } from "@/services/odds/board-service";
import { getPropsExplorerData } from "@/services/odds/props-service";

export const dynamic = "force-dynamic";

type TeamHubRow = {
  team: TeamRecord;
  leagueKey: LeagueKey;
  propCount: number;
  bestEv: number | null;
  nextGameCount: number;
  edgeLabel: string;
};

function buildTeamRows(props: PropCardView[], boardGames: Awaited<ReturnType<typeof getBoardPageData>>["games"]) {
  const groupedProps = new Map<string, PropCardView[]>();

  for (const prop of props) {
    const current = groupedProps.get(prop.team.id) ?? [];
    current.push(prop);
    groupedProps.set(prop.team.id, current);
  }

  const teams = new Map<string, TeamHubRow>();

  for (const game of boardGames) {
    if (game.bestBookCount <= 0) {
      continue;
    }

    for (const team of [game.awayTeam, game.homeTeam]) {
      const existing = teams.get(team.id);
      teams.set(team.id, {
        team,
        leagueKey: game.leagueKey,
        propCount: existing?.propCount ?? 0,
        bestEv: existing?.bestEv ?? null,
        nextGameCount: (existing?.nextGameCount ?? 0) + 1,
        edgeLabel: existing?.edgeLabel ?? "Measured"
      });
    }
  }

  for (const teamProps of groupedProps.values()) {
    const sorted = [...teamProps].sort((left, right) => {
      const evDelta = (right.expectedValuePct ?? -999) - (left.expectedValuePct ?? -999);
      if (evDelta !== 0) {
        return evDelta;
      }

      return right.edgeScore.score - left.edgeScore.score;
    });
    const topProp = sorted[0];
    const existing = teams.get(topProp.team.id);

    teams.set(topProp.team.id, {
      team: topProp.team,
      leagueKey: topProp.leagueKey,
      propCount: teamProps.length,
      bestEv: topProp.expectedValuePct ?? null,
      nextGameCount: existing?.nextGameCount ?? 0,
      edgeLabel: topProp.edgeScore.label
    });
  }

  return Array.from(teams.values())
    .sort((left, right) => {
      const gameDelta = right.nextGameCount - left.nextGameCount;
      if (gameDelta !== 0) {
        return gameDelta;
      }

      const evDelta = (right.bestEv ?? -999) - (left.bestEv ?? -999);
      if (evDelta !== 0) {
        return evDelta;
      }

      const propDelta = right.propCount - left.propCount;
      if (propDelta !== 0) {
        return propDelta;
      }

      return left.team.name.localeCompare(right.team.name);
    })
    .slice(0, 24);
}

export default async function TeamsPage() {
  const [propsData, boardData] = await Promise.all([
    getPropsExplorerData({
      league: "ALL",
      marketType: "ALL",
      team: "all",
      player: "all",
      sportsbook: "all",
      valueFlag: "all",
      sortBy: "edge_score"
    }),
    getBoardPageData(
      parseBoardFilters({
        league: "ALL",
        date: "today",
        sportsbook: "best",
        market: "all",
        status: "all"
      })
    )
  ]);

  const teamRows = buildTeamRows(propsData.props, boardData.games);

  return (
    <div className="grid gap-8">
      <section className="surface-panel-strong px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div className="grid gap-4">
            <div className="section-kicker">Teams</div>
            <div className="max-w-4xl font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              Team context should lead you into matchups, not dump you into dead schedule pages.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300">
              This hub now merges verified board coverage with live prop pressure, so teams stay visible even when props are thin or still coming online.
            </div>
          </div>
          <div className="grid gap-3 rounded-[1.55rem] border border-white/8 bg-[#09131f]/85 p-5 text-sm text-slate-300">
            <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Current team radar</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">Teams surfaced</div>
                <div className="mt-2 text-3xl font-semibold text-white">{teamRows.length}</div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">Verified games</div>
                <div className="mt-2 text-3xl font-semibold text-white">{boardData.games.filter((game) => game.bestBookCount > 0).length}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ResearchStatusNotice
        eyebrow="Page status"
        title="Supporting desk, not a finished team-page system"
        body="Use this page to identify which teams are worth opening in the board or matchup workflow right now. Verified board teams stay surfaced even when player props are thin, so NHL and other lighter prop leagues do not disappear."
        meta="Best use: jump from the team signal into the league or matchup desk where the actual pricing decision happens."
      />

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Research hubs"
          title="Teams worth opening first"
          description="Driven by verified board presence first, then current prop pressure where real markets exist."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teamRows.map((row) => (
            <Link key={row.team.id} href={`/leagues/${row.leagueKey}`} className="h-full">
              <Card className="surface-panel flex h-full flex-col p-5 transition hover:border-sky-400/25 hover:bg-white/[0.03]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">{row.leagueKey}</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{row.team.name}</div>
                    <div className="mt-1 text-sm text-slate-400">{row.team.abbreviation}</div>
                  </div>
                  <Badge tone={row.edgeLabel === "Elite" ? "success" : row.edgeLabel === "Strong" ? "brand" : "premium"}>
                    {row.edgeLabel}
                  </Badge>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-slate-500">Prop rows</div>
                    <div className="mt-1 font-semibold text-white">{row.propCount}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Best EV</div>
                    <div className="mt-1 font-semibold text-emerald-300">
                      {typeof row.bestEv === "number" ? `${row.bestEv > 0 ? "+" : ""}${row.bestEv.toFixed(1)}%` : "--"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Verified games</div>
                    <div className="mt-1 font-semibold text-white">{row.nextGameCount}</div>
                  </div>
                </div>
                <div className="mt-4 text-sm leading-6 text-slate-400">
                  Open the league desk to move from team-level signal into matchup-level pricing and context.
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
