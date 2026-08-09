import { NextRequest } from "next/server";
import { getAuthenticatedRoute, privateJson } from "@/lib/app-route-auth";

export const dynamic = "force-dynamic";
type WishlistExportRow = { wishlist_id: string };
type WishExportRow = { image_storage_path: string | null; image_url: string | null };

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRoute(request);
  if (!auth) return privateJson({ error: "Anmeldung erforderlich." }, 401);

  const [{ data: profile, error: profileError }, { data: lists, error: listError }] = await Promise.all([
    auth.supabase.from("profiles").select("display_name,created_at,updated_at").eq("user_id", auth.user.id).maybeSingle(),
    auth.supabase.rpc("get_my_wishlist_context_v1"),
  ]);
  if (profileError || listError) return auth.json({ error: "Der Datenexport ist gerade nicht verfügbar." }, 503);
  const listIds = ((lists ?? []) as WishlistExportRow[]).map((list) => list.wishlist_id);
  const { data: wishes, error: wishError } = listIds.length
    ? await auth.supabase.from("wishes").select("id,wishlist_id,title,description,product_url,image_url,image_storage_path,price_amount,currency,shop_name,sort_order,archived_at,created_at,updated_at").in("wishlist_id", listIds).order("sort_order")
    : { data: [], error: null };
  if (wishError) return auth.json({ error: "Der Datenexport ist gerade nicht verfügbar." }, 503);

  return auth.json({
    exportedAt: new Date().toISOString(),
    account: {
      email: auth.user.email ?? null,
      profile: profile ?? null,
    },
    memberships: lists ?? [],
    wishes: wishes ?? [],
    storageAssets: ((wishes ?? []) as WishExportRow[]).flatMap((wish) => wish.image_storage_path ? [{
      bucket: "product-images",
      path: wish.image_storage_path,
      publicUrl: wish.image_url,
    }] : []),
    note: "Dieser Export enthält deine Kontodaten, Listenmitgliedschaften, Wunschdaten und die zugehörigen Bildobjekte mit ihren Abruf-URLs. Reservierungsdaten anderer Personen sind nicht enthalten.",
  }, {
    headers: {
      "Content-Disposition": `attachment; filename="wunschlisten-daten-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
