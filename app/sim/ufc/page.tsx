import Link from "next/link";

import { UfcPipelineStatusPanel } from "@/components/ufc/pipeline-status-panel";
import { SharkFightsHeader, UfcCardGrid } from "@/components/ufc/sharkfights-ufc";
import type { UfcCardSummary } from "@/services/ufc/card-feed";
import { getUfcCards } from "@/services/ufc/card-feed";
import { getUfcPipelineStatus } from "@/services/ufc/pipeline-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 35;

type ReadinessTone = "ready" | "warn" | "cold";

function pct(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function latestSim(cards: UfcCardSummary[]) {
  return cards
    .map((card) => card.lastSimulatedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

function nextDisplayCard(cards: UfcCardSummary[]) {
  const now = Date.now() - 12 * 60 * 60 * 1000;
  return [...cards]
    .filter((card) => new Date(card.eventDate).getTime() >= now)
    .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())[0]
    ?? cards[0]
    ?? null;
}

function readinessTone(args: { fightCount: number; simulatedFightCount: number; pendingSimCount: number }): ReadinessTone {
  if (args.fightCount === 0) return "cold";
  if (args.simulatedFightCount > 0 && args.pendingSimCount === 0) return "ready";
  if (args.simulatedFightCount > 0 || args.pendingSimCount > 0) return "warn";
  return "cold";
}

function toneClasses(tone: ReadinessTone) {
  if (tone === "ready") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
  if (tone === "warn") return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

function LabMetric({ label, value, sub, tone = "cold" }: { label: string; value: string | number; sub: string; tone?: ReadinessTone }) {
  return (
    <div className={`rounded-[1.2rem] border p-4 ${toneClasses(tone)}`}>
      <div className="text-[9px] font-black uppercase tracking-[0.18em] opacity-70">{label}</div>
      <div className="mt-2 font-display text-3xl font-black tracking-[-0.05em] text-white">{value}</div>
      <div className="mt-1 text-[11px] leading-4 opacity-75">{sub}</div>
    </div>
  );
}

function ProductRail({ cards }: { cards: UfcCardSummary[] }) {
  const fightCount = cards.reduce((sum, card) => sum + card.fightCount, 0);
  const simulatedFightCount = cards.reduce((sum, card) => sum + card.simulatedFightCount, 0);
  const pendingCount = Math.max(0, fightCount - simulatedFightCount);
  const resolvedShadowCount = cards.reduce((sum, card) => sum + card.shadowResolvedCount, 0);
  const targetCard = nextDisplayCard(cards);
  const tone = readinessTone({ fightCount, simulatedFightCount, pendingSimCount: pendingCount });
  const lastSim = latestSim(cards);

  return (
    <section className="rounded-[1.5rem] border border-aqua/15 bg-[radial-gradient(circle_at_top_right,rgba(0,210,255,0.14),transparent_18rem),rgba(255,255,255,0.035)] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-aqua">UFC Fight Lab</div>
          <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.06em] text-white">Fight simulation product surface</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            This is the sim-first UFC lane: card ingestion, feature readiness, method probabilities, fight paths, source audits, and model diagnostics. It does not rely on TrendsCenter-style historical trend storage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/sim" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">Sim hub</Link>
          {targetCard ? (
            <Link href={`/sim/ufc/cards/${targetCard.eventId}`} className="rounded-full border border-aqua/30 bg-aqua/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-aqua">Open target card</Link>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <LabMetric label="Cards" value={cards.length} sub={targetCard ? `Target: ${targetCard.eventLabel}` : "No card rows loaded"} tone={cards.length ? tone : "cold"} />
        <LabMetric label="Fights" value={fightCount} sub={`${pendingCount} pending simulation`} tone={fightCount ? tone : "cold"} />
        <LabMetric label="Sim coverage" value={pct(simulatedFightCount, fightCount)} sub={`${simulatedFightCount}/${fightCount} fights simulated`} tone={tone} />
        <LabMetric label="Shadow review" value={resolvedShadowCount} sub={`Last sim: ${dateLabel(lastSim)}`} tone={resolvedShadowCount ? "ready" : tone} />
      </div>
    </section>
  );
}

function ProductChecklist() {
  const items = [
    ["Fight cards", "Upcoming UFC cards and fights must be loaded before the lab can show value."],
    ["Feature hydration", "Each fighter needs feature pairs before the strongest model output is available."],
    ["SharkSim output", "Method, round, edge, and path summaries come from cached UFC predictions."],
    ["Source audit", "Card detail pages show provider agreement and source quality before trusting a pick."]
  ] as const;

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map(([title, text]) => (
        <div key={title} className="rounded-[1.2rem] border border-white/10 bg-white/[0.035] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-aqua">{title}</div>
          <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
        </div>
      ))}
    </section>
  );
}

export default async function UfcFightLabPage() {
  const [cards, status] = await Promise.all([getUfcCards({ includePast: true }), getUfcPipelineStatus()]);

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-4">
        <SharkFightsHeader
          title="UFC Fight Lab"
          subtitle="The SharkEdge fight-sim workspace: style matchups, method probabilities, fight-path reasoning, source audits, and pipeline readiness in one UFC lane."
        />
        <ProductRail cards={cards} />
        <UfcPipelineStatusPanel status={status} />
        <ProductChecklist />
        <UfcCardGrid cards={cards} />
      </div>
    </main>
  );
}
