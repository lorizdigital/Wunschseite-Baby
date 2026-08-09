import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedRoute, privateJson } from "@/lib/app-route-auth";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";
const input = z.object({ displayName: z.string().trim().min(1).max(80) }).strict();

export async function PATCH(request: NextRequest) {
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return privateJson({ error: "Ungültige Anfrage." }, 403);
  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return auth.json({ error: "Ungültige Anfrage." }, 400); }
  const parsed = input.safeParse(body);
  if (!parsed.success) return auth.json({ error: "Bitte gib einen Namen mit höchstens 80 Zeichen ein." }, 400);
  const { data, error } = await auth.supabase.rpc("update_my_profile_v1", { p_display_name: parsed.data.displayName });
  if (error || !data?.[0]) return auth.json({ error: "Der Anzeigename konnte nicht gespeichert werden." }, 422);
  return auth.json({ profile: data[0] });
}
