import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { internalNoStore as noStore, isInternalRequestAuthorized } from "@/lib/internal-route-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isInternalRequestAuthorized(request)) return Response.json({ error: "Nicht gefunden." }, { status: 404, headers: noStore });
  const supabase = getSupabaseAdmin();
  if (!supabase) return Response.json({ error: "Nicht verfügbar." }, { status: 503, headers: noStore });

  const { data: dueLists, error: dueListsError } = await supabase
    .from("wishlists")
    .select("id")
    .not("archived_at", "is", null)
    .lte("delete_after", new Date().toISOString())
    .limit(100);
  if (dueListsError) return Response.json({ error: "Der Löschlauf konnte nicht vorbereitet werden." }, { status: 500, headers: noStore });

  const ids = (dueLists ?? []).map((list) => list.id as string);

  const [{ data: operational, error: operationalError }, { data: deletedLists, error: deleteError }] = await Promise.all([
    supabase.rpc("purge_expired_operational_data_v1", { p_batch_size: 1000 }),
    ids.length ? supabase.rpc("purge_due_wishlists_v2", { p_wishlist_ids: ids }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (operationalError || deleteError) return Response.json({ error: "Der Löschlauf konnte nicht abgeschlossen werden." }, { status: 500, headers: noStore });

  const { data: pendingStorage, error: pendingStorageError } = await supabase
    .from("storage_deletion_queue")
    .select("id,bucket,object_path")
    .is("completed_at", null)
    .order("created_at")
    .limit(100);
  if (pendingStorageError) return Response.json({ error: "Die Bildbereinigung konnte nicht vorbereitet werden." }, { status: 500, headers: noStore });

  const productImages = (pendingStorage ?? []).filter((entry) => entry.bucket === "product-images" && typeof entry.object_path === "string");
  if (productImages.length) {
    const queueIds = productImages.map((entry) => entry.id as string);
    const { error: attemptError } = await supabase.from("storage_deletion_queue").update({ last_attempt_at: new Date().toISOString() }).in("id", queueIds);
    if (attemptError) return Response.json({ error: "Die Bildbereinigung wird beim nächsten Löschlauf erneut versucht." }, { status: 503, headers: noStore });
    const { error: storageError } = await supabase.storage.from("product-images").remove(productImages.map((entry) => entry.object_path as string));
    if (storageError) return Response.json({ error: "Die Produktbilder werden beim nächsten Löschlauf erneut versucht." }, { status: 503, headers: noStore });
    const { error: completionError } = await supabase.from("storage_deletion_queue").update({ completed_at: new Date().toISOString() }).in("id", queueIds);
    if (completionError) return Response.json({ error: "Die Bildbereinigung wird beim nächsten Löschlauf erneut versucht." }, { status: 503, headers: noStore });
  }

  return Response.json({
    operational: operational?.[0] ?? null,
    deletedWishlists: deletedLists?.length ?? 0,
    deletedStorageObjects: productImages.length,
  }, { headers: noStore });
}
