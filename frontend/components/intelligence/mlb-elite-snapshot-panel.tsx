import type { ReactNode } from "react";

type MicroDriver = {
  label: string;
  value: number;
  detail: string;
};

type MlbEliteSnapshotPanelProps = {
  snapshot?: {
    normalizedTotal?: number;
    homeExpectedRuns?: number;
    awayExpectedRuns?: number;
    parkWeatherDelta?: number;
    bullpenFatigueDelta?: number;
    topMicroDrivers?: MicroDriver[];
  } | null;
};

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

export function MlbEliteSnapshotPanel({ snapshot }: MlbEliteSnapshotPanelProps) {
  if (!snapshot) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-[#07111f] p-5 shadow-[0_18px_60px_rgba(2,6,23,0.45)]">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">MLB elite sim</div>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">Probability-chain snapshot</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          League-normalized run environment, bullpen fatigue, and lineup split micro-drivers.
        </p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <Stat label="Total" value={snapshot.normalizedTotal?.toFixed?.(2) ?? "—"} />
        <Stat label="Home runs" value={snapshot.homeExpectedRuns?.toFixed?.(2) ?? "—"} />
        <Stat label="Away runs" value={snapshot.awayExpectedRuns?.toFixed?.(2) ?? "—"} />
        <Stat label="Park/weather" value={snapshot.parkWeatherDelta?.toFixed?.(3) ?? "—"} />
      </div>

      <div className="mt-5 grid gap-2">
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Top micro drivers</div>
        {(snapshot.topMicroDrivers ?? []).slice(0, 4).map((driver) => (
          <div key={driver.label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">{driver.label}</div>
              <div className="text-xs font-semibold text-cyan-300">{driver.value.toFixed(3)}</div>
            </div>
            <div className="mt-1 text-xs text-slate-400">{driver.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
