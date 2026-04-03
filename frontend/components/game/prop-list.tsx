import Link from "next/link";

import { BetActionButton } from "@/components/bets/bet-action-button";
import {
  getOpportunityTrapLine,
  OpportunityBadgeRow
} from "@/components/intelligence/opportunity-badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { BoardSupportStatus, PropCardView, PropMarketType } from "@/lib/types/domain";
import { formatAmericanOdds, formatMarketType } from "@/lib/formatters/odds";
import {
  buildPropBetIntent,
  getEdgeToneFromBand
} from "@/lib/utils/bet-intelligence";
import { buildPropOpportunity } from "@/services/opportunities/opportunity-service";

type PropListProps = {
  props: PropCardView[];
  support: {
    status: BoardSupportStatus;
    note: string;
    supportedMarkets: PropMarketType[];
  };
};

function getTone(status: BoardSupportStatus) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

function formatValueFlag(flag: PropCardView["valueFlag"]) {
  if (!flag || flag === "NONE") {
    return null;
  }

  return flag.replace(/_/g, " ");
}

function FeaturedPropCard({ prop }: { prop: PropCardView }) {
  const matchupHref = prop.gameHref ?? `/game/${prop.gameId}`;
  const opportunity = buildPropOpportunity(prop);
  const trapLine = getOpportunityTrapLine(opportunity);
  const fairLineDisplay =
    typeof prop.fairPrice?.fairOddsAmerican === "number"
      ? `${prop.fairPrice.fairOddsAmerican > 0 ? "+" : ""}${prop.fairPrice.fairOddsAmerican}`
      : "N/A";
  const confidenceDisplay =
    typeof prop.fairPrice?.pricingConfidenceScore === "number"
      ? `${prop.fairPrice.pricingConfidenceScore}`
      : "N/A";

  return (
    <Card className="surface-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            {prop.leagueKey} | {prop.gameLabel ?? `${prop.team.abbreviation} vs ${prop.opponent.abbreviation}`}
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">{prop.player.name}</div>
          <div className="mt-2 text-sm text-slate-400">
            {formatMarketType(prop.marketType)} {prop.side} {prop.line}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {formatValueFlag(prop.valueFlag) ? <Badge tone="brand">{formatValueFlag(prop.valueFlag)}</Badge> : null}
          <Badge tone={getEdgeToneFromBand(prop.edgeScore.label)}>{prop.edgeScore.label}</Badge>
        </div>
      </div>

      <div className="mt-4">
        <OpportunityBadgeRow opportunity={opportunity} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Best price</div>
          <div className="mt-2 text-base font-semibold text-white">
            {formatAmericanOdds(prop.bestAvailableOddsAmerican ?? prop.oddsAmerican)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {prop.bestAvailableSportsbookName ?? prop.sportsbook.name}
          </div>
        </div>
        <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">EV</div>
          <div className="mt-2 text-base font-semibold text-emerald-300">
            {typeof prop.expectedValuePct === "number"
              ? `${prop.expectedValuePct > 0 ? "+" : ""}${prop.expectedValuePct.toFixed(2)}%`
              : "N/A"}
          </div>
          <div className="mt-1 text-xs text-slate-500">Expected edge at current price.</div>
        </div>
        <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Fair line</div>
          <div className="mt-2 text-base font-semibold text-white">{fairLineDisplay}</div>
          <div className="mt-1 text-xs text-slate-500">
            {prop.fairPrice?.pricingMethod ? prop.fairPrice.pricingMethod.replace(/_/g, " ") : "Fair price unavailable"}
          </div>
        </div>
        <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Confidence</div>
          <div className="mt-2 text-base font-semibold text-white">{confidenceDisplay}</div>
          <div className="mt-1 text-xs text-slate-500">Pricing trust only.</div>
        </div>
      </div>

      <div className="mt-4 rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
        {opportunity.reasonSummary}
      </div>

      {trapLine ? (
        <div className="mt-4 rounded-[1.15rem] border border-rose-400/20 bg-rose-500/8 px-4 py-3 text-sm leading-6 text-rose-100">
          <span className="text-rose-200/75">Trap line:</span> {trapLine}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {typeof prop.marketDeltaAmerican === "number" ? (
            <Badge tone="premium">
              Delta {prop.marketDeltaAmerican > 0 ? "+" : ""}
              {prop.marketDeltaAmerican}
            </Badge>
          ) : null}
          {typeof prop.lineMovement === "number" ? (
            <Badge tone="muted">
              Move {prop.lineMovement > 0 ? "+" : ""}
              {prop.lineMovement.toFixed(1)}
            </Badge>
          ) : null}
          {prop.trendSummary ? <Badge tone="brand">{prop.trendSummary.label}</Badge> : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={matchupHref}
            className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
          >
            Matchup
          </Link>
          <BetActionButton intent={buildPropBetIntent(prop, "matchup", matchupHref)}>Add to slip</BetActionButton>
          <BetActionButton intent={buildPropBetIntent(prop, "matchup", matchupHref)} mode="log">
            Log now
          </BetActionButton>
        </div>
      </div>
    </Card>
  );
}

export function PropList({ props, support }: PropListProps) {
  if (!props.length) {
    return (
      <EmptyState
        title={`Props ${support.status.toLowerCase().replace("_", " ")}`}
        description={support.note}
        action={
          support.supportedMarkets.length ? (
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Supported markets:{" "}
              <span className="text-slate-300">
                {support.supportedMarkets.map((market) => formatMarketType(market)).join(", ")}
              </span>
            </div>
          ) : null
        }
      />
    );
  }

  const rankedProps = [...props]
    .map((prop) => ({ prop, opportunity: buildPropOpportunity(prop) }))
    .sort((left, right) => right.opportunity.opportunityScore - left.opportunity.opportunityScore);
  const featuredProps = rankedProps.slice(0, 3).map((entry) => entry.prop);
  const restProps = rankedProps.slice(3, 10);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={getTone(support.status)}>Props {support.status}</Badge>
        {support.supportedMarkets.slice(0, 4).map((market) => (
          <Badge key={market} tone="muted">
            {formatMarketType(market)}
          </Badge>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {featuredProps.map((prop) => (
          <FeaturedPropCard key={prop.id} prop={prop} />
        ))}
      </div>

      {restProps.length ? (
        <Card className="surface-panel p-5">
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">More matchup props</div>
          <div className="mt-4 grid gap-3">
            {restProps.map(({ prop, opportunity }) => {
              const matchupHref = prop.gameHref ?? `/game/${prop.gameId}`;
              const trapLine = getOpportunityTrapLine(opportunity);

              return (
                <div
                  key={prop.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{prop.player.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatMarketType(prop.marketType)} {prop.side} {prop.line} | {formatAmericanOdds(prop.bestAvailableOddsAmerican ?? prop.oddsAmerican)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {prop.bestAvailableSportsbookName ?? prop.sportsbook.name} | {trapLine ?? opportunity.reasonSummary}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={opportunity.actionState === "BET_NOW" ? "success" : opportunity.actionState === "WAIT" ? "brand" : opportunity.actionState === "WATCH" ? "premium" : "muted"}>
                      {opportunity.actionState.replace(/_/g, " ")}
                    </Badge>
                    <Badge tone={trapLine ? "danger" : "muted"}>{opportunity.opportunityScore}</Badge>
                    <Link
                      href={matchupHref}
                      className="rounded-full border border-line px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300"
                    >
                      Matchup
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
