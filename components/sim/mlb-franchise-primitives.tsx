import type { ReactNode } from "react";

import { SimSignalCard } from "@/components/sim/sim-ui";

export function FranchiseStat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{label}</div>
      <div className="mt-2 font-display text-2xl font-bold tracking-tight text-white">{value}</div>
      {sub ? <div className="mt-2 text-[11px] leading-5 text-slate-500">{sub}</div> : null}
    </div>
  );
}

export function FranchiseTable({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <SimSignalCard className="overflow-hidden p-0">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</div>
        {description ? <div className="mt-1 text-[11px] leading-5 text-slate-500">{description}</div> : null}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </SimSignalCard>
  );
}

export function FranchiseEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-5 text-sm text-slate-400">
      <div className="font-semibold text-slate-200">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
    </div>
  );
}
