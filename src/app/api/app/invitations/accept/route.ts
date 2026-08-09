import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedRoute, privateJson } from "@/lib/app-route-auth";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const acceptInput = z.object({
  token: z.string().min(32).max(512),
  displayName: z.string().trim().min(1).max(80).optional(),
}).strict();

export async function POST(request: NextRequest) {
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return privateJson({ error: "Ungültige Anfrage." }, 403);
  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return auth.json({ error: "Ungültige Anfrage." }, 400); }
  const parsed = acceptInput.safeParse(body);
  if (!parsed.success) return auth.json({ error: "Der Einladungslink ist ungültig." }, 400);

  const { data, error } = await auth.supabase.rpc("accept_wishlist_invitation_v1", {
    p_invitation_token: parsed.data.token,
    p_display_name: parsed.data.displayName ?? null,
  });
  if (error || !data?.[0]) return auth.json({ error: "Diese Einladung ist nicht mehr verfügbar." }, 422);
  return auth.json({ wishlist: data[0] });
}
