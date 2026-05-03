import Link from "next/link";
import { notFound } from "next/navigation";

import { SharkFightCardCockpit, SharkFightDetailRibbon } from "@/components/ufc/sharkfight-sim-surface";
import { SharkFightsHeader, UfcFightIqPanel, UfcFightList } from "@/components/ufc/sharkfights-ufc";
import { getUfcCardDetail, getUfcFightIqDetail } from "@/services/ufc/card-feed";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UfcCardPage({ params, searchParams }: PageProps) {
  const { eventId } = await params;
  const query = (await searchParams) ?? {};
  const fightId = typeof query.fightId === "string" ? query.fightId : null;
  const card = await getUfcCardDetail(eventId);
  if (!card) notFound();
  const selectedFightId = fightId ?? card.fights[0]?.fightId ?? null;
  const selectedFight = selectedFightId ? await getUfcFightIqDetail(selectedFightId) : null;

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-4">
        <SharkFightsHeader title={card.eventLabel} subtitle="Fight-by-fight SharkSim picks with cached ensemble output, UFCStats feature comparison, method lanes, and danger flags." />
        <div className="flex flex-wrap gap-2">
          <Link href="/sharkfights/ufc" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">Back to cards</Link>
          <span className="rounded-full border border-aqua/25 bg-aqua/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-aqua">{card.fightCount} fights</span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">{card.simulatedFightCount} simulated</span>
        </div>
        <SharkFightCardCockpit card={card} />
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_430px]">
          <div className="grid gap-3">
            <SharkFightDetailRibbon fight={selectedFight} />
            <UfcFightList card={card} selectedFightId={selectedFightId} />
          </div>
          <UfcFightIqPanel fight={selectedFight} />
        </section>
      </div>
    </main>
  );
}
