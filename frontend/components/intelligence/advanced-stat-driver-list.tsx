import type { AdvancedStatDriver } from "@/lib/types/sport-features";

export function AdvancedStatDriverList({ drivers }: { drivers?: AdvancedStatDriver[] }) {
  if (!drivers?.length) {
    return null;
  }

  return (
    <div className="grid gap-2">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Advanced stat drivers</div>
      <div className="grid gap-2">
        {drivers.slice(0, 4).map((driver) => (
          <div key={driver.key} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">{driver.label}</div>
              <div className="text-xs font-semibold text-cyan-300">{driver.score.toFixed(2)}</div>
            </div>
            <div className="mt-1 text-xs text-slate-400">{driver.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
