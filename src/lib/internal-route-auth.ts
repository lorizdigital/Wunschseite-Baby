import "server-only";

import { timingSafeEqual } from "node:crypto";

export const internalNoStore = { "Cache-Control": "no-store" };
type InternalSecretName = "INTERNAL_CRON_SECRET" | "INTERNAL_PROVISIONING_SECRET";

/** Authorizes scheduler and monitoring calls without exposing an oracle to outsiders. */
export function isInternalRequestAuthorized(request: Request, secretName: InternalSecretName = "INTERNAL_CRON_SECRET") {
  const expected = process.env[secretName];
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !received) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}
