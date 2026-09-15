import "server-only";

import { PRODUCT_NAME } from "@/lib/brand";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_REQUEST_TIMEOUT_MS = 10_000;

export type InvitationEmailStatus = "sent" | "not_configured" | "failed";

type MagicLinkEmailInput = {
  recipientEmail: string;
  loginUrl: string;
};

type InvitationEmailInput = {
  recipientEmail: string;
  wishlistTitle: string;
  role: "owner" | "editor" | "viewer";
  acceptUrl: string;
};

type BrevoConfig = {
  apiKey: string;
  senderEmail?: string;
  senderName: string;
  replyToEmail?: string;
  invitationTemplateId?: number;
};

type ConfigResult =
  | { kind: "disabled" }
  | { kind: "invalid" }
  | { kind: "ready"; config: BrevoConfig };

function envValue(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function isEmail(value: string | undefined) {
  return value !== undefined && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320;
}

function getBrevoConfig(): ConfigResult {
  const apiKey = envValue("BREVO_API_KEY");
  const senderEmail = envValue("BREVO_SENDER_EMAIL");
  const senderName = envValue("BREVO_SENDER_NAME") ?? PRODUCT_NAME;
  const replyToEmail = envValue("BREVO_REPLY_TO_EMAIL");
  const templateValue = envValue("BREVO_INVITATION_TEMPLATE_ID");
  const hasConfiguration = Boolean(apiKey || senderEmail || replyToEmail || templateValue);

  if (!hasConfiguration) return { kind: "disabled" };
  if (!apiKey || senderEmail !== undefined && !isEmail(senderEmail) || !senderEmail && !templateValue || replyToEmail !== undefined && !isEmail(replyToEmail)) {
    return { kind: "invalid" };
  }

  let invitationTemplateId: number | undefined;
  if (templateValue !== undefined) {
    if (!/^\d+$/.test(templateValue)) return { kind: "invalid" };
    invitationTemplateId = Number(templateValue);
    if (!Number.isSafeInteger(invitationTemplateId) || invitationTemplateId < 1) return { kind: "invalid" };
  }

  return {
    kind: "ready",
    config: { apiKey, senderEmail, senderName, replyToEmail, invitationTemplateId },
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function roleLabel(role: InvitationEmailInput["role"]) {
  return { owner: "gleichberechtigte Mitverwaltung", editor: "Bearbeitung", viewer: "Ansicht" }[role];
}

function subjectTitle(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim() || "deiner Wunschliste";
}

function invitationHtml(input: InvitationEmailInput) {
  const title = escapeHtml(input.wishlistTitle || "deiner Wunschliste");
  const url = escapeHtml(input.acceptUrl);
  const role = escapeHtml(roleLabel(input.role));

  return `<!doctype html>
<html lang="de">
  <body style="margin:0;background:#f7f3ee;color:#332d29;font-family:Arial,sans-serif;line-height:1.55">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px">
      <div style="background:#fffdf9;border:1px solid #e7ded4;border-radius:20px;padding:32px">
        <p style="margin:0 0 24px;color:#8c6250;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(PRODUCT_NAME)}</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2">Du bist eingeladen</h1>
        <p style="margin:0 0 16px">Du kannst an der Wunschliste <strong>„${title}“</strong> mitwirken – mit ${role}.</p>
        <p style="margin:0 0 28px">Die Einladung ist 72 Stunden gültig. Melde dich nach dem Öffnen mit dieser E-Mail-Adresse an.</p>
        <p style="margin:0 0 28px"><a href="${url}" style="display:inline-block;background:#8c6250;color:#fffdf9;border-radius:999px;padding:13px 22px;text-decoration:none;font-weight:700">Einladung öffnen</a></p>
        <p style="margin:0;color:#756c66;font-size:13px">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:</p>
        <p style="margin:8px 0 0;word-break:break-all;color:#756c66;font-size:13px">${url}</p>
      </div>
    </div>
  </body>
</html>`;
}

function magicLinkHtml(input: MagicLinkEmailInput) {
  const url = escapeHtml(input.loginUrl);

  return `<!doctype html>
<html lang="de">
  <body style="margin:0;background:#f7f3ee;color:#332d29;font-family:Arial,sans-serif;line-height:1.55">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px">
      <div style="background:#fffdf9;border:1px solid #e7ded4;border-radius:20px;padding:32px">
        <p style="margin:0 0 24px;color:#8c6250;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(PRODUCT_NAME)}</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2">Willkommen zurück</h1>
        <p style="margin:0 0 28px">Mit diesem Link meldest du dich sicher bei Wünschi an und kannst deine Wunschlisten weiter verwalten.</p>
        <p style="margin:0 0 28px"><a href="${url}" style="display:inline-block;background:#8c6250;color:#fffdf9;border-radius:999px;padding:13px 22px;text-decoration:none;font-weight:700">Bei Wünschi anmelden</a></p>
        <p style="margin:0;color:#756c66;font-size:13px">Der Link ist einmalig und nur kurz gültig. Falls du ihn nicht angefordert hast, kannst du diese E-Mail ignorieren.</p>
      </div>
    </div>
  </body>
</html>`;
}

function buildInvitationPayload(config: BrevoConfig, input: InvitationEmailInput) {
  const payload: Record<string, unknown> = {
    to: [{ email: input.recipientEmail }],
    ...(config.replyToEmail ? { replyTo: { email: config.replyToEmail } } : {}),
  };

  if (config.invitationTemplateId) {
    payload.templateId = config.invitationTemplateId;
    payload.params = {
      wishlistTitle: input.wishlistTitle,
      acceptUrl: input.acceptUrl,
      roleLabel: roleLabel(input.role),
    };
    return payload;
  }

  payload.sender = { email: config.senderEmail, name: config.senderName };
  payload.subject = `Einladung zu „${subjectTitle(input.wishlistTitle)}“`;
  payload.htmlContent = invitationHtml(input);
  return payload;
}

function buildMagicLinkPayload(config: BrevoConfig, input: MagicLinkEmailInput) {
  return {
    to: [{ email: input.recipientEmail }],
    sender: { email: config.senderEmail!, name: config.senderName },
    ...(config.replyToEmail ? { replyTo: { email: config.replyToEmail } } : {}),
    subject: "Dein sicherer Anmeldelink für Wünschi",
    htmlContent: magicLinkHtml(input),
  };
}

export function isBrevoInlineEmailConfigured() {
  const configResult = getBrevoConfig();
  return configResult.kind === "ready" && Boolean(configResult.config.senderEmail);
}

async function sendBrevoPayload(config: BrevoConfig, payload: Record<string, unknown>): Promise<InvitationEmailStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BREVO_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(BREVO_SEND_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": config.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return response.status === 201 ? "sent" : "failed";
  } catch {
    return "failed";
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendInvitationEmail(input: InvitationEmailInput): Promise<InvitationEmailStatus> {
  const configResult = getBrevoConfig();
  if (configResult.kind === "disabled") return "not_configured";
  if (configResult.kind === "invalid") return "failed";

  return sendBrevoPayload(configResult.config, buildInvitationPayload(configResult.config, input));
}

export async function sendMagicLinkEmail(input: MagicLinkEmailInput): Promise<InvitationEmailStatus> {
  const configResult = getBrevoConfig();
  if (configResult.kind !== "ready" || !configResult.config.senderEmail) return "not_configured";

  return sendBrevoPayload(configResult.config, buildMagicLinkPayload(configResult.config, input));
}
