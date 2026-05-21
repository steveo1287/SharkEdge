"use client";

import { useEffect, useMemo, useState } from "react";

type ReadyFighter = {
  fighterId: string;
  fullName: string;
  nickname: string | null;
  status: string;
  whatIfReady: boolean;
  archetype: string;
  score: number;
  grade: string;
  weightClass: string | null;
  stance: string | null;
  blockingReasons: string[];
  activeRoster: {
    active: boolean;
    confidence: string | null;
    signals: string[];
    blockers: string[];
  };
  ratings: {
    striking: number | null;
    wrestling: number | null;
    grappling: number | null;
    durability: number | null;
    cardio: number | null;
    fightIq: number | null;
  };
  tendencies: {
    archetype: string | null;
    topTendencies: Array<{ key: string; value: number }>;
    preferredWinConditions: string[];
    dangerZones: string[];
    opponentTriggers: string[];
  };
};

type FighterSearchResponse = {
  ok: boolean;
  checkedAt: string;
  total: number;
  whatIfReadyCount: number;
  items: ReadyFighter[];
};

type WhatIfResult = {
  ok: boolean;
  generatedAt: string;
  modelVersion: string;
  scheduledRounds: 3 | 5;
  simulations: number;
  fighterA: {
    fullName: string;
    completenessScore: number;
    activeRoster: ReadyFighter["activeRoster"];
    blockers: string[];
  } | null;
  fighterB: {
    fullName: string;
    completenessScore: number;
    activeRoster: ReadyFighter["activeRoster"];
    blockers: string[];
  } | null;
  sim: {
    fighterAWinProbability: number;
    fighterBWinProbability: number;
    methodProbabilities: { KO_TKO: number; SUBMISSION: number; DECISION: number };
    roundFinishProbabilities: Record<string, number>;
    averageFightLengthSeconds: number;
    averageDamage: { fighterA: number; fighterB: number };
    averageControlSeconds: { fighterA: number; fighterB: number };
    averageKnockdowns: { fighterA: number; fighterB: number };
    pathSummary: string[];
    dangerFlags: string[];
    styleMatchup?: {
      fighterAStyle?: string;
      fighterBStyle?: string;
      summary?: string[];
    };
  } | null;
  warnings: string[];
  errors: string[];
};

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(1)}%`;
}

function num(value: number | null | undefined, digits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function prettyKey(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).trim();
}

function toneForScore(score: number) {
  if (score >= 82) return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (score >= 72) return "border-aqua/25 bg-aqua/10 text-aqua";
  return "border-amber-300/25 bg-amber-300/10 text-amber-100";
}

function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "aqua" | "green" | "amber" | "red" | "slate" }) {
  const tones = {
    aqua: "border-aqua/25 bg-aqua/10 text-aqua",
    green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    red: "border-rose-300/25 bg-rose-300/10 text-rose-200",
    slate: "border-white/10 bg-white/[0.04] text-slate-300"
  };
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tones[tone]}`}>{children}</span>;
}

