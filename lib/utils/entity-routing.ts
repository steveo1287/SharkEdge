import { buildMatchupHref } from "@/lib/utils/matchups";
import type { LeagueKey, TeamRecord } from "@/lib/types/domain";

const EVENT_SCOPE_SEPARATOR = ":";
const ESPN_TEAM_LOGO_PATHS: Partial<Record<LeagueKey, string>> = {
  NBA: "nba",
  MLB: "mlb",
  NHL: "nhl",
  NFL: "nfl",
  NCAAF: "college-football"
};

export function scopeEventExternalId(
  leagueKey: LeagueKey,
  externalEventId: string
): string;
export function scopeEventExternalId(
  leagueKey: LeagueKey,
  externalEventId: string | null | undefined
): string | null;
export function scopeEventExternalId(
  leagueKey: LeagueKey,
  externalEventId: string | null | undefined
) {
  if (!externalEventId) {
    return null;
  }

  const trimmed = externalEventId.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith(`${leagueKey}${EVENT_SCOPE_SEPARATOR}`)) {
    return trimmed;
  }

  return `${leagueKey}${EVENT_SCOPE_SEPARATOR}${trimmed}`;
}

export function getScopedEventExternalIdCandidates(
  leagueKey: LeagueKey,
  externalEventId: string | null | undefined
) {
  if (!externalEventId) {
    return [];
  }

  const trimmed = externalEventId.trim();
  if (!trimmed) {
    return [];
  }

  return Array.from(new Set([scopeEventExternalId(leagueKey, trimmed), trimmed].filter(Boolean))) as string[];
}

export function resolveMatchupHref(args: {
  leagueKey: LeagueKey;
  externalEventId?: string | null;
  fallbackHref?: string | null;
}) {
  if (args.externalEventId) {
    return buildMatchupHref(args.leagueKey, args.externalEventId);
  }

  return args.fallbackHref ?? null;
}

function normalizeMediaId(value: unknown) {
  return typeof value === "string" && value.trim().length ? value.trim() : null;
}

export function getTeamLogoUrl(
  leagueKey: LeagueKey,
  team: Pick<TeamRecord, "externalIds"> | null | undefined
) {
  const espnId = normalizeMediaId(team?.externalIds?.espn);
  const leaguePath = ESPN_TEAM_LOGO_PATHS[leagueKey];

  if (espnId && leaguePath) {
    return `https://a.espncdn.com/i/teamlogos/${leaguePath}/500/${espnId}.png`;
  }

  return null;
}

export function getPlayerHeadshotUrl(
  leagueKey: LeagueKey,
  player: { externalIds?: Record<string, string> | null } | null | undefined
) {
  const espnId = normalizeMediaId(player?.externalIds?.espn);
  const leaguePath = ESPN_TEAM_LOGO_PATHS[leagueKey];

  if (espnId && leaguePath) {
    return `https://a.espncdn.com/i/headshots/${leaguePath}/players/full/${espnId}.png`;
  }

  return null;
}
