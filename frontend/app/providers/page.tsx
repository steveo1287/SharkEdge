import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { getLiveOddsReadinessReport } from "@/services/current-odds/provider-readiness-service";

export const dynamic = "force-dynamic";

function toneForState(state: string) {
  switch (state) {
    case "READY":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
    case "DEGRADED":
      return "border-amber-400/30 bg-amber-500/10 text-amber-200";
    case "ERROR":
      return "border-rose-400/30 bg-rose-500/10 text-rose-200";
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-200";
  }
}

function StatusPill({ state }: { state: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${toneForState(state)}`}>
      {state}
    </span>
  );
}

export default async function ProvidersReadinessPage() {
  const report = await getLiveOddsReadinessReport();

  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_28%),linear-gradient(145deg,rgba(2,6,23,0.98),rgba(15,23,42,0.94))] p-0 shadow-[0_28px_90px_rgba(2,6,23,0.42)]">
        <div className="grid gap-5 px-6 py-6 md:px-8 lg:grid-cols-[minmax(0,1.25fr)_320px] lg:items-end">
          <div className="grid gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-sky-300/80">
              Live odds readiness
            </div>
            <h1 className="max-w-4xl font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
              One screen for backend health, book-feed wiring, and who wins board selection right now.
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
              This page stays tied to the real SharkEdge provider stack. It does not pretend direct
              DK/FD scraping exists when only worker feed scaffolds or backend aggregation are live.
            </p>
          </div>
          <div className="grid gap-3 rounded-[28px] border border-white/10 bg-slate-950/55 p-4">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Current state</div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
              <span className="text-sm text-slate-300">Overall readiness</span>
              <StatusPill state={report.overallState} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
              <span className="text-sm text-slate-300">Board winner</span>
              <span className="text-right text-sm font-medium text-white">
                {report.selectedBoardProvider.label ?? "None"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
              <span className="text-sm text-slate-300">Generated</span>
              <span className="text-right text-sm font-medium text-white">{new Date(report.generatedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </Card>

      <SectionTitle
        eyebrow="Diagnostics"
        title="Provider readiness"
        description="Board adapters, book-feed workers, freshness, and winner selection are shown from the actual runtime state instead of hand-wavy setup notes."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="grid gap-6">
          <Card className="grid gap-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Board providers</h2>
              <StatusPill state={report.selectedBoardProvider.providerKey ? "READY" : "ERROR"} />
            </div>
            <div className="grid gap-4">
              {report.boardProviders.map((provider) => (
                <div key={provider.providerKey} className="rounded-[24px] border border-white/10 bg-slate-950/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{provider.label}</div>
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        {provider.providerKey}
                        {provider.providerMode ? ` | ${provider.providerMode}` : ""}
                      </div>
                    </div>
                    <StatusPill state={provider.state} />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="metric-tile">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Configured</div>
                      <div className="mt-2 text-sm text-white">{provider.configured ? "Yes" : "No"}</div>
                    </div>
                    <div className="metric-tile">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Freshness</div>
                      <div className="mt-2 text-sm text-white">{provider.freshnessMinutes ?? "n/a"}</div>
                    </div>
                    <div className="metric-tile">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Sports</div>
                      <div className="mt-2 text-sm text-white">{provider.sportsCount}</div>
                    </div>
                    <div className="metric-tile">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Games</div>
                      <div className="mt-2 text-sm text-white">{provider.gameCount}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-slate-300">
                    <div>Generated at: {provider.generatedAt ? new Date(provider.generatedAt).toLocaleString() : "n/a"}</div>
                    <div>Source URL: {provider.sourceUrl ?? "n/a"}</div>
                    <div>Warnings: {provider.warnings.length ? provider.warnings.join(" | ") : "none"}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="grid gap-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Worker book feeds</h2>
              <div className="text-sm text-slate-400">DraftKings / FanDuel direct-feed scaffolds</div>
            </div>
            <div className="grid gap-4">
              {report.bookFeeds.map((feed) => (
                <div key={feed.providerKey} className="rounded-[24px] border border-white/10 bg-slate-950/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{feed.label}</div>
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{feed.providerKey}</div>
                    </div>
                    <StatusPill state={feed.state} />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="metric-tile">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Configured</div>
                      <div className="mt-2 text-sm text-white">{feed.configured ? "Yes" : "No"}</div>
                    </div>
                    <div className="metric-tile">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Failures</div>
                      <div className="mt-2 text-sm text-white">{feed.consecutiveFailures}</div>
                    </div>
                    <div className="metric-tile">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Last success</div>
                      <div className="mt-2 text-sm text-white">{feed.lastSuccessAt ? new Date(feed.lastSuccessAt).toLocaleString() : "n/a"}</div>
                    </div>
                    <div className="metric-tile">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Next allowed</div>
                      <div className="mt-2 text-sm text-white">{feed.nextAllowedAt ? new Date(feed.nextAllowedAt).toLocaleString() : "n/a"}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-slate-300">
                    <div>Source URL: {feed.sourceUrl ?? "n/a"}</div>
                    <div>Reason: {feed.reason ?? "n/a"}</div>
                    <div>Warnings: {feed.warnings.length ? feed.warnings.join(" | ") : "none"}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid gap-6">
          <Card className="grid gap-4 p-5">
            <h2 className="text-lg font-semibold text-white">Winner selection</h2>
            <div className="rounded-[24px] border border-white/10 bg-slate-950/60 p-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Current winner</div>
              <div className="mt-2 text-2xl font-semibold text-white">{report.selectedBoardProvider.label ?? "None"}</div>
              <div className="mt-3 text-sm leading-7 text-slate-300">{report.selectedBoardProvider.reason}</div>
              <div className="mt-3 text-sm text-slate-400">Score: {report.selectedBoardProvider.score ?? "n/a"}</div>
            </div>
          </Card>

          <Card className="grid gap-4 p-5">
            <h2 className="text-lg font-semibold text-white">Warnings</h2>
            <div className="grid gap-3">
              {report.warnings.length ? report.warnings.map((warning) => (
                <div key={warning} className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  {warning}
                </div>
              )) : (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  No active warnings.
                </div>
              )}
            </div>
          </Card>

          <Card className="grid gap-4 p-5">
            <h2 className="text-lg font-semibold text-white">Operator notes</h2>
            <div className="grid gap-3 text-sm leading-7 text-slate-300">
              {report.notes.map((note) => (
                <div key={note} className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
                  {note}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

