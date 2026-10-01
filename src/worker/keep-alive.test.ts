import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({
  createClient: vi.fn(),
  error: null as { message: string } | null,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    supabase.createClient(...args);
    return {
      from: () => ({
        select: () => ({
          limit: async () => ({ error: supabase.error }),
        }),
      }),
    };
  },
}));

import { keepDatabaseAwake } from "@/worker/keep-alive";

const unusedAppFetch = async () => {
  throw new Error("Die Anwendung darf nicht aufgerufen werden.");
};

describe("keepDatabaseAwake", () => {
  beforeEach(() => {
    supabase.createClient.mockClear();
    supabase.error = null;
  });

  it("fragt Supabase direkt ab, wenn URL und Secret-Key zur Laufzeit vorhanden sind", async () => {
    await expect(keepDatabaseAwake({
      NEXT_PUBLIC_SUPABASE_URL: " https://example.supabase.co\n",
      SUPABASE_SECRET_KEY: "sb_secret_test\n",
    }, unusedAppFetch)).resolves.toBe("direct");
    expect(supabase.createClient).toHaveBeenCalledWith("https://example.supabase.co", "sb_secret_test", expect.any(Object));
  });

  it("akzeptiert den älteren Service-Role-Key", async () => {
    await expect(keepDatabaseAwake({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role",
    }, unusedAppFetch)).resolves.toBe("direct");
  });

  it("schlägt fehl, wenn die Datenbank nicht antwortet", async () => {
    supabase.error = { message: "project paused" };
    await expect(keepDatabaseAwake({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_test",
    }, unusedAppFetch)).rejects.toThrow("project paused");
  });

  it("nutzt ohne Laufzeit-URL den geschützten Health-Endpunkt der Anwendung", async () => {
    const appFetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe("GET");
      expect(request.url).toBe("https://xn--wnschi-3ya.de/api/internal/health");
      expect(request.headers.get("authorization")).toBe("Bearer cron-secret");
      return Response.json({ ok: true });
    });
    await expect(keepDatabaseAwake({
      SUPABASE_SECRET_KEY: "sb_secret_test",
      INTERNAL_CRON_SECRET: "cron-secret",
    }, appFetch)).resolves.toBe("health");
    expect(appFetch).toHaveBeenCalledOnce();
    expect(supabase.createClient).not.toHaveBeenCalled();
  });

  it("verwendet APP_ORIGIN für den Health-Aufruf, falls gesetzt", async () => {
    const appFetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).origin).toBe("https://wuenschi.example.workers.dev");
      return Response.json({ ok: true });
    });
    await keepDatabaseAwake({ INTERNAL_CRON_SECRET: "cron-secret", APP_ORIGIN: "https://wuenschi.example.workers.dev" }, appFetch);
    expect(appFetch).toHaveBeenCalledOnce();
  });

  it("schlägt fehl, wenn der Health-Endpunkt die Datenbank nicht erreicht", async () => {
    await expect(keepDatabaseAwake(
      { INTERNAL_CRON_SECRET: "cron-secret" },
      async () => Response.json({ ok: false }, { status: 503 }),
    )).rejects.toThrow("HTTP 503");
  });

  it("meldet eine fehlende Konfiguration ausdrücklich", async () => {
    await expect(keepDatabaseAwake({}, unusedAppFetch)).rejects.toThrow("nicht konfiguriert");
  });
});
