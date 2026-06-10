import Link from "next/link";

import { getUfcShadowAuditHealth } from "@/services/ufc/shadow-audit-health";

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

function parseLimit(value: string | undefined) {
  const parsed = Number(value ?? 20);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.round(parsed))) : 20;
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

function Stat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

type StatusSummaryRow = Awaited<ReturnType<typeof getUfcShadowAuditHealth>>["statusSummary"][number];
type RecentRow = Awaited<ReturnType<typeof getUfcShadowAuditHealth>>["recent"][number];

export default async function UfcShadowAuditPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const modelVersion = param(resolved, "modelVersion") ?? "ufc-fight-iq-v1";
  const limit = parseLimit(param(resolved, "limit"));
  const audit = await getUfcShadowAuditHealth({ modelVersion, limit });
  const ready = audit.health.activeV2PendingCount > 0;

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">UFC Shadow Audit</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Precompute verification</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              This page confirms whether the regenerated UFC rows are using the current shadow audit payload, style payload, settlement placeholder, and active pending status.
            </p>
            <div className="mt-3 text-xs text-slate-500">Model {audit.modelVersion} · checked {when(audit.checkedAt)}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={pill(ready ? "green" : "red")}>{ready ? "precompute verified" : "needs precompute"}</span>
            <Link href="/accuracy/mma" className={pill("cyan")}>MMA accuracy</Link>
            <Link href="/sim/ufc" className={pill("cyan")}>UFC lab</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active v2 pending" value={audit.health.activeV2PendingCount} note="Should be greater than 0 after authorized precompute." />
        <Stat label="Superseded" value={audit.health.supersededCount} note="Old pending rows replaced by newer audits." />
        <Stat label="Resolved" value={audit.health.resolvedCount} note="Rows already settled with final results." />
        <Stat label="Latest row" value={when(audit.health.latestRecordedAt)} note={audit.health.needsAuthorizedPrecompute ? "Still waiting on current precompute." : "Shadow audit table has fresh active rows."} />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Status summary</div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
              <tr>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Schema</th>
                <th className="px-3 py-2 text-right">Rows</th>
                <th className="px-3 py-2 text-right">Latest</th>
              </tr>
            </thead>
            <tbody>
              {audit.statusSummary.map((row: StatusSummaryRow) => (
                <tr key={`${row.status}-${row.schemaVersion}`} className="border-b border-white/5 last:border-none">
                  <td className="px-3 py-3 text-white">{row.status}</td>
                  <td className="px-3 py-3 font-mono text-cyan-200">{row.schemaVersion}</td>
                  <td className="px-3 py-3 text-right font-mono text-white">{row.rowCount}</td>
                  <td className="px-3 py-3 text-right text-slate-300">{when(row.latestRecordedAt)}</td>
                </tr>
              ))}
              {!audit.statusSummary.length ? <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No shadow rows found.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Recent rows</div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
              <tr>
                <th className="px-3 py-2">Fight</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Schema</th>
                <th className="px-3 py-2 text-right">Style</th>
                <th className="px-3 py-2 text-right">Settlement</th>
                <th className="px-3 py-2 text-right">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {audit.recent.map((row: RecentRow) => (
                <tr key={row.id} className="border-b border-white/5 last:border-none">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-white">{row.fighterAName ?? "Fighter A"} vs {row.fighterBName ?? "Fighter B"}</div>
                    <div className="mt-1 text-[10px] text-slate-500">{row.eventLabel ?? row.fightId}</div>
                  </td>
                  <td className="px-3 py-3"><span className={pill(row.status === "PENDING" ? "green" : row.status === "SHADOW_ONLY" ? "red" : "slate")}>{row.status ?? "unknown"}</span></td>
                  <td className="px-3 py-3 font-mono text-cyan-200">{row.schemaVersion}</td>
                  <td className="px-3 py-3 text-right"><span className={pill(row.hasStylePayload ? "green" : "red")}>{row.hasStylePayload ? "yes" : "no"}</span></td>
                  <td className="px-3 py-3 text-right"><span className={pill(row.hasSettlementPayload ? "green" : "red")}>{row.hasSettlementPayload ? "yes" : "no"}</span></td>
                  <td className="px-3 py-3 text-right text-slate-300">{when(row.recordedAt)}</td>
                </tr>
              ))}
              {!audit.recent.length ? <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No recent shadow rows found.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
