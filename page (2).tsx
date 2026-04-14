'use client';

import { useMemo, useState } from 'react';
import { boardGames } from '@/lib/data';
import { TeamBadge } from '@/components/ui/team-badge';
import { ConfBar } from '@/components/ui/conf-bar';
import { ArrowDownRight, ArrowUpRight, Minus, Radio, Zap } from 'lucide-react';

function Move({ value }: { value: 'up' | 'down' | 'flat' }) {
  if (value === 'up') return <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />;
  if (value === 'down') return <ArrowDownRight className="h-3.5 w-3.5 text-rose-400" />;
  return <Minus className="h-3.5 w-3.5 text-slate-500" />;
}

export function LiveBoardPage() {
  const [league, setLeague] = useState<'ALL' | 'NBA' | 'MLB'>('ALL');
  const games = useMemo(() => league === 'ALL' ? boardGames : boardGames.filter((game) => game.league === league), [league]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow-blue">Live trading surface</div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-white">Board intelligence</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Dense game cards with line movement, sharp/public split, team media, simulation lean, and edge context built into one terminal-style board.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {['ALL', 'NBA', 'MLB'].map((item) => (
            <button key={item} onClick={() => setLeague(item as 'ALL' | 'NBA' | 'MLB')} className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] ${league === item ? 'border-sky-400/30 bg-sky-500/10 text-sky-400' : 'border-white/8 bg-white/[0.03] text-slate-400'}`}>{item}</button>
          ))}
        </div>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/6 px-5 py-4 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
          <Radio className="h-4 w-4 text-emerald-400" />
          {games.filter((g) => g.status === 'live').length} live now · {games.filter((g) => g.edgeLabel).length} active edges
        </div>
        <div className="grid gap-0">
          {games.map((game) => (
            <div key={game.id} className="border-b border-white/6 px-5 py-5 last:border-b-0">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={`mt-3 h-2.5 w-2.5 rounded-full ${game.status === 'live' ? 'bg-emerald-400 shadow-[0_0_16px_rgba(34,211,160,0.9)]' : 'bg-slate-600'}`} />
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3 text-[0.68rem] uppercase tracking-[0.2em] text-slate-500">
                      <span>{game.league}</span>
                      <span>{game.status === 'live' ? game.clock : game.clock}</span>
                      {game.injury ? <span className="text-amber-300">{game.injury}</span> : null}
                      {game.edgeLabel ? <span className="badge-blue">{game.edgeLabel}</span> : null}
                    </div>
                    <div className="grid gap-4">
                      <div className="flex items-center gap-4">
                        <TeamBadge code={game.away.code} logo={game.away.logo} name={game.away.name} size="lg" />
                        <div className="font-mono text-3xl font-bold text-white">{game.status === 'live' ? game.awayScore : game.simAwayWin + '%'}</div>
                        <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-slate-500">{game.awayRecord}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <TeamBadge code={game.home.code} logo={game.home.logo} name={game.home.name} size="lg" />
                        <div className="font-mono text-3xl font-bold text-white">{game.status === 'live' ? game.homeScore : game.simHomeWin + '%'}</div>
                        <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-slate-500">{game.homeRecord}</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid min-w-[320px] gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                    <div className="text-[0.62rem] uppercase tracking-[0.2em] text-slate-500">Spread</div>
                    <div className="mt-2 flex items-center gap-2 font-mono text-lg font-bold text-white">{game.spread}<Move value={game.spreadMove} /></div>
                  </div>
                  <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                    <div className="text-[0.62rem] uppercase tracking-[0.2em] text-slate-500">Total</div>
                    <div className="mt-2 flex items-center gap-2 font-mono text-lg font-bold text-white">{game.total}<Move value={game.totalMove} /></div>
                  </div>
                  <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                    <div className="text-[0.62rem] uppercase tracking-[0.2em] text-slate-500">Moneyline</div>
                    <div className="mt-2 font-mono text-lg font-bold text-white">{game.moneyline}</div>
                  </div>
                </div>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border border-white/6 bg-[#08121d] p-4">
                  <div className="flex items-center justify-between text-[0.62rem] uppercase tracking-[0.2em] text-slate-500">
                    <span>Sharp / public</span>
                    <span>{game.sharpPct}% / {game.publicPct}%</span>
                  </div>
                  <div className="mt-3"><ConfBar value={game.sharpPct} /></div>
                </div>
                <div className="rounded-2xl border border-white/6 bg-[#08121d] p-4">
                  <div className="flex items-center justify-between text-[0.62rem] uppercase tracking-[0.2em] text-slate-500">
                    <span>Model side</span>
                    <span>{Math.abs(game.simAwayWin - game.simHomeWin)} pt gap</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-sm text-white">
                    <Zap className="h-4 w-4 text-sky-400" />
                    {game.simAwayWin > game.simHomeWin ? `${game.away.code} projects stronger against market` : `${game.home.code} projects stronger against market`}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
