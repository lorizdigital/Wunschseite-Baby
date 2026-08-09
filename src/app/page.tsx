import { WishlistExperience } from "@/components/wishlist-experience";
import { getMatsWishlistPageData } from "@/lib/wishlist-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { wishlist, wishes } = await getMatsWishlistPageData();
  return <WishlistExperience wishlist={wishlist} wishes={wishes} />;
}
