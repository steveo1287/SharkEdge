import Link from "next/link";

import {
  SimDecisionBadge,
  SimMetricTile,
  SimSignalCard,
  SimStatusBadge,
  SimTableShell,
  SimWorkspaceHeader
} from "@/components/sim/sim-ui";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { calibrateNbaPlayerBoxScore } from "@/services/simulation/nba-box-score-calibration";
import { getNbaFullStatProjectionView } from "@/services/simulation/nba-full-stat-projection-view";
import { buildGuardedSimProjection as buildSimProjection } from "@/services/simulation/guarded-sim-projection-engine";
import { getSimRunDepth } from "@/services/simulation/sim-run-depth";
import type { BoardSportSectionView, LeagueKey } from "@/lib/types/domain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = { league?: string | string[]; gameId?: string | string[]; player?: string | string[] };
type PageProps = { searchParams?: Promise<SearchParams> };
type SimGame = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string };
type Projection = Awaited<ReturnType<typeof buildSimProjection>>;
type PlayerProjection = NonNullable<Projection["nbaIntel"]>["playerStatProjections"][number];
type FullStatView = Awaited<ReturnType<typeof getNbaFullStatProjectionView>>;
type FullStatPlayer = FullStatView["players"][number];
type MatchupRow = { game: SimGame; projection: Projection };

const PLAYER_MATCHUP_LEAGUES: LeagueKey[] = ["NBA"];

