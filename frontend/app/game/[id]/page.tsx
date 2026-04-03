import Link from "next/link";
import { notFound } from "next/navigation";

import { BetSlipBoundary } from "@/components/bets/bet-slip-boundary";
import { MatchupPanel } from "@/components/game/matchup-panel";
import { OddsTable } from "@/components/game/odds-table";
import { OverviewPanel } from "@/components/game/overview-panel";
import { PropList } from "@/components/game/prop-list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { formatGameDateTime } from "@/lib/formatters/date";
import { buildLeagueStoryPackage } from "@/services/content/story-writer-service";
import { getMatchupDetail } from "@/services/matchups/matchup-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function getStatusTone(status: string) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "FINAL") {
    return "neutral" as const;
  }

  if (status === "POSTPONED" || status === "CANCELED") {
    return "danger" as const;
  }

  return "muted" as const;
}

function getSupportTone(status: string) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

function getProviderHealthTone(state: string) {
  if (state === "HEALTHY") {
    return "success" as const;
  }

  if (state === "DEGRADED") {
    return "premium" as const;
  }

  if (state === "OFFLINE") {
    return "danger" as const;
  }

  return "muted" as const;
}

function readParticipantScore(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function QuickJump({ href, label, emphasis = false }: { href: string; label: string; emphasis?: boolean }) {
  return (
    <a
      href={href}
      className={
        emphasis
          ? "rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-sky-200"
          : "rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200"
      }
    >
      {label}
    </a>
  );
}

function MetricTile({
  label,
  value,
  note
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="metric-tile">
      <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-3 font-display text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{note}</div>
    </div>
  );
}

function formatFairLine(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "N/A";
  }

  return `${value > 0 ? "+" : ""}${value}`;
}

