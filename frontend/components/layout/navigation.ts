export type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  description: string;
};

export type LeagueNavItem = NavItem & {
  leagueKey: string;
};

export const LEAGUE_NAV_ITEMS: LeagueNavItem[] = [
  {
    href: "/leagues/nba",
    label: "NBA",
    shortLabel: "NBA",
    leagueKey: "NBA",
    description: "League hub for scoreboard, standings, featured edges, and matchup routing."
  },
  {
    href: "/leagues/ncaab",
    label: "NCAAB",
    shortLabel: "NCAAB",
    leagueKey: "NCAAB",
    description: "College basketball board, trends, and one-league command center."
  },
  {
    href: "/leagues/mlb",
    label: "MLB",
    shortLabel: "MLB",
    leagueKey: "MLB",
    description: "Baseball hub with standings, recent form, props, and game intelligence."
  },
  {
    href: "/leagues/nhl",
    label: "NHL",
    shortLabel: "NHL",
    leagueKey: "NHL",
    description: "Hockey scoreboard, market context, and team-level research flow."
  },
  {
    href: "/leagues/nfl",
    label: "NFL",
    shortLabel: "NFL",
    leagueKey: "NFL",
    description: "Pro football league desk with matchup routing and trend support."
  },
  {
    href: "/leagues/ncaaf",
    label: "NCAAF",
    shortLabel: "NCAAF",
    leagueKey: "NCAAF",
    description: "College football league desk for slate, context, and best bets."
  },
  {
    href: "/leagues/ufc",
    label: "UFC",
    shortLabel: "UFC",
    leagueKey: "UFC",
    description: "Fight-week market hub with active cards, props, and research routing."
  },
  {
    href: "/leagues/boxing",
    label: "Boxing",
    shortLabel: "Boxing",
    leagueKey: "BOXING",
    description: "Fight market desk for cards, stories, and betting-native context."
  }
];

export const MAIN_NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Home",
    shortLabel: "Home",
    description: "Today's command center for the market, the matchup, and the next best move."
  },
  {
    href: "/board",
    label: "Board",
    shortLabel: "Board",
    description: "The live board with verified books, pricing truth, and movement worth reacting to."
  },
  {
    href: "/props",
    label: "Props",
    shortLabel: "Props",
    description: "Hunt player markets, fair value, and usage-driven context."
  },
  {
    href: "/trends",
    label: "Trends",
    shortLabel: "Trends",
    description: "Historical systems, validation warnings, and active matches."
  },
  {
    href: "/watchlist",
    label: "Watchlist",
    shortLabel: "Watchlist",
    description: "Saved books, props, teams, trends, and alerts."
  },
  {
    href: "/performance",
    label: "Performance",
    shortLabel: "Perf",
    description: "Review CLV, units, hit rate, and what is actually working."
  }
];

export const RESEARCH_NAV_ITEMS: NavItem[] = [
  {
    href: "/games",
    label: "Games",
    shortLabel: "Games",
    description: "Open the slate, orient by matchup, and route straight into game detail."
  },
  {
    href: "/players",
    label: "Players",
    shortLabel: "Players",
    description: "Deep player research, rolling form, and prop-pressure context."
  },
  {
    href: "/teams",
    label: "Teams",
    shortLabel: "Teams",
    description: "Team-level form, matchup context, and league-entry research."
  },
  {
    href: "/content",
    label: "Content",
    shortLabel: "Content",
    description: "Original coverage, recaps, and betting-native explainers."
  }
];

export const SECONDARY_NAV_ITEMS: NavItem[] = [
  {
    href: "/bets",
    label: "Bets",
    shortLabel: "Bets",
    description: "Track your card, open exposure, and best-bet workflow."
  },
  {
    href: "/alerts",
    label: "Alerts",
    shortLabel: "Alerts",
    description: "Price, movement, and trend notifications."
  }
];

const LEAGUE_DISPLAY_NAMES: Record<string, string> = {
  NBA: "NBA",
  NCAAB: "NCAA Basketball",
  MLB: "MLB",
  NHL: "NHL",
  NFL: "NFL",
  NCAAF: "College Football",
  UFC: "UFC",
  BOXING: "Boxing"
};

