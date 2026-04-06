import type { LeagueKey, LeagueSnapshotView } from "@/lib/types/domain";

export type LeagueHubQuickLink = {
  label: string;
  href: string;
  description: string;
};

export type LeagueHubSummaryMetric = {
  label: string;
  value: string;
};

export type LeagueHubSummary = {
  metrics: LeagueHubSummaryMetric[];
  verifiedBoardLabel: string;
};

export function buildLeagueHubQuickLinks(leagueKey: LeagueKey): LeagueHubQuickLink[] {
  return [
    {
      label: "League board",
      href: `/board?league=${leagueKey}`,
      description: "Verified market board scoped to this league."
    },
    {
      label: "Games desk",
      href: `/games?league=${leagueKey}`,
      description: "Jump into the slate and route into matchup pages."
    },
    {
      label: "League props",
      href: `/props?league=${leagueKey}`,
      description: "Player-market workflow filtered to this league."
    },
    {
      label: "Trend engine",
      href: `/trends?league=${leagueKey}&sample=5`,
      description: "Historical system support for this league."
    },
    {
      label: "Teams desk",
      href: `/teams?league=${leagueKey}`,
      description: "Team and roster context without leaving league scope."
    },
    {
      label: "League stories",
      href: `/content?league=${leagueKey}`,
      description: "Internal story routing tied to this league."
    }
  ];
}

export function summarizeLeagueHub(args: {
  leagueKey: LeagueKey;
  snapshot: LeagueSnapshotView | null;
  hasVerifiedBoard: boolean;
  propsCount: number;
  storiesCount: number;
  trendCount: number;
}): LeagueHubSummary {
  const standingsCount = args.snapshot?.standings?.length ?? 0;
  const featuredGamesCount = args.snapshot?.featuredGames?.length ?? 0;
  const previousGamesCount = args.snapshot?.previousGames?.length ?? 0;

  let verifiedBoardLabel = "League desk is running light";

  if (args.hasVerifiedBoard && args.propsCount > 0) {
    verifiedBoardLabel = "Verified board and prop routing are live";
  } else if (args.hasVerifiedBoard) {
    verifiedBoardLabel = "Verified board is live";
  } else if (featuredGamesCount > 0 || standingsCount > 0 || previousGamesCount > 0) {
    verifiedBoardLabel = "Scoreboard fallback is active while verified board data is thin";
  }

  return {
    metrics: [
      {
        label: "Featured games",
        value: String(featuredGamesCount)
      },
      {
        label: "Standings rows",
        value: String(standingsCount)
      },
      {
        label: "Props on desk",
        value: String(args.propsCount)
      },
      {
        label: "Stories",
        value: String(args.storiesCount)
      },
      {
        label: "Trend cards",
        value: String(args.trendCount)
      },
      {
        label: "Recent results",
        value: String(previousGamesCount)
      }
    ],
    verifiedBoardLabel
  };
}