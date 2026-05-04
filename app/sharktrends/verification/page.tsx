import Link from "next/link";

import { buildTrendVerificationPayload, type TrendVerificationResult } from "@/services/trends/trend-verification";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseIntValue(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function parseBool(value: string | undefined) {
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function pct(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value}%`;
}

function units(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(Math.abs(value) >= 10 ? 1 : 2)}u`;
}

function gradeClass(item: TrendVerificationResult) {
  if (item.verified) return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (item.grade === "B" || item.grade === "C") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (item.grade === "D") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-red-400/25 bg-red-400/10 text-red-200";
}

function riskClass(value: string) {
  if (value === "low") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (value === "medium") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-red-400/25 bg-red-400/10 text-red-200";
}

function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function VerificationCard({ item }: { item: TrendVerificationResult }) {
  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{item.league} · {item.market} · {item.side}</div>
          <div className="mt-2 line-clamp-2 text-lg font-semibold text-white">{item.name}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{item.record} · sample {item.sampleSize} · results {item.resultRows}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${gradeClass(item)}`}>{item.verified ? "verified" : "not verified"} · {item.grade} {item.verificationScore}</span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-300">{item.hasCurrentAttachment ? "attached" : "idle"}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:grid-cols-5">
        <span>{units(item.profitUnits)}</span>
        <span>{pct(item.roiPct)} ROI</span>
        <span>{pct(item.winRatePct)} hit</span>
        <span>{pct(item.clvPct)} CLV</span>
        <span>{item.qualityGate.replace(/_/g, " ")}</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Overfit risk</div><span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${riskClass(item.overfitRisk)}`}>{item.overfitRisk}</span><div className="mt-2 text-[11px] text-slate-500">{item.conditionsCount} conditions</div></div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Source risk</div><span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${riskClass(item.sourceRisk)}`}>{item.sourceRisk}</span><div className="mt-2 text-[11px] text-slate-500">{item.resultRows} result rows</div></div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Recent</div><div className="mt-2 text-sm font-semibold text-white">L10 {item.last10 ?? "TBD"}</div><div className="mt-1 text-[11px] text-slate-500">L30 {item.last30 ?? "TBD"} · {item.currentStreak ?? "no streak"}</div></div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Reasons</div><div className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">{item.reasons.length ? item.reasons.slice(0, 6).map((reason) => <div key={reason}>+ {reason}</div>) : <div className="text-slate-500">No verification reasons yet.</div>}</div></div>
        <div className="rounded-xl border border-amber-300/15 bg-amber-300/5 p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">Blockers</div><div className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">{item.blockers.length ? item.blockers.slice(0, 6).map((blocker) => <div key={blocker}>- {blocker}</div>) : <div className="text-slate-500">No verification blockers.</div>}</div></div>
      </div>
    </article>
  );
}

export default async function TrendVerificationPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const league = (readValue(resolved, "league") ?? "ALL").toUpperCase();
  const market = (readValue(resolved, "market") ?? "ALL").toLowerCase();
  const limit = parseIntValue(readValue(resolved, "limit"), 250, 1, 1000);
  const requireCurrentAttachment = parseBool(readValue(resolved, "requireCurrentAttachment"));
  const payload = await buildTrendVerificationPayload({ league, market, limit, requireCurrentAttachment });

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Verification Engine</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Generated-system verification</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Transparent verification for generated systems: sample, ROI, units, CLV, source coverage, overfit risk, current attachment, reasons, and blockers.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><Link href="/sharktrends" className="text-cyan-200 hover:text-cyan-100">Command board</Link><Link href="/sharktrends/generated-attachments" className="text-cyan-200 hover:text-cyan-100">Attachments</Link><Link href="/sharktrends/generated-runner" className="text-cyan-200 hover:text-cyan-100">Runner</Link><Link href="/api/sharktrends/verification" className="text-cyan-200 hover:text-cyan-100">API</Link></div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
        <form method="get" className="grid gap-3 md:grid-cols-5">
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">League</span><select name="league" defaultValue={league} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{["ALL", "MLB", "NBA", "NFL", "NHL", "NCAAF", "UFC", "BOXING"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Market</span><select name="market" defaultValue={market} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{["ALL", "moneyline", "spread", "total", "player_prop", "fight_winner"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Limit</span><input name="limit" defaultValue={String(limit)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-300"><input type="checkbox" name="requireCurrentAttachment" value="1" defaultChecked={requireCurrentAttachment} className="h-4 w-4 accent-cyan-300" />Require current attachment</label>
          <button className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Verify systems</button>
        </form>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Systems" value={payload.stats.systemsScanned} note="Persisted generated systems scanned." />
        <Metric label="Verified" value={payload.stats.verified} note="Systems clearing verification gates." />
        <Metric label="Attached" value={payload.stats.attached} note="Verified candidates attached to current games." />
        <Metric label="High risk" value={payload.stats.highOverfitRisk + payload.stats.highSourceRisk} note="Overfit/source risk flags." />
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Metric label="Grade A" value={payload.stats.gradeA} note="Highest verification tier." />
        <Metric label="Grade B" value={payload.stats.gradeB} note="Good verification tier." />
        <Metric label="Grade C" value={payload.stats.gradeC} note="Review tier." />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">{payload.sourceNote}</section>

      <section className="grid gap-4">
        {payload.results.length ? payload.results.map((item) => <VerificationCard key={item.systemId} item={item} />) : <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">No generated systems are available for verification under this view.</div>}
      </section>
    </main>
  );
}
