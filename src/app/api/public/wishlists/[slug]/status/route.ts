import { z } from "zod";
import { getPublicReservationStatus } from "@/lib/reservations";
import { isFeatureEnabled } from "@/lib/app-config";
import { resolvePublicWishlistBySlug } from "@/lib/wishlist-data";
import { hasPublicWishlistAccess } from "@/lib/public-wishlist-access";

export const dynamic = "force-dynamic";

const slug = z.string().regex(/^[A-Za-z0-9_-]{22,128}$/);
const noStore = { "Cache-Control": "no-store" };
type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  if (!isFeatureEnabled("MULTI_WISHLIST_ENABLED")) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
  const { slug: rawSlug } = await params;
  if (!slug.safeParse(rawSlug).success) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
  if (!await hasPublicWishlistAccess(rawSlug)) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });

  try {
    const wishlist = await resolvePublicWishlistBySlug(rawSlug);
    if (!wishlist) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
    return Response.json(await getPublicReservationStatus(wishlist.id), { headers: noStore });
  } catch {
    return Response.json({ error: "Status nicht verfügbar." }, { status: 500, headers: noStore });
  }
}
