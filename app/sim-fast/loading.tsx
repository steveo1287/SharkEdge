export default function SimFastLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5 shadow-2xl shadow-black/30">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="h-3 w-24 animate-pulse rounded-full bg-white/10" />
            <div className="mt-3 h-8 w-44 animate-pulse rounded-xl bg-white/10" />
            <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded-full bg-white/10" />
          </div>
          <div className="hidden h-12 w-32 animate-pulse rounded-2xl bg-white/10 sm:block" />
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="h-3 w-20 animate-pulse rounded-full bg-white/10" />
            <div className="mt-3 h-7 w-16 animate-pulse rounded-xl bg-white/10" />
            <div className="mt-2 h-3 w-28 animate-pulse rounded-full bg-white/10" />
          </div>
        ))}
      </section>

      <section className="mt-6 space-y-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <article key={index} className="rounded-3xl border border-white/[0.07] bg-white/[0.018] p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="h-3 w-32 animate-pulse rounded-full bg-white/10" />
                <div className="mt-3 h-6 w-64 max-w-full animate-pulse rounded-xl bg-white/10" />
                <div className="mt-3 h-3 w-24 animate-pulse rounded-full bg-white/10" />
              </div>
              <div className="h-8 w-20 animate-pulse rounded-full bg-white/10" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="h-24 animate-pulse rounded-2xl bg-white/[0.055]" />
              <div className="h-24 animate-pulse rounded-2xl bg-white/[0.055]" />
              <div className="h-24 animate-pulse rounded-2xl bg-white/[0.055]" />
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
