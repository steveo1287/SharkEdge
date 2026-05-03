import type { UfcSourceAuditSummary } from "@/services/ufc/source-audit";

function dateLabel(value: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function tone(confidence: string) {
  if (confidence === "OFFICIAL_CONFIRMED") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
  if (confidence === "OFFICIAL_PARTIAL") return "border-aqua/25 bg-aqua/10 text-aqua";
  if (confidence === "CROSS_CHECKED") return "border-blue-300/25 bg-blue-300/10 text-blue-200";
  if (confidence === "EARLY_REPORTED") return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  return "border-white/10 bg-white/[0.04] text-slate-300";
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

export function UfcSourceAuditPanel({ audit }: { audit: UfcSourceAuditSummary }) {
  return (
    <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Source audit</div>
          <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">Card evidence</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Provider coverage and confidence for the fights on this card. This shows whether a matchup is official, cross-checked, early reported, or needs manual review.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${audit.sourceCount ? "border-aqua/25 bg-aqua/10 text-aqua" : "border-amber-300/25 bg-amber-300/10 text-amber-200"}`}>
          {audit.sourceCount ? `${audit.sourceCount} source rows` : "no source rows"}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Providers" value={audit.sourceNames.length} sub={audit.sourceNames.join(" / ") || "none"} />
        <Metric label="Official" value={audit.officialCount} sub="confirmed or partial" />
        <Metric label="Cross checked" value={audit.crossCheckedCount} sub="secondary verification" />
        <Metric label="Early/manual" value={audit.earlyReportedCount + audit.manualReviewCount} sub={`last seen ${dateLabel(audit.lastSeenAt)}`} />
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/[0.04] text-[9px] uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th className="px-3 py-2">Bout</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Class</th>
              <th className="px-3 py-2">Seen</th>
            </tr>
          </thead>
          <tbody>
            {audit.rows.length ? audit.rows.slice(0, 24).map((row, index) => (
              <tr key={`${row.sourceName}-${row.fightId ?? index}-${row.seenAt}`} className="border-t border-white/10">
                <td className="px-3 py-2 text-white">{row.sourceFighterA ?? "A"} vs {row.sourceFighterB ?? "B"}</td>
                <td className="px-3 py-2 text-slate-300">{row.sourceUrl ? <a className="text-aqua hover:underline" href={row.sourceUrl}>{row.sourceName}</a> : row.sourceName}</td>
                <td className="px-3 py-2"><span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${tone(row.confidence)}`}>{row.confidence}</span></td>
                <td className="px-3 py-2 text-slate-300">{row.sourceWeightClass ?? row.sourceCardSection ?? "--"}</td>
                <td className="px-3 py-2 text-slate-500">{dateLabel(row.seenAt)}</td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="px-3 py-4 text-sm text-slate-400">No source audit rows are available for this card yet. Run the upcoming-card ingestion worker or load endpoint.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
