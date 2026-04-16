type Fusion = {
  fusedScore?: number;
  fusedTier?: string;
  calibratedFusedScore?: number;
  calibratedTier?: string;
  regimeFit?: number;
  incrementalTrendValue?: number;
  uncertaintyPenalty?: number;
  conflictPenalty?: number;
  redundancyPenalty?: number;
  rationale?: string[];
  suppressionReason?: string | null;
};

export function DecisionFusionPanel({ fusion }: { fusion?: Fusion | null }) {
  if (!fusion) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-[#07111f] p-5">
      <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Decision fusion</div>
      <h3 className="mt-1 text-xl font-semibold text-white">Calibrated final decision authority</h3>

      <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <div className="text-sm font-semibold text-white">
          Raw {fusion.fusedTier ?? "pass"} · {fusion.fusedScore?.toFixed?.(2) ?? "—"}
        </div>
        <div className="mt-1 text-sm font-semibold text-cyan-200">
          Calibrated {fusion.calibratedTier ?? "pass"} · {fusion.calibratedFusedScore?.toFixed?.(2) ?? "—"}
        </div>
        <div className="mt-2 text-xs text-slate-400">
          Regime {fusion.regimeFit?.toFixed?.(3) ?? "—"} · Incremental trend {fusion.incrementalTrendValue?.toFixed?.(3) ?? "—"}
        </div>
        <div className="mt-1 text-xs text-slate-400">
          Uncertainty {fusion.uncertaintyPenalty?.toFixed?.(3) ?? "—"} · Conflict {fusion.conflictPenalty?.toFixed?.(3) ?? "—"} · Redundancy {fusion.redundancyPenalty?.toFixed?.(3) ?? "—"}
        </div>
      </div>

      {fusion.suppressionReason ? (
        <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200">
          {fusion.suppressionReason}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2">
        {(fusion.rationale ?? []).map((item) => (
          <div key={item} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-xs text-slate-400">
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}
