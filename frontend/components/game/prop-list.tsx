import Link from "next/link";

import { BetActionButton } from "@/components/bets/bet-action-button";
import {
  getOpportunityTrapLine,
  OpportunityActionBadge,
  OpportunityBadgeRow,
  OpportunityScoreBadge
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
  spotlightPropId?: string | null;
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

function FeaturedPropCard({
  prop,
  spotlight = false
}: {
  prop: PropCardView;
  spotlight?: boolean;
}) {
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
    <Card
      id={`prop-${prop.id}`}
      className={
        spotlight
          ? "surface-panel border-sky-400/20 bg-[linear-gradient(180deg,rgba(56,189,248,0.08),rgba(10,20,34,0.96))] p-5"
          : "surface-panel p-5"
      }
    >
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
          {spotlight ? <Badge tone="success">Decision target</Badge> : null}
          {formatValueFlag(prop.valueFlag) ? (
            <Badge tone="brand">{formatValueFlag(prop.valueFlag)}</Badge>
          ) : null}
          <Badge tone={getEdgeToneFromBand(prop.edgeScore.label)}>{prop.edgeScore.label}</Badge>
        </div>
      </div>

      <div className="mt-4">
        <OpportunityBadgeRow opportunity={opportunity} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
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
            {prop.fairPrice?.pricingMethod
              ? prop.fairPrice.pricingMethod.replace(/_/g, " ")
              : "Fair price unavailable"}
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
          <BetActionButton intent={buildPropBetIntent(prop, "matchup", matchupHref)}>
            Add to slip
          </BetActionButton>
          <Bet