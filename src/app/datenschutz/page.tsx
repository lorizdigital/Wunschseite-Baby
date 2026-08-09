import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Datenschutz | ${PRODUCT_NAME}`,
  description: `Datenschutzhinweise für ${PRODUCT_NAME} von Loriz Digital.`,
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <Link className="legal-back" href="/">← Zur Wunschliste</Link>
      <p className="eyebrow">Stand: August 2026</p>
      <h1>Datenschutzerklärung</h1>

      <section>
        <h2>1. Verantwortlicher</h2>
        <p>Verantwortlicher für die Verarbeitung personenbezogener Daten im Sinne der DSGVO ist:</p>
        <address>
          Lino Loriz<br />
          Loriz Digital<br />
          Wiesenweg 23<br />
          34379 Calden<br />
          Telefon: <a href="tel:+491603329300">+49 160 3329300</a><br />
          E-Mail: <a href="mailto:hallo@loriz.digital">hallo@loriz.digital</a>
        </address>
      </section>

      <section>
        <h2>2. Zweck dieser Anwendung</h2>
        <p>Die Anwendung stellt private, per Link erreichbare Wunschlisten für Familien bereit. Eltern können Wunschlisten verwalten und veröffentlichen. Gäste können freie Wünsche reservieren, ohne ein eigenes Konto anzulegen.</p>
        <p>Die Verarbeitung erfolgt zur Bereitstellung und Durchführung der Anwendung (Art. 6 Abs. 1 lit. b DSGVO) sowie zur sicheren und störungsfreien Bereitstellung, Missbrauchsabwehr und Fehleranalyse (Art. 6 Abs. 1 lit. f DSGVO).</p>
      </section>

      <section>
        <h2>3. Verarbeitete Daten</h2>
        <p>Je nach Nutzung verarbeiten wir Kontaktdaten von Elternkonten (E-Mail-Adresse und Anzeigename), Listen- und Wunschinhalte, Einladungsdaten sowie technisch erforderliche Nutzungs- und Protokolldaten.</p>
        <p>Bei einer Reservierung werden der freiwillig angegebene Name, ein technisch geschütztes Reservierungspasswort und der Reservierungszeitpunkt verarbeitet. Das Passwort wird nicht im Klartext gespeichert oder ausgegeben. Andere Gäste sehen weder den Namen noch das Passwort der reservierenden Person.</p>
      </section>

      <section>
        <h2>4. Authentifizierung, Datenbank und Speicher</h2>
        <p>Für Benutzerkonten, Anmeldung per Magic Link, Datenbank und den Speicher von Produktbildern wird Supabase eingesetzt. Supabase verarbeitet die hierfür erforderlichen Daten als Auftragsverarbeiter. Für die Staging-Umgebung liegt die Datenbankregion in Stockholm (EU). Vor einer öffentlichen Produktivschaltung werden die tatsächlich eingesetzte Produktionsregion, der Auftragsverarbeitungsvertrag und eingesetzte Unterauftragsverarbeiter in diesen Hinweisen final bestätigt.</p>
        <p>Produktbilder werden ausschließlich für die Darstellung eines verlinkten Wunsches gespeichert. Persönliche Baby- oder Familienfotos sind kein vorgesehener Bestandteil der Anwendung.</p>
      </section>

      <section>
        <h2>5. Hosting und technische Bereitstellung</h2>
        <p>Die Anwendung befindet sich derzeit in einer geschlossenen technischen Beta. Die Hosting- und Content-Delivery-Infrastruktur für den öffentlichen Betrieb wird vor dem Launch verbindlich festgelegt und hier mit Anbieter, Datenkategorien, Rechtsgrundlage und gegebenenfalls Drittlandgarantien ergänzt. Eine geplante Nutzung von Cloudflare wird erst nach dieser Aktualisierung aktiviert.</p>
      </section>

      <section>
        <h2>6. Speicherdauer</h2>
        <p>Stornierte Reservierungen werden nach 30 Tagen gelöscht. Reservierungsdaten archivierter Listen werden nach 90 Tagen gelöscht. Abgelaufene oder widerrufene Einladungen werden zeitnah entfernt. Konto-Löschanträge haben eine Karenzzeit von 30 Tagen, Listen-Löschanträge eine Karenzzeit von 90 Tagen. Gesetzliche Aufbewahrungspflichten und die Verteidigung von Rechtsansprüchen bleiben unberührt.</p>
      </section>

      <section>
        <h2>7. Ihre Rechte</h2>
        <p>Sie haben nach Maßgabe der gesetzlichen Voraussetzungen das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit sowie Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen. Erteilte Einwilligungen können Sie jederzeit mit Wirkung für die Zukunft widerrufen.</p>
        <p>Für Anliegen zum Datenschutz genügt eine Nachricht an <a href="mailto:hallo@loriz.digital">hallo@loriz.digital</a>. Außerdem besteht ein Beschwerderecht bei einer Datenschutzaufsichtsbehörde.</p>
      </section>
    </main>
  );
}
