"use client";

import { useState, useTransition } from "react";
import { refreshMlbBettingWarehouse } from "./refresh-action";

type Run = Awaited<ReturnType<typeof refreshMlbBettingWarehouse>>;

export default function MlbWarehouseRefreshForm() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Run | null>(null);
  return (
    <div className="grid gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
      <button type="button" disabled={pending} onClick={() => startTransition(async () => setResult(await refreshMlbBettingWarehouse()))} className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15 disabled:opacity-50">Refresh MLB betting warehouse</button>
      {pending ? <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-slate-300">Refreshing warehouse...</div> : null}
      {result ? <div className={`rounded-xl border p-3 text-xs leading-5 ${result.ok ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" : "border-red-400/25 bg-red-400/10 text-red-100"}`}><div className="font-semibold text-white">{result.ok ? "Refresh complete" : "Refresh failed"}</div><div className="mt-1">{result.error ?? result.sourceNote}</div><div className="mt-2 grid gap-1 sm:grid-cols-5"><span>Games {result.stats.bettingGames}</span><span>Markets {result.stats.marketRows}</span><span>Grades {result.stats.gradeRows}</span><span>Situations {result.stats.situationRows}</span><span>Trend rows {result.stats.trendRows}</span></div></div> : null}
    </div>
  );
}
