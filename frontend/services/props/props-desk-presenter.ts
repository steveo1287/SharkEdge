import type { PropCardView } from "@/lib/types/domain";
import { sortPropsByPriority } from "@/app/_components/props-desk-sections";

type CoverageEntryLike = {
  leagueKey: string;
  status: string;
  supportLabel?: string;
  note: string;
};

type LeagueLike = {
  id: string;
  key: string;
  name: string;
};

type TeamLike = {
  id: string;
  leagueId: string;
  abbreviation: string;
};

type PlayerLike = {
  id: string;
  leagueId: string;
  name: string;
};

type SportsbookLike = {
  id: string;
  key: string;
  name: string;
};

type ProviderHealthLike = {
  state: string;
  label: string;
  summary: string;
  freshnessLabel: string;
  freshnessMinutes?: number | null;
  warnings: string[];
};

export type PropsDeskDataLike = {
  leagues: LeagueLike[];
  teams: TeamLike[];
  players: PlayerLike[];
  coverage: CoverageEntryLike[];
  sportsbooks: SportsbookLike[];
  props: PropCardView[];
  providerHealth: ProviderHealthLike;
  sourceNote: string;
};

export type PropsDeskFiltersLike = {
  league: string;
  marketType: string;
  team: string;
  player: string;
  sportsbook: string;
  valueFlag: string;
  sortBy: string;
};

export type PropsDeskPresentation = {
  selectedLeague: LeagueLike | null;
  selectedLeagueLabel: string;
  leagueTeams: TeamLike[];
  leaguePlayers: PlayerLike[];
  rankedProps: PropCardView[];
  featuredProps: PropCardView[];
  watchlistProps: PropCardView[];
  realBookCount: number;
  liveCoverageCount: number;
  partialCoverageCount: number;
  comingSoonCoverageCount: number;
  summarizedDeskStatus: string;
};

function summarizePropDeskStatus(
  summary: string,
  sourceNote: string,
  warningCount: number
) {
  const combined = `${summary} ${sourceNote}`.toLowerCase();

  if (combined.includes("out_of_usage_credits") || combined.includes("usage quota")) {
    return `Upstream quota pressure is reducing live prop coverage depth${
      warningCount ? ` (${warningCount} warning${warningCount === 1 ? "" : "s"})` : ""
    }.`;
  }

  if (
    combined.includes("partially connected") ||
    combined.includes("partial") ||
    combined.includes("degraded")
  ) {
    return `Live props are partially connected${
      warningCount ? ` with ${warningCount} active warning${warningCount === 1 ? "" : "s"}` : ""
    }.`;
  }

  if (combined.includes("offline") || combined.includes("unavailable")) {
    return `Live prop coverage is currently unavailable${
      warningCount ? ` (${warningCount} warning${warningCount === 1 ? "" : "s"})` : ""
    }.`;
  }

  if (warningCount > 0) {
    return `${warningCount} provider warning${
      warningCount === 1 ? "" : "s"
    } are affecting live prop coverage depth.`;
  }

  return summary;
}

export function buildPropsDeskPresentation(args: {
  data: PropsDeskDataLike;
  filters: PropsDeskFiltersLike;
}): PropsDeskPresentation {
  const { data, filters } = args;

  const selectedLeague =
    filters.league === "ALL"
      ? null
      : data.leagues.find((league) => league.key === filters.league) ?? null;

  const leagueTeams = selectedLeague
    ? data.teams.filter((team) => team.leagueId === selectedLeague.id)
    : data.teams;

  const leaguePlayers = selectedLeague
    ? data.players.filter((player) => player.leagueId === selectedLeague.id)
    : data.players;

  const liveCoverageCount = data.coverage.filter((entry) => entry.status === "LIVE").length;
  const partialCoverageCount = data.coverage.filter((entry) => entry.status === "PARTIAL").length;
  const comingSoonCoverageCount = data.coverage.filter(
    (entry) => entry.status === "COMING_SOON"
  ).length;

  const realBookCount = data.sportsbooks.length;
  const selectedLeagueLabel = selectedLeague?.name ?? "All sports";
  const rankedProps = sortPropsByPriority(data.props);
  const featuredProps = rankedProps.slice(0, 3);
  const watchlistProps = rankedProps.slice(3, 9);

  const summarizedDeskStatus = summarizePropDeskStatus(
    data.providerHealth.summary,
    data.sourceNote,
    data.providerHealth.warnings.length
  );

  return {
    selectedLeague,
    selectedLeagueLabel,
    leagueTeams,
    leaguePlayers,
    rankedProps,
    featuredProps,
    watchlistProps,
    realBookCount,
    liveCoverageCount,
    partialCoverageCount,
    comingSoonCoverageCount,
    summarizedDeskStatus
  };
}
