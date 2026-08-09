import { NextRequest } from "next/server";
import { z } from "zod";
import { isFeatureEnabled } from "@/lib/app-config";
import { wishlistIdSchema } from "@/lib/app-wishlist-data";
import { getAuthenticatedRoute, privateJson } from "@/lib/app-route-auth";
import { removeStoredProductImage, storeProductImage } from "@/lib/product-image-storage";
import { scrapeProduct } from "@/lib/product-scraper";
import { MAX_PRODUCT_URL_INPUT_LENGTH, normalizeProductUrl } from "@/lib/product-url";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const input = z.object({ url: z.string().trim().url().max(MAX_PRODUCT_URL_INPUT_LENGTH) }).strict();

function priceAmount(value: string | null) {
  if (!value || !/^\d{1,6}(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 999999 ? parsed : null;
}

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

  let stored: Awaited<ReturnType<typeof storeProductImage>> | null = null;
  try {
    const product = await scrapeProduct(normalizeProductUrl(parsed.data.url));
    stored = await storeProductImage(id, product.imageUrl);
    const currency = product.currency && /^[A-Za-z]{3}$/.test(product.currency) ? product.currency.toUpperCase() : "EUR";
    const { data, error } = await auth.supabase.rpc("create_wish_v1", {
      p_wishlist_id: id,
      p_title: product.title,
      p_description: product.description || null,
      p_product_url: product.sourceUrl,
      p_image_url: stored.url,
      p_image_storage_path: stored.path,
      p_price_amount: priceAmount(product.price),
      p_currency: currency,
      p_shop_name: product.shop,
    });
    if (error || !data?.[0]) throw new Error("Der Wunsch konnte nicht gespeichert werden.");
    return auth.json({ wish: {
      id: data[0].wish_id, title: product.title, description: product.description, productUrl: product.sourceUrl, imageUrl: stored.url,
      priceAmount: priceAmount(product.price), currency, shopName: product.shop, sortOrder: data[0].sort_order, archivedAt: null,
    } }, 201);
  } catch (reason) {
    await removeStoredProductImage(stored?.path ?? null);
    return auth.json({ error: reason instanceof Error ? reason.message : "Der Produktlink konnte nicht importiert werden." }, 422);
  }
}
