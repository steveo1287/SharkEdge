import { BetActionButton } from "@/components/bets/bet-action-button";
import { MarketSparkline } from "@/components/charts/market-sparkline";
import {
  getOpportunityTrapLine,
  OpportunityBadgeRow
} from "@/components/intelligence/opportunity-badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { MatchupDetailView } from "@/lib/types/domain";
import {
  buildSignalBetIntent,
  getEdgeToneFromBand
} from "@/lib/utils/bet-intelligence";
import { buildBetSignalOpportunity } from "@/services/opportunities/opportunity-service";

type OverviewPanelProps = {
  detail: MatchupDetailView;
};

function getSupportTone(status: MatchupDetailView["supportStatus"]) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

function MiniMetric({
  label,
  value,
  note
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="concept-metric">
      <div className="concept-meta">{label}</div>
      <div className="mt-2 text-base font-semibold text-white">{value}</div>
      {note ? <div className="mt-2 text-xs leading-5 text-slate-500">{note}</div> : null}
    </div>
  );
}

function buildSignalSparkline(signal: MatchupDetailView["betSignals"][number]) {
  const movement = signal.marketIntelligence?.lineMovement;
  const values = [
    movement?.openLine,
    movement?.currentLine,
    movement?.openPrice,
    movement?.currentPrice
  ];

  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function SignalCard({
  detail,
  signal,
  featured = false
}: {
  detail: MatchupDetailView;
  signal: MatchupDetailView["betSignals"][number];
  featured?: boolean;
}) {
  const displayEvPct =
    typeof signal.expectedValuePct === "number"
      ? signal.expectedValuePct
      : typeof signal.evProfile?.evPerUnit === "number"
        ? Number((signal.evProfile.evPerUnit * 100).toFixed(2))
        : null;
  const fairLineDisplay =
    typeof signal.fairPrice?.fairOddsAmerican === "number"
      ? `${signal.fairPrice.fairOddsAmerican > 0 ? "+" : ""}${signal.fairPrice.fairOddsAmerican}`
      : "N/A";
  const stakePct =
    typeof signal.evProfile?.kellyFraction === "number"
      ? `${(signal.evProfile.kellyFraction * 100).toFixed(1)}%`
      : "Suppressed";
  const opportunity = buildBetSignalOpportunity(signal, detail.league.key, detail.providerHealth);
  const trapLine = getOpportunityTrapLine(opportunity);

  return (
    <div
      className={
        featured
          ? "concept-panel concept-panel-accent p-5"
          : "concept-panel concept-panel-default p-4"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="concept-meta">
            {signal.marketLabel}
          </div>
          <div className="mt-2 text-lg font-semibold leading-tight text-white">{signal.selection}</div>
          <div className="mt-2 text-sm text-slate-400">
            {signal.sportsbookName ?? "Book pending"} | {signal.oddsAmerican > 0 ? "+" : ""}
            {signal.oddsAmerican}
          </div>
        </div>
        <Badge tone={getEdgeToneFromBand(signal.edgeScore.label)}>{signal.edgeScore.label}</Badge>
      </div>

      <div className="mt-4">
        <OpportunityBadgeRow opportunity={opportunity} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniMetric
          label="EV"
          value={typeof displayEvPct === "number" ? `${displayEvPct > 0 ? "+" : ""}${displayEvPct.toFixed(2)}%` : "N/A"}
        />
        <MiniMetric
          label="Fair line"
          value={fairLineDisplay}
        />
        <MiniMetric
          label="Stake guide"
          value={stakePct}
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
        <div className="min-w-0 text-sm leading-6 text-slate-300">{opportunity.reasonSummary}</div>
        <div className="hidden shrink-0 md:block">
          <MarketSparkline values={buildSignalSparkline(signal)} compact />
        </div>
      </div>

      {trapLine ? (
        <div className="mt-4 rounded-[1.15rem] border border-rose-400/20 bg-rose-500/8 px-4 py-3 text-sm leading-6 text-rose-100">
          <span className="text-rose-200/75">Trap line:</span> {trapLine}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <BetActionButton
          intent={buildSignalBetIntent(signal, detail.league.key, `/game/${detail.routeId}`)}
        >
          Add to slip
        </BetActionButton>
        <BetActionButton
          intent={buildSignalBetIntent(signal, detail.league.key, `/game/${detail.routeId}`)}
          mode="log"
        >
          Log now
        </BetActionButton>
      </div>
    </div>
  );
}

export function OverviewPanel({ detail }: OverviewPanelProps) {
  const featuredSignals = detail.betSignals.slice(0, 2);
  const additionalSignals = detail.betSignals.slice(2, 6);
  const marketContext = [
    detail.hasVerifiedOdds
      ? `${detail.books.length} books currently mapped into this matchup view.`
      : "No verified odds table is exposed yet for this matchup.",
    detail.currentOddsProvider ? `Current pricing source: ${detail.currentOddsProvider}.` : null,
    detail.historicalOddsProvider ? `Historical movement source: ${detail.historicalOddsProvider}.` : null,
    detail.propsSupport.note
  ].filter(Boolean) as string[];

  return (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <Card className="surface-panel p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={getSupportTone(detail.supportStatus)}>{detail.supportStatus}</Badge>
          {detail.hasVerifiedOdds && detail.currentOddsProvider ? (
            <Badge tone="brand">{detail.currentOddsProvider}</Badge>
          ) : null}
          {detail.propsSupport.supportedMarkets.length ? (
            <Badge tone="premium">
              {detail.propsSupport.supportedMarkets.length} prop market
              {detail.propsSupport.supportedMarkets.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4">
          {featuredSignals.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {featuredSignals.map((signal, index) => (
                <SignalCard
                  key={signal.id}
                  detail={detail}
                  signal={signal}
                  featured={index === 0}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[1.35rem] border border-white/8 bg-slate-950/60 px-4 py-4 text-sm leading-7 text-slate-400">
              No live betting signals are qualified for this matchup yet. SharkEdge keeps the slot quiet instead of forcing fake conviction.
            </div>
          )}

          {additionalSignals.length ? (
            <div className="concept-panel concept-panel-muted p-4">
              <div className="concept-meta">
                Secondary signals
              </div>
              <div className="mt-3 grid gap-2">
                {additionalSignals.map((signal) => {
                  const opportunity = buildBetSignalOpportunity(signal, detail.league.key, detail.providerHealth);
                  const trapLine = getOpportunityTrapLine(opportunity);
                  return (
                    <div
                      key={signal.id}
                      className="concept-list-row"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-white">{signal.selection}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {signal.marketLabel} | {signal.sportsbookName ?? "Book pending"} | {signal.oddsAmerican > 0 ? "+" : ""}
                            {signal.oddsAmerican}
                          </div>
                        </div>
                        <div className="text-xs text-sky-300">
                          {opportunity.actionState.replace(/_/g, " ")} | {opportunity.opportunityScore}
                        </div>
                      </div>
                      <div className="mt-3 hidden md:block">
                        <OpportunityBadgeRow opportunity={opportunity} />
                      </div>
                      <div className={`mt-3 text-sm leading-6 ${trapLine ? "text-rose-100" : "text-slate-300"}`}>
                        {trapLine ?? opportunity.reasonSummary}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4">
        <Card className="surface-panel p-5">
          <div className="concept-meta">Market context</div>
          <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-300">
            {marketContext.map((item) => (
              <div
                key={item}
                className="concept-list-row"
              >
                {item}
              </div>
            ))}
          </div>
        </Card>

        {detail.nbaModel?.available ? (
          <Card className="surface-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="concept-meta">
                Model pulse
              </div>
              <Badge tone="brand">{detail.nbaModel.source}</Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MiniMetric
                label="Adj margin"
                value={
                  typeof detail.nbaModel.adjustedEfficiencyMargin === "number"
                    ? `${detail.nbaModel.adjustedEfficiencyMargin > 0 ? "+" : ""}${detail.nbaModel.adjustedEfficiencyMargin.toFixed(1)}`
                    : "N/A"
                }
                note="Adjusted efficiency margin from the current model hook."
              />
              <MiniMetric
                label="Tempo"
                value={
                  typeof detail.nbaModel.tempo === "number"
                    ? detail.nbaModel.tempo.toFixed(1)
                    : "N/A"
                }
                note="Estimated game pace."
              />
            </div>
            <div className="mt-4 grid gap-2">
              {detail.nbaModel.factors.slice(0, 4).map((factor) => (
                <div
                  key={factor.label}
                  className="concept-list-row"
                >
                  <div className="concept-meta">{factor.label}</div>
                  <div className="mt-2 text-sm font-medium text-white">
                    {factor.awayValue} vs {factor.homeValue}
                  </div>
                  {factor.note ? (
                    <div className="mt-1 text-xs leading-5 text-slate-500">{factor.note}</div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm leading-6 text-slate-400">{detail.nbaModel.note}</div>
          </Card>
        ) : null}

        <Card className="surface-panel p-5">
          <div className="concept-meta">Matchup notes</div>
          <div className="mt-4 grid gap-3">
            {detail.notes.length ? (
              detail.notes.map((note) => (
                <div
                  key={note}
                  className="concept-list-row text-sm leading-6 text-slate-300"
                >
                  {note}
                </div>
              ))
            ) : (
              <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-400">
                Matchup notes will appear here when provider context is explicit enough to matter.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
