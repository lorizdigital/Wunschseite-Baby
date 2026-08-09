import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAccessFormToken } from "@/lib/access-form-token";
import { isFeatureEnabled } from "@/lib/app-config";
import { accessCookieOptions, getAccessCookieName, getPublicWishlistAccessVersion, grantPublicWishlistAccess } from "@/lib/public-wishlist-access";
import { consumeRateLimit, getRequestClientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const slug = z.string().regex(/^[A-Za-z0-9_-]{22,128}$/);
type RouteContext = { params: Promise<{ slug: string }> };

function redirect(request: Request, publicSlug: string, state: "granted" | "invalid" | "rate" | "request" | "unavailable") {
  return NextResponse.redirect(new URL(`/w/${encodeURIComponent(publicSlug)}?access=${state}`, request.url), 303);
}

export async function POST(request: Request, { params }: RouteContext) {
  if (!isFeatureEnabled("MULTI_WISHLIST_ENABLED")) return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  const { slug: publicSlug } = await params;
  if (!slug.safeParse(publicSlug).success) return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  const formData = await request.formData();
  if (!verifyAccessFormToken(formData.get("requestToken"), publicSlug)) return redirect(request, publicSlug, "request");

  const accessVersion = await getPublicWishlistAccessVersion(publicSlug);
  if (!accessVersion) return redirect(request, publicSlug, "unavailable");
  const limit = await consumeRateLimit("public-wishlist-access", `${getRequestClientKey(request)}:${publicSlug}:${accessVersion}`, 8, 15 * 60);
  if (limit !== true) return redirect(request, publicSlug, "rate");

  const accessCode = formData.get("accessCode");
  const grant = typeof accessCode === "string" ? await grantPublicWishlistAccess(publicSlug, accessCode) : null;
  if (!grant) return redirect(request, publicSlug, "invalid");

  const response = redirect(request, publicSlug, "granted");
  response.cookies.set(getAccessCookieName(publicSlug), grant, accessCookieOptions());
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
