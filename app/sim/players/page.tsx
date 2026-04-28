import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { calibrateNbaPlayerBoxScore } from "@/services/simulation/nba-box-score-calibration";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";
import type { BoardSportSectionView, LeagueKey } from "@/lib/types/domain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = {
  league?: string | string[];
  gameId?: string | string[];
  player?: string | string[];
};
type PageProps = { searchParams?: Promise<SearchParams> };
type SimGame = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string };
type Projection = Awaited<ReturnType<typeof buildSimProjection>>;
type PlayerProjection = NonNullable<Projection["nbaIntel"]>["playerStatProjections"][number];
type MatchupRow = { game: SimGame; projection: Projection };

const PLAYER_MATCHUP_LEAGUES: LeagueKey[] = ["NBA"];

function param(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ? decodeURIComponent(raw).trim() : null;
}

function selectedLeague(value: string | string[] | undefined): LeagueKey {
  const raw = Array.isArray(value) ? value[0] : value;
  const upper = String(raw ?? "NBA").toUpperCase();
  return PLAYER_MATCHUP_LEAGUES.includes(upper as LeagueKey) ? (upper as LeagueKey) : "NBA";
}

function normalizeName(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function playerMatches(row: PlayerProjection, focusPlayer: string | null) {
  if (!focusPlayer) return false;
  const rowName = normalizeName(row.playerName);
  const focus = normalizeName(focusPlayer);
  return Boolean(focus && (rowName === focus || rowName.includes(focus) || focus.includes(rowName)));
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

function withCalibratedNbaPlayers(projection: Projection): Projection {
  const players = projection.nbaIntel?.playerStatProjections ?? [];
  if (!projection.nbaIntel || !players.length) return projection;

  return {
    ...projection,
    nbaIntel: {
      ...projection.nbaIntel,
      playerStatProjections: calibrateNbaPlayerBoxScore(players, {
        awayPoints: projection.distribution.avgAway,
        homePoints: projection.distribution.avgHome
      })
    }
  };
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

function teamRows(rows: PlayerProjection[], side: "away" | "home", focusPlayer: string | null = null) {
  return rows
    .filter((row) => row.teamSide === side)
    .sort((left, right) => {
      const leftFocus = playerMatches(left, focusPlayer) ? 1 : 0;
      const rightFocus = playerMatches(right, focusPlayer) ? 1 : 0;
      if (leftFocus !== rightFocus) return rightFocus - leftFocus;
      return playerRank(right) - playerRank(left);
    });
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

function PlayerFocusPanel({ player, game }: { player: PlayerProjection; game: SimGame }) {
  const pra = player.projectedPoints + player.projectedRebounds + player.projectedAssists;
  const bestProp = player.propHitProbabilities.points ?? player.propHitProbabilities.assists ?? player.propHitProbabilities.rebounds ?? player.propHitProbabilities.threes ?? null;

  return (
    <Card className="border border-sky-400/30 bg-sky-500/[0.06] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-200/80">Focused player from prop board</div>
          <div className="mt-2 text-2xl font-semibold text-white">{player.playerName}</div>
          <div className="mt-1 text-sm text-slate-400">{player.teamName} · {game.label} · {formatTime(game.startTime)}</div>
        </div>
        <div className="grid gap-2 sm:grid-cols-5 lg:min-w-[620px]">
          <TeamTotalTile label="Minutes" value={num(player.projectedMinutes)} />
          <TeamTotalTile label="Points" value={num(player.projectedPoints)} />
          <TeamTotalTile label="Reb" value={num(player.projectedRebounds)} />
          <TeamTotalTile label="Ast" value={num(player.projectedAssists)} />
          <TeamTotalTile label="PRA" value={num(pra)} />
        </div>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
          <div className="mb-1 text-slate-100">Floor / Median / Ceiling</div>
          <div>PTS {num(player.floor.points)} / {num(player.projectedPoints)} / {num(player.ceiling.points)}</div>
          <div>REB {num(player.floor.rebounds)} / {num(player.projectedRebounds)} / {num(player.ceiling.rebounds)}</div>
          <div>AST {num(player.floor.assists)} / {num(player.projectedAssists)} / {num(player.ceiling.assists)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
          <div className="mb-1 text-slate-100">Best prop read</div>
          {bestProp ? (
            <>
              <div>{bestProp.recommendedSide} line {num(bestProp.line)}</div>
              <div>O {pct(bestProp.overProbability)} / U {pct(bestProp.underProbability)}</div>
              <div>Edge to line {plus(bestProp.edgeToLine)}</div>
            </>
          ) : (
            <div>No matched market line on this player yet.</div>
          )}
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
          <div className="mb-1 text-slate-100">Why / risk</div>
          <div>{player.whyLikely[0] ?? "Role and possession context support the median projection."}</div>
          <div className="mt-1 text-slate-500">{player.whyNotLikely[0] ?? "No major downside flags from current context stack."}</div>
        </div>
      </div>
    </Card>
  );
}

function PlayerBoxScoreTable({ title, rows, focusPlayer, targetPoints }: { title: string; rows: PlayerProjection[]; focusPlayer: string | null; targetPoints: number }) {
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
          <div className="mt-0.5 text-[11px] text-slate-500">Calibrated projected player box score</div>
        </div>
        <div className="text-right font-mono text-sm text-sky-200">{num(totals.points)} / {num(targetPoints)} pts</div>
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
              const focused = playerMatches(row, focusPlayer);
              return (
                <tr key={`${row.teamName}:${row.playerName}`} className={focused ? "border-b border-sky-400/20 bg-sky-500/[0.08]" : "border-b border-white/5 last:border-none"}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{row.playerName}</span>
                      {focused ? <Badge tone="brand">FOCUS</Badge> : null}
                    </div>
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

function PlayerVsPlayerPanel({ awayRows, homeRows, focusPlayer }: { awayRows: PlayerProjection[]; homeRows: PlayerProjection[]; focusPlayer: string | null }) {
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
          const focused = Boolean((pair.away && playerMatches(pair.away, focusPlayer)) || (pair.home && playerMatches(pair.home, focusPlayer)));
          return (
            <div key={`pair-${index}`} className={focused ? "grid gap-2 rounded-xl border border-sky-400/25 bg-sky-500/[0.07] p-3 text-xs md:grid-cols-[1fr_auto_1fr] md:items-center" : "grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs md:grid-cols-[1fr_auto_1fr] md:items-center"}>
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

function MatchupBoxScoreCard({ row, focusPlayer, focusedGameId }: { row: MatchupRow; focusPlayer: string | null; focusedGameId: string | null }) {
  const { game, projection } = row;
  const players = projection.nbaIntel?.playerStatProjections ?? [];
  const awayRows = teamRows(players, "away", focusPlayer);
  const homeRows = teamRows(players, "home", focusPlayer);
  const awayPoints = sum(awayRows, (player) => player.projectedPoints);
  const homePoints = sum(homeRows, (player) => player.projectedPoints);
  const detailHref = `/sim/${game.leagueKey.toLowerCase()}/${encodeURIComponent(game.id)}`;
  const tier = projection.nbaIntel?.tier ?? "pass";
  const focusedPlayer = players.find((player) => playerMatches(player, focusPlayer)) ?? null;
  const focusedGame = Boolean(focusedGameId && game.id === focusedGameId);

  return (
    <section className={focusedGame ? "grid gap-4 rounded-3xl border border-sky-400/30 bg-sky-500/[0.045] p-4" : "grid gap-4 rounded-3xl border border-white/10 bg-white/[0.025] p-4"}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{game.leagueKey} · {formatTime(game.startTime)}</div>
          <h2 className="mt-2 font-display text-2xl font-semibold text-white">{projection.matchup.away} @ {projection.matchup.home}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{projection.read}</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Badge tone={tone(game.status)}>{game.status}</Badge>
          <Badge tone={decisionTone(tier)}>{tier.toUpperCase()}</Badge>
          {focusedGame ? <Badge tone="brand">MATCHED PROP</Badge> : null}
          <Link href={detailHref} className="rounded-full border border-sky-400/35 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-200 hover:bg-sky-500/15">
            Open full sim
          </Link>
        </div>
      </div>

      {focusedPlayer ? <PlayerFocusPanel player={focusedPlayer} game={game} /> : null}

      <div className="grid gap-3 md:grid-cols-5">
        <TeamTotalTile label="Away score" value={num(projection.distribution.avgAway)} sub={projection.matchup.away} />
        <TeamTotalTile label="Home score" value={num(projection.distribution.avgHome)} sub={projection.matchup.home} />
        <TeamTotalTile label="Box pts" value={`${num(awayPoints)} / ${num(homePoints)}`} sub="Calibrated player sum" />
        <TeamTotalTile label="Game total" value={num(projection.nbaIntel?.projectedTotal ?? awayPoints + homePoints)} sub="Projection engine" />
        <TeamTotalTile label="Confidence" value={pct(projection.nbaIntel?.confidence, 0)} sub={`${projection.nbaIntel?.playerStatProjections.length ?? 0} player rows`} />
      </div>

      <PlayerVsPlayerPanel awayRows={awayRows} homeRows={homeRows} focusPlayer={focusPlayer} />

      {players.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <PlayerBoxScoreTable title={projection.matchup.away} rows={awayRows} focusPlayer={focusPlayer} targetPoints={projection.distribution.avgAway} />
          <PlayerBoxScoreTable title={projection.matchup.home} rows={homeRows} focusPlayer={focusPlayer} targetPoints={projection.distribution.avgHome} />
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
  const focusedGameId = param(params?.gameId);
  const focusPlayer = param(params?.player);
  const sections = await buildBoardSportSections({
    selectedLeague: activeLeague,
    gamesByLeague: {},
    maxScoreboardGames: focusedGameId ? null : 6
  });
  const games = flatten(sections);
  const rows: MatchupRow[] = await Promise.all(
    games.map(async (game) => ({
      game,
      projection: withCalibratedNbaPlayers(await buildSimProjection(game))
    }))
  );
  const displayedRows = focusedGameId ? rows.filter((row) => row.game.id === focusedGameId) : rows;
  const focusedPlayerRow = displayedRows
    .flatMap((row) => row.projection.nbaIntel?.playerStatProjections.map((player) => ({ player, game: row.game })) ?? [])
    .find((item) => playerMatches(item.player, focusPlayer)) ?? null;
  const playerRows = displayedRows.reduce((total, row) => total + (row.projection.nbaIntel?.playerStatProjections.length ?? 0), 0);
  const attack = displayedRows.filter((row) => row.projection.nbaIntel?.tier === "attack").length;
  const watch = displayedRows.filter((row) => row.projection.nbaIntel?.tier === "watch").length;

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
              This page uses the same live matchup simulation stack as Sim HQ. Prop links can now open the exact game and highlight the player, then show both teams’ calibrated projected points, rebounds, assists, threes, PRA, confidence, and player-vs-player ladder.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/sim?league=NBA" className="rounded-md border border-aqua/35 bg-aqua/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-aqua">Sim HQ</Link>
            <Link href="/props?league=NBA" className="rounded-md border border-bone/[0.12] bg-panel px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-bone/75">NBA Props</Link>
            <Link href="/nba-edge" className="rounded-md border border-bone/[0.12] bg-panel px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-bone/75">NBA Edge</Link>
            {focusedGameId || focusPlayer ? <Link href="/sim/players?league=NBA" className="rounded-md border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-sky-200">Clear Focus</Link> : null}
          </div>
        </div>
      </section>

      {focusedGameId || focusPlayer ? (
        <Card className="border border-sky-400/25 bg-sky-500/[0.05] p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200/80">Prop drilldown active</div>
              <div className="mt-1 text-sm text-slate-300">
                {focusedPlayerRow
                  ? `Focused on ${focusedPlayerRow.player.playerName} in ${focusedPlayerRow.game.label}.`
                  : `Focused query loaded${focusPlayer ? ` for ${focusPlayer}` : ""}. Matching player rows will highlight when available.`}
              </div>
            </div>
            <Link href="/sim/players?league=NBA" className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">Show full slate</Link>
          </div>
        </Card>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <TeamTotalTile label="Matchups" value={String(displayedRows.length)} sub={`${activeLeague} active slate`} />
        <TeamTotalTile label="Player rows" value={String(playerRows)} sub="Projected box-score entries" />
        <TeamTotalTile label="Attack / Watch" value={`${attack} / ${watch}`} sub="NBA governor tiers" />
        <TeamTotalTile label="Runs" value="10k" sub="Per-player simulation depth" />
      </section>

      <section className="grid gap-4">
        <SectionTitle
          title="NBA player matchup board"
          description="Open a full sim for the game-level model, or use these tables to read the calibrated player box score and matchup ladder directly."
        />
        {displayedRows.length ? (
          displayedRows.map((row) => (
            <MatchupBoxScoreCard
              key={`${row.game.leagueKey}:${row.game.id}`}
              row={row}
              focusPlayer={focusPlayer}
              focusedGameId={focusedGameId}
            />
          ))
        ) : (
          <EmptyState title="No matching NBA matchup available" description="The scoreboard provider did not return an active NBA game matching this prop link." />
        )}
      </section>
    </div>
  );
}
