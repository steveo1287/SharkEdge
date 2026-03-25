import Link from "next/link";

import { BetActionButton } from "@/components/bets/bet-action-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { BoardSupportStatus, PropCardView, PropMarketType } from "@/lib/types/domain";
import { formatAmericanOdds, formatMarketType } from "@/lib/formatters/odds";
import { buildPropBetIntent } from "@/lib/utils/bet-intelligence";

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

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={getTone(support.status)}>Props {support.status}</Badge>
        {support.supportedMarkets.slice(0, 4).map((market) => (
          <Badge key={market} tone="muted">
            {formatMarketType(market)}
          </Badge>
        ))}
      </div>

      {props.map((prop) => (
        <Card key={prop.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {prop.gameLabel ?? `${prop.team.abbreviation} vs ${prop.opponent.abbreviation}`}
              </div>
              <div className="mt-2 font-display text-2xl font-semibold text-white">
                {prop.player.name}
              </div>
              <div className="mt-1 text-sm text-slate-400">
                {formatMarketType(prop.marketType)} | {prop.side} {prop.line}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {formatValueFlag(prop.valueFlag) ? (
                <Badge tone="brand">{formatValueFlag(prop.valueFlag)}</Badge>
              ) : null}
              <Badge tone="premium">
                {prop.bestAvailableSportsbookName ?? prop.sportsbook.name}
              </Badge>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Best price</div>
              <div className="mt-2 text-lg font-medium text-white">
                {formatAmericanOdds(prop.bestAvailableOddsAmerican ?? prop.oddsAmerican)}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Books</div>
              <div className="mt-2 text-lg font-medium text-white">
                {prop.sportsbookCount ?? 1}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Line movement
              </div>
              <div className="mt-2 text-lg font-medium text-white">
                {typeof prop.lineMovement === "number"
                  ? `${prop.lineMovement > 0 ? "+" : ""}${prop.lineMovement.toFixed(1)}`
                  : "Pending"}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {typeof prop.expectedValuePct === "number" ? (
              <Badge tone={prop.expectedValuePct > 0 ? "success" : "muted"}>
                Market EV {prop.expectedValuePct > 0 ? "+" : ""}
                {prop.expectedValuePct.toFixed(2)}%
              </Badge>
            ) : (
              <Badge tone="muted">EV unavailable</Badge>
            )}
            {typeof prop.marketDeltaAmerican === "number" ? (
              <Badge tone="premium">
                Delta {prop.marketDeltaAmerican > 0 ? "+" : ""}
                {prop.marketDeltaAmerican}
              </Badge>
            ) : null}
            <Badge tone="muted">{prop.edgeScore.label} {prop.edgeScore.score}</Badge>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm text-slate-300">
              {prop.supportNote ?? support.note}
            </div>
            <div className="flex gap-3">
              <Link
                href={prop.gameHref ?? `/game/${prop.gameId}`}
                className="rounded-2xl border border-line px-4 py-2 text-sm text-slate-300"
              >
                Matchup
              </Link>
              <BetActionButton intent={buildPropBetIntent(prop, "matchup", prop.gameHref ?? "/game")}>
                Add to slip
              </BetActionButton>
              <BetActionButton
                intent={buildPropBetIntent(prop, "matchup", prop.gameHref ?? "/game")}
                mode="log"
              >
                Log bet
              </BetActionButton>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
