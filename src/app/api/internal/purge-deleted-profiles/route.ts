import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { internalNoStore as noStore, isInternalRequestAuthorized } from "@/lib/internal-route-auth";

export const dynamic = "force-dynamic";

/** Scheduled only: irreversibly purges accounts after the 30-day grace period. */
export async function POST(request: NextRequest) {
  if (!isInternalRequestAuthorized(request)) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
  const supabase = getSupabaseAdmin();
  if (!supabase) return Response.json({ error: "Nicht verfügbar." }, { status: 503, headers: noStore });

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("user_id")
    .not("deleted_at", "is", null)
    .lte("delete_after", new Date().toISOString())
    .order("delete_after", { ascending: true })
    .limit(50);
  if (error) return Response.json({ error: "Löschlauf fehlgeschlagen." }, { status: 500, headers: noStore });

  let deleted = 0;
  let failed = 0;
  for (const profile of profiles ?? []) {
    const { error: deleteError } = await supabase.auth.admin.deleteUser(profile.user_id as string);
    if (deleteError) failed += 1;
    else deleted += 1;
  }
  return Response.json({ deleted, failed }, { headers: noStore });
}
