import { BetActionButton } from "@/components/bets/bet-action-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { PropCardView } from "@/lib/types/domain";
import { formatAmericanOdds, formatMarketType } from "@/lib/formatters/odds";
import { buildPropBetIntent } from "@/lib/utils/bet-intelligence";

type TopPlaysPanelProps = {
  plays: PropCardView[];
};

export function TopPlaysPanel({ plays }: TopPlaysPanelProps) {
  if (!plays.length) {
    return null;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {plays.map((play) => (
        <Card key={play.id} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-sky-300">Top Play</div>
              <div className="mt-2 font-display text-2xl font-semibold text-white">
                {play.player.name}
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {play.gameLabel ?? `${play.team.abbreviation} vs ${play.opponent.abbreviation}`}
              </div>
            </div>
            <Badge tone="brand">{play.edgeScore.label}</Badge>
          </div>

          <div className="mt-4 grid gap-3 rounded-2xl border border-line bg-slate-950/55 p-4">
            <div className="text-sm text-white">
              {formatMarketType(play.marketType)} {play.side} {play.line}
            </div>
            <div className="text-sm text-slate-400">
              {play.bestAvailableSportsbookName ?? play.sportsbook.name} |{" "}
              {formatAmericanOdds(play.bestAvailableOddsAmerican ?? play.oddsAmerican)}
            </div>
            <div className="flex flex-wrap gap-2">
              {typeof play.expectedValuePct === "number" ? (
                <Badge tone={play.expectedValuePct > 0 ? "success" : "muted"}>
                  Market EV {play.expectedValuePct > 0 ? "+" : ""}
                  {play.expectedValuePct.toFixed(2)}%
                </Badge>
              ) : (
                <Badge tone="muted">EV unavailable</Badge>
              )}
              {typeof play.marketDeltaAmerican === "number" ? (
                <Badge tone="premium">
                  Delta {play.marketDeltaAmerican > 0 ? "+" : ""}
                  {play.marketDeltaAmerican}
                </Badge>
              ) : null}
              <Badge tone="muted">
                {play.valueFlag && play.valueFlag !== "NONE"
                  ? play.valueFlag.replace(/_/g, " ")
                  : "Book compare only"}
              </Badge>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <BetActionButton intent={buildPropBetIntent(play, "top_plays", "/")}>
              Add to slip
            </BetActionButton>
            <BetActionButton intent={buildPropBetIntent(play, "top_plays", "/")} mode="log">
              Log now
            </BetActionButton>
          </div>
        </Card>
      ))}
    </div>
  );
}
