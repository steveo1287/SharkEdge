import Link from "next/link";
import { getABTestDashboard } from "@/services/simulation/ab-test-dashboard-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatPercent(value: number, digits = 1) {
  return (value * 100).toFixed(digits) + "%";
}

function formatNumber(value: number | null | undefined, digits = 3) {
  if (typeof value !== "number") {
    return "—";
  }
  return value.toFixed(digits);
}

function AlertIcon({ severity }: { severity: string }) {
  switch (severity) {
    case "critical":
      return <span className="text-red-500">⚠️</span>;
    case "warning":
      return <span className="text-amber-500">⚡</span>;
    case "info":
      return <span className="text-aqua">ℹ️</span>;
    default:
      return null;
  }
}

function RecommendationBadge({ action }: { action: string }) {
  let bgColor = "bg-bone/10";
  let textColor = "text-bone/50";

  switch (action) {
    case "PROMOTE_TREATMENT":
      bgColor = "bg-aqua/[0.15]";
      textColor = "text-aqua";
      break;
    case "ROLLBACK_TREATMENT":
      bgColor = "bg-red-500/[0.15]";
      textColor = "text-red-500";
      break;
    case "INCONCLUSIVE_RETEST":
      bgColor = "bg-amber-500/[0.15]";
      textColor = "text-amber-500";
      break;
  }

  return (
    <div className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${bgColor} border-current ${textColor}`}>
      {action.replace(/_/g, " ")}
    </div>
  );
}

function ProgressBar({ value, max = 1000 }: { value: number; max?: number }) {
  const percent = Math.min((value / max) * 100, 100);
  return (
    <div className="h-2 w-full rounded-full bg-bone/10">
      <div
        className="h-full rounded-full bg-gradient-to-r from-aqua to-cyan-400 transition-all duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export default async function ABTestDashboard() {
  const dashboard = await getABTestDashboard();

  const treatmentWinPct = Math.round(dashboard.overall.treatmentWinRate * 100);
  const controlWinPct = 100 - treatmentWinPct;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-bone/[0.06] bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
          <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
              A/B Test Dashboard
            </h1>
            <div className="flex items-center gap-4">
              <p className="text-[12px] text-bone/50">
                Updated {new Date(dashboard.generatedAt).toLocaleTimeString()}
              </p>
              <div className="flex gap-1">
                <Link
                  href="/sim"
                  className="rounded-lg px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-bone/70 hover:bg-bone/[0.08] transition-colors"
                >
                  Board
                </Link>
                <Link
                  href="/sim/ab-test"
                  className="rounded-lg px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-text-primary hover:bg-bone/[0.08] transition-colors"
                >
                  A/B Test
                </Link>
                <Link
                  href="/sim/calibration"
                  className="rounded-lg px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-bone/70 hover:bg-bone/[0.08] transition-colors"
                >
                  Calibration
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {/* Overall Metrics */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-bone/[0.07] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">Total Events</p>
            <p className="mt-2 font-mono text-[24px] text-text-primary">{dashboard.overall.totalTests}</p>
            <p className="mt-1 text-[11px] text-bone/50">
              {dashboard.overall.resolvedTests} resolved, {dashboard.overall.pendingTests} pending
            </p>
          </div>

          <div className="rounded-xl border border-bone/[0.07] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">Treatment Win Rate</p>
            <p className="mt-2 font-mono text-[24px] text-aqua">{formatPercent(dashboard.overall.treatmentWinRate)}</p>
            <p className="mt-1 text-[11px] text-bone/50">Control: {formatPercent(1 - dashboard.overall.treatmentWinRate)}</p>
          </div>

          <div className="rounded-xl border border-bone/[0.07] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">Avg Error (Treatment)</p>
            <p className="mt-2 font-mono text-[24px] text-text-primary">{formatNumber(dashboard.overall.treatmentAvgError)}</p>
            <p className="mt-1 text-[11px] text-bone/50">Control: {formatNumber(dashboard.overall.controlAvgError)}</p>
          </div>

          <div className="rounded-xl border border-bone/[0.07] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">Confidence Level</p>
            <p className={`mt-2 font-mono text-[24px] ${dashboard.overall.confidenceLevel === "HIGH" ? "text-aqua" : dashboard.overall.confidenceLevel === "MEDIUM" ? "text-amber-500" : "text-bone/50"}`}>
              {dashboard.overall.confidenceLevel}
            </p>
            <RecommendationBadge action={dashboard.overall.recommendedAction} />
          </div>
        </div>

        {/* Win Rate Visualization */}
        <div className="mb-8 rounded-xl border border-bone/[0.07] bg-surface p-6">
          <h2 className="mb-4 font-display text-[15px] font-semibold text-text-primary">Win Rate Distribution</h2>
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex justify-between text-[12px]">
                <span className="text-bone/70">Treatment ({treatmentWinPct}%)</span>
                <span className="font-mono text-text-primary">{dashboard.overall.totalTests > 0 ? Math.round(dashboard.overall.treatmentWinRate * dashboard.overall.resolvedTests) : 0} wins</span>
              </div>
              <ProgressBar value={dashboard.overall.treatmentWinRate} />
            </div>
            <div>
              <div className="mb-2 flex justify-between text-[12px]">
                <span className="text-bone/70">Control ({controlWinPct}%)</span>
                <span className="font-mono text-text-primary">{dashboard.overall.totalTests > 0 ? Math.round((1 - dashboard.overall.treatmentWinRate) * dashboard.overall.resolvedTests) : 0} wins</span>
              </div>
              <ProgressBar value={1 - dashboard.overall.treatmentWinRate} />
            </div>
          </div>
        </div>

        {/* Improvement */}
        {dashboard.overall.improvementPct !== 0 && (
          <div className="mb-8 rounded-xl border border-bone/[0.07] bg-surface p-6">
            <h2 className="mb-4 font-display text-[15px] font-semibold text-text-primary">Verdict Accuracy Improvement</h2>
            <div className="flex items-end gap-4">
              <div>
                <p className="text-[12px] text-bone/70">Treatment vs Control</p>
                <p className={`mt-2 font-mono text-[32px] ${dashboard.overall.improvementPct > 0 ? "text-aqua" : "text-red-500"}`}>
                  {dashboard.overall.improvementPct > 0 ? "+" : ""}{dashboard.overall.improvementPct.toFixed(1)}%
                </p>
              </div>
              <div className="flex-1 text-[12px] text-bone/60">
                {dashboard.overall.improvementPct > 0
                  ? "Treatment shows improved accuracy over control"
                  : "Control shows improved accuracy over treatment"}
              </div>
            </div>
          </div>
        )}

        {/* Alerts */}
        {dashboard.alerts.length > 0 && (
          <div className="mb-8 space-y-3">
            {dashboard.alerts.map((alert, idx) => {
              let bgColor = "bg-bone/[0.04]";
              let borderColor = "border-bone/[0.07]";
              let textColor = "text-bone/60";

              if (alert.severity === "critical") {
                bgColor = "bg-red-500/[0.05]";
                borderColor = "border-red-500/20";
                textColor = "text-red-300";
              } else if (alert.severity === "warning") {
                bgColor = "bg-amber-500/[0.05]";
                borderColor = "border-amber-500/20";
                textColor = "text-amber-200";
              }

              return (
                <div key={idx} className={`rounded-lg border ${borderColor} ${bgColor} p-4 flex gap-3`}>
                  <div className="flex-shrink-0 pt-0.5">
                    <AlertIcon severity={alert.severity} />
                  </div>
                  <div className={`flex-1 text-[13px] ${textColor}`}>{alert.message}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* By League */}
        {dashboard.byLeague.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 font-display text-[15px] font-semibold text-text-primary">By League</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {dashboard.byLeague.map((league) => (
                <div key={league.leagueKey} className="rounded-lg border border-bone/[0.07] bg-surface p-4">
                  <p className="font-mono text-[14px] font-semibold text-text-primary">{league.leagueKey}</p>
                  <div className="mt-3 space-y-2 text-[12px]">
                    <div className="flex justify-between">
                      <span className="text-bone/60">Tests:</span>
                      <span className="font-mono text-text-primary">{league.resolvedTests}/{league.totalTests}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-bone/60">Treatment Win:</span>
                      <span className="font-mono text-aqua">{formatPercent(league.treatmentWinRate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-bone/60">Avg Control Error:</span>
                      <span className="font-mono text-text-primary">{formatNumber(league.avgControlError)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-bone/60">Avg Treatment Error:</span>
                      <span className="font-mono text-text-primary">{formatNumber(league.avgTreatmentError)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Tests */}
        {dashboard.recentTests.length > 0 && (
          <div>
            <h2 className="mb-4 font-display text-[15px] font-semibold text-text-primary">Recent Tests</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-bone/[0.07]">
                    <th className="px-4 py-2 text-left font-semibold text-bone/60">Event ID</th>
                    <th className="px-4 py-2 text-left font-semibold text-bone/60">Variant</th>
                    <th className="px-4 py-2 text-left font-semibold text-bone/60">Regime</th>
                    <th className="px-4 py-2 text-right font-semibold text-bone/60">Error</th>
                    <th className="px-4 py-2 text-center font-semibold text-bone/60">Result</th>
                    <th className="px-4 py-2 text-left font-semibold text-bone/60">Resolved</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.recentTests.map((test) => (
                    <tr key={test.eventId} className="border-b border-bone/[0.04] hover:bg-bone/[0.02]">
                      <td className="px-4 py-2 font-mono text-bone/70">{test.eventId.slice(0, 20)}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block rounded px-2 py-0.5 ${test.variant === "treatment" ? "bg-aqua/10 text-aqua" : "bg-bone/10 text-bone/70"}`}>
                          {test.variant}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-bone/70">{test.regime || "—"}</td>
                      <td className="px-4 py-2 text-right font-mono text-text-primary">{formatNumber(test.treatmentError)}</td>
                      <td className="px-4 py-2 text-center">
                        {test.winner === "pending" ? (
                          <span className="text-bone/50">⏳</span>
                        ) : test.winner === "treatment" ? (
                          <span className="text-aqua">✓</span>
                        ) : test.winner === "control" ? (
                          <span className="text-red-500">✗</span>
                        ) : (
                          <span className="text-amber-500">=</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-[11px] text-bone/50">
                        {test.resolvedAt ? new Date(test.resolvedAt).toLocaleDateString() : "Pending"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
