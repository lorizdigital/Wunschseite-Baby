import { getMatsReservationStatus } from "@/lib/reservations";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json(await getMatsReservationStatus(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Status nicht verfügbar." }, { status: 500 }); }
}
