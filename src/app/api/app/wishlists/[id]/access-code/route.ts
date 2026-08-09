import { z } from "zod";
import { NextRequest } from "next/server";
import { ACCESS_CODE_MAX_LENGTH, ACCESS_CODE_MIN_LENGTH } from "@/lib/access-code";
import { wishlistIdSchema } from "@/lib/app-wishlist-data";
import { getAuthenticatedRoute, privateJson } from "@/lib/app-route-auth";
import { isFeatureEnabled } from "@/lib/app-config";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const accessCodeInput = z.object({ accessCode: z.string().trim().min(ACCESS_CODE_MIN_LENGTH).max(ACCESS_CODE_MAX_LENGTH) }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled("MULTI_WISHLIST_ENABLED")) return privateJson({ error: "Nicht gefunden." }, 404);
  const { id } = await params;
  if (!wishlistIdSchema.safeParse(id).success) return privateJson({ error: "Nicht gefunden." }, 404);
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return privateJson({ error: "Ungültige Anfrage." }, 403);

  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);
  const limit = await consumeRateLimit("wishlist-access-code", auth.user.id, 8, 15 * 60);
  if (limit === false) return auth.json({ error: "Bitte warte einen Moment, bevor du den Zugangscode erneut änderst." }, 429);
  if (limit === null) return auth.json({ error: "Der Zugangscode kann gerade nicht gespeichert werden." }, 503);

  let body: unknown;
  try { body = await request.json(); } catch { return auth.json({ error: "Ungültige Anfrage." }, 400); }
  const parsed = accessCodeInput.safeParse(body);
  if (!parsed.success) return auth.json({ error: "Der Zugangscode muss 8 bis 64 Zeichen lang sein." }, 400);

  const { data, error } = await auth.supabase.rpc("set_wishlist_access_code_v1", {
    p_wishlist_id: id,
    p_access_code: parsed.data.accessCode,
  });
  if (error || typeof data !== "string") return auth.json({ error: "Der Zugangscode konnte nicht gespeichert werden." }, 422);
  return auth.json({ accessCodeSet: true });
}
