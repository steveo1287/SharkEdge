import { NextResponse, type NextRequest } from "next/server";

const REDIRECTS: [string, string][] = [
  // Legacy trends alias
  ["/trends",              "/sharktrends"],

  // Removed top-level pages → merged destinations
  ["/board",               "/"],
  ["/props",               "/sim"],
  ["/leagues",             "/sim"],
  ["/nba-sim-desk",        "/sim/nba"],
  ["/mlb-edge-desk",       "/sim/mlb"],
  ["/nba-edge",            "/sim/nba"],
  ["/mlb-edge",            "/sim/mlb"],
  ["/bets",                "/saved?tab=bets"],
  ["/my-bets",             "/saved?tab=bets"],
  ["/alerts",              "/saved?tab=alerts"],
  ["/watchlist",           "/saved"],
  ["/player-performance",  "/sim"],
  ["/team-performance",    "/sim"],
  ["/players",             "/sim"],
  ["/teams",               "/sim"],
  ["/performance",         "/accuracy"],

  // sim/accuracy → canonical /accuracy
  ["/sim/accuracy",        "/accuracy"],

  // /simhub/* → /sim/* (future-proof if links use /simhub)
  ["/simhub",              "/sim"],
  ["/simhub/nba",          "/sim/nba"],
  ["/simhub/mlb",          "/sim/mlb"],
  ["/simhub/ufc",          "/sharkfights/ufc"],
  ["/simhub/versions",     "/sim"],
  ["/simhub/logs",         "/sim"],
];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  for (const [from, to] of REDIRECTS) {
    // Exact match
    if (pathname === from) {
      const url = request.nextUrl.clone();
      url.pathname = to.split("?")[0]!;
      // Preserve redirect's own query params (e.g. ?tab=bets), then layer request's params
      const toParams = new URLSearchParams(to.includes("?") ? to.split("?")[1] : "");
      const reqParams = new URLSearchParams(search);
      for (const [k, v] of reqParams.entries()) {
        if (!toParams.has(k)) toParams.set(k, v);
      }
      url.search = toParams.toString() ? `?${toParams.toString()}` : "";
      return NextResponse.redirect(url, 308);
    }

    // Prefix match (catches /board/detail, /trends/mlb, etc.)
    if (from !== "/" && pathname.startsWith(`${from}/`)) {
      const url = request.nextUrl.clone();
      const toBase = to.split("?")[0]!;
      url.pathname = toBase + pathname.slice(from.length);
      url.search = search;
      return NextResponse.redirect(url, 308);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/trends",         "/trends/:path*",
    "/board",          "/board/:path*",
    "/props",          "/props/:path*",
    "/leagues",        "/leagues/:path*",
    "/nba-sim-desk",   "/nba-sim-desk/:path*",
    "/mlb-edge-desk",  "/mlb-edge-desk/:path*",
    "/nba-edge",       "/nba-edge/:path*",
    "/mlb-edge",       "/mlb-edge/:path*",
    "/bets",           "/bets/:path*",
    "/my-bets",        "/my-bets/:path*",
    "/alerts",         "/alerts/:path*",
    "/watchlist",      "/watchlist/:path*",
    "/player-performance", "/player-performance/:path*",
    "/team-performance",   "/team-performance/:path*",
    "/players",        "/players/:path*",
    "/teams",          "/teams/:path*",
    "/performance",    "/performance/:path*",
    "/sim/accuracy",   "/sim/accuracy/:path*",
    "/simhub",         "/simhub/:path*"
  ]
};
