import type {
  GameDetailView as LegacyGameDetailView,
  LeagueKey
} from "@/lib/types/domain";
import { parseMatchupRouteId } from "@/lib/utils/matchups";
import { getGameDetail as getLegacyGameDetail } from "@/services/odds/detail-service";
import { getMatchupProviders, getScoreProviders } from "@/services/providers/registry";
import type { ProviderEvent } from "@/services/events/provider-types";
import type { MatchupDetailPayload } from "@/services/stats/provider-types";

function normalizeName(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
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

export async function getGameDetailLiveOddsInputs(routeId: string): Promise<{
  leagueKey: LeagueKey | null;
  rawExternalId: string;
  payload: MatchupDetailPayload | null;
  legacyDetail: LegacyGameDetailView | null;
}> {
  const parsed = parseMatchupRouteId(routeId);
  const rawExternalId = parsed.externalId;
  const rawLegacyDetail = await getLegacyGameDetail(routeId);
  const fallbackLegacyDetail =
    routeId !== rawExternalId ? await getLegacyGameDetail(rawExternalId) : null;
  const legacyDetail =
    [rawLegacyDetail, fallbackLegacyDetail].find((detail) => detail?.source === "live") ?? null;
  const leagueKey = parsed.leagueKey ?? legacyDetail?.league.key ?? null;

  if (!leagueKey) {
    return {
      leagueKey: null,
      rawExternalId,
      payload: null,
      legacyDetail
    };
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

  return {
    leagueKey,
    rawExternalId,
    payload,
    legacyDetail
  };
}
