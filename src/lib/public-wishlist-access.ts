import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { usesSecureCookies } from "@/lib/app-config";

const ACCESS_COOKIE_PREFIX = "wuenschi_access_";
const ACCESS_GRANT_TTL_SECONDS = 30 * 24 * 60 * 60;

type AccessGrant = { scope: string; version: string; expiresAt: number };
type AccessVersionRow = { access_code_version: string };

function isValidScope(scope: string) {
  return scope === "mats" || /^[A-Za-z0-9_-]{22,128}$/.test(scope);
}

function getSessionSecret() {
  const secret = process.env.PUBLIC_WISHLIST_ACCESS_SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

function sign(value: string) {
  const secret = getSessionSecret();
  return secret ? createHmac("sha256", secret).update(value).digest("base64url") : null;
}

function sameSignature(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseGrant(value: string | undefined, scope: string, version: string) {
  if (!value || !isValidScope(scope)) return false;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return false;
  const expectedSignature = sign(payload);
  if (!expectedSignature || !sameSignature(signature, expectedSignature)) return false;

  try {
    const grant = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<AccessGrant>;
    return grant.scope === scope
      && grant.version === version
      && typeof grant.expiresAt === "number"
      && Number.isSafeInteger(grant.expiresAt)
      && grant.expiresAt > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function createGrant(scope: string, version: string) {
  if (!isValidScope(scope) || !version || version.length > 200) return null;
  const payload = Buffer.from(JSON.stringify({
    scope,
    version,
    expiresAt: Math.floor(Date.now() / 1000) + ACCESS_GRANT_TTL_SECONDS,
  } satisfies AccessGrant)).toString("base64url");
  const signature = sign(payload);
  return signature ? `${payload}.${signature}` : null;
}

export function getAccessCookieName(scope: string) {
  if (!isValidScope(scope)) throw new Error("Ungültiger Zugriffsumfang.");
  return `${ACCESS_COOKIE_PREFIX}${scope}`;
}

export function accessCookieOptions() {
  return {
    httpOnly: true,
    secure: usesSecureCookies(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: ACCESS_GRANT_TTL_SECONDS,
  };
}

async function getPublicWishlistAccessVersion(publicSlug: string) {
  if (!/^[A-Za-z0-9_-]{22,128}$/.test(publicSlug)) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_public_wishlist_access_version_v1", { p_public_slug: publicSlug });
  const row = Array.isArray(data) ? data[0] as AccessVersionRow | undefined : undefined;
  return !error && typeof row?.access_code_version === "string" ? row.access_code_version : null;
}

export async function hasPublicWishlistAccess(publicSlug: string) {
  const version = await getPublicWishlistAccessVersion(publicSlug);
  if (!version) return false;
  const cookieStore = await cookies();
  return parseGrant(cookieStore.get(getAccessCookieName(publicSlug))?.value, publicSlug, version);
}

export async function grantPublicWishlistAccess(publicSlug: string, accessCode: string) {
  if (!/^[A-Za-z0-9_-]{22,128}$/.test(publicSlug)) return null;
  const code = accessCode.trim();
  if (code.length < 8 || code.length > 64) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("verify_public_wishlist_access_code_v1", {
    p_public_slug: publicSlug,
    p_access_code: code,
  });
  const row = Array.isArray(data) ? data[0] as AccessVersionRow | undefined : undefined;
  if (error || typeof row?.access_code_version !== "string") return null;
  return createGrant(publicSlug, row.access_code_version);
}

function getMatsVersion() {
  const version = process.env.MATS_ACCESS_CODE_VERSION;
  return version && version.length >= 16 && version.length <= 200 ? version : null;
}

export async function hasMatsAccess() {
  const version = getMatsVersion();
  if (!version) return false;
  const cookieStore = await cookies();
  return parseGrant(cookieStore.get(getAccessCookieName("mats"))?.value, "mats", version);
}

export function grantMatsAccess(accessCode: string) {
  const expectedCode = process.env.MATS_ACCESS_CODE;
  const version = getMatsVersion();
  const secret = getSessionSecret();
  if (!expectedCode || !version || !secret) return null;

  // Cloudflare secrets can be populated from a terminal or a copied value. A
  // trailing line break must not make an otherwise correct access code fail.
  const expected = createHmac("sha256", secret).update(`mats-access:${expectedCode.trim()}`).digest();
  const received = createHmac("sha256", secret).update(`mats-access:${accessCode.trim()}`).digest();
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  return createGrant("mats", version);
}
