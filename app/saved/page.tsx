import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readTab(searchParams: Record<string, string | string[] | undefined>) {
  const value = searchParams.tab;
  const tab = Array.isArray(value) ? value[0] : value;
  if (tab === "bets" || tab === "alerts") return tab;
  return "plays";
}

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full border border-aqua/30 bg-aqua/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-aqua"
          : "rounded-full border border-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 hover:text-slate-200"
      }
    >
      {label}
    </Link>
  );
}

function EmptyPanel({ title, body, ctaHref, ctaLabel }: { title: string; body: string; ctaHref: string; ctaLabel: string }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-6">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-aqua">Saved desk</div>
      <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-white">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{body}</p>
      <Link
        href={ctaHref}
        className="mt-5 inline-flex rounded-full border border-aqua/25 bg-aqua/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-aqua hover:bg-aqua/15"
      >
        {ctaLabel}
      </Link>
    </section>
  );
}

export default async function SavedPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const tab = readTab(resolved);

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.12),_transparent_32%),linear-gradient(145deg,rgba(2,6,23,0.98),rgba(15,23,42,0.94))] p-6 xl:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="text-[0.72rem] uppercase tracking-[0.28em] text-emerald-300">Saved</div>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white xl:text-4xl">
              Saved plays, tracked picks, watchlist, and alerts in one place.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
              This replaces separate My Bets, Watchlist, and Alerts pages. It stays lean until real tracked state is wired into this canonical route.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/65 p-4 text-sm leading-6 text-slate-400">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Route cleanup</div>
            <div className="mt-2 text-white">/bets → /saved?tab=bets</div>
            <div className="mt-1 text-white">/alerts → /saved?tab=alerts</div>
            <div className="mt-1 text-white">/watchlist → /saved</div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <TabLink label="Watchlist" href="/saved" active={tab === "plays"} />
        <TabLink label="Bets" href="/saved?tab=bets" active={tab === "bets"} />
        <TabLink label="Alerts" href="/saved?tab=alerts" active={tab === "alerts"} />
      </div>

      {tab === "bets" ? (
        <EmptyPanel title="Tracked bets live here now." body="Keep this as the canonical place for tracked picks, CLV, open/settled status, and result history. Do not reintroduce a separate My Bets nav destination." ctaHref="/accuracy" ctaLabel="Open accuracy" />
      ) : tab === "alerts" ? (
        <EmptyPanel title="Alert preferences live here now." body="Movement, threshold, and saved-play alerts should attach to this route. No fake SMS, fake email, or fake urgency labels." ctaHref="/sim" ctaLabel="Open SimHub" />
      ) : (
        <EmptyPanel title="Saved plays live here now." body="Pinned plays, watchlist items, and tracked opportunities should stay attached to model version, market state, and risk flags." ctaHref="/" ctaLabel="Open top plays" />
      )}
    </main>
  );
}
