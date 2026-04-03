import { prisma } from "@/lib/db/prisma";
import type {
  LeagueKey,
  TrendFilters,
  TrendMatchView
} from "@/lib/types/domain";
import { buildMatchupHref } from "@/lib/utils/matchups";
import { syncLeagueEventCatalog } from "@/services/events/event-service";
import { getProviderRegistryEntry } from "@/services/providers/registry";

const SUPPORTED_TREND_LEAGUES: LeagueKey[] = [
  "NBA",
  "NCAAB",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF",
  "UFC",
  "BOXING"
];

const TREND_MATCH_LOOKAHEAD_HOURS = 72;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function getTargetLeagues(filters: TrendFilters) {
  if (filters.league !== "ALL") {
    return [filters.league];
  }

  if (filters.sport === "ALL") {
    return SUPPORTED_TREND_LEAGUES;
  }

  return SUPPORTED_TREND_LEAGUES.filter((leagueKey) => {
    const entry = getProviderRegistryEntry(leagueKey);
    return entry ? entry.status !== "COMING_SOON" || filters.sport === "BOXING" : false;
  }).filter((leagueKey) => {
    const entry = getProviderRegistryEntry(leagueKey);
    switch (filters.sport) {
      case "BASKETBALL":
        return leagueKey === "NBA" || leagueKey === "NCAAB";
      case "BASEBALL":
        return leagueKey === "MLB";
      case "HOCKEY":
        return leagueKey === "NHL";
      case "FOOTBALL":
        return leagueKey === "NFL" || leagueKey === "NCAAF";
      case "MMA":
        return leagueKey === "UFC";
      case "BOXING":
        return leagueKey === "BOXING";
      default:
        return false;
    }
  });
}

function getActiveSubject(filters: TrendFilters) {
  return filters.team || filters.player || filters.fighter || filters.subject;
}

function buildMatchingLogic(filters: TrendFilters) {
  return [
    filters.league !== "ALL" ? filters.league : filters.sport,
    filters.market !== "ALL" ? filters.market : "all markets",
    filters.side !== "ALL" ? filters.side : null,
    getActiveSubject(filters) ? `subject: ${getActiveSubject(filters)}` : null,
    filters.opponent ? `opponent: ${filters.opponent}` : null
  ]
    .filter(Boolean)
    .join(" | ");
}

function supportsDirectEventMatching(filters: TrendFilters) {
  if (filters.side === "FAVORITE" || filters.side === "UNDERDOG") {
    return false;
  }

  if (filters.player && !filters.team) {
    return false;
  }

  return true;
}

function matchesParticipants(
  filters: TrendFilters,
  participants: Array<{ name: string; role: string }>
) {
  const names = participants.map((participant) => normalizeText(participant.name));
  const activeSubject = normalizeText(getActiveSubject(filters));

  if (activeSubject && !names.some((name) => name.includes(activeSubject))) {
    return false;
  }

  if (filters.opponent) {
    const opponent = normalizeText(filters.opponent);
    if (!names.some((name) => name.includes(opponent))) {
      return false;
    }
  }

  if (filters.side === "HOME" || filters.side === "AWAY") {
    if (!activeSubject) {
      return true;
    }

    return participants.some(
      (participant) =>
        normalizeText(participant.name).includes(activeSubject) &&
        participant.role === filters.side
    );
  }

  if (filters.side === "COMPETITOR_A" || filters.side === "COMPETITOR_B") {
    if (!activeSubject) {
      return true;
    }

    return participants.some(
      (participant) =>
        normalizeText(participant.name).includes(activeSubject) &&
        participant.role === filters.side
    );
  }

  return true;
}

async function ensureFreshEvents(leagues: LeagueKey[]) {
  await Promise.all(
    leagues.map((leagueKey) => {
      const entry = getProviderRegistryEntry(leagueKey);
      if (!entry?.scoreProviders.length) {
        return Promise.resolve();
      }

      return syncLeagueEventCatalog(leagueKey);
    })
  );
}

export async function getTodayTrendMatches(filters: TrendFilters): Promise<{
  matches: TrendMatchView[];
  note: string | null;
}> {
  const targetLeagues = getTargetLeagues(filters);

  if (!supportsDirectEventMatching(filters)) {
    return {
      matches: [],
      note:
        filters.side === "FAVORITE" || filters.side === "UNDERDOG"
          ? "Live or upcoming matching games cannot honestly validate favorite or underdog filters yet because market-side classification is not normalized into the event matcher."
          : "Player-only trend matches need linked team or prop context before SharkEdge can map them to the next slate honestly."
    };
  }

  await ensureFreshEvents(targetLeagues);

  const now = new Date();
  const max = new Date(now.getTime() + TREND_MATCH_LOOKAHEAD_HOURS * 60 * 60 * 1000);

  const events = await prisma.event.findMany({
    where: {
      league: {
        key: {
          in: targetLeagues
        }
      },
      OR: [
        {
          startTime: {
            gte: now,
            lte: max
          }
        },
        {
          status: "LIVE"
        }
      ]
    },
    orderBy: [{ status: "asc" }, { startTime: "asc" }],
    include: {
      league: {
        select: {
          key: true,
          sport: true
        }
      },
      participants: {
        orderBy: {
          sortOrder: "asc"
        },
        include: {
          competitor: {
            select: {
              name: true
            }
          }
        }
      }
    }
  });

  const matches = events
    .filter((event) =>
      matchesParticipants(
        filters,
        event.participants.map((participant) => ({
          name: participant.competitor.name,
          role: participant.role
        }))
      )
    )
    .map((event) => {
      const leagueKey = event.league.key as LeagueKey;
      const registry = getProviderRegistryEntry(leagueKey);
      const eventLabel = event.participants
        .map((participant) => participant.competitor.name)
        .join(" vs ");
      const marketContext =
        filters.market === "ALL"
          ? null
          : registry.currentOddsProviders.length
            ? `Current ${filters.market} context is available on the matchup page.`
            : `${filters.market} context is not wired for this league yet.`;

      return {
        id: event.id,
        sport: event.league.sport,
        leagueKey,
        eventLabel,
        startTime: event.startTime.toISOString(),
        status:
          event.status === "SCHEDULED"
            ? "PREGAME"
            : event.status === "FINAL"
              ? "FINAL"
              : event.status === "POSTPONED" || event.status === "DELAYED"
                ? "POSTPONED"
                : event.status === "CANCELED"
                  ? "CANCELED"
                  : "LIVE",
        stateDetail:
          typeof (event.stateJson as Record<string, unknown> | null)?.detail === "string"
            ? String((event.stateJson as Record<string, unknown>).detail)
            : null,
        matchingLogic: buildMatchingLogic(filters),
        oddsContext: marketContext,
        matchupHref: buildMatchupHref(leagueKey, event.externalEventId ?? event.id),
        boardHref:
          leagueKey === "UFC" || leagueKey === "BOXING"
            ? null
            : `/?league=${leagueKey}&date=${event.startTime.toISOString().slice(0, 10)}`,
        propsHref:
          registry.propsStatus === "LIVE"
            ? `/props?league=${leagueKey}${filters.market !== "ALL" ? `&marketType=${filters.market}` : ""}`
            : null,
        supportNote:
          registry.status === "LIVE"
            ? null
            : registry.propsNote
      } satisfies TrendMatchView;
    });

  return {
    matches,
    note: matches.length
      ? null
      : "No games in the next 24 hours match the active trend query. SharkEdge is showing the actual current slate instead of inventing matches."
  };
}
