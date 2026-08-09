import "server-only";

import { z } from "zod";
import { getAuthenticatedSupabaseUser } from "@/lib/supabase-user";

export const wishlistIdSchema = z.uuid();

export type AppWishlist = {
  id: string;
  title: string;
  intro: string;
  publicSlug: string | null;
  visibility: "unlisted" | "access_code";
  publishedAt: string | null;
  archivedAt: string | null;
  deleteAfter: string | null;
  role: "owner" | "editor" | "viewer";
};

export type AppWish = {
  id: string;
  title: string;
  description: string;
  productUrl: string | null;
  imageUrl: string | null;
  priceAmount: number | null;
  currency: string;
  shopName: string;
  sortOrder: number;
  archivedAt: string | null;
};

export type AppWishlistMember = {
  userId: string;
  displayName: string;
  role: "owner" | "editor" | "viewer";
  createdAt: string;
};

type WishlistMemberRow = {
  user_id: string;
  display_name: string;
  member_role: AppWishlistMember["role"];
  membership_created_at: string;
};

export async function getAppWishlistDetail(wishlistId: string) {
  if (!wishlistIdSchema.safeParse(wishlistId).success) return null;
  const auth = await getAuthenticatedSupabaseUser();
  if (!auth) return null;

  const [{ data: list, error: listError }, { data: roleRow, error: roleError }, { data: wishes, error: wishesError }] = await Promise.all([
    auth.supabase.from("wishlists").select("id,title,intro,public_slug,visibility,published_at,archived_at,delete_after").eq("id", wishlistId).maybeSingle(),
    auth.supabase.from("wishlist_members").select("role").eq("wishlist_id", wishlistId).eq("user_id", auth.user.id).maybeSingle(),
    auth.supabase.from("wishes").select("id,title,description,product_url,image_url,price_amount,currency,shop_name,sort_order,archived_at").eq("wishlist_id", wishlistId).order("sort_order"),
  ]);

  if (listError || roleError || wishesError || !list || !roleRow) return null;
  const role = roleRow.role as AppWishlist["role"];
  if (role !== "owner" && role !== "editor" && role !== "viewer") return null;

  let members: AppWishlistMember[] = [];
  if (role === "owner") {
    const { data: memberRows, error: memberError } = await auth.supabase.rpc("get_wishlist_members_v1", { p_wishlist_id: wishlistId });
    if (memberError) return null;
    members = ((memberRows ?? []) as WishlistMemberRow[]).map((member) => ({
      userId: member.user_id,
      displayName: member.display_name,
      role: member.member_role,
      createdAt: member.membership_created_at,
    }));
  }

  return {
    user: auth.user,
    wishlist: {
      id: list.id as string,
      title: list.title as string,
      intro: (list.intro as string | null) ?? "",
      publicSlug: (list.public_slug as string | null) ?? null,
      visibility: (list.visibility as AppWishlist["visibility"]) ?? "unlisted",
      publishedAt: (list.published_at as string | null) ?? null,
      archivedAt: (list.archived_at as string | null) ?? null,
      deleteAfter: (list.delete_after as string | null) ?? null,
      role,
    } satisfies AppWishlist,
    wishes: (wishes ?? []).map((wish) => ({
      id: wish.id as string,
      title: wish.title as string,
      description: (wish.description as string | null) ?? "",
      productUrl: (wish.product_url as string | null) ?? null,
      imageUrl: (wish.image_url as string | null) ?? null,
      priceAmount: wish.price_amount === null ? null : Number(wish.price_amount),
      currency: (wish.currency as string | null) ?? "EUR",
      shopName: (wish.shop_name as string | null) ?? "Wunsch",
      sortOrder: Number(wish.sort_order),
      archivedAt: (wish.archived_at as string | null) ?? null,
    } satisfies AppWish)),
    members,
  };
}
