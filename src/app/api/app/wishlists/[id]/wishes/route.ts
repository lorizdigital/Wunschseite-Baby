import { NextRequest } from "next/server";
import { z } from "zod";
import { wishlistIdSchema } from "@/lib/app-wishlist-data";
import { getAuthenticatedRoute, privateJson } from "@/lib/app-route-auth";
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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!wishlistIdSchema.safeParse(id).success) return privateJson({ error: "Nicht gefunden." }, 404);
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return privateJson({ error: "Ungültige Anfrage." }, 403);

  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return auth.json({ error: "Ungültige Anfrage." }, 400); }
  const parsed = wishInput.safeParse(body);
  if (!parsed.success) return auth.json({ error: "Die Wunschangaben sind ungültig." }, 400);

  const { data, error } = await auth.supabase.rpc("create_wish_v1", {
    p_wishlist_id: id,
    p_title: parsed.data.title,
    p_description: parsed.data.description || null,
    p_product_url: parsed.data.productUrl || null,
    p_image_url: parsed.data.imageUrl || null,
    p_image_storage_path: null,
    p_price_amount: parsed.data.priceAmount,
    p_currency: parsed.data.currency.toUpperCase(),
    p_shop_name: parsed.data.shopName || null,
  });
  if (error || !data?.[0]) return auth.json({ error: "Der Wunsch konnte nicht angelegt werden." }, 422);
  return auth.json({ wish: data[0] }, 201);
}
