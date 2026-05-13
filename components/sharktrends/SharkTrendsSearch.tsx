"use client";

import { useState } from "react";

import type { SharkTrendTemplate } from "@/src/server/sharktrends/catalog";
import type { SharkTrendFilter } from "@/src/server/sharktrends/types";

import { SharkTrendsMatchesTable } from "./SharkTrendsMatchesTable";
import { SharkTrendsProofStack } from "./SharkTrendsProofStack";
import { SharkTrendsQualifiers } from "./SharkTrendsQualifiers";
import { SharkTrendsResultSummary } from "./SharkTrendsResultSummary";
import { SharkTrendsSplits } from "./SharkTrendsSplits";
import { SharkTrendsWarningBanner } from "./SharkTrendsWarningBanner";

type ApiState = { loading: boolean; error: string | null; backtest: any; qualifiers: any };

const DEFAULT_QUERY = "home favorites -140 to -180 since 2018";

function numberOrUndefined(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function SharkTrendsSearch({ templates }: { templates: SharkTrendTemplate[] }) {
  const [input, setInput] = useState(DEFAULT_QUERY);
  const [filters, setFilters] = useState<SharkTrendFilter>({ league: "MLB", marketType: "moneyline", side: "FAVORITE", homeAway: "HOME", favoriteMinAbsPrice: 140, favoriteMaxAbsPrice: 180, minDataQualityScore: 60 });
  const [state, setState] = useState<ApiState>({ loading: false, error: null, backtest: null, qualifiers: null });

  async function run(body: Record<string, unknown>) {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const backtestResponse = await fetch("/api/sharktrends/backtest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, includeMatches: true, limit: 100 })
      });
      const backtest = await backtestResponse.json();
      if (!backtest.ok) throw new Error(backtest.error ?? "Backtest failed");
      const qualifierResponse = await fetch("/api/sharktrends/qualifiers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filters: backtest.data.query.filters, daysAhead: 7 })
      });
      const qualifiers = await qualifierResponse.json();
      setFilters(backtest.data.query.filters);
      setState({ loading: false, error: null, backtest: backtest.data, qualifiers: qualifiers.data });
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : "SharkTrends request failed", backtest: null, qualifiers: null });
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-5 shadow-2xl shadow-cyan-950/20">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div>
            <label className="text-xs uppercase tracking-[0.24em] text-cyan-200">Natural language system</label>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-black/40 p-4 text-lg text-white outline-none ring-cyan-400/40 placeholder:text-slate-500 focus:ring-2"
              placeholder="Cubs at Wrigley as -165 favorites with wind out"
            />
          </div>
          <div className="flex items-end gap-3">
            <button
              onClick={() => run({ input })}
              disabled={state.loading}
              className="rounded-2xl bg-cyan-300 px-6 py-4 font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60"
            >
              {state.loading ? "Running..." : "Run Backtest"}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <input className="rounded-xl border border-slate-700 bg-black/30 px-3 py-2 text-sm text-white" placeholder="Team" value={filters.team ?? ""} onChange={(e) => setFilters({ ...filters, team: e.target.value || undefined })} />
          <select className="rounded-xl border border-slate-700 bg-black/30 px-3 py-2 text-sm text-white" value={filters.marketType ?? "moneyline"} onChange={(e) => setFilters({ ...filters, marketType: e.target.value as any })}>
            <option value="moneyline">Moneyline</option>
            <option value="spread">Spread</option>
            <option value="total">Total</option>
          </select>
          <select className="rounded-xl border border-slate-700 bg-black/30 px-3 py-2 text-sm text-white" value={filters.side ?? ""} onChange={(e) => setFilters({ ...filters, side: (e.target.value || undefined) as any })}>
            <option value="">Any side</option>
            <option value="FAVORITE">Favorite</option>
            <option value="UNDERDOG">Underdog</option>
            <option value="OVER">Over</option>
            <option value="UNDER">Under</option>
          </select>
          <button onClick={() => run({ filters })} disabled={state.loading} className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-60">
            Run Structured Filters
          </button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-4 xl:grid-cols-6">
          <select className="rounded-xl border border-slate-700 bg-black/30 px-3 py-2 text-sm text-white" value={filters.homeAway ?? "ALL"} onChange={(e) => setFilters({ ...filters, homeAway: e.target.value as any })}>
            <option value="ALL">Home/Away: All</option>
            <option value="HOME">Home only</option>
            <option value="AWAY">Road only</option>
          </select>
          <input className="rounded-xl border border-slate-700 bg-black/30 px-3 py-2 text-sm text-white" placeholder="Favorite min abs" value={filters.favoriteMinAbsPrice ?? ""} onChange={(e) => setFilters({ ...filters, favoriteMinAbsPrice: numberOrUndefined(e.target.value) })} />
          <input className="rounded-xl border border-slate-700 bg-black/30 px-3 py-2 text-sm text-white" placeholder="Favorite max abs" value={filters.favoriteMaxAbsPrice ?? ""} onChange={(e) => setFilters({ ...filters, favoriteMaxAbsPrice: numberOrUndefined(e.target.value) })} />
          <input className="rounded-xl border border-slate-700 bg-black/30 px-3 py-2 text-sm text-white" placeholder="Total max" value={filters.totalMax ?? ""} onChange={(e) => setFilters({ ...filters, totalMax: numberOrUndefined(e.target.value) })} />
          <input className="rounded-xl border border-slate-700 bg-black/30 px-3 py-2 text-sm text-white" placeholder="Days rest max" value={filters.daysRestMax ?? ""} onChange={(e) => setFilters({ ...filters, daysRestMax: numberOrUndefined(e.target.value) })} />
          <select className="rounded-xl border border-slate-700 bg-black/30 px-3 py-2 text-sm text-white" value={filters.travelSpot ?? ""} onChange={(e) => setFilters({ ...filters, travelSpot: (e.target.value || undefined) as any })}>
            <option value="">Any travel spot</option>
            <option value="home_stand">Home stand</option>
            <option value="road_trip">Road trip</option>
            <option value="home_to_road">Home to road</option>
            <option value="road_to_home">Road to home</option>
          </select>
          <input className="rounded-xl border border-slate-700 bg-black/30 px-3 py-2 text-sm text-white" placeholder="Venue / park" value={filters.venue ?? ""} onChange={(e) => setFilters({ ...filters, venue: e.target.value || undefined })} />
          <input className="rounded-xl border border-slate-700 bg-black/30 px-3 py-2 text-sm text-white" placeholder="Last game runs max" value={filters.previousRunsScoredMax ?? ""} onChange={(e) => setFilters({ ...filters, previousRunsScoredMax: numberOrUndefined(e.target.value) })} />
          <input className="rounded-xl border border-slate-700 bg-black/30 px-3 py-2 text-sm text-white" placeholder="Last 2 runs max" value={filters.lastTwoRunsScoredMax ?? ""} onChange={(e) => setFilters({ ...filters, lastTwoRunsScoredMax: numberOrUndefined(e.target.value) })} />
          <input className="rounded-xl border border-slate-700 bg-black/30 px-3 py-2 text-sm text-white" placeholder="Starter GS min" value={filters.starterRollingGameScoreMin ?? ""} onChange={(e) => setFilters({ ...filters, starterRollingGameScoreMin: numberOrUndefined(e.target.value) })} />
          <input className="rounded-xl border border-slate-700 bg-black/30 px-3 py-2 text-sm text-white" placeholder="Elo diff min" value={filters.eloDiffMin ?? ""} onChange={(e) => setFilters({ ...filters, eloDiffMin: numberOrUndefined(e.target.value) })} />
          <input className="rounded-xl border border-slate-700 bg-black/30 px-3 py-2 text-sm text-white" placeholder="Min quality" value={filters.minDataQualityScore ?? ""} onChange={(e) => setFilters({ ...filters, minDataQualityScore: numberOrUndefined(e.target.value) })} />
        </div>
      </section>

      {state.error && <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-100">{state.error}</div>}
      <SharkTrendsWarningBanner warnings={state.backtest?.warnings} />
      <SharkTrendsProofStack proof={state.backtest?.proof} />
      <SharkTrendsResultSummary result={state.backtest?.result} />
      <SharkTrendsSplits splits={state.backtest?.splits} />
      <SharkTrendsQualifiers qualifiers={state.qualifiers?.qualifiers ?? []} warnings={state.qualifiers?.warnings ?? []} />
      <SharkTrendsMatchesTable matches={state.backtest?.matches ?? []} />

      <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Preset catalog</p>
            <h2 className="text-xl font-semibold text-white">Trend templates</h2>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {templates.map((template) => (
            <button key={template.id} onClick={() => run({ filters: template.filters })} className="rounded-2xl border border-slate-800 bg-black/30 p-4 text-left transition hover:border-cyan-400/50 hover:bg-cyan-400/10">
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">{template.category}</div>
              <div className="mt-2 font-semibold text-white">{template.title}</div>
              <div className="mt-1 text-sm text-slate-400">{template.description}</div>
              {template.warning && <div className="mt-3 text-xs text-amber-300">{template.warning}</div>}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
