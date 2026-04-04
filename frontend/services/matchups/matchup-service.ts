import type {
  BetSignalView,
  BoardSupportStatus,
  EdgeBand,
  GameDetailView as LegacyGameDetailView,
  GameStatus,
  LeagueKey,
  LeagueRecord,
  MatchupDetailView,
  MatchupMetricView,
  MatchupParticipantView,
  MatchupTrendCardView,
  PropMarketType,
  PropCardView
} from "@/lib/types/domain";
import { getBoardSportConfig } from "@/lib/config/board-sports";
import { getMatchupTrendCards as getEngineMatchupTrendCards } from "@/lib/trends/engine";
import { getConfidenceTierFromEdge } from "@/lib/utils/bet-intelligence";
import { buildMatchupHref } from "@/lib/utils/matchups";
import { parseMatchupRouteId } from "@/lib/utils/matchups";
import { mockDatabase } from "@/prisma/seed-data";
import { getGameDetail as getLegacyGameDetail } from "@/services/odds/detail-service";
import { buildProviderHealth } from "@/services/providers/provider-health";
import { getMatchupProviders, getScoreProviders, getProviderRegistryEntry } from "@/services/providers/registry";
import type { ProviderEvent } from "@/services/events/provider-types";
import type { MatchupDetailPayload } from "@/services/stats/provider-types";

const leagueMap = new Map(
  mockDatabase.leagues.map((league) => [league.key, league] as const)
);

function normalizeName(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getLeagueRecord(leagueKey: LeagueKey): LeagueRecord | null {
  return leagueMap.get(leagueKey) ?? null;
}

function mapProviderStatus(status: ProviderEvent["status"]): GameStatus {
  if (status === "LIVE") {
    return "LIVE";
  }

  if (status === "FINAL") {
    return "FINAL";
  }

  if (status === "CANCELED") {
    return "CANCELED";
  }

  if (status === "POSTPONED" || status === "DELAYED") {
    return "POSTPONED";
  }

  return "PREGAME";
}

function isTeamEvent(eventType: MatchupDetailView["eventType"]) {
  return eventType === "TEAM_HEAD_TO_HEAD";
}

function buildMetricViews(stats: Record<string, number | string>) {
  return Object.entries(stats).map(([label, value]) => ({
    label:
      label.includes(" ")
        ? label
        : label
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/\bats\b/gi, "ATS")
            .replace(/\bpf\b/gi, "PF")
            .replace(/\bpa\b/gi, "PA"),
    value: String(value)
  })) satisfies MatchupMetricView[];
}

function buildParticipantsFromLegacy(detail: LegacyGameDetailView): MatchupParticipantView[] {
  const scoreJson = (detail.game.scoreJson ?? {}) as Record<string, unknown>;

  return [
    {
      id: detail.awayTeam.id,
      name: detail.awayTeam.name,
      abbreviation: detail.awayTeam.abbreviation,
      role: "AWAY",
      record: null,
      score: typeof scoreJson.awayScore === "number" ? String(scoreJson.awayScore) : null,
      isWinner: null,
      subtitle: null,
      stats: buildMetricViews(detail.matchup.away.stats),
      leaders: [],
      boxscore: [],
      boxscoreRows: [],
      recentResults: [],
      notes: ["Using the current odds board detail as the matchup fallback."]
    },
    {
      id: detail.homeTeam.id,
      name: detail.homeTeam.name,
      abbreviation: detail.homeTeam.abbreviation,
      role: "HOME",
      record: null,
      score: typeof scoreJson.homeScore === "number" ? String(scoreJson.homeScore) : null,
      isWinner: null,
      subtitle: null,
      stats: buildMetricViews(detail.matchup.home.stats),
      leaders: [],
      boxscore: [],
      boxscoreRows: [],
      recentResults: [],
      notes: ["Using the current odds board detail as the matchup fallback."]
    }
  ];
}

