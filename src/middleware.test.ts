import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: state.createServerClient,
}));

import { config, middleware } from "@/middleware";

type CookieOptions = Record<string, unknown>;
type CookiesToSet = Array<{ name: string; value: string; options: CookieOptions }>;
type SupabaseClientOptions = {
  cookies: {
    setAll: (cookies: CookiesToSet, headers: Record<string, string>) => void;
  };
};

const originalEnv = {
  APP_ORIGIN: process.env.APP_ORIGIN,
  MULTI_WISHLIST_ENABLED: process.env.MULTI_WISHLIST_ENABLED,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

function restoreEnv(name: keyof typeof originalEnv) {
  const value = originalEnv[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function nextRequest(
  url: string,
  init: { method?: string; headers?: HeadersInit } = {},
) {
  return new NextRequest(url, init);
}

beforeEach(() => {
  state.createServerClient.mockReset();
  process.env.APP_ORIGIN = "https://listen.example";
  process.env.MULTI_WISHLIST_ENABLED = "true";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

afterAll(() => {
  (Object.keys(originalEnv) as Array<keyof typeof originalEnv>).forEach(restoreEnv);
});

describe("middleware matcher", () => {
  it.each(["/", "/app", "/api/app/wishlists", "/_next/static/chunk.js", "/robots.txt"])(
    "covers %s so canonical-host and HTTPS checks run consistently",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
    },
  );
});

describe("middleware redirects", () => {
  it.each(["GET", "HEAD"])("canonicalizes %s requests while preserving path and query", async (method) => {
    const response = await middleware(nextRequest("https://www.listen.example/app?from=www", { method }));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://listen.example/app?from=www");
  });

  it("does not redirect a state-changing request from the www alias", async () => {
    const response = await middleware(nextRequest("https://www.listen.example/auth/logout", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects HTTP to HTTPS when the configured application origin is secure", async () => {
    const response = await middleware(nextRequest("https://listen.example/mats?view=all", {
      headers: { "x-forwarded-proto": "http" },
    }));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://listen.example/mats?view=all");
  });

  it("keeps explicit local HTTP origins usable", async () => {
    process.env.APP_ORIGIN = "http://localhost:3000";

    const response = await middleware(nextRequest("http://localhost:3000/mats"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("middleware application gating", () => {
  it.each(["/login", "/neu", "/app", "/app/lists/list-1", "/einladung/token", "/api/app/wishlists"])(
    "returns 404 for %s while the multi-wishlist feature is disabled",
    async (pathname) => {
      process.env.MULTI_WISHLIST_ENABLED = "false";

      const response = await middleware(nextRequest(`https://listen.example${pathname}`));

      expect(response.status).toBe(404);
    },
  );

  it.each(["/", "/mats", "/api/public/wishlists/public-list/status"])(
    "does not apply the multi-wishlist feature gate to %s",
    async (pathname) => {
      process.env.MULTI_WISHLIST_ENABLED = "false";

      const response = await middleware(nextRequest(`https://listen.example${pathname}`));

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );
});

describe("middleware session refresh", () => {
  it("applies refreshed cookies and response headers without contacting a real backend", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

    state.createServerClient.mockImplementation((_url, _key, options: SupabaseClientOptions) => ({
      auth: {
        getClaims: async () => {
          options.cookies.setAll([
            {
              name: "sb-session",
              value: "refreshed-session",
              options: {
                domain: ".listen.example",
                httpOnly: false,
                path: "/wrong",
                sameSite: "none",
                secure: false,
              },
            },
          ], { "x-supabase-auth": "refreshed" });
        },
      },
    }));

    const request = nextRequest("https://listen.example/login", {
      headers: { cookie: "sb-session=old-session" },
    });
    const response = await middleware(request);
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(state.createServerClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "publishable-key",
      expect.any(Object),
    );
    expect(request.cookies.get("sb-session")?.value).toBe("refreshed-session");
    expect(response.headers.get("x-supabase-auth")).toBe("refreshed");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(setCookie).toContain("sb-session=refreshed-session");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).not.toContain("Domain=");
  });

  it("does not initialize Supabase on routes that do not need a session refresh", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

    await middleware(nextRequest("https://listen.example/mats"));

    expect(state.createServerClient).not.toHaveBeenCalled();
  });
});
