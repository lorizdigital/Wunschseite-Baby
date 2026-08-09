import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { removeStoredProductImage, storeProductImage } from "@/lib/product-image-storage";
import { MAX_PRODUCT_URL_INPUT_LENGTH, normalizeProductUrl } from "@/lib/product-url";
import { getSupabaseAdmin, MATS_WISHLIST_ID } from "@/lib/supabase-admin";

const input = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(600).optional(),
  productUrl: z.string().trim().url().max(MAX_PRODUCT_URL_INPUT_LENGTH).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)).optional(),
  imageUrl: z.union([z.string().trim().url().max(2048), z.string().trim().regex(/^\/products\/[A-Za-z0-9._/-]+$/)]).nullable().optional(),
  priceAmount: z.number().min(0).max(999999).nullable().optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
  shopName: z.string().trim().min(1).max(100).optional(),
  archived: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);
export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return Response.json({ error: "Der Admin-Code fehlt oder ist falsch." }, { status: 401 });
  const [{ id }, body] = await Promise.all([context.params, request.json()]);
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "Der Wunsch ist ungültig." }, { status: 400 });
  const parsed = input.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Die Änderungen sind ungültig." }, { status: 400 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return Response.json({ error: "Supabase ist nicht eingerichtet." }, { status: 503 });

  if (parsed.data.archived === true) {
    const { count, error } = await supabase.from("reservations").select("id", { count: "exact", head: true }).eq("wish_id", id).is("cancelled_at", null);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (count) return Response.json({ error: "Ein reservierter Wunsch kann nicht archiviert werden." }, { status: 409 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.description !== undefined) update.description = parsed.data.description || null;
  if (parsed.data.productUrl !== undefined) {
    try {
      update.product_url = normalizeProductUrl(parsed.data.productUrl);
    } catch (reason) {
      return Response.json({ error: reason instanceof Error ? reason.message : "Der Produktlink ist ungültig." }, { status: 400 });
    }
  }
  if (parsed.data.priceAmount !== undefined) update.price_amount = parsed.data.priceAmount;
  if (parsed.data.currency !== undefined) update.currency = parsed.data.currency;
  if (parsed.data.shopName !== undefined) update.shop_name = parsed.data.shopName;
  let stored: Awaited<ReturnType<typeof storeProductImage>> | null = null;
  if (parsed.data.imageUrl !== undefined) {
    try {
      stored = await storeProductImage(MATS_WISHLIST_ID, parsed.data.imageUrl);
      update.image_url = stored.url;
    } catch (reason) {
      return Response.json({ error: reason instanceof Error ? reason.message : "Das Produktbild konnte nicht gespeichert werden." }, { status: 422 });
    }
  }
  if (parsed.data.archived !== undefined) {
    update.archived_at = parsed.data.archived ? new Date().toISOString() : null;
    if (!parsed.data.archived) {
      const { data: last } = await supabase.from("wishes").select("sort_order").eq("wishlist_id", MATS_WISHLIST_ID).is("archived_at", null).order("sort_order", { ascending: false }).limit(1).maybeSingle();
      update.sort_order = Number(last?.sort_order ?? 0) + 10;
    }
  }
  const { data, error } = await supabase.from("wishes").update(update).eq("id", id).eq("wishlist_id", MATS_WISHLIST_ID).select("id").maybeSingle();
  if (error || !data) {
    await removeStoredProductImage(stored?.path ?? null);
    return Response.json({ error: error?.message ?? "Der Wunsch wurde nicht gefunden." }, { status: error ? 422 : 404 });
  }
  return Response.json({ ok: true });
}
