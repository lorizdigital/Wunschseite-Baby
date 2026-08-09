import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WishlistExperience } from "@/components/wishlist-experience";
import { PRODUCT_NAME } from "@/lib/brand";
import { getMatsWishlistPageData } from "@/lib/wishlist-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Wünsche für Mats | ${PRODUCT_NAME}`,
  description: "Private Wunschliste für Mats.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function MatsWishlistPage() {
  const data = await getMatsWishlistPageData();
  if (!data) notFound();
  return <WishlistExperience wishlist={data.wishlist} wishes={data.wishes} />;
}
