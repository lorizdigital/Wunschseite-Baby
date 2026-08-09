import { z } from "zod";
import { NextRequest } from "next/server";
import { wishlistIdSchema, getAppWishlistDetail } from "@/lib/app-wishlist-data";
import { getAuthenticatedRoute, privateJson } from "@/lib/app-route-auth";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";
import { isFeatureEnabled } from "@/lib/app-config";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const detailsInput = z.object({
  title: z.string().trim().min(1).max(180),
  intro: z.string().trim().max(2000),
}).strict();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled("MULTI_WISHLIST_ENABLED")) return privateJson({ error: "Nicht gefunden." }, 404);
  const { id } = await params;
  if (!wishlistIdSchema.safeParse(id).success) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });

  const detail = await getAppWishlistDetail(id);
  if (!detail) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
  return Response.json({ wishlist: detail.wishlist, wishes: detail.wishes }, { headers: noStore });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled("MULTI_WISHLIST_ENABLED")) return privateJson({ error: "Nicht gefunden." }, 404);
  const { id } = await params;
  if (!wishlistIdSchema.safeParse(id).success) return privateJson({ error: "Nicht gefunden." }, 404);
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return privateJson({ error: "Ungültige Anfrage." }, 403);

  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);

  let body: unknown;
  try { body = await request.json(); } catch { return auth.json({ error: "Ungültige Anfrage." }, 400); }
  const parsed = detailsInput.safeParse(body);
  if (!parsed.success) return auth.json({ error: "Die Listenangaben sind ungültig." }, 400);

  const { data, error } = await auth.supabase.rpc("update_wishlist_details_v1", {
    p_wishlist_id: id,
    p_title: parsed.data.title,
    p_intro: parsed.data.intro,
  });
  if (error || !data?.[0]) return auth.json({ error: "Die Liste konnte nicht aktualisiert werden." }, 422);
  return auth.json({ wishlist: data[0] });
}
