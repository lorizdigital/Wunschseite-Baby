# Cloudflare-Deployment für Wünschi

Diese Anwendung ist eine serverseitige Next.js-Anwendung. Sie wird deshalb als Cloudflare Worker mit OpenNext betrieben. Ein rein statisches Pages-Deployment reicht für SSR, Route Handler, Server Actions und den Auth-Proxy nicht aus.

## 1. Cloudflare-Zone einrichten

Die gekaufte Domain bleibt beim bisherigen Registrar. In Cloudflare wird die Apex-Domain `wünschi.de` als Zone hinzugefügt. Der Registrar muss anschließend die von Cloudflare angezeigten Nameserver verwenden. Vor dem Nameserver-Wechsel vorhandene DNS-Einträge (insbesondere MX/TXT für E-Mail) prüfen und übernehmen.

Cloudflare führt die IDN-Domain technisch als:

```text
xn--wnschi-3ya.de
```

Als kanonische Webadresse bleibt für Besucher `https://wünschi.de` vorgesehen.

## 2. Worker-Projekt vorbereiten

Die Repository-Konfiguration verwendet:

- `@opennextjs/cloudflare` für den Next.js-Adapter
- `wrangler` für Preview und Deployment
- Worker-Name `wuenschi`
- lokale Preview unter `http://localhost:8787`

Lokale Cloudflare-Preview:

```bash
cp .dev.vars.example .dev.vars
# anschließend die Platzhalter in .dev.vars ersetzen
# NEXT_PUBLIC_-Werte zusätzlich in .env.local oder im Cloudflare-Build-Environment setzen
npm run cloudflare:preview
```

Die lokale `.dev.vars` darf nicht eingecheckt werden.

Die beiden `NEXT_PUBLIC_`-Werte werden beim Next.js-Build in den Browser-Code eingebettet. Sie müssen deshalb bereits während des OpenNext-Builds verfügbar sein; reine Wrangler-Laufzeitvariablen reichen dafür nicht aus.

## 3. Worker-Variablen in Staging und Produktion

In Cloudflare müssen Variablen und Secrets für den Build beziehungsweise die Laufzeit konfiguriert werden:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
ADMIN_IMPORT_SECRET
PUBLIC_WISHLIST_ACCESS_SESSION_SECRET
MATS_ACCESS_CODE
MATS_ACCESS_CODE_VERSION
APP_ORIGIN
INTERNAL_CRON_SECRET
INTERNAL_PROVISIONING_SECRET
BREVO_API_KEY
BREVO_SENDER_EMAIL
BREVO_SENDER_NAME
BREVO_REPLY_TO_EMAIL
BREVO_INVITATION_TEMPLATE_ID
MULTI_WISHLIST_ENABLED
PUBLICATION_ENABLED
PRODUCT_IMPORT_ENABLED
LEGACY_MATS_ADMIN_ENABLED
```

Für Staging zunächst empfehlen:

```text
APP_ORIGIN=https://<staging-worker-domain>
MULTI_WISHLIST_ENABLED=true
PUBLICATION_ENABLED=true
PRODUCT_IMPORT_ENABLED=true
LEGACY_MATS_ADMIN_ENABLED=true
```

`NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` müssen bereits beim Cloudflare-Build vorhanden sein. Der Supabase-Secret-Key und alle übrigen Secrets dürfen nie mit `NEXT_PUBLIC_` beginnen. `PUBLIC_WISHLIST_ACCESS_SESSION_SECRET` benötigt mindestens 32 zufällige Zeichen. `MATS_ACCESS_CODE` und `MATS_ACCESS_CODE_VERSION` bleiben erforderlich, solange `/mats` erreichbar ist. `BREVO_API_KEY` wird als Cloudflare Secret hinterlegt. `BREVO_SENDER_EMAIL` muss für den primären Auth-Mailversand immer als Sender verifiziert sein; `BREVO_INVITATION_TEMPLATE_ID` ist nur erforderlich, wenn Einladungen eine aktive Brevo-Vorlage statt des eingebauten Layouts verwenden.

Die Runtime-Bindings werden derzeit im Cloudflare-Dashboard verwaltet. Einige nicht geheimen Werte wie `APP_ORIGIN`, die Feature-Flags und die beiden öffentlichen Supabase-Werte liegen dort historisch ebenfalls als `secret_text`. Diese Bindings werden in diesem Rollout nicht umklassifiziert oder gelöscht. `keep_vars` ist in `wrangler.jsonc` aktiviert und der Produktions-Deploy setzt zusätzlich `--keep-vars`, damit alle bestehenden Bindings unverändert erhalten bleiben.

`wrangler.jsonc` führt die für den aktuellen Produktions-Worker zwingenden Binding-Namen übergangsweise unter `secrets.required`. Diese Liste bildet den derzeitigen Remote-Typ ab und enthält deshalb noch einige Nichtsecrets. Maßgeblicher Preflight ist die explizite Namensprüfung: Der Deploy-Wrapper ruft vor dem Build `wrangler secret list --name wuenschi --format json` auf und vergleicht ausschließlich die Namen. Fehlende erforderliche Namen stoppen den Deploy; zusätzliche Namen werden nur gemeldet und bleiben erhalten. Secretwerte können dabei weder gelesen noch ausgegeben werden. Wranglers eigene `secrets.required`-Prüfung bleibt eine zusätzliche zweite Schranke.

Die eigentlichen Geheimnisse `SUPABASE_SECRET_KEY`, `ADMIN_IMPORT_SECRET`, `PUBLIC_WISHLIST_ACCESS_SESSION_SECRET`, `MATS_ACCESS_CODE`, `INTERNAL_CRON_SECRET`, `INTERNAL_PROVISIONING_SECRET` und `BREVO_API_KEY` werden ausschließlich direkt bei Cloudflare gepflegt. Sie gehören nicht in eine lokale Produktions-Env-Datei und werden beim Anwendungsdeploy nicht rotiert. Das veraltete und von der Anwendung nicht mehr gelesene Binding `SELF_SERVICE_SIGNUP_ENABLED` wurde nach dem erfolgreichen Produktionsrollout am 11. August 2026 entfernt.

Für Produktion müssen URL, Publishable Key, serverseitiger Secret Key und `ADMIN_IMPORT_SECRET` aus dem Produktionsprojekt stammen. `APP_ORIGIN` ist `https://wünschi.de`; für den öffentlichen Elternbereich gelten `MULTI_WISHLIST_ENABLED=true`, `PUBLICATION_ENABLED=true`, `PRODUCT_IMPORT_ENABLED=true` und `LEGACY_MATS_ADMIN_ENABLED=true`. Mit aktiviertem Mehrlistenbereich ist die passwortlose Registrierung geöffnet.

