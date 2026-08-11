import { NextRequest } from "next/server";
import { z } from "zod";
import { isFeatureEnabled } from "@/lib/app-config";
import { wishlistIdSchema } from "@/lib/app-wishlist-data";
import { getAuthenticatedRoute, privateJson } from "@/lib/app-route-auth";
import { scrapeProduct } from "@/lib/product-scraper";
import { MAX_PRODUCT_URL_INPUT_LENGTH, normalizeProductUrl } from "@/lib/product-url";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const input = z.object({ url: z.string().trim().url().max(MAX_PRODUCT_URL_INPUT_LENGTH) }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isFeatureEnabled("PRODUCT_IMPORT_ENABLED")) return privateJson({ error: "Nicht gefunden." }, 404);
  if (!wishlistIdSchema.safeParse(id).success) return privateJson({ error: "Nicht gefunden." }, 404);
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return privateJson({ error: "Ungültige Anfrage." }, 403);
  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);
  const limit = await consumeRateLimit("product-import", auth.user.id, 20, 60 * 60);
  if (limit === false) return auth.json({ error: "Für heute sind genug Produktimporte gestartet. Bitte versuche es später erneut." }, 429);
  if (limit === null) return auth.json({ error: "Der Produktimport ist kurzzeitig nicht verfügbar." }, 503);

  let body: unknown;
  try { body = await request.json(); } catch { return auth.json({ error: "Ungültige Anfrage." }, 400); }
  const parsed = input.safeParse(body);
  if (!parsed.success) return auth.json({ error: "Bitte gib einen vollständigen Produktlink ein." }, 400);

  const { data: membership, error: membershipError } = await auth.supabase
    .from("wishlist_members")
    .select("role")
    .eq("wishlist_id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (membershipError || !membership || !["owner", "editor"].includes(membership.role as string)) return auth.json({ error: "Nicht gefunden." }, 404);

  try {
    const product = await scrapeProduct(normalizeProductUrl(parsed.data.url));
    return auth.json({ draft: product });
  } catch (reason) {
    return auth.json({ error: reason instanceof Error ? reason.message : "Der Produktlink konnte nicht importiert werden." }, 422);
  }
}
