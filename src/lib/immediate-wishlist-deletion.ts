import "server-only";

import { NextRequest } from "next/server";
import { z } from "zod";
import { wishlistIdSchema } from "@/lib/app-wishlist-data";
import { getAuthenticatedRoute, privateJson } from "@/lib/app-route-auth";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const immediateDeletionSchema = z.object({
  action: z.literal("delete_immediately").optional(),
  expectedTitle: z.string().trim().min(1).max(180),
}).strict();

export async function deleteWishlistImmediately(request: NextRequest, id: string) {
  if (!wishlistIdSchema.safeParse(id).success) return privateJson({ error: "Nicht gefunden." }, 404);
  if (!isSameAppOrigin(request) || !isJsonRequest(request)) return privateJson({ error: "Ungültige Anfrage." }, 403);
  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);

  const parsed = immediateDeletionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return auth.json({ error: "Gib zur Bestätigung den exakten Listentitel ein." }, 400);

  const { data, error } = await auth.supabase.rpc("delete_wishlist_immediately_v1", {
    p_wishlist_id: id,
    p_expected_title: parsed.data.expectedTitle,
  });
  if (error || data !== id) {
    const message = error?.message?.includes("wishlist_title_mismatch")
      ? "Der eingegebene Titel stimmt nicht mit dem Listentitel überein."
      : "Die Liste konnte nicht endgültig gelöscht werden.";
    return auth.json({ error: message }, 422);
  }

  // Storage is not transactional with PostgreSQL. The RPC has already placed
  // every object in the durable queue; this is only the immediate best-effort
  // pass. A failed removal is retried by the scheduled cleanup endpoint.
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data: queued } = await admin
      .from("storage_deletion_queue")
      .select("id,object_path")
      .eq("bucket", "product-images")
      .like("object_path", `${id}/%`)
      .is("completed_at", null);
    if (queued?.length) {
      const queueIds = queued.map((entry) => entry.id as string);
      await admin.from("storage_deletion_queue").update({ last_attempt_at: new Date().toISOString() }).in("id", queueIds);
      const { error: storageError } = await admin.storage.from("product-images").remove(queued.map((entry) => entry.object_path as string));
      if (!storageError) {
        await admin.from("storage_deletion_queue").update({ completed_at: new Date().toISOString() }).in("id", queueIds);
      } else {
        console.error("Immediate wishlist storage cleanup failed", { wishlistId: id });
      }
    }
  }

  return auth.json({ deleted: true });
}
