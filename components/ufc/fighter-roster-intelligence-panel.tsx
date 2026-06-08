import { buildUfcCardRosterIntelligence, type UfcCardRosterIntelligence, type UfcRosterFighterIntelligence } from "@/services/ufc/fighter-roster-intelligence";
import type { UfcCardDetail } from "@/services/ufc/card-feed";

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${Math.round(value * 100)}%`;
}

function num(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function label(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function pillTone(value: string): "green" | "amber" | "red" | "slate" | "aqua" {
  if (["A_PLUS", "A", "PICK_SIDE", "DATA_READY", "ACTIVE_ROSTER"].includes(value)) return "green";
  if (["RISK", "DANGER_FLAG", "COLD_START", "SHADOW_ONLY"].includes(value)) return "red";
  if (["B", "WATCH", "FINISH_THREAT", "MARKET_EDGE", "DECISION_FLOOR"].includes(value)) return "amber";
  return "slate";
}

function pill(tone: "green" | "amber" | "red" | "slate" | "aqua" = "slate") {
  const tones = {
    aqua: "border-aqua/25 bg-aqua/10 text-aqua",
    green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    red: "border-rose-300/25 bg-rose-300/10 text-rose-200",
    slate: "border-white/10 bg-white/[0.04] text-slate-300"
  };
  return `rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tones[tone]}`;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 px-2 py-2 text-center"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div><div className="mt-1 font-display text-lg font-black text-white">{value}</div></div>;
}

function FighterCard({ row, title }: { row: UfcRosterFighterIntelligence; title: string }) {
  return (
    <article className="rounded-[1.15rem] border border-white/10 bg-[#06101b]/82 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-aqua">{title}</div>
          <div className="mt-1 font-display text-xl font-black tracking-[-0.04em] text-white">{row.fighterName}</div>
          <div className="mt-1 text-xs text-slate-500">vs {row.opponentName} · {row.cardSection ?? "card"}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-black text-white">{num(row.rosterScore, 1)}</div>
          <span className={pill(pillTone(row.grade))}>{label(row.grade)}</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat label="Win" value={pct(row.winProbability)} />
        <MiniStat label="Finish" value={pct(row.methodProfile.finishProbability)} />
        <MiniStat label="Conf" value={pct(row.confidence)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {row.tags.slice(0, 4).map((tag) => <span key={`${row.fighterId}-${tag}`} className={pill(pillTone(tag))}>{label(tag)}</span>)}
      </div>
      {row.warnings.length ? <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-2 text-xs leading-5 text-amber-100">{row.warnings.slice(0, 2).join(" · ")}</div> : null}
    </article>
  );
}

function Bucket({ title, rows, tone = "slate" }: { title: string; rows: UfcRosterFighterIntelligence[]; tone?: "green" | "amber" | "red" | "slate" | "aqua" }) {
  return (
    <div className="rounded-[1.05rem] border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2"><div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{title}</div><span className={pill(tone)}>{rows.length}</span></div>
      <div className="grid gap-2">
        {rows.slice(0, 4).map((row) => <div key={`${title}-${row.fighterId}-${row.fightId}`} className="flex items-center justify-between gap-3 text-xs"><div className="min-w-0"><span className="font-semibold text-white">{row.fighterName}</span> <span className="text-slate-500">{row.pickSide ? "pick" : "watch"}</span></div><div className="shrink-0 font-mono text-aqua">{num(row.rosterScore, 1)}</div></div>)}
        {!rows.length ? <div className="text-xs text-slate-500">No fighters in this bucket.</div> : null}
      </div>
    </div>
  );
}

export function UfcFighterRosterIntelligencePanel({ card, intelligence = buildUfcCardRosterIntelligence(card) }: { card: Pick<UfcCardDetail, "eventId" | "eventLabel" | "fights">; intelligence?: UfcCardRosterIntelligence }) {
  const top = intelligence.topFighters[0];
  const second = intelligence.topFighters[1];
  const third = intelligence.topFighters[2];
  return (
    <section className="rounded-[1.35rem] border border-aqua/20 bg-[radial-gradient(circle_at_top_left,rgba(0,210,255,0.14),transparent_18rem),rgba(255,255,255,0.04)] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Fighter roster intelligence</div>
          <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.06em] text-white">Roster Board</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{intelligence.summary}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Fighters" value={intelligence.fighterCount} />
          <MiniStat label="Active" value={intelligence.activeCount} />
          <MiniStat label="Risk" value={intelligence.riskCount} />
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {top ? <FighterCard row={top} title="Top roster read" /> : null}
        {second ? <FighterCard row={second} title="Second roster read" /> : null}
        {third ? <FighterCard row={third} title="Third roster read" /> : null}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Bucket title="Pick-side fighters" rows={intelligence.pickSideFighters} tone="green" />
        <Bucket title="Finish threats" rows={intelligence.finishThreats} tone="amber" />
        <Bucket title="Market edges" rows={intelligence.marketEdges} tone="aqua" />
        <Bucket title="Roster/data risks" rows={intelligence.riskFlags} tone="red" />
      </div>
    </section>
  );
}
