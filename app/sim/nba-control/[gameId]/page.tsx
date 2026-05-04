import Link from "next/link";

import { getNbaSimControl } from "@/services/simulation/nba-sim-control";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ gameId: string }>;
};

function qualityTone(status: string | undefined) {
  if (status === "GREEN") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  if (status === "YELLOW") return "border-amber-300/25 bg-amber-500/10 text-amber-100";
  if (status === "RED") return "border-red-400/25 bg-red-500/10 text-red-100";
  return "border-slate-500/25 bg-slate-800/70 text-slate-200";
}

function CheckPill({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${ready ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200" : "border-red-400/25 bg-red-500/10 text-red-200"}`}>
      {ready ? "✓" : "×"} {label}
    </span>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/25 px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

export default async function NbaControlPage({ params }: PageProps) {
  const { gameId } = await params;
  const snapshot = await getNbaSimControl(decodeURIComponent(gameId));
  const inputQuality = snapshot.inputQuality;
  const readyChecks = inputQuality?.readyChecks ? Object.entries(inputQuality.readyChecks) : [];

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">NBA Control Snapshot</div>
        <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">{snapshot.eventLabel}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Rotation certainty, player availability, calibration, model health, and input-quality readiness for this NBA matchup.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
          <Link href="/sim?league=NBA" className="text-cyan-200 hover:text-cyan-100">NBA sim</Link>
          <Link href={`/api/sim/nba-control?gameId=${encodeURIComponent(snapshot.gameId)}`} className="text-cyan-200 hover:text-cyan-100">API JSON</Link>
          <Link href={`/api/sim/nba-lock?gameId=${encodeURIComponent(snapshot.gameId)}`} className="text-cyan-200 hover:text-cyan-100">Lock JSON</Link>
          <Link href="/sim/accuracy?league=NBA" className="text-cyan-200 hover:text-cyan-100">Accuracy</Link>
        </div>
      </section>

      <section className={`rounded-[1.5rem] border p-5 ${qualityTone(inputQuality?.status)}`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] opacity-75">Input Quality Gate</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {inputQuality ? `${inputQuality.status} · ${inputQuality.action}` : "Unavailable"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              {inputQuality?.reasons?.[0] ?? "Input-quality summary is not available for this control snapshot."}
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-3 sm:min-w-[320px]">
            <MiniMetric label="Score" value={inputQuality ? String(inputQuality.score) : "—"} />
            <MiniMetric label="Trusted" value={inputQuality?.trusted ? "Yes" : "No"} />
          </div>
        </div>

        {readyChecks.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {readyChecks.map(([label, ready]) => (
              <CheckPill key={label} label={label.replace(/([A-Z])/g, " $1").trim()} ready={Boolean(ready)} />
            ))}
          </div>
        ) : null}

        {inputQuality ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-white/8 bg-black/25 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Source Map</div>
              <dl className="mt-3 grid gap-2 text-xs text-slate-300">
                {Object.entries(inputQuality.sourceMap).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <dt className="capitalize text-slate-500">{label.replace(/([A-Z])/g, " $1")}</dt>
                    <dd className="max-w-[190px] truncate font-mono text-slate-200" title={String(value ?? "missing")}>{String(value ?? "missing")}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/25 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Blockers</div>
              <div className="mt-3 grid gap-1.5 text-xs leading-5 text-red-100/85">
                {inputQuality.blockers.length ? inputQuality.blockers.slice(0, 6).map((blocker) => <div key={blocker}>• {blocker}</div>) : <div className="text-slate-400">No hard blockers detected.</div>}
              </div>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/25 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Warnings</div>
              <div className="mt-3 grid gap-1.5 text-xs leading-5 text-amber-100/85">
                {inputQuality.warnings.length ? inputQuality.warnings.slice(0, 6).map((warning) => <div key={warning}>• {warning}</div>) : <div className="text-slate-400">No major warnings detected.</div>}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Raw Control JSON</div>
        <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-300">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </section>
    </main>
  );
}
