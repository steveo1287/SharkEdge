export type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  description: string;
};

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
    href: "/games",
    label: "Games",
    shortLabel: "Games",
    description: "Open the slate, orient by matchup, and route straight into game detail."
  },
  {
    href: "/props",
    label: "Props",
    shortLabel: "Props",
    description: "Hunt player markets, fair value, and usage-driven context."
  }
];

export const RESEARCH_NAV_ITEMS: NavItem[] = [
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
    href: "/trends",
    label: "Trends",
    shortLabel: "Trends",
    description: "Historical systems, validation warnings, and active matches."
  },
  {
    href: "/content",
    label: "Content",
    shortLabel: "Content",
    description: "Original coverage, recaps, and betting-native explainers."
  },
  {
    href: "/watchlist",
    label: "Watchlist",
    shortLabel: "Watchlist",
    description: "Saved books, props, teams, trends, and alerts."
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
    href: "/performance",
    label: "Performance",
    shortLabel: "Performance",
    description: "Review CLV, units, hit rate, and what is actually working."
  },
  {
    href: "/alerts",
    label: "Alerts",
    shortLabel: "Alerts",
    description: "Price, movement, and trend notifications."
  }
];

export function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  if (href === "/teams" && pathname.startsWith("/leagues/")) {
    return true;
  }

  if (href === "/games" && pathname.startsWith("/game/")) {
    return true;
  }

  if (href === "/content" && pathname.startsWith("/stories/")) {
    return true;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getRouteMeta(pathname: string) {
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
      match: (value: string) => isActivePath(value, "/teams") || value.startsWith("/leagues/"),
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
