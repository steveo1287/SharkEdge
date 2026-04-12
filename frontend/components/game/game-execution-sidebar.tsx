import Link from "next/link";

import { SharkScoreRing } from "@/components/branding/shark-score-ring";
import { Badge } from "@/components/ui/badge";
import type { MatchupDetailView } from "@/lib/types/domain";
import type { GameHubPresentation } from "@/services/matchups/game-hub-presenter";

function formatSigned(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatSignedPercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function SidebarMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-white">{value}</div>
      <div className="mt-1 text-[11px] leading-5 text-slate-400">{note}</div>
    </div>
  );
}

type Props = {
  detail: MatchupDetailView;
  presentation: GameHubPresentation;
};

export function GameExecutionSidebar({ detail, presentation }: Props) {
  const headline = presentation.headline;
  const openingPoint = detail.lineMovement[0] ?? null;
  const latestPoint = detail.lineMovement[detail.lineMovement.length - 1] ?? null;
  const spreadMove =
    openingPoint && latestPoint && typeof openingPoint.spreadLine === "number" && typeof latestPoint.spreadLine === "number"
      ? latestPoint.spreadLine - openingPoint.spreadLine
      : null;
  const totalMove =
    openingPoint && latestPoint && typeof openingPoint.totalLine === "number" && typeof latestPoint.totalLine === "number"
      ? latestPoint.totalLine - openingPoint.totalLine
      : null;

  return (
    <aside className="grid gap-4 xl:sticky xl:top-[7rem]">
      <section className="mobile-surface">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Execution brief</div>
            <div className="mt-2 text-[1.05rem] font-semibold tracking-tight text-white">
              {headline?.selectionLabel ?? "No live angle"}
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              {headline?.triggerSummary ?? detail.providerHealth.summary}
            </div>
          </div>
          <SharkScoreRing
            score={Math.round(headline?.opportunityScore ?? 0)}
            size="sm"
            tone={
              (headline?.opportunityScore ?? 0) >= 70
                ? "success"
                : (headline?.opportunityScore ?? 0) >= 50
                  ? "warning"
                  : "brand"
            }
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="brand">{presentation.postureLabel}</Badge>
          <Badge tone="muted">{headline?.actionState.replaceAll("_", " ") ?? "PASS"}</Badge>
          <Badge tone="muted">{headline?.sportsbookName ?? detail.currentOddsProvider ?? "Market source"}</Badge>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <SidebarMetric
            label="Market price"
            value={headline?.displayOddsAmerican ? `${headline.displayOddsAmerican > 0 ? "+" : ""}${headline.displayOddsAmerican}` : "N/A"}
            note="Best current execution number."
          />
          <SidebarMetric
            label="Fair price"
            value={headline?.fairPriceAmerican ? `${headline.fairPriceAmerican > 0 ? "+" : ""}${headline.fairPriceAmerican}` : "N/A"}
            note="Pricing anchor against the current line."
          />
          <SidebarMetric
            label="EV"
            value={formatSignedPercent(headline?.expectedValuePct ?? null)}
            note="Expected edge at the displayed number."
          />
          <SidebarMetric
            label="Delta"
            value={formatSigned(headline?.marketDeltaAmerican ?? null, 0)}
            note="Gap versus fair or consensus pricing."
          />
        </div>

        {headline?.whyItShows?.length ? (
          <div className="mt-4 rounded-[1rem] border border-emerald-400/15 bg-emerald-500/[0.06] px-4 py-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-200/80">Why it shows</div>
            <ul className="mt-3 grid gap-2 pl-4 text-sm leading-6 text-slate-200">
              {headline.whyItShows.slice(0, 3).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {headline?.whatCouldKillIt?.length ? (
          <div className="mt-4 rounded-[1rem] border border-rose-400/20 bg-rose-500/[0.07] px-4 py-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-rose-200/80">Kill switches</div>
            <ul className="mt-3 grid gap-2 pl-4 text-sm leading-6 text-slate-200">
              {headline.whatCouldKillIt.slice(0, 3).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="mobile-surface">
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Market tape</div>
        <div className="mt-3 grid gap-3">
          <SidebarMetric
            label="Best moneyline"
            value={detail.oddsSummary?.bestMoneyline ?? "N/A"}
            note={detail.oddsSummary?.sourceLabel ?? "Best board price"}
          />
          <SidebarMetric
            label="Best spread"
            value={detail.oddsSummary?.bestSpread ?? "N/A"}
            note={spreadMove === null ? "No tracked spread move yet." : `Opening to latest ${formatSigned(spreadMove)}`}
          />
          <SidebarMetric
            label="Best total"
            value={detail.oddsSummary?.bestTotal ?? "N/A"}
            note={totalMove === null ? "No tracked total move yet." : `Opening to latest ${formatSigned(totalMove)}`}
          />
        </div>
      </section>

      <section className="mobile-surface">
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Support and trends</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={detail.hasVerifiedOdds ? "success" : "premium"}>
            {detail.hasVerifiedOdds ? `${detail.books.length} books mapped` : "Board coverage partial"}
          </Badge>
          <Badge tone="muted">{detail.trendCards.length} trend cards</Badge>
          <Badge tone="muted">{detail.lineMovement.length} tape snapshots</Badge>
        </div>

        <div className="mt-4 grid gap-3">
          {detail.trendCards.length ? (
            detail.trendCards.slice(0, 3).map((trend) => (
              <Link
                key={trend.id}
                href={trend.href ?? "/trends"}
                className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3 transition hover:border-white/14 hover:bg-white/[0.04]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{trend.title}</div>
                    <div className="mt-1 text-sm leading-6 text-slate-400">{trend.note}</div>
                  </div>
                  <div className="rounded-full border border-white/8 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                    {trend.value}
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-400">
              Trend support is thin on this matchup right now, so SharkEdge keeps the panel quiet.
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}
