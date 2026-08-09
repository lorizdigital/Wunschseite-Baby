import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WishlistExperience } from "@/components/wishlist-experience";
import { AccessCodeGate } from "@/components/access-code-gate";
import { isFeatureEnabled } from "@/lib/app-config";
import { createAccessFormToken } from "@/lib/access-form-token";
import { PRODUCT_NAME } from "@/lib/brand";
import { getPublicWishlistPageData } from "@/lib/wishlist-data";
import { hasPublicWishlistAccess } from "@/lib/public-wishlist-access";

export const dynamic = "force-dynamic";

type PublicWishlistPageProps = { params: Promise<{ publicSlug: string }>; searchParams: Promise<{ access?: string }> };

export function generateMetadata(): Metadata {
  return {
    title: `Private Wunschliste | ${PRODUCT_NAME}`,
    description: `Geschützte private Wunschliste mit ${PRODUCT_NAME}`,
    robots: { index: false, follow: false, noarchive: true },
  };
}

export default async function PublicWishlistPage({ params, searchParams }: PublicWishlistPageProps) {
  if (!isFeatureEnabled("MULTI_WISHLIST_ENABLED")) notFound();
  const { publicSlug } = await params;
  const { access } = await searchParams;
  if (!await hasPublicWishlistAccess(publicSlug)) {
    const requestToken = createAccessFormToken(publicSlug);
    return <AccessCodeGate action={`/api/public/wishlists/${encodeURIComponent(publicSlug)}/access`} requestToken={requestToken ?? ""} state={requestToken ? access : "unavailable"} />;
  }
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
