import { NextRequest } from "next/server";
import { wishlistIdSchema } from "@/lib/app-wishlist-data";
import { getAuthenticatedRoute, privateJson } from "@/lib/app-route-auth";
import { deleteWishlistImmediately } from "@/lib/immediate-wishlist-deletion";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!wishlistIdSchema.safeParse(id).success) return privateJson({ error: "Nicht gefunden." }, 404);
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return privateJson({ error: "Ungültige Anfrage." }, 403);
  const body = await request.clone().json().catch(() => null) as { action?: unknown } | null;
  if (request.nextUrl.searchParams.get("mode") === "immediate" || body?.action === "delete_immediately") {
    return deleteWishlistImmediately(request, id);
  }
  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);
  if (!body) return auth.json({ error: "Ungültige Anfrage." }, 400);

  const { data, error } = await auth.supabase.rpc("schedule_wishlist_deletion_v1", { p_wishlist_id: id });
  if (error || !data) return auth.json({ error: "Die Löschung konnte nicht vorgemerkt werden." }, 422);
  return auth.json({ deleteAfter: data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return deleteWishlistImmediately(request, id);
}
