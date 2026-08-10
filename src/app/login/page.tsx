import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isFeatureEnabled } from "@/lib/app-config";
import { getAuthenticatedSupabaseUser, getSafeAuthNext } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const nextPath = next ? getSafeAuthNext(next) : undefined;
  const auth = await getAuthenticatedSupabaseUser();
  if (auth) redirect(nextPath ?? "/app");
  const selfServiceEnabled = isFeatureEnabled("SELF_SERVICE_SIGNUP_ENABLED");
  return <main className="admin-page"><div className="admin-wrap login-wrap">
    <header className="admin-head"><p className="eyebrow">{selfServiceEnabled ? "Wünschi für Eltern" : "Geschlossene Beta"}</p><h1>{selfServiceEnabled ? "Willkommen bei Wünschi" : "Willkommen zurück"}</h1><p>{selfServiceEnabled ? "Gib deine E-Mail-Adresse ein. Du erhältst einen sicheren Anmeldelink und kannst danach deine Wunschliste anlegen." : "Fordere einen sicheren Anmeldelink an. Die Anmeldung ist nur für eingeladene Eltern verfügbar."}</p></header>
    <section className="import-panel"><LoginForm nextPath={nextPath} selfServiceEnabled={selfServiceEnabled} /></section>
  </div></main>;
}
