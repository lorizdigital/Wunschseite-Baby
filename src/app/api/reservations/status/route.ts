import { getMatsReservationStatus } from "@/lib/reservations";
import { hasMatsAccess } from "@/lib/public-wishlist-access";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!await hasMatsAccess()) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  try { return Response.json(await getMatsReservationStatus(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Status nicht verfügbar." }, { status: 500 }); }
}
