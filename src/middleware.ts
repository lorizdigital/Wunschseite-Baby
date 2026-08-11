import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAppOrigin, isFeatureEnabled, usesSecureCookies } from "@/lib/app-config";

function getSupabaseUserConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

function sessionCookieOptions(options: Record<string, unknown>) {
  const normalized = { ...options };
  delete normalized.domain;
  return { ...normalized, httpOnly: true, secure: usesSecureCookies(), sameSite: "lax" as const, path: "/" };
}

function isHttpRequest(request: NextRequest) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProtocol) return forwardedProtocol === "http";

  try {
    const visitor = JSON.parse(request.headers.get("cf-visitor") ?? "{}") as { scheme?: string };
    if (visitor.scheme) return visitor.scheme.toLowerCase() === "http";
  } catch {
    // A malformed optional proxy header must never prevent a request.
  }

  return request.nextUrl.protocol === "http:";
}

function needsSessionRefresh(pathname: string) {
  return pathname === "/login"
    || pathname === "/neu"
    || pathname.startsWith("/app/")
    || pathname === "/app"
    || pathname.startsWith("/einladung/")
    || pathname.startsWith("/api/app/");
}

function getCanonicalHostRedirect(request: NextRequest) {
  const canonicalOrigin = new URL(getAppOrigin());
  if (request.nextUrl.hostname !== `www.${canonicalOrigin.hostname}`) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const canonicalUrl = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, canonicalOrigin);
  return NextResponse.redirect(canonicalUrl, 308);
}

/** Refreshes a session only. Every page and mutation still checks getUser/RPC. */
export async function middleware(request: NextRequest) {
  const canonicalRedirect = getCanonicalHostRedirect(request);
  if (canonicalRedirect) return canonicalRedirect;

  // Production and every HTTPS-configured environment still redirect before
  // any session work. Explicit local HTTP origins remain usable for design
  // previews (`next dev` and `wrangler dev`).
  if (isHttpRequest(request) && new URL(getAppOrigin()).protocol === "https:") {
    const secureUrl = request.nextUrl.clone();
    secureUrl.protocol = "https:";
    return NextResponse.redirect(secureUrl, 308);
  }

  if (!needsSessionRefresh(request.nextUrl.pathname)) return NextResponse.next({ request });
  if (!isFeatureEnabled("MULTI_WISHLIST_ENABLED")) return new NextResponse(null, { status: 404 });
  const config = getSupabaseUserConfig();
  if (!config) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.key, {
    cookieOptions: { httpOnly: true, secure: usesSecureCookies(), sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, sessionCookieOptions(options)));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}

export const config = { matcher: ["/:path*"] };
