import type { ReactNode } from "react";

type AlertItem = {
  title: string;
  detail: string;
  severity?: string;
  signature?: string;
  createdAt?: string;
};

type HealthMetric = {
  sampleSize?: number;
  brier?: number;
  logLoss?: number;
  averageClvPercent?: number | null;
  hitRate?: number;
};

type ModelHealthPanelProps = {
  overall?: HealthMetric | null;
  alerts?: AlertItem[];
  qualifiedWinnerTarget?: number;
};

function toneForSeverity(severity?: string) {
  switch ((severity ?? "").toLowerCase()) {
    case "critical":
      return "border-rose-500/40 bg-rose-500/10 text-rose-200";
    case "warning":
      return "border-amber-500/40 bg-amber-500/10 text-amber-200";
    default:
      return "border-cyan-500/30 bg-cyan-500/10 text-cyan-100";
  }
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

export function ModelHealthPanel({
  overall,
  alerts = [],
  qualifiedWinnerTarget = 0.7
}: ModelHealthPanelProps) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[#07111f] p-5 shadow-[0_18px_60px_rgba(2,6,23,0.45)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Model health</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">Live calibration status</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Calibration, CLV, winner qualification, and alert pressure in one surface.
          </p>
        </div>
        <div className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">
          Winner target {Math.round(qualifiedWinnerTarget * 100)}%+
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <Stat label="Sample" value={overall?.sampleSize ?? "—"} />
        <Stat label="Brier" value={overall?.brier?.toFixed?.(3) ?? "—"} />
        <Stat label="Log loss" value={overall?.logLoss?.toFixed?.(3) ?? "—"} />
        <Stat
          label="Avg CLV"
          value={
            overall?.averageClvPercent === null || overall?.averageClvPercent === undefined
              ? "—"
              : `${overall.averageClvPercent.toFixed(2)}%`
          }
        />
      </div>

      <div className="mt-5">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Active alerts</div>
        <div className="mt-3 grid gap-3">
          {alerts.length ? (
            alerts.slice(0, 6).map((alert) => (
              <div
                key={alert.signature ?? `${alert.title}-${alert.createdAt}`}
                className={`rounded-2xl border p-3 ${toneForSeverity(alert.severity)}`}
              >
                <div className="text-sm font-semibold">{alert.title}</div>
                <div className="mt-1 text-sm opacity-90">{alert.detail}</div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-400">
              No active calibration alerts.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
