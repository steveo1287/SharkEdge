export const dynamic = "force-dynamic";

import Link from "next/link";

import { MarketSparkline } from "@/components/charts/market-sparkline";
import { ConceptNav } from "@/components/concepts/concept-nav";
import {
  ConceptListRow,
  ConceptMetric,
  ConceptMetaChip,
  ConceptPageIntro,
  ConceptPanel,
  ConceptSectionHeader
} from "@/components/concepts/primitives";
import { ChangeSummaryBadge, getChangeSummaryExplanation } from "@/components/intelligence/change-intelligence";
import { PrioritizationBadge, getPrioritizationExplanation } from "@/components/intelligence/prioritization";
import { IdentityTile } from "@/components/media/identity-tile";
import { formatAmericanOdds } from "@/lib/formatters/odds";
import { getTeamLogoUrl } from "@/lib/utils/entity-routing";
import { resolveMatchupHref } from "@/lib/utils/entity-routing";
import { getConceptSharedState } from "@/services/concepts/concept-surfaces";
import { getBoardFocusMarket } from "@/services/decision/board-memory-summary";

type FocusMarket = "spread" | "moneyline" | "total";

function getFocusMarketView(game: Awaited<ReturnType<typeof getConceptSharedState>>["verifiedGames"][number], focusMarket: FocusMarket) {
  return focusMarket === "moneyline" ? game.moneyline : game[focusMarket];
}

function buildSparklineValues(game: Awaited<ReturnType<typeof getConceptSharedState>>["verifiedGames"][number], focusMarket: FocusMarket) {
  const market = getFocusMarketView(game, focusMarket);
  const lineMovement = market.marketIntelligence?.lineMovement;
  const values = [
    lineMovement?.openLine,
    lineMovement?.currentLine,
    lineMovement?.openPrice,
    lineMovement?.currentPrice,
    market.movement
  ];

  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function formatStatus(startTime: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(startTime));
}

function getTrapText(decision: Awaited<ReturnType<typeof getConceptSharedState>>["attentionQueue"][number]["decision"]) {
  if (!decision?.trapFlags.length) {
    return "clear";
  }

  return decision.trapFlags[0].replace(/_/g, " ").toLowerCase();
}

