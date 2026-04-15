import { BetActionButton } from "@/components/bets/bet-action-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { PropCardView } from "@/lib/types/domain";
import { formatAmericanOdds, formatMarketType } from "@/lib/formatters/odds";
import { buildPropBetIntent, buildWagerMathView } from "@/lib/utils/bet-intelligence";

type TopPlaysPanelProps = {
  plays: PropCardView[];
};

export function TopPlaysPanel({ plays }: TopPlaysPanelProps) {
  if (!plays.length) {
    return null;
  }

  return (
    <div className="grid gap-4">
      {plays.map((play, index) => (
        <Card key={play.id} className="surface-panel overflow-hidden p-0">
          {(() => {
            const math = buildWagerMathView({
              offeredOddsAmerican: play.bestAvailableOddsAmerican ?? play.oddsAmerican,
              consensusOddsAmerican: play.averageOddsAmerican
            });

            return (
              <>
                <div className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1.1fr)_130px_140px_180px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={index === 0 ? "premium" : "brand"}>
                        {index === 0 ? "Headliner" : `Play ${index + 1}`}
                      </Badge>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        {play.leagueKey}
                      </div>
                    </div>
                    <div className="mt-3 line-clamp-2 font-display text-2xl font-semibold text-white">
                      {play.player.name}
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-400">
                      {play.gameLabel ?? `${play.team.abbreviation} vs ${play.opponent.abbreviation}`}
                    </div>
                    <div className="mt-3 text-base font-medium text-white">
                      {formatMarketType(play.marketType)} {play.side} {play.line}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {typeof play.expectedValuePct === "number" ? (
                        <Badge tone={play.expectedValuePct > 0 ? "success" : "muted"}>
                          EV {play.expectedValuePct > 0 ? "+" : ""}
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
                      {typeof play.analyticsSummary?.clvProxyPct === "number" ? (
                        <Badge tone={play.analyticsSummary.clvProxyPct >= 0 ? "success" : "danger"}>
                          CLV proxy {play.analyticsSummary.clvProxyPct >= 0 ? "+" : ""}
                          {play.analyticsSummary.clvProxyPct.toFixed(1)}%
                        </Badge>
                      ) : null}
                      <Badge tone="muted">
                        {play.valueFlag && play.valueFlag !== "NONE"
                          ? play.valueFlag.replace(/_/g, " ")
                          : "Book compare"}
                      </Badge>
                    </div>
                  </div>

                  <div className="rounded-[1.15rem] border border-line bg-slate-950/55 px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Best price</div>
                    <div className="mt-3 text-2xl font-semibold text-white">
                      {formatAmericanOdds(play.bestAvailableOddsAmerican ?? play.oddsAmerican)}
                    </div>
                    <div className="mt-2 text-sm text-slate-400">
                      {play.bestAvailableSportsbookName ?? play.sportsbook.name}
                    </div>
                  </div>

                  <div className="rounded-[1.15rem] border border-line bg-slate-950/55 px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Market math</div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-300">
                      <div className="flex items-center justify-between gap-3">
                        <span>Implied</span>
                        <span className="text-white">
                          {typeof math.impliedProbabilityPct === "number"
                            ? `${math.impliedProbabilityPct.toFixed(1)}%`
                            : "--"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>No-vig</span>
                        <span className="text-white">
                          {typeof math.noVigProbabilityPct === "number"
                            ? `${math.noVigProbabilityPct.toFixed(1)}%`
                            : "N/A"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Kelly</span>
                        <span className="text-white">
                          {typeof math.kellyFractionPct === "number"
                            ? `${math.kellyFractionPct.toFixed(1)}%`
                            : "N/A"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between gap-4 rounded-[1.15rem] border border-line bg-slate-950/55 px-4 py-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-sky-300">
                        Why it stays on the desk
                      </div>
                      <div className="mt-3 line-clamp-4 text-sm leading-6 text-slate-300">
                        {play.analyticsSummary?.reason ??
                          (typeof play.expectedValuePct === "number"
                            ? "Positive market EV and cross-book pricing still support the current number."
                            : "Line movement and book comparison still show enough signal to keep it on the desk.")}
                      </div>
                      {typeof play.analyticsSummary?.clvProxyPct === "number" ? (
                        <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                          {play.analyticsSummary.clvProxyPct >= 0
                            ? `Historical proxy says this profile tends to beat the close by ${play.analyticsSummary.clvProxyPct.toFixed(1)}%.`
                            : `Historical proxy says this profile trails the close by ${Math.abs(play.analyticsSummary.clvProxyPct).toFixed(1)}%.`}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <BetActionButton intent={buildPropBetIntent(play, "top_plays", "/")}>
                        Add to slip
                      </BetActionButton>
                      <BetActionButton intent={buildPropBetIntent(play, "top_plays", "/")} mode="log">
                        Log now
                      </BetActionButton>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </Card>
      ))}
    </div>
  );
}
