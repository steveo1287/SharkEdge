import Link from "next/link";

import { gradeMlbOfficialVerdict, gradeMmaLedgerVerdict, summarizeVerdicts, type OfficialVerdict } from "@/services/decision/official-verdict";
import { buildSimCardViewModels } from "@/services/simulation/build-sim-card-view-model";
import { readSimCache, SIM_CACHE_KEYS, type SimMarketSnapshot, type SimPrioritySnapshot } from "@/services/simulation/sim-cache";
import { getUfcSettledLedger } from "@/services/ufc/settled-ledger";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

type VerdictSummary = ReturnType<typeof summarizeVerdicts>;

async function readMlbModels() {
  const [priority, market] = await Promise.all([
    readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority).catch(() => null),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market).catch(() => null)
  ]);
  const rows = priority?.rows ?? [];
  const edges = (market?.edges ?? []) as Parameters<typeof buildSimCardViewModels>[1];
  return {
    generatedAt: priority?.generatedAt ?? market?.generatedAt ?? null,
    lineCount: market?.lineCount ?? 0,
    models: buildSimCardViewModels(rows, edges)
  };
}

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

function when(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function pill(tone: "cyan" | "green" | "amber" | "red" | "slate" = "slate") {
  const tones = {
    cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-200",
    green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    red: "border-rose-300/25 bg-rose-300/10 text-rose-200",
    slate: "border-white/10 bg-white/[0.04] text-slate-300"
  };
  return `rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tones[tone]}`;
}

function verdictTone(verdict: OfficialVerdict) {
  if (verdict === "PLAY") return "green" as const;
  if (verdict === "LEAN") return "cyan" as const;
  if (verdict === "WATCH") return "amber" as const;
  if (verdict === "PASS") return "red" as const;
  return "slate" as const;
}

function Tile({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-3xl font-black tracking-[-0.06em] text-white">{value}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{sub}</p>
    </div>
  );
}

function VerdictBuckets({ summary }: { summary: VerdictSummary }) {
  const order: OfficialVerdict[] = ["PLAY", "LEAN", "WATCH", "PASS", "DATA_NOT_READY"];
  return (
    <div className="grid gap-2 sm:grid-cols-5">
      {order.map((verdict) => (
        <div key={verdict} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-center">
          <span className={pill(verdictTone(verdict))}>{verdict.replaceAll("_", " ")}</span>
          <div className="mt-2 font-display text-3xl font-black tracking-[-0.06em] text-white">{summary.counts[verdict]}</div>
        </div>
      ))}
    </div>
  );
}

function SportVerdictPanel({ sport, href, summary, generatedAt, line }: { sport: string; href: string; summary: VerdictSummary; generatedAt: string | null; line: string }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300/75">{sport}</div>
          <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.06em] text-white">Official verdict split</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{line}</p>
          <div className="mt-2 text-xs text-slate-500">Generated {when(generatedAt)}</div>
        </div>
        <Link href={href} className={pill("cyan")}>Open proof</Link>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Tile label="Official plays" value={summary.officialPlayEligibleCount} sub="Only these clear the strict PLAY gate." />
        <Tile label="Total graded" value={summary.total} sub="All rows the verdict engine reviewed." />
        <Tile label="Avg score" value={pct(summary.averageScore)} sub="100-point decision quality score." />
      </div>
      <div className="mt-4"><VerdictBuckets summary={summary} /></div>
    </section>
  );
}

function RuleCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
}

export default async function OfficialVerdictsPage() {
  const [mlb, mmaLedger] = await Promise.all([readMlbModels(), getUfcSettledLedger({ limit: 150 })]);
  const mlbSummary = summarizeVerdicts(mlb.models, gradeMlbOfficialVerdict);
  const mmaSummary = summarizeVerdicts(mmaLedger.rows, gradeMmaLedgerVerdict);

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-5">
        <section className="rounded-[1.75rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_20rem),rgba(2,6,12,0.94)] p-5 shadow-[0_0_80px_rgba(14,165,233,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">Official verdict engine</div>
              <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">Predictions are not picks.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                This is the discipline layer. The model can project everything, but only rows that clear data, market, confidence, edge, and pass-discipline gates become official PLAY candidates.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/accuracy/autopsy" className={pill("amber")}>Autopsy</Link>
              <Link href="/accuracy" className={pill("cyan")}>Proof center</Link>
              <Link href="/sim" className={pill("slate")}>SimHub</Link>
              <Link href="/baseball/readiness" className={pill("slate")}>MLB readiness</Link>
              <Link href="/sim/ufc" className={pill("slate")}>MMA lab</Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <SportVerdictPanel
            sport="MLB"
            href="/accuracy/mlb"
            summary={mlbSummary}
            generatedAt={mlb.generatedAt}
            line={`${mlb.models.length} MLB board rows graded from the cached SimHub board with ${mlb.lineCount} market lines.`}
          />
          <SportVerdictPanel
            sport="MMA"
            href="/accuracy/mma"
            summary={mmaSummary}
            generatedAt={mmaLedger.generatedAt}
            line={`${mmaLedger.rows.length} MMA shadow ledger rows graded from the settled fight proof layer.`}
          />
        </section>

        <section className="rounded-[1.5rem] border border-amber-300/15 bg-amber-300/[0.05] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Feedback loop</div>
              <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">Every miss needs a reason.</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-100/75">
                Verdicts decide what gets promoted. Autopsy explains what went wrong after settlement: model miss, data miss, market miss, or a play that should have stayed as a pass.
              </p>
            </div>
            <Link href="/accuracy/autopsy" className={pill("amber")}>Open autopsy loop</Link>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <RuleCard title="PLAY is scarce" body="PLAY requires strong score, no hard stops, real market context, and sport-specific thresholds. Most model output should be LEAN, WATCH, PASS, or DATA_NOT_READY." />
          <RuleCard title="Pass saves users" body="PASS and DATA_NOT_READY are not failures. They protect the record from stale odds, weak confidence, missing markets, and unsupported edges." />
          <RuleCard title="Autopsy closes the loop" body="The next proof layer studies misses and should-have-passed rows so the promotion gate gets stricter over time." />
        </section>
      </div>
    </main>
  );
}
