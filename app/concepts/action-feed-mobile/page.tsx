export const dynamic = "force-dynamic";

import Link from "next/link";

import { LineMovementChart } from "@/components/charts/line-movement-chart";
import { MarketSparkline } from "@/components/charts/market-sparkline";
import { ConceptNav } from "@/components/concepts/concept-nav";
import {
  ConceptListRow,
  ConceptMetaChip,
  ConceptMetric,
  ConceptPageIntro,
  ConceptPanel,
  ConceptPhoneFrame,
  ConceptSectionHeader
} from "@/components/concepts/primitives";
import { ChangeBadge, getChangeExplanation } from "@/components/intelligence/change-intelligence";
import { PrioritizationBadge, getPrioritizationExplanation } from "@/components/intelligence/prioritization";
import { IdentityTile } from "@/components/media/identity-tile";
import { formatAmericanOdds } from "@/lib/formatters/odds";
import { getPlayerHeadshotUrl, getTeamLogoUrl, resolveMatchupHref } from "@/lib/utils/entity-routing";
import { getConceptSharedState } from "@/services/concepts/concept-surfaces";
import { getBoardFocusMarket } from "@/services/decision/board-memory-summary";

function buildSparkline(values: Array<number | null | undefined>) {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

export default async function ActionFeedMobileConceptPage() {
  const state = await getConceptSharedState();
  const leadQueue = state.attentionQueue.slice(0, 4);
  const leadWatchlist = state.watchlistData.items.slice(0, 3);
  const leadAlerts = state.alertsData.notifications.slice(0, 3);
  const liveGames = state.verifiedGames.slice(0, 3);
  const detail = state.featuredDetail;
  const awayParticipant = detail?.participants.find((participant) => participant.role === "AWAY") ?? null;
  const homeParticipant = detail?.participants.find((participant) => participant.role === "HOME") ?? null;
  const awayLogo = state.featuredGame ? getTeamLogoUrl(state.featuredGame.leagueKey, state.featuredGame.awayTeam) : null;
  const homeLogo = state.featuredGame ? getTeamLogoUrl(state.featuredGame.leagueKey, state.featuredGame.homeTeam) : null;
  const heroHref = state.featuredGame
    ? resolveMatchupHref({
        leagueKey: state.featuredGame.leagueKey,
        externalEventId: state.featuredGame.externalEventId,
        fallbackHref: state.featuredGame.detailHref ?? null
      })
    : "/board";

  return (
    <div className="concept-stage concept-stage-mobile">
      <ConceptPageIntro
        kicker="Concept 3"
        title="Action Feed Mobile"
        description="A thumb-native attention feed that treats alerts, watchlist movement, and matchup conviction like a live trading queue instead of a shrunken desktop dashboard."
        actions={<ConceptNav current="/concepts/action-feed-mobile" />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,0.92fr)]">
        <ConceptPhoneFrame>
          <div className="grid gap-5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="concept-kicker">SharkEdge mobile</div>
                <div className="mt-2 text-[1.35rem] font-semibold tracking-tight text-white">Attention feed</div>
              </div>
              <div className="flex gap-2">
                <ConceptMetaChip tone="accent">Search</ConceptMetaChip>
                <ConceptMetaChip tone="muted">Alerts</ConceptMetaChip>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {state.boardData.sportSections.slice(0, 6).map((section) => (
                <ConceptMetaChip key={section.leagueKey} tone={section.status === "LIVE" ? "accent" : "muted"} className="whitespace-nowrap">
                  {section.leagueKey}
                </ConceptMetaChip>
              ))}
            </div>

            {leadQueue[0] ? (
              <ConceptPanel tone="accent" className="grid gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="concept-meta">In focus now</div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {leadQueue[0].game.awayTeam.abbreviation} @ {leadQueue[0].game.homeTeam.abbreviation}
                    </div>
                  </div>
                  <PrioritizationBadge prioritization={leadQueue[0].prioritization} />
                </div>
                <div className="text-sm leading-6 text-slate-300">
                  {getPrioritizationExplanation(leadQueue[0].prioritization) ?? "The live queue is quiet enough to stay selective."}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-slate-300">
                    {leadQueue[0].game[leadQueue[0].focusMarket].lineLabel} | {formatAmericanOdds(leadQueue[0].game[leadQueue[0].focusMarket].bestOdds)}
                  </div>
                  <MarketSparkline
                    values={buildSparkline([
                      leadQueue[0].game[leadQueue[0].focusMarket].marketIntelligence?.lineMovement?.openLine,
                      leadQueue[0].game[leadQueue[0].focusMarket].marketIntelligence?.lineMovement?.currentLine,
                      leadQueue[0].game[leadQueue[0].focusMarket].movement
                    ])}
                    compact
                  />
                </div>
              </ConceptPanel>
            ) : null}

            <div className="grid gap-3">
              <ConceptSectionHeader label="Queue" title="Attention first" />
              {leadQueue.map(({ game, focusMarket, prioritization, summary }) => (
                <Link
                  key={`${game.id}-${focusMarket}`}
                  href={resolveMatchupHref({ leagueKey: game.leagueKey, externalEventId: game.externalEventId, fallbackHref: game.detailHref ?? null }) ?? "/board"}
                  className="concept-mobile-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="concept-meta">{game.leagueKey} | {focusMarket}</div>
                      <div className="mt-2 text-base font-semibold text-white">{game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}</div>
                    </div>
                    <PrioritizationBadge prioritization={prioritization} />
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-400">
                    {getPrioritizationExplanation(prioritization) ?? summary?.shortExplanation ?? "Watching for meaningful movement."}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-300">
                      {game[focusMarket].lineLabel} | {formatAmericanOdds(game[focusMarket].bestOdds)}
                    </div>
                    <MarketSparkline
                      values={buildSparkline([
                        game[focusMarket].marketIntelligence?.lineMovement?.openLine,
                        game[focusMarket].marketIntelligence?.lineMovement?.currentLine,
                        game[focusMarket].movement
                      ])}
                      compact
                      accent={summary?.lastChangeDirection === "downgraded" ? "rose" : "cyan"}
                    />
                  </div>
                </Link>
              ))}
            </div>

            <div className="grid gap-3">
              <ConceptSectionHeader label="Watchlist movers" title="Saved plays moving" />
              {leadWatchlist.map((item) => (
                <div key={item.id} className="concept-mobile-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="concept-meta">{item.league} | {item.marketLabel}</div>
                      <div className="mt-2 text-base font-semibold text-white">{item.selection}</div>
                    </div>
                    <PrioritizationBadge prioritization={item.prioritization} />
                  </div>
                  <div className="mt-2 text-sm text-slate-300">
                    {item.current.line ?? "N/A"} | {item.current.oddsAmerican ? formatAmericanOdds(item.current.oddsAmerican) : "No current book"}
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-400">
                    {item.changeIntelligence?.shortExplanation ?? item.current.note}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-3">
              <ConceptSectionHeader label="Alert tape" title="Noise-controlled notifications" />
              {leadAlerts.map((notification) => (
                <div key={notification.id} className="concept-mobile-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="concept-meta">{notification.severity}</div>
                      <div className="mt-2 text-base font-semibold text-white">{notification.title}</div>
                    </div>
                    <PrioritizationBadge prioritization={notification.prioritization} />
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-400">
                    {notification.changeIntelligence?.shortExplanation ?? notification.body}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-3">
              <ConceptSectionHeader label="Top live games" title="Quick jump board" />
              {liveGames.map((game) => {
                const focusMarket = getBoardFocusMarket(game);
                return (
                  <Link
                    key={`${game.id}-live`}
                    href={resolveMatchupHref({ leagueKey: game.leagueKey, externalEventId: game.externalEventId, fallbackHref: game.detailHref ?? null }) ?? "/board"}
                    className="concept-mobile-card"
                  >
                    <div className="flex items-center gap-3">
                      <IdentityTile label={game.awayTeam.name} shortLabel={game.awayTeam.abbreviation} imageUrl={getTeamLogoUrl(game.leagueKey, game.awayTeam)} size="sm" subtle />
                      <IdentityTile label={game.homeTeam.name} shortLabel={game.homeTeam.abbreviation} imageUrl={getTeamLogoUrl(game.leagueKey, game.homeTeam)} size="sm" subtle />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">{game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}</div>
                        <div className="mt-1 text-sm text-slate-400">{game[focusMarket].lineLabel} | {formatAmericanOdds(game[focusMarket].bestOdds)}</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="grid grid-cols-5 gap-2 border-t border-white/8 pt-3">
              {["Board", "Watchlist", "Alerts", "Trends", "More"].map((item, index) => (
                <div key={item} className={`flex h-10 items-center justify-center rounded-[1rem] text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${index === 0 ? "bg-cyan-400/15 text-cyan-200" : "bg-white/5 text-slate-500"}`}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </ConceptPhoneFrame>

        <ConceptPhoneFrame>
          <div className="grid gap-5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="concept-kicker">Mobile matchup</div>
                <div className="mt-2 text-[1.35rem] font-semibold tracking-tight text-white">Game desk</div>
              </div>
              <Link href={heroHref ?? "/board"} className="concept-chip concept-chip-accent">
                Open live
              </Link>
            </div>

            {detail ? (
              <>
                <ConceptPanel tone="accent" className="grid gap-4 p-4">
                  <div className="flex items-center gap-3">
                    <IdentityTile label={awayParticipant?.name ?? "Away"} shortLabel={awayParticipant?.abbreviation ?? "AWY"} imageUrl={awayLogo} size="md" />
                    <div className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-500">vs</div>
                    <IdentityTile label={homeParticipant?.name ?? "Home"} shortLabel={homeParticipant?.abbreviation ?? "HME"} imageUrl={homeLogo} size="md" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">{detail.eventLabel}</div>
                    <div className="mt-2 text-sm leading-6 text-slate-400">{detail.stateDetail ?? detail.supportNote}</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ConceptMetric label="Current line" value={detail.oddsSummary?.bestSpread ?? "N/A"} note={detail.oddsSummary?.sourceLabel ?? "Best spread snapshot"} />
                    <ConceptMetric label="Best total" value={detail.oddsSummary?.bestTotal ?? "N/A"} note="Immediate top-line read" />
                  </div>
                  <LineMovementChart points={detail.lineMovement} metric="spreadLine" label="Line pulse" compact />
                </ConceptPanel>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  {["Overview", "Props", "Trends", "Alerts"].map((item, index) => (
                    <ConceptMetaChip key={item} tone={index === 0 ? "accent" : "muted"} className="whitespace-nowrap">
                      {item}
                    </ConceptMetaChip>
                  ))}
                </div>

                {leadQueue[0] ? (
                  <ConceptPanel className="grid gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="concept-meta">Decision block</div>
                        <div className="mt-2 text-base font-semibold text-white">{leadQueue[0].game[leadQueue[0].focusMarket].label}</div>
                      </div>
                      <PrioritizationBadge prioritization={leadQueue[0].prioritization} />
                    </div>
                    <div className="text-sm leading-6 text-slate-400">
                      {getPrioritizationExplanation(leadQueue[0].prioritization) ?? "Holding for clearer movement."}
                    </div>
                  </ConceptPanel>
                ) : null}

                <div className="grid gap-3">
                  {detail.props.slice(0, 3).map((prop) => (
                    <div key={prop.id} className="concept-mobile-card">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <IdentityTile
                            label={prop.player.name}
                            shortLabel={prop.player.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}
                            imageUrl={getPlayerHeadshotUrl(prop.leagueKey, prop.player)}
                            size="sm"
                            subtle
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white">{prop.player.name}</div>
                            <div className="mt-1 text-sm text-slate-400">{prop.marketType.replace(/_/g, " ")} | {prop.line}</div>
                          </div>
                        </div>
                        <ChangeBadge change={null} />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="text-sm text-slate-300">{formatAmericanOdds(prop.bestAvailableOddsAmerican ?? prop.oddsAmerican)}</div>
                        <MarketSparkline values={buildSparkline([prop.lineMovement ?? 0, prop.expectedValuePct ?? 0])} compact />
                      </div>
                    </div>
                  ))}
                </div>

                <ConceptPanel className="grid gap-3 p-4">
                  <ConceptSectionHeader label="What changed" title="Tight, visible, useful" />
                  {leadAlerts[0] ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <ChangeBadge change={leadAlerts[0].changeIntelligence} />
                        <PrioritizationBadge prioritization={leadAlerts[0].prioritization} />
                      </div>
                      <div className="text-sm leading-6 text-slate-400">
                        {getChangeExplanation(leadAlerts[0].changeIntelligence) ?? leadAlerts[0].body}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm leading-6 text-slate-500">No linked alert context yet.</div>
                  )}
                </ConceptPanel>
              </>
            ) : (
              <ConceptPanel className="p-4">
                <div className="text-sm leading-6 text-slate-500">No matchup detail is available for the current featured game.</div>
              </ConceptPanel>
            )}
          </div>
        </ConceptPhoneFrame>
      </div>
    </div>
  );
}