function getLeagueKeyFromPath(pathname: string) {
  if (!pathname.startsWith("/leagues/")) {
    return null;
  }

  const segment = pathname.split("/")[2];
  return segment ? segment.toUpperCase() : null;
}

export function getLeagueDisplayName(leagueKey: string | null | undefined) {
  if (!leagueKey) {
    return "League";
  }

  return LEAGUE_DISPLAY_NAMES[leagueKey.toUpperCase()] ?? leagueKey.toUpperCase();
}

export function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  if (href === "/teams" && (pathname.startsWith("/leagues/") || pathname.startsWith("/team/"))) {
    return true;
  }

  if (href === "/games" && pathname.startsWith("/game/")) {
    return true;
  }

  if (href === "/content" && pathname.startsWith("/stories/")) {
    return true;
  }

  if (href.startsWith("/leagues/")) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getRouteMeta(pathname: string) {
  const leagueKey = getLeagueKeyFromPath(pathname);

  if (leagueKey) {
    const leagueName = getLeagueDisplayName(leagueKey);

    return {
      eyebrow: `${leagueName} League Hub`,
      title: leagueName,
      subtitle:
        "League-first scoreboard, best bets, standings, trends, and direct routing into every matchup that matters."
    };
  }

  const routes = [
    {
      match: (value: string) => value === "/",
      eyebrow: "Command Center",
      title: "SharkEdge",
      subtitle: "The market, the matchup, and the reason behind the edge."
    },
    {
      match: (value: string) => isActivePath(value, "/board"),
      eyebrow: "Market Board",
      title: "Verified Prices",
      subtitle: "Track the numbers that matter, the books that moved, and the lines worth chasing."
    },
    {
      match: (value: string) => isActivePath(value, "/games") || value.startsWith("/game/"),
      eyebrow: "Games",
      title: "Research Slate",
      subtitle: "Open the matchup, understand the market, and move straight into the game lab."
    },
    {
      match: (value: string) => isActivePath(value, "/props"),
      eyebrow: "Prop Lab",
      title: "Player Markets",
      subtitle: "Price, role, movement, and context in one research flow."
    },
    {
      match: (value: string) => isActivePath(value, "/players"),
      eyebrow: "Players",
      title: "Workload Radar",
      subtitle: "Find the names driving the strongest current prop and market pressure."
    },
    {
      match: (value: string) => isActivePath(value, "/teams"),
      eyebrow: "Teams",
      title: "Team Context",
      subtitle: "Schedule spot, recent form, and board pressure without the fluff."
    },
    {
      match: (value: string) => isActivePath(value, "/trends"),
      eyebrow: "Trends Engine",
      title: "System Research",
      subtitle: "Build, validate, and monitor historical angles with actual caution flags."
    },
    {
      match: (value: string) => isActivePath(value, "/content") || value.startsWith("/stories/"),
      eyebrow: "Content",
      title: "Original Coverage",
      subtitle: "News, recaps, and betting relevance written for research, not empty traffic."
    },
    {
      match: (value: string) => isActivePath(value, "/watchlist"),
      eyebrow: "Watchlist",
      title: "Saved Edges",
      subtitle: "Track what matters and let SharkEdge tell you when it changes."
    },
    {
      match: (value: string) => isActivePath(value, "/bets"),
      eyebrow: "Bet Tracker",
      title: "Open Exposure",
      subtitle: "Keep your card, prices, and outcomes in one honest ledger."
    },
    {
      match: (value: string) => isActivePath(value, "/performance"),
      eyebrow: "Performance",
      title: "What's Working",
      subtitle: "CLV, units, and leaks with no fake confidence."
    },
    {
      match: (value: string) => isActivePath(value, "/alerts"),
      eyebrow: "Alerts",
      title: "Price Triggers",
      subtitle: "Movement, thresholds, and saved-system matches worth reacting to."
    }
  ];

  return (
    routes.find((route) => route.match(pathname)) ?? {
      eyebrow: "SharkEdge",
      title: "Sports Intelligence",
      subtitle: "Research the board, the matchup, and the market in one place."
    }
  );
}
