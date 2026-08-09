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

export default async function AppHomePage() {
  const auth = await getAuthenticatedSupabaseUser();
  if (!auth) redirect("/login");

  const { data, error } = await auth.supabase.rpc("get_my_wishlist_context_v1");
  const lists = (data ?? []) as WishlistContext[];

  return <main className="admin-page"><div className="admin-wrap app-wrap">
    <header className="admin-head"><p className="eyebrow">Elternbereich · Geschlossene Beta</p><h1>Deine Wunschlisten</h1><p>Du bist als {auth.user.email ?? "eingeladene Person"} angemeldet.</p></header>
    <div className="app-actions"><Link className="text-button" href="/app/konto">Konto & Datenschutz</Link><form action="/auth/logout" method="post"><button className="text-button">Abmelden</button></form></div>
    {error ? <section className="import-panel"><h2>Zugang wird vorbereitet</h2><p>Dein Konto ist angemeldet, hat aber noch keine freigeschaltete Wunschliste.</p></section> : lists.length ? <section className="import-panel"><div className="admin-section-head"><div><p className="eyebrow">Übersicht</p><h2>{lists.length} {lists.length === 1 ? "Liste" : "Listen"}</h2></div></div><div className="admin-items">{lists.map((list) => <article className="admin-item" key={list.wishlist_id}><div className="admin-item-copy"><strong>{list.title}</strong><small>{stateLabel(list)} · {list.member_role}</small>{list.intro && <small>{list.intro}</small>}</div><Link className="secondary-button" href={`/app/lists/${list.wishlist_id}`}>Verwalten</Link></article>)}</div></section> : <section className="import-panel"><h2>Noch keine Liste</h2><p>Für die geschlossene Beta wird deine erste Wunschliste durch eine Einladung freigeschaltet.</p><Link className="primary-button" href="/neu">Mehr erfahren</Link></section>}
  </div></main>;
}
