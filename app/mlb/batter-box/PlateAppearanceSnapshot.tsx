import type { MlbGamePlateAppearanceScript, MlbHitterPlateAppearancePath, MlbPlateAppearanceNode } from "@/services/simulation/mlb-plate-appearance-game-script";

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function phaseLabel(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function toneForOutcome(value: string): "neutral" | "good" | "warn" | "bad" {
  if (value === "POWER" || value === "CONTACT_PLUS") return "good";
  if (value === "VOLATILE" || value === "WALK") return "warn";
  if (value === "STRIKEOUT_RISK") return "bad";
  return "neutral";
}

function Pill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const cls = tone === "good"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
    : tone === "warn"
      ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
      : tone === "bad"
        ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
        : "border-white/10 bg-white/[0.045] text-slate-300";
  return <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${cls}`}>{label}</span>;
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div><div className="mt-1 font-display text-xl font-black tracking-tight text-white">{value}</div>{sub ? <div className="mt-1 text-[11px] text-slate-500">{sub}</div> : null}</div>;
}

function WindowMini({ title, node }: { title: string; node: MlbPlateAppearanceNode }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{title}</div><div className="mt-1 font-semibold text-white">PA{node.paNumber} · inning {node.inning}</div><div className="mt-1 text-xs text-slate-400">{phaseLabel(node.pitchingPhase)} · {phaseLabel(node.bestOutcome)}</div><div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-300"><div>H <span className="font-mono text-white">{pct(node.hitProbability)}</span></div><div>HR <span className="font-mono text-white">{pct(node.homeRunProbability)}</span></div><div>K <span className="font-mono text-white">{pct(node.strikeoutProbability)}</span></div></div></div>;
}

function SummaryPathCard({ path }: { path: MlbHitterPlateAppearancePath }) {
  return (
    <div className="rounded-2xl border border-aqua/15 bg-[#06101b]/90 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-aqua">#{path.battingOrder} · {path.team}</div>
          <div className="mt-1 font-display text-lg font-black text-white">{path.playerName}</div>
        </div>
        <Pill label={`PA${path.bestPowerWindow.paNumber} power`} tone={toneForOutcome(path.bestPowerWindow.bestOutcome)} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-300">
        <div>Best H <span className="font-mono text-white">PA{path.bestHitWindow.paNumber}</span></div>
        <div>Best HR <span className="font-mono text-white">PA{path.bestPowerWindow.paNumber}</span></div>
        <div>Late PA <span className="font-mono text-white">{pct(path.latePaChance)}</span></div>
      </div>
      <div className="mt-2 text-xs leading-5 text-slate-500">{phaseLabel(path.bestPowerWindow.pitchingPhase)} · H {pct(path.bestPowerWindow.hitProbability)} · HR {pct(path.bestPowerWindow.homeRunProbability)} · K {pct(path.bestPowerWindow.strikeoutProbability)}</div>
    </div>
  );
}

function PathCard({ path }: { path: MlbHitterPlateAppearancePath }) {
  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-[#06101b]/84 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-aqua">#{path.battingOrder} · {path.team}</div><h3 className="mt-1 font-display text-xl font-black tracking-tight text-white">{path.playerName}</h3></div>
        <div className="flex flex-wrap justify-end gap-2"><Pill label={`${Math.round(path.latePaChance * 100)}% late PA`} tone={path.latePaChance >= 0.42 ? "good" : path.latePaChance >= 0.28 ? "warn" : "neutral