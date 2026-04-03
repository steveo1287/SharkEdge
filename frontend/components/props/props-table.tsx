import Link from "next/link";

import { BetActionButton } from "@/components/bets/bet-action-button";
import { DataTable } from "@/components/ui/data-table";
import type { PropCardView } from "@/lib/types/domain";
import { formatAmericanOdds, formatMarketType } from "@/lib/formatters/odds";
import { buildPropBetIntent, buildWagerMathView } from "@/lib/utils/bet-intelligence";

type PropsTableProps = {
  props: PropCardView[];
};

function renderValueFlag(flag: PropCardView["valueFlag"]) {
  if (!flag || flag === "NONE") {
    return "No flag";
  }

  return flag.replace(/_/g, " ");
}

export function PropsTable({ props }: PropsTableProps) {
  return (
    <DataTable
      columns={[
        "Player",
        "Matchup",
        "Market",
        "Best Price",
        "Edge",
        "Trend",
        "Market",
        "Actions"
      ]}
      rows={props.map((prop) => [
        (() => {
          const math = buildWagerMathView({
            offeredOddsAmerican: prop.bestAvailableOddsAmerican ?? prop.oddsAmerican,
            consensusOddsAmerican: prop.averageOddsAmerican
          });

          return (
            <div key={`${prop.id}-player`}>
              <div className="font-medium text-white">{prop.player.name}</div>
              <div className="text-xs text-slate-500">
                {prop.teamResolved ? prop.team.abbreviation : "Team mapping pending"}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Imp {typeof math.impliedProbabilityPct === "number" ? `${math.impliedProbabilityPct.toFixed(1)}%` : "--"}
                {" | "}
                Kelly {typeof math.kellyFractionPct === "number" ? `${math.kellyFractionPct.toFixed(1)}%` : "N/A"}
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
                <div className="mt-1 text-xs text-slate-500">
                  No-vig {typeof math.noVigProbabilityPct === "number" ? `${math.noVigProbabilityPct.toFixed(1)}%` : "N/A"}
                  {typeof prop.evProfile?.fairLineGap === "number"
                    ? ` | Gap ${prop.evProfile.fairLineGap > 0 ? "+" : ""}${prop.evProfile.fairLineGap}`
                    : ""}
                </div>
              </>
            );
          })()}
        </div>,
        <div key={`${prop.id}-trend`}>
          <div className="text-white">{prop.trendSummary?.value ?? "Trend floor pending"}</div>
          <div className="text-xs text-slate-500">
            {prop.trendSummary?.label ??
              prop.supportNote ??
              "Trend support is still building for this prop market."}
          </div>
          {prop.analyticsSummary?.tags?.length ? (
            <div className="mt-1 text-xs text-sky-300">
              {prop.analyticsSummary.tags.slice(0, 3).join(" | ")}
            </div>
          ) : null}
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
          {prop.analyticsSummary?.reason ? (
            <div className="mt-1 text-xs text-slate-500">{prop.analyticsSummary.reason}</div>
          ) : null}
        </div>,
        <div key={`${prop.id}-actions`} className="flex gap-2">
          <Link href={prop.gameHref ?? `/game/${prop.gameId}`} className="text-sky-300">
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