function buildOddsSummaryFromLegacy(detail: LegacyGameDetailView) {
  return {
    bestSpread: detail.bestMarkets.spread.label,
    bestMoneyline: detail.bestMarkets.moneyline.label,
    bestTotal: detail.bestMarkets.total.label,
    sourceLabel: "Current odds backend"
  };
}

function parseSignalLine(value: string) {
  const match = value.match(/(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function buildLegacyBetSignals(detail: LegacyGameDetailView): BetSignalView[] {
  const matchupHref = buildMatchupHref(detail.league.key, detail.game.externalEventId);
  return [
    {
      id: `${detail.game.id}-spread`,
      marketType: "spread",
      marketLabel: "Spread",
      selection: detail.bestMarkets.spread.label,
      side: detail.bestMarkets.spread.label,
      line: parseSignalLine(detail.bestMarkets.spread.lineLabel),
      oddsAmerican: detail.bestMarkets.spread.bestOdds,
      sportsbookName: detail.bestMarkets.spread.bestBook,
      eventLabel: `${detail.awayTeam.name} @ ${detail.homeTeam.name}`,
      externalEventId: detail.game.externalEventId,
      matchupHref,
      supportStatus: "LIVE",
      supportNote:
        detail.bestMarkets.spread.fairPrice?.coverageNote ?? "Current odds backend",
      expectedValuePct:
        detail.bestMarkets.spread.evProfile?.evPerUnit !== null &&
        typeof detail.bestMarkets.spread.evProfile?.evPerUnit === "number"
          ? Number((detail.bestMarkets.spread.evProfile.evPerUnit * 100).toFixed(2))
          : null,
      valueFlag: detail.bestMarkets.spread.marketIntelligence?.bestPriceFlag
        ? "BEST_PRICE"
        : "NONE",
      canonicalMarketKey: detail.bestMarkets.spread.canonicalMarketKey ?? null,
      marketTruth: detail.bestMarkets.spread.marketTruth ?? null,
      fairPrice: detail.bestMarkets.spread.fairPrice ?? null,
      evProfile: detail.bestMarkets.spread.evProfile ?? null,
      marketIntelligence: detail.bestMarkets.spread.marketIntelligence ?? null,
      reasons: detail.bestMarkets.spread.reasons ?? [],
      confidenceBand: detail.bestMarkets.spread.confidenceBand,
      confidenceScore: detail.bestMarkets.spread.confidenceScore,
      hidden: detail.bestMarkets.spread.hidden ?? false,
      confidenceTier: getConfidenceTierFromEdge(detail.edgeScore.score),
      edgeScore: detail.edgeScore
    },
    {
      id: `${detail.game.id}-moneyline`,
      marketType: "moneyline",
      marketLabel: "Moneyline",
      selection: detail.bestMarkets.moneyline.label,
      side: null,
      line: null,
      oddsAmerican: detail.bestMarkets.moneyline.bestOdds,
      sportsbookName: detail.bestMarkets.moneyline.bestBook,
      eventLabel: `${detail.awayTeam.name} @ ${detail.homeTeam.name}`,
      externalEventId: detail.game.externalEventId,
      matchupHref,
      supportStatus: "LIVE",
      supportNote:
        detail.bestMarkets.moneyline.fairPrice?.coverageNote ?? "Current odds backend",
      expectedValuePct:
        detail.bestMarkets.moneyline.evProfile?.evPerUnit !== null &&
        typeof detail.bestMarkets.moneyline.evProfile?.evPerUnit === "number"
          ? Number((detail.bestMarkets.moneyline.evProfile.evPerUnit * 100).toFixed(2))
          : null,
      valueFlag: detail.bestMarkets.moneyline.marketIntelligence?.bestPriceFlag
        ? "BEST_PRICE"
        : "NONE",
      canonicalMarketKey: detail.bestMarkets.moneyline.canonicalMarketKey ?? null,
      marketTruth: detail.bestMarkets.moneyline.marketTruth ?? null,
      fairPrice: detail.bestMarkets.moneyline.fairPrice ?? null,
      evProfile: detail.bestMarkets.moneyline.evProfile ?? null,
      marketIntelligence: detail.bestMarkets.moneyline.marketIntelligence ?? null,
      reasons: detail.bestMarkets.moneyline.reasons ?? [],
      confidenceBand: detail.bestMarkets.moneyline.confidenceBand,
      confidenceScore: detail.bestMarkets.moneyline.confidenceScore,
      hidden: detail.bestMarkets.moneyline.hidden ?? false,
      confidenceTier: getConfidenceTierFromEdge(detail.edgeScore.score),
      edgeScore: detail.edgeScore
    },
    {
      id: `${detail.game.id}-total`,
      marketType: "total",
      marketLabel: "Total",
      selection: detail.bestMarkets.total.label,
      side: detail.bestMarkets.total.label.startsWith("O ") ? "Over" : "Under",
      line: parseSignalLine(detail.bestMarkets.total.lineLabel),
      oddsAmerican: detail.bestMarkets.total.bestOdds,
      sportsbookName: detail.bestMarkets.total.bestBook,
      eventLabel: `${detail.awayTeam.name} @ ${detail.homeTeam.name}`,
      externalEventId: detail.game.externalEventId,
      matchupHref,
      supportStatus: "LIVE",
      supportNote:
        detail.bestMarkets.total.fairPrice?.coverageNote ?? "Current odds backend",
      expectedValuePct:
        detail.bestMarkets.total.evProfile?.evPerUnit !== null &&
        typeof detail.bestMarkets.total.evProfile?.evPerUnit === "number"
          ? Number((detail.bestMarkets.total.evProfile.evPerUnit * 100).toFixed(2))
          : null,
      valueFlag: detail.bestMarkets.total.marketIntelligence?.bestPriceFlag
        ? "BEST_PRICE"
        : "NONE",
      canonicalMarketKey: detail.bestMarkets.total.canonicalMarketKey ?? null,
      marketTruth: detail.bestMarkets.total.marketTruth ?? null,
      fairPrice: detail.bestMarkets.total.fairPrice ?? null,
      evProfile: detail.bestMarkets.total.evProfile ?? null,
      marketIntelligence: detail.bestMarkets.total.marketIntelligence ?? null,
      reasons: detail.bestMarkets.total.reasons ?? [],
      confidenceBand: detail.bestMarkets.total.confidenceBand,
      confidenceScore: detail.bestMarkets.total.confidenceScore,
      hidden: detail.bestMarkets.total.hidden ?? false,
      confidenceTier: getConfidenceTierFromEdge(detail.edgeScore.score),
      edgeScore: detail.edgeScore
    }
  ];
}

function buildLegacyTrendCards(detail: LegacyGameDetailView): MatchupTrendCardView[] {
  const cards: MatchupTrendCardView[] = [];

  if (detail.lineMovement.length >= 2) {
    const opening = detail.lineMovement[0];
    const latest = detail.lineMovement[detail.lineMovement.length - 1];
    const spreadMove =
      typeof opening.spreadLine === "number" && typeof latest.spreadLine === "number"
        ? latest.spreadLine - opening.spreadLine
        : null;
    const totalMove =
      typeof opening.totalLine === "number" && typeof latest.totalLine === "number"
        ? latest.totalLine - opening.totalLine
        : null;

    cards.push({
      id: `${detail.game.id}-spread-move`,
      title: "Spread move",
      value:
        spreadMove === null
          ? "No tracked move"
          : `${spreadMove > 0 ? "+" : ""}${spreadMove.toFixed(1)} pts`,
      note: "Computed from stored pricing snapshots for this matchup.",
      tone: spreadMove && Math.abs(spreadMove) >= 1 ? "brand" : "muted"
    });

    cards.push({
      id: `${detail.game.id}-total-move`,
      title: "Total move",
      value:
        totalMove === null
          ? "No tracked move"
          : `${totalMove > 0 ? "+" : ""}${totalMove.toFixed(1)} pts`,
      note: "Opening versus latest tracked total in the stored market history.",
      tone: totalMove && Math.abs(totalMove) >= 1 ? "premium" : "muted"
    });
  } else if (detail.marketRanges?.length) {
    cards.push({
      id: `${detail.game.id}-range`,
      title: "Market range",
      value: detail.marketRanges[0]?.value ?? "Range pending",
      note: "Current range view comes from the live market analytics payload when available.",
      tone: "brand"
    });
  }

  if (detail.edgeScore.score > 0) {
    cards.push({
      id: `${detail.game.id}-edge`,
      title: "Edge signal",
      value: `${detail.edgeScore.score}`,
      note: "Current board composite signal from the live odds path.",
      tone: mapEdgeTone(detail.edgeScore.label)
    });
  }

  return cards;
}

function mapEdgeTone(label: EdgeBand) {
  if (label === "Elite") {
    return "success" as const;
  }

  if (label === "Strong") {
    return "brand" as const;
  }

  if (label === "Watchlist") {
    return "premium" as const;
  }

  return "muted" as const;
}

function getSignalPriorityScore(signal: BetSignalView) {
  const rankScore = signal.evProfile?.rankScore ?? 0;
  const confidenceScore = signal.confidenceScore ?? signal.fairPrice?.pricingConfidenceScore ?? 0;
  const qualityScore = signal.marketTruth?.qualityScore ?? 0;
  const bestPriceBonus = signal.marketIntelligence?.bestPriceFlag ? 10 : 0;
  const valueFlagBonus =
    signal.valueFlag === "BEST_PRICE" ? 8 : signal.valueFlag === "MARKET_PLUS" ? 5 : signal.valueFlag === "STEAM" ? 3 : 0;
  const evScore =
    typeof signal.expectedValuePct === "number"
      ? Math.min(20, Math.max(-5, signal.expectedValuePct))
      : 0;

  return rankScore + confidenceScore * 0.4 + qualityScore * 0.2 + bestPriceBonus + valueFlagBonus + evScore;
}

async function fetchMatchupPayloadByEventId(
  leagueKey: LeagueKey,
  eventId: string
): Promise<MatchupDetailPayload | null> {
  for (const provider of getMatchupProviders(leagueKey)) {
    try {
      const payload = await provider.fetchMatchupDetail({ leagueKey, eventId });
      if (payload) {
        return payload;
      }
    } catch {
      // Ignore provider misses and continue down the registry chain.
    }
  }

  return null;
}

function matchProviderEventToLegacyDetail(
  detail: LegacyGameDetailView,
  event: ProviderEvent
) {
  const home = event.participants.find((participant) => participant.role === "HOME");
  const away = event.participants.find((participant) => participant.role === "AWAY");

  if (!home || !away) {
    return false;
  }

  return (
    normalizeName(home.name) === normalizeName(detail.homeTeam.name) &&
    normalizeName(away.name) === normalizeName(detail.awayTeam.name)
  );
}

async function findProviderEventForLegacyDetail(
  leagueKey: LeagueKey,
  detail: LegacyGameDetailView
): Promise<ProviderEvent | null> {
  for (const provider of getScoreProviders(leagueKey)) {
    try {
      const events = await provider.fetchScoreboard(leagueKey);
      const match =
        events.find((event) => matchProviderEventToLegacyDetail(detail, event)) ?? null;
      if (match) {
        return match;
      }
    } catch {
      // Ignore provider failures here and continue trying the next source.
    }
  }

  return null;
}

async function buildHistoricalTrendCards(args: {
  leagueKey: LeagueKey;
  eventLabel: string;
  eventType: MatchupDetailView["eventType"];
  participants: MatchupParticipantView[];
  externalEventId: string;
}) {
  return getEngineMatchupTrendCards({
    leagueKey: args.leagueKey,
    participantNames: args.participants.map((participant) => participant.name),
    externalEventId: args.externalEventId,
    limit: 3
  });
}

function derivePropsSupport(
  leagueKey: LeagueKey,
  payload: MatchupDetailPayload | null,
  legacyDetail: LegacyGameDetailView | null
) {
  const registry = getProviderRegistryEntry(leagueKey);

  if (payload?.propsSupport) {
    return payload.propsSupport;
  }

  return {
    status:
      legacyDetail?.props.length && registry.propsStatus !== "COMING_SOON"
        ? "LIVE"
        : registry.propsStatus,
    note:
      legacyDetail?.props.length
        ? "Props are attached from the existing odds layer for this matchup."
        : registry.propsNote,
    supportedMarkets: registry.supportedPropMarkets
  };
}

function buildCombatPlaceholderParticipants(leagueKey: LeagueKey, externalEventId: string) {
  return [
    {
      id: `${externalEventId}-a`,
      name: `${leagueKey} competitor A`,
      abbreviation: null,
      role: "COMPETITOR_A" as const,
      record: null,
      score: null,
      isWinner: null,
      subtitle: null,
      stats: [],
      leaders: [],
      boxscore: [],
      boxscoreRows: [],
      recentResults: [],
      notes: ["This competitor slot is reserved until a dedicated live combat provider is connected."]
    },
    {
      id: `${externalEventId}-b`,
      name: `${leagueKey} competitor B`,
      abbreviation: null,
      role: "COMPETITOR_B" as const,
      record: null,
      score: null,
      isWinner: null,
      subtitle: null,
      stats: [],
      leaders: [],
      boxscore: [],
      boxscoreRows: [],
      recentResults: [],
      notes: ["This competitor slot is reserved until a dedicated live combat provider is connected."]
    }
  ] satisfies MatchupParticipantView[];
}

function mergeMetricViews(
  primary: MatchupMetricView[],
  secondary: MatchupMetricView[],
  limit = 8
) {
  const merged: MatchupMetricView[] = [];
  const seen = new Set<string>();

  for (const metric of [...primary, ...secondary]) {
    const key = metric.label.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(metric);

    if (merged.length === limit) {
      break;
    }
  }

  return merged;
}

function extractLiveStateJson(detail: LegacyGameDetailView) {
  return (detail.game.liveStateJson ?? {}) as {
    playerSpotlights?: {
      teams?: Record<
        string,
        Array<{
          category?: string | null;
          athlete_name?: string | null;
          display_value?: string | null;
          position?: string | null;
        }>
      >;
    } | null;
  };
}

function buildSpotlightMetrics(
  detail: LegacyGameDetailView,
  participantName: string
) {
  const liveState = extractLiveStateJson(detail);
  const teamSpotlights = liveState.playerSpotlights?.teams?.[participantName] ?? [];

  return teamSpotlights
    .map((spotlight) => {
      const athlete = spotlight.athlete_name?.trim();
      const value = spotlight.display_value?.trim();
      if (!athlete || !value) {
        return null;
      }

      return {
        label: spotlight.category?.trim() || athlete,
        value: spotlight.category?.trim() ? `${athlete} ${value}` : value,
        note: spotlight.position?.trim() || undefined
      } satisfies MatchupMetricView;
    })
    .filter(Boolean) as MatchupMetricView[];
}

function enrichParticipantsFromLegacy(
  participants: MatchupParticipantView[],
  legacyDetail: LegacyGameDetailView | null
) {
  if (!legacyDetail) {
    return participants;
  }

  return participants.map((participant) => {
    const legacyStats =
      participant.role === "AWAY"
        ? buildMetricViews(legacyDetail.matchup.away.stats)
        : participant.role === "HOME"
          ? buildMetricViews(legacyDetail.matchup.home.stats)
          : [];
    const spotlightMetrics = buildSpotlightMetrics(legacyDetail, participant.name);

    return {
      ...participant,
      stats: mergeMetricViews(participant.stats, legacyStats),
      leaders: mergeMetricViews(spotlightMetrics, participant.leaders, 6),
      boxscore: mergeMetricViews(participant.boxscore, legacyStats, 6),
      boxscoreRows: participant.boxscoreRows,
      notes: Array.from(new Set([...participant.notes, ...legacyDetail.insights])).slice(0, 6)
    } satisfies MatchupParticipantView;
  });
}

function mergeMatchupDetail(args: {
  routeId: string;
  leagueKey: LeagueKey;
  externalEventId: string;
  payload: MatchupDetailPayload | null;
  legacyDetail: LegacyGameDetailView | null;
}): MatchupDetailView {
  const { routeId, leagueKey, externalEventId, payload, legacyDetail } = args;
  const registry = getProviderRegistryEntry(leagueKey);
  const league = payload ? getLeagueRecord(payload.leagueKey) : getLeagueRecord(leagueKey);
  const config = getBoardSportConfig(leagueKey);

  if (!league || !config) {
    throw new Error(`Unsupported matchup league: ${leagueKey}`);
  }

  const participants =
    enrichParticipantsFromLegacy(
      payload?.participants ??
    (legacyDetail
      ? buildParticipantsFromLegacy(legacyDetail)
      : registry.status === "COMING_SOON" || !isTeamEvent(payload?.eventType ?? "OTHER")
        ? buildCombatPlaceholderParticipants(leagueKey, externalEventId)
        : []),
      legacyDetail
    );

  const notes = Array.from(
    new Set([
      ...(payload?.notes ?? []),
      ...(legacyDetail?.insights ?? []),
      ...(registry.status !== "LIVE"
        ? [config.detail]
        : [])
    ].filter(Boolean))
  );
  const verifiedBooks = legacyDetail?.books ?? [];
  const hasVerifiedOdds = verifiedBooks.length > 0;
  const verifiedOddsSummary =
    hasVerifiedOdds
      ? payload?.oddsSummary ?? (legacyDetail ? buildOddsSummaryFromLegacy(legacyDetail) : null)
      : null;
  const verifiedBetSignals =
    hasVerifiedOdds && legacyDetail
      ? buildLegacyBetSignals(legacyDetail).sort(
          (left, right) => getSignalPriorityScore(right) - getSignalPriorityScore(left)
        )
      : [];

  return {
    routeId,
    externalEventId,
    league,
    eventLabel:
      payload?.label ??
      (legacyDetail
        ? `${legacyDetail.awayTeam.name} @ ${legacyDetail.homeTeam.name}`
        : `${config.leagueLabel} matchup`),
    eventType:
      payload?.eventType ??
      (legacyDetail ? "TEAM_HEAD_TO_HEAD" : leagueKey === "UFC" || leagueKey === "BOXING"
        ? "COMBAT_HEAD_TO_HEAD"
        : "OTHER"),
    status:
      payload?.status ??
      (legacyDetail?.game.status === "PREGAME"
        ? "PREGAME"
        : legacyDetail?.game.status === "FINAL"
          ? "FINAL"
          : legacyDetail?.game.status === "POSTPONED"
            ? "POSTPONED"
            : "PREGAME"),
    stateDetail: payload?.stateDetail ?? null,
    scoreboard:
      payload?.scoreboard ??
      (legacyDetail
        ? `${legacyDetail.awayTeam.abbreviation} @ ${legacyDetail.homeTeam.abbreviation}`
        : null),
    venue: payload?.venue ?? legacyDetail?.game.venue ?? null,
    startTime: payload?.startTime ?? legacyDetail?.game.startTime ?? new Date().toISOString(),
    supportStatus: payload?.supportStatus ?? registry.status,
    supportNote: payload?.supportNote ?? config.detail,
    liveScoreProvider: payload?.liveScoreProvider ?? config.liveScoreProvider,
    statsProvider: payload?.statsProvider ?? null,
    currentOddsProvider:
      hasVerifiedOdds
        ? payload?.currentOddsProvider ??
          (legacyDetail ? buildOddsSummaryFromLegacy(legacyDetail).sourceLabel : config.currentOddsProvider)
        : null,
    historicalOddsProvider: payload?.historicalOddsProvider ?? config.historicalOddsProvider,
    hasVerifiedOdds,
    lastUpdatedAt: payload?.lastUpdatedAt ?? legacyDetail?.providerHealth.asOf ?? null,
    providerHealth:
      payload || legacyDetail
        ? buildProviderHealth({
            supportStatus: payload?.supportStatus ?? registry.status,
            source: legacyDetail?.source ?? (payload ? "live" : "catalog"),
            generatedAt: legacyDetail?.providerHealth.asOf ?? null,
            lastUpdatedAt: payload?.lastUpdatedAt ?? legacyDetail?.providerHealth.asOf ?? null,
            warnings: payload?.supportStatus === "PARTIAL" ? [payload.supportNote ?? config.detail] : [],
            healthySummary:
              "This matchup page has live provider coverage for the current decision workflow.",
            degradedSummary:
              "This matchup page is connected, but the provider mesh is only partial or aging right now.",
            fallbackSummary:
              "This matchup page is leaning on fallback context while live provider coverage is thin.",
            offlineSummary:
              "This matchup page is running without a live provider feed in this runtime."
          })
        : buildProviderHealth({
            source: "catalog",
            healthySummary: "This matchup page has live provider coverage.",
            fallbackSummary:
              "This matchup page is leaning on catalog context while live providers are not ready.",
            offlineSummary:
              "This matchup page does not have a live provider feed in this runtime."
          }),
    participants,
    oddsSummary: verifiedOddsSummary,
    books: verifiedBooks,
    props: legacyDetail?.props ?? [],
    betSignals: verifiedBetSignals,
    propsSupport: derivePropsSupport(leagueKey, payload, legacyDetail),
    nbaModel: payload?.nbaModel ?? null,
    marketRanges: legacyDetail?.marketRanges ?? payload?.marketRanges ?? [],
    lineMovement: legacyDetail?.lineMovement ?? [],
    trendCards: [],
    notes,
    source: legacyDetail?.source ?? (payload ? "live" : "catalog")
  };
}

export async function getMatchupDetail(routeId: string): Promise<MatchupDetailView | null> {
  const parsed = parseMatchupRouteId(routeId);
  const rawExternalId = parsed.externalId;
  const rawLegacyDetail = await getLegacyGameDetail(routeId);
  const fallbackLegacyDetail =
    routeId !== rawExternalId ? await getLegacyGameDetail(rawExternalId) : null;
  const legacyDetail =
    [rawLegacyDetail, fallbackLegacyDetail].find((detail) => detail?.source === "live") ?? null;
  const leagueKey = parsed.leagueKey ?? legacyDetail?.league.key ?? null;

  if (!leagueKey) {
    return null;
  }

  let payload =
    routeId !== rawExternalId || parsed.leagueKey
      ? await fetchMatchupPayloadByEventId(leagueKey, rawExternalId)
      : null;

  if (!payload && legacyDetail) {
    const matchedEvent = await findProviderEventForLegacyDetail(leagueKey, legacyDetail);
    if (matchedEvent) {
      payload = await fetchMatchupPayloadByEventId(leagueKey, matchedEvent.externalEventId);
    }
  }

  const merged = mergeMatchupDetail({
    routeId,
    leagueKey,
    externalEventId:
      payload?.externalEventId ??
      rawExternalId ??
      legacyDetail?.game.externalEventId ??
      routeId,
    payload,
    legacyDetail
  });

  const historicalTrendCards = await buildHistoricalTrendCards({
    leagueKey,
    eventLabel: merged.eventLabel,
    eventType: merged.eventType,
    participants: merged.participants,
    externalEventId: merged.externalEventId
  });

  return {
    ...merged,
    trendCards: (
      historicalTrendCards.length
        ? historicalTrendCards
        : [
            ...(payload?.trendCards ?? []),
            ...(!payload && legacyDetail ? buildLegacyTrendCards(legacyDetail) : [])
          ]
    ).slice(0, 3)
  };
}
