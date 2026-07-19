import { WishlistExperience } from "@/components/wishlist-experience";
import { getWishlistPageData } from "@/lib/wishlist-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { wishlist, wishes } = await getWishlistPageData();
  return <WishlistExperience wishlist={wishlist} wishes={wishes} />;
}
