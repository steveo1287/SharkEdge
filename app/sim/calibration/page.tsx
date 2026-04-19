import { getPersistedSimCalibrationReports } from "@/services/simulation/sim-calibration-report-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatNumber(value: number | null | undefined, digits = 3) {
  if (typeof value !== "number") {
    return "—";
  }

  return value.toFixed(digits);
}

export default async function SimCalibrationPage() {
  const reports = await getPersistedSimCalibrationReports();

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-30 border-b border-bone/[0.06] bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto max-w-[1400px] px-4 py-3 sm:px-6">
          <h1 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
            Sim Calibration Reports
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {reports.length === 0 ? (
          <div className="rounded-2xl border border-bone/[0.07] bg-surface px-6 py-12 text-center">
            <p className="text-[14px] font-semibold text-bone/70">No calibration reports persisted yet</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {reports.map((report) => (
              <div key={report.leagueKey} className="rounded-xl border border-bone/[0.07] bg-surface p-6">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-[16px] font-semibold text-text-primary">
                      {report.leagueKey}
                    </h2>
                    <p className="text-[13px] text-bone/50">
                      Generated {new Date(report.generatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${report.guardrails.eligible ? "border-aqua/20 bg-aqua/[0.05] text-aqua" : "border-amber-500/20 bg-amber-500/[0.05] text-amber-500"}`}>
                    {report.guardrails.eligible ? "Eligible" : "Guardrailed"}
                  </div>
                </div>

                <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg bg-ink/30 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Moneyline Brier</p>
                    <p className="mt-2 font-mono text-[18px] text-text-primary">{formatNumber(report.metrics.modelBrier)}</p>
                  </div>
                  <div className="rounded-lg bg-ink/30 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Market Brier</p>
                    <p className="mt-2 font-mono text-[18px] text-text-primary">{formatNumber(report.metrics.marketBrier)}</p>
                  </div>
                  <div className="rounded-lg bg-ink/30 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Model Log Loss</p>
                    <p className="mt-2 font-mono text-[18px] text-text-primary">{formatNumber(report.metrics.modelLogLoss)}</p>
                  </div>
                  <div className="rounded-lg bg-ink/30 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Market Log Loss</p>
                    <p className="mt-2 font-mono text-[18px] text-text-primary">{formatNumber(report.metrics.marketLogLoss)}</p>
                  </div>
                </div>

                <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg bg-ink/30 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Moneyline Sample</p>
                    <p className="mt-2 font-mono text-[18px] text-text-primary">{report.metrics.moneylineSample}</p>
                  </div>
                  <div className="rounded-lg bg-ink/30 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Spread Sample</p>
                    <p className="mt-2 font-mono text-[18px] text-text-primary">{report.metrics.spreadSample}</p>
                  </div>
                  <div className="rounded-lg bg-ink/30 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Total Sample</p>
                    <p className="mt-2 font-mono text-[18px] text-text-primary">{report.metrics.totalSample}</p>
                  </div>
                  <div className="rounded-lg bg-ink/30 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Prop Sample</p>
                    <p className="mt-2 font-mono text-[18px] text-text-primary">{report.metrics.propSample}</p>
                  </div>
                </div>

                <div className="mb-4 rounded-lg bg-ink/30 p-4">
                  <p className="mb-2 text-[12px] font-semibold text-bone/70">Fitted Profile</p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 text-[12px] text-bone/60">
                    <p>neutralShrink: <span className="font-mono text-text-primary">{formatNumber(report.profile.neutralShrink)}</span></p>
                    <p>marketBlend: <span className="font-mono text-text-primary">{formatNumber(report.profile.marketBlend)}</span></p>
                    <p>spreadDeltaShrink: <span className="font-mono text-text-primary">{formatNumber(report.profile.spreadDeltaShrink)}</span></p>
                    <p>totalDeltaShrink: <span className="font-mono text-text-primary">{formatNumber(report.profile.totalDeltaShrink)}</span></p>
                    <p>propProbShrink: <span className="font-mono text-text-primary">{formatNumber(report.profile.propProbShrink)}</span></p>
                    <p>stdBaseline: <span className="font-mono text-text-primary">{formatNumber(report.profile.stdBaseline)}</span></p>
                  </div>
                </div>

                {report.guardrails.warnings.length > 0 && (
                  <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-4">
                    <p className="mb-2 text-[12px] font-semibold text-amber-500">Guardrail warnings</p>
                    <div className="space-y-1 text-[12px] text-amber-200/80">
                      {report.guardrails.warnings.map((warning, index) => (
                        <p key={index}>• {warning}</p>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-lg bg-ink/30 p-4">
                  <p className="mb-2 text-[12px] font-semibold text-bone/70">Moneyline calibration buckets</p>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {report.metrics.buckets.map((bucket) => (
                      <div key={bucket.bucket} className="rounded border border-bone/[0.06] bg-ink/50 p-2 text-[11px] text-bone/60">
                        <p className="font-mono text-text-primary">{bucket.bucket}</p>
                        <p>predicted: <span className="font-mono">{formatNumber(bucket.predicted)}</span></p>
                        <p>actual: <span className="font-mono">{formatNumber(bucket.actual)}</span></p>
                        <p>count: <span className="font-mono">{bucket.count}</span></p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
