import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ rateLimit: null as boolean | null }));

// Simuliert ein pausiertes Supabase-Projekt: Jede Abfrage liefert einen Fehler,
// außer der Rate-Limit-Antwort, die der jeweilige Test vorgibt.
vi.mock("@/lib/supabase-admin", () => ({
  MATS_WISHLIST_ID: "mats-test-wishlist",
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { message: "project paused" } }),
        }),
      }),
    }),
    rpc: async () => database.rateLimit === null
      ? { data: null, error: { message: "project paused" } }
      : { data: database.rateLimit, error: null },
  }),
}));

import { POST } from "@/app/api/mats/access/route";
import { createAccessFormToken } from "@/lib/access-form-token";

const environmentNames = ["PUBLIC_WISHLIST_ACCESS_SESSION_SECRET", "MATS_ACCESS_CODE", "MATS_ACCESS_CODE_VERSION"] as const;
const originalEnvironment = Object.fromEntries(environmentNames.map((name) => [name, process.env[name]]));

function accessRequest() {
  const body = new FormData();
  body.set("requestToken", createAccessFormToken("mats") ?? "");
  body.set("accessCode", "richtiger-code");
  return new Request("https://xn--wnschi-3ya.de/api/mats/access", { method: "POST", body });
}

describe("POST /api/mats/access", () => {
  beforeEach(() => {
    process.env.PUBLIC_WISHLIST_ACCESS_SESSION_SECRET = "s".repeat(32);
    process.env.MATS_ACCESS_CODE = "richtiger-code";
    process.env.MATS_ACCESS_CODE_VERSION = "version-0000000001";
  });

  afterEach(() => {
    for (const name of environmentNames) {
      const value = originalEnvironment[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("meldet eine nicht erreichbare Datenbank als vorübergehend nicht verfügbar statt als Wartezeit", async () => {
    database.rateLimit = null;
    const response = await POST(accessRequest());
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").search).toBe("?access=unavailable");
  });

  it("meldet ein tatsächlich erreichtes Limit weiterhin als Wartezeit", async () => {
    database.rateLimit = false;
    const response = await POST(accessRequest());
    expect(new URL(response.headers.get("location") ?? "").search).toBe("?access=rate");
  });
});
