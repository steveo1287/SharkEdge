import Link from "next/link";

import { getDataControlTowerReport, type DataTowerStatus } from "@/services/ops/data-control-tower";
import { getSimQualityDashboard } from "@/services/simulation/sim-quality-dashboard-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatNumber(value: number | null | undefined, digits = 3) {
  if (typeof value !== "number") {
    return "—";
  }

  return value.toFixed(digits);
}

function statusTone(status: DataTowerStatus) {
  if (status === "ELITE") return "border-aqua/25 bg-aqua/[0.05] text-aqua";
  if (status === "USABLE") return "border-sky-300/25 bg-sky-300/[0.05] text-sky-200";
  if (status === "WEAK") return "border-amber-500/25 bg-amber-500/[0.05] text-amber-300";
  return "border-crimson/25 bg-crimson/[0.05] text-crimson";
}

function DataTowerPanel({
  status,
  score,
  officialPromotionAllowed,
  blockers,
  warnings
}: {
  status: DataTowerStatus;
  score: number;
  officialPromotionAllowed: boolean;
  blockers: string[];
  warnings: string[];
}) {
  const blocked = !officialPromotionAllowed;
  return (
    <div className={`mb-6 rounded-xl border p-4 ${blocked ? "border-crimson/25 bg-crimson/[0.045]" : "border-aqua/20 bg-aqua/[0.035]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone/45">Data Control Tower</div>
          <h2 className="mt-2 font-display text-[22px] font-semibold tracking-[-0.03em] text-text-primary">
            {blocked ? "Simulation quality is data-locked." : "Simulation quality has clean data clearance."}
          </h2>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-bone/60">
            Sim quality now checks the same global data gate used by Promotion, Official Accuracy, Calibration, and Autopsy. If data is blocked, model-health numbers stay visible but should not be used for official promotion claims.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusTone(status)}`}>{status}</span>
          <Link href="/accuracy/data" className="rounded-full border border-bone/[0.12] bg-bone/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-bone/70 transition hover:border-aqua/30 hover:text-aqua">
            Open data tower
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg bg-ink/35 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Tower Score</p>
          <p className="mt-2 font-mono text-[22px] text-text-primary">{score}</p>
        </div>
        <div className="rounded-lg bg-ink/35 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Promotion</p>
          <p className={`mt-2 font-mono text-[22px] ${officialPromotionAllowed ? "text-aqua" : "text-crimson"}`}>{officialPromotionAllowed ? "Allowed" : "Blocked"}</p>
        </div>
        <div className="rounded-lg bg-ink/35 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Blockers</p>
          <p className="mt-2 font-mono text-[22px] text-crimson">{blockers.length}</p>
        </div>
        <div className="rounded-lg bg-ink/35 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Warnings</p>
          <p className="mt-2 font-mono text-[22px] text-amber-300">{warnings.length}</p>
        </div>
      </div>

      {(blockers.length > 0 || warnings.length > 0) ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-crimson/15 bg-ink/30 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-crimson">Active blockers</p>
            {blockers.length ? (
              <div className="space-y-1 text-[12px] leading-5 text-crimson/80">
                {blockers.slice(0, 5).map((blocker) => <p key={blocker}>• {blocker}</p>)}
              </div>
            ) : <p className="text-[12px] text-bone/50">No hard blockers.</p>}
          </div>
          <div className="rounded-lg border border-amber-500/15 bg-ink/30 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">Warnings</p>
            {warnings.length ? (
              <div className="space-y-1 text-[12px] leading-5 text-amber-200/80">
                {warnings.slice(0, 5).map((warning) => <p key={warning}>• {warning}</p>)}
              </div>
            ) : <p className="text-[12px] text-bone/50">No warnings.</p>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default async function SimQualityPage() {
  const [dashboard, dataTower] = await Promise.all([
    getSimQualityDashboard(),
    getDataControlTowerReport()
  ]);
  const dataLocked = !dataTower.officialPromotionAllowed;

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-30 border-b border-bone/[0.06] bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <h1 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
            Sim Quality Dashboard
          </h1>
          <div className="flex flex-wrap gap-2">
            <Link href="/sim" className="rounded-full border border-bone/[0.1] bg-bone/[0.035] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-bone/65 transition hover:border-aqua/30 hover:text-aqua">SimHub</Link>
            <Link href="/accuracy/data" className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusTone(dataTower.status)}`}>Data {dataTower.status}</Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <DataTowerPanel
          status={dataTower.status}
          score={dataTower.score}
          officialPromotionAllowed={dataTower.officialPromotionAllowed}
          blockers={dataTower.blockers}
          warnings={dataTower.warnings}
        />

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-bone/[0.07] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">Leagues</p>
            <p className="mt-2 font-mono text-[24px] text-text-primary">{dashboard.summary.leagueCount}</p>
          </div>
          <div className="rounded-xl border border-bone/[0.07] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">Model Beats Market</p>
            <p className={`mt-2 font-mono text-[24px] ${dataLocked ? "text-bone/45" : "text-aqua"}`}>{dashboard.summary.modelBeatsMarketCount}</p>
          </div>
          <div className="rounded-xl border border-bone/[0.07] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">Suppressed Profiles</p>
            <p className="mt-2 font-mono text-[24px] text-amber-500">{dashboard.summary.suppressedLeagueCount}</p>
          </div>
          <div className={`rounded-xl border p-4 ${dataLocked ? "border-crimson/20 bg-crimson/[0.045]" : "border-aqua/20 bg-aqua/[0.035]"}`}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">Quality Use</p>
            <p className={`mt-2 font-mono text-[24px] ${dataLocked ? "text-crimson" : "text-aqua"}`}>{dataLocked ? "Locked" : "Live"}</p>
          </div>
        </div>

        {dataLocked ? (
          <div className="mb-6 rounded-xl border border-crimson/20 bg-crimson/[0.05] p-4">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-crimson">
              Official model-quality claims blocked
            </p>
            <p className="text-[12px] leading-5 text-crimson/80">
              The dashboard remains visible for diagnosis, but model-vs-market quality claims should not be used until the Data Control Tower clears official promotion.
            </p>
          </div>
        ) : null}

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
            <div key={league.leagueKey} className={`rounded-xl border bg-surface p-6 ${dataLocked ? "border-crimson/15" : "border-bone/[0.07]"}`}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-[16px] font-semibold text-text-primary">{league.leagueKey}</h2>
                  <p className="text-[13px] text-bone/50">
                    Last calibration {new Date(league.latest.generatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {dataLocked ? (
                    <div className="rounded-full border border-crimson/20 bg-crimson/[0.05] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-crimson">
                      Data locked
                    </div>
                  ) : null}
                  <div className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${league.suppressed ? "border-amber-500/20 bg-amber-500/[0.05] text-amber-500" : "border-aqua/20 bg-aqua/[0.05] text-aqua"}`}>
                    {league.suppressed ? "Suppressed" : "Active"}
                  </div>
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
                {dataLocked ? (
                  <p className="mb-2 text-[12px] text-crimson/80">Data Control Tower is blocking official use of these quality metrics.</p>
                ) : null}
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
