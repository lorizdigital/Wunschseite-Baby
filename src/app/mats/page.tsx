import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WishlistExperience } from "@/components/wishlist-experience";
import { AccessCodeGate } from "@/components/access-code-gate";
import { PRODUCT_NAME } from "@/lib/brand";
import { hasMatsAccess } from "@/lib/public-wishlist-access";
import { getMatsWishlistPageData } from "@/lib/wishlist-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Private Wunschliste | ${PRODUCT_NAME}`,
  description: "Geschützte private Wunschliste.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function MatsWishlistPage({ searchParams }: { searchParams: Promise<{ access?: string }> }) {
  const { access } = await searchParams;
  if (!await hasMatsAccess()) return <AccessCodeGate action="/api/mats/access" state={access} />;
  const data = await getMatsWishlistPageData();
  if (!data) notFound();
  return <WishlistExperience wishlist={data.wishlist} wishes={data.wishes} />;
}
