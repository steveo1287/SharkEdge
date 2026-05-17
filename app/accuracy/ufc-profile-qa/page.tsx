import Link from "next/link";

import { getUfcFighterProfileQaReport, type UfcFighterProfileQaItem } from "@/services/ufc/fighter-profile-qa";

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

function numberParam(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function when(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
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

function toneForStatus(status: string) {
  if (status === "OK") return "green" as const;
  if (status === "WATCH" || status === "CREDENTIAL_READY_RERUN") return "amber" as const;
  if (status === "REPAIR_NOW" || status === "NO_FEATURE") return "red" as const;
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

function FighterCard({ item }: { item: UfcFighterProfileQaItem }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.eventLabel} · {item.side}</div>
          <div className="mt-1 text-lg font-black text-white">{item.fighterName}</div>
          <div className="mt-1 text-xs text-slate-400">vs {item.opponentName} · {when(item.fightDate)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={pill(toneForStatus(item.profileStatus))}>{item.profileStatus.replaceAll("_", " ")}</span>
          <span className={pill(item.profileGrade === "A" || item.profileGrade === "B" ? "green" : item.profileGrade === "C" ? "amber" : "red")}>{item.profileGrade} / {item.profileScore}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-4">
        <Mini label="Sample" value={`${item.sample.proFights ?? "—"}/${item.sample.ufcFights ?? "—"}/${item.sample.roundsFought ?? "—"}`} />
        <Mini label="TD / Control" value={`${item.keyStats.takedownsPer15 ?? "—"} / ${item.keyStats.controlTimePct ?? "—"}`} />
        <Mini label="Cold" value={item.coldStartActive ? "yes" : "no"} />
        <Mini label="Source" value={item.source ?? "none"} />
      </div>

      <div className="mt-4 text-sm leading-6 text-slate-300">{item.recommendedAction}</div>

      {item.matchedCredentialPriors.length ? (
        <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Credential priors matched</div>
          <div className="mt-2 grid gap-2">
            {item.matchedCredentialPriors.map((prior) => (
              <div key={prior.id} className="text-xs leading-5 text-slate-300">
                <span className="font-black text-white">{prior.id}</span> · confidence {prior.confidence} · keys {prior.keys.slice(0, 6).join(", ")}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {item.appliedCredentialPriors.length ? (
        <div className="mt-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.04] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">Credential priors applied</div>
          <div className="mt-2 grid gap-2">
            {item.appliedCredentialPriors.map((prior, index) => (
              <div key={`${prior.id}-${index}`} className="text-xs leading-5 text-slate-300">
                <span className="font-black text-white">{prior.id ?? "credential"}</span> · {prior.changedKeys.slice(0, 8).join(", ") || "no changed keys listed"}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <List title="Missing critical" items={item.missingCritical} empty="No critical gaps listed." />
        <List title="Generic/default fields" items={item.genericDefaultFields} empty="No obvious generic defaults detected." />
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-bold text-white">{value}</div>
    </div>
  );
}

function List({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length ? items.map((item) => <span key={item} className={pill("slate")}>{item}</span>) : <span className="text-xs text-slate-500">{empty}</span>}
      </div>
    </div>
  );
}

export default async function UfcProfileQaPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const modelVersion = param(resolved, "modelVersion") ?? "ufc-fight-iq-v1";
  const horizonDays = numberParam(param(resolved, "horizonDays"), 180, 1, 365);
  const limit = numberParam(param(resolved, "limit"), 200, 1, 500);
  const report = await getUfcFighterProfileQaReport({ modelVersion, horizonDays, limit });

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">UFC Fighter Profile QA</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Find fake generic fighter profiles</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              This page shows which upcoming fighters are still generic avatars, which credential priors matched, which priors were applied, and what needs repair before the sim can be trusted.
            </p>
            <div className="mt-3 text-xs text-slate-500">Model {report.modelVersion} · checked {when(report.checkedAt)} · horizon {report.horizonDays} days</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/accuracy/ufc-shadow-audit" className={pill("cyan")}>Shadow audit</Link>
            <Link href="/sim/ufc" className={pill("cyan")}>UFC lab</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Fighter sides" value={report.fighterSides} note="Total fighter profiles inspected from upcoming fights." />
        <Stat label="Repair now" value={(report.statusCounts.REPAIR_NOW ?? 0) + (report.statusCounts.NO_FEATURE ?? 0)} note="Profiles too weak or missing for reliable sim output." />
        <Stat label="Credential matches" value={report.credentialMatchCount} note="Fighters matched to real-life credential priors." />
        <Stat label="Generic avatars" value={report.genericAvatarCount} note="Profiles with too many default-looking fields." />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Status counts</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(report.statusCounts).map(([key, value]) => <span key={key} className={pill(toneForStatus(key))}>{key.replaceAll("_", " ")}: {value}</span>)}
              {Object.entries(report.gradeCounts).map(([key, value]) => <span key={key} className={pill(key === "A" || key === "B" ? "green" : key === "C" ? "amber" : "red")}>Grade {key}: {value}</span>)}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Repair queue</div>
        {report.repairQueue.length ? report.repairQueue.slice(0, 40).map((item) => <FighterCard key={`${item.fightId}-${item.fighterId}-repair`} item={item} />) : <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-400">No repair-now fighters found in this window.</div>}
      </section>

      <section className="grid gap-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Credential queue</div>
        {report.credentialQueue.length ? report.credentialQueue.slice(0, 40).map((item) => <FighterCard key={`${item.fightId}-${item.fighterId}-credential`} item={item} />) : <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-400">No credential-prior fighters found in this window.</div>}
      </section>
    </main>
  );
}
