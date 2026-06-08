import type { MlbEliteBatterIntelligenceScore, MlbEliteBatterScoreRow } from "@/services/simulation/mlb-elite-batter-intelligence-score";

function num(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function label(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function toneForGrade(grade: string): "neutral" | "good" | "warn" | "bad" {
  if (grade === "A_PLUS" || grade === "A") return "good";
  if (grade === "B_PLUS" || grade === "B" || grade === "WATCH") return "warn";
  return "bad";
}

function Pill({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const cls = tone === "good"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
    : tone === "warn"
      ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
      : tone === "bad"
        ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
        : "border-white/10 bg-white/[0.045] text-slate-300";
  return <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${cls}`}>{text}</span>;
}

function ScoreTile({ label: title, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-2"><div className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">{title}</div><div className="mt-1 font-mono text-sm font-black text-white">{num(value, 1)}</div></div>;
}

function EliteCard({ row, title }: { row: MlbEliteBatterScoreRow; title: string }) {
  return (
    <article className="rounded-2xl border border-emerald-400/15 bg-[#06101b]/90 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-200">#{row.rank} · {title}</div>
          <div className="mt-1 font-display text-2xl font-black text-white">{row.playerName}</div>
          <div className="mt-1 text-xs text-slate-500">{row.team} · batting #{row.battingOrder} · confidence {num(row.confidence * 100, 0)}%</div>
        </div>
        <div className="text-right">
          <div className="font-display text-3xl font-black text-white">{num(row.score, 1)}</div>
          <Pill text={label(row.grade)} tone={toneForGrade(row.grade)} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <ScoreTile label="Box" value={row.componentScores.boxScore} />
        <ScoreTile label="Trait" value={row.componentScores.matchupTrait} />
        <ScoreTile label="PA" value={row.componentScores.plateAppearance} />
        <ScoreTile label="Base" value={row.componentScores.baseState} />
        <ScoreTile label="Conf" value={row.componentScores.confidence} />
        <ScoreTile label="Risk" value={row.componentScores.riskPenalty} />
      </div>
      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2 text-xs leading-5 text-slate-400">
        Line: H {num(row.expectedLine.hits, 2)} · TB {num(row.expectedLine.totalBases, 2)} · HR {num(row.expectedLine.homeRuns, 2)} · R {num(row.expectedLine.runs, 2)} · RBI {num(row.expectedLine.rbi, 2)} · K {num(row.expectedLine.strikeouts, 2)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {row.tags.slice(0, 4).map((tag) => <Pill key={`${row.playerId}-${tag}`} text={label(tag)} tone={tag === "RISK_TRAP" ? "bad" : tag === "CORE_BAT" ? "good" : "neutral"} />)}
      </div>
      {row.warnings.length ? <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-2 text-xs leading-5 text-rose-100">{row.warnings.slice(0, 2).join(" · ")}</div> : null}
    </article>
  );
}

function MiniList({ title, rows, tone }: { title: string; rows: MlbEliteBatterScoreRow[]; tone?: "neutral" | "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{title}</div><Pill text={String(rows.length)} tone={tone} /></div>
      <div className="grid gap-2">
        {rows.slice(0, 4).map((row) => <div key={`${title}-${row.playerId}`} className="flex items-center justify-between gap-3 text-xs"><div className="min-w-0"><span className="font-mono text-slate-500">#{row.rank}</span> <span className="font-semibold text-white">{row.playerName}</span> <span className="text-slate-500">{row.team}</span></div><div className="shrink-0 font-mono text-emerald-200">{num(row.score, 1)}</div></div>)}
        {!rows.length ? <div className="text-xs text-slate-500">No hitters in this bucket.</div> : null}
      </div>
    </div>
  );
}

export function EliteBatterBoard({ score }: { score: MlbEliteBatterIntelligenceScore }) {
  const top = score.overall[0];
  const second = score.overall[1];
  const third = score.overall[2];
  return (
    <section className="rounded-[1.6rem] border border-emerald-400/25 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_20rem),linear-gradient(135deg,rgba(6,16,27,0.94),rgba(2,8,15,0.94))] p-4 shadow-[0_22px_90px_rgba(0,0,0,0.34)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200">Fused intelligence board</div>
          <h2 className="font-display text-4xl font-black tracking-tight text-white">Elite Batter Board</h2>
          <div className="mt-1 text-sm leading-6 text-slate-400">{score.summary}</div>
        </div>
        <Pill text={score.modelVersion.replace("mlb-", "")} tone="good" />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {top ? <EliteCard row={top} title="Top overall" /> : null}
        {second ? <EliteCard row={second} title="Second overall" /> : null}
        {third ? <EliteCard row={third} title="Third overall" /> : null}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <MiniList title="Core bats" rows={score.coreBats} tone="good" />
        <MiniList title="Power ceiling" rows={score.powerCeiling} tone="warn" />
        <MiniList title="Run/RBI engines" rows={score.runRbiEngines} tone="good" />
        <MiniList title="Risk traps" rows={score.riskTraps} tone="bad" />
      </div>
    </section>
  );
}
