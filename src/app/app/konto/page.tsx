import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountControls } from "@/components/account-controls";
import { getAuthenticatedSupabaseUser } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const auth = await getAuthenticatedSupabaseUser();
  if (!auth) redirect("/login");
  const { data: profile } = await auth.supabase.from("profiles").select("display_name").eq("user_id", auth.user.id).maybeSingle();

  return <main className="admin-page"><div className="admin-wrap"><Link className="brand" href="/app">← Meine Listen</Link><header className="admin-head"><p className="eyebrow">Konto & Datenschutz</p><h1>Alles in deiner Hand</h1><p>Angemeldet als {auth.user.email ?? "eingeladene Person"}.</p></header><AccountControls initialDisplayName={(profile?.display_name as string | null) ?? ""} /></div></main>;
}
