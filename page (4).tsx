'use client';

import { useMemo, useState } from 'react';
import { propRows } from '@/lib/data';
import { ConfBar } from '@/components/ui/conf-bar';
import { Sparkline } from '@/components/ui/sparkline';
import { Target } from 'lucide-react';

export function PropsPageClient() {
  const [sport, setSport] = useState<'ALL' | 'NBA' | 'MLB'>('ALL');
  const [minConf, setMinConf] = useState(0);
  const [sort, setSort] = useState<'EV' | 'Confidence'>('EV');

  const rows = useMemo(() => {
    return [...propRows]
      .filter((prop) => sport === 'ALL' || prop.sport === sport)
      .filter((prop) => prop.confidence >= minConf)
      .sort((a, b) => sort === 'EV' ? parseFloat(b.ev) - parseFloat(a.ev) : b.confidence - a.confidence);
  }, [sport, minConf, sort]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow-blue">Prop intelligence</div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-white">Player prop scanner</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Model-driven prop board with headshots, EV, fair price, recent form, and trend alignment in one clean surface.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {['ALL', 'NBA', 'MLB'].map((value) => (
            <button key={value} onClick={() => setSport(value as 'ALL' | 'NBA' | 'MLB')} className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] ${sport === value ? 'border-sky-400/30 bg-sky-500/10 text-sky-400' : 'border-white/8 bg-white/[0.03] text-slate-400'}`}>{value}</button>
          ))}
          <button onClick={() => setSort((v) => v === 'EV' ? 'Confidence' : 'EV')} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Sort {sort}</button>
          <button onClick={() => setMinConf(minConf === 70 ? 0 : 70)} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">{minConf === 70 ? 'All conf' : '70+ conf'}</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="surface-panel p-5"><div className="eyebrow">Total props</div><div className="mt-2 text-3xl font-bold text-white">{rows.length}</div></div>
        <div className="surface-panel p-5"><div className="eyebrow">High confidence</div><div className="mt-2 text-3xl font-bold text-emerald-400">{rows.filter((row) => row.confidence >= 70).length}</div></div>
        <div className="surface-panel p-5"><div className="eyebrow">Average EV</div><div className="mt-2 text-3xl font-bold text-sky-400">+{(rows.reduce((sum, row) => sum + parseFloat(row.ev), 0) / Math.max(rows.length, 1)).toFixed(1)}%</div></div>
        <div className="surface-panel p-5"><div className="eyebrow">Trend aligned</div><div className="mt-2 text-3xl font-bold text-emerald-400">{rows.filter((row) => row.trendSupport).length}</div></div>
      </div>

      <div className="grid gap-4">
        {rows.map((prop) => (
          <div key={prop.id} className="surface-panel overflow-hidden p-5">
            <div className="flex flex-wrap items-start gap-4">
              <img src={prop.image} alt={prop.player} className="h-16 w-16 rounded-2xl border border-white/10 object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-lg font-semibold text-white">{prop.player}</div>
                  <span className="badge-dim">{prop.team} · {prop.pos}</span>
                  <span className={prop.sharpLean === 'OVER' ? 'badge-green' : 'badge-red'}>{prop.sharpLean}</span>
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{prop.matchup}</div>
                <div className="mt-4 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                  <div className="grid gap-3 sm:grid-cols-5">
                    <div><div className="eyebrow">Prop</div><div className="mt-2 font-mono text-lg font-bold text-white">{prop.market}</div></div>
                    <div><div className="eyebrow">Line</div><div className="mt-2 font-mono text-lg font-bold text-white">{prop.line}</div></div>
                    <div><div className="eyebrow">Fair</div><div className="mt-2 font-mono text-lg font-bold text-sky-400">{prop.fair}</div></div>
                    <div><div className="eyebrow">EV</div><div className="mt-2 font-mono text-lg font-bold text-emerald-400">{prop.ev}</div></div>
                    <div><div className="eyebrow">L5 form</div><div className="mt-2"><Sparkline data={prop.l5} color={prop.sharpLean === 'OVER' ? '#22d3a0' : '#f05a5a'} /></div></div>
                  </div>
                  <div className="rounded-2xl border border-white/6 bg-[#08121d] p-4">
                    <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500"><Target className="h-4 w-4 text-sky-400" />Model confidence</div>
                    <div className="mt-3"><ConfBar value={prop.confidence} /></div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                      <span>{prop.confidence} confidence</span>
                      <span className={prop.trendSupport ? 'text-emerald-400' : 'text-slate-500'}>{prop.trendSupport ? 'Trend aligned' : 'No trend tailwind'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
