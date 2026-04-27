import Link from "next/link";

import { BetActionButton } from "@/components/bets/bet-action-button";
import { MarketSparkline } from "@/components/charts/market-sparkline";
import { DataTable } from "@/components/ui/data-table";
import {
  getOpportunityScoreBand,
  getOpportunityTrapLine,
  OpportunityBadgeRow
} from "@/components/intelligence/opportunity-badges";
import type { PropCardView, PropMarketType } from "@/lib/types/domain";
import { formatAmericanOdds, formatMarketType } from "@/lib/formatters/odds";
import { buildPropBetIntent, buildWagerMathView } from "@/lib/utils/bet-intelligence";
import { resolveMatchupHref } from "@/lib/utils/entity-routing";
import { buildPropOpportunity } from "@/services/opportunities/opportunity-service";
import { buildPlayerSimV2 } from "@/services/simulation/player-sim-v2";
import { getSimTuning } from "@/services/simulation/get-sim-tuning";

type PropsTableProps = {
  props: PropCardView[];
};

type SimPropType = "Points" | "Rebounds" | "Assists" | "Threes" | "Strikeouts" | "Outs" | "Prop";

function renderValueFlag(flag: PropCardView["valueFlag"]) {
  if (!flag || flag === "NONE") {
    return "No flag";
  }

  return flag.replace(/_/g, " ");
}

