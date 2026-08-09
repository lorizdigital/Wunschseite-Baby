import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { usesSecureCookies } from "@/lib/app-config";

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

/** Creates a route-handler client and attaches every auth cookie to its response. */
export function createSupabaseRouteClient(request: NextRequest) {
  const config = getSupabaseUserConfig();
  if (!config) return null;

  const cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[] = [];
  let responseHeaders: Record<string, string> = {};
  const supabase = createServerClient(config.url, config.key, {
    cookieOptions: { httpOnly: true, secure: usesSecureCookies(), sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (nextCookies, headers) => {
        cookiesToSet.splice(0, cookiesToSet.length, ...nextCookies);
        responseHeaders = headers;
      },
    },
  });

  return {
    supabase,
    applySession(response: NextResponse) {
      cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, sessionCookieOptions(options)));
      Object.entries(responseHeaders).forEach(([name, value]) => response.headers.set(name, value));
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    },
  };
}
