import Link from "next/link";

type SharkTrendsPausedPageProps = {
  alias?: string;
};

const primaryRoutes = [
  {
    href: "/baseball",
    label: "MLB Sim Lab",
    copy: "Primary workspace for MLB sides, totals, model calibration, pitcher context, and no-bet gates."
  },
  {
    href: "/sim/mlb",
    label: "MLB Detail Sims",
    copy: "Full game-level projection cards with market context and explanation drivers."
  },
  {
    href: "/sharkfights/ufc",
    label: "UFC Fight Sim",
    copy: "Fight-style modeling workspace for the next simulator-first product lane."
  },
  {
    href: "/accuracy",
    label: "Accuracy Ledger",
    copy: "Track predictions against final results so we tune from evidence, not vibes."
  }
];

const labRoutes = [
  { href: "/sharktrends/historical-audit", label: "Historical Audit" },
  { href: "/sharktrends/mlb-warehouse", label: "MLB Warehouse" },
  { href: "/api/sharktrends/coverage", label: "Coverage API" }
];

export function SharkTrendsPausedPage({ alias }: SharkTrendsPausedPageProps) {
  return (
    <main className="min-h-screen bg-[#071013] px-4 py-8 text-slate-100 sm:px-6 lg:px-10">
      <section className="mx-auto max-w-6xl space-y-8">
        <div className="rounded-[2rem] border border-cyan-300/15 bg-slate-950/80 p-6 shadow-2xl shadow-cyan-950/30 sm:p-8">
          <div className="inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
            Simulator-first mode
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.8fr] lg:items-end">
            <div>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-white sm:text-6xl">
                SharkTrends is hibernating while SharkEdge becomes a sharper simulator.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
                We are not deleting the trend lab. We are stopping the expensive trend warmups, background jobs,
                and homepage fetches until the historical/weather/odds warehouse is deep enough to support a real
                premium TrendsCenter-style product. Right now the money goes into MLB sim accuracy and UFC fight modeling.
              </p>
              {alias ? (
                <p className="mt-4 text-sm text-slate-500">
                  Compatibility route: <span className="font-mono text-slate-300">{alias}</span> now lands here instead of
                  running heavy trend queries during page load.
                </p>
              ) : null}
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Operating rule</div>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                No fake trend records. No premium-looking claims without premium-grade data. The lab stays available for
                audits and manual research, but automated heavy trend compute is opt-in only.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {primaryRoutes.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className="group rounded-3xl border border-white/10 bg-slate-950/70 p-5 transition hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-cyan-950/20"
            >
              <div className="text-sm font-semibold text-white group-hover:text-cyan-100">{route.label}</div>
              <p className="mt-3 text-sm leading-6 text-slate-400">{route.copy}</p>
            </Link>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6">
            <h2 className="font-display text-2xl font-semibold text-white">What got turned down</h2>
            <div className="mt-5 space-y-3 text-sm leading-6 text-slate-300">
              <p>Scheduled TrendsCenter cache refreshes are no longer automatic.</p>
              <p>Trend workers now skip unless explicitly enabled by environment variable.</p>
              <p>The global layout no longer fetches trend-center state on every page.</p>
              <p>NBA warehouse automation is manual while NBA is not an active product lane.</p>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6">
            <h2 className="font-display text-2xl font-semibold text-white">Research lab links</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              These stay available for manual audits and future premium rebuild work. They should not be treated as the
              main product until coverage and data quality justify it.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {labRoutes.map((route) => (
                <Link
                  key={route.href}
                  href={route.href}
                  className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-300/40 hover:text-cyan-100"
                >
                  {route.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}