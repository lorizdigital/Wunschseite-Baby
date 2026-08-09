import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browserSession = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  storedHash: null as string | null,
  storedVersion: null as string | null,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get(name: string) {
      const value = browserSession.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

vi.mock("@/lib/supabase-admin", () => ({
  MATS_WISHLIST_ID: "mats-test-wishlist",
  getSupabaseAdmin: () => ({
    from: () => ({
      update: (values: { access_code_hash: string; access_code_version: string }) => ({
        eq: () => ({
          select: () => ({
            maybeSingle: async () => {
              browserSession.storedHash = values.access_code_hash;
              browserSession.storedVersion = values.access_code_version;
              return { data: { id: "mats-test-wishlist" }, error: null };
            },
          }),
        }),
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              access_code_hash: browserSession.storedHash,
              access_code_version: browserSession.storedVersion,
            },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

import { POST } from "@/app/api/admin/mats-access-code/route";
import { getAccessCookieName, hasMatsAccess } from "@/lib/public-wishlist-access";

const originalEnvironment = {
  ADMIN_IMPORT_SECRET: process.env.ADMIN_IMPORT_SECRET,
  APP_ORIGIN: process.env.APP_ORIGIN,
  LEGACY_MATS_ADMIN_ENABLED: process.env.LEGACY_MATS_ADMIN_ENABLED,
  PUBLIC_WISHLIST_ACCESS_SESSION_SECRET: process.env.PUBLIC_WISHLIST_ACCESS_SESSION_SECRET,
};

function restoreEnvironment(name: keyof typeof originalEnvironment) {
  const value = originalEnvironment[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function applyResponseCookieToBrowser(response: Response) {
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).not.toBeNull();

  const cookiePair = setCookie!.split(";", 1)[0];
  const separator = cookiePair.indexOf("=");
  expect(separator).toBeGreaterThan(0);
  browserSession.cookies.set(cookiePair.slice(0, separator), cookiePair.slice(separator + 1));

  return setCookie!;
}

beforeEach(() => {
  process.env.ADMIN_IMPORT_SECRET = "admin-test-secret";
  process.env.APP_ORIGIN = "https://xn--wnschi-3ya.de";
  process.env.LEGACY_MATS_ADMIN_ENABLED = "true";
  process.env.PUBLIC_WISHLIST_ACCESS_SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
  browserSession.cookies.clear();
  browserSession.storedHash = null;
  browserSession.storedVersion = null;
});

afterEach(() => {
  restoreEnvironment("ADMIN_IMPORT_SECRET");
  restoreEnvironment("APP_ORIGIN");
  restoreEnvironment("LEGACY_MATS_ADMIN_ENABLED");
  restoreEnvironment("PUBLIC_WISHLIST_ACCESS_SESSION_SECRET");
});

describe("POST /api/admin/mats-access-code", () => {
  it("propagates the verified grant to the same browser session so the next /mats request is unlocked", async () => {
    const response = await POST(new Request("https://xn--wnschi-3ya.de/api/admin/mats-access-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": "admin-test-secret",
      },
      body: JSON.stringify({ accessCode: "Mats-Testcode-2026" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accessCodeSet: true, accessCodeVerified: true });
    expect(await hasMatsAccess()).toBe(false);

    const setCookie = applyResponseCookieToBrowser(response);
    expect(setCookie).toContain(`${getAccessCookieName("mats")}=`);
    expect(setCookie).toMatch(/Path=\//i);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(await hasMatsAccess()).toBe(true);
  });
});
