'use client';

import { Bell, Search, Wifi, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const alerts = [
  'Sharp money on BOS -4.5 (78% consensus)',
  'Sim engine: NYY 61.2% win probability vs BAL',
  'Prop alert: Tatum rebounds +7.2% EV',
];

export function Topbar() {
  const [time, setTime] = useState(() => new Date());
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    const a = setInterval(() => setIdx((v) => (v + 1) % alerts.length), 4500);
    return () => {
      clearInterval(t);
      clearInterval(a);
    };
  }, []);

  const label = useMemo(() => time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), [time]);

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[#07111c]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1560px] items-center gap-4 px-4 py-3 md:px-6 xl:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            defaultValue="Search markets, players, teams, systems"
            aria-label="Search"
            className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
          />
        </div>
        <div className="hidden min-w-0 flex-[1.3] items-center gap-3 rounded-2xl border border-sky-400/10 bg-sky-500/[0.06] px-3 py-2 lg:flex">
          <Zap className="h-4 w-4 shrink-0 text-sky-400" />
          <div className="min-w-0 truncate text-xs font-medium text-slate-300">{alerts[idx]}</div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-400/12 bg-emerald-500/[0.06] px-3 py-2">
            <Wifi className="h-3.5 w-3.5 text-emerald-400" />
            <span>Live</span>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 font-mono">{label} ET</div>
          <button className="rounded-xl border border-white/8 bg-white/[0.03] p-2 text-slate-300">
            <Bell className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