function buildPropSparkline(prop: PropCardView) {
  return [
    prop.lineMovement,
    prop.bestAvailableOddsAmerican,
    prop.averageOddsAmerican,
    prop.marketDeltaAmerican,
    prop.evProfile?.fairLineGap
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function toPlayerSimPropType(marketType: PropMarketType): SimPropType {
  switch (marketType) {
    case "player_points":
      return "Points";
    case "player_rebounds":
      return "Rebounds";
    case "player_assists":
      return "Assists";
    case "player_threes":
      return "Threes";
    case "player_pitcher_strikeouts":
      return "Strikeouts";
    case "player_pitcher_outs":
      return "Outs";
    default:
      return "Prop";
  }
}

function estimateTeamTotal(prop: PropCardView) {
  if (prop.leagueKey === "NBA") return 112;
  if (prop.leagueKey === "NCAAB") return 72;
  if (prop.leagueKey === "NFL") return 23;
  if (prop.leagueKey === "NCAAF") return 30;
  if (prop.leagueKey === "NHL") return 3.1;
  if (prop.leagueKey === "MLB") return 4.5;
  return 1;
}

function estimateUsageRate(prop: PropCardView, simPropType: SimPropType) {
  const hitRate = typeof prop.recentHitRate === "number" ? prop.recentHitRate : null;
  const matchupBoost = typeof prop.matchupRank === "number" ? Math.max(-0.04, Math.min(0.04, (50 - prop.matchupRank) / 1000)) : 0;
  const base =
    simPropType === "Points" ? 0.24 :
    simPropType === "Rebounds" ? 0.18 :
    simPropType === "Assists" ? 0.16 :
    simPropType === "Threes" ? 0.10 :
    simPropType === "Strikeouts" ? 1.08 :
    simPropType === "Outs" ? 1.02 :
    0.20;
  const formBoost = hitRate == null ? 0 : Math.max(-0.05, Math.min(0.05, hitRate - 0.5));
  return Math.max(0.05, base + formBoost + matchupBoost);
}

function buildSimHref(prop: PropCardView, simPropType: SimPropType) {
  const params = new URLSearchParams({
    league: prop.leagueKey,
    prop: simPropType,
    player: prop.player.name,
    line: String(prop.line),
    odds: String(prop.bestAvailableOddsAmerican ?? prop.oddsAmerican),
    propId: prop.id
  });

  if (prop.gameId) params.set("gameId", prop.gameId);
  if (prop.team?.abbreviation) params.set("team", prop.team.abbreviation);
  if (prop.opponent?.abbreviation) params.set("opponent", prop.opponent.abbreviation);

  return `/sim/players?${params.toString()}`;
}

async function buildLiveSimEdge(prop: PropCardView) {
  const simPropType = toPlayerSimPropType(prop.marketType);
  const bookOdds = prop.bestAvailableOddsAmerican ?? prop.oddsAmerican;
  const tuning = await getSimTuning();
  const minutes = typeof prop.minutes === "number" ? prop.minutes : 34;

  const sim = buildPlayerSimV2({
    player: prop.player.name,
    propType: simPropType,
    line: prop.line,
    odds: bookOdds,
    teamTotal: estimateTeamTotal(prop),
    minutes,
    usageRate: estimateUsageRate(prop, simPropType),
    opponentRank: typeof prop.matchupRank === "number" ? prop.matchupRank : undefined,
  }, tuning);

  const side = String(prop.side ?? "").toLowerCase();
  const sideProbability = side.includes("under") ? 1 - sim.calibratedProbability : sim.calibratedProbability;
  const displayEdge = sim.edgePct;
  const label = sim.decision;

  return {
    projection: sim,
    simPropType,
    href: buildSimHref(prop, simPropType),
    displayEdge,
    sideProbability,
    label
  };
}

export async function PropsTable({ props }: PropsTableProps) {
  // Pre-compute sim edges for all props
  const simEdges = await Promise.all(props.map(prop => buildLiveSimEdge(prop)));
  const simEdgeMap = new Map(props.map((prop, i) => [prop.id, simEdges[i]]));

  return (
    <DataTable
      columns={[
        "Player",
        "Matchup",
        "Market",
        "Best Price",
        "Edge",
        "Opportunity",
        "Trend",
        "Market",
        "Sim Edge",
        "Actions"
      ]}
      rows={props.map((prop) => [
        (() => {
          const opportunity = buildPropOpportunity(prop);
          const scoreBand = getOpportunityScoreBand(opportunity.opportunityScore);
          return (
            <div key={`${prop.id}-player`}>
              <div className="font-medium text-white">{prop.player.name}</div>
              <div className="concept-meta mt-1">
                {prop.teamResolved ? prop.team.abbreviation : "Team mapping pending"}
              </div>
              <div className="mt-2 text-xs text-sky-300">
                {scoreBand.label} {opportunity.opportunityScore} | {opportunity.actionState.replace(/_/g, " ")}
              </div>
            </div>
          );
        })(),
        <div key={`${prop.id}-matchup`}>
          <div className="text-white">
            {prop.gameLabel ?? `${prop.team.abbreviation} vs ${prop.opponent.abbreviation}`}
          </div>
          <div className="text-xs text-slate-500">
            {prop.leagueKey} {prop.teamResolved ? "| Matchup-linked" : "| Mapping pending"}
          </div>
        </div>,
        <div key={`${prop.id}-market`}>
          <div className="text-white">{formatMarketType(prop.marketType)} {prop.side}</div>
          <div className="text-xs text-slate-500">{prop.line}</div>
        </div>,
        <div key={`${prop.id}-best`}>
          <div className="text-white">
            {formatAmericanOdds(prop.bestAvailableOddsAmerican ?? prop.oddsAmerican)}
          </div>
          <div className="text-xs text-slate-500">
            {prop.bestAvailableSportsbookName ?? prop.sportsbook.name}
          </div>
        </div>,
        <div key={`${prop.id}-ev`}>
          {(() => {
            const math = buildWagerMathView({
              offeredOddsAmerican: prop.bestAvailableOddsAmerican ?? prop.oddsAmerican,
              consensusOddsAmerican: prop.averageOddsAmerican,
              modelProbability: prop.fairPrice?.fairProb ?? undefined
            });

            return (
              <>
                <div className="text-white">
                  {typeof prop.expectedValuePct === "number"
                    ? `${prop.expectedValuePct > 0 ? "+" : ""}${prop.expectedValuePct.toFixed(2)}%`
                    : "Unavailable"}
                </div>
                <div className="text-xs text-slate-500">
                  {prop.fairPrice
                    ? `${prop.fairPrice.pricingMethod.replace(/_/g, " ")} | conf ${prop.fairPrice.pricingConfidenceScore}`
                    : typeof prop.marketDeltaAmerican === "number"
                      ? `Delta ${prop.marketDeltaAmerican > 0 ? "+" : ""}${prop.marketDeltaAmerican}`
                      : "No consensus delta"}
                </div>
                {typeof prop.evProfile?.fairLineGap === "number" || typeof math.noVigProbabilityPct === "number" ? (
                  <div className="mt-1 text-xs text-slate-500">
                    {typeof prop.evProfile?.fairLineGap === "number"
                      ? `Gap ${prop.evProfile.fairLineGap > 0 ? "+" : ""}${prop.evProfile.fairLineGap}`
                      : "Gap pending"}
                    {typeof math.noVigProbabilityPct === "number"
                      ? ` | No-vig ${math.noVigProbabilityPct.toFixed(1)}%`
                      : ""}
                  </div>
                ) : null}
              </>
            );
          })()}
        </div>,
        (() => {
          const opportunity = buildPropOpportunity(prop);
          const trapLine = getOpportunityTrapLine(opportunity);
          return (
            <div key={`${prop.id}-opportunity`} className="grid gap-2">
              <OpportunityBadgeRow opportunity={opportunity} />
              <div className={`text-xs ${trapLine ? "text-rose-200" : "text-slate-500"}`}>
                {trapLine ?? opportunity.reasonSummary}
              </div>
            </div>
          );
        })(),
        <div key={`${prop.id}-trend`}>
          <div className="text-white">{prop.trendSummary?.value ?? "Trend floor pending"}</div>
          <div className="text-xs text-slate-500">
            {prop.trendSummary?.label ??
              prop.supportNote ??
              "Trend support is still building for this prop market."}
          </div>
          {prop.trendSummary?.href ? (
            <Link href={prop.trendSummary.href} className="text-xs text-sky-300">
              Open trend
            </Link>
          ) : null}
        </div>,
        <div key={`${prop.id}-signal`}>
          <div className="text-white">{renderValueFlag(prop.valueFlag)}</div>
          <div className="text-xs text-slate-500">
            {prop.supportStatus ?? "LIVE"} | {prop.sportsbookCount ?? 1} book{(prop.sportsbookCount ?? 1) === 1 ? "" : "s"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {typeof prop.averageOddsAmerican === "number"
              ? `Avg ${formatAmericanOdds(prop.averageOddsAmerican)}`
              : "Market avg pending"}
            {typeof prop.lineMovement === "number"
              ? ` | Move ${prop.lineMovement > 0 ? "+" : ""}${prop.lineMovement.toFixed(1)}`
              : ""}
          </div>
        </div>,
        (() => {
          const sim = simEdgeMap.get(prop.id);
          if (!sim) return <div>Sim unavailable</div>;
          const positive = sim.displayEdge > 0;
          return (
            <div key={`${prop.id}-sim-edge`} className="min-w-[116px]">
              <div className={positive ? "font-mono text-sm font-semibold text-emerald-300" : "font-mono text-sm font-semibold text-rose-300"}>
                {sim.displayEdge > 0 ? "+" : ""}{sim.displayEdge.toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500">
                {sim.label} | {sim.simPropType}
              </div>
              <div className="text-xs text-slate-500">
                Sim {((sim.sideProbability ?? 0) * 100).toFixed(1)}% | fair {formatAmericanOdds(sim.projection.fairOdds)}
              </div>
              <Link href={sim.href} className="mt-1 inline-flex rounded-md border border-sky-400/25 bg-sky-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.10em] text-sky-300 hover:bg-sky-500/15">
                Sim Edge
              </Link>
            </div>
          );
        })(),
        <div key={`${prop.id}-actions`} className="flex gap-2">
          <div className="hidden min-w-[88px] items-center justify-end lg:flex">
            <MarketSparkline values={buildPropSparkline(prop)} compact />
          </div>
          <Link
            href={
              resolveMatchupHref({
                leagueKey: prop.leagueKey,
                externalEventId: prop.gameId,
                fallbackHref: prop.gameHref ?? null
              }) ?? "/props"
            }
            className="concept-chip concept-chip-muted"
          >
            Game
          </Link>
          <BetActionButton intent={buildPropBetIntent(prop, "props", "/props")} className="px-3 py-1.5 text-xs">
            Slip
          </BetActionButton>
          <BetActionButton
            intent={buildPropBetIntent(prop, "props", "/props")}
            mode="log"
            className="px-3 py-1.5 text-xs"
          >
            Log
          </BetActionButton>
        </div>
      ])}
    />
  );
}