function FighterCard({ fighter, side }: { fighter: ReadyFighter | null; side: "A" | "B" }) {
  if (!fighter) {
    return (
      <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Fighter {side}</div>
        <div className="mt-2 text-sm text-slate-400">Choose an active WHAT_IF_READY fighter.</div>
      </div>
    );
  }
  const topTendencies = fighter.tendencies.topTendencies.slice(0, 4);
  return (
    <div className={`rounded-[1.2rem] border p-4 ${toneForScore(fighter.score)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-75">Fighter {side}</div>
          <div className="mt-1 font-display text-2xl font-black tracking-[-0.04em] text-white">{fighter.fullName}</div>
          <div className="mt-1 text-xs opacity-80">{fighter.weightClass ?? "Weight TBD"} · {fighter.stance ?? "Stance TBD"}</div>
        </div>
        <Pill tone={fighter.activeRoster.active ? "green" : "amber"}>{fighter.grade} / {fighter.score}</Pill>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Pill tone="aqua">{fighter.archetype}</Pill>
        {fighter.tendencies.archetype ? <Pill tone="slate">{fighter.tendencies.archetype}</Pill> : null}
        <Pill tone={fighter.whatIfReady ? "green" : "amber"}>{fighter.whatIfReady ? "what-if ready" : "blocked"}</Pill>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Mini label="STR" value={fighter.ratings.striking} />
        <Mini label="WRE" value={fighter.ratings.wrestling} />
        <Mini label="IQ" value={fighter.ratings.fightIq} />
      </div>
      {topTendencies.length ? (
        <div className="mt-3 grid gap-1 text-xs text-slate-300">
          {topTendencies.map((item) => (
            <div key={item.key} className="flex justify-between gap-3">
              <span>{prettyKey(item.key)}</span>
              <span className="font-mono text-white">{item.value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-2 py-2">
      <div className="text-[9px] font-black uppercase tracking-[0.14em] opacity-60">{label}</div>
      <div className="mt-1 font-display text-lg font-black text-white">{num(value)}</div>
    </div>
  );
}

function ResultPanel({ result }: { result: WhatIfResult | null }) {
  if (!result) {
    return (
      <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4 text-sm leading-6 text-slate-400">
        Run a matchup to see win probability, method lane, round finish map, damage/control averages, path summary, and danger flags.
      </div>
    );
  }
  if (!result.ok || !result.sim) {
    return (
      <div className="rounded-[1.2rem] border border-rose-300/20 bg-rose-300/10 p-4 text-sm leading-6 text-rose-100">
        <div className="font-black uppercase tracking-[0.14em]">What-if blocked</div>
        {(result.errors.length ? result.errors : ["The active-roster what-if gate rejected this matchup."]).map((error) => <p key={error} className="mt-2">{error}</p>)}
      </div>
    );
  }
  const leaderA = result.sim.fighterAWinProbability >= result.sim.fighterBWinProbability;
  const leaderName = leaderA ? result.fighterA?.fullName ?? "Fighter A" : result.fighterB?.fullName ?? "Fighter B";
  const leaderProb = leaderA ? result.sim.fighterAWinProbability : result.sim.fighterBWinProbability;
  return (
    <div className="grid gap-4">
      <div className="rounded-[1.25rem] border border-aqua/20 bg-[radial-gradient(circle_at_top_right,rgba(0,210,255,0.14),transparent_16rem),rgba(255,255,255,0.045)] p-5">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Ensemble pick lane</div>
        <div className="mt-2 font-display text-4xl font-black tracking-[-0.06em] text-white">{leaderName}</div>
        <div className="mt-1 text-sm text-slate-400">{pct(leaderProb)} projected win probability · {result.simulations.toLocaleString()} sims · {result.scheduledRounds} rounds</div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <Bar label={result.fighterA?.fullName ?? "Fighter A"} value={result.sim.fighterAWinProbability} />
          <Bar label={result.fighterB?.fullName ?? "Fighter B"} value={result.sim.fighterBWinProbability} />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="KO/TKO" value={pct(result.sim.methodProbabilities.KO_TKO)} />
        <Metric label="Submission" value={pct(result.sim.methodProbabilities.SUBMISSION)} />
        <Metric label="Decision" value={pct(result.sim.methodProbabilities.DECISION)} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Avg length" value={`${Math.round(result.sim.averageFightLengthSeconds / 60)} min`} />
        <Metric label="Damage A/B" value={`${num(result.sim.averageDamage.fighterA, 1)} / ${num(result.sim.averageDamage.fighterB, 1)}`} />
        <Metric label="Control A/B" value={`${num(result.sim.averageControlSeconds.fighterA, 0)}s / ${num(result.sim.averageControlSeconds.fighterB, 0)}s`} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <InfoList title="Path to victory" items={result.sim.pathSummary.slice(0, 8)} tone="aqua" />
        <InfoList title="Danger flags" items={result.sim.dangerFlags.slice(0, 8)} tone="amber" empty="No major danger flags from the ensemble." />
      </div>
      {result.warnings.length ? <InfoList title="Warnings" items={result.warnings} tone="amber" /> : null}
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-xs text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-white">{pct(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-aqua" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-2xl font-black text-white">{value}</div>
    </div>
  );
}

function InfoList({ title, items, tone, empty = "No items." }: { title: string; items: string[]; tone: "aqua" | "amber"; empty?: string }) {
  return (
    <div className={`rounded-[1.2rem] border p-4 ${tone === "aqua" ? "border-aqua/15 bg-aqua/[0.045]" : "border-amber-300/15 bg-amber-300/[0.055]"}`}>
      <div className={`text-[10px] font-black uppercase tracking-[0.18em] ${tone === "aqua" ? "text-aqua" : "text-amber-200"}`}>{title}</div>
      <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-300">
        {items.length ? items.map((item) => <div key={item}>• {item}</div>) : <div className="text-slate-500">{empty}</div>}
      </div>
    </div>
  );
}

export function ActiveUfcWhatIfPanel() {
  const [fighters, setFighters] = useState<ReadyFighter[]>([]);
  const [query, setQuery] = useState("");
  const [fighterA, setFighterA] = useState("");
  const [fighterB, setFighterB] = useState("");
  const [rounds, setRounds] = useState<3 | 5>(3);
  const [simulations, setSimulations] = useState(10_000);
  const [loading, setLoading] = useState(false);
  const [loadingFighters, setLoadingFighters] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WhatIfResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingFighters(true);
      setError(null);
      try {
        const response = await fetch("/api/ufc/canonical-fighters?status=WHAT_IF_READY&limit=500", { cache: "no-store" });
        const json = await response.json() as FighterSearchResponse;
        if (!response.ok || !json.ok) throw new Error("Could not load active what-if fighters.");
        const ready = json.items.filter((fighter) => fighter.whatIfReady && fighter.activeRoster.active);
        if (cancelled) return;
        setFighters(ready);
        setFighterA((current) => current || ready[0]?.fighterId || "");
        setFighterB((current) => current || ready.find((fighter) => fighter.fighterId !== ready[0]?.fighterId)?.fighterId || "");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load fighters.");
      } finally {
        if (!cancelled) setLoadingFighters(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return fighters;
    return fighters.filter((fighter) => {
      return fighter.fullName.toLowerCase().includes(q)
        || (fighter.nickname ?? "").toLowerCase().includes(q)
        || (fighter.weightClass ?? "").toLowerCase().includes(q)
        || fighter.archetype.toLowerCase().includes(q)
        || (fighter.tendencies.archetype ?? "").toLowerCase().includes(q);
    });
  }, [fighters, query]);

  const selectedA = fighters.find((fighter) => fighter.fighterId === fighterA) ?? null;
  const selectedB = fighters.find((fighter) => fighter.fighterId === fighterB) ?? null;
  const canRun = Boolean(selectedA && selectedB && selectedA.fighterId !== selectedB.fighterId && !loading);

  async function runSim() {
    if (!canRun || !selectedA || !selectedB) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/ufc/what-if", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fighterA: selectedA.fighterId || slug(selectedA.fullName),
          fighterB: selectedB.fighterId || slug(selectedB.fullName),
          rounds,
          simulations
        })
      });
      const json = await response.json() as WhatIfResult;
      setResult(json);
      if (!response.ok || !json.ok) setError(json.errors?.[0] ?? "The what-if sim was blocked.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The what-if sim failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-[1.5rem] border border-fuchsia-300/15 bg-[radial-gradient(circle_at_top_left,rgba(217,70,239,0.12),transparent_18rem),radial-gradient(circle_at_bottom_right,rgba(0,210,255,0.12),transparent_20rem),rgba(255,255,255,0.035)] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-fuchsia-200">Active roster what-if</div>
          <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.06em] text-white">Build a fight between active UFC profiles</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            This uses the active-only canonical fighter gate. If a fighter is inactive, missing from the active warehouse, generic, or below profile quality, the sim blocks instead of making up a fantasy projection.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill tone={fighters.length ? "green" : "amber"}>{loadingFighters ? "loading fighters" : `${fighters.length} ready fighters`}</Pill>
          <Pill tone="slate">No inactive roster</Pill>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-4">
          <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
            <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Search active fighters
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Alex Pereira, Islam, Topuria..."
                className="rounded-2xl border border-white/10 bg-black/40 px-3 py-3 text-sm font-medium normal-case tracking-normal text-white outline-none transition placeholder:text-slate-600 focus:border-aqua/45"
              />
            </label>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Fighter A
                <select value={fighterA} onChange={(event) => setFighterA(event.target.value)} className="rounded-2xl border border-white/10 bg-black/40 px-3 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-aqua/45">
                  {filtered.map((fighter) => <option key={fighter.fighterId} value={fighter.fighterId}>{fighter.fullName} · {fighter.grade}/{fighter.score}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Fighter B
                <select value={fighterB} onChange={(event) => setFighterB(event.target.value)} className="rounded-2xl border border-white/10 bg-black/40 px-3 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-aqua/45">
                  {filtered.map((fighter) => <option key={fighter.fighterId} value={fighter.fighterId}>{fighter.fullName} · {fighter.grade}/{fighter.score}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Rounds
                <select value={rounds} onChange={(event) => setRounds(Number(event.target.value) === 5 ? 5 : 3)} className="rounded-2xl border border-white/10 bg-black/40 px-3 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-aqua/45">
                  <option value={3}>3 rounds</option>
                  <option value={5}>5 rounds</option>
                </select>
              </label>
              <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 md:col-span-2">
                Simulations
                <select value={simulations} onChange={(event) => setSimulations(Number(event.target.value))} className="rounded-2xl border border-white/10 bg-black/40 px-3 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-aqua/45">
                  <option value={1000}>1,000 quick</option>
                  <option value={10000}>10,000 balanced</option>
                  <option value={25000}>25,000 deep</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              disabled={!canRun}
              onClick={runSim}
              className="mt-4 w-full rounded-2xl border border-aqua/35 bg-aqua/15 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-aqua transition hover:bg-aqua/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-slate-600"
            >
              {loading ? "Running fight sim..." : "Run active UFC what-if"}
            </button>
            {selectedA?.fighterId === selectedB?.fighterId ? <div className="mt-3 text-xs text-amber-200">Choose two different fighters.</div> : null}
            {error ? <div className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-300/10 p-3 text-xs leading-5 text-rose-100">{error}</div> : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <FighterCard fighter={selectedA} side="A" />
            <FighterCard fighter={selectedB} side="B" />
          </div>
        </div>
        <ResultPanel result={result} />
      </div>
    </section>
  );
}
