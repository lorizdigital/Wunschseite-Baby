import "server-only";

import { createClient } from "@supabase/supabase-js";

export const DEFAULT_WISHLIST_ID = "3d1f46e6-8e0e-4418-a0da-581be7cf795f";

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}

export function getWishlistId() {
  return process.env.WISHLIST_ID ?? DEFAULT_WISHLIST_ID;
}
