export type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  description: string;
  icon: string; // SVG path data
  badge?: string;
};

export type LeagueNavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  leagueKey: string;
  description: string;
};

// ─── SVG ICON PATHS ──────────────────────────────────────────────────────────
// Each is a string of SVG path elements (rendered at 16x16 viewBox)
export const NAV_ICONS = {
  home:       `<path d="M2.5 9.5 8 4l5.5 5.5M4 8.5V14h3.5v-3.5h1V14H12V8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  board:      `<rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4" fill="none"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4" fill="none"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4" fill="none"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4" fill="none"/>`,
  games:      `<rect x="2" y="3.5" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M2 7h12" stroke="currentColor" stroke-width="1.4"/><path d="M6 3.5V2M10 3.5V2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
  trends:     `<path d="M2 12l3.5-4 3 2.5L12 5l2 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M11 5h3v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  props:      `<circle cx="8" cy="5" r="2.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M3.5 14c0-2.485 2.015-4.5 4.5-4.5s4.5 2.015 4.5 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>`,
  sim:        `<path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/><path d="M9 11h4M11 9v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
  players:    `<circle cx="6" cy="5.5" r="2.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M2 14c0-2.2 1.8-4 4-4h2c2.2 0 4 1.8 4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/><path d="M12 7.5a2 2 0 000-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/><path d="M14 14a2 2 0 00-2-2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>`,
  teams:      `<path d="M8 3l1.6 3.2 3.6.5-2.6 2.5.6 3.5L8 11l-3.2 1.7.6-3.5L3 6.7l3.6-.5L8 3z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none"/>`,
  performance:`<path d="M2 13h2.5V9H2v4zM6.75 13H9V6H6.75v7zM11.5 13H14V2h-2.5v11z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/>`,
  bets:       `<rect x="2.5" y="4" width="11" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M2.5 7h11" stroke="currentColor" stroke-width="1.4"/><path d="M6 10.5h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
  alerts:     `<path d="M8 2a3 3 0 00-3 3v2c0 .52-.15 1.03-.43 1.47L3.5 11h9l-1.07-2.53A3 3 0 0111 7V5a3 3 0 00-3-3z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/><path d="M6.5 13a1.5 1.5 0 003 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
  watchlist:  `<path d="M8 13S3 9.5 3 6a5 5 0 0110 0c0 3.5-5 7-5 7z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/><circle cx="8" cy="6" r="1.5" fill="currentColor"/>`,
  settings:   `<circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.75 3.75l1.06 1.06M11.18 11.18l1.07 1.07M3.75 12.25l1.06-1.06M11.18 4.82l1.07-1.07" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
  providers:  `<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M8 2.5C8 2.5 10.5 5 10.5 8s-2.5 5.5-2.5 5.5M8 2.5C8 2.5 5.5 5 5.5 8S8 13.5 8 13.5M2.5 8h11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
  content:    `<path d="M3 4h10M3 8h7M3 12h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
};

// ─── NAV GROUPS ──────────────────────────────────────────────────────────────
export const MAIN_NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Home",
    description: "Today's command center — live edges, movement, and the next move.",
    icon: NAV_ICONS.home
  },
  {
    href: "/board",
    label: "Board",
    description: "Live market board across all sportsbooks with pricing and movement.",
    icon: NAV_ICONS.board
  },
  {
    href: "/props",
    label: "Props",
    description: "Player props market — price, role, movement, and EV context.",
    icon: NAV_ICONS.props
  },
  {
    href: "/sim",
    label: "Sim Hub",
    description: "Simulation command desk that routes into focused NBA and MLB workspaces.",
    icon: NAV_ICONS.sim,
    badge: "SIM"
  },
  {
    href: "/trends",
    label: "Trends",
    description: "Historical systems, statistical validation, and live matches.",
    icon: NAV_ICONS.trends
  },
  {
    href: "/sharktrends",
    label: "SharkTrends",
    description: "Promotion board for verified trend systems, live qualifiers, proof gates, and command blockers.",
    icon: NAV_ICONS.trends,
    badge: "NEW"
  }
];

export const RESEARCH_NAV_ITEMS: NavItem[] = [
  {
    href: "/players",
    label: "Players",
    description: "Player form, workload, and prop-pressure context.",
    icon: NAV_ICONS.players
  },
  {
    href: "/teams",
    label: "Teams",
    description: "Team form, schedule spot, and matchup context.",
    icon: NAV_ICONS.teams
  },
  {
    href: "/performance",
    label: "Performance",
    description: "CLV, units, hit rate — what's actually working.",
    icon: NAV_ICONS.performance
  },
  {
    href: "/providers",
    label: "Providers",
    description: "Data source health, feed freshness, and coverage status.",
    icon: NAV_ICONS.providers
  }
];

export const SECONDARY_NAV_ITEMS: NavItem[] = [
  {
    href: "/sim/nba",
    label: "NBA Sim Desk",
    description: "NBA sides, calibrated player sims, and prop drilldowns.",
    icon: NAV_ICONS.sim,
    badge: "NBA"
  },
  {
    href: "/sim/mlb",
    label: "MLB Edge Desk",
    description: "MLB sides, totals, market edges, pitching and bullpen factors.",
    icon: NAV_ICONS.performance,
    badge: "MLB"
  },
  {
    href: "/sim/players?league=NBA",
    label: "NBA Players",
    description: "Projected NBA player box scores and player-vs-player matchups.",
    icon: NAV_ICONS.players
  },
  {
    href: "/nba-edge",
    label: "NBA Edge",
    description: "Data-driven NBA prop engine with sims, context, and execution.",
    icon: NAV_ICONS.performance,
    badge: "EDGE"
  },
  {
    href: "/mlb-edge",
    label: "MLB Edge",
    description: "MLB edge detector and market alignment layer.",
    icon: NAV_ICONS.performance
  },
  {
    href: "/bets",
    label: "My Bets",
    description: "Track your card, open exposure, and best-bet workflow.",
    icon: NAV_ICONS.bets
  },
  {
    href: "/alerts",
    label: "Alerts",
    description: "Price, movement, and trend notifications.",
    icon: NAV_ICONS.alerts
  },
  {
    href: "/watchlist",
    label: "Watchlist",
    description: "Saved plays, teams, and trends.",
    icon: NAV_ICONS.watchlist
  }
];

export const LEAGUE_NAV_ITEMS: LeagueNavItem[] = [
  { href: "/leagues/nba",   label: "NBA",    leagueKey: "NBA",    description: "NBA league hub." },
  { href: "/leagues/mlb",   label: "MLB",    leagueKey: "MLB",    description: "MLB baseball hub." },
  { href: "/leagues/nhl",   label: "NHL",    leagueKey: "NHL",    description: "NHL hockey hub." },
  { href: "/leagues/nfl",   label: "NFL",    leagueKey: "NFL",    description: "NFL football hub." },
  { href: "/leagues/ncaab", label: "NCAAB",  leagueKey: "NCAAB",  description: "College basketball." },
  { href: "/leagues/ncaaf", label: "NCAAF",  leagueKey: "NCAAF",  description: "College football." },
  { href: "/leagues/ufc",   label: "UFC",    leagueKey: "UFC",    description: "UFC fight hub." },
  { href: "/leagues/boxing",label: "Boxing", leagueKey: "BOXING", description: "Boxing market desk." }
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const LEAGUE_DISPLAY_NAMES: Record<string, string> = {
  NBA: "NBA", NCAAB: "NCAA Basketball", MLB: "MLB",
  NHL: "NHL", NFL: "NFL", NCAAF: "College Football",
  UFC: "UFC", BOXING: "Boxing"
};

function getLeagueKeyFromPath(pathname: string) {
  if (!pathname.startsWith("/leagues/")) return null;
  const segment = pathname.split("/")[2];
  return segment ? segment.toUpperCase() : null;
}

export function getLeagueDisplayName(leagueKey: string | null | undefined) {
  if (!leagueKey) return "League";
  return LEAGUE_DISPLAY_NAMES[leagueKey.toUpperCase()] ?? leagueKey.toUpperCase();
}

export function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/sim") return pathname === "/sim";
  if (href === "/teams" && (pathname.startsWith("/leagues/") || pathname.startsWith("/team/"))) return true;
  if (href === "/games" && pathname.startsWith("/game/")) return true;
  if (href === "/content" && pathname.startsWith("/stories/")) return true;
  if (href.startsWith("/leagues/")) return pathname === href || pathname.startsWith(`${href}/`);
  const cleanHref = href.split("?")[0] ?? href;
  return pathname === cleanHref || pathname.startsWith(`${cleanHref}/`);
}

export function getRouteMeta(pathname: string) {
  const leagueKey = getLeagueKeyFromPath(pathname);

  if (leagueKey) {
    const leagueName = getLeagueDisplayName(leagueKey);
    return {
      eyebrow: `${leagueName} League`,
      title: leagueName,
      subtitle: "League board, recent form, and direct routing into the slate."
    };
  }

  const routes = [
    { match: (v: string) => v === "/", eyebrow: "Command Center", title: "Today", subtitle: "Live edges, movement, and the sharpest opportunities right now." },
    { match: (v: string) => isActivePath(v, "/board"), eyebrow: "Market Board", title: "Board", subtitle: "Verified pricing across all sportsbooks." },
    { match: (v: string) => isActivePath(v, "/games") || v.startsWith("/game/"), eyebrow: "Games", title: "Games", subtitle: "Full slate with matchup detail and game routing." },
    { match: (v: string) => isActivePath(v, "/props"), eyebrow: "Props Lab", title: "Props", subtitle: "Player markets — price, movement, and EV context." },
    { match: (v: string) => v === "/sim", eyebrow: "Simulation Engine", title: "Sim Hub", subtitle: "Choose the correct model desk before drilling into a matchup." },
    { match: (v: string) => isActivePath(v, "/sim/nba"), eyebrow: "NBA Sim Desk", title: "NBA Sim", subtitle: "Side reads, calibrated player sims, and prop drilldowns." },
    { match: (v: string) => isActivePath(v, "/sim/mlb"), eyebrow: "MLB Edge Desk", title: "MLB Sim", subtitle: "Sides, totals, pitcher/bullpen factors, and market edge." },
    { match: (v: string) => isActivePath(v, "/sim/players"), eyebrow: "NBA Player Sims", title: "Player Matchups", subtitle: "Projected box scores and player-vs-player matchup reads." },
    { match: (v: string) => isActivePath(v, "/players"), eyebrow: "Research", title: "Players", subtitle: "Player form, workload, and prop-pressure context." },
    { match: (v: string) => isActivePath(v, "/teams"), eyebrow: "Research", title: "Teams", subtitle: "Schedule spot, recent form, and board pressure." },
    { match: (v: string) => isActivePath(v, "/sharktrends"), eyebrow: "SharkTrends", title: "SharkTrends", subtitle: "Promotion board for verified systems, live qualifiers, saved-row freshness, and blockers." },
    { match: (v: string) => isActivePath(v, "/trends"), eyebrow: "Trends Engine", title: "Trends", subtitle: "Historical systems, active matches, and validation signals." },
    { match: (v: string) => isActivePath(v, "/watchlist"), eyebrow: "My List", title: "Watchlist", subtitle: "Saved edges and tracked plays." },
    { match: (v: string) => isActivePath(v, "/bets"), eyebrow: "Bet Tracker", title: "My Bets", subtitle: "Your card, prices, and outcomes in one ledger." },
    { match: (v: string) => isActivePath(v, "/performance"), eyebrow: "Analytics", title: "Performance", subtitle: "CLV, units, and what's actually working." },
    { match: (v: string) => isActivePath(v, "/alerts"), eyebrow: "Notifications", title: "Alerts", subtitle: "Movement and threshold alerts." },
    { match: (v: string) => isActivePath(v, "/providers"), eyebrow: "Data Health", title: "Providers", subtitle: "Feed freshness and data source status." },
    { match: (v: string) => isActivePath(v, "/content") || v.startsWith("/stories/"), eyebrow: "Content", title: "Coverage", subtitle: "Betting-native news and analysis." },
    { match: (v: string) => isActivePath(v, "/nba-edge"), eyebrow: "NBA Edge", title: "NBA Edge", subtitle: "Data-driven NBA prop engine with full modeling pipeline." },
    { match: (v: string) => isActivePath(v, "/mlb-edge"), eyebrow: "MLB Edge", title: "MLB Edge", subtitle: "Baseball market edge detector and model alignment." }
  ];

  return (
    routes.find((r) => r.match(pathname)) ?? {
      eyebrow: "SharkEdge",
      title: "Sports Intelligence",
      subtitle: "Research the board, the matchup, and the market."
    }
  );
}
