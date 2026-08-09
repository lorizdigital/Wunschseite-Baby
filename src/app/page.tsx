import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";

// The root page is deliberately request-rendered so a deployment replaces the
// previous landing page immediately instead of retaining an old static page
// from the shared incremental cache.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link className="brand" href="/" aria-label={`${PRODUCT_NAME} Startseite`}>
          <span className="landing-brand-mark" aria-hidden="true">♡</span>
          <span>{PRODUCT_NAME}</span>
        </Link>
        <Link className="landing-login-link" href="/login">Anmelden</Link>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">Private Wunschlisten für Familien</p>
          <h1>Wünsche teilen.<br />Freude schenken.</h1>
          <p>Mit Wünschi erstellt ihr eine persönliche Wunschliste, teilt sie nur mit euren Liebsten und vermeidet doppelte Geschenke.</p>
          <div className="landing-actions">
            <Link className="landing-primary-action" href="/login">Zum Elternbereich</Link>
            <p>Du bist bereits eingeladen? Melde dich mit deiner E-Mail-Adresse an.</p>
          </div>
        </div>
        <div className="landing-art" aria-hidden="true">
          <span className="landing-sun" />
          <span className="landing-cloud landing-cloud-one" />
          <span className="landing-cloud landing-cloud-two" />
          <span className="landing-rainbow"><i /><i /><i /></span>
          <span className="landing-star landing-star-one">✦</span>
          <span className="landing-star landing-star-two">✧</span>
        </div>
      </section>

      <section className="landing-steps" aria-labelledby="landing-how-it-works">
        <p className="eyebrow">Einfach und persönlich</p>
        <h2 id="landing-how-it-works">So funktioniert Wünschi</h2>
        <div>
          <article><span>1</span><h3>Einloggen</h3><p>Eltern verwalten ihre Wunschlisten geschützt in ihrem persönlichen Bereich.</p></article>
          <article><span>2</span><h3>Liste gestalten</h3><p>Wünsche hinzufügen, sortieren und mit den wichtigsten Details versehen.</p></article>
          <article><span>3</span><h3>Privat teilen</h3><p>Ihr entscheidet selbst, wann eure Liste über einen persönlichen Link sichtbar wird.</p></article>
        </div>
      </section>

      <footer>
        <p>{PRODUCT_NAME}</p>
        <small>Private Wunschlisten · Für Familie und Freunde</small>
        <div className="footer-legal"><Link href="/impressum">Impressum</Link><Link href="/datenschutz">Datenschutz</Link></div>
      </footer>
    </main>
  );
}
