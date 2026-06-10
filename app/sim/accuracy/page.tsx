import Link from "next/link";

export const revalidate = 3600;

function Card({ label, title, body, href, accent }: { label: string; title: string; body: string; href: string; accent: string }) {
  return (
    <Link href={href} className={`rounded-[1.75rem] border bg-slate-950/80 p-6 transition hover:-translate-y-0.5 hover:bg-slate-900/80 ${accent}`}>
      <div className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">{label}</div>
      <h2 className="mt-3 font-display text-3xl font-black tracking-[-0.05em] text-white">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
      <div className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-cyan-200">Open ledger →</div>
    </Link>
  );
}

export default function AccuracyHubPage() {
  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-6 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">Accuracy Hub</div>
        <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.06em] text-white">Separate proof ledgers</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          MLB and fight accuracy are no longer bundled into one combined record. Open the sport-specific ledger you want to audit.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card
          label="Baseball"
          title="MLB Accuracy"
          body="Moneyline, full-game over/under, first-five, and NRFI/YRFI. No fight rows are counted in this record."
          href="/sim/accuracy/mlb"
          accent="border-cyan-300/20 shadow-[0_24px_80px_rgba(14,165,233,0.10)]"
        />
        <Card
          label="Fights"
          title="UFC / MMA Accuracy"
          body="Settled fight-pick proof, calibration, CLV, Brier, and pass-discipline rows. No MLB markets are counted in this record."
          href="/accuracy/mma"
          accent="border-violet-300/20 shadow-[0_24px_80px_rgba(139,92,246,0.10)]"
        />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Rule</div>
        <div className="mt-2 text-lg font-bold text-white">No blended records.</div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          The hub does not calculate an overall SharkEdge record. That prevents MLB from hiding UFC performance, and UFC from hiding MLB market performance.
        </p>
      </section>
    </main>
  );
}
