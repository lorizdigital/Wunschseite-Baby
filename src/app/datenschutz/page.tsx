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
      <Link className="legal-back" href="/">← Zur Startseite</Link>
      <p className="eyebrow">Stand: 9. August 2026</p>
      <h1>Datenschutzerklärung</h1>

      <section>
        <h2>1. Verantwortlicher und Kontakt</h2>
        <p>Verantwortlicher für die Verarbeitung personenbezogener Daten im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:</p>
        <address>
          Lino Loriz<br />
          Loriz Digital<br />
          Wiesenweg 23<br />
          34379 Calden<br />
          Telefon: <a href="tel:+491603329300">+49 160 3329300</a><br />
          E-Mail: <a href="mailto:hallo@loriz.digital">hallo@loriz.digital</a>
        </address>
        <p>Fragen, Auskunftsersuchen und sonstige Anliegen zum Datenschutz können Sie an diese Kontaktdaten richten.</p>
      </section>

      <section>
        <h2>2. Worum es bei Wünschi geht</h2>
        <p>{PRODUCT_NAME} ermöglicht Familien, eigene Wunschlisten anzulegen, zu verwalten und für einen ausgewählten Kreis freizugeben. Eltern beziehungsweise Listenmitglieder können Wünsche, Produktlinks und Produktbilder hinterlegen. Eingeladene Gäste können eine freigegebene Liste nach Eingabe des Zugangscodes ansehen und Wünsche reservieren, ohne ein Benutzerkonto anzulegen.</p>
        <p>Wir verarbeiten Daten, soweit dies zur Bereitstellung der Anwendung und zur Durchführung des jeweiligen Nutzungsverhältnisses erforderlich ist (Art. 6 Abs. 1 lit. b DSGVO). Soweit es um den sicheren, zuverlässigen und missbrauchsfreien Betrieb geht, beruht die Verarbeitung auf unserem berechtigten Interesse (Art. 6 Abs. 1 lit. f DSGVO). Ohne die jeweils als erforderlich gekennzeichneten Angaben kann die betreffende Funktion nicht genutzt werden.</p>
      </section>

      <section>
        <h2>3. Aufruf der Website, Hosting und TLS-Verschlüsselung</h2>
        <p>Die Website wird über Cloudflare Workers und die Content-Delivery-/Sicherheitsinfrastruktur der Cloudflare, Inc. bereitgestellt. Bei jedem Aufruf werden technisch notwendige Verbindungsdaten verarbeitet, insbesondere IP-Adresse, Zeitpunkt, angeforderte Adresse und Methode, HTTP-Status, übertragene Datenmenge, Referrer-Informationen, Browser-/Geräteinformationen sowie sicherheitsrelevante Request-Metadaten. Dies ist erforderlich, um die Seite auszuliefern, Angriffe abzuwehren und Störungen zu erkennen.</p>
        <p>Die Übertragung zwischen Browser und wünschi.de erfolgt über HTTPS/TLS. Cloudflare verarbeitet die genannten Daten in unserem Auftrag. Cloudflare kann Daten weltweit verarbeiten; für erforderliche Übermittlungen außerhalb des EWR bestehen nach den Cloudflare-Unterlagen geeignete Garantien, insbesondere die EU-Standardvertragsklauseln. Weitere Informationen: <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Datenschutzhinweise von Cloudflare</a> und <a href="https://www.cloudflare.com/cloudflare-customer-dpa/" target="_blank" rel="noreferrer">Cloudflare-DPA</a>.</p>
      </section>

      <section>
        <h2>4. Elternkonto, Registrierung und Anmeldung per E-Mail</h2>
        <p>Für die Erstellung und Verwaltung eigener Wunschlisten ist ein Elternkonto erforderlich. Bei der Registrierung oder Anmeldung verarbeiten wir die eingegebene E-Mail-Adresse, eine technische Benutzerkennung, Zeitpunkte der Anmeldung und den Status der E-Mail-Bestätigung. In Ihrem Profil kann zusätzlich ein Anzeigename hinterlegt werden. Es gibt in der Anwendung keine Passwort-Anmeldung: Der Zugang erfolgt über einen zeitlich begrenzten, einmalig verwendbaren Magic Link, der an die angegebene E-Mail-Adresse gesendet wird.</p>
        <p>Für Authentifizierung, Datenbank und Dateispeicher setzen wir Supabase, Inc. als Auftragsverarbeiter ein. Das Produktivprojekt befindet sich in der Region <strong>EU North (Stockholm, Schweden)</strong>. Supabase verarbeitet für uns insbesondere Konto- und Authentifizierungsdaten, Listen-, Wunsch-, Reservierungs- und Einladungsdaten sowie gespeicherte Produktbilder. Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO; der Schutz von Konten und die Begrenzung missbräuchlicher Anmeldeversuche erfolgen zusätzlich auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO.</p>
        <p>Die Authentifizierungs-E-Mail enthält den Magic Link und die für dessen Zustellung notwendigen Versanddaten. Sie dient ausschließlich Anmeldung, Registrierung oder sicherheitsbezogenen Kontofunktionen; Newsletter, Werbung und Profiling per E-Mail finden nicht statt. Die Zustellung erfolgt derzeit über den von Supabase bereitgestellten Auth-E-Mail-Versand; ein eigener SMTP-Anbieter ist nicht aktiviert. Der Versanddienst erhält dafür E-Mail-Adresse, Inhalt der Transaktions-E-Mail sowie technische Zustell- und Fehlerdaten. Vor der Aktivierung oder dem Wechsel eines eigenen SMTP-Anbieters wird dessen Name in dieser Erklärung ergänzt.</p>
        <p>Supabase kann zur Leistungserbringung Unterauftragsverarbeiter einsetzen und Datenzugriffe außerhalb des EWR nicht vollständig ausschließen. Für erforderliche Drittlandübermittlungen sieht das mit Supabase vereinbarte <a href="https://supabase.com/legal/customer-resources/data-processing-addendum" target="_blank" rel="noreferrer">Data Processing Addendum</a> die EU-Standardvertragsklauseln vor. Details zu den von Supabase verarbeiteten Daten- und Empfängerkategorien ergeben sich außerdem aus dessen <a href="https://supabase.com/legal/subprocessors" target="_blank" rel="noreferrer">Liste der Unterauftragsverarbeiter</a>.</p>
      </section>

      <section>
        <h2>5. Wunschlisten, Freigabe und Reservierungen</h2>
        <p>Beim Anlegen und Verwalten einer Wunschliste verarbeiten wir Listenname, Einleitung, Sichtbarkeits- und Veröffentlichungsstatus, Mitgliederrollen sowie die von Ihnen eingetragenen Wünsche. Zu einem Wunsch können Produktname, Beschreibung, Preis, Währung, Händlername, Produkt- und Bildadresse sowie ein gespeichertes Produktbild gehören. Bitte hinterlegen Sie keine besonderen Kategorien personenbezogener Daten (etwa Gesundheitsdaten) und keine privaten Familien- oder Babyfotos. Solche Fotos sind kein vorgesehener Bestandteil des Dienstes.</p>
        <p>Eine veröffentlichte Liste ist nicht suchmaschinenöffentlich vorgesehen. Der Zugriff setzt den geteilten Listenlink und einen Zugangscode voraus. Bei Listen mit Zugangscode wird der Code nicht im Klartext in der Datenbank gespeichert, sondern kryptografisch geschützt. Nach erfolgreicher Eingabe wird im Browser nur eine signierte Zugriffsfreigabe gespeichert, nicht der Zugangscode selbst. Ändert der Listeninhaber den Code, verlieren frühere Freigaben ihre Gültigkeit.</p>
        <p>Wenn ein Gast einen Wunsch reserviert, verarbeiten wir den freiwillig eingegebenen Namen, den reservierten Wunsch, Zeitpunkt und Status der Reservierung sowie ein Passwort zum späteren Stornieren. Das Reservierungspasswort wird nicht im Klartext gespeichert oder angezeigt. Andere Gäste sehen lediglich, dass ein Wunsch reserviert ist; sie sehen weder den Namen der reservierenden Person noch deren Passwort. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit die Reservierung als angefragte Funktion ausgeführt wird, im Übrigen Art. 6 Abs. 1 lit. f DSGVO für die verlässliche Koordination der Wunschliste.</p>
      </section>

      <section>
        <h2>6. Listenmitglieder und Einladungen</h2>
        <p>Listeninhaber können weitere Personen als Owner, Bearbeiter oder Betrachter einladen. Dafür werden E-Mail-Adresse, gewählte Rolle, Zeitpunkt, Ablaufzeit, Annahme- oder Widerrufsstatus sowie ein nur gehasht gespeicherter Einladungsnachweis verarbeitet. Diese Angaben sind nur für berechtigte Mitglieder der betreffenden Liste sichtbar.</p>
        <p>Nach dem Erstellen einer Einladung verschickt die Anwendung eine transaktionale Einladungs-E-Mail über Brevo. Die Nachricht enthält die eingeladene E-Mail-Adresse als Empfänger, den Namen der Wunschliste, die gewählte Rolle und den zeitlich begrenzten Einladungslink. Brevo erhält diese Daten ausschließlich zur technischen Zustellung der Einladung; Newsletter, Werbung und Profiling per E-Mail finden nicht statt. Der Versand wird nur serverseitig mit einem geschützten API-Schlüssel ausgelöst. Bei einem Versandfehler bleibt der Einladungslink im Elternbereich als sicher zu teilender Fallback verfügbar.</p>
      </section>

      <section>
        <h2>7. Produktlinks, Produktbilder und externe Händlerseiten</h2>
        <p>Produktlinks führen zu Angeboten externer Händler. Erst wenn Sie einen solchen Link anklicken, baut Ihr Browser eine Verbindung zum jeweiligen Händler auf; ab diesem Zeitpunkt gelten dessen Datenschutzbestimmungen. Die Links werden mit einer Schutzvorgabe geöffnet, die üblicherweise verhindert, dass unsere Seitenadresse als Referrer übermittelt wird. Der Händler erhält dennoch regelmäßig mindestens Ihre IP-Adresse und technische Verbindungsdaten.</p>
        <p>Für eingetragene externe Bildadressen kann der Browser beim Anzeigen des Bildes ebenfalls eine Verbindung zum jeweiligen Bildanbieter herstellen. Dabei kann dieser Ihre IP-Adresse verarbeiten. Wo Produktbilder über die Importfunktion übernommen werden, ruft unser Server die gewählte Produktseite beziehungsweise Bildadresse nur auf Ihren ausdrücklichen Auftrag ab, extrahiert Produktinformationen und speichert ein geeignetes Produktbild in Supabase Storage. Dabei erhält der aufgerufene Händler technische Daten der Serveranfrage. Die Importfunktion wird nicht bei einem bloßen Seitenaufruf ausgelöst.</p>
        <p>Übernommene Produktbilder werden im Speicherbereich <em>product-images</em> bei Supabase abgelegt und über eine abrufbare Bildadresse ausgeliefert. Dieser Speicherbereich ist für die Bildauslieferung öffentlich; die Bildadresse ist daher kein geeigneter Ort für private oder personenbezogene Bildinhalte. Bei Löschung eines Wunsches oder einer Liste werden zugehörige gespeicherte Bilder zur Löschung vorgemerkt.</p>
      </section>

      <section>
        <h2>8. Technisch erforderliche Cookies und vergleichbare Speicherungen</h2>
        <p>Die Anwendung setzt ausschließlich technisch erforderliche Cookies ein. Dazu gehören Sitzungs-Cookies für angemeldete Elternkonten sowie die signierte Zugriffsfreigabe nach erfolgreicher Eingabe eines Listen-Zugangscodes. Diese Cookies sind mit <code>HttpOnly</code>, <code>Secure</code> bei HTTPS und <code>SameSite=Lax</code> geschützt. Sie enthalten keinen Klartext-Zugangscode. Die Code-Freigabe gilt höchstens 30 Tage; die Laufzeit von Sitzungs-Cookies richtet sich nach der Authentifizierungssitzung.</p>
        <p>Die Anwendung verwendet keine Analyse-, Werbe- oder Social-Media-Cookies und kein Tracking zu Werbezwecken. Eine Einwilligung ist für die genannten notwendigen Cookies nicht erforderlich, weil sie für ausdrücklich gewünschte Funktionen wie Anmeldung und Code-Schutz unbedingt erforderlich sind (§ 25 Abs. 2 Nr. 2 TDDDG). Die zugehörige personenbezogene Verarbeitung beruht auf Art. 6 Abs. 1 lit. b beziehungsweise lit. f DSGVO.</p>
      </section>

      <section>
        <h2>9. Sicherheit, Missbrauchsschutz und keine automatisierten Entscheidungen</h2>
        <p>Zum Schutz gegen Missbrauch begrenzen wir insbesondere Anmelde-, Reservierungs- und Produktimportanfragen. Hierfür wird die aus der Anfrage ermittelte IP-Adresse nicht als Klartextwert in der Anwendungsdatenbank abgelegt, sondern zusammen mit dem jeweiligen Zweck gehasht und zur Zählung von Anfragen verwendet. Außerdem werden technische Einmal-Schlüssel genutzt, damit eine Reservierungsanfrage nicht versehentlich mehrfach ausgeführt wird. Cloudflare verarbeitet IP- und Requestdaten zusätzlich im Rahmen der Hosting- und Sicherheitsinfrastruktur.</p>
        <p>Eine automatisierte Entscheidungsfindung einschließlich Profiling im Sinne von Art. 22 DSGVO findet nicht statt. Automatische Sperren durch Rate Limits dienen ausschließlich der zeitlich begrenzten Abwehr missbräuchlicher oder fehlerhafter Anfragen.</p>
      </section>

      <section>
        <h2>10. Empfänger und Datenübermittlungen</h2>
        <p>Empfänger personenbezogener Daten sind nur diejenigen Stellen, die sie zur Erbringung und Absicherung des Dienstes benötigen: Cloudflare für Hosting und Sicherheitsinfrastruktur, Supabase für Authentifizierung einschließlich Auth-E-Mail-Versand, Datenbank und Dateispeicher sowie Brevo für den transaktionalen Versand von Einladungs-E-Mails. Bei einer von Ihnen veranlassten Produktabfrage oder beim Aufruf externer Produktlinks treten zusätzlich die jeweils ausgewählten Händler beziehungsweise Bildanbieter als eigenständig Verantwortliche hinzu.</p>
        <p>Mit Cloudflare, Supabase und Brevo werden Auftragsverarbeitungsvereinbarungen eingesetzt. Soweit ein Empfänger Daten außerhalb des EWR verarbeitet, erfolgt dies nur unter den Voraussetzungen der Art. 44 ff. DSGVO, insbesondere auf Grundlage eines Angemessenheitsbeschlusses oder der EU-Standardvertragsklauseln mit ergänzenden Schutzmaßnahmen. Für Brevo gelten zusätzlich die Angaben zu den eingesetzten Unterauftragsverarbeitern und Speicherfristen in den <a href="https://www.brevo.com/legal/privacypolicy/" target="_blank" rel="noreferrer">Datenschutzhinweisen von Brevo</a> und im <a href="https://help.brevo.com/hc/en-us/articles/15403782599570-Where-can-I-find-the-Data-Processing-Agreement-DPA" target="_blank" rel="noreferrer">Brevo-DPA</a>. Wir verkaufen keine personenbezogenen Daten und setzen keine Datenbroker ein.</p>
      </section>

      <section>
        <h2>11. Speicherdauer</h2>
        <p>Wir löschen personenbezogene Daten, sobald sie für den jeweiligen Zweck nicht mehr erforderlich sind und keine gesetzlichen Aufbewahrungspflichten oder Rechtsansprüche entgegenstehen. Für die Anwendung gelten insbesondere folgende Fristen:</p>
        <ul>
          <li>Kontodaten bleiben für die Dauer des Kontos gespeichert. Nach einem Löschantrag gilt eine 30-tägige Karenzzeit; danach wird das Konto unwiderruflich gelöscht, sofern alle erforderlichen Owner-Rollen vorher übertragen wurden.</li>
          <li>Eine zur Löschung vorgemerkte Wunschliste wird zunächst deaktiviert und nach 90 Tagen samt zugehörigen Wünschen und gespeicherten Produktbildern gelöscht.</li>
          <li>Stornierte Reservierungen werden 30 Tage nach der Stornierung gelöscht. Reservierungsdaten archivierter Listen werden 90 Tage nach Archivierung gelöscht.</li>
          <li>Angenommene Einladungen sowie abgelaufene oder widerrufene Einladungen werden im nächsten Löschlauf beziehungsweise spätestens sieben Tage nach Ablauf oder Widerruf entfernt.</li>
          <li>Gehasht gespeicherte Rate-Limit-Daten werden nach zwei Tagen ohne Aktualisierung gelöscht; Einmal-Schlüssel für Reservierungen nach einem Tag.</li>
        </ul>
        <p>Protokoll- und Sicherungsdaten der eingesetzten Infrastruktur können darüber hinaus nach den jeweiligen, von Cloudflare und Supabase festgelegten Aufbewahrungsfristen verarbeitet werden. Einzelheiten ergeben sich aus deren oben verlinkten Unterlagen.</p>
      </section>

      <section>
        <h2>12. Ihre Rechte und Beschwerderecht</h2>
        <p>Sie haben nach Maßgabe der gesetzlichen Voraussetzungen das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO), Datenübertragbarkeit (Art. 20 DSGVO) sowie Widerspruch gegen Verarbeitungen auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO (Art. 21 DSGVO). Erteilte Einwilligungen können Sie jederzeit mit Wirkung für die Zukunft widerrufen.</p>
        <p>Angemeldete Eltern können in ihrem Bereich einen JSON-Export ihrer Konto-, Listen- und Wunschdaten herunterladen. Daten anderer reservierender Personen sind darin bewusst nicht enthalten. Für weitere Anliegen genügt eine Nachricht an <a href="mailto:hallo@loriz.digital">hallo@loriz.digital</a>.</p>
        <p>Sie haben außerdem das Recht, sich bei einer Datenschutzaufsichtsbehörde zu beschweren. Zuständig für den Verantwortlichen ist insbesondere der <a href="https://datenschutz.hessen.de/service/beschwerde-uebermitteln" target="_blank" rel="noreferrer">Hessische Beauftragte für Datenschutz und Informationsfreiheit</a>, Postfach 3163, 65021 Wiesbaden, E-Mail: <a href="mailto:poststelle@datenschutz.hessen.de">poststelle@datenschutz.hessen.de</a>.</p>
      </section>

      <section>
        <h2>13. Aktualisierung dieser Erklärung</h2>
        <p>Wir passen diese Erklärung an, wenn sich Datenverarbeitungen oder eingesetzte Dienste wesentlich ändern. Insbesondere wird vor der Aktivierung eines zusätzlichen Versand-, Analyse-, Zahlungs- oder Kommunikationsdienstes dessen Einsatz, Zweck und Rechtsgrundlage hier ergänzt.</p>
      </section>
    </main>
  );
}
