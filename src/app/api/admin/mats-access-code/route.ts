import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { createStoredMatsAccessCodeHash } from "@/lib/public-wishlist-access";
import { getSupabaseAdmin, MATS_WISHLIST_ID } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const input = z.object({ accessCode: z.string().trim().min(8).max(64) }).strict();

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return Response.json({ error: "Der Admin-Code fehlt oder ist falsch." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Ungültige Anfrage." }, { status: 400 }); }
  const parsed = input.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Der Zugangscode muss 8 bis 64 Zeichen lang sein." }, { status: 400 });

  const accessCodeHash = createStoredMatsAccessCodeHash(parsed.data.accessCode);
  const supabase = getSupabaseAdmin();
  if (!accessCodeHash || !supabase) return Response.json({ error: "Der Zugangscode kann gerade nicht gespeichert werden." }, { status: 503 });

  const { error } = await supabase
    .from("wishlists")
    .update({ access_code_hash: accessCodeHash, access_code_version: randomUUID(), visibility: "access_code", updated_at: new Date().toISOString() })
    .eq("id", MATS_WISHLIST_ID);
  if (error) return Response.json({ error: "Der Zugangscode konnte nicht gespeichert werden." }, { status: 422 });
  return Response.json({ accessCodeSet: true });
}
