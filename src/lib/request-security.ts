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
  const originHeader = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (originHeader === "null") {
    return fetchSite === "same-origin"
      && request.headers.get("sec-fetch-mode") === "navigate"
      && request.headers.get("sec-fetch-dest") === "document"
      && request.headers.get("sec-fetch-user") === "?1";
  }

  const origin = normalizeOrigin(originHeader);
  const requestOrigin = normalizeOrigin(request.url);
  if (!origin || origin !== requestOrigin) return false;

  return !fetchSite || fetchSite === "same-origin";
}

export function isJsonRequest(request: Request) {
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") ?? false;
}
