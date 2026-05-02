import Link from "next/link";

import { getNbaSimControl } from "@/services/simulation/nba-sim-control";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ gameId: string }>;
};

export default async function NbaControlPage({ params }: PageProps) {
  const { gameId } = await params;
  const snapshot = await getNbaSimControl(decodeURIComponent(gameId));

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">NBA Control Snapshot</div>
        <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">{snapshot.eventLabel}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Rotation certainty, player availability, calibration, and model-health data for this NBA matchup.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
          <Link href="/sim?league=NBA" className="text-cyan-200 hover:text-cyan-100">NBA sim</Link>
          <Link href={`/api/sim/nba-control?gameId=${encodeURIComponent(snapshot.gameId)}`} className="text-cyan-200 hover:text-cyan-100">API JSON</Link>
          <Link href="/sim/accuracy?league=NBA" className="text-cyan-200 hover:text-cyan-100">Accuracy</Link>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-300">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </section>
    </main>
  );
}
