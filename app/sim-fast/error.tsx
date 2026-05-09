"use client";

export default function SimFastError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col items-center justify-center px-6 text-center">
      <div className="rounded-3xl border border-red-500/20 bg-black/40 p-8 backdrop-blur-xl">
        <div className="text-xs font-bold uppercase tracking-[0.3em] text-red-400">Sim Hub</div>
        <h1 className="mt-4 text-3xl font-black text-white">Sim Hub failed to load</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          A bad simulation card or market snapshot caused the render to fail. Retry below, or return home while the feed refreshes.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-3 text-sm font-bold text-cyan-200"
          >
            Retry
          </button>
          <a
            href="/"
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-bold text-slate-300"
          >
            Home
          </a>
        </div>
      </div>
    </main>
  );
}
