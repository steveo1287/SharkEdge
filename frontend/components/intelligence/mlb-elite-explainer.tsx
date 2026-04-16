type MicroDriver = {
  label: string;
  value: number;
  detail: string;
};

export function MlbEliteExplainer({
  snapshot
}: {
  snapshot?: {
    normalizedTotal?: number;
    homeExpectedRuns?: number;
    awayExpectedRuns?: number;
    parkWeatherDelta?: number;
    bullpenFatigueDelta?: number;
    topMicroDrivers?: MicroDriver[];
  } | null;
}) {
  if (!snapshot) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-[#07111f] p-5">
      <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">MLB explanation</div>
      <h3 className="mt-1 text-xl font-semibold text-white">Why the elite sim likes this game</h3>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Run environment</div>
          <div className="mt-2 text-sm text-slate-300">
            Total {snapshot.normalizedTotal?.toFixed?.(2) ?? "—"} | Home {snapshot.homeExpectedRuns?.toFixed?.(2) ?? "—"} | Away {snapshot.awayExpectedRuns?.toFixed?.(2) ?? "—"}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Park/weather delta {snapshot.parkWeatherDelta?.toFixed?.(3) ?? "—"} · Bullpen fatigue delta {snapshot.bullpenFatigueDelta?.toFixed?.(3) ?? "—"}
          </div>
        </div>

        <div className="grid gap-2">
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
      </div>
    </section>
  );
}