## 4. Supabase Auth

Die offene Registrierung der Anwendung erfordert **keine** öffentliche Supabase-Selbstregistrierung. `auth.enable_signup` und `auth.email.enable_signup` bleiben deaktiviert. Die serverseitige Login-Action legt neue Konten über `admin.generateLink` an, sendet den Link vorrangig über Brevo und verwendet Supabase nur als technischen Versand-Rückfallweg mit `shouldCreateUser=false`. Deshalb muss `SUPABASE_SECRET_KEY` in der Worker-Runtime vorhanden sein; ohne Service-Key können bestehende Konten den Supabase-Rückfallweg nutzen, neue Konten aber nicht sicher angelegt werden.

Für Staging den jeweiligen Worker-Host eintragen. Für Produktion unter **Authentication → URL Configuration** eintragen:

```text
Site URL:
https://wünschi.de

Redirect URLs:
https://wünschi.de/auth/callback
https://www.wünschi.de/auth/callback
https://xn--wnschi-3ya.de/auth/callback
https://xn--wnschi-3ya.de/auth/callback*
https://wuenschi.lino-loriz.workers.dev/auth/callback
```

Die Punycode-Varianten sind für die Umlaut-Domain verpflichtend: `new URL("https://wünschi.de").origin` wird technisch als `https://xn--wnschi-3ya.de` übertragen. Fehlen diese Einträge, verwirft Supabase die gewünschte Callback-URL und fällt auf die Site URL zurück. Zusätzlich muss der Magic-Link-E-Mail-Versand eingerichtet und getestet werden.

## 5. Staging prüfen

Die Repository-Konfiguration `wrangler.jsonc` enthält ausschließlich den Produktions-Worker `wuenschi` und dessen Produktionsrouten. Sie darf nicht für einen Staging-Deploy verwendet werden. Staging wird lokal mit `npm run cloudflare:preview` und den isolierten Werten aus `.dev.vars` geprüft. Ein späterer dauerhaft erreichbarer Staging-Worker benötigt eine eigene Wrangler-Konfiguration mit anderem Workernamen und ohne Produktionsrouten.

Vor der Produktion mindestens diese Abläufe testen:

1. Magic-Link anfordern und Session-Cookie setzen.
2. Neues Konto per Magic Link registrieren und die erste geschützte Liste anlegen.
3. Wunsch anlegen, bearbeiten und sortieren.
4. Liste veröffentlichen und öffentliche URL öffnen.
5. Öffentliche Reservierung und Stornierung testen.
6. Einladung an eine zweite E-Mail-Adresse annehmen.
7. Einladungs-E-Mail über Brevo an ein Staging-Testpostfach zustellen und den Link aus der E-Mail öffnen.
8. Mats-Legacy-Seite unter `/mats` und `/admin` auf unveränderte Funktion prüfen.

