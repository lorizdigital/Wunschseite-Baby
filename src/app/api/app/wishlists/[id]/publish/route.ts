import { NextRequest } from "next/server";
import { wishlistIdSchema } from "@/lib/app-wishlist-data";
import { getAuthenticatedRoute, privateJson } from "@/lib/app-route-auth";
import { isFeatureEnabled } from "@/lib/app-config";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isFeatureEnabled("PUBLICATION_ENABLED")) return privateJson({ error: "Nicht gefunden." }, 404);
  if (!wishlistIdSchema.safeParse(id).success) return privateJson({ error: "Nicht gefunden." }, 404);
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return privateJson({ error: "Ungültige Anfrage." }, 403);

  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);
  const limit = await consumeRateLimit("wishlist-publish", auth.user.id, 8, 3600);
  if (limit === false) return auth.json({ error: "Bitte warte einen Moment, bevor du erneut veröffentlichst." }, 429);
  if (limit === null) return auth.json({ error: "Die Veröffentlichung ist kurzzeitig nicht verfügbar." }, 503);
  try { await request.json(); } catch { return auth.json({ error: "Ungültige Anfrage." }, 400); }

  const { data, error } = await auth.supabase.rpc("publish_wishlist_v1", { p_wishlist_id: id });
  if (error || !data) {
    console.error("publish_wishlist_v1 failed", { code: error?.code ?? "missing_result" });
    if (error?.message.includes("access_code_required")) return auth.json({ error: "Lege zuerst den verpflichtenden Zugangscode fest." }, 422);
    if (error?.message.includes("wishlist_empty")) return auth.json({ error: "Füge vor der Veröffentlichung mindestens einen Wunsch hinzu." }, 422);
    return auth.json({ error: "Die Liste konnte nicht veröffentlicht werden." }, 422);
  }
  return auth.json({ publishedAt: data });
}
