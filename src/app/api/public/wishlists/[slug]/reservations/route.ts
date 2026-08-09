import { z } from "zod";
import { cancelPublicReservation, createPublicReservation } from "@/lib/reservations";
import { isFeatureEnabled } from "@/lib/app-config";
import { consumeRateLimit, getRequestClientKey } from "@/lib/rate-limit";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";
import { resolvePublicWishlistBySlug } from "@/lib/wishlist-data";

export const dynamic = "force-dynamic";

const slug = z.string().regex(/^[A-Za-z0-9_-]{22,128}$/);
const password = z.string().min(8).max(64);
const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{16,200}$/);
const reserveInput = z.object({ wishId: z.uuid(), guestName: z.string().trim().min(1).max(80), password, idempotencyKey }).strict();
const cancelInput = z.object({ wishId: z.uuid(), password });
const noStore = { "Cache-Control": "no-store" };
type RouteContext = { params: Promise<{ slug: string }> };

async function resolvePublishedWishlist(params: RouteContext["params"]) {
  const { slug: rawSlug } = await params;
  if (!slug.safeParse(rawSlug).success) return null;
  return resolvePublicWishlistBySlug(rawSlug);
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    if (!isFeatureEnabled("MULTI_WISHLIST_ENABLED")) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
    if (!isSameAppOrigin(request) || !isJsonRequest(request)) return Response.json({ error: "Ungültige Anfrage." }, { status: 403, headers: noStore });
    const clientKey = getRequestClientKey(request);
    const limit = await consumeRateLimit("public-reservation", clientKey, 10, 10 * 60);
    if (limit === false) return Response.json({ error: "Bitte warte einen Moment und versuche es dann erneut." }, { status: 429, headers: noStore });
    if (limit === null) return Response.json({ error: "Reservierungen sind kurzzeitig nicht verfügbar." }, { status: 503, headers: noStore });
    const [wishlist, body] = await Promise.all([resolvePublishedWishlist(params), request.json()]);
    if (!wishlist) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
    const parsed = reserveInput.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Bitte gib deinen Namen und ein Passwort mit mindestens 8 Zeichen ein." }, { status: 400, headers: noStore });

    const perWishLimit = await consumeRateLimit("public-reservation-wish", `${clientKey}:${wishlist.id}:${parsed.data.wishId}`, 3, 10 * 60);
    if (perWishLimit === false) return Response.json({ error: "Bitte warte einen Moment und versuche es dann erneut." }, { status: 429, headers: noStore });
    if (perWishLimit === null) return Response.json({ error: "Reservierungen sind kurzzeitig nicht verfügbar." }, { status: 503, headers: noStore });

    const result = await createPublicReservation(wishlist.id, parsed.data.wishId, parsed.data.guestName, parsed.data.password, parsed.data.idempotencyKey);
    if ("unavailable" in result) return Response.json({ error: "Der Wunsch ist nicht verfügbar." }, { status: 404, headers: noStore });
    if (result.conflict) return Response.json({ error: "Bereits reserviert." }, { status: 409, headers: noStore });
    return Response.json({ ok: true }, { status: 201, headers: noStore });
  } catch {
    return Response.json({ error: "Reservierung fehlgeschlagen." }, { status: 500, headers: noStore });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    if (!isFeatureEnabled("MULTI_WISHLIST_ENABLED")) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
    if (!isSameAppOrigin(request) || !isJsonRequest(request)) return Response.json({ error: "Ungültige Anfrage." }, { status: 403, headers: noStore });
    const clientKey = getRequestClientKey(request);
    const limit = await consumeRateLimit("public-cancel", clientKey, 10, 15 * 60);
    if (limit === false) return Response.json({ error: "Bitte warte einen Moment und versuche es dann erneut." }, { status: 429, headers: noStore });
    if (limit === null) return Response.json({ error: "Freigaben sind kurzzeitig nicht verfügbar." }, { status: 503, headers: noStore });
    const [wishlist, body] = await Promise.all([resolvePublishedWishlist(params), request.json()]);
    if (!wishlist) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
    const parsed = cancelInput.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Bitte gib das Reservierungspasswort ein." }, { status: 400, headers: noStore });

    const perWishLimit = await consumeRateLimit("public-cancel-wish", `${clientKey}:${wishlist.id}:${parsed.data.wishId}`, 10, 15 * 60);
    if (perWishLimit === false) return Response.json({ error: "Bitte warte einen Moment und versuche es dann erneut." }, { status: 429, headers: noStore });
    if (perWishLimit === null) return Response.json({ error: "Freigaben sind kurzzeitig nicht verfügbar." }, { status: 503, headers: noStore });

    const result = await cancelPublicReservation(wishlist.id, parsed.data.wishId, parsed.data.password);
    if ("unavailable" in result) return Response.json({ error: "Der Wunsch ist nicht verfügbar." }, { status: 404, headers: noStore });
    if (!result.cancelled) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return Response.json({ error: "Das Passwort ist nicht richtig." }, { status: 403, headers: noStore });
    }
    return Response.json({ ok: true }, { headers: noStore });
  } catch {
    return Response.json({ error: "Freigabe fehlgeschlagen." }, { status: 500, headers: noStore });
  }
}
