import type {
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
import { parseMatchupRouteId } from "@/lib/utils/matchups";
import { mockDatabase } from "@/prisma/seed-data";
import { getGameDetail as getLegacyGameDetail } from "@/services/odds/odds-service";
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
      recentResults: [],
      notes: [
        detail.source === "mock"
          ? "Showing seeded matchup context while live detail adapters are unavailable."
          : "Using the current odds board detail as the matchup fallback."
      ]
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
      recentResults: [],
      notes: [
        detail.source === "mock"
          ? "Showing seeded matchup context while live detail adapters are unavailable."
          : "Using the current odds board detail as the matchup fallback."
      ]
    }
  ];
}

function buildOddsSummaryFromLegacy(detail: LegacyGameDetailView) {
  return {
    bestSpread: detail.bestMarkets.spread.label,
    bestMoneyline: detail.bestMarkets.moneyline.label,
    bestTotal: detail.bestMarkets.total.label,
    sourceLabel: detail.source === "live" ? "Current odds backend" : "Seeded SharkEdge demo"
  };
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
      note: "Computed from stored pricing snapshots for this seeded or live matchup.",
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
      note:
        detail.source === "mock"
          ? "Seeded score from the existing demo model layer."
          : "Current board composite signal from the live odds path.",
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
      recentResults: [],
      notes: ["This competitor slot is reserved until a dedicated live combat provider is connected."]
    }
  ] satisfies MatchupParticipantView[];
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
    payload?.participants ??
    (legacyDetail
      ? buildParticipantsFromLegacy(legacyDetail)
      : registry.status === "COMING_SOON" || !isTeamEvent(payload?.eventType ?? "OTHER")
        ? buildCombatPlaceholderParticipants(leagueKey, externalEventId)
        : []);

  const trendCards = [
    ...(payload?.trendCards ?? []),
    ...(!payload && legacyDetail ? buildLegacyTrendCards(legacyDetail) : [])
  ];

  const notes = Array.from(
    new Set([
      ...(payload?.notes ?? []),
      ...(legacyDetail?.source === "mock"
        ? [
            "Seeded matchup detail is being shown because the live detail provider for this exact event could not be resolved."
          ]
        : []),
      ...(registry.status !== "LIVE"
        ? [config.detail]
        : [])
    ].filter(Boolean))
  );

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
      payload?.currentOddsProvider ??
      (legacyDetail ? buildOddsSummaryFromLegacy(legacyDetail).sourceLabel : config.currentOddsProvider),
    historicalOddsProvider: payload?.historicalOddsProvider ?? config.historicalOddsProvider,
    lastUpdatedAt: payload?.lastUpdatedAt ?? null,
    participants,
    oddsSummary: payload?.oddsSummary ?? (legacyDetail ? buildOddsSummaryFromLegacy(legacyDetail) : null),
    books: legacyDetail?.books ?? [],
    props: legacyDetail?.props ?? [],
    propsSupport: derivePropsSupport(leagueKey, payload, legacyDetail),
    marketRanges: legacyDetail?.marketRanges ?? payload?.marketRanges ?? [],
    lineMovement: legacyDetail?.lineMovement ?? [],
    trendCards,
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
  const legacyDetail = rawLegacyDetail ?? fallbackLegacyDetail;
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

  return mergeMatchupDetail({
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
}
