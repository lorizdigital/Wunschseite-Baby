import { NextResponse } from "next/server";
import { z } from "zod";
import { isFeatureEnabled } from "@/lib/app-config";
import { accessCookieOptions, getAccessCookieName, grantPublicWishlistAccess } from "@/lib/public-wishlist-access";
import { consumeRateLimit, getRequestClientKey } from "@/lib/rate-limit";
import { isSameAppOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const slug = z.string().regex(/^[A-Za-z0-9_-]{22,128}$/);
type RouteContext = { params: Promise<{ slug: string }> };

function redirect(request: Request, publicSlug: string, state: "invalid" | "rate") {
  return NextResponse.redirect(new URL(`/w/${encodeURIComponent(publicSlug)}?access=${state}`, request.url), 303);
}

export async function POST(request: Request, { params }: RouteContext) {
  if (!isFeatureEnabled("MULTI_WISHLIST_ENABLED")) return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  const { slug: publicSlug } = await params;
  if (!slug.safeParse(publicSlug).success) return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  if (!isSameAppOrigin(request)) return redirect(request, publicSlug, "invalid");

  const limit = await consumeRateLimit("public-wishlist-access", `${getRequestClientKey(request)}:${publicSlug}`, 8, 15 * 60);
  if (limit !== true) return redirect(request, publicSlug, "rate");

  const formData = await request.formData();
  const accessCode = formData.get("accessCode");
  const grant = typeof accessCode === "string" ? await grantPublicWishlistAccess(publicSlug, accessCode) : null;
  if (!grant) return redirect(request, publicSlug, "invalid");

  const response = NextResponse.redirect(new URL(`/w/${encodeURIComponent(publicSlug)}`, request.url), 303);
  response.cookies.set(getAccessCookieName(publicSlug), grant, accessCookieOptions());
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
