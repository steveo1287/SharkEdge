import type { LeagueKey } from "@/lib/types/domain";

type LeagueSnapshotLike = {
  featuredGames?: unknown[];
  standings?: unknown[];
  newsItems?: unknown[];
} | null;

type LeagueHubSummaryInput = {
  leagueKey: LeagueKey;
  snapshot: LeagueSnapshotLike;
  hasVerifiedBoard: boolean;
  propsCount: number;
  storiesCount: number;
  trendCount: number;
};

export type LeagueHubQuickLink = {
  label: string;
  href: string;
  description: string;
};

export type LeagueHubMetric = {
  label: string;
  value: number;
};

export function buildLeagueHubQuickLinks(leagueKey: LeagueKey): LeagueHubQuickLink[] {
  return [
    {
      label: "Scoreboard",
      href: `/board?league=${leagueKey}`,
      description: "Open the verified slate for this league."
    },
    {
      label: "Best Bets",
      href: `/props?league=${leagueKey}`,
      description: "Route into the strongest current pricing and prop pressure."
    },
    {
      label: "Teams",
      href: `/teams?league=${leagueKey}`,
      description: "Open team context, standings position, and matchup routing."
    },
    {
      label: "Standings",
      href: `/leagues/${leagueKey.toLowerCase()}#standings`,
      description: "Jump directly to the league table and featured games."
    },
    {
      label: "Trends",
      href: `/trends?league=${leagueKey}&sample=5`,
      description: "Historical systems and active angles for this league."
    },
    {
      label: "Stories",
      href: `/content?league=${leagueKey}`,
      description: "League-native coverage and betting-relevant explainers."
    }
  ];
}

export function summarizeLeagueHub({
  snapshot,
  hasVerifiedBoard,
  propsCount,
  storiesCount,
  trendCount
}: LeagueHubSummaryInput) {
  const featuredGames = snapshot?.featuredGames?.length ?? 0;
  const standingsRows = snapshot?.standings?.length ?? 0;

  const metrics: LeagueHubMetric[] = [
    {
      label: "Featured games",
      value: featuredGames
    },
    {
      label: "Standings rows",
      value: standingsRows
    },
    {
      label: "Prop entries",
      value: propsCount
    },
    {
      label: "Trend cards",
      value: trendCount
    },
    {
      label: "Stories",
      value: storiesCount
    }
  ];

  return {
    metrics,
    featuredGames,
    standingsRows,
    propsCount,
    storiesCount,
    trendCount,
    verifiedBoardLabel: hasVerifiedBoard ? "Verified board live" : "Scoreboard-only fallback"
  };
}
