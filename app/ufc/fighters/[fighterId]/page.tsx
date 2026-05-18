import Link from "next/link";
import { notFound } from "next/navigation";

import { getCanonicalUfcFighterProfile } from "@/services/ufc/canonical-fighter-profile-query";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type PageProps = {
  params: Promise<{ fighterId: string }>;
};

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

function Mini({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-sm font-bold text-white">{value ?? "—"}</div>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{title}</div>
      <pre className="mt-3 max-h-[520px] overflow-auto rounded-2xl border border-white/10 bg-black/40 p-3 text-xs leading-5 text-slate-300">{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}

function TendencyBlock({ profile }: { profile: Awaited<ReturnType<typeof getCanonicalUfcFighterProfile>> }) {
  if (!profile) return null;
  return (
    <section className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.04] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Fighter tendencies</div>
          <div className="mt-2 text-2xl font-black text-white">{profile.tendencies.archetype ?? "No tendency profile"}</div>
          <div className="mt-1 text-sm text-slate-400">How this fighter tends to fight, separate from raw skill rating.</div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {profile.tendencies.confidence != null ? <span className={pill("cyan")}>confidence {profile.tendencies.confidence}</span> : null}
          {profile.tendencies.sourceQuality ? <span className={pill(profile.tendencies.sourceQuality === "A" || profile.tendencies.sourceQuality === "B" ? "green" : profile.tendencies.sourceQuality === "C" ? "amber" : "red")}>source {profile.tendencies.sourceQuality}</span> : null}
          {profile.tendencies.fallbackUsed ? <span className={pill("red")}>fallback used</span> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-4 xl:grid-cols-8">
        {profile.tendencies.topTendencies.map((item) => <Mini key={item.key} label={item.key} value={item.value} />)}
        {!profile.tendencies.topTendencies.length ? <div className="text-sm text-slate-400">Run tendency fill to populate style data.</div> : null}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <RuleList title="Preferred win conditions" items={profile.tendencies.preferredWinConditions} tone="green" />
        <RuleList title="Danger zones" items={profile.tendencies.dangerZones} tone="red" />
        <RuleList title="Opponent triggers" items={profile.tendencies.opponentTriggers} tone="cyan" />
      </div>
      {profile.tendencies.missingSignals.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {profile.tendencies.missingSignals.map((signal) => <span key={signal} className={pill("amber")}>missing {signal}</span>)}
        </div>
      ) : null}
    </section>
  );
}

function RuleList({ title, items, tone }: { title: string; items: string[]; tone: "green" | "red" | "cyan" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length ? items.map((item) => <span key={item} className={pill(tone)}>{item}</span>) : <span className="text-xs text-slate-500">None listed.</span>}
      </div>
    </div>
  );
}

export default async function UfcFighterDetailPage({ params }: PageProps) {
  const { fighterId } = await params;
  const profile = await getCanonicalUfcFighterProfile(decodeURIComponent(fighterId));
  if (!profile) notFound();
  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Canonical Fighter</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">{profile.fullName}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              {profile.nickname ? `“${profile.nickname}” · ` : ""}{profile.archetype} · {profile.weightClass ?? "Open Weight"} · {profile.stance ?? "stance unknown"}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <span className={pill(statusTone(profile.status))}>{profile.status.replaceAll("_", " ")}</span>
            <span className={pill(profile.grade === "A" || profile.grade === "B" ? "green" : profile.grade === "C" ? "amber" : "red")}>{profile.grade} / {profile.score}</span>
            <Link href="/ufc/fighters" className={pill("cyan")}>All fighters</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Mini label="Striking" value={profile.ratings.striking} />
        <Mini label="Wrestling" value={profile.ratings.wrestling} />
        <Mini label="Grappling" value={profile.ratings.grappling} />
        <Mini label="Durability" value={profile.ratings.durability} />
        <Mini label="Cardio" value={profile.ratings.cardio} />
        <Mini label="Fight IQ" value={profile.ratings.fightIq} />
      </section>

      <TendencyBlock profile={profile} />

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">What-if readiness</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={pill(profile.whatIfReady ? "green" : "red")}>{profile.whatIfReady ? "ready" : "blocked"}</span>
          {profile.supportedWeightClasses.map((weightClass) => <span key={weightClass} className={pill("slate")}>{weightClass}</span>)}
          {profile.evidenceFlags.map((flag) => <span key={flag} className={pill("cyan")}>{flag}</span>)}
        </div>
        {profile.blockingReasons.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {profile.blockingReasons.map((reason) => <span key={reason} className={pill("red")}>{reason}</span>)}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <JsonBlock title="Career stats" value={profile.careerStats} />
        <JsonBlock title="Eras" value={profile.eras} />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <JsonBlock title="Completeness" value={profile.completeness} />
        <JsonBlock title="Sources" value={profile.sources} />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <JsonBlock title="Fighter tendencies raw" value={profile.fighterTendencies} />
        <JsonBlock title="Style genome raw" value={profile.styleGenome} />
      </section>
      <JsonBlock title="Canonical profile raw" value={profile.canonicalProfile} />
    </main>
  );
}
