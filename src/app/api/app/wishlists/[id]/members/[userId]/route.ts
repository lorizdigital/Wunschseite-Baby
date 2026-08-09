import { NextRequest } from "next/server";
import { z } from "zod";
import { wishlistIdSchema } from "@/lib/app-wishlist-data";
import { getAuthenticatedRoute, privateJson } from "@/lib/app-route-auth";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";
const changeRoleInput = z.object({ role: z.enum(["owner", "editor", "viewer"]) }).strict();

function validIds(id: string, userId: string) {
  return wishlistIdSchema.safeParse(id).success && z.uuid().safeParse(userId).success;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  if (!validIds(id, userId)) return privateJson({ error: "Nicht gefunden." }, 404);
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return privateJson({ error: "Ungültige Anfrage." }, 403);
  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return auth.json({ error: "Ungültige Anfrage." }, 400); }
  const parsed = changeRoleInput.safeParse(body);
  if (!parsed.success) return auth.json({ error: "Die Rolle ist ungültig." }, 400);

  const { data, error } = await auth.supabase.rpc("change_wishlist_member_role_v1", {
    p_wishlist_id: id,
    p_user_id: userId,
    p_role: parsed.data.role,
  });
  if (error || !data) return auth.json({ error: "Die Rolle konnte nicht geändert werden." }, 422);
  return auth.json({ role: data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  if (!validIds(id, userId)) return privateJson({ error: "Nicht gefunden." }, 404);
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return privateJson({ error: "Ungültige Anfrage." }, 403);
  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);
  try { await request.json(); } catch { return auth.json({ error: "Ungültige Anfrage." }, 400); }

  const { data, error } = await auth.supabase.rpc("remove_wishlist_member_v1", {
    p_wishlist_id: id,
    p_user_id: userId,
  });
  if (error || !data) return auth.json({ error: "Das Mitglied konnte nicht entfernt werden." }, 422);
  return auth.json({ ok: true });
}