export default async function MarketTerminalConceptPage() {
  const state = await getConceptSharedState();
  const topAttention = state.attentionQueue.slice(0, 5);
  const watchlistLead = state.watchlistData.items.slice(0, 4);
  const alertLead = state.alertsData.notifications.slice(0, 4);
  const trendLead = state.featuredDetail?.trendCards.slice(0, 3) ?? [];
  const moverLead = state.movers.slice(0, 4);

  return (
    <div className="concept-stage concept-stage-terminal">
      <ConceptPageIntro
        kicker="Concept 1"
        title="Market Terminal"
        description="A board-first trading desk for sports markets: faster scan, harder hierarchy, tighter information density, and no fake hero theater between the user and the number."
        actions={<ConceptNav current="/concepts/market-terminal" />}
      />

      <ConceptPanel tone="accent" className="grid gap-5 px-5 py-5 md:px-7 md:py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-3 md:gap-5">
            <div className="text-sm font-semibold uppercase tracking-[0.28em] text-white">SharkEdge</div>
            <nav className="flex flex-wrap items-center gap-2 text-[0.73rem] font-semibold uppercase tracking-[0.2em] text-slate-400">
              <span className="text-white">Board</span>
              <span>Watchlist</span>
              <span>Alerts</span>
              <span>Trends</span>
              <span>Props</span>
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ConceptMetaChip tone="muted">NBA</ConceptMetaChip>
            <ConceptMetaChip tone="muted">Today</ConceptMetaChip>
            <ConceptMetaChip tone="accent">Quick search</ConceptMetaChip>
            <ConceptMetaChip tone="muted">Alerts</ConceptMetaChip>
          </div>
        </div>
      </ConceptPanel>

      <ConceptPanel className="grid gap-4 p-5 md:p-6">
        <ConceptSectionHeader
          label="Attention now"
          title="The first five things worth your eyes"
          detail="Same priority spine as the rest of SharkEdge, compressed into a horizontal market strip instead of billboard hero copy."
        />
        <div className="grid gap-3 xl:grid-cols-5">
          {topAttention.map(({ game, focusMarket, prioritization, summary }) => {
            const market = getFocusMarketView(game, focusMarket);
            const explanation = getPrioritizationExplanation(prioritization) ?? getChangeSummaryExplanation(summary);
            return (
              <Link
                key={`${game.id}-${focusMarket}`}
                href={resolveMatchupHref({ leagueKey: game.leagueKey, externalEventId: game.externalEventId, fallbackHref: game.detailHref ?? null }) ?? "/board"}
                className="concept-terminal-tile"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="concept-meta">{game.leagueKey} | {focusMarket}</div>
                    <div className="mt-2 text-base font-semibold text-white">{game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}</div>
                  </div>
                  <PrioritizationBadge prioritization={prioritization} />
                </div>
                <div className="mt-3 flex items-center gap-3 text-sm text-slate-300">
                  <span>{market.lineLabel}</span>
                  <span className="text-white">{formatAmericanOdds(market.bestOdds)}</span>
                </div>
                {explanation ? <div className="mt-3 text-sm leading-6 text-slate-400">{explanation}</div> : null}
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-500">{formatStatus(game.startTime)}</div>
                  <MarketSparkline values={buildSparklineValues(game, focusMarket)} compact />
                </div>
              </Link>
            );
          })}
        </div>
      </ConceptPanel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.72fr)]">
        <div className="grid gap-5">
          <ConceptPanel className="grid gap-4 p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {state.boardData.sportSections.slice(0, 6).map((section) => (
                  <ConceptMetaChip key={section.leagueKey} tone={section.status === "LIVE" ? "accent" : "muted"}>
                    {section.leagueKey}
                  </ConceptMetaChip>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <ConceptMetaChip tone="muted">Today</ConceptMetaChip>
                <ConceptMetaChip tone="muted">Tomorrow</ConceptMetaChip>
                <ConceptMetaChip tone="muted">Upcoming</ConceptMetaChip>
                <ConceptMetaChip tone="muted">Spreads / ML / Totals</ConceptMetaChip>
              </div>
            </div>
          </ConceptPanel>

          <ConceptPanel className="grid gap-3 px-3 py-3 md:px-4 md:py-4">
            <ConceptSectionHeader
              label="Live market board"
              title="Priority comes from structure, not oversized color blocks"
              detail="Every row shows identity, focus market, what changed, trap state, and movement in one hard-scanning layout."
            />
            <div className="grid gap-2">
              {state.verifiedGames.slice(0, 10).map((game) => {
                const intelligence = state.boardIntelligence.get(`${game.leagueKey}::${game.externalEventId}`) ?? null;
                const focusMarket = intelligence?.focusMarket ?? "spread";
                const summary = intelligence?.summary ?? null;
                const entry = state.attentionQueue.find((item) => item.game.id === game.id) ?? null;
                const prioritization = entry?.prioritization ?? null;
                const decision = entry?.decision ?? null;
                const market = getFocusMarketView(game, focusMarket);
                const explanation = getChangeSummaryExplanation(summary) ?? getPrioritizationExplanation(prioritization) ?? market.marketTruth?.note ?? "No forced narrative.";
                const awayLogo = getTeamLogoUrl(game.leagueKey, game.awayTeam);
                const homeLogo = getTeamLogoUrl(game.leagueKey, game.homeTeam);

                return (
                  <Link
                    key={game.id}
                    href={resolveMatchupHref({ leagueKey: game.leagueKey, externalEventId: game.externalEventId, fallbackHref: game.detailHref ?? null }) ?? "/board"}
                    className="concept-board-row"
                  >
                    <div className="flex min-w-0 items-center gap-3 md:gap-4">
                      <div className="flex items-center gap-2">
                        <IdentityTile label={game.awayTeam.name} shortLabel={game.awayTeam.abbreviation} imageUrl={awayLogo} size="sm" subtle />
                        <IdentityTile label={game.homeTeam.name} shortLabel={game.homeTeam.abbreviation} imageUrl={homeLogo} size="sm" subtle />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-semibold text-white md:text-[0.95rem]">{game.awayTeam.name} at {game.homeTeam.name}</div>
                          <ChangeSummaryBadge summary={summary} />
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[0.72rem] uppercase tracking-[0.16em] text-slate-500">
                          <span>{game.leagueKey}</span>
                          <span>{formatStatus(game.startTime)}</span>
                          <span>{focusMarket}</span>
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-400">{explanation}</div>
                      </div>
                    </div>

                    <div className="grid items-center gap-3 md:grid-cols-[160px_1fr_100px] xl:min-w-[460px] xl:grid-cols-[190px_1fr_120px]">
                      <div className="grid gap-1">
                        <div className="text-sm font-semibold text-white">{market.lineLabel}</div>
                        <div className="text-sm text-slate-300">{formatAmericanOdds(market.bestOdds)} at {market.bestBook}</div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[0.68rem] uppercase tracking-[0.16em]">
                        {prioritization ? <ConceptMetaChip tone="accent">{prioritization.shortAttentionLabel}</ConceptMetaChip> : null}
                        {decision ? <ConceptMetaChip tone="muted">{decision.confidenceTier} confidence</ConceptMetaChip> : null}
                        {decision ? <ConceptMetaChip tone={decision.trapFlags.length ? "danger" : "muted"}>trap {getTrapText(decision)}</ConceptMetaChip> : null}
                        {decision ? <ConceptMetaChip tone="muted">{decision.timingState.replace(/_/g, " ")}</ConceptMetaChip> : null}
                      </div>
                      <div className="flex items-center justify-end">
                        <MarketSparkline values={buildSparklineValues(game, focusMarket)} compact accent={summary?.lastChangeDirection === "downgraded" ? "rose" : "cyan"} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </ConceptPanel>

          <ConceptPanel className="grid gap-4 p-5 md:p-6">
            <ConceptSectionHeader
              label="Numbers worth reacting to"
              title="Top movers without turning the page into a circus"
              detail="Still compact. Still market-first. Just enough extra structure to surface the fastest-moving edges."
            />
            <div className="grid gap-3 md:grid-cols-2">
              {moverLead.map((game) => {
                const focusMarket = getBoardFocusMarket(game);
                const market = getFocusMarketView(game, focusMarket);
                return (
                  <div key={`${game.id}-mover`} className="concept-list-row">
                    <div className="min-w-0">
                      <div className="concept-meta">{game.leagueKey} | mover</div>
                      <div className="mt-2 text-base font-semibold text-white">{game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}</div>
                      <div className="mt-2 text-sm leading-6 text-slate-400">{market.lineLabel} | {market.bestBook} | {formatAmericanOdds(market.bestOdds)}</div>
                    </div>
                    <MarketSparkline values={buildSparklineValues(game, focusMarket)} accent="green" />
                  </div>
                );
              })}
            </div>
          </ConceptPanel>
        </div>

        <div className="grid gap-5 content-start">
          <ConceptPanel className="grid gap-4 p-5">
            <ConceptSectionHeader label="Alerts queue" title="Immediate noise-controlled reactions" />
            <div className="grid gap-2">
              {alertLead.map((notification) => (
                <ConceptListRow
                  key={notification.id}
                  eyebrow={notification.severity}
                  title={notification.title}
                  detail={notification.changeIntelligence?.shortExplanation ?? notification.body}
                  aside={<PrioritizationBadge prioritization={notification.prioritization} />}
                />
              ))}
            </div>
          </ConceptPanel>

          <ConceptPanel className="grid gap-4 p-5">
            <ConceptSectionHeader label="Coverage" title="Provider truth" />
            <div className="grid gap-3">
              <ConceptMetric label="State" value={state.boardData.providerHealth.label} note={state.boardData.providerHealth.summary} />
              <ConceptMetric label="Freshness" value={state.boardData.providerHealth.freshnessLabel} note={state.boardData.sourceNote} />
            </div>
          </ConceptPanel>

          <ConceptPanel className="grid gap-4 p-5">
            <ConceptSectionHeader label="Watchlist activity" title="Saved plays moving now" />
            <div className="grid gap-2">
              {watchlistLead.map((item) => (
                <ConceptListRow
                  key={item.id}
                  eyebrow={`${item.league} | ${item.marketLabel}`}
                  title={item.selection}
                  detail={item.changeIntelligence?.shortExplanation ?? item.current.note}
                  aside={<PrioritizationBadge prioritization={item.prioritization} />}
                />
              ))}
            </div>
          </ConceptPanel>

          <ConceptPanel className="grid gap-4 p-5">
            <ConceptSectionHeader label="Trend snapshots" title="Context worth keeping open" />
            <div className="grid gap-2">
              {trendLead.length ? trendLead.map((trend) => (
                <ConceptListRow key={trend.id} eyebrow="trend" title={trend.title} detail={`${trend.value} | ${trend.note}`} />
              )) : <div className="text-sm leading-6 text-slate-500">Trend context will populate when the linked matchup has enough research depth.</div>}
            </div>
          </ConceptPanel>
        </div>
      </div>
    </div>
  );
}
