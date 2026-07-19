import "server-only";

import { wishlist as fallbackWishlist, wishes as fallbackWishes, type ArtworkKind, type Wish } from "@/data/wishes";
import { getSupabaseAdmin, getWishlistId } from "@/lib/supabase-admin";

const artworks: ArtworkKind[] = ["bag", "towel", "thermometer", "monitor", "mobile", "nailfile", "pram", "blanket"];
const palettes: Wish["palette"][] = ["sand", "blue", "sage", "cream", "rose"];

function price(value: unknown, currency: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "Preis offen";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: typeof currency === "string" ? currency : "EUR" }).format(amount);
}

export async function getWishlistPageData() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { wishlist: fallbackWishlist, wishes: fallbackWishes };

  const wishlistId = getWishlistId();
  const [{ data: list, error: listError }, { data: rows, error: wishesError }] = await Promise.all([
    supabase.from("wishlists").select("title,intro").eq("id", wishlistId).maybeSingle(),
    supabase.from("wishes").select("id,title,description,product_url,image_url,price_amount,currency,shop_name,sort_order").eq("wishlist_id", wishlistId).is("archived_at", null).order("sort_order"),
  ]);
  if (listError || wishesError || !list || !rows) return { wishlist: fallbackWishlist, wishes: fallbackWishes };

  const wishes: Wish[] = rows.map((row, index) => ({
    id: row.id as string,
    title: row.title as string,
    price: price(row.price_amount, row.currency),
    shop: (row.shop_name as string | null) ?? "Wunsch",
    note: (row.description as string | null) ?? "",
    artwork: artworks[index % artworks.length],
    palette: palettes[index % palettes.length],
    productUrl: (row.product_url as string | null) ?? "#",
    imageUrl: (row.image_url as string | null) ?? null,
  }));
  return {
    wishlist: { ...fallbackWishlist, title: list.title as string, intro: (list.intro as string) || fallbackWishlist.intro },
    wishes,
  };
}
