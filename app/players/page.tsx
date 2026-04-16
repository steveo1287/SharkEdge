import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ResearchStatusNotice } from "@/components/ui/research-status-notice";
import { SectionTitle } from "@/components/ui/section-title";
import { formatAmericanOdds } from "@/lib/formatters/odds";
import type { LeagueKey, PlayerRecord, PropCardView } from "@/lib/types/domain";
import { getPropsExplorerData } from "@/services/odds/props-service";

export const dynamic = "force-dynamic";

type PlayerHubRow = {
  player: PlayerRecord;
  leagueKey: LeagueKey;
  teamLabel: string;
  propCount: number;
  bestEdgeLabel: string;
  bestEv: number | null;
  bestOdds: number;
  marketLabel: string;
};

function buildPlayerRows(props: PropCardView[]) {
  const grouped = new Map<string, PropCardView[]>();

  for (const prop of props) {
    const current = grouped.get(prop.player.id) ?? [];
    current.push(prop);
    grouped.set(prop.player.id, current);
  }

  return Array.from(grouped.values())
    .map((playerProps) => {
      const sorted = [...playerProps].sort((left, right) => {
        const evDelta = (right.expectedValuePct ?? -999) - (left.expectedValuePct ?? -999);
        if (evDelta !== 0) {
          return evDelta;
        }

        return right.edgeScore.score - left.edgeScore.score;
      });
      const topProp = sorted[0];

      return {
        player: topProp.player,
        leagueKey: topProp.leagueKey,
        teamLabel: topProp.team.abbreviation,
        propCount: playerProps.length,
        bestEdgeLabel: topProp.edgeScore.label,
        bestEv: topProp.expectedValuePct ?? null,
        bestOdds: topProp.bestAvailableOddsAmerican ?? topProp.oddsAmerican,
        marketLabel: `${topProp.marketType} ${topProp.side} ${topProp.line}`
      } satisfies PlayerHubRow;
    })
    .sort((left, right) => {
      const evDelta = (right.bestEv ?? -999) - (left.bestEv ?? -999);
      if (evDelta !== 0) {
        return evDelta;
      }

      return right.propCount - left.propCount;
    })
    .slice(0, 18);
}

export default async function PlayersPage() {
  const data = await getPropsExplorerData({
    league: "ALL",
    marketType: "ALL",
    team: "all",
    player: "all",
    sportsbook: "all",
    valueFlag: "all",
    sortBy: "edge_score"
  });

  const playerRows = buildPlayerRows(data.props);

  return (
    <div className="grid gap-8">
      <section className="surface-panel-strong px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div className="grid gap-4">
            <div className="section-kicker">Players</div>
            <div className="max-w-4xl font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              Find the players driving the strongest prop and workload pressure right now.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300">
              Until full player pages are rebuilt, this hub is the fastest way into the names currently creating real prop opportunity.
            </div>
          </div>
          <div className="grid gap-3 rounded-[1.55rem] border border-white/8 bg-[#09131f]/85 p-5 text-sm text-slate-300">
            <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Current player radar</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">Tracked names</div>
                <div className="mt-2 text-3xl font-semibold text-white">{playerRows.length}</div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">Live rows</div>
                <div className="mt-2 text-3xl font-semibold text-white">{data.props.length}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ResearchStatusNotice
        eyebrow="Page status"
        title="Supporting desk, not a finished player-page system"
        body="Use this page to find names worth opening in the prop lab right now. It is intentionally a routing surface until full player pages, rolling logs, and deeper betting context are rebuilt."
        meta="Best use: identify the player, then jump into props or the matchup page for the actual decision."
      />

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Prop pressure"
          title="Players to open first"
          description="Sorted by current edge quality and live prop opportunity, not vanity popularity."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {playerRows.map((row) => (
            <Link
              key={row.player.id}
              href={`/props?league=${row.leagueKey}&player=${row.player.id}`}
              className="h-full"
            >
              <Card className="surface-panel flex h-full flex-col p-5 transition hover:border-sky-400/25 hover:bg-white/[0.03]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                      {row.leagueKey} � {row.teamLabel}
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-white">{row.player.name}</div>
                    <div className="mt-1 text-sm text-slate-400">{row.player.position}</div>
                  </div>
                  <Badge tone={row.bestEdgeLabel === "Elite" ? "success" : row.bestEdgeLabel === "Strong" ? "brand" : "premium"}>
                    {row.bestEdgeLabel}
                  </Badge>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-slate-500">Rows</div>
                    <div className="mt-1 font-semibold text-white">{row.propCount}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Best EV</div>
                    <div className="mt-1 font-semibold text-emerald-300">
                      {typeof row.bestEv === "number" ? `${row.bestEv > 0 ? "+" : ""}${row.bestEv.toFixed(1)}%` : "--"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Best price</div>
                    <div className="mt-1 font-semibold text-white">{formatAmericanOdds(row.bestOdds)}</div>
                  </div>
                </div>
                <div className="mt-4 text-sm leading-6 text-slate-400">Best current entry: {row.marketLabel}</div>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
