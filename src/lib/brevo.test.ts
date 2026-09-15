import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isBrevoInlineEmailConfigured, sendInvitationEmail, sendMagicLinkEmail } from "@/lib/brevo";

const environmentNames = [
  "BREVO_API_KEY",
  "BREVO_SENDER_EMAIL",
  "BREVO_SENDER_NAME",
  "BREVO_REPLY_TO_EMAIL",
  "BREVO_INVITATION_TEMPLATE_ID",
] as const;

const initialEnvironment = Object.fromEntries(environmentNames.map((name) => [name, process.env[name]]));

beforeEach(() => {
  environmentNames.forEach((name) => delete process.env[name]);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  environmentNames.forEach((name) => {
    const value = initialEnvironment[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
});

const invitation = {
  recipientEmail: "familie@example.com",
  wishlistTitle: "Unsere <erste> Wunschliste",
  role: "editor" as const,
  acceptUrl: "https://wünschi.de/einladung/test-token",
};

const magicLink = {
  recipientEmail: "familie@example.com",
  loginUrl: "https://project.supabase.co/auth/v1/verify?token=login-token&type=magiclink",
};

describe("Brevo invitation email delivery", () => {
  it("does not call Brevo before the integration is configured", async () => {
    await expect(sendInvitationEmail(invitation)).resolves.toBe("not_configured");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends escaped inline HTML through Brevo", async () => {
    process.env.BREVO_API_KEY = "xkeysib-test";
    process.env.BREVO_SENDER_EMAIL = "hallo@wünschi.de";
    process.env.BREVO_SENDER_NAME = "Wünschi für Familien";
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ messageId: "test-message" }), { status: 201 }));

    await expect(sendInvitationEmail(invitation)).resolves.toBe("sent");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, request] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(request.method).toBe("POST");
    expect((request.headers as Record<string, string>)["api-key"]).toBe("xkeysib-test");
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body.sender).toEqual({ email: "hallo@wünschi.de", name: "Wünschi für Familien" });
    expect(body.to).toEqual([{ email: "familie@example.com" }]);
    expect(body.subject).toBe("Einladung zu „Unsere <erste> Wunschliste“");
    expect(body.htmlContent).toContain("Unsere &lt;erste&gt; Wunschliste");
    expect(body.htmlContent).not.toContain("Unsere <erste> Wunschliste");
  });

  it("uses a configured Brevo template when one is provided", async () => {
    process.env.BREVO_API_KEY = "xkeysib-test";
    process.env.BREVO_INVITATION_TEMPLATE_ID = "42";
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 201 }));

    await expect(sendInvitationEmail(invitation)).resolves.toBe("sent");
    const [, request] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body.templateId).toBe(42);
    expect(body.params).toEqual({
      wishlistTitle: invitation.wishlistTitle,
      acceptUrl: invitation.acceptUrl,
      roleLabel: "Bearbeitung",
    });
    expect(body.sender).toBeUndefined();
  });

  it("fails closed for incomplete configuration and provider errors", async () => {
    process.env.BREVO_API_KEY = "xkeysib-test";
    await expect(sendInvitationEmail(invitation)).resolves.toBe("failed");
    expect(fetch).not.toHaveBeenCalled();

    process.env.BREVO_SENDER_EMAIL = "hallo@wünschi.de";
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));
    await expect(sendInvitationEmail(invitation)).resolves.toBe("failed");
  });

  it("sends the personalized Wünschi magic-link email only with an inline sender", async () => {
    process.env.BREVO_API_KEY = "xkeysib-test";
    process.env.BREVO_SENDER_EMAIL = "hallo@wünschi.de";
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 201 }));

    expect(isBrevoInlineEmailConfigured()).toBe(true);
    await expect(sendMagicLinkEmail(magicLink)).resolves.toBe("sent");
    const [, request] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body.subject).toBe("Dein sicherer Anmeldelink für Wünschi");
    expect(body.htmlContent).toContain("Willkommen zurück");
    expect(body.htmlContent).toContain("token=login-token&amp;type=magiclink");
  });

  it("does not use an invitation template for magic-link emails", async () => {
    process.env.BREVO_API_KEY = "xkeysib-test";
    process.env.BREVO_INVITATION_TEMPLATE_ID = "42";

    expect(isBrevoInlineEmailConfigured()).toBe(false);
    await expect(sendMagicLinkEmail(magicLink)).resolves.toBe("not_configured");
    expect(fetch).not.toHaveBeenCalled();
  });
});
