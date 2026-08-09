import { NextRequest } from "next/server";
import { z } from "zod";
import { wishlistIdSchema } from "@/lib/app-wishlist-data";
import { getAuthenticatedRoute, privateJson } from "@/lib/app-route-auth";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";
const orderInput = z.object({ wishIds: z.array(z.uuid()).max(250) }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!wishlistIdSchema.safeParse(id).success) return privateJson({ error: "Nicht gefunden." }, 404);
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return privateJson({ error: "Ungültige Anfrage." }, 403);

  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return auth.json({ error: "Ungültige Anfrage." }, 400); }
  const parsed = orderInput.safeParse(body);
  if (!parsed.success) return auth.json({ error: "Die Reihenfolge ist ungültig." }, 400);

  const { error } = await auth.supabase.rpc("reorder_wishes_v1", {
    p_wishlist_id: id,
    p_ordered_ids: parsed.data.wishIds,
  });
  if (error) return auth.json({ error: "Die Reihenfolge konnte nicht gespeichert werden." }, 422);
  return auth.json({ ok: true });
}
