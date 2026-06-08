import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { getMlbIntelligenceReadiness } from "@/services/simulation/mlb-intelligence-readiness";

export const dynamic = "force-dynamic";

function toneForState(state: string) {
  switch (state) {
    case "READY":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
    case "DEGRADED":
      return "border-amber-400/30 bg-amber-500/10 text-amber-200";
    case "ERROR":
    case "MISSING":
      return "border-rose-400/30 bg-rose-500/10 text-rose-200";
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-200";
  }
}

function StatusPill({ state }: { state: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${toneForState(
        state
      )}`}
    >
      {state}
    </span>
  );
}

function MetricTile({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="metric-tile">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-white">{value ?? "n/a"}</div>
    </div>
  );
}

export default async function MlbIntelligenceReadinessPage() {
  const report = await getMlbIntelligenceReadiness();

  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_28%),linear-gradient(145deg,rgba(2,6,23,0.98),rgba(15,23,42,0.94))] p-0 shadow-[0_28px_90px_rgba(2,6,23,0.42)]">
        <div className="grid gap-5 px-6 py-6 md:px-8 lg:grid-cols-[minmax(0,1.25fr)_340px] lg:items-end">
          <div className="grid gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-emerald-300/80">
              MLB intelligence readiness
            </div>
            <h1 className="max-w-4xl font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Roster ratings, Statcast micro tendencies, DB persistence, and synthetic fallback control.
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
              This page shows whether the MLB model is actually fed for production. It does not treat a dry run, missing database rows, or missing Statcast micro feeds as betting-grade readiness.
            </p>
          </div>

          <div className="grid gap-3 rounded-[28px] border border-white/10 bg-slate-950/55 p-4">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
              <span className="text-sm text-slate-300">Overall state</span>
              <StatusPill state={report.state} />
            </div>
            <div className="rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Summary</div>
              <div className="mt-2 text-sm leading-6 text-white">{report.summary}</div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
              <span className="text-sm text-slate-300">Snapshot</span>
              <span className="text-right text-sm font-medium text-white">{report.snapshotDate ?? "n/a"}</span>
            </div>
          </div>
        </div>
      </Card>

      <SectionTitle
        eyebrow="Readiness gates"
        title="MLB model feed state"
        description="A high-confidence MLB pick should not clear unless roster ratings are persisted and the Statcast micro feed is present."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <div className="grid gap-6">
          <Card className="grid gap-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Roster ratings</h2>
              <StatusPill state={report.rosterRatings.state} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile label="Teams covered" value={`${report.rosterRatings.teamsCovered}/${report.rosterRatings.teamsExpected}`} />
              <MetricTile label="Players seen" value={report.rosterRatings.playersSeen} />
              <MetricTile label="Hitters rated" value={report.rosterRatings.hittersRated} />
              <MetricTile label="Pitchers rated" value={report.rosterRatings.pitchersRated} />
              <MetricTile label="Persisted" value={report.rosterRatings.persisted ? "Yes" : "No"} />
              <MetricTile label="Dry run" value={report.rosterRatings.dryRun ? "Yes" : "No"} />
              <MetricTile label="DB hitter rows" value={report.rosterRatings.databaseHitterRows} />
              <MetricTile label="DB pitcher rows" value={report.rosterRatings.databasePitcherRows} />
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm leading-7 text-slate-300">
              Database available: {report.rosterRatings.databaseAvailable ? "yes" : "no"}
            </div>
          </Card>

          <Card className="grid gap-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Statcast micro tendencies</h2>
              <StatusPill state={report.microTendencies.state} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile label="Built" value={report.microTendencies.built ? "Yes" : "No"} />
              <MetricTile label="Batter feed" value={report.microTendencies.batterCount} />
              <MetricTile label="Pitcher feed" value={report.microTendencies.pitcherCount} />
              <MetricTile label="Usable rows" value={report.microTendencies.usableRows} />
              <MetricTile label="Terminal PA rows" value={report.microTendencies.terminalPitchRows} />
              <MetricTile label="Batted balls" value={report.microTendencies.battedBallRows} />
              <MetricTile label="Batter file" value={report.microTendencies.batterFeedExists ? "Found" : "Missing"} />
              <MetricTile label="Pitcher file" value={report.microTendencies.pitcherFeedExists ? "Found" : "Missing"} />
            </div>
            <div className="grid gap-2 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-xs leading-6 text-slate-400">
              <div>Batter path: {report.microTendencies.batterFeedPath}</div>
              <div>Pitcher path: {report.microTendencies.pitcherFeedPath}</div>
            </div>
          </Card>
        </div>

        <div className="grid gap-6">
          <Card className="grid gap-4 p-5">
            <h2 className="text-lg font-semibold text-white">Production gates</h2>
            <div className="grid gap-3">
              {report.gates.map((gate) => (
                <div
                  key={gate.key}
                  className={`rounded-2xl border px-4 py-3 ${gate.passed ? "border-emerald-400/20 bg-emerald-500/10" : "border-amber-400/20 bg-amber-500/10"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{gate.label}</div>
                    <span className={gate.passed ? "text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200" : "text-xs font-semibold uppercase tracking-[0.18em] text-amber-200"}>
                      {gate.passed ? "pass" : "blocked"}
                    </span>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">{gate.detail}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="grid gap-4 p-5">
            <h2 className="text-lg font-semibold text-white">Synthetic fallback</h2>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm leading-7 text-emerald-100">
              {report.syntheticFallback.blockedForHighConfidence ? "Blocked for high-confidence MLB." : "Not blocked."}
            </div>
            <div className="text-sm leading-7 text-slate-300">{report.syntheticFallback.reason}</div>
          </Card>

          <Card className="grid gap-4 p-5">
            <h2 className="text-lg font-semibold text-white">Warnings</h2>
            <div className="grid gap-3">
              {report.warnings.length ? (
                report.warnings.map((warning) => (
                  <div key={warning} className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    {warning}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  No active MLB intelligence warnings.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
