'use client';

import { useMemo, useState } from 'react';
import { playerRows } from '@/lib/data';
import { Sparkline } from '@/components/ui/sparkline';

export function PlayersPageClient() {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(playerRows[0]?.id ?? '');
  const rows = useMemo(() => playerRows.filter((player) => `${player.name} ${player.team}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const selected = rows.find((player) => player.id === selectedId) ?? rows[0];

  return (
    <div className="grid gap-6">
      <div>
        <div className="eyebrow-blue">Player desk</div>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-white">Player profiles</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Searchable player workspace with headshots, hot streaks, prop exposure, and recent form.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="surface-panel overflow-hidden">
          <div className="border-b border-white/6 p-4">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search players" className="w-full rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500" />
          </div>
          <div className="divide-y divide-white/6">
            {rows.map((player) => (
              <button key={player.id} onClick={() => setSelectedId(player.id)} className={`flex w-full items-center gap-4 px-4 py-4 text-left ${selected?.id === player.id ? 'bg-sky-500/[0.08]' : 'bg-transparent'}`}>
                <img src={player.image} alt={player.name} className="h-12 w-12 rounded-2xl border border-white/10 object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{player.name}</div>
                  <div className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">{player.team} · {player.pos}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-bold text-emerald-400">{player.streak}</div>
                  <div className="text-[0.62rem] uppercase tracking-[0.2em] text-slate-500">streak</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {selected ? (
          <div className="grid gap-6">
            <div className="surface-panel p-6">
              <div className="flex flex-wrap items-start gap-5">
                <img src={selected.image} alt={selected.name} className="h-24 w-24 rounded-3xl border border-white/10 object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-bold text-white">{selected.name}</h2>
                    <span className="badge-green">{selected.status}</span>
                  </div>
                  <div className="mt-2 text-sm text-slate-400">{selected.team} · {selected.pos} · {selected.sport}</div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-4">
                    {selected.stats.map((stat) => (
                      <div key={stat.label} className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                        <div className="eyebrow">{stat.label}</div>
                        <div className="mt-2 font-mono text-2xl font-bold text-white">{stat.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-amber-400/18 bg-amber-500/[0.08] p-4">
                  <div className="eyebrow">Hot streak</div>
                  <div className="mt-2 font-mono text-xl font-bold text-amber-300">{selected.streak}</div>
                  <div className="mt-1 text-sm text-slate-300">{selected.streakLabel}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="surface-panel p-5">
                <div className="eyebrow-blue">Skill stack</div>
                <div className="mt-5 space-y-4">
                  {selected.skills.map((skill) => (
                    <div key={skill.label}>
                      <div className="mb-2 flex items-center justify-between text-sm"><span className="text-slate-400">{skill.label}</span><span className="font-mono text-white">{skill.value}</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/6"><div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400" style={{ width: `${skill.value}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="surface-panel p-5">
                <div className="eyebrow-blue">Last 10 trend</div>
                <div className="mt-5 rounded-2xl border border-white/6 bg-[#08121d] p-4">
                  <Sparkline data={selected.l10} color="#44a4ff" width={420} height={140} />
                </div>
              </div>
            </div>

            <div className="surface-panel overflow-hidden">
              <div className="border-b border-white/6 px-5 py-4 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Prop exposure</div>
              <div className="divide-y divide-white/6">
                {selected.props.map((prop) => (
                  <div key={prop.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white">{prop.market}</div>
                      <div className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">{prop.matchup}</div>
                    </div>
                    <div className="font-mono text-lg font-bold text-sky-400">{prop.fair}</div>
                    <div className="font-mono text-lg font-bold text-emerald-400">{prop.ev}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
