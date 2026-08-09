import "server-only";

import { getAppOrigin } from "@/lib/app-config";

function normalizeOrigin(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Cookie-authenticated mutations must originate from this application. */
export function isSameAppOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== getAppOrigin()) return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin";
}

/** Native same-origin forms must match the public origin that received the request. */
export function isSameRequestOrigin(request: Request) {
  const origin = normalizeOrigin(request.headers.get("origin"));
  const requestOrigin = normalizeOrigin(request.url);
  if (!origin || origin !== requestOrigin) return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin";
}

export function isJsonRequest(request: Request) {
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") ?? false;
}
