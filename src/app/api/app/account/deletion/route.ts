import { NextRequest } from "next/server";
import { getAuthenticatedRoute, privateJson } from "@/lib/app-route-auth";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return privateJson({ error: "Ungültige Anfrage." }, 403);
  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);
  try { await request.json(); } catch { return auth.json({ error: "Ungültige Anfrage." }, 400); }

  const { data, error } = await auth.supabase.rpc("request_profile_deletion_v1");
  if (error || !data) return auth.json({ error: "Bitte übergib zuerst alle Owner-Rollen an eine andere Person. Danach kannst du den Löschantrag erneut stellen." }, 422);
  return auth.json({ deleteAfter: data });
}
