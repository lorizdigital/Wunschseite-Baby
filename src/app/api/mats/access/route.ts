import { NextResponse } from "next/server";
import { grantMatsAccess, accessCookieOptions, getAccessCookieName } from "@/lib/public-wishlist-access";
import { consumeRateLimit, getRequestClientKey } from "@/lib/rate-limit";
import { isSameAppOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

function redirect(request: Request, state: "invalid" | "rate") {
  return NextResponse.redirect(new URL(`/mats?access=${state}`, request.url), 303);
}

export async function POST(request: Request) {
  if (!isSameAppOrigin(request)) return redirect(request, "invalid");
  const limit = await consumeRateLimit("mats-access", getRequestClientKey(request), 8, 15 * 60);
  if (limit !== true) return redirect(request, "rate");

  const formData = await request.formData();
  const accessCode = formData.get("accessCode");
  const grant = typeof accessCode === "string" ? await grantMatsAccess(accessCode) : null;
  if (!grant) return redirect(request, "invalid");

  const response = NextResponse.redirect(new URL("/mats", request.url), 303);
  response.cookies.set(getAccessCookieName("mats"), grant, accessCookieOptions());
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
