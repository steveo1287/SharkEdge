'use client';

import { useMemo, useState } from 'react';
import { trendRows } from '@/lib/data';
import { ConfBar } from '@/components/ui/conf-bar';
import { TrendingUp } from 'lucide-react';

const periods = {
  '7D': [9.6, 10.1, 10.8, 11.3, 11.9, 12.1, 12.4],
  '30D': [2.1, 4.3, 5.8, 7.2, 9.4, 10.2, 11.4, 12.4],
  '90D': [-1.2, 1.8, 4.2, 7.8, 10.2, 12.4, 14.8],
};

export function TrendsPageClient() {
  const [period, setPeriod] = useState<keyof typeof periods>('30D');
  const [league, setLeague] = useState<'ALL' | 'NBA' | 'MLB'>('ALL');
  const rows = useMemo(() => league === 'ALL' ? trendRows : trendRows.filter((row) => row.league === league), [league]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow-blue">Trend intelligence</div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-white">Institutional trend deck</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Ranked systems with confidence, ROI, sample quality, recency, and diagnostic notes instead of shallow trend badges.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['7D', '30D', '90D'] as const).map((value) => (
            <button key={value} onClick={() => setPeriod(value)} className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] ${period === value ? 'border-sky-400/30 bg-sky-500/10 text-sky-400' : 'border-white/8 bg-white/[0.03] text-slate-400'}`}>{value}</button>
          ))}
          {(['ALL', 'NBA', 'MLB'] as const).map((value) => (
            <button key={value} onClick={() => setLeague(value)} className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] ${league === value ? 'border-white/14 bg-white/[0.05] text-white' : 'border-white/8 bg-white/[0.03] text-slate-400'}`}>{value}</button>
          ))}
        </div>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/6 px-5 py-4 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500"><TrendingUp className="h-4 w-4 text-sky-400" />Performance curve</div>
        <div className="p-5">
          <div className="rounded-2xl border border-white/6 bg-[#08121d] p-5">
            <div className="flex h-[180px] items-end gap-3">
              {periods[period].map((value, index) => (
                <div key={index} className="flex flex-1 flex-col items-center gap-3">
                  <div className="text-[0.62rem] text-slate-500">{value > 0 ? '+' : ''}{value}%</div>
                  <div className={`w-full rounded-t-xl ${value >= 0 ? 'bg-gradient-to-t from-sky-600 to-sky-400' : 'bg-gradient-to-t from-rose-700 to-rose-400'}`} style={{ height: `${Math.max(12, Math.abs(value) * 10)}px` }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {rows.map((trend, index) => (
          <div key={trend.id} className="surface-panel overflow-hidden p-5">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-400/20 bg-sky-500/10 font-mono text-lg font-bold text-sky-400">#{index + 1}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge-dim">{trend.league}</span>
                  <span className="badge-blue">{trend.type}</span>
                  <span className="badge-green">{trend.direction}</span>
                </div>
                <h2 className="mt-3 text-lg font-semibold text-white">{trend.title}</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-5">
                  <div><div className="eyebrow">Record</div><div className="mt-2 font-mono text-lg font-bold text-white">{trend.record}</div></div>
                  <div><div className="eyebrow">Win%</div><div className="mt-2 font-mono text-lg font-bold text-emerald-400">{trend.winRate}%</div></div>
                  <div><div className="eyebrow">ROI</div><div className="mt-2 font-mono text-lg font-bold text-sky-400">{trend.roi}</div></div>
                  <div><div className="eyebrow">Sample</div><div className="mt-2 font-mono text-lg font-bold text-white">{trend.sample}</div></div>
                  <div><div className="eyebrow">Recency</div><div className="mt-2 font-mono text-lg font-bold text-white">{trend.recency}</div></div>
                </div>
                <div className="mt-5"><ConfBar value={trend.confidence} /></div>
                <div className="mt-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-500"><span>{trend.confidence} confidence</span><span>L10 {trend.l10.filter(Boolean).length}-{trend.l10.filter((v) => !v).length}</span></div>
                <div className="mt-4 rounded-2xl border border-white/6 bg-[#08121d] p-4 text-sm leading-6 text-slate-300">{trend.notes}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
