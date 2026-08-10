import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedSupabaseUser } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

type WishlistContext = {
  wishlist_id: string;
  title: string;
  intro: string;
  public_slug: string;
  published_at: string | null;
  archived_at: string | null;
  member_role: "owner" | "editor" | "viewer";
};

function stateLabel(list: WishlistContext) {
  if (list.archived_at) return "Archiviert";
  if (list.published_at) return "Veröffentlicht";
  return "Entwurf";
}

export default async function AppHomePage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const auth = await getAuthenticatedSupabaseUser();
  if (!auth) redirect("/login");

  const { data, error } = await auth.supabase.rpc("get_my_wishlist_context_v1");
  if (error) console.error("get_my_wishlist_context_v1 failed", { code: error.code });
  const lists = (data ?? []) as WishlistContext[];

  return <main className="admin-page"><div className="admin-wrap app-wrap">
    <header className="admin-head"><p className="eyebrow">Elternbereich · Geschlossene Beta</p><h1>Deine Wunschlisten</h1><p>Du bist als {auth.user.email ?? "eingeladene Person"} angemeldet.</p></header>
    <div className="app-actions"><Link className="text-button" href="/app/konto">Konto & Datenschutz</Link><form action="/auth/logout" method="post"><button className="text-button">Abmelden</button></form></div>
    {deleted === "1" && <p className="form-success" role="status">Die Wunschliste wurde endgültig gelöscht.</p>}
    {error ? <section className="import-panel"><h2>Deine Listen konnten nicht geladen werden</h2><p>Bitte lade die Seite erneut. Bleibt das Problem bestehen, melde dich kurz ab und wieder an.</p></section> : lists.length ? <section className="import-panel"><div className="admin-section-head dashboard-list-summary"><div><p className="eyebrow">Übersicht</p><p className="dashboard-list-count"><strong>{lists.length}</strong><span>{lists.length === 1 ? "Liste" : "Listen"}</span></p></div><Link className="secondary-button" href="/neu">Neue Liste</Link></div><div className="admin-items">{lists.map((list) => <article className="admin-item admin-item-dashboard" key={list.wishlist_id}><div className="admin-item-copy"><strong>{list.title}</strong><small>{stateLabel(list)} · {list.member_role === "owner" ? "Eigentümer:in" : list.member_role === "editor" ? "Mitverwaltung" : "Nur ansehen"}</small>{list.intro && <small>{list.intro}</small>}</div><Link className="secondary-button" href={`/app/lists/${list.wishlist_id}`}>Verwalten</Link></article>)}</div></section> : <section className="import-panel"><h2>Lege deine erste Wunschliste an</h2><p>Dein Zugang ist freigeschaltet. Die neue Liste bleibt zunächst privat und kann in Ruhe vorbereitet werden.</p><Link className="primary-button" href="/neu">Wunschliste anlegen</Link></section>}
  </div></main>;
}
