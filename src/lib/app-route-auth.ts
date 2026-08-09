import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase-route-client";

const noStore = { "Cache-Control": "private, no-store" };

type RouteClient = NonNullable<ReturnType<typeof createSupabaseRouteClient>>;

export type AuthenticatedRoute = {
  user: { id: string; email?: string | null };
  supabase: RouteClient["supabase"];
  json: (payload: unknown, init?: number | ResponseInit) => NextResponse;
};

function responseInit(init?: number | ResponseInit): ResponseInit {
  if (typeof init === "number") return { status: init, headers: noStore };
  const headers = new Headers(init?.headers);
  Object.entries(noStore).forEach(([name, value]) => headers.set(name, value));
  return { ...init, headers };
}

/** Validates the Supabase JWT server-side and keeps any refreshed cookies private. */
export async function getAuthenticatedRoute(request: NextRequest): Promise<AuthenticatedRoute | null> {
  const routeClient = createSupabaseRouteClient(request);
  if (!routeClient) return null;

  const { data, error } = await routeClient.supabase.auth.getUser();
  if (error || !data.user) return null;

  return {
    user: data.user,
    supabase: routeClient.supabase,
    json(payload, init) {
      return routeClient.applySession(NextResponse.json(payload, responseInit(init)));
    },
  };
}

export function privateJson(payload: unknown, init?: number | ResponseInit) {
  return NextResponse.json(payload, responseInit(init));
}
