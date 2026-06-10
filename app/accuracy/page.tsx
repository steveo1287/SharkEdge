import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProductCardProps = {
  label: string;
  title: string;
  recordLabel: string;
  body: string;
  href: string;
  accent: "cyan" | "violet";
  bullets: string[];
};

const ACCENT = {
  cyan: {
    border: "border-cyan-300/25",
    glow: "shadow-[0_28px_100px_rgba(14,165,233,0.14)]",
    text: "text-cyan-200",
    bg: "bg-cyan-300/[0.07]"
  },
  violet: {
    border: "border-violet-300/25",
    glow: "shadow-[0_28px_100px_rgba(139,92,246,0.14)]",
    text: "text-violet-200",
    bg: "bg-violet-300/[0.07]"
  }
};

function ProductCard({ label, title, recordLabel, body, href, accent, bullets }: ProductCardProps) {
  const tone = ACCENT[accent];
  return (
    <Link href={href} className={`group rounded-[2rem] border ${tone.border} ${tone.glow} bg-slate-950/90 p-5 transition hover:-translate-y-1 hover:bg-slate-900/90`}>
      <div className="flex items-center justify-between gap-3">
        <div className={`rounded-full border ${tone.border} ${tone.bg} px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${tone.text}`}>{label}</div>
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Dedicated ledger</div>
      </div>
      <h2 className="mt-5 font-display text-3xl font-black tracking-[-0.06em] text-white">{title}</h2>
      <div className="mt-2 font-mono text-sm font-bold uppercase tracking-[0.14em] text-slate-300">{recordLabel}</div>
      <p className="mt-4 text-sm leading-6 text-slate-400">{body}</p>
      <div className="mt-5 grid gap-2">
        {bullets.map((bullet) => (
          <div key={bullet} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-slate-300">{bullet}</div>
        ))}
      </div>
      <div className={`mt-6 text-xs font-black uppercase tracking-[0.16em] ${tone.text}`}>Open {label} proof →</div>
    </Link>
  );
}

function Rule({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
}

export default function AccuracyPage() {
  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-slate-950 p-6 shadow-[0_0_80px_rgba(14,165,233,0.12)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">Accuracy V3 · separated</div>
            <h1 className="mt-4 font-display text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">Pick the ledger. Judge it clean.</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
              The old stacked accuracy dashboard is gone from this route. Baseball and fights now have separate proof surfaces so records, ROI, CLV, Brier, and pending rows cannot get mixed together.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-left lg:w-72">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Current rule</div>
            <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">No blended records</div>
            <p className="mt-2 text-xs leading-5 text-slate-400">MLB cannot hide UFC. UFC cannot hide MLB. Each product stands alone.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ProductCard
          label="MLB"
          title="Baseball Accuracy"
          recordLabel="Moneyline · O/U · F5 · NRFI/YRFI"
          body="Baseball proof reads the MLB snapshot ledger and expands each game into the markets we actually care about."
          href="/sim/accuracy/mlb"
          accent="cyan"
          bullets={[
            "Date audit for checking specific slates.",
            "Market-by-market record separation.",
            "Pending and missing settlement rows stay visible."
          ]}
        />
        <ProductCard
          label="UFC / MMA"
          title="Fight Accuracy"
          recordLabel="Winner picks · CLV · Brier · calibration"
          body="Fight proof reads the UFC/MMA settled ledger and keeps combat-sport calibration away from baseball results."
          href="/accuracy/mma"
          accent="violet"
          bullets={[
            "Resolved fight-pick record only.",
            "CLV and Brier are shown on the fight page.",
            "Pass-discipline rows stay in the MMA proof layer."
          ]}
        />
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Rule title="Separate records" body="Do not combine MLB markets and UFC picks into one win/loss number." />
        <Rule title="Separate proof" body="Each ledger has its own source data, settlement logic, and pending-row behavior." />
        <Rule title="Separate action" body="Open the exact sport before judging ROI, model accuracy, or calibration." />
      </section>

      <section className="rounded-[1.5rem] border border-rose-300/15 bg-rose-300/[0.05] p-5">
        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-200">Old dashboard removed here</div>
        <p className="mt-2 text-sm leading-6 text-rose-100/80">
          If this route still shows the old top-play dashboard after deployment, the hosted site is not serving the current main commit. This page has no import path to the old accuracy-dashboard service.
        </p>
      </section>
    </main>
  );
}
