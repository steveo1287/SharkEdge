import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import type {
  OpportunityGradingBreakdownRow,
  OpportunityGradingDashboardView,
  OpportunityGradingMetricCard,
  OpportunityGradingReasonRow,
  OpportunityGradingTimingRow
} from "@/lib/types/opportunity";
import { getOpportunityGradingDashboard } from "@/services/opportunities/opportunity-grading-dashboard";

export const dynamic = "force-dynamic";

function toneClass(grade: string) {
  switch (grade) {
    case "STRONG":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
    case "POSITIVE":
      return "border-sky-400/30 bg-sky-500/10 text-sky-200";
    case "NEGATIVE":
      return "border-rose-400/30 bg-rose-500/10 text-rose-200";
    case "INSUFFICIENT_SAMPLE":
      return "border-amber-400/30 bg-amber-500/10 text-amber-200";
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-200";
  }
}

function GradePill({ grade }: { grade: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${toneClass(grade)}`}>
      {grade.replace(/_/g, " ")}
    </span>
  );
}

function MetricCard({ card }: { card: OpportunityGradingMetricCard }) {
  return (
    <Card className="grid gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{card.label}</div>
        <GradePill grade={card.grade} />
      </div>
      <div className="text-2xl font-semibold text-white">{card.value}</div>
      <div className="text-sm leading-6 text-slate-400">{card.detail}</div>
    </Card>
  );
}

function BreakdownTable({
  title,
  description,
  rows
}: {
  title: string;
  description: string;
  rows: OpportunityGradingBreakdownRow[];
}) {
  return (
    <Card className="grid gap-4 p-5">
      <div className="grid gap-1">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-slate-400">{description}</p>
      </div>

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-3 pr-4 font-medium">Bucket</th>
                <th className="pb-3 pr-4 font-medium">Surfaced</th>
                <th className="pb-3 pr-4 font-medium">Closed</th>
                <th className="pb-3 pr-4 font-medium">Beat close</th>
                <th className="pb-3 pr-4 font-medium">Avg CLV</th>
                <th className="pb-3 pr-4 font-medium">Grade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-white/5 text-slate-300">
                  <td className="py-3 pr-4 text-white">{row.label}</td>
                  <td className="py-3 pr-4">{row.surfaced}</td>
                  <td className="py-3 pr-4">{row.closed}</td>
                  <td className="py-3 pr-4">
                    {typeof row.beatClosePct === "number" ? `${row.beatClosePct.toFixed(1)}%` : "n/a"}
                  </td>
                  <td className="py-3 pr-4">
                    {typeof row.averageClvPct === "number"
                      ? `${row.averageClvPct >= 0 ? "+" : ""}${row.averageClvPct.toFixed(2)}%`
                      : "n/a"}
                  </td>
                  <td className="py-3 pr-4">
                    <GradePill grade={row.grade} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          No qualified review data is available for this slice yet.
        </div>
      )}
    </Card>
  );
}

function TimingTable({
  title,
  rows
}: {
  title: string;
  rows: OpportunityGradingTimingRow[];
}) {
  return (
    <Card className="grid gap-4 p-5">
      <h3 className="text-lg font-semibold text-white">{title}</h3>

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-3 pr-4 font-medium">Bucket</th>
                <th className="pb-3 pr-4 font-medium">Replay qualified</th>
                <th className="pb-3 pr-4 font-medium">Hit now correct</th>
                <th className="pb-3 pr-4 font-medium">Wait was better</th>
                <th className="pb-3 pr-4 font-medium">Edge died fast</th>
                <th className="pb-3 pr-4 font-medium">Grade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-white/5 text-slate-300">
                  <td className="py-3 pr-4 text-white">{row.label}</td>
                  <td className="py-3 pr-4">{row.replayQualified}</td>
                  <td className="py-3 pr-4">
                    {typeof row.hitNowCorrectPct === "number" ? `${row.hitNowCorrectPct.toFixed(1)}%` : "n/a"}
                  </td>
                  <td className="py-3 pr-4">
                    {typeof row.waitWasBetterPct === "number" ? `${row.waitWasBetterPct.toFixed(1)}%` : "n/a"}
                  </td>
                  <td className="py-3 pr-4">
                    {typeof row.edgeDiedFastPct === "number" ? `${row.edgeDiedFastPct.toFixed(1)}%` : "n/a"}
                  </td>
                  <td className="py-3 pr-4">
                    <GradePill grade={row.grade} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Timing replay does not have enough post-close data yet.
        </div>
      )}
    </Card>
  );
}

function ReasonTable({ rows }: { rows: OpportunityGradingReasonRow[] }) {
  return (
    <Card className="grid gap-4 p-5">
      <h3 className="text-lg font-semibold text-white">Reason-lane leaders</h3>

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-3 pr-4 font-medium">Reason</th>
                <th className="pb-3 pr-4 font-medium">Category</th>
                <th className="pb-3 pr-4 font-medium">Closed</th>
                <th className="pb-3 pr-4 font-medium">Beat close</th>
                <th className="pb-3 pr-4 font-medium">Avg CLV</th>
                <th className="pb-3 pr-4 font-medium">Grade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-white/5 text-slate-300">
                  <td className="py-3 pr-4 text-white">{row.label}</td>
                  <td className="py-3 pr-4">{row.category.replace(/_/g, " ")}</td>
                  <td className="py-3 pr-4">{row.closed}</td>
                  <td className="py-3 pr-4">
                    {typeof row.beatClosePct === "number" ? `${row.beatClosePct.toFixed(1)}%` : "n/a"}
                  </td>
                  <td className="py-3 pr-4">
                    {typeof row.averageClvPct === "number"
                      ? `${row.averageClvPct >= 0 ? "+" : ""}${row.averageClvPct.toFixed(2)}%`
                      : "n/a"}
                  </td>
                  <td className="py-3 pr-4">
                    <GradePill grade={row.grade} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          No reason lanes have cleared the grading window yet.
        </div>
      )}
    </Card>
  );
}

async function loadDashboard(): Promise<OpportunityGradingDashboardView | null> {
  try {
    return await getOpportunityGradingDashboard();
  } catch {
    return null;
  }
}

export default async function GradingPage() {
  const dashboard = await loadDashboard();

  if (!dashboard) {
    return (
      <div className="grid gap-6">
        <Card className="grid gap-4 p-6">
          <div className="text-[11px] uppercase tracking-[0.28em] text-sky-300/80">Opportunity grading</div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Grading is temporarily unavailable.</h1>
          <p className="max-w-3xl text-sm leading-7 text-slate-300">
            The page stays online, but the post-close grading services did not return data cleanly.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_28%),linear-gradient(145deg,rgba(2,6,23,0.98),rgba(15,23,42,0.94))] p-0 shadow-[0_28px_90px_rgba(2,6,23,0.42)]">
        <div className="grid gap-5 px-6 py-6 md:px-8 lg:grid-cols-[minmax(0,1.25fr)_320px] lg:items-end">
          <div className="grid gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-sky-300/80">
              Opportunity grading
            </div>
            <h1 className="max-w-4xl font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Post-close truth, timing replay, and recommendation quality in one review surface.
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
              This page grades SharkEdge on what mattered after surface time: beat-close rate, CLV, timing correctness, and which reason lanes actually held up.
            </p>
          </div>

          <div className="grid gap-3 rounded-[28px] border border-white/10 bg-slate-950/55 p-4">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Current window</div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
              <span className="text-sm text-slate-300">Review days</span>
              <span className="text-sm font-medium text-white">{dashboard.reviewWindowDays}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
              <span className="text-sm text-slate-300">Surfaced reviews</span>
              <span className="text-sm font-medium text-white">{dashboard.totals.surfaced}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
              <span className="text-sm text-slate-300">Closed reviews</span>
              <span className="text-sm font-medium text-white">{dashboard.totals.closed}</span>
            </div>
          </div>
        </div>
      </Card>

      <SectionTitle
        eyebrow="Truth loop"
        title="How the engine is actually performing"
        description={dashboard.summary}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {dashboard.headlineMetrics.map((card) => (
          <MetricCard key={card.key} card={card} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <BreakdownTable
          title="Action breakdown"
          description="How surface-time action states perform after close."
          rows={dashboard.actionBreakdown}
        />
        <BreakdownTable
          title="Confidence calibration"
          description="Whether confidence tiers are actually separating quality."
          rows={dashboard.confidenceBreakdown}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <BreakdownTable
          title="Market-path regime breakdown"
          description="Performance by market regime at surface time."
          rows={dashboard.regimeBreakdown}
        />
        <BreakdownTable
          title="Market breakdown"
          description="Where SharkEdge is strongest by market type."
          rows={dashboard.marketBreakdown}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <TimingTable title="Timing replay by action" rows={dashboard.timingByAction} />
        <TimingTable title="Timing replay by regime" rows={dashboard.timingByRegime} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <ReasonTable rows={dashboard.reasonLeaders} />

        <Card className="grid gap-4 p-5">
          <h3 className="text-lg font-semibold text-white">Recent post-close reviews</h3>

          {dashboard.recentReviews.length ? (
            <div className="grid gap-3">
              {dashboard.recentReviews.map((review) => (
                <div key={review.surfaceKey} className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {review.selectionLabel}
                      </div>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        {review.league} • {review.marketType} • {review.sportsbookName ?? review.sportsbookKey ?? "book unknown"}
                      </div>
                    </div>
                    <GradePill
                      grade={
                        review.clvResult === "BEAT_CLOSE"
                          ? "POSITIVE"
                          : review.clvResult === "LOST_CLOSE"
                            ? "NEGATIVE"
                            : review.clvResult === "PUSH_CLOSE"
                              ? "MIXED"
                              : "INSUFFICIENT_SAMPLE"
                      }
                    />
                  </div>

                  <div className="mt-3 text-sm leading-6 text-slate-300">{review.summary}</div>

                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                    <span>CLV: {typeof review.clvPct === "number" ? `${review.clvPct >= 0 ? "+" : ""}${review.clvPct.toFixed(2)}%` : "n/a"}</span>
                    <span>Timing: {review.timingReview.classification.replace(/_/g, " ").toLowerCase()}</span>
                    <span>Outcome: {(review.finalOutcome ?? "UNKNOWN").toLowerCase()}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              There are no post-close reviews to display yet.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
