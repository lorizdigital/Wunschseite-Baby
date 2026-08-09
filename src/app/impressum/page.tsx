import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Impressum | ${PRODUCT_NAME}`,
  description: `Anbieterkennzeichnung für ${PRODUCT_NAME} von Loriz Digital.`,
};

export default function ImprintPage() {
  return (
    <main className="legal-page">
      <Link className="legal-back" href="/">← Zur Wunschliste</Link>
      <p className="eyebrow">Loriz Digital</p>
      <h1>Impressum</h1>

      <section>
        <h2>Angaben gemäß § 5 DDG</h2>
        <address>
          Lino Loriz<br />
          Loriz Digital<br />
          Wiesenweg 23<br />
          34379 Calden
        </address>
      </section>

      <section>
        <h2>Kontakt</h2>
        <p>
          Telefon: <a href="tel:+491603329300">+49 160 3329300</a><br />
          E-Mail: <a href="mailto:hallo@loriz.digital">hallo@loriz.digital</a>
        </p>
      </section>

      <section>
        <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
        <address>
          Lino Loriz<br />
          Wiesenweg 23<br />
          34379 Calden
        </address>
      </section>

      <section>
        <h2>Verbraucherstreitbeilegung</h2>
        <p>Ich bin weder bereit noch verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
      </section>
    </main>
  );
}
