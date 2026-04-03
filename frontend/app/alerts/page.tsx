import { AlertCenter } from "@/components/alerts/alert-center";
import { Card } from "@/components/ui/card";
import { ResearchStatusNotice } from "@/components/ui/research-status-notice";
import { SectionTitle } from "@/components/ui/section-title";
import { getAlertsPageData } from "@/services/alerts/alerts-service";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const data = await getAlertsPageData();

  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_32%),linear-gradient(145deg,rgba(2,6,23,0.98),rgba(15,23,42,0.94))] p-0 shadow-[0_28px_90px_rgba(2,6,23,0.42)]">
        <div className="grid gap-5 px-6 py-6 md:px-8 lg:grid-cols-[minmax(0,1.15fr)_280px] lg:items-end">
          <div className="grid gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-amber-300/80">
              Alert center
            </div>
            <h1 className="max-w-3xl font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Real in-app alerts only, tied to saved plays and real watchlist context.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              This page stays honest about what SharkEdge can actually deliver today. No fake push,
              no fake email, no made-up urgency labels.
            </p>
          </div>
          <div className="grid gap-3 rounded-[28px] border border-white/10 bg-slate-950/55 p-4">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Status</div>
            <div className="grid gap-3 text-sm text-slate-300">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                <span>Delivery</span>
                <span className="text-white">{data.inAppOnly ? "In-app only" : "Mixed"}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                <span>Unread / active</span>
                <span className="text-white">
                  {data.unreadCount} / {data.activeRuleCount}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                <span>Plan</span>
                <span className="text-white">{data.plan.statusLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <ResearchStatusNotice
        eyebrow="Workflow beta"
        title="Real alert queue, not a fake notification empire"
        body="This desk is intentionally narrow: in-app alerts, tracked history, and watchlist-linked triggers only. No pretend SMS, no fake push, and no fake urgency labels just to make the page feel bigger."
        meta={`Active alert limit on this plan: ${data.plan.limits.activeAlerts}. Premium-only rules stay visible, but they do not pretend to be unlocked.`}
      />

      <SectionTitle
        title="Alert desk"
        description="One clean queue for triggered alerts, logged history, and the saved play context behind each notification."
      />

      <AlertCenter {...data} />
    </div>
  );
}
