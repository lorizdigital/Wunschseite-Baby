import { redirect } from "next/navigation";
import { NewWishlistForm } from "@/components/new-wishlist-form";
import { getAuthenticatedSupabaseUser } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

export default async function NewWishlistPage() {
  const auth = await getAuthenticatedSupabaseUser();
  if (!auth) redirect("/login?next=/neu");

  return <main className="admin-page new-wishlist-page"><div className="admin-wrap">
    <header className="admin-head"><p className="eyebrow">Neue Wunschliste</p><h1>Eure Wünsche, ganz persönlich</h1><p>Legt eure Liste in Ruhe an. Sie bleibt zunächst privat und ist erst nach eurer Freigabe über einen persönlichen Link sichtbar.</p></header>
    <section className="import-panel"><NewWishlistForm /></section>
  </div></main>;
}
