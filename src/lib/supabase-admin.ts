import "server-only";

import { createClient } from "@supabase/supabase-js";

// The legacy routes are deliberately and permanently bound to Mats. New
// multi-wishlist routes must resolve a list from their own authenticated or
// public context; they must never read a global list ID from the environment.
export const MATS_WISHLIST_ID = "3d1f46e6-8e0e-4418-a0da-581be7cf795f";

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}
