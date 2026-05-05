import Link from "next/link";

import { buildMlbIntelV7LiveBoard } from "@/services/simulation/mlb-intel-v7-live-board";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function edgePct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function Tile({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function RoleSummary({ title, rows }: { title: string; rows: Array<{ role: string; count: number; avgOverall: number | null }> }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</div>
      <div className="mt-2 grid gap-1.5">
        {rows.length ? rows.slice(0, 5).map((row) => (
          <div key={`${title}:${row.role}`} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2 py-1.5 text-[11px]">
            <span className="font-semibold text-slate-200">{row.role}</span>
            <span className="font-mono text-slate-400">{row.count} · {num(row.avgOverall, 1)}</span>
          </div>
        )) : <div className="text-xs text-slate-500">No rating rows yet.</div>}
      </div>
    </div>
  );
}

function statusPill(tier: string, noBet: boolean) {
  if (noBet || tier === "pass") return "border-slate-500/25 bg-slate-500/10 text-slate-300";
  if (tier === "attack") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  return "border-amber-300/25 bg-amber-300/10 text-amber-100";
}

export default async function MlbIntelV7LivePage() {
  const board = await buildMlbIntelV7LiveBoard({ limit: 30 });
  const attackCount = board.rows.filter((row) => row.calibrated.tier === "attack" && !row.calibrated.noBet).length;
  const watchCount = board.rows.filter((row) => row.calibrated.tier === "watch" && !row.calibrated.noBet).length;
  const rosterReadyCount = board.rows.filter((row) => row.roster.away.available && row.roster.home.available).length;

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">MLB Intel v7 Live Board</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Calibrated board + roster context</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Live MLB slate using v7 shrinkage, no-vig market anchoring, official-pick gating, lineup locks, and roster intelligence readiness in one view.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sim/mlb/v7" className="text-cyan-200 hover:text-cyan-100">V7 dashboard</Link>
            <Link href="/api/sim/mlb-intel-v7/live-board" className="text-cyan-200 hover:text-cyan-100">API JSON</Link>
            <Link href="/api/sim/mlb-intel-v7/ledger?action=run" className="text-cyan-200 hover:text-cyan-100">Run ledger</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Tile label="Rows" value={board.rowCount} note={`${board.gameCount} MLB games found`} />
        <Tile label="Attack" value={attackCount} note="Official pick gate passed strong" />
        <Tile label="Watch" value={watchCount} note="Qualified but not full attack" />
        <Tile label="Roster ready" value={rosterReadyCount} note="Both teams have DB context" />
        <Tile label="Warnings" value={board.warnings.length} note="Projection or roster read failures" />
      </section>

      {board.warnings.length ? (
        <section className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/[0.06] p-4 text-xs leading-5 text-amber-100">
          <div className="font-semibold uppercase tracking-[0.18em]">Warnings</div>
          <ul className="mt-2 grid gap-1">
            {board.warnings.slice(0, 8).map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-4">
        {board.rows.length ? board.rows.map((row) => {
          const leanHome = row.calibrated.homeWinPct >= row.calibrated.awayWinPct;
          const leanTeam = leanHome ? row.game.matchup.home : row.game.matchup.away;
          return (
            <article key={row.game.id} className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">{row.modelVersion}</div>
                  <h2 className="mt-1 text-xl font-semibold text-white">{row.game.label}</h2>
                  <div className="mt-1 text-xs text-slate-500">{row.game.status} · {new Date(row.game.startTime).toLocaleString()}</div>
                </div>
                <div className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusPill(row.calibrated.tier, row.calibrated.noBet)}`}>
                  {row.calibrated.noBet ? "No pick" : row.calibrated.tier}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Tile label="Lean" value={leanTeam} note={`Calibrated ${pct(Math.max(row.calibrated.homeWinPct, row.calibrated.awayWinPct))}`} />
                <Tile label="Raw home" value={pct(row.raw.homeWinPct)} note={`Raw runs ${num(row.raw.awayRuns)}-${num(row.raw.homeRuns)}`} />
                <Tile label="V7 home" value={pct(row.calibrated.homeWinPct)} note={`Shrunk ${pct(row.calibrated.shrinkHomeWinPct)}`} />
                <Tile label="Market home" value={pct(row.market.homeNoVigProbability)} note={row.market.source ?? "No market"} />
                <Tile label="Edge" value={edgePct(row.calibrated.edgeHomePct)} note={row.calibrated.pickSide ? `Pick side ${row.calibrated.pickSide}` : "Below edge gate"} />
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Lineup / lock</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <span>Starters confirmed</span><span className="text-right font-mono text-white">{row.lock.startersConfirmed ? "yes" : "no"}</span>
                    <span>Lineups confirmed</span><span className="text-right font-mono text-white">{row.lock.lineupsConfirmed ? "yes" : "no"}</span>
                    <span>Away order</span><span className="text-right font-mono text-white">{row.lock.awayBattingOrderCount}</span>
                    <span>Home order</span><span className="text-right font-mono text-white">{row.lock.homeBattingOrderCount}</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">V7 reasons</div>
                  <div className="mt-2 grid gap-1 text-xs leading-5 text-slate-400">
                    {row.calibrated.reasons.slice(0, 4).map((reason) => <div key={reason}>{reason}</div>)}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                <RoleSummary title={`${row.game.matchup.away} hitters`} rows={row.roster.away.hitterRoles} />
                <RoleSummary title={`${row.game.matchup.home} hitters`} rows={row.roster.home.hitterRoles} />
                <RoleSummary title={`${row.game.matchup.away} pitchers`} rows={row.roster.away.pitcherRoles} />
                <RoleSummary title={`${row.game.matchup.home} pitchers`} rows={row.roster.home.pitcherRoles} />
              </div>
            </article>
          );
        }) : (
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-6 text-sm text-slate-400">No active MLB rows available.</div>
        )}
      </section>
    </main>
  );
}
