import { LoginForm } from "@/components/login-form";
import { getSafeAuthNext } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const nextPath = next ? getSafeAuthNext(next) : undefined;
  return <main className="admin-page"><div className="admin-wrap login-wrap">
    <header className="admin-head"><p className="eyebrow">Geschlossene Beta</p><h1>Willkommen zurück</h1><p>Fordere einen sicheren Anmeldelink an. Die Anmeldung ist nur für eingeladene Eltern verfügbar.</p></header>
    <section className="import-panel"><LoginForm nextPath={nextPath} /></section>
  </div></main>;
}
