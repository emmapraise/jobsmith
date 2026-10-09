import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect only: checks that a session cookie exists. Real authorization happens in
 * requireUser()/requireUserApi() next to the data. (Database sessions can't be verified at the proxy.)
 */
const COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function proxy(req: NextRequest) {
  if (COOKIES.some((c) => req.cookies.has(c))) return NextResponse.next();
  const url = new URL("/sign-in", req.url);
  url.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/resume/:path*", "/profile/:path*", "/roles/:path*", "/tailor/:path*", "/settings/:path*", "/onboarding/:path*"],
};
