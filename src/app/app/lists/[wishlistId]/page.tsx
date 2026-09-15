import Link from "next/link";
import { notFound } from "next/navigation";
import { WishlistManager } from "@/components/wishlist-manager";
import { getAppOrigin, isFeatureEnabled } from "@/lib/app-config";
import { getAppWishlistDetail, wishlistIdSchema } from "@/lib/app-wishlist-data";

export const dynamic = "force-dynamic";

export default async function WishlistManagementPage({ params }: { params: Promise<{ wishlistId: string }> }) {
  const { wishlistId } = await params;
  if (!wishlistIdSchema.safeParse(wishlistId).success) notFound();

  const detail = await getAppWishlistDetail(wishlistId);
  if (!detail) notFound();
  const { wishlist: list, wishes, members, user } = detail;

  const state = list.archivedAt ? "archiviert" : list.publishedAt ? "veröffentlicht" : "im Entwurf";
  return <main className="admin-page list-admin-page"><div className="admin-wrap">
    <Link className="brand" href="/app">← Meine Listen</Link>
    <header className="admin-head"><p className="eyebrow">{list.role} · {state}</p><h1>{list.title}</h1><p>{list.intro || "Diese Liste hat noch keine Einleitung."}</p></header>
    <WishlistManager initialWishlist={list} initialWishes={wishes} initialMembers={members} currentUserId={user.id} publicationEnabled={isFeatureEnabled("PUBLICATION_ENABLED")} productImportEnabled={isFeatureEnabled("PRODUCT_IMPORT_ENABLED")} appOrigin={getAppOrigin()} />
  </div></main>;
}
