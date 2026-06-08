import type { MlbPaWindowRanking, MlbPaWindowRankingRow } from "@/services/simulation/mlb-pa-window-ranking";

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function num(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function label(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function Pill({ label: text, tone = "neutral" }: { label: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const cls = tone === "good"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
    : tone === "warn"
      ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
      : tone === "bad"
        ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
        : "border-white/10 bg-white/[0.045] text-slate-300";
  return <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${cls}`}>{text}</span>;
}

function toneForRank(row: MlbPaWindowRankingRow) {
  if (row.category === "K_RISK_TRAP") return "bad";
  if (row.category === "BULLPEN_EXPOSURE" || row.category === "LATE_PA_UPSIDE") return "warn";
  return "good";
}

function RankingCard({ row, title }: { row: MlbPaWindowRankingRow; title: string }) {
  return (
    <article className="rounded-2xl border border-aqua/15 bg-[#06101b]/90 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-aqua">#{row.rank} · {title}</div>
          <div className="mt-1 font-display text-xl font-black text-white">{row.playerName}</div>
          <div className="mt-1 text-xs text-slate-500">{row.team} · batting #{row.battingOrder}</div>
        </div>
        <Pill label={label(row.category)} tone={toneForRank(row)} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-300">
        <div>Score <span className="font-mono text-white">{num(row.score, 3)}</span></div>
        <div>Late PA <span className="font-mono text-white">{pct(row.latePaChance)}</span></div>
        <div>BP <span className="font-mono text-white">{pct(row.bullpenExposureShare)}</span></div>
      </div>
      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2 text-xs leading-5 text-slate-400">
        Hit window: PA{row.bestHitWindow.paNumber}, inn {row.bestHitWindow.inning}, H {pct(row.bestHitWindow.hitProbability)} · Power window: PA{row.bestPowerWindow.paNumber}, HR {pct(row.bestPowerWindow.homeRunProbability)} · K peak: PA{row.highestStrikeoutRiskWindow.paNumber}, K {pct(row.highestStrikeoutRiskWindow.strikeoutProbability)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {row.drivers.slice(0, 3).map((driver) => <Pill key={`${row.playerId}-${title}-${driver}`} label={driver} />)}
      </div>
    </article>
  );
}

function MiniList({ title, rows, tone }: { title: string; rows: MlbPaWindowRankingRow[]; tone?: "neutral" | "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{title}</div>
        <Pill label={`${rows.length}`} tone={tone} />
      </div>
      <div className="grid gap-2">
        {rows.slice(0, 4).map((row) => (
          <div key={`${title}-${row.playerId}`} className="flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0"><span className="font-mono text-slate-500">#{row.rank}</span> <span className="font-semibold text-white">{row.playerName}</span> <span className="text-slate-500">{row.team}</span></div>
            <div className="shrink-0 font-mono text-aqua">{num(row.score, 2)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PaWindowRankingStrip({ ranking }: { ranking: MlbPaWindowRanking }) {
  const topOverall = ranking.overall[0];
  const topHit = ranking.bestHitWindows[0];
  const topPower = ranking.bestPowerWindows[0];
  const topLate = ranking.latePaUpside[0];
  return (
    <section className="rounded-[1.45rem] border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_18rem),rgba(6,16,27,0.82)] p-4 shadow-[0_18px_70px_rgba(0,0,0,0.24)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200">PA model recommendations</div>
          <h2 className="font-display text-3xl font-black tracking-tight text-white">Best PA Window Bats</h2>
          <div className="mt-1 text-sm leading-6 text-slate-400">{ranking.summary}</div>
        </div>
        <Pill label={ranking.modelVersion.replace("mlb-", "")} tone="good" />
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        {topOverall ? <RankingCard row={topOverall} title="Overall" /> : null}
        {topHit ? <RankingCard row={topHit} title="Hit window" /> : null}
        {topPower ? <RankingCard row={topPower} title="Power window" /> : null}
        {topLate ? <RankingCard row={topLate} title="Late PA" /> : null}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <MiniList title="Bullpen exposure" rows={ranking.bullpenExposureUpside} tone="warn" />
        <MiniList title="Safest contact" rows={ranking.safestContact} tone="good" />
        <MiniList title="K-risk traps" rows={ranking.kRiskTraps} tone="bad" />
        <MiniList title="Power windows" rows={ranking.bestPowerWindows} tone="warn" />
      </div>
    </section>
  );
}
