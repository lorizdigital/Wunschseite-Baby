import { NextResponse } from "next/server";
import { verifyAccessFormToken } from "@/lib/access-form-token";
import { grantMatsAccess, accessCookieOptions, getAccessCookieName, getMatsAccessVersion } from "@/lib/public-wishlist-access";
import { consumeRateLimit, getRequestClientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function redirect(request: Request, state: "granted" | "invalid" | "rate" | "request" | "unavailable") {
  return NextResponse.redirect(new URL(`/mats?access=${state}`, request.url), 303);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  if (!verifyAccessFormToken(formData.get("requestToken"), "mats")) return redirect(request, "request");
  const accessVersion = await getMatsAccessVersion();
  if (!accessVersion) return redirect(request, "unavailable");
  const limit = await consumeRateLimit("mats-access", `${getRequestClientKey(request)}:${accessVersion}`, 8, 15 * 60);
  if (limit !== true) return redirect(request, "rate");

  const accessCode = formData.get("accessCode");
  const grant = typeof accessCode === "string" ? await grantMatsAccess(accessCode) : null;
  if (!grant) return redirect(request, "invalid");

  const response = redirect(request, "granted");
  response.cookies.set(getAccessCookieName("mats"), grant, accessCookieOptions());
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
