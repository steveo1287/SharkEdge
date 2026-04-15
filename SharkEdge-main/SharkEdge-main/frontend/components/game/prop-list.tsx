import Link from "next/link";

import { OpportunityStateBadge } from "@/app/game/[id]/_components/game-hub-primitives";
import { BetActionButton } from "@/components/bets/bet-action-button";
import { IdentityTile } from "@/components/media/identity-tile";
import {
  getOpportunityTrapLine,
  OpportunityBadgeRow
} from "@/components/intelligence/opportunity-badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatAmericanOdds, formatMarketType } from "@/lib/formatters/odds";
import type {
  BoardSupportStatus,
  PropCardView,
  PropMarketType
} from "@/lib/types/domain";
import {
  buildPropBetIntent,
  getEdgeToneFromBand
} from "@/lib/utils/bet-intelligence";
import { getPlayerHeadshotUrl, getTeamLogoUrl } from "@/lib/utils/entity-routing";
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
  const playerHeadshot = getPlayerHeadshotUrl(prop.leagueKey, prop.player);
  const teamLogo = getTeamLogoUrl(prop.leagueKey, prop.team);
  const opponentLogo = getTeamLogoUrl(prop.leagueKey, prop.opponent);

  const fairLineDisplay =
    typeof prop.fairPrice?.fairOddsAmerican === "number"
      ? `${prop.fairPrice.fairOddsAmerican > 0 ? "+" : ""}${prop.fairPrice.fairOddsAmerican}`
      : "N/A";

  const confidenceDisplay =
    typeof prop.fairPrice?.pricingConfidenceScore === "number"
      ? `${prop.fairPrice.pricingConfidenceScore}`
      : "N/A";

  return (
    <Card className="surface-panel p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 flex items-start gap-3">
          <IdentityTile
            label={prop.player.name}
            shortLabel={prop.player.name.slice(0, 2).toUpperCase()}
            imageUrl={playerHeadshot}
            size="md"
            subtle
          />
          <div className="min-w-0">
            <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
              {prop.leagueKey} | {prop.gameLabel ?? `${prop.team.abbreviation} vs ${prop.opponent.abbreviation}`}
            </div>
            <div className="mt-2 text-xl font-semibold text-white sm:text-2xl">
              {prop.player.name}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-400">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">
                <IdentityTile
                  label={prop.team.name}
                  shortLabel={prop.team.abbreviation}
                  imageUrl={teamLogo}
                  size="sm"
                  subtle
                />
                <span>{prop.team.abbreviation}</span>
                <span className="text-slate-600">vs</span>
                <IdentityTile
                  label={prop.opponent.name}
                  shortLabel={prop.opponent.abbreviation}
                  imageUrl={opponentLogo}
                  size="sm"
                  subtle
                />
                <span>{prop.opponent.abbreviation}</span>
              </div>
            </div>
            <div className="mt-2 text-sm text-slate-400">
              {formatMarketType(prop.marketType)} {prop.side} {prop.line}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {formatValueFlag(prop.valueFlag) ? (
            <Badge tone="brand">{formatValueFlag(prop.valueFlag)}</Badge>
          ) : null}
          <Badge tone={getEdgeToneFromBand(prop.edgeScore.label)}>
            {prop.edgeScore.label}
          </Badge>
        </div>
      </div>

      <div className="mt-4">
        <OpportunityBadgeRow opportunity={opportunity} />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Best price
          </div>
          <div className="mt-2 text-base font-semibold text-white">
            {formatAmericanOdds(prop.bestAvailableOddsAmerican ?? prop.oddsAmerican)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {prop.bestAvailableSportsbookName ?? prop.sportsbook.name}
          </div>
        </div>

        <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            EV
          </div>
          <div className="mt-2 text-base font-semibold text-emerald-300">
            {typeof prop.expectedValuePct === "number"
              ? `${prop.expectedValuePct > 0 ? "+" : ""}${prop.expectedValuePct.toFixed(2)}%`
              : "N/A"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Expected edge at current price.
          </div>
        </div>

        <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Fair line
          </div>
          <div className="mt-2 text-base font-semibold text-white">
            {fairLineDisplay}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {prop.fairPrice?.pricingMethod
              ? prop.fairPrice.pricingMethod.replace(/_/g, " ")
              : "Fair price unavailable"}
          </div>
        </div>

        <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Confidence
          </div>
          <div className="mt-2 text-base font-semibold text-white">
            {confidenceDisplay}
          </div>
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

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href={matchupHref}
            className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-center text-sm font-medium text-sky-300"
          >
            Matchup
          </Link>
          <BetActionButton intent={buildPropBetIntent(prop, "matchup", matchupHref)}>
            Add to slip
          </BetActionButton>
          <BetActionButton
            intent={buildPropBetIntent(prop, "matchup", matchupHref)}
            mode="log"
          >
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
                {support.supportedMarkets
                  .map((market) => formatMarketType(market))
                  .join(", ")}
              </span>
            </div>
          ) : null
        }
      />
    );
  }

  const rankedProps = [...props]
    .map((prop) => ({ prop, opportunity: buildPropOpportunity(prop) }))
    .sort(
      (left, right) =>
        right.opportunity.opportunityScore - left.opportunity.opportunityScore
    );

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
        <Card className="surface-panel p-4 sm:p-5">
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            More matchup props
          </div>

          <div className="mt-4 grid gap-3">
            {restProps.map(({ prop, opportunity }) => {
              const matchupHref = prop.gameHref ?? `/game/${prop.gameId}`;
              const trapLine = getOpportunityTrapLine(opportunity);
              const playerHeadshot = getPlayerHeadshotUrl(prop.leagueKey, prop.player);

              return (
                <div
                  key={prop.id}
                  className="flex flex-col gap-4 rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <IdentityTile
                      label={prop.player.name}
                      shortLabel={prop.player.name.slice(0, 2).toUpperCase()}
                      imageUrl={playerHeadshot}
                      size="sm"
                      subtle
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">
                        {prop.player.name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {formatMarketType(prop.marketType)} {prop.side} {prop.line} | {formatAmericanOdds(
                          prop.bestAvailableOddsAmerican ?? prop.oddsAmerican
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {prop.bestAvailableSportsbookName ?? prop.sportsbook.name} | {trapLine ?? opportunity.reasonSummary}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <OpportunityStateBadge
                      actionState={opportunity.actionState}
                      label={opportunity.actionState.replace(/_/g, " ")}
                    />
                    <Badge tone={trapLine ? "danger" : "muted"}>
                      {opportunity.opportunityScore}
                    </Badge>
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
