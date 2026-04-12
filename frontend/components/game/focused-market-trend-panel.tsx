import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { formatMarketType } from "@/lib/formatters/odds";
import type { MatchupDetailView } from "@/lib/types/domain";
import type { OpportunityTrendLensView, OpportunityView } from "@/lib/types/opportunity";
import type { GameHubPresentation } from "@/services/matchups/game-hub-presenter";

const MARKET_ORDER = ["moneyline", "spread", "total"] as const;

type MarketFocus = "all" | "spread" | "moneyline" | "total";
type MarketKey = Exclude<MarketFocus, "all">;

function resolveFocusedMarket(
  marketFocus: MarketFocus,
  presentation: GameHubPresentation
): MarketKey | null {
  if (marketFocus !== "all") {
    return marketFocus;
  }

  const headlineMarket = presentation.headline?.marketType;
  if (headlineMarket === "moneyline" || headlineMarket === "spread" || headlineMarket === "total") {
    return headlineMarket;
  }

  return (
    MARKET_ORDER.find((market) => Boolean(presentation.marketSupport[market])) ?? null
  );
}

function getSupportTone(opportunity: OpportunityView | null) {
  const intelligence = opportunity?.trendIntelligence;
  if (!intelligence) {
    return "muted" as const;
  }

  if (intelligence.supportiveLensCount > intelligence.contraryLensCount) {
    return "success" as const;
  }

  if (intelligence.contraryLensCount > 0) {
    return "danger" as const;
  }

  return "premium" as const;
}

function formatFocusLabel(focusedMarket: MarketKey | null) {
  if (!focusedMarket) {
    return "No market support";
  }

  return formatMarketType(focusedMarket);
}

function formatLensTone(lens: OpportunityTrendLensView) {
  if (lens.state === "SUPPORTIVE") {
    return "success" as const;
  }

  if (lens.state === "CONTRARY") {
    return "danger" as const;
  }

  if (lens.state === "MIXED") {
    return "premium" as const;
  }

  return "muted" as const;
}

function getMarketCards(
  detail: MatchupDetailView,
  focusedMarket: MarketKey | null
) {
  if (!focusedMarket) {
    return detail.trendCards.slice(0, 3);
  }

  const filtered = detail.trendCards.filter((trend) => {
    const haystack = `${trend.title} ${trend.note} ${trend.value}`.toLowerCase();

    if (focusedMarket === "moneyline") {
      return /(moneyline|win|winner|dog|favorite)/.test(haystack);
    }

    if (focusedMarket === "spread") {
      return /(spread|ats|cover|line)/.test(haystack);
    }

    return /(total|over|under|points|runs)/.test(haystack);
  });

  return (filtered.length ? filtered : detail.trendCards).slice(0, 3);
}

function SummaryMetric({
  label,
  value,
  note
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-[1.05rem] border border-white/8 bg-slate-950/60 px-4 py-4">
      <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{note}</div>
    </div>
  );
}

