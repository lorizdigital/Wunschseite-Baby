import Link from "next/link";
import { notFound } from "next/navigation";
import { InvitationAcceptance } from "@/components/invitation-acceptance";
import { getAuthenticatedSupabaseUser } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return { robots: { index: false, follow: false } };
}

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32,512}$/.test(token)) notFound();
  const auth = await getAuthenticatedSupabaseUser();

  return <main className="admin-page"><div className="admin-wrap login-wrap">
    <header className="admin-head"><p className="eyebrow">Persönliche Einladung</p><h1>Schön, dass du dabei bist</h1><p>Du bekommst damit Zugriff auf genau eine Wunschliste – mit der Rolle, die für dich ausgewählt wurde.</p></header>
    <section className="import-panel">{auth ? <InvitationAcceptance token={token} /> : <><p>Bitte melde dich zuerst mit der E-Mail-Adresse an, an die diese Einladung gerichtet ist. Danach kommst du automatisch zu dieser Einladung zurück.</p><Link className="primary-button" href={`/login?next=${encodeURIComponent(`/einladung/${token}`)}`}>Jetzt anmelden</Link></>}</section>
  </div></main>;
}
