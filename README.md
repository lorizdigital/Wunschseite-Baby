# Wünsche für Mats

Eine private Baby-Wunschliste. Gäste benötigen kein Konto: Sie reservieren einen Wunsch mit ihrem Namen und einem selbst gewählten Passwort. Zum Freigeben klicken sie denselben Wunsch erneut an und geben das Passwort wieder ein.

Die nicht verlinkte Seite `/admin` dient Lino und seiner Frau zur gemeinsamen Verwaltung. Es gibt keine Benutzerkonten; alle Verwaltungsaktionen werden serverseitig durch einen gemeinsamen Admin-Code geschützt. Dort lassen sich Produktlinks auslesen, Angaben vor dem Speichern korrigieren, Wünsche bearbeiten, sortieren sowie archivieren und wiederherstellen. Falls ein Shop das automatische Auslesen blockiert, können die Angaben manuell eingetragen werden.

Die bisherigen GoWish-Wünsche wurden einmalig migriert. Eine dauerhafte GoWish-Importschnittstelle ist nicht Bestandteil der Anwendung.

## Lokal starten

```bash
npm install
npm run dev
```

Ohne Supabase-Variablen läuft die öffentliche Wunschliste im **Demo-Modus**. Reservierungen werden dabei nur im Arbeitsspeicher des lokalen Next.js-Prozesses gehalten und gehen bei einem Neustart verloren. Die Verwaltung benötigt immer Supabase.

## Supabase verbinden

1. Die Supabase CLI installieren: `npm install supabase --save-dev`.
2. Im Projektordner `npx supabase login` und anschließend `npx supabase link --project-ref DEINE_PROJECT_ID` ausführen.
3. Mit `npx supabase db push --dry-run` die Migrationen prüfen und danach mit `npx supabase db push` anwenden.
4. Im Supabase-Dashboard die Project URL und unter **API Keys** den serverseitigen Secret Key kopieren.
5. `.env.example` als `.env.local` anlegen und diese Werte setzen:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://DEIN-PROJEKT.supabase.co
SUPABASE_SECRET_KEY=DEIN_SERVERSEITIGER_SECRET_KEY
WISHLIST_ID=3d1f46e6-8e0e-4418-a0da-581be7cf795f
ADMIN_IMPORT_SECRET=EUER_GEMEINSAMER_ADMIN_CODE
```

6. Den Entwicklungsserver vollständig neu starten und `/admin` öffnen.

`SUPABASE_SECRET_KEY` und `ADMIN_IMPORT_SECRET` sind ausschließlich serverseitig. Sie dürfen nie als `NEXT_PUBLIC_...` angelegt oder ins Repository eingecheckt werden. Bei älteren Supabase-Projekten kann statt `SUPABASE_SECRET_KEY` der Legacy-Wert `SUPABASE_SERVICE_ROLE_KEY` verwendet werden.

Der Variablenname `ADMIN_IMPORT_SECRET` bleibt aus Kompatibilitätsgründen bestehen; funktional ist er der gemeinsame Verwaltungscode. Neue Produktbilder werden dauerhaft in den Supabase-Storage-Bucket `product-images` kopiert und hängen dadurch nicht vom ursprünglichen Shopbild ab.

## Live auf Vercel

1. Repository zu GitHub übertragen und in Vercel importieren.
2. In Vercel unter **Settings → Environment Variables** dieselben vier Variablen wie oben eintragen.
3. Deployment auslösen und anschließend Reservieren, Freigeben sowie `/admin` einmal testen.
4. Optional eine eigene Domain verbinden und den privaten Link an Familie und Freunde senden.

Die Anwendung setzt global `noindex`, `nofollow`, eine vollständig sperrende `robots.txt` und den Header `X-Robots-Tag: noindex, nofollow, noarchive`. Das verhindert die reguläre Aufnahme in Suchmaschinen, ersetzt aber keinen echten Zugriffsschutz: Wer den Link kennt, kann die öffentliche Wunschliste sehen. Schreibende Verwaltungsaktionen erfordern zusätzlich den gemeinsamen Admin-Code.

## Sicherheitsprinzipien

- Gäste erhalten kein Benutzerkonto.
- Pro Wunsch erlaubt ein partieller Unique-Index höchstens eine aktive Reservierung.
- Reservierungspasswörter werden niemals im Klartext gespeichert oder zurückgegeben. In Supabase liegt ausschließlich ein gesalzener bcrypt-Hash; der lokale Demo-Modus verwendet scrypt.
- Gastnamen und Passwort-Hashes werden von keinem öffentlichen Endpunkt ausgegeben.
- Öffentliche Schreibzugriffe laufen ausschließlich über validierte Next.js-Endpunkte.
- Reservierte Wünsche können in der Verwaltung nicht versehentlich archiviert werden.
- Bildimporte prüfen Protokoll, Zieladresse, Dateityp und Dateigröße, bevor sie in Supabase Storage gespeichert werden.
