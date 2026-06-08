import type { MlbBatterPitcherReconciliation, MlbPitchingMatchupSummary, MlbSimulatedTeamPitchingBoxScore } from "@/services/simulation/mlb-simulated-pitching-box-score";

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function num(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function tone(value: string | null | undefined): "neutral" | "good" | "warn" | "bad" {
  if (value === "LOW" || value === "LONG") return "good";
  if (value === "MEDIUM" || value === "NORMAL") return "warn";
  if (value === "HIGH" || value === "SHORT") return "bad";
  return "neutral";
}

function Pill({ label, toneName = "neutral" }: { label: string; toneName?: "neutral" | "good" | "warn" | "bad" }) {
  const cls = toneName === "good"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
    : toneName === "warn"
      ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
      : toneName === "bad"
        ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
        : "border-white/10 bg-white/[0.045] text-slate-300";
  return <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${cls}`}>{label}</span>;
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div><div className="mt-1 font-display text-xl font-black tracking-tight text-white">{value}</div>{sub ? <div className="mt-1 text-[11px] text-slate-500">{sub}</div> : null}</div>;
}

function StaffCard({ staff }: { staff: MlbSimulatedTeamPitchingBoxScore }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div><div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Pitching line</div><h3 className="font-display text-2xl font-black tracking-tight text-white">{staff.team}</h3><div className="mt-1 text-xs text-slate-500">vs {staff.opponentTeam}</div></div>
        <div className="flex flex-wrap justify-end gap-2"><Pill label={`hook ${staff.exposure.earlyHookRisk}`} toneName={tone(staff.exposure.earlyHookRisk)} /><Pill label={`bullpen ${Math.round(staff.exposure.bullpenShareOfBattersFaced * 100)}% BF`} toneName={staff.exposure.bullpenShareOfBattersFaced >= 0.45 ? "warn" : "good"} /></div>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6"><Mini label="IP" value={num(staff.totals.inningsPitched, 2)} /><Mini label="BF" value={num(staff.totals.battersFaced, 1)} /><Mini label="R" value={num(staff.totals.earnedRuns, 2)} /><Mini label="H" value={num(staff.totals.hitsAllowed, 2)} /><Mini label="BB" value={num(staff.totals.walksAllowed, 2)} /><Mini label="K" value={num(staff.totals.strikeouts, 2)} /></div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-aqua/15 bg-aqua/[0.045] p-3"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-aqua">Starter</div><div className="mt-1 font-display text-lg font-black text-white">{staff.starter?.pitcherName ?? "Unavailable"}</div><div className="mt-1 text-xs leading-6 text-slate-400">{staff.starter?.summary ?? "No starter projection available."}</div></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Bullpen</div><div className="mt-1 font-display text-lg font-black text-white">{staff.bullpen.pitcherName}</div><div className="mt-1 text-xs leading-6 text-slate-400">{staff.bullpen.summary}</div></div>
      </div>
      <div className="mt-3 text-xs leading-6 text-slate-400">{staff.summary}</div>
    </div>
  );
}

export function PitchingSnapshot({ awayPitching, homePitching, matchup, reconciliation }: { awayPitching: MlbSimulatedTeamPitchingBoxScore; homePitching: MlbSimulatedTeamPitchingBoxScore; matchup: MlbPitchingMatchupSummary; reconciliation: MlbBatterPitcherReconciliation }) {
  return (
    <>
      <section className="rounded-[1.35rem] border border-aqua/20 bg-aqua/[0.045] p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Pitching + reconciliation</div><h2 className="font-display text-2xl font-black tracking-tight text-white">Staff Simulation</h2></div><Pill label={`${Math.round(reconciliation.overallAlignment * 100)}% aligned`} toneName={reconciliation.overallAlignment >= 0.95 ? "good" : reconciliation.overallAlignment >= 0.88 ? "warn" : "bad"} /></div><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"><Mini label="Runs" value={pct(reconciliation.runsAligned)} /><Mini label="Hits" value={pct(reconciliation.hitsAligned)} /><Mini label="TB" value={pct(reconciliation.totalBasesAligned)} /><Mini label="BB" value={pct(reconciliation.walksAligned)} /><Mini label="K" value={pct(reconciliation.strikeoutsAligned)} /><Mini label="HR" value={pct(reconciliation.homeRunsAligned)} /></div><div className="mt-3 text-sm leading-7 text-slate-300">{matchup.summary}</div><div className="mt-1 text-sm leading-7 text-slate-300">{reconciliation.summary}</div></section>
      <section className="grid gap-4 lg:grid-cols-2"><StaffCard staff={awayPitching} /><StaffCard staff={homePitching} /></section>
    </>
  );
}
