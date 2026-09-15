import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getAuthenticatedSupabaseUser, getSafeAuthNext } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const nextPath = next ? getSafeAuthNext(next) : undefined;
  const auth = await getAuthenticatedSupabaseUser();
  if (auth) redirect(nextPath ?? "/app");
  return <main className="admin-page"><div className="admin-wrap login-wrap">
    <header className="admin-head"><p className="eyebrow">Wünschi für Eltern</p><h1>Willkommen bei Wünschi</h1><p>Gib deine E-Mail-Adresse ein. Du erhältst einen sicheren Anmeldelink und kannst danach deine Wunschliste anlegen.</p></header>
    <section className="import-panel"><LoginForm nextPath={nextPath} /></section>
  </div></main>;
}
