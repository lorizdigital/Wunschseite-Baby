import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  brevoConfigured: true,
  generateLink: vi.fn(),
  sendMagicLinkEmail: vi.fn(),
  signInWithOtp: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ Origin: "https://listen.example", "x-forwarded-for": "203.0.113.10" }),
}));

vi.mock("@/lib/app-config", () => ({ getAppOrigin: () => "https://listen.example" }));
vi.mock("@/lib/brevo", () => ({
  isBrevoInlineEmailConfigured: () => state.brevoConfigured,
  sendMagicLinkEmail: state.sendMagicLinkEmail,
}));
vi.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: async () => true,
  getRequestClientKey: () => "203.0.113.10",
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ auth: { admin: { generateLink: state.generateLink } } }),
}));
vi.mock("@/lib/supabase-user", () => ({
  createSupabaseUserClient: async () => ({ auth: { signInWithOtp: state.signInWithOtp } }),
  getAuthCallbackUrl: () => "https://listen.example/auth/callback",
  getMagicLinkConfirmUrl: (token: string) => `https://listen.example/auth/callback?token_hash=${token}&type=magiclink`,
  getSafeAuthNext: () => "/app",
}));

import { requestMagicLink } from "@/app/login/actions";

function loginForm() {
  const formData = new FormData();
  formData.set("email", "familie@example.com");
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.brevoConfigured = true;
  state.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "brevo-token" } }, error: null });
  state.sendMagicLinkEmail.mockResolvedValue("sent");
  state.signInWithOtp.mockResolvedValue({ error: null });
});

describe("requestMagicLink", () => {
  it("uses Brevo as the primary delivery path without listing all auth users", async () => {
    await expect(requestMagicLink({}, loginForm())).resolves.toEqual({
      message: "Falls die E-Mail-Adresse erreichbar ist, erhältst du gleich einen sicheren Anmeldelink.",
    });

    expect(state.generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "familie@example.com",
      options: { redirectTo: "https://listen.example/auth/callback" },
    });
    expect(state.sendMagicLinkEmail).toHaveBeenCalledOnce();
    expect(state.signInWithOtp).not.toHaveBeenCalled();
  });

  it("falls back to Supabase for the account already created by the admin link call when Brevo delivery fails", async () => {
    state.sendMagicLinkEmail.mockResolvedValue("failed");

    await expect(requestMagicLink({}, loginForm())).resolves.toEqual({
      message: "Falls die E-Mail-Adresse erreichbar ist, erhältst du gleich einen sicheren Anmeldelink.",
    });

    expect(state.signInWithOtp).toHaveBeenCalledWith({
      email: "familie@example.com",
      options: {
        emailRedirectTo: "https://listen.example/auth/callback",
        shouldCreateUser: false,
      },
    });
    expect(state.generateLink.mock.invocationCallOrder[0]).toBeLessThan(state.signInWithOtp.mock.invocationCallOrder[0]);
  });

  it("creates a new account through the admin link path before falling back when Brevo is not configured", async () => {
    state.brevoConfigured = false;

    await expect(requestMagicLink({}, loginForm())).resolves.toEqual({
      message: "Falls die E-Mail-Adresse erreichbar ist, erhältst du gleich einen sicheren Anmeldelink.",
    });

    expect(state.generateLink).toHaveBeenCalledOnce();
    expect(state.sendMagicLinkEmail).not.toHaveBeenCalled();
    expect(state.signInWithOtp).toHaveBeenCalledWith({
      email: "familie@example.com",
      options: {
        emailRedirectTo: "https://listen.example/auth/callback",
        shouldCreateUser: false,
      },
    });
    expect(state.generateLink.mock.invocationCallOrder[0]).toBeLessThan(state.signInWithOtp.mock.invocationCallOrder[0]);
  });

  it("falls back when Supabase cannot generate the Brevo magic link", async () => {
    state.generateLink.mockResolvedValue({ data: null, error: { message: "not found" } });

    await requestMagicLink({}, loginForm());

    expect(state.sendMagicLinkEmail).not.toHaveBeenCalled();
    expect(state.signInWithOtp).toHaveBeenCalledOnce();
  });

  it("reports an error only after the controlled Supabase fallback also fails", async () => {
    state.sendMagicLinkEmail.mockResolvedValue("failed");
    state.signInWithOtp.mockResolvedValue({ error: { message: "provider unavailable" } });

    await expect(requestMagicLink({}, loginForm())).resolves.toEqual({
      error: "Der Anmeldelink konnte gerade nicht gesendet werden. Bitte versuche es gleich noch einmal.",
    });
  });
});
