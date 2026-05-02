import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/trends" || pathname.startsWith("/trends/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/trends/, "/sharktrends");
    url.search = search;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/trends", "/trends/:path*"]
};