function param(value: string | string[] | undefined) { const raw = Array.isArray(value) ? value[0] : value; return raw ? decodeURIComponent(raw).trim() : null; }
function selectedLeague(value: string | string[] | undefined): LeagueKey { const raw = Array.isArray(value) ? value[0] : value; const upper = String(raw ?? "NBA").toUpperCase(); return PLAYER_MATCHUP_LEAGUES.includes(upper as LeagueKey) ? (upper as LeagueKey) : "NBA"; }
function normalizeName(value: string | null | undefined) { return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function playerMatches(row: PlayerProjection, focusPlayer: string | null) { if (!focusPlayer) return false; const rowName = normalizeName(row.playerName); const focus = normalizeName(focusPlayer); return Boolean(focus && (rowName === focus || rowName.includes(focus) || focus.includes(rowName))); }
function flatten(sections: BoardSportSectionView[]): SimGame[] { return sections.flatMap((section) => section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel }))); }
function formatTime(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return "TBD"; return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date); }
function pct(value: number | null | undefined, digits = 1) { if (typeof value !== "number" || !Number.isFinite(value)) return "--"; return `${(value * 100).toFixed(digits)}%`; }
function num(value: number | null | undefined, digits = 1) { if (typeof value !== "number" || !Number.isFinite(value)) return "--"; return value.toFixed(digits); }
function plus(value: number, digits = 1) { return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`; }
function playerRank(row: PlayerProjection) { return row.projectedMinutes * 0.65 + row.projectedPoints * 0.55 + row.projectedAssists * 0.35 + row.projectedRebounds * 0.24 + row.confidence * 12; }
function sum(rows: PlayerProjection[], selector: (row: PlayerProjection) => number) { return rows.reduce((total, row) => total + selector(row), 0); }
function teamRows(rows: PlayerProjection[], side: "away" | "home", focusPlayer: string | null = null) { return rows.filter((row) => row.teamSide === side).sort((left, right) => { const leftFocus = playerMatches(left, focusPlayer) ? 1 : 0; const rightFocus = playerMatches(right, focusPlayer) ? 1 : 0; if (leftFocus !== rightFocus) return rightFocus - leftFocus; return playerRank(right) - playerRank(left); }); }

function withCalibratedNbaPlayers(projection: Projection): Projection {
  const players = projection.nbaIntel?.playerStatProjections ?? [];
  if (!projection.nbaIntel || !players.length) return projection;
  return { ...projection, nbaIntel: { ...projection.nbaIntel, playerStatProjections: calibrateNbaPlayerBoxScore(players, { awayPoints: projection.distribution.avgAway, homePoints: projection.distribution.avgHome }) } };
}

function findFullStatPlayer(row: PlayerProjection, fullStatPlayers: FullStatPlayer[]) {
  const rowName = normalizeName(row.playerName);
  const rowTeam = normalizeName(row.teamName);
  return fullStatPlayers.find((player) => {
    const playerName = normalizeName(player.playerName);
    const teamName = normalizeName(player.teamName);
    const nameMatch = rowName === playerName || rowName.includes(playerName) || playerName.includes(rowName);
    const teamMatch = !rowTeam || !teamName || rowTeam === teamName || rowTeam.includes(teamName) || teamName.includes(rowTeam);
    return nameMatch && teamMatch;
  }) ?? null;
}

function statMean(player: FullStatPlayer | null, statKey: string, fallback: number | null | undefined) {
  const stat = player?.stats.find((candidate) => candidate.statKey === statKey);
  return stat?.meanValue ?? fallback ?? null;
}

function statConfidence(player: FullStatPlayer | null, statKey: string, fallback: number | null | undefined) {
  const stat = player?.stats.find((candidate) => candidate.statKey === statKey);
  return stat?.confidence ?? player?.minutes?.confidence ?? fallback ?? null;
}

function statWarnings(player: FullStatPlayer | null) {
  return [...new Set([...(player?.lineupTruth?.blockers ?? []), ...(player?.minutes?.blockers ?? []), ...((player?.stats ?? []).flatMap((stat) => stat.blockers))])];
}

function statSoftWarnings(player: FullStatPlayer | null) {
  return [...new Set([...(player?.lineupTruth?.warnings ?? []), ...(player?.minutes?.warnings ?? []), ...((player?.stats ?? []).flatMap((stat) => stat.warnings))])];
}

function v2Health(players: FullStatPlayer[]) {
  const blocked = players.filter((player) => statWarnings(player).length > 0 || player.lineupTruth?.status === "RED").length;
  const warning = players.filter((player) => !statWarnings(player).length && (statSoftWarnings(player).length > 0 || player.lineupTruth?.status === "YELLOW")).length;
  const status = blocked > 0 ? "RED" : warning > 0 ? "YELLOW" : players.length > 0 ? "GREEN" : "RED";
  const topReason = players.map((player) => statWarnings(player)[0] ?? statSoftWarnings(player)[0]).find(Boolean) ?? "No V2 projection quality issues detected.";
  return { blocked, warning, status, topReason };
}

function MinutesRiskMini({ fullStat }: { fullStat: FullStatPlayer | null }) {
  const minutes = fullStat?.minutes;
  if (!minutes) return null;
  const blocked = minutes.blockers.length || fullStat?.lineupTruth?.status !== "GREEN" || fullStat?.lineupTruth?.injuryReportFresh !== true;
  return (
    <div className={blocked ? "mt-1 text-[10px] text-red-200/75" : "mt-1 text-[10px] text-slate-500"}>
      {minutes.role ?? "role"} · range {num(minutes.floorMinutes)}-{num(minutes.ceilingMinutes)} · min conf {pct(minutes.confidence, 0)} · stable {pct(minutes.rotationStability, 0)}
    </div>
  );
}

function PlayerFocusPanel({ player, game, fullStat }: { player: PlayerProjection; game: SimGame; fullStat: FullStatPlayer | null }) {
  const points = statMean(fullStat, "player_points", player.projectedPoints);
  const rebounds = statMean(fullStat, "player_rebounds", player.projectedRebounds);
  const assists = statMean(fullStat, "player_assists", player.projectedAssists);
  const threes = statMean(fullStat, "player_threes", player.projectedThrees);
  const pra = statMean(fullStat, "player_pra", (points ?? 0) + (rebounds ?? 0) + (assists ?? 0));
  const bestProp = player.propHitProbabilities.points ?? player.propHitProbabilities.assists ?? player.propHitProbabilities.rebounds ?? player.propHitProbabilities.threes ?? null;
  const blockers = statWarnings(fullStat);
  return (
    <SimSignalCard className="border-sky-400/30 bg-sky-500/[0.06]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-200/80">Focused player from prop board</div>
          <div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-2xl font-semibold text-white">{player.playerName}</span>{fullStat ? <Badge tone="brand">FULL-STAT V2</Badge> : null}{blockers.length ? <Badge tone="danger">BLOCKED</Badge> : null}</div>
          <div className="mt-1 text-sm text-slate-400">{player.teamName} · {game.label} · {formatTime(game.startTime)}</div>
        </div>
        <div className="grid gap-2 sm:grid-cols-5 lg:min-w-[620px]">
          <SimMetricTile label="Minutes" value={num(fullStat?.minutes?.projectedMinutes ?? fullStat?.projectedMinutes ?? player.projectedMinutes)} />
          <SimMetricTile label="Points" value={num(points)} emphasis="strong" />
          <SimMetricTile label="Reb" value={num(rebounds)} />
          <SimMetricTile label="Ast" value={num(assists)} />
          <SimMetricTile label="PRA" value={num(pra)} />
        </div>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300"><div className="mb-1 text-slate-100">Full-stat V2</div><div>PTS {num(points)} · REB {num(rebounds)} · AST {num(assists)}</div><div>3PM {num(threes)} · PRA {num(pra)}</div><div className="mt-1 text-slate-500">Min range {num(fullStat?.minutes?.floorMinutes)}-{num(fullStat?.minutes?.ceilingMinutes)}</div></div>
        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300"><div className="mb-1 text-slate-100">Best prop read</div>{bestProp ? <><div>{bestProp.recommendedSide} line {num(bestProp.line)}</div><div>O {pct(bestProp.overProbability)} / U {pct(bestProp.underProbability)}</div><div>Edge to line {plus(bestProp.edgeToLine)}</div></> : <div>No matched market line on this player yet.</div>}</div>
        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300"><div className="mb-1 text-slate-100">Minutes / lineup risk</div><div>Lineup {fullStat?.lineupTruth?.status ?? "unknown"} · fresh {fullStat?.lineupTruth?.injuryReportFresh === true ? "yes" : "no"}</div><div className="mt-1 text-slate-500">{blockers[0] ?? player.whyNotLikely[0] ?? "No major downside flags from current context stack."}</div></div>
      </div>
    </SimSignalCard>
  );
}

function PlayerBoxScoreTable({ title, rows, focusPlayer, targetPoints, fullStatPlayers }: { title: string; rows: PlayerProjection[]; focusPlayer: string | null; targetPoints: number; fullStatPlayers: FullStatPlayer[] }) {
  const totals = { minutes: sum(rows, (row) => findFullStatPlayer(row, fullStatPlayers)?.minutes?.projectedMinutes ?? row.projectedMinutes), points: sum(rows, (row) => statMean(findFullStatPlayer(row, fullStatPlayers), "player_points", row.projectedPoints) ?? 0), rebounds: sum(rows, (row) => statMean(findFullStatPlayer(row, fullStatPlayers), "player_rebounds", row.projectedRebounds) ?? 0), assists: sum(rows, (row) => statMean(findFullStatPlayer(row, fullStatPlayers), "player_assists", row.projectedAssists) ?? 0), threes: sum(rows, (row) => statMean(findFullStatPlayer(row, fullStatPlayers), "player_threes", row.projectedThrees) ?? 0) };
  return (
    <SimTableShell title={title} description="Full-stat V2 overlaid on calibrated player box score" right={<div className="text-right font-mono text-sm text-sky-200">{num(totals.points)} / {num(targetPoints)} pts</div>}>
      <table className="min-w-full text-left text-xs">
        <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400"><tr><th className="px-3 py-2">Player</th><th className="px-3 py-2 text-right">Min</th><th className="px-3 py-2 text-right">Pts</th><th className="px-3 py-2 text-right">Reb</th><th className="px-3 py-2 text-right">Ast</th><th className="px-3 py-2 text-right">3PM</th><th className="px-3 py-2 text-right">STL</th><th className="px-3 py-2 text-right">BLK</th><th className="px-3 py-2 text-right">PRA</th><th className="px-3 py-2 text-right">Conf</th></tr></thead>
        <tbody>
          {rows.map((row) => { const fullStat = findFullStatPlayer(row, fullStatPlayers); const points = statMean(fullStat, "player_points", row.projectedPoints); const rebounds = statMean(fullStat, "player_rebounds", row.projectedRebounds); const assists = statMean(fullStat, "player_assists", row.projectedAssists); const threes = statMean(fullStat, "player_threes", row.projectedThrees); const steals = statMean(fullStat, "player_steals", null); const blocks = statMean(fullStat, "player_blocks", null); const pra = statMean(fullStat, "player_pra", (points ?? 0) + (rebounds ?? 0) + (assists ?? 0)); const focused = playerMatches(row, focusPlayer); const blockers = statWarnings(fullStat); return (
            <tr key={`${row.teamName}:${row.playerName}`} className={focused ? "border-b border-sky-400/20 bg-sky-500/[0.08]" : blockers.length ? "border-b border-red-400/15 bg-red-500/[0.035]" : "border-b border-white/5 last:border-none"}>
              <td className="px-3 py-2"><div className="flex items-center gap-2"><span className="font-semibold text-white">{row.playerName}</span>{focused ? <Badge tone="brand">FOCUS</Badge> : null}{fullStat ? <Badge tone="brand">V2</Badge> : null}{blockers.length ? <Badge tone="danger">BLOCK</Badge> : null}</div><div className="text-[10px] text-slate-500">{row.status} · {row.source}</div><MinutesRiskMini fullStat={fullStat} /></td>
              <td className="px-3 py-2 text-right font-mono text-slate-200">{num(fullStat?.minutes?.projectedMinutes ?? fullStat?.projectedMinutes ?? row.projectedMinutes)}</td><td className="px-3 py-2 text-right font-mono text-sky-200">{num(points)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{num(rebounds)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{num(assists)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{num(threes)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{num(steals)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{num(blocks)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{num(pra)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{pct(statConfidence(fullStat, "player_points", row.confidence), 0)}</td>
            </tr>
          ); })}
          <tr className="bg-white/[0.025] font-semibold text-white"><td className="px-3 py-2">Team total</td><td className="px-3 py-2 text-right font-mono">{num(totals.minutes)}</td><td className="px-3 py-2 text-right font-mono">{num(totals.points)}</td><td className="px-3 py-2 text-right font-mono">{num(totals.rebounds)}</td><td className="px-3 py-2 text-right font-mono">{num(totals.assists)}</td><td className="px-3 py-2 text-right font-mono">{num(totals.threes)}</td><td className="px-3 py-2 text-right font-mono">--</td><td className="px-3 py-2 text-right font-mono">--</td><td className="px-3 py-2 text-right font-mono">{num(totals.points + totals.rebounds + totals.assists)}</td><td className="px-3 py-2 text-right font-mono">--</td></tr>
        </tbody>
      </table>
    </SimTableShell>
  );
}

function PlayerVsPlayerPanel({ awayRows, homeRows, focusPlayer }: { awayRows: PlayerProjection[]; homeRows: PlayerProjection[]; focusPlayer: string | null }) {
  const pairs = Array.from({ length: Math.max(awayRows.length, homeRows.length) }, (_, index) => ({ away: awayRows[index], home: homeRows[index] })).filter((pair) => pair.away || pair.home).slice(0, 8);
  if (!pairs.length) return null;
  return (
    <SimSignalCard>
      <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold text-white">Player matchup ladder</div><div className="mt-1 text-xs text-slate-500">Players paired by projected role/minute value, not by position labels.</div></div><Badge tone="brand">PVP</Badge></div>
      <div className="mt-4 grid gap-2">
        {pairs.map((pair, index) => { const awayPra = pair.away ? pair.away.projectedPoints + pair.away.projectedRebounds + pair.away.projectedAssists : 0; const homePra = pair.home ? pair.home.projectedPoints + pair.home.projectedRebounds + pair.home.projectedAssists : 0; const focused = Boolean((pair.away && playerMatches(pair.away, focusPlayer)) || (pair.home && playerMatches(pair.home, focusPlayer))); return (
          <div key={`pair-${index}`} className={focused ? "grid gap-2 rounded-xl border border-sky-400/25 bg-sky-500/[0.07] p-3 text-xs md:grid-cols-[1fr_auto_1fr] md:items-center" : "grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs md:grid-cols-[1fr_auto_1fr] md:items-center"}>
            <div><div className="font-semibold text-white">{pair.away?.playerName ?? "—"}</div><div className="mt-1 text-slate-400">{pair.away ? `${num(pair.away.projectedPoints)} pts · ${num(awayPra)} PRA · ${num(pair.away.projectedMinutes)} min` : "No player"}</div></div><div className="text-center font-mono text-[11px] text-slate-500">#{index + 1}<br />PRA Δ {plus(homePra - awayPra)}</div><div className="text-right md:text-left"><div className="font-semibold text-white">{pair.home?.playerName ?? "—"}</div><div className="mt-1 text-slate-400">{pair.home ? `${num(pair.home.projectedPoints)} pts · ${num(homePra)} PRA · ${num(pair.home.projectedMinutes)} min` : "No player"}</div></div>
          </div>
        ); })}
      </div>
    </SimSignalCard>
  );
}

function MatchupBoxScoreCard({ row, focusPlayer, focusedGameId, fullStatPlayers }: { row: MatchupRow; focusPlayer: string | null; focusedGameId: string | null; fullStatPlayers: FullStatPlayer[] }) {
  const { game, projection } = row;
  const players = projection.nbaIntel?.playerStatProjections ?? [];
  const awayRows = teamRows(players, "away", focusPlayer);
  const homeRows = teamRows(players, "home", focusPlayer);
  const awayPoints = sum(awayRows, (player) => statMean(findFullStatPlayer(player, fullStatPlayers), "player_points", player.projectedPoints) ?? 0);
  const homePoints = sum(homeRows, (player) => statMean(findFullStatPlayer(player, fullStatPlayers), "player_points", player.projectedPoints) ?? 0);
  const tier = projection.nbaIntel?.tier ?? "pass";
  const focusedPlayer = players.find((player) => playerMatches(player, focusPlayer)) ?? null;
  const focusedFullStat = focusedPlayer ? findFullStatPlayer(focusedPlayer, fullStatPlayers) : null;
  const focusedGame = Boolean(focusedGameId && game.id === focusedGameId);
  return (
    <section className={focusedGame ? "grid gap-4 rounded-3xl border border-sky-400/30 bg-sky-500/[0.045] p-4" : "grid gap-4 rounded-3xl border border-white/10 bg-white/[0.025] p-4"}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{game.leagueKey} · {formatTime(game.startTime)}</div><h2 className="mt-2 font-display text-2xl font-semibold text-white">{projection.matchup.away} @ {projection.matchup.home}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{projection.read}</p></div><div className="flex flex-wrap gap-2 lg:justify-end"><SimStatusBadge status={game.status} /><SimDecisionBadge tier={tier} />{focusedGame ? <Badge tone="brand">MATCHED PROP</Badge> : null}<Badge tone="brand">FULL-STAT V2</Badge><Link href={`/sim/${game.leagueKey.toLowerCase()}/${encodeURIComponent(game.id)}`} className="rounded-full border border-sky-400/35 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-200 hover:bg-sky-500/15">Open full sim</Link></div></div>
      {focusedPlayer ? <PlayerFocusPanel player={focusedPlayer} game={game} fullStat={focusedFullStat} /> : null}
      <div className="grid gap-3 md:grid-cols-5"><SimMetricTile label="Away score" value={num(projection.distribution.avgAway)} sub={projection.matchup.away} /><SimMetricTile label="Home score" value={num(projection.distribution.avgHome)} sub={projection.matchup.home} /><SimMetricTile label="V2 box pts" value={`${num(awayPoints)} / ${num(homePoints)}`} sub="Full-stat player sum" emphasis="strong" /><SimMetricTile label="Game total" value={num(projection.nbaIntel?.projectedTotal ?? awayPoints + homePoints)} sub="Projection engine" /><SimMetricTile label="V2 rows" value={String(fullStatPlayers.length)} sub="Stored full-stat projections" /></div>
      <PlayerVsPlayerPanel awayRows={awayRows} homeRows={homeRows} focusPlayer={focusPlayer} />
      {players.length ? <div className="grid gap-4 xl:grid-cols-2"><PlayerBoxScoreTable title={projection.matchup.away} rows={awayRows} focusPlayer={focusPlayer} targetPoints={projection.distribution.avgAway} fullStatPlayers={fullStatPlayers} /><PlayerBoxScoreTable title={projection.matchup.home} rows={homeRows} focusPlayer={focusPlayer} targetPoints={projection.distribution.avgHome} fullStatPlayers={fullStatPlayers} /></div> : <SimSignalCard className="text-sm leading-6 text-slate-400">Player projection rows were not returned for this matchup. The game-level sim is available, but the roster box score needs NBA player profiles from the projection service.</SimSignalCard>}
    </section>
  );
}

export default async function SimPlayersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeLeague = selectedLeague(params?.league);
  const focusedGameId = param(params?.gameId);
  const focusPlayer = param(params?.player);
  const sections = await buildBoardSportSections({ selectedLeague: activeLeague, gamesByLeague: {}, maxScoreboardGames: focusedGameId ? null : 6 });
  const games = flatten(sections);
  const boardRuns = getSimRunDepth("board");
  const [fullStatView, rows] = await Promise.all([
    getNbaFullStatProjectionView({ includeModelOnly: true, take: 1500 }),
    Promise.all(games.map(async (game) => ({ game, projection: withCalibratedNbaPlayers(await buildSimProjection({ ...game, simulationRuns: boardRuns })) })))
  ]);
  const displayedRows = focusedGameId ? rows.filter((row) => row.game.id === focusedGameId) : rows;
  const focusedPlayerRow = displayedRows.flatMap((row) => row.projection.nbaIntel?.playerStatProjections.map((player) => ({ player, game: row.game })) ?? []).find((item) => playerMatches(item.player, focusPlayer)) ?? null;
  const playerRows = displayedRows.reduce((total, row) => total + (row.projection.nbaIntel?.playerStatProjections.length ?? 0), 0);
  const attack = displayedRows.filter((row) => row.projection.nbaIntel?.tier === "attack").length;
  const watch = displayedRows.filter((row) => row.projection.nbaIntel?.tier === "watch").length;
  const health = v2Health(fullStatView.players);

  return (
    <div className="space-y-6">
      <SimWorkspaceHeader eyebrow="Player Matchups" title="Projected box scores for every player in the matchup." description="This page now overlays the full-stat V2 projection layer: PTS, REB, AST, 3PM, STL, BLK, PRA, minutes range, lineup truth, and minutes risk. Older live sim rows remain as fallback when a stored V2 row is missing." actions={[{ href: "/sim/nba", label: "NBA Sim", tone: "primary" }, { href: "/props?league=NBA", label: "NBA Props" }, { href: "/nba-edge", label: "NBA Edge" }, { href: "/api/simulation/nba/full-stat-health", label: "V2 Health API" }, ...(focusedGameId || focusPlayer ? [{ href: "/sim/players?league=NBA", label: "Clear Focus" }] : [])]} />
      {focusedGameId || focusPlayer ? <SimSignalCard className="border-sky-400/25 bg-sky-500/[0.05]"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200/80">Prop drilldown active</div><div className="mt-1 text-sm text-slate-300">{focusedPlayerRow ? `Focused on ${focusedPlayerRow.player.playerName} in ${focusedPlayerRow.game.label}.` : `Focused query loaded${focusPlayer ? ` for ${focusPlayer}` : ""}. Matching player rows will highlight when available.`}</div></div><Link href="/sim/players?league=NBA" className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">Show full slate</Link></div></SimSignalCard> : null}
      <section className="grid gap-3 md:grid-cols-6"><SimMetricTile label="Matchups" value={String(displayedRows.length)} sub={`${activeLeague} active slate`} /><SimMetricTile label="Player rows" value={String(playerRows)} sub="Live sim box-score entries" /><SimMetricTile label="V2 rows" value={String(fullStatView.playerCount)} sub="Full-stat projection players" emphasis="strong" /><SimMetricTile label="V2 health" value={health.status} sub={`${health.blocked} blocked · ${health.warning} warning`} emphasis={health.status === "GREEN" ? "strong" : undefined} /><SimMetricTile label="Attack / Watch" value={`${attack} / ${watch}`} sub="NBA governor tiers" /><SimMetricTile label="Runs" value={boardRuns >= 1000 ? `${Math.round(boardRuns / 1000)}k` : String(boardRuns)} sub="Per-player simulation depth" /></section>
      {health.status !== "GREEN" ? <SimSignalCard className="border-red-400/25 bg-red-500/[0.045]"><div className="text-sm font-semibold text-white">V2 projection health is {health.status}</div><div className="mt-1 text-xs text-slate-400">{health.topReason}</div></SimSignalCard> : null}
      <section className="grid gap-4"><SectionTitle title="NBA player matchup board" description="Tables now prefer full-stat V2 rows where available and expose minutes range, lineup truth, and risk blockers inline." />{displayedRows.length ? displayedRows.map((row) => <MatchupBoxScoreCard key={`${row.game.leagueKey}:${row.game.id}`} row={row} focusPlayer={focusPlayer} focusedGameId={focusedGameId} fullStatPlayers={fullStatView.players} />) : <EmptyState title="No matching NBA matchup available" description="The scoreboard provider did not return an active NBA game matching this prop link." />}</section>
    </div>
  );
}
