import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import type { AdminWish } from "@/lib/admin-types";
import { removeStoredProductImage, storeProductImage } from "@/lib/product-image-storage";
import { MAX_PRODUCT_URL_INPUT_LENGTH, normalizeProductUrl } from "@/lib/product-url";
import { getSupabaseAdmin, MATS_WISHLIST_ID } from "@/lib/supabase-admin";

const nullableImage = z.union([z.string().trim().url().max(2048), z.string().trim().regex(/^\/products\/[A-Za-z0-9._/-]+$/)]).nullable();
const draft = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(600),
  productUrl: z.string().trim().url().max(MAX_PRODUCT_URL_INPUT_LENGTH).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
  imageUrl: nullableImage,
  priceAmount: z.number().min(0).max(999999).nullable(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  shopName: z.string().trim().min(1).max(100),
});
const orderInput = z.object({ orderedIds: z.array(z.string().uuid()).min(1).max(200) });
export const runtime = "nodejs";

function unauthorized() { return Response.json({ error: "Der Admin-Code fehlt oder ist falsch." }, { status: 401 }); }

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorized();
  const supabase = getSupabaseAdmin();
  if (!supabase) return Response.json({ error: "Supabase ist nicht eingerichtet." }, { status: 503 });
  const wishlistId = MATS_WISHLIST_ID;
  const [{ data: rows, error }, { data: reservations, error: reservationError }] = await Promise.all([
    supabase.from("wishes").select("id,title,description,product_url,image_url,price_amount,currency,shop_name,sort_order,archived_at").eq("wishlist_id", wishlistId).order("sort_order"),
    supabase.from("reservations").select("wish_id").is("cancelled_at", null),
  ]);
  if (error || reservationError) return Response.json({ error: error?.message ?? reservationError?.message }, { status: 500 });
  const reservedIds = new Set((reservations ?? []).map((row) => row.wish_id as string));
  const wishes: AdminWish[] = (rows ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? "",
    productUrl: (row.product_url as string | null) ?? "",
    imageUrl: (row.image_url as string | null) ?? null,
    priceAmount: row.price_amount === null ? null : Number(row.price_amount),
    currency: (row.currency as string | null) ?? "EUR",
    shopName: (row.shop_name as string | null) ?? "Wunsch",
    sortOrder: Number(row.sort_order),
    archived: Boolean(row.archived_at),
    reserved: reservedIds.has(row.id as string),
  }));
  return Response.json({ wishes });
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorized();
  const parsed = draft.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Die Produktangaben sind unvollständig oder ungültig." }, { status: 400 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return Response.json({ error: "Supabase ist nicht eingerichtet." }, { status: 503 });
  let stored: Awaited<ReturnType<typeof storeProductImage>> | null = null;
  try {
    stored = await storeProductImage(MATS_WISHLIST_ID, parsed.data.imageUrl);
    const { data: last, error: orderError } = await supabase.from("wishes").select("sort_order").eq("wishlist_id", MATS_WISHLIST_ID).is("archived_at", null).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    if (orderError) throw new Error(orderError.message);
    const { data, error } = await supabase.from("wishes").insert({
      wishlist_id: MATS_WISHLIST_ID,
      title: parsed.data.title,
      description: parsed.data.description || null,
      product_url: normalizeProductUrl(parsed.data.productUrl),
      image_url: stored.url,
      price_amount: parsed.data.priceAmount,
      currency: parsed.data.currency,
      shop_name: parsed.data.shopName,
      sort_order: Number(last?.sort_order ?? 0) + 10,
      source_provider: "manual",
    }).select("id").single();
    if (error) throw new Error(error.message);
    return Response.json({ id: data.id }, { status: 201 });
  } catch (reason) {
    await removeStoredProductImage(stored?.path ?? null);
    return Response.json({ error: reason instanceof Error ? reason.message : "Der Wunsch konnte nicht gespeichert werden." }, { status: 422 });
  }
}

export async function PUT(request: Request) {
  if (!isAdminRequest(request)) return unauthorized();
  const parsed = orderInput.safeParse(await request.json());
  if (!parsed.success || new Set(parsed.data.orderedIds).size !== parsed.data.orderedIds.length) return Response.json({ error: "Die Reihenfolge ist ungültig." }, { status: 400 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return Response.json({ error: "Supabase ist nicht eingerichtet." }, { status: 503 });
  const { error } = await supabase.rpc("reorder_wishes", { p_wishlist_id: MATS_WISHLIST_ID, p_ordered_ids: parsed.data.orderedIds });
  return error ? Response.json({ error: error.message }, { status: 422 }) : Response.json({ ok: true });
}