export function FocusedMarketTrendPanel({
  detail,
  presentation,
  marketFocus
}: {
  detail: MatchupDetailView;
  presentation: GameHubPresentation;
  marketFocus: MarketFocus;
}) {
  const focusedMarket = resolveFocusedMarket(marketFocus, presentation);
  const focusedOpportunity = focusedMarket ? presentation.marketSupport[focusedMarket] : null;
  const intelligence = focusedOpportunity?.trendIntelligence ?? null;
  const trendCards = getMarketCards(detail, focusedMarket);
  const activeLenses =
    intelligence?.lenses.filter((lens) => lens.state !== "NOT_APPLICABLE").slice(0, 5) ?? [];
  const supportTone = getSupportTone(focusedOpportunity);

  return (
    <section id="support" className="grid gap-4">
      <SectionTitle
        eyebrow="Trend support"
        title={`${formatFocusLabel(focusedMarket)} support deck`}
        description="Focused market support ties the live price to the trend stack, source coverage, and risk posture instead of leaving trend notes floating on their own."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge tone={supportTone}>
              {intelligence
                ? `Support ${intelligence.intelligenceScore}`
                : detail.trendCards.length
                  ? `${detail.trendCards.length} attached signals`
                  : "Thin support"}
            </Badge>
            <Badge tone="muted">
              {focusedOpportunity?.sportsbookName ?? detail.currentOddsProvider ?? "Desk view"}
            </Badge>
          </div>
        }
      />

      <Card className="surface-panel p-6">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-4">
            <div>
              <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                Focused market
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="text-2xl font-semibold text-white">
                  {focusedOpportunity?.selectionLabel ?? `${formatFocusLabel(focusedMarket)} is not producing a qualified angle yet.`}
                </div>
                {focusedOpportunity ? (
                  <Badge tone={supportTone}>
                    {focusedOpportunity.actionState.toLowerCase().replace(/_/g, " ")}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-400">
                {intelligence?.summary ??
                  (trendCards.length
                    ? "Matchup trend notes exist, but the current market focus does not have enough structured support to promote a full conviction stack."
                    : "Trend support is thin here, so SharkEdge keeps the posture conservative.")}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryMetric
                label="Trend score"
                value={intelligence ? String(intelligence.intelligenceScore) : "—"}
                note={
                  intelligence
                    ? `${intelligence.supportiveLensCount} supportive vs ${intelligence.contraryLensCount} contrary lenses.`
                    : "No structured trend stack is attached to this focused market yet."
                }
              />
              <SummaryMetric
                label="Reliability"
                value={intelligence ? String(intelligence.reliabilityScore) : "—"}
                note={
                  intelligence
                    ? `${intelligence.activeLensCount} active lenses across the joined stack.`
                    : "Reliability stays blank until a real market-specific angle exists."
                }
              />
              <SummaryMetric
                label="Source coverage"
                value={intelligence ? `${intelligence.sourceCoverageScore}` : "—"}
                note={
                  intelligence?.sourceSummary ??
                  `${detail.providerHealth.label} is carrying the visible support context for this matchup.`
                }
              />
              <SummaryMetric
                label="Attached matchup cards"
                value={String(trendCards.length)}
                note={
                  trendCards.length
                    ? "Reusable matchup systems attached to this game page."
                    : "No matchup cards attached yet."
                }
              />
            </div>

            {activeLenses.length ? (
              <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4">
                <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                  Lens verdicts
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeLenses.map((lens) => (
                    <Badge key={lens.key} tone={formatLensTone(lens)}>
                      {lens.label} · {lens.state.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
                {intelligence?.topAngle ? (
                  <div className="mt-3 text-sm leading-6 text-slate-300">
                    {intelligence.topAngle}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4">
            <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4">
              <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                Why it is supported
              </div>
              <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">
                {focusedOpportunity?.trendIntelligence?.lenses
                  .filter((lens) => lens.state === "SUPPORTIVE" || lens.state === "MIXED")
                  .slice(0, 3)
                  .map((lens) => (
                    <div key={lens.key}>{lens.summary}</div>
                  ))}
                {!focusedOpportunity?.trendIntelligence?.lenses.some(
                  (lens) => lens.state === "SUPPORTIVE" || lens.state === "MIXED"
                ) ? (
                  <div>
                    Trend support is present mostly as matchup context, not as a strong market-specific push.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4">
              <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                What could break it
              </div>
              <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">
                {focusedOpportunity?.trendIntelligence?.lenses
                  .filter((lens) => lens.state === "CONTRARY" || lens.state === "PENDING_DATA")
                  .slice(0, 3)
                  .map((lens) => (
                    <div key={lens.key}>{lens.summary}</div>
                  ))}
                {!focusedOpportunity?.trendIntelligence?.lenses.some(
                  (lens) => lens.state === "CONTRARY" || lens.state === "PENDING_DATA"
                ) ? (
                  <div>
                    No major contrary lens is active right now, but the market still needs price discipline.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                  Attached matchup systems
                </div>
                <Link
                  href="/trends"
                  className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300"
                >
                  Open trends
                </Link>
              </div>
              <div className="mt-3 grid gap-3">
                {trendCards.length ? (
                  trendCards.map((trend) => (
                    <Link
                      key={trend.id}
                      href={trend.href ?? "/trends"}
                      className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3 transition hover:border-white/14 hover:bg-white/[0.05]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{trend.title}</div>
                          <div className="mt-1 text-sm leading-6 text-slate-400">{trend.note}</div>
                        </div>
                        <Badge tone={trend.tone}>{trend.value}</Badge>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="rounded-[1rem] border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-sm leading-6 text-slate-400">
                    No matchup system cards are attached to this event yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