Die vollständige Staging-Abnahme steht in [staging-acceptance.md](staging-acceptance.md).

## 6. Finale Domain

Erst nach bestandener Staging-Abnahme den Worker mit der Custom Domain verbinden. Danach Produktionswerte setzen:

```text
APP_ORIGIN=https://wünschi.de
```

In Supabase für die Produktion die exakte Callback-URL ergänzen:

```text
https://wünschi.de/auth/callback
https://xn--wnschi-3ya.de/auth/callback
https://xn--wnschi-3ya.de/auth/callback*
```

Die Produktionsmigrationen dürfen erst nach Backup, Mats-Baseline und bestandener Staging-Abnahme ausgeführt werden. Die bestehenden Mats-Daten müssen anschließend erneut gegen die Baseline geprüft werden. Dieser Abgleich wurde am 9. August 2026 erfolgreich durchgeführt: 30 Wünsche, 9 Reservierungen und alle relevanten Fingerprints sind unverändert.

## 7. Deployment-Befehle

```bash
npm run cloudflare:build
npm run cloudflare:preview
```

Der manuelle Produktions-Deploy benötigt nur die beiden öffentlichen Supabase-Buildwerte, die eindeutige Zielangabe und die Bestätigung. Produktionssecrets werden nicht lokal benötigt:

```bash
CLOUDFLARE_DEPLOY_TARGET=production \
  CLOUDFLARE_PRODUCTION_DEPLOY_CONFIRMATION=deploy-wuenschi-production \
  NEXT_PUBLIC_SUPABASE_URL=https://nnrkbdduiiebdahwcofa.supabase.co \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='<production-publishable-key>' \
  npm run cloudflare:deploy:production
```

Der Wrapper prüft Workername, Produktionsrouten, `keep_vars`, `secrets.required`, das exakte Supabase-Produktionsprojekt und anschließend read-only die vorhandenen Remote-Secret-Namen. Serverseitige Runtimewerte werden vor dem Start von Wrangler und OpenNext mit leeren Prozesswerten maskiert, damit Next.js sie nicht über seine eigene `.env.local`-Autoload-Logik wieder in den Produktionsbuild einliest. Die beiden `NEXT_PUBLIC_`-Werte bleiben für den Next-Build erhalten. Cloudflare-API-Credentials stehen nur der Namensprüfung und dem anschließenden Upload zur Verfügung und werden ebenfalls nicht an den Next-Build vererbt. Der Befehl benötigt eine Cloudflare-Anmeldung beziehungsweise ein nur für den Deploy bereitgestelltes CI-Token und verändert keine Supabase-Datenbankmigrationen automatisch.

`APP_ORIGIN` und die Feature-Flags werden absichtlich nicht lokal an den Build übergeben. Sie werden ausschließlich serverseitig zur Request-Laufzeit gelesen; die betroffenen Seiten sind dynamisch und auch das erzeugte OpenNext-Middleware-Artefakt enthält weiterhin die `process.env`-Zugriffe. Damit prägt ein fehlender lokaler Wert weder Produktionsorigin noch Routensperren statisch falsch.

Der npm-Alias startet den Wrapper ohne Env-Datei. `.env.local` bleibt für lokale Entwicklung und ausdrücklich bestätigte Read-only-Inventuren vorgesehen, nicht als Produktions-Secretquelle für den Worker-Deploy.

Mit denselben vier Prozesswerten kann der vollständige Ziel- und Remote-Namenscheck ohne Build oder Deploy ausgeführt werden:

```bash
npm run cloudflare:deploy:production -- --preflight-only
```

## 8. Read-only Produktionsinventur

Vor den Migrationen kann die vorhandene `.env.local` ausschließlich lesend gegen die fest hinterlegte Produktions-Projektkennung geprüft werden:

```bash
PRODUCTION_WISHLIST_INVENTORY_CONFIRMATION=inspect-wuenschi-production-read-only \
  npm run inspect:production:wishlists
```

Das Skript führt nur paginierte `SELECT`-Abfragen aus und gibt ausschließlich Summen aus: aktive und veröffentlichte Listen, unvollständig geschützte Listen, veröffentlichte Listen ohne aktive Wünsche, inkonsistente Code-Paare sowie Mats' aktiven Wunschzähler. Es gibt keine Listentitel, E-Mail-Adressen, Hashes, Schlüssel oder Zugangsdaten aus. Eine abweichende Supabase-Projektkennung beendet den Lauf vor der ersten Netzwerkabfrage.
