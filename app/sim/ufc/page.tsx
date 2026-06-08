import Link from "next/link";

import type { UfcCardSummary } from "@/services/ufc/card-feed";
import { getUfcCards } from "@/services/ufc/card-feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 35;

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

function isFeaturedCard(card: UfcCardSummary) {
  return card.fightCount > 0 && card.simulatedFightCount > 0;
}

function pill(tone: "aqua" | "green" | "amber" | "red" | "slate" = "slate") {
  const tones = {
    aqua: "border-aqua/25 bg-aqua/10 text-aqua",
    green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    red: "border-rose-300/25 bg-rose-300/10 text-rose-200",
    slate: "border-white/10 bg-white/[0.04] text-slate-300"
  };
  return `rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tones[tone]}`;
}

function navClass(active = false) {
  return active ? "rounded-full border border-aqua/30 bg-aqua/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-aqua" : "rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 hover:text-aqua";
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-2 py-2 text-center">
      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 font-display text-lg font-black text-white">{value}</div>
    </div>
  );
}

function CardGrid({ cards, emptyText }: { cards: UfcCardSummary[]; emptyText: string }) {
  if (!cards.length) return <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.035] p-5 text-sm leading-6 text-slate-400">{emptyText}</div>;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const complete = card.fightCount > 0 && card.simulatedFightCount >= card.fightCount;
        const partial = card.simulatedFightCount > 0 && !complete;
        const research = card.dataQualityGrade === "D";
        return (
          <Link key={card.eventId} href={`/sim/ufc/cards/${card.eventId}`} className="rounded-[1.2rem] border border-white/10 bg-[#06101b]/80 p-4 transition hover:border-aqua/35 hover:bg-aqua/[0.045]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-aqua">{dateLabel(card.eventDate)}</div>
                <div className="mt-1 font-display text-2xl font-black tracking-[-0.04em] text-white">{card.eventLabel}</div>
              </div>
              <span className={pill(research ? "red" : complete ? "green" : partial ? "amber" : "slate")}>{research ? "research" : complete ? "ready" : partial ? "partial" : "loaded"}</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <MiniStat label="Fights" value={card.fightCount} />
              <MiniStat label="Sims" value={card.simulatedFightCount} />
              <MiniStat label="Coverage" value={pct(card.simulatedFightCount, card.fightCount)} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2"><span className={pill(card.promotionKey === "mvp" ? "amber" : "aqua")}>{card.promotionName ?? "UFC"}</span><span className={pill("slate")}>{card.dataQualityGrade ?? "quality pending"}</span></div>
          </Link>
        );
      })}
    </div>
  );
}

export default async function UfcFightLabPage() {
  const cards = await getUfcCards({ includePast: true });
  const featuredCards = cards.filter(isFeaturedCard);
  const researchCards = cards.filter((card) => !isFeaturedCard(card));
  const fightCount = featuredCards.reduce((sum, card) => sum + card.fightCount, 0);
  const simCount = featuredCards.reduce((sum, card) => sum + card.simulatedFightCount, 0);

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-4">
        <section className="rounded-[1.2rem] border border-white/10 bg-white/[0.035] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h1 className="font-display text-3xl font-black tracking-[-0.05em] text-white">UFC Sim</h1><p className="mt-1 text-sm text-slate-500">Fight cards, sims, and fighter intelligence. Open a card for details.</p></div>
            <div className="flex flex-wrap gap-2"><Link href="/sim" className={navClass()}>SimHub</Link><Link href="/sim/ufc" className={navClass(true)}>UFC</Link><Link href="/sim/mlb" className={navClass()}>MLB</Link><Link href="/accuracy" className={navClass()}>Accuracy</Link></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2"><span className={pill(featuredCards.length ? "green" : "slate")}>{featuredCards.length} active cards</span><span className={pill(fightCount ? "aqua" : "slate")}>{fightCount} fights</span><span className={pill(simCount ? "green" : "slate")}>{simCount} sims</span><span className={pill("slate")}>{researchCards.length} research</span></div>
        </section>

        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3"><h2 className="font-display text-2xl font-black tracking-[-0.04em] text-white">Fight cards</h2></div>
          <CardGrid cards={featuredCards} emptyText="No simulated UFC cards yet. Run the UFC upcoming + operational sim workers." />
        </section>

        {researchCards.length ? (
          <section className="grid gap-3">
            <div className="flex items-center justify-between gap-3"><h2 className="font-display text-2xl font-black tracking-[-0.04em] text-white">Research cards</h2></div>
            <CardGrid cards={researchCards} emptyText="No research cards." />
          </section>
        ) : null}
      </div>
    </main>
  );
}
