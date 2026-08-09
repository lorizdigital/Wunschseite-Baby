import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WishlistExperience } from "@/components/wishlist-experience";
import { isFeatureEnabled } from "@/lib/app-config";
import { PRODUCT_NAME } from "@/lib/brand";
import { getPublicWishlistPageData } from "@/lib/wishlist-data";

export const dynamic = "force-dynamic";

type PublicWishlistPageProps = { params: Promise<{ publicSlug: string }> };

export async function generateMetadata({ params }: PublicWishlistPageProps): Promise<Metadata> {
  if (!isFeatureEnabled("MULTI_WISHLIST_ENABLED")) return { title: "Wunschliste nicht gefunden", robots: { index: false, follow: false, noarchive: true } };
  const { publicSlug } = await params;
  const data = await getPublicWishlistPageData(publicSlug);
  if (!data) return { title: "Wunschliste nicht gefunden", robots: { index: false, follow: false, noarchive: true } };

  return {
    title: `${data.wishlist.title} | ${PRODUCT_NAME}`,
    description: data.wishlist.intro || `Private Wunschliste mit ${PRODUCT_NAME}`,
    robots: { index: false, follow: false, noarchive: true },
  };
}

export default async function PublicWishlistPage({ params }: PublicWishlistPageProps) {
  if (!isFeatureEnabled("MULTI_WISHLIST_ENABLED")) notFound();
  const { publicSlug } = await params;
  const data = await getPublicWishlistPageData(publicSlug);
  if (!data) notFound();

  const apiBase = `/api/public/wishlists/${encodeURIComponent(data.publicSlug)}`;
  return (
    <WishlistExperience
      wishlist={data.wishlist}
      wishes={data.wishes}
      brandName={PRODUCT_NAME}
      reservationPasswordMinLength={8}
      showMode={false}
      api={{ statusUrl: `${apiBase}/status`, reservationsUrl: `${apiBase}/reservations` }}
    />
  );
}
