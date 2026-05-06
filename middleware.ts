import { NextResponse, type NextRequest } from "next/server";

const REDIRECTS: [string, string][] = [
  ["/trends", "/sharktrends"],
  ["/board", "/"],
  ["/props", "/sim"],
  ["/leagues", "/sim"],
  ["/nba-sim-desk", "/sim/nba"],
  ["/mlb-edge-desk", "/sim/mlb"],
  ["/nba-edge", "/sim/nba"],
  ["/mlb-edge", "/sim/mlb"],
  ["/bets", "/saved?tab=bets"],
  ["/my-bets", "/saved?tab=bets"],
  ["/alerts", "/saved?tab=alerts"],
  ["/watchlist", "/saved"],
  ["/player-performance", "/sim"],
  ["/team-performance", "/sim"],
  ["/players", "/sim"],
  ["/teams", "/sim"],
  ["/performance", "/accuracy"],
  ["/sim/accuracy", "/accuracy"],
  ["/simhub", "/sim"],
  ["/simhub/nba", "/sim/nba"],
  ["/simhub/mlb", "/sim/mlb"],
  ["/simhub/ufc", "/sharkfights/ufc"],
  ["/simhub/versions", "/sim"],
  ["/simhub/logs", "/sim"]
];

function applyRedirect(request: NextRequest, from: string, to: string) {
  const { pathname, search } = request.nextUrl;
  const exact = pathname === from;
  const prefix = from !== "/" && pathname.startsWith(`${from}/`);
  if (!exact && !prefix) return null;

  const url = request.nextUrl.clone();
  const [toPath, toQuery] = to.split("?");
  url.pathname = exact ? toPath! : `${toPath}${pathname.slice(from.length)}`;

  const params = new URLSearchParams(toQuery ?? "");
  const requestParams = new URLSearchParams(search);
  for (const [key, value] of requestParams.entries()) {
    if (!params.has(key)) params.set(key, value);
  }
  url.search = params.toString() ? `?${params.toString()}` : "";
  return NextResponse.redirect(url, 308);
}

export function middleware(request: NextRequest) {
  for (const [from, to] of REDIRECTS) {
    const response = applyRedirect(request, from, to);
    if (response) return response;
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/trends", "/trends/:path*",
    "/board", "/board/:path*",
    "/props", "/props/:path*",
    "/leagues", "/leagues/:path*",
    "/nba-sim-desk", "/nba-sim-desk/:path*",
    "/mlb-edge-desk", "/mlb-edge-desk/:path*",
    "/nba-edge", "/nba-edge/:path*",
    "/mlb-edge", "/mlb-edge/:path*",
    "/bets", "/bets/:path*",
    "/my-bets", "/my-bets/:path*",
    "/alerts", "/alerts/:path*",
    "/watchlist", "/watchlist/:path*",
    "/player-performance", "/player-performance/:path*",
    "/team-performance", "/team-performance/:path*",
    "/players", "/players/:path*",
    "/teams", "/teams/:path*",
    "/performance", "/performance/:path*",
    "/sim/accuracy", "/sim/accuracy/:path*",
    "/simhub", "/simhub/:path*"
  ]
};
