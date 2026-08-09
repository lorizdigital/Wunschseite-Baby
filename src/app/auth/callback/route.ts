import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase-route-client";
import { getSafeAuthNext } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const client = createSupabaseRouteClient(request);
  if (!client) return NextResponse.redirect(new URL("/login?auth=unavailable", request.url));

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return client.applySession(NextResponse.redirect(new URL("/login?auth=invalid", request.url)));

  const { error } = await client.supabase.auth.exchangeCodeForSession(code);
  const target = error ? "/login?auth=failed" : getSafeAuthNext(request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(target, request.url));
  response.headers.set("Referrer-Policy", "no-referrer");
  return client.applySession(response);
}
