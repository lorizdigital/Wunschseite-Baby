import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAppOrigin, usesSecureCookies } from "@/lib/app-config";

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

/**
 * A fresh, server-only client per request. Sessions are host-only HttpOnly
 * cookies; no browser Supabase client is used in the parents' area.
 */
export async function createSupabaseUserClient() {
  const config = getSupabaseUserConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: { httpOnly: true, secure: usesSecureCookies(), sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, sessionCookieOptions(options));
          });
        } catch {
          // Server Components cannot set cookies. src/proxy.ts refreshes those
          // sessions before a protected page renders.
        }
      },
    },
  });
}

export async function getAuthenticatedSupabaseUser() {
  const supabase = await createSupabaseUserClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}

export function getSafeAuthNext(value: string | null | undefined) {
  if (value === "/app") return "/app";
  if (typeof value === "string" && /^\/einladung\/[A-Za-z0-9_-]{32,512}$/.test(value)) return value;
  return "/app";
}

export function getAuthCallbackUrl(nextPath?: string | null) {
  const next = getSafeAuthNext(nextPath);
  return `${getAppOrigin()}/auth/callback?next=${encodeURIComponent(next)}`;
}
