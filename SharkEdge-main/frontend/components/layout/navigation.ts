export type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  description: string;
};

export type LeagueNavItem = NavItem & {
  leagueKey: string;
};

export const MAIN_NAV_ITEMS: NavItem[] = [
  {
    href: "/board",
    label: "Board",
    description: "Ranked edge board with pricing, support, and execution context."
  },
  {
    href: "/games",
    label: "Games",
    description: "Slate and event detail built around market conviction."
  },
  {
    href: "/trends",
    label: "Trends",
    description: "Historical evidence scored against the live board."
  },
  {
    href: "/bets",
    label: "Portfolio",
    shortLabel: "Portfolio",
    description: "Open exposure, pending opportunities, CLV, and grading."
  },
  {
    href: "/alerts",
    label: "Alerts",
    description: "Movement, price, and setup notifications."
  }
];

export const RESEARCH_NAV_ITEMS: NavItem[] = [
  {
    href: "/props",
    label: "Props",
    description: "Player and specialty market research."
  },
  {
    href: "/players",
    label: "Players",
    description: "Player-level role, workload, and form context."
  },
  {
    href: "/teams",
    label: "Teams",
    description: "Team-level matchup, pace, form, and scheduling context."
  }
];

export const SECONDARY_NAV_ITEMS: NavItem[] = [
  {
    href: "/performance",
    label: "Performance",
    description: "Results, CLV, and leak review."
  },
  {
    href: "/watchlist",
    label: "Watchlist",
    description: "Saved games, markets, and ideas."
  },
  {
    href: "/providers",
    label: "Providers",
    description: "Feed readiness and source diagnostics."
  },
  {
    href: "/settings",
    label: "Settings",
    description: "Preferences and system configuration."
  }
];

export const LEAGUE_NAV_ITEMS: LeagueNavItem[] = [
  {
    href: "/games?league=NBA",
    label: "NBA",
    leagueKey: "NBA",
    description: "NBA slate and market flow."
  },
  {
    href: "/games?league=MLB",
    label: "MLB",
    leagueKey: "MLB",
    description: "MLB slate and market flow."
  },
  {
    href: "/games?league=NHL",
    label: "NHL",
    leagueKey: "NHL",
    description: "NHL slate and market flow."
  },
  {
    href: "/games?league=NFL",
    label: "NFL",
    leagueKey: "NFL",
    description: "NFL slate and market flow."
  },
  {
    href: "/games?league=NCAAB",
    label: "NCAAB",
    leagueKey: "NCAAB",
    description: "College basketball slate and market flow."
  },
  {
    href: "/games?league=NCAAF",
    label: "NCAAF",
    leagueKey: "NCAAF",
    description: "College football slate and market flow."
  },
  {
    href: "/games?league=UFC",
    label: "UFC",
    leagueKey: "UFC",
    description: "Fight card flow and market context."
  },
  {
    href: "/games?league=BOXING",
    label: "Boxing",
    leagueKey: "BOXING",
    description: "Fight card flow and market context."
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

function matchesPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isActivePath(pathname: string, href: string) {
  if (href.includes("?")) {
    const [base] = href.split("?");
    return pathname === base || pathname.startsWith(`${base}/`);
  }

  if (href === "/bets") {
    return matchesPath(pathname, "/bets");
  }

  if (href === "/games") {
    return matchesPath(pathname, "/games") || matchesPath(pathname, "/game");
  }

  return matchesPath(pathname, href);
}

export function getLeagueDisplayName(leagueKey: string | null | undefined) {
  if (!leagueKey) {
    return "League";
  }

  return LEAGUE_DISPLAY_NAMES[leagueKey.toUpperCase()] ?? leagueKey.toUpperCase();
}

export function getRouteMeta(pathname: string) {
  const routes = [
    {
      match: (value: string) => value === "/" || isActivePath(value, "/board"),
      eyebrow: "Live Edge Board",
      title: "Board",
      subtitle: "Rank live and upcoming opportunities by edge, support, and execution quality."
    },
    {
      match: (value: string) => isActivePath(value, "/games"),
      eyebrow: "Slate View",
      title: "Games",
      subtitle: "Move from game context into market conviction without losing the board state."
    },
    {
      match: (value: string) => value.startsWith("/game/"),
      eyebrow: "Market Detail",
      title: "Event Hub",
      subtitle: "Scoreboard, pricing, simulation, trends, and execution in one surface."
    },
    {
      match: (value: string) => isActivePath(value, "/trends"),
      eyebrow: "Evidence Engine",
      title: "Trends",
      subtitle: "Historical systems weighted by current market relevance rather than vanity records."
    },
    {
      match: (value: string) => isActivePath(value, "/bets"),
      eyebrow: "Portfolio",
      title: "Portfolio",
      subtitle: "Track open exposure, pending ideas, graded bets, CLV, and discipline."
    },
    {
      match: (value: string) => isActivePath(value, "/alerts"),
      eyebrow: "Automation",
      title: "Alerts",
      subtitle: "Stay on changes that matter instead of watching every board tick."
    },
    {
      match: (value: string) => isActivePath(value, "/performance"),
      eyebrow: "Review",
      title: "Performance",
      subtitle: "Measure what actually works using EV, CLV, and market quality."
    },
    {
      match: (value: string) => isActivePath(value, "/props"),
      eyebrow: "Research",
      title: "Props",
      subtitle: "Specialty market pricing and player-level opportunity work."
    },
    {
      match: (value: string) => isActivePath(value, "/watchlist"),
      eyebrow: "Saved",
      title: "Watchlist",
      subtitle: "Hold the setups worth revisiting when the market moves."
    },
    {
      match: (value: string) => isActivePath(value, "/providers"),
      eyebrow: "Infrastructure",
      title: "Providers",
      subtitle: "Feed freshness, readiness, and source stability."
    },
    {
      match: (value: string) => isActivePath(value, "/settings"),
      eyebrow: "System",
      title: "Settings",
      subtitle: "Control preferences and workflow defaults."
    },
    {
      match: (value: string) => isActivePath(value, "/players"),
      eyebrow: "Research",
      title: "Players",
      subtitle: "Player-level form, role, and prop pressure."
    },
    {
      match: (value: string) => isActivePath(value, "/teams"),
      eyebrow: "Research",
      title: "Teams",
      subtitle: "Team-level context, matchup environment, and schedule pressure."
    }
  ];

  return (
    routes.find((route) => route.match(pathname)) ?? {
      eyebrow: "SharkEdge",
      title: "Command",
      subtitle: "Market intelligence and execution surfaces."
    }
  );
}
