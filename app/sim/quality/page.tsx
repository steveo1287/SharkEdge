import { getSimQualityDashboard } from "@/services/simulation/sim-quality-dashboard-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatNumber(value: number | null | undefined, digits = 3) {
  if (typeof value !== "number") {
    return "—";
  }

  return value.toFixed(digits);
}

export default async function SimQualityPage() {
  const dashboard = await getSimQualityDashboard();

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-30 border-b border-bone/[0.06] bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto max-w-[1400px] px-4 py-3 sm:px-6">
          <h1 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
            Sim Quality Dashboard
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border border-bone/[0.07] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">Leagues</p>
            <p className="mt-2 font-mono text-[24px] text-text-primary">{dashboard.summary.leagueCount}</p>
          </div>
          <div className="rounded-xl border border-bone/[0.07] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">Model Beats Market</p>
            <p className="mt-2 font-mono text-[24px] text-aqua">{dashboard.summary.modelBeatsMarketCount}</p>
          </div>
          <div className="rounded-xl border border-bone/[0.07] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">Suppressed Profiles</p>
            <p className="mt-2 font-mono text-[24px] text-amber-500">{dashboard.summary.suppressedLeagueCount}</p>
          </div>
        </div>

        {dashboard.suppressedAlerts.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-amber-500">
              Suppressed profile alerts
            </p>
            <div className="space-y-2 text-[12px] text-amber-200/80">
              {dashboard.suppressedAlerts.map((alert) => (
                <div key={alert.leagueKey}>
                  <p className="font-semibold text-amber-100">{alert.leagueKey}</p>
                  {alert.warnings.map((warning, index) => (
                    <p key={index}>• {warning}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-6">
          {dashboard.leagues.map((league) => (
            <div key={league.leagueKey} className="rounded-xl border border-bone/[0.07] bg-surface p-6">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-[16px] font-semibold text-text-primary">{league.leagueKey}</h2>
                  <p className="text-[13px] text-bone/50">
                    Last calibration {new Date(league.latest.generatedAt).toLocaleString()}
                  </p>
                </div>
                <div className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${league.suppressed ? "border-amber-500/20 bg-amber-500/[0.05] text-amber-500" : "border-aqua/20 bg-aqua/[0.05] text-aqua"}`}>
                  {league.suppressed ? "Suppressed" : "Active"}
                </div>
              </div>

              <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg bg-ink/30 p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Brier Delta</p>
                  <p className="mt-2 font-mono text-[18px] text-text-primary">{formatNumber(league.marketVsModel.moneylineBrierDelta)}</p>
                </div>
                <div className="rounded-lg bg-ink/30 p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Log Loss Delta</p>
                  <p className="mt-2 font-mono text-[18px] text-text-primary">{formatNumber(league.marketVsModel.moneylineLogLossDelta)}</p>
                </div>
                <div className="rounded-lg bg-ink/30 p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">30d Runs</p>
                  <p className="mt-2 font-mono text-[18px] text-text-primary">{league.rollingValidation.last30dRuns}</p>
                </div>
                <div className="rounded-lg bg-ink/30 p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">90d Runs</p>
                  <p className="mt-2 font-mono text-[18px] text-text-primary">{league.rollingValidation.last90dRuns}</p>
                </div>
              </div>

              <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-lg bg-ink/30 p-3 text-[12px] text-bone/60">
                  <p className="mb-2 font-semibold text-bone/70">Rolling validation</p>
                  <p>avgModelBrier30d: <span className="font-mono text-text-primary">{formatNumber(league.rollingValidation.avgModelBrier30d)}</span></p>
                  <p>avgMarketBrier30d: <span className="font-mono text-text-primary">{formatNumber(league.rollingValidation.avgMarketBrier30d)}</span></p>
                  <p>avgModelLogLoss30d: <span className="font-mono text-text-primary">{formatNumber(league.rollingValidation.avgModelLogLoss30d)}</span></p>
                </div>
                <div className="rounded-lg bg-ink/30 p-3 text-[12px] text-bone/60 sm:col-span-2 xl:col-span-2">
                  <p className="mb-2 font-semibold text-bone/70">Coefficient drift (30d)</p>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    <p>neutral: <span className="font-mono text-text-primary">{formatNumber(league.coefficientDrift.neutralShrinkDelta30d)}</span></p>
                    <p>market: <span className="font-mono text-text-primary">{formatNumber(league.coefficientDrift.marketBlendDelta30d)}</span></p>
                    <p>spread: <span className="font-mono text-text-primary">{formatNumber(league.coefficientDrift.spreadDeltaShrinkDelta30d)}</span></p>
                    <p>total: <span className="font-mono text-text-primary">{formatNumber(league.coefficientDrift.totalDeltaShrinkDelta30d)}</span></p>
                    <p>prop: <span className="font-mono text-text-primary">{formatNumber(league.coefficientDrift.propProbShrinkDelta30d)}</span></p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-ink/30 p-4">
                <p className="mb-2 text-[12px] font-semibold text-bone/70">Guardrails</p>
                {league.latest.guardrails.warnings.length > 0 ? (
                  <div className="space-y-1 text-[12px] text-amber-200/80">
                    {league.latest.guardrails.warnings.map((warning, index) => (
                      <p key={index}>• {warning}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-aqua">No active guardrail warnings.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
