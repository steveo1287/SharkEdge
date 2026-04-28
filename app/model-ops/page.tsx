import { getModelOpsHealth } from "@/services/ops/model-ops-health";

export const dynamic = "force-dynamic";

function pct(value: number | null | undefined) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—";
}

function num(value: number | null | undefined, digits = 2) {
  return typeof value === "number" ? value.toFixed(digits) : "—";
}

function dateText(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
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

export default async function ModelOpsPage() {
  const health = await getModelOpsHealth();

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-aqua">Operations</div>
        <h1 className="mt-2 font-display text-3xl font-semibold text-text-primary">Model Ops Health</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-bone/60">
          Tracks the health of the SharkEdge learning loop: closing-line freeze coverage, evaluation freshness, tuning profile availability, and model warnings.
        </p>
        <p className="mt-1 text-xs text-bone/40">Generated {dateText(health.generatedAt)}</p>
      </div>

      {health.warnings.length ? (
        <section className="rounded-xl border border-orange-500/20 bg-orange-500/[0.06] p-4 text-sm text-orange-300">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em]">Warnings</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {health.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </section>
      ) : (
        <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-sm text-emerald-300">
          No model-ops warnings detected.
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard
          label="Freeze coverage"
          value={pct(health.closingLineHealth.freezeCoverage)}
          sub={`${health.closingLineHealth.frozenMarketsNearLock}/${health.closingLineHealth.marketsNearLock} markets near lock`}
        />
        <MetricCard
          label="Near-lock NBA events"
          value={String(health.closingLineHealth.upcomingEvents)}
          sub="-90 to +45 minute window"
        />
        <MetricCard
          label="Evaluation sample"
          value={String(health.evaluationHealth.playerPropSample ?? "—")}
          sub={`Hit rate ${pct(health.evaluationHealth.playerPropHitRate)}`}
        />
        <MetricCard
          label="Avg CLV line"
          value={num(health.evaluationHealth.avgClvLine)}
          sub="Positive is better"
        />
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard
          label="Latest evaluation"
          value={dateText(health.evaluationHealth.latestReportAt)}
          sub={`${health.evaluationHealth.latestLeagueKey ?? "all"} / ${health.evaluationHealth.latestLookbackDays ?? "—"} days`}
        />
        <MetricCard
          label="Latest tuning"
          value={dateText(health.tuningHealth.latestProfileAt)}
          sub={`${health.tuningHealth.latestLeagueKey ?? "all"} / ${health.tuningHealth.ruleCount} rules`}
        />
        <MetricCard
          label="Default action"
          value={health.tuningHealth.defaultAction ?? "—"}
          sub="TRUST / STANDARD / CAUTION / PASS_ONLY"
        />
      </section>

      <section className="rounded-xl border border-bone/[0.08] bg-ink/40 p-4">
        <h2 className="font-display text-lg font-semibold text-text-primary">Strong loop checklist</h2>
        <div className="mt-3 grid gap-2 text-sm text-bone/65 md:grid-cols-2">
          <div className="rounded-lg border border-bone/[0.06] bg-black/20 p-3">1. Odds ingest updates current prices.</div>
          <div className="rounded-lg border border-bone/[0.06] bg-black/20 p-3">2. GitHub Actions calls closing-line freeze near lock.</div>
          <div className="rounded-lg border border-bone/[0.06] bg-black/20 p-3">3. Results settle and actual stat rows exist.</div>
          <div className="rounded-lg border border-bone/[0.06] bg-black/20 p-3">4. Model lab rebuilds evaluation and tuning.</div>
          <div className="rounded-lg border border-bone/[0.06] bg-black/20 p-3">5. Recompute applies tuning thresholds.</div>
          <div className="rounded-lg border border-bone/[0.06] bg-black/20 p-3">6. Weak buckets are gated before picks surface.</div>
        </div>
      </section>
    </main>
  );
}
