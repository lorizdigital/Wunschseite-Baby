import { z } from "zod";
import { isFeatureEnabled } from "@/lib/app-config";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getAuthenticatedSupabaseUser } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };
const createInput = z.object({
  title: z.string().trim().min(1).max(180),
  intro: z.string().trim().max(2000),
  displayName: z.string().trim().min(1).max(80),
}).strict();

export async function GET() {
  if (!isFeatureEnabled("MULTI_WISHLIST_ENABLED")) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
  const auth = await getAuthenticatedSupabaseUser();
  if (!auth) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401, headers: noStore });
  const { data, error } = await auth.supabase.rpc("get_my_wishlist_context_v1");
  if (error) return Response.json({ error: "Listen konnten nicht geladen werden." }, { status: 403, headers: noStore });
  return Response.json({ lists: data ?? [] }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!isFeatureEnabled("MULTI_WISHLIST_ENABLED")) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
  if (!isFeatureEnabled("SELF_SERVICE_SIGNUP_ENABLED")) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return Response.json({ error: "Ungültige Anfrage." }, { status: 403, headers: noStore });

  const auth = await getAuthenticatedSupabaseUser();
  if (!auth) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401, headers: noStore });

  const limit = await consumeRateLimit("wishlist-create", auth.user.id, 3, 24 * 60 * 60);
  if (limit === false) return Response.json({ error: "Bitte warte etwas, bevor du eine weitere Liste anlegst." }, { status: 429, headers: noStore });
  if (limit === null) return Response.json({ error: "Die Listenerstellung ist kurzzeitig nicht verfügbar." }, { status: 503, headers: noStore });

  const parsed = createInput.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Die Listenangaben sind ungültig." }, { status: 400, headers: noStore });

  const { data, error } = await auth.supabase.rpc("create_wishlist_v1", {
    p_title: parsed.data.title,
    p_intro: parsed.data.intro,
    p_display_name: parsed.data.displayName,
  });
  if (error || !data?.[0]) return Response.json({ error: "Die Liste konnte nicht angelegt werden." }, { status: 422, headers: noStore });
  return Response.json({ list: data[0] }, { status: 201, headers: noStore });
}
