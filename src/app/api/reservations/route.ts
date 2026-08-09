import { z } from "zod";
import { cancelMatsReservation, createMatsReservation } from "@/lib/reservations";
import { hasMatsAccess } from "@/lib/public-wishlist-access";
import { consumeRateLimit, getRequestClientKey } from "@/lib/rate-limit";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";

const password = z.string().min(4).max(64);
const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{16,200}$/);
const reserveInput = z.object({ wishId: z.uuid(), guestName: z.string().trim().min(1).max(80), password, idempotencyKey }).strict();
const cancelInput = z.object({ wishId: z.uuid(), password });
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    if (!await hasMatsAccess()) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
    if (!isSameAppOrigin(request) || !isJsonRequest(request)) return Response.json({ error: "Ungültige Anfrage." }, { status: 403, headers: noStore });
    const clientKey = getRequestClientKey(request);
    const limit = await consumeRateLimit("mats-reservation", clientKey, 10, 10 * 60);
    if (limit === false) return Response.json({ error: "Bitte warte einen Moment und versuche es dann erneut." }, { status: 429, headers: noStore });
    if (limit === null) return Response.json({ error: "Reservierungen sind kurzzeitig nicht verfügbar." }, { status: 503, headers: noStore });
    const parsed = reserveInput.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Bitte gib deinen Namen und ein Passwort mit mindestens 4 Zeichen ein." }, { status: 400, headers: noStore });
    const perWishLimit = await consumeRateLimit("mats-reservation-wish", `${clientKey}:${parsed.data.wishId}`, 3, 10 * 60);
    if (perWishLimit === false) return Response.json({ error: "Bitte warte einen Moment und versuche es dann erneut." }, { status: 429, headers: noStore });
    if (perWishLimit === null) return Response.json({ error: "Reservierungen sind kurzzeitig nicht verfügbar." }, { status: 503, headers: noStore });
    const result = await createMatsReservation(parsed.data.wishId, parsed.data.guestName, parsed.data.password, parsed.data.idempotencyKey);
    if ("unavailable" in result) return Response.json({ error: "Der Wunsch ist nicht verfügbar." }, { status: 404, headers: noStore });
    if (result.conflict) return Response.json({ error: "Bereits reserviert." }, { status: 409, headers: noStore });
    return Response.json({ mode: result.mode }, { status: 201, headers: noStore });
  } catch { return Response.json({ error: "Reservierung fehlgeschlagen." }, { status: 500, headers: noStore }); }
}

export async function DELETE(request: Request) {
  try {
    if (!await hasMatsAccess()) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
    if (!isSameAppOrigin(request) || !isJsonRequest(request)) return Response.json({ error: "Ungültige Anfrage." }, { status: 403, headers: noStore });
    const clientKey = getRequestClientKey(request);
    const limit = await consumeRateLimit("mats-cancel", clientKey, 10, 15 * 60);
    if (limit === false) return Response.json({ error: "Bitte warte einen Moment und versuche es dann erneut." }, { status: 429, headers: noStore });
    if (limit === null) return Response.json({ error: "Freigaben sind kurzzeitig nicht verfügbar." }, { status: 503, headers: noStore });
    const parsed = cancelInput.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Bitte gib das Reservierungspasswort ein." }, { status: 400, headers: noStore });
    const perWishLimit = await consumeRateLimit("mats-cancel-wish", `${clientKey}:${parsed.data.wishId}`, 10, 15 * 60);
    if (perWishLimit === false) return Response.json({ error: "Bitte warte einen Moment und versuche es dann erneut." }, { status: 429, headers: noStore });
    if (perWishLimit === null) return Response.json({ error: "Freigaben sind kurzzeitig nicht verfügbar." }, { status: 503, headers: noStore });
    const result = await cancelMatsReservation(parsed.data.wishId, parsed.data.password);
    if ("unavailable" in result) return Response.json({ error: "Der Wunsch ist nicht verfügbar." }, { status: 404, headers: noStore });
    if (!result.cancelled) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return Response.json({ error: "Das Passwort ist nicht richtig." }, { status: 403, headers: noStore });
    }
    return Response.json(result, { headers: noStore });
  } catch { return Response.json({ error: "Freigabe fehlgeschlagen." }, { status: 500, headers: noStore }); }
}
