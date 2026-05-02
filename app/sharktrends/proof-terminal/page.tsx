import { buildTrendsCenterSnapshot } from "@/services/trends/trends-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RailKey = "ACTIONABLE" | "RESEARCH" | "WATCH" | "WAIT" | "PASS";
type Tone = "good" | "warn" | "bad" | "neutral";

const RAILS: Array<{
  key: RailKey;
  title: string;
  description: string;
  tone: Tone;
}> = [
  {
    key: "ACTIONABLE",
    title: "Actionable",
    description: "Verified proof, active qualifier, current price, and positive current edge.",
    tone: "good"
  },
  {
    key: "RESEARCH",
    title: "Research",
    description: "Promising live context, but needs a confirming input before promotion.",
    tone: "warn"
  },
  {
    key: "WATCH",
    title: "Watch",
    description: "Interesting setup, but proof or market quality is not strong enough yet.",
    tone: "neutral"
  },
  {
    key: "WAIT",
    title: "Wait",
    description: "Proof exists, but the current qualifier or price is not ready.",
    tone: "neutral"
  },
  {
    key: "PASS",
    title: "Pass",
    description: "Hard blocker, bad market state, or weak proof profile.",
    tone: "bad"
  }
];

function toneClass(tone: Tone) {
  if (tone === "good") return "border-emerald-400/20 bg-emerald-400/[0.06]";
  if (tone === "warn") return "border-amber-300/25 bg-amber-300/[0.06]";
  if (tone === "bad") return "border-red-400/20 bg-red-400/[0.06]";
  return "border-white/10 bg-slate-950/60";
}

function stateClass(state: string | null | undefined) {
  const value = String(state ?? "").toUpperCase();
  if (value === "ACTIONABLE") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (value === "RESEARCH") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (value === "WATCH") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (value === "WAIT") return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  if (value === "PASS") return "border-red-400/25 bg-red-400/10 text-red-200";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function proofClass(grade: string | null | undefined) {
  const value = String(grade ?? "").toUpperCase();
  if (value === "A") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (value === "B") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (value === "C") return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  return "border-amber-300/25 bg-amber-300/10 text-amber-100";
}

function unitsLabel(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value > 0 ? "+" : ""}${value}u`;
}

function pctLabel(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value > 0 ? "+" : ""}${value}%`;
}

