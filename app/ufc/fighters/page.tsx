import Link from "next/link";

import { getCanonicalUfcFighterProfiles, type CanonicalFighterProfileSummary } from "@/services/ufc/canonical-fighter-profile-query";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function param(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function intParam(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function pill(tone: "green" | "amber" | "red" | "cyan" | "slate" = "slate") {
  const tones = {
    green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    red: "border-rose-300/25 bg-rose-300/10 text-rose-200",
    cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-200",
    slate: "border-white/10 bg-white/[0.04] text-slate-300"
  };
  return `rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tones[tone]}`;
}

function statusTone(status: string) {
  if (status === "WHAT_IF_READY") return "green" as const;
  if (status === "RESEARCH_ONLY") return "amber" as const;
  if (status === "NEEDS_REPAIR" || status === "NO_CANONICAL_PROFILE") return "red" as const;
  return "slate" as const;
}

function Stat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function FighterCard({ fighter }: { fighter: CanonicalFighterProfileSummary }) {
  const href = `/ufc/fighters/${encodeURIComponent(fighter.fighterId || slug(fighter.fullName))}`;
  return (
    <Link href={href} className="block rounded-2xl border border-white/10 bg-slate-950/70 p-4 transition hover:border-cyan-300/40 hover:bg-slate-900/80">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{fighter.archetype}</div>
          <div className="mt-1 text-lg font-black text-white">{fighter.fullName}</div>
          <div className="mt-1 text-xs text-slate-400">{fighter.nickname ? `“${fighter.nickname}” · ` : ""}{fighter.weightClass ?? "Open Weight"} · {fighter.stance ?? "stance unknown"}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <span className={pill(statusTone(fighter.status))}>{fighter.status.replaceAll("_", " ")}</span>
          <span className={pill(fighter.grade === "A" || fighter.grade === "B" ? "green" : fighter.grade === "C" ? "amber" : "red")}>{fighter.grade} / {fighter.score}</span>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-6">
        <Mini label="Str" value={fighter.ratings.striking ?? "—"} />
        <Mini label="Wrs" value={fighter.ratings.wrestling ?? "—"} />
        <Mini label="Grp" value={fighter.ratings.grappling ?? "—"} />
        <Mini label="Dur" value={fighter.ratings.durability ?? "—"} />
        <Mini label="Car" value={fighter.ratings.cardio ?? "—"} />
        <Mini label="IQ" value={fighter.ratings.fightIq ?? "—"} />
      </div>
      <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Tendency profile</div>
            <div className="mt-1 text-sm font-bold text-white">{fighter.tendencies.archetype ?? "No tendency profile"}</div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {fighter.tendencies.confidence != null ? <span className={pill("cyan")}>conf {fighter.tendencies.confidence}</span> : null}
            {fighter.tendencies.sourceQuality ? <span className={pill(fighter.tendencies.sourceQuality === "A" || fighter.tendencies.sourceQuality === "B" ? "green" : fighter.tendencies.sourceQuality === "C" ? "amber" : "red")}>source {fighter.tendencies.sourceQuality}</span> : null}
            {fighter.tendencies.fallbackUsed ? <span className={pill("red")}>fallback</span> : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {fighter.tendencies.topTendencies.slice(0, 5).map((item) => <span key={item.key} className={pill("slate")}>{item.key}: {item.value}</span>)}
          {!fighter.tendencies.topTendencies.length ? <span className="text-xs text-slate-500">Run tendency fill to populate style data.</span> : null}
        </div>
        {fighter.tendencies.preferredWinConditions.length ? <div className="mt-2 flex flex-wrap gap-2">{fighter.tendencies.preferredWinConditions.slice(0, 4).map((item) => <span key={item} className={pill("green")}>{item}</span>)}</div> : null}
      </div>
      {fighter.blockingReasons.length || fighter.genericDefaultFields.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {[...fighter.blockingReasons, ...fighter.genericDefaultFields.map((item) => `generic:${item}`)].slice(0, 8).map((item) => <span key={item} className={pill("red")}>{item}</span>)}
        </div>
      ) : null}
    </Link>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-sm font-bold text-white">{value}</div>
    </div>
  );
}

export default async function UfcFightersPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const status = param(resolved, "status") ?? "all";
  const q = param(resolved, "q") ?? "";
  const limit = intParam(param(resolved, "limit"), 250, 1, 1000);
  const report = await getCanonicalUfcFighterProfiles({ status, q, limit });
  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Canonical UFC Fighters</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Permanent fighter profiles</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              These profiles live outside any single fight card. They show whether a fighter is ready for what-if simulations, still research-only, or blocked by missing/generic data.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/accuracy/ufc-profile-qa" className={pill("cyan")}>Profile QA</Link>
            <Link href="/sim/ufc" className={pill("cyan")}>UFC lab</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Stat label="Profiles" value={report.total} note="Canonical fighter profiles returned by the current filter." />
        <Stat label="What-if ready" value={report.whatIfReadyCount} note="Can be reused outside scheduled fights." />
        <Stat label="Needs repair" value={report.needsRepairCount} note="Blocked by missing or generic profile data." />
        <Stat label="Tendencies" value={report.tendencyFilledCount} note="Profiles with stored style/tendency data." />
        <Stat label="Fallback style" value={report.tendencyFallbackCount} note="Tendencies built with missing signals or fallback sources." />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <div className="flex flex-wrap gap-2">
          <Link className={pill(status === "all" ? "cyan" : "slate")} href="/ufc/fighters">All</Link>
          <Link className={pill(status === "WHAT_IF_READY" ? "green" : "slate")} href="/ufc/fighters?status=WHAT_IF_READY">What-if ready</Link>
          <Link className={pill(status === "RESEARCH_ONLY" ? "amber" : "slate")} href="/ufc/fighters?status=RESEARCH_ONLY">Research only</Link>
          <Link className={pill(status === "NEEDS_REPAIR" ? "red" : "slate")} href="/ufc/fighters?status=NEEDS_REPAIR">Needs repair</Link>
        </div>
      </section>

      <section className="grid gap-4">
        {report.items.length ? report.items.map((fighter) => <FighterCard key={fighter.fighterId} fighter={fighter} />) : <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 text-sm text-slate-400">No canonical profiles found. Run the canonical profile builder first.</div>}
      </section>
    </main>
  );
}
