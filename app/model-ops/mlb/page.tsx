import { getMlbDataQualityReport } from "@/services/ops/mlb-data-quality";

export const dynamic = "force-dynamic";

function pct(value: number | null | undefined) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—";
}

function cls(status: string) {
  if (status === "GREEN") return "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300";
  if (status === "YELLOW") return "border-yellow-500/20 bg-yellow-500/[0.06] text-yellow-300";
  if (status === "RED") return "border-red-500/20 bg-red-500/[0.06] text-red-300";
  return "border-bone/[0.08] bg-ink/40 text-bone/50";
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-bone/[0.08] bg-ink/50 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-bone/45">{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold text-text-primary">{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-bone/45">{sub}</div> : null}
    </div>
  );
}

export default async function MlbModelOpsPage() {
  const report = await getMlbDataQualityReport({ lookbackDays: 7 });

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-aqua">MLB Data Ops</div>
        <h1 className="mt-2 font-display text-3xl font-semibold text-text-primary">MLB Feed Health</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-bone/60">
          Audits whether MLB data is actually present before the model trusts probable pitchers, boxscores, Statcast, weather, bullpen usage, markets, closing lines, and official results.
        </p>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Data quality" value={pct(report.dataQualityScore)} sub={report.readiness} />
        <MetricCard label="Games" value={String(report.games.total)} sub={`${report.games.final} final / ${report.games.upcoming} upcoming`} />
        <MetricCard label="Lookback" value={`${report.lookbackDays}d`} sub={`Generated ${new Date(report.generatedAt).toLocaleString()}`} />
        <MetricCard label="Warnings" value={String(report.warnings.length)} sub="Low-coverage gates" />
      </section>

      {report.warnings.length ? (
        <section className="rounded-xl border border-orange-500/20 bg-orange-500/[0.06] p-4 text-sm text-orange-300">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em]">Warnings</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {report.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-bone/[0.08] bg-ink/40 p-4">
        <h2 className="font-display text-lg font-semibold text-text-primary">Coverage</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {report.coverage.map((metric) => (
            <div key={metric.key} className={`rounded-lg border p-3 ${cls(metric.status)}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{metric.label}</div>
                  <div className="mt-1 text-xs opacity-75">{metric.count}/{metric.total}</div>
                </div>
                <div className="font-display text-xl font-semibold tabular-nums">{pct(metric.pct)}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-bone/[0.08] bg-ink/40 p-4">
        <h2 className="font-display text-lg font-semibold text-text-primary">Freshness</h2>
        <div className="mt-3 grid gap-2 text-sm text-bone/65 md:grid-cols-2">
          <div className="rounded-lg border border-bone/[0.06] bg-black/20 p-3">Latest game: {report.sample.latestGame ?? "—"}</div>
          <div className="rounded-lg border border-bone/[0.06] bg-black/20 p-3">Latest team stat: {report.sample.latestTeamStatUpdatedAt ?? "—"}</div>
          <div className="rounded-lg border border-bone/[0.06] bg-black/20 p-3">Latest player stat: {report.sample.latestPlayerStatUpdatedAt ?? "—"}</div>
          <div className="rounded-lg border border-bone/[0.06] bg-black/20 p-3">Latest market: {report.sample.latestMarketUpdatedAt ?? "—"}</div>
        </div>
      </section>
    </main>
  );
}
