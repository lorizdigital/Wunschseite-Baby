import "server-only";

import { getAppOrigin } from "@/lib/app-config";

function getTrustedRequestOrigin(request: Request) {
  const canonical = new URL(getAppOrigin());
  const target = new URL(request.url);
  const isKnownHost = target.hostname === canonical.hostname || target.hostname === `www.${canonical.hostname}`;
  if (!isKnownHost || target.protocol !== canonical.protocol || target.port !== canonical.port) return null;
  return target.origin;
}

/** Cookie-authenticated mutations must originate from this application. */
export function isSameAppOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== getAppOrigin()) return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin";
}

/**
 * HTML form submissions do not consistently include an Origin header. For a
 * same-site navigation, accept a matching Referer as the fallback while still
 * rejecting browser requests that Fetch Metadata identifies as cross-site.
 */
export function isSameAppFormSubmission(request: Request) {
  const targetOrigin = getTrustedRequestOrigin(request);
  if (!targetOrigin) return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;

  const origin = request.headers.get("origin");
  if (origin) return origin === targetOrigin;

  // Fetch Metadata is browser-controlled. It remains available when the
  // application's no-referrer policy suppresses both Origin and Referer.
  if (fetchSite === "same-origin") return true;

  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === targetOrigin;
  } catch {
    return false;
  }
}

export function isJsonRequest(request: Request) {
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") ?? false;
}
