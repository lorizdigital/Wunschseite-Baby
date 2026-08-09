import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_SECONDS = 20 * 60;
const CLOCK_SKEW_SECONDS = 60;

type AccessFormToken = {
  scope: string;
  issuedAt: number;
  expiresAt: number;
};

function isValidScope(scope: string) {
  return scope === "mats" || /^[A-Za-z0-9_-]{22,128}$/.test(scope);
}

function getSecret() {
  const secret = process.env.PUBLIC_WISHLIST_ACCESS_SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

function sign(payload: string) {
  const secret = getSecret();
  return secret
    ? createHmac("sha256", secret).update(`access-form:${payload}`).digest("base64url")
    : null;
}

function hasSameSignature(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createAccessFormToken(scope: string) {
  if (!isValidScope(scope)) return null;
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    scope,
    issuedAt,
    expiresAt: issuedAt + TOKEN_TTL_SECONDS,
  } satisfies AccessFormToken)).toString("base64url");
  const signature = sign(payload);
  return signature ? `${payload}.${signature}` : null;
}

export function verifyAccessFormToken(token: unknown, scope: string) {
  if (typeof token !== "string" || token.length > 1024 || !isValidScope(scope)) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expectedSignature = sign(payload);
  if (!expectedSignature || !hasSameSignature(signature, expectedSignature)) return false;

  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<AccessFormToken>;
    const now = Math.floor(Date.now() / 1000);
    return value.scope === scope
      && typeof value.issuedAt === "number"
      && typeof value.expiresAt === "number"
      && Number.isSafeInteger(value.issuedAt)
      && Number.isSafeInteger(value.expiresAt)
      && value.issuedAt <= now + CLOCK_SKEW_SECONDS
      && value.expiresAt > now
      && value.expiresAt - value.issuedAt === TOKEN_TTL_SECONDS;
  } catch {
    return false;
  }
}
