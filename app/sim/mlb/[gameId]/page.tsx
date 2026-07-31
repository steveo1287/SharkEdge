import { notFound } from "next/navigation";

import { MlbFranchiseImpactPlayers } from "@/components/sim/mlb-franchise-impact-players";
import { MlbPlayerRatingsTendencies } from "@/components/sim/mlb-player-ratings-tendencies";
import { MlbFranchiseLineScore } from "@/components/sim/mlb-franchise-line-score";
import { FranchiseEmptyState, FranchiseStat } from "@/components/sim/mlb-franchise-primitives";
import { MlbFranchiseTabs } from "@/components/sim/mlb-franchise-tabs";
import { SimDecisionBadge, SimSignalCard, SimWorkspaceHeader } from "@/components/sim/sim-ui";
import { getMlbFranchiseGameCenter } from "@/services/simulation/mlb-franchise-game-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ gameId: string }> };

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
}

function pickLabel(game: NonNullable<Awaited<ReturnType<typeof getMlbFranchiseGameCenter>>>) {
  const home = game.projection.distribution.homeWinPct;
  const away = game.projection.distribution.awayWinPct;
  return home >= away ? game.teams.home.name : game.teams.away.name;
}

function marketLean(game: NonNullable<Awaited<ReturnType<typeof getMlbFranchiseGameCenter>>>) {
  const signal = game.edge?.signal;
  if (signal?.market) return String(signal.market).replace(/_/g, " ").toUpperCase();
  const total = game.edge?.edges?.totalRuns;
  if (typeof total === "number" && Number.isFinite(total)) return total >= 0 ? "OVER" : "UNDER";
  return "No matched line";
}

export default async function MlbGameSummaryPage({ params }: PageProps) {
  const { gameId } = await params;
  const game = await getMlbFranchiseGameCenter(decodeURIComponent(gameId));
  if (!game) notFound();

  const governor = game.projection.mlbIntel?.governor;
  const why = governor?.reasons?.[0] ?? game.projection.read;

  return (
    <div className="space-y-5">
      <SimWorkspaceHeader
        eyebrow="MLB Game Center"
        title={`${game.teams.away.name} @ ${game.teams.home.name}`}
        description={`${formatTime(game.game.startTime)} - ${game.cacheLabel}`}
        actions={[{ href: "/sim/mlb", label: "MLB Board", tone: "primary" }, { href: "/sim", label: "Sim Hub" }]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <SimDecisionBadge tier={governor?.tier ?? "pass"} label={governor?.tier === "attack" ? "Best" : governor?.tier === "watch" ? "Watch" : governor?.tier === "thin" ? "Lean" : "Pass"} />
          {governor?.noBet ? <span className="rounded-sm border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-300">No bet</span> : null}
          {game.stale ? <span className="rounded-sm border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-300">Stale snapshot</span> : null}
        </div>
      </SimWorkspaceHeader>

      <MlbFranchiseTabs gameId={game.gameId} active="summary" />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <FranchiseStat label="Pick" value={pickLabel(game)} sub={`${pct(Math.max(game.projection.distribution.homeWinPct, game.projection.distribution.awayWinPct))} win chance`} />
        <FranchiseStat label="Projected Score" value={`${num(game.teams.away.projectedRuns)}-${num(game.teams.home.projectedRuns)}`} sub="away / home runs" />
        <FranchiseStat label="Projected Total" value={num(game.projection.mlbIntel?.projectedTotal ?? ((game.teams.away.projectedRuns ?? 0) + (game.teams.home.projectedRuns ?? 0)))} sub="full game" />
        <FranchiseStat label="Market Lean" value={marketLean(game)} sub={game.edge?.market?.sportsbook ?? "line match pending"} />
        <FranchiseStat label="Confidence" value={pct(governor?.confidence, 0)} sub={governor?.noBet ? "blocked" : "active read"} />
      </section>

      <SimSignalCard>
        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr_1fr] lg:items-center">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Away Win</div>
            <div className="mt-1 font-mono text-4xl font-bold text-cyan-300">{pct(game.projection.distribution.awayWinPct)}</div>
            <div className="mt-1 text-sm text-slate-400">{game.teams.away.name}</div>
          </div>
          <div>
            <div className="mb-2 flex justify-between text-[10px] uppercase tracking-[0.16em] text-slate-600"><span>Away</span><span>Home</span></div>
            <div className="flex h-4 overflow-hidden rounded-full bg-slate-800">
              <div className="bg-cyan-400" style={{ width: `${game.projection.distribution.awayWinPct * 100}%` }} />
              <div className="bg-violet-400" style={{ width: `${game.projection.distribution.homeWinPct * 100}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <FranchiseStat label="Away Runs" value={num(game.teams.away.projectedRuns)} />
              <FranchiseStat label="Home Runs" value={num(game.teams.home.projectedRuns)} />
            </div>
          </div>
          <div className="text-right lg:text-left">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Home Win</div>
            <div className="mt-1 font-mono text-4xl font-bold text-violet-300">{pct(game.projection.distribution.homeWinPct)}</div>
            <div className="mt-1 text-sm text-slate-400">{game.teams.home.name}</div>
          </div>
        </div>
      </SimSignalCard>

      <MlbFranchiseLineScore away={game.lineScore.away} home={game.lineScore.home} />
      <MlbPlayerRatingsTendencies game={game} />
      <MlbFranchiseImpactPlayers players={game.impactPlayers} />

      <section className="grid gap-4 lg:grid-cols-2">
        <SimSignalCard>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Starting Pitchers</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[game.teams.away, game.teams.home].map((team) => team.starter ? (
              <div key={team.side} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{team.name}</div>
                <div className="mt-2 font-semibold text-white">{team.starter.name}</div>
                <div className="mt-2 text-xs text-slate-400">{num(team.starter.innings)} IP - {num(team.starter.strikeouts)} K - {num(team.starter.earnedRuns)} ER</div>
              </div>
            ) : <FranchiseEmptyState key={team.side} title={`${team.name} starter TBD`} description="Probable starter is not tracked yet for this cached game." />)}
          </div>
        </SimSignalCard>
        <SimSignalCard>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Why</div>
          <p className="mt-3 text-sm leading-6 text-slate-300">{why}</p>
          {game.warnings.length ? (
            <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3 text-xs leading-5 text-amber-200/80">
              {game.warnings[0]}
            </div>
          ) : null}
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">Advanced details</summary>
            <div className="mt-3 grid gap-2 text-xs text-slate-500">
              {(governor?.reasons ?? []).slice(1, 5).map((reason) => <div key={reason} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">{reason}</div>)}
            </div>
          </details>
        </SimSignalCard>
      </section>
    </div>
  );
}
