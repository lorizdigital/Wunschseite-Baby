import { NextRequest } from "next/server";
import { z } from "zod";
import { wishlistIdSchema } from "@/lib/app-wishlist-data";
import { getAuthenticatedRoute, privateJson } from "@/lib/app-route-auth";
import { removeStoredProductImage, storeProductImage } from "@/lib/product-image-storage";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const optionalUrl = z.union([
  z.literal(""),
  z.string().trim().min(1).max(2048).refine((value) => value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/products/")),
]);
const nullableText = (maxLength: number) => z.string().trim().max(maxLength).optional().default("");
const wishInput = z.object({
  title: z.string().trim().min(1).max(180),
  description: nullableText(600),
  productUrl: optionalUrl.optional().default(""),
  imageUrl: optionalUrl.optional().default(""),
  priceAmount: z.number().finite().min(0).max(999999).nullable().optional().default(null),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).optional().default("EUR"),
  shopName: nullableText(100),
}).strict();
const archiveInput = z.object({ archived: z.boolean() }).strict();
type Context = { params: Promise<{ id: string; wishId: string }> };

function validIds(id: string, wishId: string) {
  return wishlistIdSchema.safeParse(id).success && z.uuid().safeParse(wishId).success;
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const { id, wishId } = await params;
  if (!validIds(id, wishId)) return privateJson({ error: "Nicht gefunden." }, 404);
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return privateJson({ error: "Ungültige Anfrage." }, 403);

  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return auth.json({ error: "Ungültige Anfrage." }, 400); }
  const parsed = wishInput.safeParse(body);
  if (!parsed.success) return auth.json({ error: "Die Wunschangaben sind ungültig." }, 400);

  const { data: existingWish, error: existingWishError } = await auth.supabase
    .from("wishes")
    .select("image_url,image_storage_path")
    .eq("id", wishId)
    .eq("wishlist_id", id)
    .maybeSingle();
  if (existingWishError || !existingWish) return auth.json({ error: "Der Wunsch wurde nicht gefunden." }, 404);
  const imageUrl = parsed.data.imageUrl || null;
  const previousImageUrl = (existingWish.image_url as string | null) ?? null;
  const previousStoragePath = (existingWish.image_storage_path as string | null) ?? null;
  const imageChanged = imageUrl !== previousImageUrl;

  let stored: Awaited<ReturnType<typeof storeProductImage>> | null = null;
  try {
    if (imageChanged) stored = await storeProductImage(id, imageUrl);
    const nextImageUrl = imageChanged ? stored?.url ?? null : imageUrl;
    const nextStoragePath = imageChanged ? stored?.path ?? null : previousStoragePath;
    const { error } = await auth.supabase.rpc("update_wish_v1", {
      p_wishlist_id: id,
      p_wish_id: wishId,
      p_title: parsed.data.title,
      p_description: parsed.data.description || null,
      p_product_url: parsed.data.productUrl || null,
      p_image_url: nextImageUrl,
      p_image_storage_path: nextStoragePath,
      p_price_amount: parsed.data.priceAmount,
      p_currency: parsed.data.currency.toUpperCase(),
      p_shop_name: parsed.data.shopName || null,
    });
    if (error) throw new Error("Der Wunsch konnte nicht aktualisiert werden.");
    if (imageChanged && previousStoragePath) await removeStoredProductImage(previousStoragePath);
    return auth.json({ ok: true, imageUrl: nextImageUrl });
  } catch (reason) {
    await removeStoredProductImage(stored?.path ?? null);
    return auth.json({ error: reason instanceof Error ? reason.message : "Der Wunsch konnte nicht aktualisiert werden." }, 422);
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  const { id, wishId } = await params;
  if (!validIds(id, wishId)) return privateJson({ error: "Nicht gefunden." }, 404);
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return privateJson({ error: "Ungültige Anfrage." }, 403);

  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return auth.json({ error: "Ungültige Anfrage." }, 400); }
  const parsed = archiveInput.safeParse(body);
  if (!parsed.success) return auth.json({ error: "Ungültige Anfrage." }, 400);

  const { error } = await auth.supabase.rpc("set_wish_archived_v1", {
    p_wishlist_id: id,
    p_wish_id: wishId,
    p_archived: parsed.data.archived,
  });
  if (error) return auth.json({ error: parsed.data.archived ? "Der Wunsch konnte nicht archiviert werden." : "Der Wunsch konnte nicht wiederhergestellt werden." }, 422);
  return auth.json({ ok: true });
}
