import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";

import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

import type { BoardSportSectionView, LeagueKey } from "@/lib/types/domain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SimGame = {
  id: string;
  label: string;
  startTime: string;
  status: string;
  leagueKey: LeagueKey;
  leagueLabel: string;
};

type Row = {
  game: SimGame;
  projection: Awaited<ReturnType<typeof buildSimProjection>>;
};

const LEAGUE_ICONS: Record<LeagueKey, string> = {
  NBA: "🏀",
  MLB: "⚾",
  NHL: "🏒",
  NFL: "🏈",
  NCAAF: "🏈",
  UFC: "🥊",
  BOXING: "🥊"
};

function flatten(sections: BoardSportSectionView[]): SimGame[] {
  return sections.flatMap((s) =>
    s.scoreboard.map((g) => ({
      ...g,
      leagueKey: s.leagueKey,
      leagueLabel: s.leagueLabel
    }))
  );
}

function formatTime(v: string) {
  const d = new Date(v);
  if (isNaN(d.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(d);
}

function tone(status: string) {
  if (status === "LIVE") return "success";
  if (status === "FINAL") return "neutral";
  return "muted";
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span>{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-slate-800 rounded">
        <div
          className="h-full bg-sky-400 rounded"
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}

function CardRow({ row }: { row: Row }) {
  const { game, projection } = row;
  const d = projection.distribution;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex justify-between">
        <div>
          <div className="text-xs text-slate-500">
            {LEAGUE_ICONS[game.leagueKey]} {game.leagueKey}
          </div>
          <div className="text-xl text-white font-semibold">
            {projection.matchup.away} @ {projection.matchup.home}
          </div>
          <div className="text-sm text-slate-400">
            {formatTime(game.startTime)}
          </div>
        </div>
        <Badge tone={tone(game.status)}>{game.status}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-slate-400">Away</div>
          <div className="text-2xl text-white">{d.avgAway}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Home</div>
          <div className="text-2xl text-white">{d.avgHome}</div>
        </div>
      </div>

      <Bar label="Home Win" value={d.homeWinPct} />
      <Bar label="Away Win" value={d.awayWinPct} />

      <div className="text-sm text-slate-300">{projection.read}</div>

      <div className="text-xs text-slate-500">
        Engine: {projection.nbaIntel?.modelVersion || "fallback"} | Source:{" "}
        {projection.nbaIntel?.dataSource || "synthetic"}
      </div>

      <Link
        href={`/api/debug/nba-player-feed?team=${projection.matchup.home}`}
        className="text-xs text-sky-400"
      >
        Debug data →
      </Link>
    </Card>
  );
}

export default async function Page() {
  const sections = await buildBoardSportSections({
    selectedLeague: "ALL",
    gamesByLeague: {}
  });

  const games = flatten(sections);

  const rows: Row[] = await Promise.all(
    games.map(async (game) => ({
      game,
      projection: await buildSimProjection(game)
    }))
  );

  if (!rows.length) {
    return (
      <EmptyState
        title="No games"
        description="No data available"
      />
    );
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Simulation Engine"
        description="Powered by real player + intel model"
      />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((r) => (
          <CardRow key={r.game.id} row={r} />
        ))}
      </div>
    </div>
  );
}
