import "server-only";

import { getAppOrigin } from "@/lib/app-config";

/** Cookie-authenticated mutations must originate from this application. */
export function isSameAppOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== getAppOrigin()) return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin";
}

export function isJsonRequest(request: Request) {
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") ?? false;
}
