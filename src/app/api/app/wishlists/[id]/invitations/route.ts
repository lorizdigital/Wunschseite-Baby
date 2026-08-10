import { randomBytes, createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getAppOrigin } from "@/lib/app-config";
import { wishlistIdSchema } from "@/lib/app-wishlist-data";
import { getAuthenticatedRoute, privateJson } from "@/lib/app-route-auth";
import { sendInvitationEmail } from "@/lib/brevo";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const inviteInput = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["owner", "editor", "viewer"]),
}).strict();

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!wishlistIdSchema.safeParse(id).success) return privateJson({ error: "Nicht gefunden." }, 404);
  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);

  const { data, error } = await auth.supabase
    .from("wishlist_invitations")
    .select("id,email_normalized,role,expires_at,accepted_at,revoked_at,created_at")
    .eq("wishlist_id", id)
    .order("created_at", { ascending: false });
  if (error) return auth.json({ error: "Einladungen konnten nicht geladen werden." }, 403);
  return auth.json({ invitations: data ?? [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!wishlistIdSchema.safeParse(id).success) return privateJson({ error: "Nicht gefunden." }, 404);
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return privateJson({ error: "Ungültige Anfrage." }, 403);
  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);

  let body: unknown;
  try { body = await request.json(); } catch { return auth.json({ error: "Ungültige Anfrage." }, 400); }
  const parsed = inviteInput.safeParse(body);
  if (!parsed.success) return auth.json({ error: "Die Einladung ist ungültig." }, 400);

  const { data: wishlist, error: wishlistError } = await auth.supabase
    .from("wishlists")
    .select("title")
    .eq("id", id)
    .maybeSingle();
  if (wishlistError || !wishlist) return auth.json({ error: "Die Wunschliste wurde nicht gefunden." }, 404);

  const token = randomBytes(32).toString("base64url");
  const tokenHash = `\\x${createHash("sha256").update(token).digest("hex")}`;
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const { data, error } = await auth.supabase.rpc("create_wishlist_invitation_v1", {
    p_wishlist_id: id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });
  if (error || !data?.[0]) return auth.json({ error: "Die Einladung konnte nicht erstellt werden." }, 422);

  const acceptUrl = `${getAppOrigin()}/einladung/${encodeURIComponent(token)}`;
  const emailStatus = await sendInvitationEmail({
    recipientEmail: parsed.data.email.trim().toLowerCase(),
    wishlistTitle: String(wishlist.title ?? ""),
    role: parsed.data.role,
    acceptUrl,
  });

  return auth.json({
    invitation: data[0],
    acceptUrl,
    emailStatus,
  }, 201);
}
