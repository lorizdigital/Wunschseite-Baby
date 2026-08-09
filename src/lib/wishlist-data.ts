import "server-only";

import type { ArtworkKind, Wish } from "@/data/wishes";
import { getSupabaseAdmin, MATS_WISHLIST_ID } from "@/lib/supabase-admin";
import { hasMatsAccess, hasPublicWishlistAccess } from "@/lib/public-wishlist-access";

const artworks: ArtworkKind[] = ["bag", "towel", "thermometer", "monitor", "mobile", "nailfile", "pram", "blanket"];
const palettes: Wish["palette"][] = ["sand", "blue", "sage", "cream", "rose"];

export type WishlistPageData = {
  wishlist: { title: string; intro: string; note: string };
  wishes: Wish[];
};

export type PublicWishlistPageData = WishlistPageData & {
  wishlistId: string;
  publicSlug: string;
};

type PublicWishlistContext = {
  id: string;
  publicSlug: string;
};

type PublicWishlistPageRow = {
  wishlist_id: string;
  public_slug: string;
  title: string;
  intro: string;
  wishes: Record<string, unknown>[];
};

function price(value: unknown, currency: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "Preis offen";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: typeof currency === "string" ? currency : "EUR" }).format(amount);
}

function mapWishes(rows: Record<string, unknown>[]): Wish[] {
  return rows.map((row, index) => ({
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
}

export async function getMatsWishlistPageData(): Promise<WishlistPageData | null> {
  if (!await hasMatsAccess()) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("get_published_wishlist_page_v1", { p_wishlist_id: MATS_WISHLIST_ID });
  const list = Array.isArray(data) ? data[0] as PublicWishlistPageRow | undefined : undefined;
  if (error || !list || !Array.isArray(list.wishes)) return null;

  return {
    wishlist: {
      title: list.title,
      intro: list.intro || "Unsere Baby-Wunschliste",
      note: "Reserviere einen Wunsch, damit sich niemand doppelt darum kümmert.",
    },
    wishes: mapWishes(list.wishes),
  };
}

/** Resolves only a published, non-archived public list. There is no fallback. */
export async function resolvePublicWishlistBySlug(publicSlug: string): Promise<PublicWishlistContext | null> {
  if (!await hasPublicWishlistAccess(publicSlug)) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase || !/^[A-Za-z0-9_-]{22,128}$/.test(publicSlug)) return null;

  const { data, error } = await supabase.rpc("get_public_wishlist_context_v1", { p_public_slug: publicSlug });
  const context = Array.isArray(data) ? data[0] as { wishlist_id: string; public_slug: string } | undefined : undefined;

  if (error || !context || context.public_slug !== publicSlug) return null;
  return { id: context.wishlist_id, publicSlug: context.public_slug };
}

/**
 * Public routes fail closed: a database error, unknown slug, draft, or archived
 * list all resolve to null and can never render Mats' fallback data.
 */
export async function getPublicWishlistPageData(publicSlug: string): Promise<PublicWishlistPageData | null> {
  if (!await hasPublicWishlistAccess(publicSlug)) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase || !/^[A-Za-z0-9_-]{22,128}$/.test(publicSlug)) return null;

  const { data, error } = await supabase.rpc("get_public_wishlist_page_v1", { p_public_slug: publicSlug });
  const list = Array.isArray(data) ? data[0] as PublicWishlistPageRow | undefined : undefined;

  if (error || !list || list.public_slug !== publicSlug || !Array.isArray(list.wishes)) return null;
  return {
    wishlistId: list.wishlist_id,
    publicSlug: list.public_slug,
    wishlist: {
      title: list.title,
      intro: list.intro || "",
      note: "Zum Reservieren brauchst du kein Konto.",
    },
    wishes: mapWishes(list.wishes),
  };
}
