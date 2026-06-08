import type { MlbBaseStateRunRbiEngine, MlbHitterBaseStateContext } from "@/services/simulation/mlb-base-state-run-rbi-engine";

function num(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function label(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function tone(value: string | boolean): "neutral" | "good" | "warn" | "bad" {
  if (value === true) return "bad";
  if (value === "HIGH") return "good";
  if (value === "MEDIUM") return "warn";
  if (value === "LOW") return "neutral";
  return "neutral";
}

function Pill({ text, toneName = "neutral" }: { text: string; toneName?: "neutral" | "good" | "warn" | "bad" }) {
  const cls = toneName === "good"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
    : toneName === "warn"
      ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
      : toneName === "bad"
        ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
        : "border-white/10 bg-white/[0.045] text-slate-300";
  return <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${cls}`}>{text}</span>;
}

function Mini({ title, rows, mode }: { title: string; rows: MlbHitterBaseStateContext[]; mode: "rbi" | "run" | "protect" | "trap" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{title}</div>
        <Pill text={String(rows.length)} toneName={mode === "trap" ? "bad" : "good"} />
      </div>
      <div className="grid gap-2">
        {rows.slice(0, 4).map((row) => (
          <div key={`${title}-${row.playerId}`} className="flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0"><span className="font-semibold text-white">{row.playerName}</span> <span className="text-slate-500">{row.team}</span></div>
            <div className="shrink-0 font-mono text-aqua">{mode === "rbi" ? num(row.rbiOpportunityScore, 2) : mode === "run" ? num(row.runScoringOpportunityScore, 2) : mode === "protect" ? num(row.lineupProtectionScore, 2) : "trap"}</div>
          </div>
        ))}
        {!rows.length ? <div className="text-xs text-slate-500">No flags in this matchup.</div> : null}
      </div>
    </div>
  );
}

function ContextCard({ row, title, mode }: { row: MlbHitterBaseStateContext; title: string; mode: "rbi" | "run" | "trap" }) {
  const mainWindow = mode === "run" ? row.bestRunWindow : row.bestRbiWindow;
  return (
    <article className="rounded-2xl border border-aqua/15 bg-[#06101b]/90 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-aqua">{title}</div>
          <div className="mt-1 font-display text-xl font-black text-white">{row.playerName}</div>
          <div className="mt-1 text-xs text-slate-500">{row.team} · #{row.battingOrder} · {label(row.lineupRole)}</div>
        </div>
        <Pill text={mode === "trap" ? "RBI trap" : mainWindow.rbiLeverage === "HIGH" || mainWindow.runLeverage === "HIGH" ? "high leverage" : "context"} toneName={mode === "trap" ? "bad" : tone(mode === "run" ? mainWindow.runLeverage : mainWindow.rbiLeverage)} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
        <div>Runs <span className="font-mono text-white">{num(row.expectedRunsBeforeContext, 2)}→{num(row.expectedRunsAfterContext, 2)}</span></div>
        <div>RBI <span className="font-mono text-white">{num(row.expectedRbiBeforeContext, 2)}→{num(row.expectedRbiAfterContext, 2)}</span></div>
        <div>RISP <span className="font-mono text-white">{pct(mainWindow.runnerInScoringPositionProbability)}</span></div>
        <div>Loaded <span className="font-mono text-white">{pct(mainWindow.basesLoadedProbability)}</span></div>
      </div>
      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2 text-xs leading-5 text-slate-400">PA{mainWindow.paNumber}, inning {mainWindow.inning}: {mainWindow.summary}</div>
      <div className="mt-3 flex flex-wrap gap-2">{row.drivers.slice(0, 3).map((driver) => <Pill key={`${row.playerId}-${driver}`} text={driver} />)}</div>
    </article>
  );
}

export function BaseStateContextStrip({ context }: { context: MlbBaseStateRunRbiEngine }) {
  const rbi = context.bestRbiWindows[0];
  const run = context.bestRunWindows[0];
  const trap = context.rbiTrapBats[0];
  return (
    <section className="rounded-[1.45rem] border border-amber-400/20 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.12),transparent_18rem),rgba(6,16,27,0.82)] p-4 shadow-[0_18px_70px_rgba(0,0,0,0.24)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200">Base-state layer</div>
          <h2 className="font-display text-3xl font-black tracking-tight text-white">Run/RBI Context</h2>
          <div className="mt-1 text-sm leading-6 text-slate-400">{context.summary}</div>
        </div>
        <Pill text={context.modelVersion.replace("mlb-", "")} toneName="warn" />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {rbi ? <ContextCard row={rbi} title="Best RBI window" mode="rbi" /> : null}
        {run ? <ContextCard row={run} title="Best run window" mode="run" /> : null}
        {trap ? <ContextCard row={trap} title="RBI trap bat" mode="trap" /> : <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-slate-400">No major RBI trap flagged in this matchup.</div>}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <Mini title="RBI windows" rows={context.bestRbiWindows} mode="rbi" />
        <Mini title="Run windows" rows={context.bestRunWindows} mode="run" />
        <Mini title="Protection boosts" rows={context.lineupProtectionBoosts} mode="protect" />
        <Mini title="RBI traps" rows={context.rbiTrapBats} mode="trap" />
      </div>
    </section>
  );
}
