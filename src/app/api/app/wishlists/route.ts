import { z } from "zod";
import { isFeatureEnabled } from "@/lib/app-config";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getAuthenticatedSupabaseUser } from "@/lib/supabase-user";
import { ACCESS_CODE_MAX_LENGTH, ACCESS_CODE_MIN_LENGTH } from "@/lib/access-code";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };
const createInput = z.object({
  title: z.string().trim().min(1).max(180),
  intro: z.string().trim().max(2000),
  displayName: z.string().trim().min(1).max(80),
  accessCode: z.string().trim().min(ACCESS_CODE_MIN_LENGTH).max(ACCESS_CODE_MAX_LENGTH),
}).strict();

export async function GET() {
  if (!isFeatureEnabled("MULTI_WISHLIST_ENABLED")) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
  const auth = await getAuthenticatedSupabaseUser();
  if (!auth) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401, headers: noStore });
  const { data, error } = await auth.supabase.rpc("get_my_wishlist_context_v1");
  if (error) {
    console.error("get_my_wishlist_context_v1 failed", { code: error.code });
    return Response.json({ error: "Listen konnten nicht geladen werden." }, { status: 403, headers: noStore });
  }
  return Response.json({ lists: data ?? [] }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!isFeatureEnabled("MULTI_WISHLIST_ENABLED")) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return Response.json({ error: "Ungültige Anfrage." }, { status: 403, headers: noStore });

  const auth = await getAuthenticatedSupabaseUser();
  if (!auth) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401, headers: noStore });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Ungültige Anfrage." }, { status: 400, headers: noStore }); }
  const parsed = createInput.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Die Listenangaben sind ungültig." }, { status: 400, headers: noStore });

  const limit = await consumeRateLimit("wishlist-create", auth.user.id, 3, 24 * 60 * 60);
  if (limit === false) return Response.json({ error: "Bitte warte etwas, bevor du eine weitere Liste anlegst." }, { status: 429, headers: noStore });
  if (limit === null) return Response.json({ error: "Die Listenerstellung ist kurzzeitig nicht verfügbar." }, { status: 503, headers: noStore });

  const { data, error } = await auth.supabase.rpc("create_wishlist_v2", {
    p_title: parsed.data.title,
    p_intro: parsed.data.intro,
    p_display_name: parsed.data.displayName,
    p_access_code: parsed.data.accessCode,
  });
  if (error || !data?.[0]) {
    console.error("create_wishlist_v2 failed", { code: error?.code ?? "missing_result" });
    return Response.json({ error: "Die Liste konnte nicht angelegt werden." }, { status: 422, headers: noStore });
  }
  return Response.json({ list: data[0] }, { status: 201, headers: noStore });
}
