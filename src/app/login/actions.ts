"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { getAppOrigin, isFeatureEnabled } from "@/lib/app-config";
import { consumeRateLimit, getRequestClientKey } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthCallbackUrl, getSafeAuthNext, createSupabaseUserClient } from "@/lib/supabase-user";

export type LoginState = { message?: string; error?: string };

const loginInput = z.object({ email: z.string().trim().toLowerCase().email().max(320), next: z.string().optional() });

async function provisionPendingInviteAccount(email: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { data: invitations, error } = await admin
    .from("wishlist_invitations")
    .select("id")
    .eq("email_normalized", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (error || !invitations?.length) return;

  // Auth registration remains disabled for the public key. This service-only
  // path creates an account only after a concrete, unexpired invitation exists.
  await admin.auth.admin.createUser({ email, email_confirm: true });
}

export async function requestMagicLink(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginInput.safeParse({ email: formData.get("email"), next: formData.get("next") });
  if (!parsed.success) return { error: "Bitte gib eine gültige E-Mail-Adresse ein." };

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin && origin !== getAppOrigin()) return { error: "Die Anfrage konnte nicht geprüft werden." };
  const rateLimit = await consumeRateLimit("magic-link", getRequestClientKey(new Request(getAppOrigin(), { headers: requestHeaders })), 5, 15 * 60);
  if (rateLimit === false) return { error: "Bitte warte einen Moment, bevor du einen weiteren Link anforderst." };
  if (rateLimit === null) return { error: "Die Anmeldung ist gerade kurzzeitig nicht verfügbar." };

  const supabase = await createSupabaseUserClient();
  if (!supabase) return { error: "Die Anmeldung ist noch nicht eingerichtet." };

  const selfServiceEnabled = isFeatureEnabled("SELF_SERVICE_SIGNUP_ENABLED");
  if (!selfServiceEnabled) await provisionPendingInviteAccount(parsed.data.email);

  await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: getAuthCallbackUrl(getSafeAuthNext(parsed.data.next)),
      shouldCreateUser: selfServiceEnabled,
    },
  });

  return { message: "Falls die E-Mail-Adresse erreichbar ist, erhältst du gleich einen sicheren Anmeldelink." };
}
