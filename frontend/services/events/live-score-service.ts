import { BOARD_SPORT_ORDER, BOARD_SPORTS, getBoardSportConfig } from "@/lib/config/board-sports";
import { formatEventLabelFromParticipants, formatScoreboardFromParticipants } from "@/lib/utils/ledger";
import type {
  BoardSportSectionView,
  GameCardView,
  GameStatus,
  LeagueKey,
  ScoreboardPreviewView
} from "@/lib/types/domain";
import type { SupportedLeagueKey } from "@/lib/types/ledger";

import { boxingEventProvider } from "./boxing-provider";
import { espnEventProvider } from "./espn-provider";
import { ncaaFallbackEventProvider } from "./ncaa-fallback-provider";
import type { EventProvider, ProviderEvent } from "./provider-types";
import { ufcEventProvider } from "./ufc-provider";

type ScoreboardResolution = {
  events: ProviderEvent[];
  providerLabel: string | null;
  providerKey: string | null;
  note: string;
  stale: boolean;
  failed: boolean;
};

const LIVE_SCORE_PROVIDER_CHAINS: Record<SupportedLeagueKey, EventProvider[]> = {
  NBA: [espnEventProvider],
  NCAAB: [espnEventProvider, ncaaFallbackEventProvider],
  MLB: [espnEventProvider],
  NHL: [espnEventProvider],
  NFL: [espnEventProvider],
  NCAAF: [espnEventProvider, ncaaFallbackEventProvider],
  UFC: [ufcEventProvider],
  BOXING: [boxingEventProvider]
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function mapProviderStatus(status: ProviderEvent["status"]): GameStatus {
  if (status === "LIVE") {
    return "LIVE";
  }
  if (status === "FINAL") {
    return "FINAL";
  }
  if (status === "POSTPONED" || status === "CANCELED" || status === "DELAYED") {
    return "POSTPONED";
  }

  return "PREGAME";
}

function getEventStateDetail(event: ProviderEvent) {
  if (!event.stateJson || typeof event.stateJson !== "object") {
    return null;
  }

  const state = event.stateJson as Record<string, unknown>;
  const detail =
    typeof state.detail === "string"
      ? state.detail
      : typeof state.shortDetail === "string"
        ? state.shortDetail
        : null;
  const period =
    typeof state.period === "number" || typeof state.period === "string"
      ? `P${state.period}`
      : null;
  const clock = typeof state.displayClock === "string" ? state.displayClock : null;

  return [detail, period, clock].filter(Boolean).join(" | ") || null;
}

function toScoreboardPreview(event: ProviderEvent): ScoreboardPreviewView {
  return {
    id: event.externalEventId,
    label: formatEventLabelFromParticipants(
      event.participants.map((participant, index) => ({
        id: `${event.externalEventId}-${index}`,
        competitorId: participant.externalCompetitorId ?? `${event.externalEventId}-${index}`,
        role: participant.role,
        sortOrder: participant.sortOrder,
        name: participant.name,
        abbreviation: participant.abbreviation,
        type: participant.type,
        score: participant.score,
        record: participant.record,
        isWinner: participant.isWinner
      }))
    ),
    status: mapProviderStatus(event.status),
    stateDetail: getEventStateDetail(event),
    scoreboard: formatScoreboardFromParticipants(
      event.participants.map((participant, index) => ({
        id: `${event.externalEventId}-${index}`,
        competitorId: participant.externalCompetitorId ?? `${event.externalEventId}-${index}`,
        role: participant.role,
        sortOrder: participant.sortOrder,
        name: participant.name,
        abbreviation: participant.abbreviation,
        type: participant.type,
        score: participant.score,
        record: participant.record,
        isWinner: participant.isWinner
      }))
    ),
    startTime: event.startTime,
    providerKey: event.providerKey,
    stale: false
  };
}

function matchEventToGame(game: GameCardView, events: ProviderEvent[]) {
  const awayKey = normalizeName(game.awayTeam.name);
  const homeKey = normalizeName(game.homeTeam.name);

  return (
    events.find((event) => {
      const home = event.participants.find((participant) => participant.role === "HOME");
      const away = event.participants.find((participant) => participant.role === "AWAY");

      if (!home || !away) {
        return false;
      }

      return normalizeName(home.name) === homeKey && normalizeName(away.name) === awayKey;
    }) ?? null
  );
}

function applyScoreState(game: GameCardView, event: ProviderEvent | null): GameCardView {
  if (!event) {
    return game;
  }

  return {
    ...game,
    status: mapProviderStatus(event.status),
    venue: event.venue ?? game.venue
  };
}

async function resolveLeagueScoreboard(leagueKey: SupportedLeagueKey): Promise<ScoreboardResolution> {
  const providers = LIVE_SCORE_PROVIDER_CHAINS[leagueKey] ?? [];
  let lastError: string | null = null;

  for (const provider of providers) {
    try {
      const events = await provider.fetchScoreboard(leagueKey);
      return {
        events,
        providerLabel: provider.label,
        providerKey: provider.key,
        note:
          events.length > 0
            ? `${provider.label} returned ${events.length} event(s).`
            : `${provider.label} is connected, but there are no current events in the feed.`,
        stale: false,
        failed: false
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    events: [],
    providerLabel: providers[0]?.label ?? null,
    providerKey: providers[0]?.key ?? null,
    note: lastError ?? "No live score provider is wired for this league yet.",
    stale: false,
    failed: true
  };
}

export async function buildBoardSportSections(args: {
  selectedLeague: "ALL" | LeagueKey;
  gamesByLeague: Partial<Record<LeagueKey, GameCardView[]>>;
}) {
  const visibleSports =
    args.selectedLeague === "ALL"
      ? BOARD_SPORTS
      : BOARD_SPORTS.filter((sport) => sport.leagueKey === args.selectedLeague);

  const resolutions = await Promise.all(
    visibleSports.map(async (sport) => ({
      sport,
      scoreboard: await resolveLeagueScoreboard(sport.leagueKey)
    }))
  );

  return resolutions
    .sort(
      (left, right) =>
        BOARD_SPORT_ORDER.indexOf(left.sport.leagueKey) -
        BOARD_SPORT_ORDER.indexOf(right.sport.leagueKey)
    )
    .map(({ sport, scoreboard }) => {
      const matchedGames = (args.gamesByLeague[sport.leagueKey] ?? []).map((game) =>
        applyScoreState(game, matchEventToGame(game, scoreboard.events))
      );
      const scoreboardPreview = scoreboard.events
        .slice(0, 4)
        .map((event) => toScoreboardPreview(event));

      let adapterState: BoardSportSectionView["adapterState"] = "COMING_SOON";
      if (sport.status === "LIVE") {
        if (matchedGames.length) {
          adapterState = "BOARD";
        } else if (scoreboardPreview.length) {
          adapterState = "SCORES_ONLY";
        } else if (scoreboard.failed) {
          adapterState = "ADAPTER_PENDING";
        } else {
          adapterState = "NO_EVENTS";
        }
      } else if (sport.status === "PARTIAL") {
        adapterState = scoreboardPreview.length ? "SCORES_ONLY" : "ADAPTER_PENDING";
      }

      return {
        leagueKey: sport.leagueKey,
        leagueLabel: sport.leagueLabel,
        sport: sport.sport,
        status: sport.status,
        liveScoreProvider: sport.liveScoreProvider,
        currentOddsProvider: sport.currentOddsProvider,
        historicalOddsProvider: sport.historicalOddsProvider,
        note: sport.note,
        detail: sport.detail,
        scoreboardDetail:
          sport.status === "LIVE"
            ? scoreboard.note
            : `${sport.scoreboardDetail} ${scoreboard.providerLabel ? `Current provider: ${scoreboard.providerLabel}.` : ""}`.trim(),
        adapterState,
        stale: scoreboard.stale,
        games: matchedGames,
        scoreboard: scoreboardPreview
      } satisfies BoardSportSectionView;
    });
}

export function getBoardVisibleLeagues(selectedLeague: "ALL" | LeagueKey) {
  return selectedLeague === "ALL"
    ? BOARD_SPORTS.map((sport) => ({
        id: `support_${sport.leagueKey.toLowerCase()}`,
        key: sport.leagueKey,
        name: sport.leagueLabel,
        sport: sport.sport
      }))
    : BOARD_SPORTS.filter((sport) => sport.leagueKey === selectedLeague).map((sport) => ({
        id: `support_${sport.leagueKey.toLowerCase()}`,
        key: sport.leagueKey,
        name: sport.leagueLabel,
        sport: sport.sport
      }));
}

export function getBoardSupportSummary() {
  const live = BOARD_SPORTS.filter((sport) => sport.status === "LIVE").length;
  const partial = BOARD_SPORTS.filter((sport) => sport.status === "PARTIAL").length;
  const comingSoon = BOARD_SPORTS.filter((sport) => sport.status === "COMING SOON").length;

  return { live, partial, comingSoon };
}

export function getBoardSupportConfig(leagueKey: LeagueKey) {
  return getBoardSportConfig(leagueKey);
}
