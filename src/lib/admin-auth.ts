import "server-only";

import { timingSafeEqual } from "node:crypto";
import { isLegacyMatsAdminEnabled } from "@/lib/app-config";

export function isAdminRequest(request: Request) {
  if (!isLegacyMatsAdminEnabled()) return false;
  const expected = process.env.ADMIN_IMPORT_SECRET;
  const received = request.headers.get("x-admin-secret") ?? "";
  if (!expected || !received) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}