export default async function GamePage({ params }: PageProps) {
  const { id } = await params;
  const detail = await getMatchupDetail(id);

  if (!detail) {
    notFound();
  }

  const showVerifiedOdds = detail.hasVerifiedOdds;
  const awayParticipant =
    detail.participants.find((participant) => participant.role === "AWAY") ??
    detail.participants.find((participant) => participant.role === "COMPETITOR_A") ??
    null;
  const homeParticipant =
    detail.participants.find((participant) => participant.role === "HOME") ??
    detail.participants.find((participant) => participant.role === "COMPETITOR_B") ??
    null;
  const storyPackage = await buildLeagueStoryPackage({
    league: detail.league.key,
    title:
      detail.status === "FINAL"
        ? `${detail.eventLabel} recap`
        : `${detail.eventLabel} matchup context`,
    summary: detail.notes[0] ?? detail.stateDetail ?? detail.supportNote,
    category: detail.status === "FINAL" ? "Matchup recap" : "Matchup context",
    eventId: detail.externalEventId,
    eventHref: `/game/${id}`,
    eventLabel: detail.eventLabel,
    supportingFacts: [
      detail.supportNote,
      ...detail.notes.slice(0, 2),
      ...detail.trendCards.slice(0, 2).map((card) => `${card.title}: ${card.value}`)
    ].filter(Boolean),
    boxscore:
      awayParticipant && homeParticipant
        ? {
            awayTeam: awayParticipant.name,
            homeTeam: homeParticipant.name,
            awayScore: readParticipantScore(awayParticipant.score),
            homeScore: readParticipantScore(homeParticipant.score)
          }
        : null
  });

  const headlineSignal = detail.betSignals[0] ?? null;
  const secondarySignals = detail.betSignals.slice(1, 3);
  const trendPreview = detail.trendCards.slice(0, 2);
  const providerLabels = [
    detail.currentOddsProvider,
    detail.historicalOddsProvider,
    detail.liveScoreProvider,
    detail.statsProvider
  ].filter(Boolean) as string[];
  const heroSummary = [detail.venue, detail.stateDetail, detail.scoreboard].filter(Boolean).join(" | ");
  const signalSummary = headlineSignal
    ? `${headlineSignal.selection} at ${headlineSignal.oddsAmerican > 0 ? "+" : ""}${headlineSignal.oddsAmerican}`
    : "No qualified signal yet";
  const decisionReasons =
    headlineSignal?.reasons?.slice(0, 3).map((reason) => reason.detail) ??
    storyPackage.takeaways.slice(0, 3);
  const modelFactors = detail.nbaModel?.available ? detail.nbaModel.factors.slice(0, 3) : [];
  const matchupNotes = detail.notes.slice(0, 3);

  return (
    <BetSlipBoundary>
      <div className="grid gap-6">
      <Card className="surface-panel-strong overflow-hidden p-6 xl:p-8">
        <div className="grid gap-8 xl:grid-cols-[1.06fr_0.94fr]">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="brand">{detail.league.key}</Badge>
              {detail.status ? <Badge tone={getStatusTone(detail.status)}>{detail.status}</Badge> : null}
              {detail.supportStatus ? (
                <Badge tone={getSupportTone(detail.supportStatus)}>{detail.supportStatus}</Badge>
              ) : null}
              {!showVerifiedOdds ? <Badge tone="muted">Odds still thin</Badge> : null}
            </div>

            <div className="mt-4 text-xs uppercase tracking-[0.24em] text-slate-400">
              {formatGameDateTime(detail.startTime)}
            </div>
            <div className="mt-4 font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              {detail.eventLabel}
            </div>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300">
              {heroSummary || "One matchup page that brings the market, the read, and the execution together."}
            </p>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">
              {headlineSignal?.reasons?.[0]?.detail ??
                headlineSignal?.supportNote ??
                detail.supportNote}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <QuickJump href="#thesis" label="Market thesis" emphasis />
              <QuickJump href="#odds" label="Execution zone" />
              <QuickJump href="#props" label="Prop zone" />
              <QuickJump href="#research" label="Deep research" />
              <Link
                href={`/board?league=${detail.league.key}`}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200"
              >
                Back to board
              </Link>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                label="Best angle"
                value={signalSummary}
                note="Strongest current entry point on the page."
              />
              <MetricTile
                label="Fair line"
                value={formatFairLine(headlineSignal?.fairPrice?.fairOddsAmerican)}
                note="Consensus-derived pricing anchor for the lead signal."
              />
              <MetricTile
                label="Price health"
                value={showVerifiedOdds ? `${detail.books.length} books` : "Thin"}
                note={showVerifiedOdds ? "Current verified books mapped into this matchup." : "Board stays visible, but honest, until verified prices return."}
              />
              <MetricTile
                label="Props in play"
                value={String(detail.props.length)}
                note="Matchup-linked props currently attached to this game."
              />
            </div>
          </div>

          <div className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="section-kicker">Decision desk</div>
                <div className="mt-3 text-2xl font-semibold leading-tight text-white">
                  What matters right now.
                </div>
              </div>
              {headlineSignal ? <Badge tone="success">{headlineSignal.confidenceTier} tier</Badge> : null}
            </div>

            <div className="rounded-[1.25rem] border border-sky-400/15 bg-sky-500/10 px-4 py-4">
              <div className="text-[0.66rem] uppercase tracking-[0.22em] text-sky-300">Lead read</div>
              <div className="mt-3 text-lg font-semibold leading-tight text-white">
                {headlineSignal ? headlineSignal.selection : "No bet qualified yet"}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">EV</div>
                  <div className="mt-1 text-base font-semibold text-emerald-300">
                    {typeof headlineSignal?.expectedValuePct === "number"
                      ? `${headlineSignal.expectedValuePct > 0 ? "+" : ""}${headlineSignal.expectedValuePct.toFixed(2)}%`
                      : "N/A"}
                  </div>
                </div>
                <div>
                  <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">Fair line</div>
                  <div className="mt-1 text-base font-semibold text-white">
                    {formatFairLine(headlineSignal?.fairPrice?.fairOddsAmerican)}
                  </div>
                </div>
                <div>
                  <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">Stake guide</div>
                  <div className="mt-1 text-base font-semibold text-white">
                    {typeof headlineSignal?.evProfile?.kellyFraction === "number"
                      ? `${(headlineSignal.evProfile.kellyFraction * 100).toFixed(1)}%`
                      : "Suppressed"}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              {decisionReasons.length ? (
                decisionReasons.map((reason, index) => (
                  <div
                    key={`${reason}-${index}`}
                    className="rounded-[1.15rem] border border-white/8 bg-slate-900/70 px-4 py-3 text-sm leading-6 text-slate-300"
                  >
                    {reason}
                  </div>
                ))
              ) : (
                <div className="rounded-[1.15rem] border border-white/8 bg-slate-900/70 px-4 py-3 text-sm leading-6 text-slate-400">
                  The game stays visible, but SharkEdge will not invent a reason to fire when the edge is not there.
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <QuickJump href="#odds" label="Compare books" emphasis />
              <QuickJump href="#props" label="Check props" />
              <QuickJump href="#research" label="Open research" />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="grid gap-6">
          <section id="thesis" className="grid gap-4">
            <SectionTitle
              eyebrow="Market thesis"
              title="Best angle first, runners-up second"
              description="Lead with the strongest qualified signal, then make every secondary angle earn the space it takes."
            />
            <OverviewPanel detail={detail} />
          </section>

          {showVerifiedOdds ? (
            <section id="odds" className="grid gap-4">
              <SectionTitle
                eyebrow="Execution zone"
                title="Best price, movement, and trust in one place"
                description="Book comparison, no-vig context, movement, and support honesty without a separate scavenger hunt."
              />
              <OddsTable detail={detail} />
            </section>
          ) : (
            <section id="odds" className="grid gap-4">
              <SectionTitle
                eyebrow="Execution zone"
                title="Odds board"
                description="This slot stays visible, but plainspoken, when verified book coverage is not ready."
              />
              <EmptyState
                eyebrow="Execution zone"
                title="Verified odds are not ready for this matchup"
                description="You can still use the page for context and matchup-linked props, but SharkEdge will not fake a full odds board when the provider mesh has not earned it."
                action={
                  <div className="flex flex-wrap justify-center gap-3">
                    <Link
                      href={`/board?league=${detail.league.key}`}
                      className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200"
                    >
                      Back to board
                    </Link>
                    <a
                      href="#props"
                      className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200"
                    >
                      Check props
                    </a>
                  </div>
                }
              />
            </section>
          )}

          <section id="props" className="grid gap-4">
            <SectionTitle
              eyebrow="Prop zone"
              title="Props tied directly to this game"
              description="Best matchup-linked prop entries first, then the rest of the board below."
            />
            <PropList props={detail.props} support={detail.propsSupport} />
          </section>
        </div>

        <div className="grid gap-6 content-start">
          <Card className="surface-panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="section-kicker">Why now</div>
                <div className="mt-2 text-2xl font-semibold text-white">What changes the read</div>
              </div>
              {trendPreview.length ? (
                <Link
                  href={`/trends?league=${detail.league.key}`}
                  className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200"
                >
                  Open trends
                </Link>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3">
              <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4 text-sm leading-6 text-slate-300">
                {storyPackage.bettingImpact}
              </div>

              {trendPreview.map((card) => (
                <div
                  key={card.id}
                  className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4"
                >
                  <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">{card.title}</div>
                  <div className="mt-2 text-xl font-semibold text-white">{card.value}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">{card.note}</div>
                </div>
              ))}

              {modelFactors.length ? (
                <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4">
                  <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">Model pulse</div>
                  <div className="mt-3 grid gap-2">
                    {modelFactors.map((factor) => (
                      <div key={factor.label} className="rounded-[1rem] border border-white/8 bg-slate-900/70 px-3 py-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{factor.label}</div>
                        <div className="mt-2 text-sm font-medium text-white">
                          {factor.awayValue} vs {factor.homeValue}
                        </div>
                        {factor.note ? (
                          <div className="mt-1 text-xs leading-5 text-slate-500">{factor.note}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {!trendPreview.length && !modelFactors.length && matchupNotes.length ? (
                <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4 text-sm leading-6 text-slate-300">
                  {matchupNotes[0]}
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="surface-panel p-5">
            <div className="section-kicker">Coverage truth</div>
            <div className="mt-2 text-2xl font-semibold text-white">What to trust on this page</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone={getSupportTone(detail.supportStatus)}>{detail.supportStatus}</Badge>
              <Badge tone={getProviderHealthTone(detail.providerHealth.state)}>
                {detail.providerHealth.label}
              </Badge>
              {providerLabels.length ? (
                providerLabels.map((label) => (
                  <Badge key={label} tone="muted">
                    {label}
                  </Badge>
                ))
              ) : (
                <Badge tone="muted">Provider labels pending</Badge>
              )}
            </div>

            <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-300">
              <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
                {detail.supportNote}
              </div>
              <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
                {detail.providerHealth.summary}
              </div>
              <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
                Props support: {detail.propsSupport.note}
              </div>
              <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
                {detail.providerHealth.asOf
                  ? `Provider timestamp: ${detail.providerHealth.freshnessLabel.toLowerCase()} at ${detail.providerHealth.asOf.slice(11, 16)} UTC.`
                  : "No provider timestamp was returned for this matchup yet."}
              </div>
              {detail.providerHealth.warnings.length ? (
                <div className="rounded-[1.15rem] border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-amber-100">
                  {detail.providerHealth.warnings[0]}
                </div>
              ) : null}
              {secondarySignals.length ? (
                <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
                  <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">Secondary looks</div>
                  <div className="mt-2 grid gap-2">
                    {secondarySignals.map((signal) => (
                      <div key={signal.id} className="text-sm text-slate-300">
                        {signal.selection} | {signal.oddsAmerican > 0 ? "+" : ""}{signal.oddsAmerican}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      <section id="research" className="grid gap-4">
        <SectionTitle
          eyebrow="Deep research"
          title="Participant form, leaders, and box score detail"
          description="Once the market is worth your attention, stay here to understand the teams or fighters behind the number."
        />
        <MatchupPanel detail={detail} />
      </section>
      </div>
    </BetSlipBoundary>
  );
}
