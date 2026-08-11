import { NextResponse, type NextRequest } from "next/server";
import { getAppOrigin } from "@/lib/app-config";
import { isSameAppFormSubmission } from "@/lib/request-security";
import { createSupabaseRouteClient } from "@/lib/supabase-route-client";

export async function POST(request: NextRequest) {
  if (!isSameAppFormSubmission(request)) return Response.json({ error: "Ungültige Anfrage." }, { status: 403, headers: { "Cache-Control": "no-store" } });

  const client = createSupabaseRouteClient(request);
  if (client) await client.supabase.auth.signOut({ scope: "local" });
  const response = NextResponse.redirect(new URL("/login?logged_out=1", getAppOrigin()), 303);
  response.headers.set("Cache-Control", "private, no-store");
  return client ? client.applySession(response) : response;
}
