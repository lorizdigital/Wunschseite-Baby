import { notFound } from "next/navigation";
import type { ArtworkKind, Wish } from "@/data/wishes";
import { WishlistExperience } from "@/components/wishlist-experience";
import { getAppWishlistDetail, wishlistIdSchema, type AppWish } from "@/lib/app-wishlist-data";

export const dynamic = "force-dynamic";

const presentation: Array<{ artwork: ArtworkKind; palette: Wish["palette"] }> = [
  { artwork: "bag", palette: "sand" }, { artwork: "towel", palette: "blue" },
  { artwork: "thermometer", palette: "sage" }, { artwork: "monitor", palette: "cream" },
  { artwork: "mobile", palette: "rose" }, { artwork: "nailfile", palette: "sage" },
  { artwork: "pram", palette: "sand" }, { artwork: "blanket", palette: "cream" },
];

function formatPrice(wish: AppWish) {
  if (wish.priceAmount === null) return "Preis offen";
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: wish.currency || "EUR" }).format(wish.priceAmount);
  } catch {
    return `${wish.priceAmount.toFixed(2).replace(".", ",")} ${wish.currency || "EUR"}`;
  }
}

function toPreviewWish(wish: AppWish, index: number): Wish {
  const visual = presentation[index % presentation.length];
  return {
    id: wish.id,
    title: wish.title,
    price: formatPrice(wish),
    shop: wish.shopName || "Wunsch",
    note: wish.description || "Mit Liebe ausgesucht.",
    productUrl: wish.productUrl || "#",
    imageUrl: wish.imageUrl,
    ...visual,
  };
}

export default async function WishlistPreviewPage({ params }: { params: Promise<{ wishlistId: string }> }) {
  const { wishlistId } = await params;
  if (!wishlistIdSchema.safeParse(wishlistId).success) notFound();
  const detail = await getAppWishlistDetail(wishlistId);
  if (!detail) notFound();

  return <WishlistExperience
    wishlist={{
      title: detail.wishlist.title,
      intro: detail.wishlist.intro || "Eine kleine Auswahl an Dingen, die wir mit Freude erwarten.",
      note: "Private Vorschau – Reservierungen sind erst nach der Veröffentlichung möglich.",
    }}
    wishes={detail.wishes.filter((wish) => !wish.archivedAt).map(toPreviewWish)}
    brandName={detail.wishlist.title}
    reservationPasswordMinLength={8}
    showMode={false}
    reservationsEnabled={false}
  />;
}