function priceLabel(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "price needed";
  return value > 0 ? `+${value}` : String(value);
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function systemRows(snapshot: Awaited<ReturnType<typeof buildTrendsCenterSnapshot>>) {
  return (snapshot.allPromotionRows ?? []).map((row: any) => ({
    ...row,
    rowType: "system",
    displayId: row.id,
    eventLabel: `${row.league} · ${row.market}`,
    actionState: row.actionState ?? row.primaryAction ?? "WATCH",
    actionLabel: row.actionLabel ?? row.primaryAction ?? "WATCH",
    actionReason: row.actionReason ?? row.reason ?? "No action reason available.",
    sharkScore: row.sharkScore ?? row.score ?? 0
  }));
}

function matchupRows(snapshot: Awaited<ReturnType<typeof buildTrendsCenterSnapshot>>) {
  return (snapshot.matchupsByLeague ?? []).flatMap((group: any) =>
    (group.matchups ?? []).flatMap((matchup: any) =>
      (matchup.allTrends ?? matchup.trends ?? []).map((trend: any) => ({
        ...trend,
        rowType: "matchup",
        displayId: `${trend.id}:${matchup.id}`,
        league: group.league,
        eventLabel: matchup.eventLabel,
        actionState: trend.actionState ?? trend.primaryAction ?? "WATCH",
        actionLabel: trend.actionLabel ?? trend.primaryAction ?? "WATCH",
        actionReason: trend.actionReason ?? trend.reasons?.[0] ?? "No action reason available.",
        sharkScore: trend.sharkScore ?? trend.score ?? 0,
        href: trend.href ?? matchup.href
      }))
    )
  );
}

function Card({ item }: { item: any }) {
  const blockers = item.blockers ?? [];
  const proof = item.proof ?? {};

  return (
    <a href={item.href} className="block rounded-2xl border border-white/10 bg-black/25 p-4 hover:border-cyan-300/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{item.name}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{item.eventLabel}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${stateClass(item.actionState)}`}>{item.actionLabel}</span>
          <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">SharkScore {item.sharkScore}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${proofClass(proof.grade)}`}>Grade {proof.grade ?? "P"}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:grid-cols-5">
        <span>{proof.record ?? "Record TBD"}</span>
        <span>{unitsLabel(proof.profitUnits)}</span>
        <span>{pctLabel(proof.roiPct)} ROI</span>
        <span>{pctLabel(proof.clvPct)} CLV</span>
        <span>{item.price == null ? `${item.activeMatches ?? 0} live` : priceLabel(item.price)}</span>
      </div>

      <div className="mt-3 text-xs leading-5 text-slate-300">{item.actionReason}</div>
      <div className="mt-2 text-[11px] leading-5 text-cyan-100/75">{proof.summary ?? item.reason}</div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[9px] uppercase tracking-[0.12em] text-slate-500">
        <span>{item.verified ? "verified" : "provisional"}</span>
        <span>· {item.rowType}</span>
        {blockers.length ? blockers.slice(0, 4).map((blocker: string) => <span key={blocker}>· {blocker}</span>) : <span>· no hard blockers</span>}
      </div>
    </a>
  );
}

function Rail({ rail, items }: { rail: (typeof RAILS)[number]; items: any[] }) {
  return (
    <section className={`rounded-[1.5rem] border p-4 ${toneClass(rail.tone)}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{rail.title}</div>
          <h2 className="mt-1 text-xl font-semibold text-white">{items.length} item{items.length === 1 ? "" : "s"}</h2>
          <div className="mt-1 text-xs leading-5 text-slate-400">{rail.description}</div>
        </div>
        <div className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${stateClass(rail.key)}`}>{rail.key}</div>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {items.length ? items.slice(0, 8).map((item) => <Card key={`${rail.key}-${item.displayId}`} item={item} />) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-500">No items in this rail.</div>
        )}
      </div>
      {items.length > 8 ? <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">+{items.length - 8} more in JSON output</div> : null}
    </section>
  );
}

export default async function SharkTrendsProofTerminalPage() {
  const snapshot = await buildTrendsCenterSnapshot();
  const rows = [...systemRows(snapshot), ...matchupRows(snapshot)]
    .sort((left, right) => (right.sharkScore ?? 0) - (left.sharkScore ?? 0));

  const byState = RAILS.reduce<Record<RailKey, any[]>>((acc, rail) => {
    acc[rail.key] = rows.filter((row) => String(row.actionState ?? "").toUpperCase() === rail.key);
    return acc;
  }, {
    ACTIONABLE: [],
    RESEARCH: [],
    WATCH: [],
    WAIT: [],
    PASS: []
  });

  const allBlockers = unique(rows.flatMap((row) => row.blockers ?? []));
  const topScore = rows[0]?.sharkScore ?? 0;

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">SharkTrends Proof Terminal</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Proof-first action board</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              A focused SharkTrends terminal that ranks systems and matchup trend links by SharkScore, proof quality, live market quality, CLV, and blocker penalties.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <a href="/sharktrends" className="text-cyan-200 hover:text-cyan-100">Back to board</a>
            <a href="/api/trends/sharktrends" className="text-cyan-200 hover:text-cyan-100">Inspect JSON</a>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className={`rounded-2xl border p-4 ${toneClass("good")}`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Actionable</div>
          <div className="mt-2 font-display text-2xl font-semibold text-white">{byState.ACTIONABLE.length}</div>
          <div className="mt-2 text-xs leading-5 text-slate-400">Verified proof + current market quality.</div>
        </div>
        <div className={`rounded-2xl border p-4 ${toneClass("warn")}`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Research</div>
          <div className="mt-2 font-display text-2xl font-semibold text-white">{byState.RESEARCH.length}</div>
          <div className="mt-2 text-xs leading-5 text-slate-400">Needs confirming context.</div>
        </div>
        <div className={`rounded-2xl border p-4 ${toneClass("neutral")}`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Watch / Wait</div>
          <div className="mt-2 font-display text-2xl font-semibold text-white">{byState.WATCH.length + byState.WAIT.length}</div>
          <div className="mt-2 text-xs leading-5 text-slate-400">Useful but not ready for promotion.</div>
        </div>
        <div className={`rounded-2xl border p-4 ${toneClass("bad")}`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pass</div>
          <div className="mt-2 font-display text-2xl font-semibold text-white">{byState.PASS.length}</div>
          <div className="mt-2 text-xs leading-5 text-slate-400">Hard blockers or poor proof quality.</div>
        </div>
        <div className={`rounded-2xl border p-4 ${toneClass("neutral")}`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Top score</div>
          <div className="mt-2 font-display text-2xl font-semibold text-white">{topScore}</div>
          <div className="mt-2 text-xs leading-5 text-slate-400">Highest SharkScore in this snapshot.</div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Blocker map</div>
        <div className="mt-2 text-xs leading-5 text-slate-400">
          {allBlockers.length ? allBlockers.join(" · ") : "No hard blockers in this snapshot."}
        </div>
      </section>

      {RAILS.map((rail) => <Rail key={rail.key} rail={rail} items={byState[rail.key]} />)}
    </main>
  );
}
