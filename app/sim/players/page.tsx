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

type SearchParams = { league?: string | string[] };
type PageProps = { searchParams?: Promise<SearchParams> };
type SimGame = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string };
type Projection = Awaited<ReturnType<typeof buildSimProjection>>;
type PlayerProjection = NonNullable<Projection["nbaIntel"]>["playerStatProjections"][number];
type MatchupRow = { game: SimGame; projection: Projection };

const PLAYER_MATCHUP_LEAGUES: LeagueKey[] = ["NBA"];

function selectedLeague(value: string | string[] | undefined): LeagueKey {
  const raw = Array.isArray(value) ? value[0] : value;
  const upper = String(raw ?? "NBA").toUpperCase();
  return PLAYER_MATCHUP_LEAGUES.includes(upper as LeagueKey) ? (upper as LeagueKey) : "NBA";
}

function flatten(sections: BoardSportSectionView[]): SimGame[] {
  return sections.flatMap((section) =>
    section.scoreboard.map((game) => ({
      ...game,
      leagueKey: section.leagueKey,
      leagueLabel: section.leagueLabel
    }))
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function plus(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function tone(status: string) {
  if (status === "LIVE") return "success" as const;
  if (status === "FINAL") return "neutral" as const;
  if (status === "POSTPONED" || status === "CANCELED") return "danger" as const;
  return "muted" as const;
}

function decisionTone(tier: string | undefined) {
  if (tier === "attack") return "success" as const;
  if (tier === "watch") return "premium" as const;
  return "muted" as const;
}

function playerRank(row: PlayerProjection) {
  return row.projectedMinutes * 0.65 + row.projectedPoints * 0.55 + row.projectedAssists * 0.35 + row.projectedRebounds * 0.24 + row.confidence * 12;
}

function teamRows(rows: PlayerProjection[], side: "away" | "home") {
  return rows
    .filter((row) => row.teamSide === side)
    .sort((left, right) => playerRank(right) - playerRank(left));
}

function sum(rows: PlayerProjection[], selector: (row: PlayerProjection) => number) {
  return rows.reduce((total, row) => total + selector(row), 0);
}

function TeamTotalTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold text-white">{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-slate-400">{sub}</div> : null}
    </div>
  );
}

