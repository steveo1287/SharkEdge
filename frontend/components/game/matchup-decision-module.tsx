import Link from "next/link";

import {
  formatOpportunityAction,
  getConfidenceTone,
  getOpportunityScoreBand,
  getOpportunityTone
} from "@/components/intelligence/opportunity-badges";
import type { MatchupDecisionModuleView } from "@/services/matchups/game-hub-presenter";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { formatMarketType } from "@/lib/formatters/odds";
import type { MarketType } from "@/lib/types/domain";

const MARKET_TYPES = new Set<MarketType>([
  "spread",
  "moneyline",
  "total",
  "team_total",
  "player_points",
  "player_rebounds",
  "player_assists",
  "player_threes",
  "fight_winner",
  "method_of_victory",
  "round_total",
  "round_winner",
  "other"
]);

function formatDecisionMarketType(marketType: string) {
  return MARKET_TYPES.has(marketType as MarketType)
    ? formatMarketType(marketType as MarketType)
    : marketType;
}

function MetricCard({
  label,
  value,
  note
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4">
      <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{note}</div>
    </div>
  );
}

export function MatchupDecisionModule({
  decision
}: {
  decision: MatchupDecisionModuleView;
}) {
  if (!decision.headline) {
    return (
      <section id="decision" className="grid gap-4">
        <SectionTitle
          eyebrow="Decision module"
          title="Bet now, wait, or pass"
          description="One read for price, fair line, movement, and risk."
        />
        <Card className="surface-panel p-6">
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            No qualified edge
          </div>
          <div className="mt-3 text-2xl font-semibold text-white">
            Nothing has earned a real entry yet.
          </div>
          <div className="mt-3 text-sm leading-7 text-slate-400">
            {decision.changeSummary}
          </div>
          <div className="mt-4 rounded-[1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
            {decision.executionNote}
          </div>
        </Card>
      </section>
    );
  }

  const scoreBand = getOpportunityScoreBand(decision.headline.opportunityScore);

  return (
    <section id="decision" className="grid gap-4">
      <SectionTitle
        eyebrow="Decision module"
        title="Bet now, wait, or pass"
        description="One read for price, fair line, movement, and kill switches."
      />

      <Card className="surface-panel p-6">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-5">
            <div>
              <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                Best current angle
              </div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {decision.headline.selectionLabel}
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-400">
                {formatDecisionMarketType(decision.headline.marketType)} |{" "}
                {decision.headline.sportsbookName ?? "Best available book"}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge tone={getOpportunityTone(decision.headline.actionState)}>
                {formatOpportunityAction(decision.headline.actionState)}
              </Badge>
              <Badge tone={getConfidenceTone(decision.headline.confidenceTier)}>
                {decision.confidenceLabel}
              </Badge>
              <Badge tone={scoreBand.tone}>
                {scoreBand.label} {decision.headline.opportunityScore}
              </Badge>
              <Badge tone="muted">{decision.freshnessLabel}</Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Market price"
                value={decision.marketPriceLabel}
                note="Best current entry showing on the desk."
              />
              <MetricCard
                label="Fair price"
                value={decision.fairPriceLabel}
                note="Model or market-derived fair number."
              />
              <MetricCard
                label="Gap"
                value={decision.edgeGapLabel}
                note="Difference between market price and fair price."
              />
              <MetricCard
                label="Timing"
                value={decision.timingLabel}
                note="Execution posture for this number."
              />
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4">
              <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                What changed
              </div>
              <div className="mt-3 text-sm leading-7 text-slate-300">
                {decision.changeSummary}
              </div>
            </div>

            <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4">
              <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                Execution
              </div>
              <div className="mt-3 text-sm leading-7 text-slate-300">
                {decision.executionNote}
              </div>

              {decision.focusTarget ? (
                <div className="mt-4">
                  <Link
                    href={decision.focusTarget.href}
                    className="inline-flex rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-200"
                  >
                    {decision.focusTarget.label}
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <div className="rounded-[1.15rem] border border-emerald-400/15 bg-emerald-500/8 px-4 py-4">
            <div className="text-[0.66rem] uppercase tracking-[0.18em] text-emerald-200">
              Why it shows
            </div>
            <div className="mt-3 grid gap-2">
              {decision.whyNow.length ? (
                decision.whyNow.map((item) => (
                  <div key={item} className="text-sm leading-6 text-emerald-50">
                    {item}
                  </div>
                ))
              ) : (
                <div className="text-sm leading-6 text-emerald-50">
                  No extra supporting notes were attached.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[1.15rem] border border-rose-400/20 bg-rose-500/8 px-4 py-4">
            <div className="text-[0.66rem] uppercase tracking-[0.18em] text-rose-200">
              What could kill it
            </div>
            <div className="mt-3 grid gap-2">
              {decision.killSwitches.length ? (
                decision.killSwitches.map((item) => (
                  <div key={item} className="text-sm leading-6 text-rose-50">
                    {item}
                  </div>
                ))
              ) : (
                <div className="text-sm leading-6 text-rose-50">
                  No specific kill switch is attached yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
