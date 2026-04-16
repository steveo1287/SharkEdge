type MicroDriver = {
  label: string;
  value: number;
  detail: string;
};

export function MlbEliteCardStrip({
  snapshot
}: {
  snapshot?: {
    normalizedTotal?: number;
    parkWeatherDelta?: number;
    bullpenFatigueDelta?: number;
    topMicroDrivers?: MicroDriver[];
  } | null;
}) {
  if (!snapshot) {
    return null;
  }

  return (
    <div className="grid gap-2 rounded-[22px] border border-cyan-400/15 bg-cyan-400/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
          MLB elite sim
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
          Total {snapshot.normalizedTotal?.toFixed?.(2) ?? "—"}
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
          Park/weather {snapshot.parkWeatherDelta?.toFixed?.(3) ?? "—"}
        </span>
      </div>

      <div className="grid gap-2">
        {(snapshot.topMicroDrivers ?? []).slice(0, 3).map((driver) => (
          <div key={driver.label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">{driver.label}</div>
              <div className="text-xs font-semibold text-cyan-300">{driver.value.toFixed(3)}</div>
            </div>
            <div className="mt-1 text-xs text-slate-400">{driver.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
