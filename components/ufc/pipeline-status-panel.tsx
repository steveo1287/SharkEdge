import type { UfcPipelineStatus } from "@/services/ufc/pipeline-status";

function pct(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function dateLabel(value: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function metricTone(status: UfcPipelineStatus) {
  if (!status.ok) return "border-rose-300/25 bg-rose-300/10 text-rose-200";
  if (status.upcomingFightCount === 0) return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  if (status.pendingSimCount > 0) return "border-aqua/25 bg-aqua/10 text-aqua";
  return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#06101b]/70 p-3">
      <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 font-display text-2xl font-black tracking-[-0.04em] text-white">{value}</div>
      {sub ? <div className="mt-1 text-[11px] leading-4 text-slate-500">{sub}</div> : null}
    </div>
  );
}

function ActionLink({ href, label, tone = "slate" }: { href: string; label: string; tone?: "aqua" | "slate" | "amber" }) {
  const tones = {
    aqua: "border-aqua/30 bg-aqua/10 text-aqua",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    slate: "border-white/10 bg-white/[0.04] text-slate-300"
  };
  return (
    <a href={href} className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] ${tones[tone]}`}>
      {label}
    </a>
  );
}

export function UfcPipelineStatusPanel({ status }: { status: UfcPipelineStatus }) {
  const base = "/api/admin/ufc/load-upcoming?confirm=load-upcoming";
  return (
    <section className="rounded-[1.35rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(0,210,255,0.12),transparent_18rem),rgba(255,255,255,0.04)] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">UFC pipeline</div>
          <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">Card load and sim status</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Upcoming card ingestion, feature hydration, and SharkSim readiness. Use this when SharkFights shows no cards or fights are stuck at Sim pending.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${metricTone(status)}`}>
          {!status.ok ? "schema/error" : status.upcomingFightCount ? "cards loaded" : "needs load"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Cards" value={status.upcomingEventCount} sub={status.nextEventName ?? "next card pending"} />
        <Metric label="Fights" value={status.upcomingFightCount} sub="upcoming rows in warehouse" />
        <Metric label="Sim ready" value={status.featureReadyFightCount} sub={`${pct(status.featureReadyFightCount, status.upcomingFightCount)} have feature pairs`} />
        <Metric label="Pending sim" value={status.pendingSimCount} sub={`${status.simulatedFightCount} already simulated`} />
        <Metric label="Missing features" value={status.missingFeaturePairCount} sub="hydrate or fallback required" />
        <Metric label="Next event" value={dateLabel(status.nextEventDate)} sub={status.nextEventName ?? "--"} />
        <Metric label="Last seen" value={dateLabel(status.lastCardSeenAt)} sub="latest card ingestion timestamp" />
        <Metric label="Coverage" value={pct(status.simulatedFightCount, status.upcomingFightCount)} sub="simulated upcoming fights" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <ActionLink href={`${base}&dryRun=1&hydrate=1&limit=25&horizonDays=120`} label="Dry run" />
        <ActionLink href={`${base}&hydrate=1&limit=25&horizonDays=120`} label="Load cards" tone="aqua" />
        <ActionLink href={`${base}&hydrate=1&simulate=1&limit=25&horizonDays=120`} label="Load + sim" tone="amber" />
        <ActionLink href="/sharkfights/ufc" label="Refresh page" />
      </div>

      {status.errors.length ? (
        <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/10 p-3 text-sm leading-6 text-rose-100">
          {status.errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      ) : null}
    </section>
  );
}
