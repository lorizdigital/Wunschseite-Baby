import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { releaseMatsReservationAsAdmin } from "@/lib/reservations";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

/** Hebt eine offene Reservierung ohne Passwort auf – für Gäste, die ihres vergessen haben. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return Response.json({ error: "Der Admin-Code fehlt oder ist falsch." }, { status: 401, headers: noStore });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "Der Wunsch ist ungültig." }, { status: 400, headers: noStore });
  try {
    const result = await releaseMatsReservationAsAdmin(id);
    if ("unavailable" in result) return Response.json({ error: "Der Wunsch wurde nicht gefunden." }, { status: 404, headers: noStore });
    return Response.json({ released: result.released }, { headers: noStore });
  } catch (reason) {
    return Response.json({ error: reason instanceof Error ? reason.message : "Die Reservierung konnte nicht aufgehoben werden." }, { status: 422, headers: noStore });
  }
}
