import Link from "next/link";
import { notFound } from "next/navigation";

import { SharkFightsHeader, UfcFightIqPanel } from "@/components/ufc/sharkfights-ufc";
import { getUfcFightIqDetail } from "@/services/ufc/card-feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 35;

type PageProps = {
  params: Promise<{ fightId: string }>;
};

export default async function UfcFightLabFightPage({ params }: PageProps) {
  const { fightId } = await params;
  const fight = await getUfcFightIqDetail(fightId);
  if (!fight) notFound();

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-5xl gap-4">
        <SharkFightsHeader
          title={`${fight.fighters.fighterA.name ?? "Fighter A"} vs ${fight.fighters.fighterB.name ?? "Fighter B"}`}
          subtitle="Full UFC Fight Lab detail: fight-path reasoning, method probabilities, round distribution, feature comparison, and engine diagnostics."
        />
        <div className="flex flex-wrap gap-2">
          <Link href={`/sim/ufc/cards/${fight.eventId}?fightId=${fight.fightId}`} className="rounded-full border border-aqua/25 bg-aqua/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-aqua">Back to card</Link>
          <Link href="/sim/ufc" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">UFC Lab</Link>
          <Link href="/sim" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">Sim hub</Link>
        </div>
        <UfcFightIqPanel fight={fight} />
      </div>
    </main>
  );
}
