import { getCachedModelEvaluationReports } from "@/services/evaluation/model-evaluation-service";

export const dynamic = "force-dynamic";

type Bucket = {
  bucket: string;
  count: number;
  hitRate: number | null;
  avgEdge: number | null;
  avgClvLine: number | null;
  avgAbsError: number | null;
  brier: number | null;
};

function pct(value: number | null | undefined) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—";
}

function num(value: number | null | undefined, digits = 2) {
  return typeof value === "number" ? value.toFixed(digits) : "—";
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

function BucketTable({ title, buckets }: { title: string; buckets: Bucket[] }) {
  return (
    <div className="rounded-xl border border-bone/[0.08] bg-ink/40 p-4">
      <h2 className="font-display text-lg font-semibold text-text-primary">{title}</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="text-[10px] uppercase tracking-[0.12em] text-bone/40">
            <tr>
              <th className="py-2 pr-3">Bucket</th>
              <th className="py-2 pr-3">Sample</th>
              <th className="py-2 pr-3">Hit rate</th>
              <th className="py-2 pr-3">Avg edge</th>
              <th className="py-2 pr-3">Avg CLV line</th>
              <th className="py-2 pr-3">MAE</th>
              <th className="py-2 pr-3">Brier</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bone/[0.06] text-bone/70">
            {buckets.length ? buckets.map((bucket) => (
              <tr key={bucket.bucket}>
                <td className="py-2 pr-3 font-mono text-xs text-aqua">{bucket.bucket}</td>
                <td className="py-2 pr-3 tabular-nums">{bucket.count}</td>
                <td className="py-2 pr-3 tabular-nums">{pct(bucket.hitRate)}</td>
                <td className="py-2 pr-3 tabular-nums">{pct(bucket.avgEdge)}</td>
                <td className="py-2 pr-3 tabular-nums">{num(bucket.avgClvLine)}</td>
                <td className="py-2 pr-3 tabular-nums">{num(bucket.avgAbsError)}</td>
                <td className="py-2 pr-3 tabular-nums">{num(bucket.brier, 4)}</td>
              </tr>
            )) : (
              <tr>
                <td className="py-4 text-bone/40" colSpan={7}>No bucket data yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function SimEvaluationPage() {
  const reports = await getCachedModelEvaluationReports();
  const report = reports[0];

  if (!report) {
    return (
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-aqua">Model Lab</div>
          <h1 className="mt-2 font-display text-3xl font-semibold text-text-primary">Evaluation</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-bone/60">
            No evaluation report has been built yet. Run POST /api/internal/evaluation/rebuild with a leagueKey and lookbackDays.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-aqua">Model Lab</div>
        <h1 className="mt-2 font-display text-3xl font-semibold text-text-primary">Evaluation</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-bone/60">
          Settled-model report for {report.leagueKey ?? "all leagues"}, lookback {report.lookbackDays} days. This page measures actual hit rate, calibration, CLV, and error buckets instead of trusting projection vibes.
        </p>
      </div>

      {report.guardrails.warnings.length ? (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.06] p-4 text-sm text-orange-300">
          <div className="font-semibold uppercase tracking-[0.12em] text-[10px]">Guardrails</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {report.guardrails.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Prop sample" value={String(report.playerProps.sample)} sub={`${report.playerProps.withLineSample} with market line`} />
        <MetricCard label="Prop hit rate" value={pct(report.playerProps.hitRate)} sub="Over/under picks only" />
        <MetricCard label="Prop MAE" value={num(report.playerProps.mae)} sub={`RMSE ${num(report.playerProps.rmse)}`} />
        <MetricCard label="Prop Brier" value={num(report.playerProps.brier, 4)} sub={`Avg CLV ${num(report.playerProps.avgClvLine)}`} />
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        <MetricCard label="Event sample" value={String(report.events.sample)} />
        <MetricCard label="Winner accuracy" value={pct(report.events.winnerAccuracy)} />
        <MetricCard label="Event Brier" value={num(report.events.brier, 4)} />
        <MetricCard label="Spread MAE" value={num(report.events.spreadMae)} />
        <MetricCard label="Total MAE" value={num(report.events.totalMae)} />
      </section>

      <BucketTable title="Performance by prop type" buckets={report.playerProps.byStatKey} />
      <BucketTable title="Performance by model edge bucket" buckets={report.playerProps.byEdgeBucket} />
      <BucketTable title="Performance by confidence bucket" buckets={report.playerProps.byConfidenceBucket} />

      <div className="rounded-xl border border-bone/[0.08] bg-ink/40 p-4">
        <h2 className="font-display text-lg font-semibold text-text-primary">Recent evaluated props</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-[0.12em] text-bone/40">
              <tr>
                <th className="py-2 pr-3">Event</th>
                <th className="py-2 pr-3">Player</th>
                <th className="py-2 pr-3">Prop</th>
                <th className="py-2 pr-3">Line</th>
                <th className="py-2 pr-3">Mean</th>
                <th className="py-2 pr-3">Actual</th>
                <th className="py-2 pr-3">Pick</th>
                <th className="py-2 pr-3">Result</th>
                <th className="py-2 pr-3">Edge</th>
                <th className="py-2 pr-3">CLV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bone/[0.06] text-bone/70">
              {report.playerProps.records.slice(0, 60).map((record) => (
                <tr key={record.projectionId}>
                  <td className="py-2 pr-3 max-w-[260px] truncate text-bone/55">{record.eventName}</td>
                  <td className="py-2 pr-3 text-text-primary">{record.playerName}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-aqua">{record.statKey}</td>
                  <td className="py-2 pr-3 tabular-nums">{num(record.marketLine)}</td>
                  <td className="py-2 pr-3 tabular-nums">{num(record.modelMean)}</td>
                  <td className="py-2 pr-3 tabular-nums">{num(record.actualValue)}</td>
                  <td className="py-2 pr-3">{record.modelPick}</td>
                  <td className="py-2 pr-3">{record.result}</td>
                  <td className="py-2 pr-3 tabular-nums">{pct(record.modelEdgeProbability)}</td>
                  <td className="py-2 pr-3 tabular-nums">{num(record.clvLine)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
