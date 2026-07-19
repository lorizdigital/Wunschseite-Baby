import { z } from "zod";
import { cancelReservation, createReservation } from "@/lib/reservations";

const password = z.string().min(4).max(64);
const reserveInput = z.object({ wishId: z.uuid(), guestName: z.string().trim().min(1).max(80), password });
const cancelInput = z.object({ wishId: z.uuid(), password });
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const parsed = reserveInput.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Bitte gib deinen Namen und ein Passwort mit mindestens 4 Zeichen ein." }, { status: 400, headers: noStore });
    const result = await createReservation(parsed.data.wishId, parsed.data.guestName, parsed.data.password);
    if (result.conflict) return Response.json({ error: "Bereits reserviert." }, { status: 409, headers: noStore });
    return Response.json({ mode: result.mode }, { status: 201, headers: noStore });
  } catch { return Response.json({ error: "Reservierung fehlgeschlagen." }, { status: 500, headers: noStore }); }
}

export async function DELETE(request: Request) {
  try {
    const parsed = cancelInput.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Bitte gib das Reservierungspasswort ein." }, { status: 400, headers: noStore });
    const result = await cancelReservation(parsed.data.wishId, parsed.data.password);
    if (!result.cancelled) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return Response.json({ error: "Das Passwort ist nicht richtig." }, { status: 403, headers: noStore });
    }
    return Response.json(result, { headers: noStore });
  } catch { return Response.json({ error: "Freigabe fehlgeschlagen." }, { status: 500, headers: noStore }); }
}
