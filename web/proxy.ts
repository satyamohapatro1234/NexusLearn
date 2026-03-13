import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PREFIXES = ["/auth", "/setup", "/_next", "/api", "/favicon", "/logo"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow public routes
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("nexus_token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/auth", req.url));
  }

  const setupDone = req.cookies.get("nexus_setup_done")?.value;
  if (!setupDone) {
    return NextResponse.redirect(new URL("/setup", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
