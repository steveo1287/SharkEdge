export type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  description: string;
  icon: string; // SVG path data
  badge?: string;
};

// ─── SVG ICON PATHS ──────────────────────────────────────────────────────────
export const NAV_ICONS = {
  home:        `<path d="M2.5 9.5 8 4l5.5 5.5M4 8.5V14h3.5v-3.5h1V14H12V8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  sim:         `<path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/><path d="M9 11h4M11 9v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
  trends:      `<path d="M2 12l3.5-4 3 2.5L12 5l2 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M11 5h3v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  fights:      `<path d="M4 12L8 4l4 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M5.5 9.5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
  accuracy:    `<path d="M2 13h2.5V9H2v4zM6.75 13H9V6H6.75v7zM11.5 13H14V2h-2.5v11z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/>`,
  saved:       `<path d="M4 2h8a1 1 0 011 1v11l-5-2.5L3 14V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/>`,
  settings:    `<circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.75 3.75l1.06 1.06M11.18 11.18l1.07 1.07M3.75 12.25l1.06-1.06M11.18 4.82l1.07-1.07" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
};

// ─── PRIMARY NAV (6 destinations) ────────────────────────────────────────────
export const MAIN_NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Home",
    shortLabel: "Home",
    description: "Daily command center — top plays, edges, and model calls across MLB, NBA, and UFC.",
    icon: NAV_ICONS.home
  },
  {
    href: "/sim",
    label: "SimHub",
    shortLabel: "Sims",
    description: "Simulation engine for MLB, NBA, and UFC — picks, edges, model explanations, and run logs.",
    icon: NAV_ICONS.sim,
    badge: "SIM"
  },
  {
    href: "/sharktrends",
    label: "SharkTrends",
    shortLabel: "Trends",
    description: "Verified trend systems — actionable, model-confirmed, and market-disagreement trend intelligence.",
    icon: NAV_ICONS.trends,
    badge: "LIVE"
  },
  {
    href: "/sharkfights/ufc",
    label: "SharkFights",
    shortLabel: "Fights",
    description: "UFC fight predictions — who wins, how they win, style clashes, and finish probabilities.",
    icon: NAV_ICONS.fights,
    badge: "UFC"
  },
  {
    href: "/accuracy",
    label: "Accuracy",
    shortLabel: "Accuracy",
    description: "Model credibility — win rate, Brier score, calibration, and version history.",
    icon: NAV_ICONS.accuracy,
    badge: "GRADE"
  },
  {
    href: "/saved",
    label: "Saved",
    shortLabel: "Saved",
    description: "Saved plays, tracked picks, watchlist, and alert preferences.",
    icon: NAV_ICONS.saved
  }
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
export function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/sim") return pathname === "/sim" || (pathname.startsWith("/sim/") && !pathname.startsWith("/sim/accuracy"));
  const cleanHref = href.split("?")[0] ?? href;
  return pathname === cleanHref || pathname.startsWith(`${cleanHref}/`);
}

export function getRouteMeta(pathname: string) {
  const routes = [
    {
      match: (v: string) => v === "/",
      eyebrow: "Command Center", title: "Today",
      subtitle: "Top plays, biggest edges, and model calls across MLB, NBA, and UFC."
    },
    {
      match: (v: string) => v === "/sim" || (v.startsWith("/sim/") && !v.startsWith("/sim/accuracy")),
      eyebrow: "Simulation Engine", title: "SimHub",
      subtitle: "MLB, NBA, and UFC simulation output — picks, edges, model explanations, and run logs."
    },
    {
      match: (v: string) => v.startsWith("/sim/nba"),
      eyebrow: "NBA · SimHub", title: "NBA Sims",
      subtitle: "NBA side reads, calibrated player sims, and prop drilldowns."
    },
    {
      match: (v: string) => v.startsWith("/sim/mlb"),
      eyebrow: "MLB · SimHub", title: "MLB Sims",
      subtitle: "MLB sides, totals, pitcher and bullpen factors, and market edge."
    },
    {
      match: (v: string) => v.startsWith("/sharktrends"),
      eyebrow: "SharkTrends", title: "SharkTrends",
      subtitle: "Verified systems, live qualifiers, matchup signals, proof gates, and blockers."
    },
    {
      match: (v: string) => v.startsWith("/sharkfights"),
      eyebrow: "SharkFights · UFC", title: "SharkFights",
      subtitle: "UFC Fight IQ — picks, path to victory, finish probability, and danger flags."
    },
    {
      match: (v: string) => v.startsWith("/accuracy") || v.startsWith("/sim/accuracy"),
      eyebrow: "Model Credibility", title: "Accuracy",
      subtitle: "Win rate, Brier score, calibration, and model version history."
    },
    {
      match: (v: string) => v.startsWith("/saved"),
      eyebrow: "My List", title: "Saved",
      subtitle: "Saved plays, tracked picks, watchlist, and alert preferences."
    }
  ];

  return (
    routes.find((r) => r.match(pathname)) ?? {
      eyebrow: "SharkEdge",
      title: "Sports Intelligence",
      subtitle: "Research the board, the matchup, and the market."
    }
  );
}
