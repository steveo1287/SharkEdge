import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, FlaskConical, Radio, Target, TrendingUp, Zap } from 'lucide-react';
import { boardGames, homeKpis, marketOverview, propRows, trendRows } from '@/lib/data';
import { TeamBadge } from '@/components/ui/team-badge';
import { ConfBar } from '@/components/ui/conf-bar';
import { Sparkline } from '@/components/ui/sparkline';

const perf = [2.1, 4.3, 5.8, 8.4, 9.1, 10.8, 12.1, 12.4];

function PanelHeader({ icon, label, href }: { icon: ReactNode; label: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/6 px-5 py-4">
      <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
        <span className="text-sky-400">{icon}</span>
        {label}
      </div>
      {href ? (
        <Link href={href} className="inline-flex items-center gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sky-400">
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      ) : null}
    </div>
  );
}

export function DashboardHome() {
  const topGames = boardGames.slice(0, 2);
  return (
    <div className="grid gap-6">
      <section className="surface-panel-strong relative overflow-hidden p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(68,164,255,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(209,172,99,0.08),transparent_22%)]" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-4xl">
            <div className="eyebrow-blue">Daily intel brief · Apr 14, 2026</div>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white xl:text-4xl">SharkEdge command center</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              <span className="font-semibold text-sky-400">3 high-confidence edges</span> across today&apos;s board. Sharp consensus is <span className="font-semibold text-white">78% on BOS -4.5</span>. The sim deck still makes NYY a <span className="font-semibold text-emerald-400">61.2% winner</span>, while Tatum rebounds remain the cleanest prop on the sheet at <span className="font-semibold text-emerald-400">+7.2% EV</span>.
            </p>
          </div>
          <div className="grid w-full max-w-[520px] grid-cols-2 gap-3 xl:grid-cols-4">
            {homeKpis.map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                <div className="text-[0.62rem] uppercase tracking-[0.24em] text-slate-500">{kpi.label}</div>
                <div className={`mt-1 text-2xl font-bold ${kpi.tone === 'green' ? 'text-emerald-400' : kpi.tone === 'amber' ? 'text-amber-300' : 'text-sky-400'}`}>{kpi.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {marketOverview.map((item) => (
          <div key={item.league} className="surface-panel p-5">
            <div className="flex items-center justify-between">
              <div className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{item.league}</div>
              <div className={`font-mono text-xs ${item.roi.startsWith('+') ? 'text-emerald-400' : item.roi === '—' ? 'text-slate-500' : 'text-rose-400'}`}>{item.roi}</div>
            </div>
            <div className="mt-4 text-3xl font-bold text-white">{item.edges}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">edges · {item.games} games</div>
            {item.avgConf > 0 ? <div className="mt-4"><ConfBar value={item.avgConf} /></div> : null}
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="surface-panel overflow-hidden">
          <PanelHeader icon={<TrendingUp className="h-4 w-4" />} label="Trend performance" href="/trends" />
          <div className="grid gap-6 p-5 lg:grid-cols-[1.4fr_0.8fr]">
            <div>
              <div className="text-3xl font-bold text-emerald-400">+12.4%</div>
              <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">30d ROI · 247 picks · +33.2u</div>
              <div className="mt-6 rounded-2xl border border-white/6 bg-[#08121d] p-4">
                <Sparkline data={perf} color="#44a4ff" width={520} height={120} />
              </div>
            </div>
            <div className="grid gap-3">
              {trendRows.slice(0, 3).map((trend, index) => (
                <div key={trend.id} className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-500/10 text-sm font-bold text-sky-400">#{index + 1}</div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{trend.title}</div>
                      <div className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">{trend.league} · {trend.record}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-emerald-400">{trend.winRate}% win</span>
                    <span className="text-sky-400">{trend.confidence} conf</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="surface-panel overflow-hidden">
          <PanelHeader icon={<FlaskConical className="h-4 w-4" />} label="Sim preview" href="/sim" />
          <div className="space-y-4 p-5">
            <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">BOS @ MIA · 10k runs</div>
              <div className="mt-4 grid gap-4">
                {topGames[0] ? (
                  <>
                    <div className="flex items-center gap-3">
                      <TeamBadge code={topGames[0].away.code} logo={topGames[0].away.logo} />
                      <div className="flex-1"><ConfBar value={topGames[0].simAwayWin} /></div>
                      <div className="font-mono text-sm font-bold text-white">{topGames[0].simAwayWin}%</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <TeamBadge code={topGames[0].home.code} logo={topGames[0].home.logo} />
                      <div className="flex-1"><ConfBar value={topGames[0].simHomeWin} /></div>
                      <div className="font-mono text-sm font-bold text-white">{topGames[0].simHomeWin}%</div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-slate-500">Spread lean</div>
                <div className="mt-2 font-mono text-xl font-bold text-white">BOS -4.5</div>
                <div className="mt-2 text-emerald-400">71 conf</div>
              </div>
              <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-slate-500">Total lean</div>
                <div className="mt-2 font-mono text-xl font-bold text-white">Over 212.5</div>
                <div className="mt-2 text-sky-400">58 conf</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="surface-panel overflow-hidden">
          <PanelHeader icon={<Zap className="h-4 w-4" />} label="Top edges" href="/board" />
          <div className="divide-y divide-white/6">
            {boardGames.map((game) => (
              <div key={game.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-400/18 bg-emerald-500/10 font-mono text-sm font-bold text-emerald-400">{Math.max(game.simAwayWin, game.simHomeWin)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{game.away.code} @ {game.home.code}</div>
                  <div className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">{game.edgeLabel ?? 'Watchlist'} · sharp {game.sharpPct}% · {game.clock}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-lg font-bold text-emerald-400">{game.spread}</div>
                  <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">{game.moneyline}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-6">
          <div className="surface-panel overflow-hidden">
            <PanelHeader icon={<Radio className="h-4 w-4" />} label="Live board" href="/board" />
            <div className="divide-y divide-white/6">
              {boardGames.slice(0, 3).map((game) => (
                <div key={game.id} className="flex items-center gap-3 px-5 py-4">
                  <div className={`h-2.5 w-2.5 rounded-full ${game.status === 'live' ? 'bg-emerald-400 shadow-[0_0_14px_rgba(34,211,160,0.7)]' : 'bg-slate-600'}`} />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-white">{game.away.code} @ {game.home.code}</div>
                    <div className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">{game.status === 'live' ? game.clock : game.league + ' · ' + game.clock}</div>
                  </div>
                  <div className="font-mono text-sm text-sky-400">{game.spread}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="surface-panel overflow-hidden">
            <PanelHeader icon={<Target className="h-4 w-4" />} label="Props spotlight" href="/props" />
            <div className="divide-y divide-white/6">
              {propRows.slice(0, 3).map((prop) => (
                <div key={prop.id} className="flex items-center gap-4 px-5 py-4">
                  <img src={prop.image} alt={prop.player} className="h-11 w-11 rounded-2xl border border-white/10 object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{prop.player}</div>
                    <div className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">{prop.market} · {prop.matchup}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-emerald-400">{prop.ev}</div>
                    <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">{prop.confidence} conf</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
