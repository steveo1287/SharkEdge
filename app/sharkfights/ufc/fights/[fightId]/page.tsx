import Link from "next/link";
import { notFound } from "next/navigation";

import { SharkFightDetailRibbon } from "@/components/ufc/sharkfight-sim-surface";
import { SharkFightsHeader, UfcFightIqPanel } from "@/components/ufc/sharkfights-ufc";
import { getUfcFightIqDetail } from "@/services/ufc/card-feed";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ fightId: string }>;
};

export default async function UfcFightPage({ params }: PageProps) {
  const { fightId } = await params;
  const fight = await getUfcFightIqDetail(fightId);
  if (!fight) notFound();

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-4xl gap-4">
        <SharkFightsHeader title={`${fight.fighters.fighterA.name ?? "Fighter A"} vs ${fight.fighters.fighterB.name ?? "Fighter B"}`} subtitle="Expanded SharkSim Fight IQ: pick, method paths, stat comparison, engine split, danger flags, and shadow status." />
        <Link href={`/sharkfights/ufc/cards/${fight.eventId}?fightId=${fight.fightId}`} className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">Back to card</Link>
        <SharkFightDetailRibbon fight={fight} />
        <UfcFightIqPanel fight={fight} />
      </div>
    </main>
  );
}
