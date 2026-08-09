import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export function getRequestClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const candidate = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return candidate.slice(0, 200);
}

/** Returns null only when the configured durable limiter is temporarily unavailable. */
export async function consumeRateLimit(scope: string, key: string, limit: number, windowSeconds: number) {
  const supabase = getSupabaseAdmin();
  // Local Mats demo mode has no database. Production multi-list routes already
  // fail closed without Supabase, so this keeps local visual work usable.
  if (!supabase) return true;

  const keyHash = createHash("sha256").update(`${scope}:${key}`).digest("hex");
  const { data, error } = await supabase.rpc("consume_rate_limit_v1", {
    p_scope: scope,
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) return null;
  return data === true;
}
