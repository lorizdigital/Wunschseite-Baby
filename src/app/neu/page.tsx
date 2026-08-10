import { redirect } from "next/navigation";
import { NewWishlistForm } from "@/components/new-wishlist-form";
import { isFeatureEnabled } from "@/lib/app-config";
import { getAuthenticatedSupabaseUser } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

export default async function NewWishlistPage() {
  const auth = await getAuthenticatedSupabaseUser();
  if (!auth) redirect("/login?next=/neu");

  const selfServiceEnabled = isFeatureEnabled("SELF_SERVICE_SIGNUP_ENABLED");
  return <main className="admin-page new-wishlist-page"><div className="admin-wrap">
    <header className="admin-head"><p className="eyebrow">Neue Wunschliste</p><h1>{selfServiceEnabled ? "Eure Wünsche, ganz persönlich" : "Dein Beta-Zugang ist bereit"}</h1><p>{selfServiceEnabled ? "Legt eure Liste in Ruhe an. Sie bleibt zunächst privat und ist erst nach eurer Freigabe über einen persönlichen Link sichtbar." : "Lege jetzt deine erste Wunschliste an. Sie bleibt privat, bis du sie bewusst veröffentlichst und teilst."}</p></header>
    <section className="import-panel"><NewWishlistForm /></section>
  </div></main>;
}
