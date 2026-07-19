import { getReservationStatus } from "@/lib/reservations";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json(await getReservationStatus(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Status nicht verfügbar." }, { status: 500 }); }
}
