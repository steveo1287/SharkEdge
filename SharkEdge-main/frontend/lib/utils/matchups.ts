import type { LeagueKey } from "@/lib/types/domain";

const MATCHUP_ID_SEPARATOR = "__";

export function encodeMatchupRouteId(leagueKey: LeagueKey, externalId: string) {
  return `${leagueKey}${MATCHUP_ID_SEPARATOR}${encodeURIComponent(externalId)}`;
}

export function buildMatchupHref(leagueKey: LeagueKey, externalId: string) {
  return `/game/${encodeMatchupRouteId(leagueKey, externalId)}`;
}

export function parseMatchupRouteId(routeId: string) {
  const separatorIndex = routeId.indexOf(MATCHUP_ID_SEPARATOR);
  if (separatorIndex === -1) {
    return {
      leagueKey: null,
      externalId: decodeURIComponent(routeId)
    };
  }

  const leagueKey = routeId.slice(0, separatorIndex) as LeagueKey;
  const externalId = decodeURIComponent(
    routeId.slice(separatorIndex + MATCHUP_ID_SEPARATOR.length)
  );

  return {
    leagueKey,
    externalId
  };
}
