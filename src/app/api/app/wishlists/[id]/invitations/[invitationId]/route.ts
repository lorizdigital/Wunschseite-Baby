import { NextRequest } from "next/server";
import { z } from "zod";
import { wishlistIdSchema } from "@/lib/app-wishlist-data";
import { getAuthenticatedRoute, privateJson } from "@/lib/app-route-auth";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; invitationId: string }> }) {
  const { id, invitationId } = await params;
  if (!wishlistIdSchema.safeParse(id).success || !z.uuid().safeParse(invitationId).success) return privateJson({ error: "Nicht gefunden." }, 404);
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return privateJson({ error: "Ungültige Anfrage." }, 403);
  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);
  try { await request.json(); } catch { return auth.json({ error: "Ungültige Anfrage." }, 400); }

  const { data, error } = await auth.supabase.rpc("revoke_wishlist_invitation_v1", {
    p_wishlist_id: id,
    p_invitation_id: invitationId,
  });
  if (error || !data) return auth.json({ error: "Die Einladung konnte nicht widerrufen werden." }, 422);
  return auth.json({ ok: true });
}