function PlayerBoxScoreTable({ title, rows }: { title: string; rows: PlayerProjection[] }) {
  const totals = {
    minutes: sum(rows, (row) => row.projectedMinutes),
    points: sum(rows, (row) => row.projectedPoints),
    rebounds: sum(rows, (row) => row.projectedRebounds),
    assists: sum(rows, (row) => row.projectedAssists),
    threes: sum(rows, (row) => row.projectedThrees)
  };

  return (
    <Card className="surface-panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">Projected player box score</div>
        </div>
        <div className="text-right font-mono text-sm text-sky-200">{num(totals.points)} pts</div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
            <tr>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2 text-right">Min</th>
              <th className="px-3 py-2 text-right">Pts</th>
              <th className="px-3 py-2 text-right">Reb</th>
              <th className="px-3 py-2 text-right">Ast</th>
              <th className="px-3 py-2 text-right">3PM</th>
              <th className="px-3 py-2 text-right">PRA</th>
              <th className="px-3 py-2 text-right">Conf</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const pra = row.projectedPoints + row.projectedRebounds + row.projectedAssists;
              return (
                <tr key={`${row.teamName}:${row.playerName}`} className="border-b border-white/5 last:border-none">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-white">{row.playerName}</div>
                    <div className="text-[10px] text-slate-500">{row.status} · {row.source}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-200">{num(row.projectedMinutes)}</td>
                  <td className="px-3 py-2 text-right font-mono text-sky-200">{num(row.projectedPoints)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-200">{num(row.projectedRebounds)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-200">{num(row.projectedAssists)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-200">{num(row.projectedThrees)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-200">{num(pra)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-200">{pct(row.confidence, 0)}</td>
                </tr>
              );
            })}
            <tr className="bg-white/[0.025] font-semibold text-white">
              <td className="px-3 py-2">Team total</td>
              <td className="px-3 py-2 text-right font-mono">{num(totals.minutes)}</td>
              <td className="px-3 py-2 text-right font-mono">{num(totals.points)}</td>
              <td className="px-3 py-2 text-right font-mono">{num(totals.rebounds)}</td>
              <td className="px-3 py-2 text-right font-mono">{num(totals.assists)}</td>
              <td className="px-3 py-2 text-right font-mono">{num(totals.threes)}</td>
              <td className="px-3 py-2 text-right font-mono">{num(totals.points + totals.rebounds + totals.assists)}</td>
              <td className="px-3 py-2 text-right font-mono">--</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PlayerVsPlayerPanel({ awayRows, homeRows }: { awayRows: PlayerProjection[]; homeRows: PlayerProjection[] }) {
  const pairs = Array.from({ length: Math.max(awayRows.length, homeRows.length) }, (_, index) => ({
    away: awayRows[index],
    home: homeRows[index]
  })).filter((pair) => pair.away || pair.home).slice(0, 8);

  if (!pairs.length) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Player matchup ladder</div>
          <div className="mt-1 text-xs text-slate-500">Players paired by projected role/minute value, not by position labels.</div>
        </div>
        <Badge tone="brand">PVP</Badge>
      </div>
      <div className="mt-4 grid gap-2">
        {pairs.map((pair, index) => {
          const awayPra = pair.away ? pair.away.projectedPoints + pair.away.projectedRebounds + pair.away.projectedAssists : 0;
          const homePra = pair.home ? pair.home.projectedPoints + pair.home.projectedRebounds + pair.home.projectedAssists : 0;
          return (
            <div key={`pair-${index}`} className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs md:grid-cols-[1fr_auto_1fr] md:items-center">
              <div>
                <div className="font-semibold text-white">{pair.away?.playerName ?? "—"}</div>
                <div className="mt-1 text-slate-400">{pair.away ? `${num(pair.away.projectedPoints)} pts · ${num(awayPra)} PRA · ${num(pair.away.projectedMinutes)} min` : "No player"}</div>
              </div>
              <div className="text-center font-mono text-[11px] text-slate-500">
                #{index + 1}<br />PRA Δ {plus(homePra - awayPra)}
              </div>
              <div className="text-right md:text-left">
                <div className="font-semibold text-white">{pair.home?.playerName ?? "—"}</div>
                <div className="mt-1 text-slate-400">{pair.home ? `${num(pair.home.projectedPoints)} pts · ${num(homePra)} PRA · ${num(pair.home.projectedMinutes)} min` : "No player"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchupBoxScoreCard({ row }: { row: MatchupRow }) {
  const { game, projection } = row;
  const players = projection.nbaIntel?.playerStatProjections ?? [];
  const awayRows = teamRows(players, "away");
  const homeRows = teamRows(players, "home");
  const awayPoints = sum(awayRows, (player) => player.projectedPoints);
  const homePoints = sum(homeRows, (player) => player.projectedPoints);
  const detailHref = `/sim/${game.leagueKey.toLowerCase()}/${encodeURIComponent(game.id)}`;
  const tier = projection.nbaIntel?.tier ?? "pass";

  return (
    <section className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{game.leagueKey} · {formatTime(game.startTime)}</div>
          <h2 className="mt-2 font-display text-2xl font-semibold text-white">{projection.matchup.away} @ {projection.matchup.home}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{projection.read}</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Badge tone={tone(game.status)}>{game.status}</Badge>
          <Badge tone={decisionTone(tier)}>{tier.toUpperCase()}</Badge>
          <Link href={detailHref} className="rounded-full border border-sky-400/35 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-200 hover:bg-sky-500/15">
            Open full sim
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <TeamTotalTile label="Away score" value={num(projection.distribution.avgAway)} sub={projection.matchup.away} />
        <TeamTotalTile label="Home score" value={num(projection.distribution.avgHome)} sub={projection.matchup.home} />
        <TeamTotalTile label="Box pts" value={`${num(awayPoints)} / ${num(homePoints)}`} sub="Player sum" />
        <TeamTotalTile label="Game total" value={num(projection.nbaIntel?.projectedTotal ?? awayPoints + homePoints)} sub="Projection engine" />
        <TeamTotalTile label="Confidence" value={pct(projection.nbaIntel?.confidence, 0)} sub={`${projection.nbaIntel?.playerStatProjections.length ?? 0} player rows`} />
      </div>

      <PlayerVsPlayerPanel awayRows={awayRows} homeRows={homeRows} />

      {players.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <PlayerBoxScoreTable title={projection.matchup.away} rows={awayRows} />
          <PlayerBoxScoreTable title={projection.matchup.home} rows={homeRows} />
        </div>
      ) : (
        <Card className="surface-panel p-5 text-sm leading-6 text-slate-400">
          Player projection rows were not returned for this matchup. The game-level sim is available, but the roster box score needs NBA player profiles from the projection service.
        </Card>
      )}
    </section>
  );
}

export default async function SimPlayersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeLeague = selectedLeague(params?.league);
  const sections = await buildBoardSportSections({ selectedLeague: activeLeague, gamesByLeague: {}, maxScoreboardGames: 6 });
  const games = flatten(sections);
  const rows: MatchupRow[] = await Promise.all(
    games.map(async (game) => ({
      game,
      projection: await buildSimProjection(game)
    }))
  );
  const playerRows = rows.reduce((total, row) => total + (row.projection.nbaIntel?.playerStatProjections.length ?? 0), 0);
  const attack = rows.filter((row) => row.projection.nbaIntel?.tier === "attack").length;
  const watch = rows.filter((row) => row.projection.nbaIntel?.tier === "watch").length;

  return (
    <div className="space-y-6">
      <section className="surface-panel-strong p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="section-kicker">Player Matchups</div>
            <h1 className="mt-3 max-w-5xl font-display text-4xl font-semibold tracking-tight text-white">
              Projected box scores for every player in the matchup.
            </h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-bone/65">
              This page now uses the same live matchup simulation stack as Sim HQ. No mock player rows: each card pulls actual scoreboard matchups, runs the game projection, then expands both rosters into projected points, rebounds, assists, threes, PRA, confidence, and player-vs-player ladders.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/sim?league=NBA" className="rounded-md border border-aqua/35 bg-aqua/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-aqua">Sim HQ</Link>
            <Link href="/props?league=NBA" className="rounded-md border border-bone/[0.12] bg-panel px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-bone/75">NBA Props</Link>
            <Link href="/nba-edge" className="rounded-md border border-bone/[0.12] bg-panel px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-bone/75">NBA Edge</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <TeamTotalTile label="Matchups" value={String(rows.length)} sub={`${activeLeague} active slate`} />
        <TeamTotalTile label="Player rows" value={String(playerRows)} sub="Projected box-score entries" />
        <TeamTotalTile label="Attack / Watch" value={`${attack} / ${watch}`} sub="NBA governor tiers" />
        <TeamTotalTile label="Runs" value="10k" sub="Per-player simulation depth" />
      </section>

      <section className="grid gap-4">
        <SectionTitle
          title="NBA player matchup board"
          description="Open a full sim for the game-level model, or use these tables to read the expected player box score and matchup ladder directly."
        />
        {rows.length ? (
          rows.map((row) => <MatchupBoxScoreCard key={`${row.game.leagueKey}:${row.game.id}`} row={row} />)
        ) : (
          <EmptyState title="No NBA matchups available" description="The scoreboard provider did not return active NBA games for the current slate." />
        )}
      </section>
    </div>
  );
}
