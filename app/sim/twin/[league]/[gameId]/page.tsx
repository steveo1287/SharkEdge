import Link from "next/link";

import { getSimTwin } from "@/services/sim/sim-twin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ league: string; gameId: string }>;
};

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function pctRaw(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function trustClass(grade: string) {
  if (grade === "A") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (grade === "B") return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  if (grade === "C") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (grade === "D") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-red-400/25 bg-red-400/10 text-red-200";
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

export default async function SimTwinDetailPage({ params }: PageProps) {
  const resolved = await params;
  const result = await getSimTwin({ league: resolved.league, gameId: decodeURIComponent(resolved.gameId) });

  if (!result.ok || !result.twin) {
    return (
      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-[1.75rem] border border-red-400/20 bg-slate-950/80 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-red-200">Sim Twin</div>
          <h1 className="mt-2 font-display text-3xl font-semibold text-white">Game twin not found.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{result.error}</p>
          <Link href="/sim/twin" className="mt-4 inline-block text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">Back to twins</Link>
        </section>
      </main>
    );
  }

  const twin = result.twin;

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">{twin.league} Sim Twin</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">{twin.eventLabel}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{twin.base.read}</p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sim/twin" className="text-cyan-200 hover:text-cyan-100">All twins</Link>
            <Link href="/sim/accuracy" className="text-cyan-200 hover:text-cyan-100">Accuracy</Link>
            <Link href="/sim/edge-lab" className="text-cyan-200 hover:text-cyan-100">Edge Lab</Link>
            <Link href={`/api/sim/twin?league=${encodeURIComponent(twin.league)}&gameId=${encodeURIComponent(twin.gameId)}`} className="text-cyan-200 hover:text-cyan-100">JSON</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Tile label="Home win" value={pct(twin.base.homeWinPct)} note={twin.matchup.home} />
        <Tile label="Away win" value={pct(twin.base.awayWinPct)} note={twin.matchup.away} />
        <Tile label="Spread" value={num(twin.base.projectedSpread)} note="Projected home margin" />
        <Tile label="Total" value={num(twin.base.projectedTotal)} note="Projected game total" />
        <Tile label="Market edge" value={pctRaw(twin.market.edgePct)} note={twin.market.verdict} />
        <div className={`rounded-2xl border p-4 ${trustClass(twin.trust.grade)}`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">Trust</div>
          <div className="mt-2 font-mono text-2xl font-bold">{twin.trust.grade}</div>
          <div className="mt-2 text-xs leading-5 opacity-80">{twin.trust.sampleSize} settled rows</div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Market comparison</div>
          <div className="mt-4 grid gap-2 text-sm text-slate-300">
            <div className="flex justify-between gap-3"><span>No-vig home</span><span className="font-mono text-white">{pct(twin.market.noVigHomePct)}</span></div>
            <div className="flex justify-between gap-3"><span>No-vig away</span><span className="font-mono text-white">{pct(twin.market.noVigAwayPct)}</span></div>
            <div className="flex justify-between gap-3"><span>Market spread</span><span className="font-mono text-white">{num(twin.market.spread)}</span></div>
            <div className="flex justify-between gap-3"><span>Market total</span><span className="font-mono text-white">{num(twin.market.total)}</span></div>
            <div className="flex justify-between gap-3"><span>Model edge</span><span className="font-mono text-white">{pctRaw(twin.market.edgePct)}</span></div>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Uncertainty range</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Tile label="Home score" value={`${num(twin.base.scoreRange.homeP25)}-${num(twin.base.scoreRange.homeP75)}`} note="P25 to P75" />
            <Tile label="Away score" value={`${num(twin.base.scoreRange.awayP25)}-${num(twin.base.scoreRange.awayP75)}`} note="P25 to P75" />
            <Tile label="Total range" value={`${num(twin.base.scoreRange.totalP25)}-${num(twin.base.scoreRange.totalP75)}`} note="P25 to P75" />
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Scenario deltas</div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
              <tr>
                <th className="px-3 py-2">Scenario</th>
                <th className="px-3 py-2 text-right">Home win</th>
                <th className="px-3 py-2 text-right">Delta</th>
                <th className="px-3 py-2 text-right">Spread</th>
                <th className="px-3 py-2 text-right">Delta</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Delta</th>
              </tr>
            </thead>
            <tbody>
              {twin.scenarios.map((scenario) => (
                <tr key={scenario.id} className="border-b border-white/5 last:border-none">
                  <td className="px-3 py-3"><div className="font-semibold text-white">{scenario.label}</div><div className="mt-1 text-[10px] text-slate-500">{scenario.description}</div></td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{pct(scenario.adjustedHomeWinPct)}</td>
                  <td className="px-3 py-3 text-right font-mono text-cyan-200">{pctRaw(scenario.deltaHomePct * 100)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{num(scenario.adjustedSpread)}</td>
                  <td className="px-3 py-3 text-right font-mono text-cyan-200">{num(scenario.deltaSpread)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{num(scenario.adjustedTotal)}</td>
                  <td className="px-3 py-3 text-right font-mono text-cyan-200">{num(scenario.deltaTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Warnings</div>
        <ul className="mt-3 grid gap-2 text-xs leading-5 text-slate-400">
          {twin.warnings.length ? twin.warnings.slice(0, 10).map((warning) => <li key={warning}>• {warning}</li>) : <li>No warnings.</li>}
        </ul>
      </section>
    </main>
  );
}
