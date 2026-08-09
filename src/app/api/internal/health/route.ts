import { NextRequest } from "next/server";
import { internalNoStore as noStore, isInternalRequestAuthorized } from "@/lib/internal-route-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/** Minimal authenticated readiness check for an external monitor. */
export async function GET(request: NextRequest) {
  if (!isInternalRequestAuthorized(request)) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
  const supabase = getSupabaseAdmin();
  if (!supabase) return Response.json({ ok: false }, { status: 503, headers: noStore });

  const { error } = await supabase.from("wishlists").select("id", { head: true }).limit(1);
  if (error) return Response.json({ ok: false }, { status: 503, headers: noStore });
  return Response.json({ ok: true }, { headers: noStore });
}
