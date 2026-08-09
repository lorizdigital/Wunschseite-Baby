import { NextRequest } from "next/server";
import { z } from "zod";
import { internalNoStore as noStore, isInternalRequestAuthorized } from "@/lib/internal-route-auth";
import { isJsonRequest } from "@/lib/request-security";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const input = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  displayName: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(180),
  intro: z.string().trim().max(2000).default(""),
}).strict();

/** Adds exactly one initial owner/list pair while public self-registration is off. */
export async function POST(request: NextRequest) {
  if (!isInternalRequestAuthorized(request, "INTERNAL_PROVISIONING_SECRET")) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
  if (!isJsonRequest(request)) return Response.json({ error: "Ungültige Anfrage." }, { status: 415, headers: noStore });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Ungültige Anfrage." }, { status: 400, headers: noStore }); }
  const parsed = input.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Die Angaben sind ungültig." }, { status: 400, headers: noStore });

  const supabase = getSupabaseAdmin();
  if (!supabase) return Response.json({ error: "Nicht verfügbar." }, { status: 503, headers: noStore });

  const { data: created, error: createUserError } = await supabase.auth.admin.createUser({
    email: parsed.data.email,
    email_confirm: true,
  });
  if (createUserError || !created.user) return Response.json({ error: "Das Elternkonto konnte nicht aufgenommen werden." }, { status: 422, headers: noStore });

  const { data: provisioned, error: provisionError } = await supabase.rpc("provision_wishlist_v1", {
    p_user_id: created.user.id,
    p_title: parsed.data.title,
    p_intro: parsed.data.intro,
    p_display_name: parsed.data.displayName,
  });
  if (provisionError || !provisioned?.[0]) {
    await supabase.auth.admin.deleteUser(created.user.id);
    return Response.json({ error: "Die Wunschliste konnte nicht aufgenommen werden." }, { status: 422, headers: noStore });
  }

  return Response.json({ wishlist: provisioned[0], loginPath: "/login" }, { status: 201, headers: noStore });
}
