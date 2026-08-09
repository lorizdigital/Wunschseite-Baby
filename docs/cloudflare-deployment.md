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
APP_ORIGIN
INTERNAL_CRON_SECRET
INTERNAL_PROVISIONING_SECRET
MULTI_WISHLIST_ENABLED
SELF_SERVICE_SIGNUP_ENABLED
PUBLICATION_ENABLED
PRODUCT_IMPORT_ENABLED
LEGACY_MATS_ADMIN_ENABLED
```

Für Staging zunächst empfehlen:

```text
APP_ORIGIN=https://<staging-worker-domain>
MULTI_WISHLIST_ENABLED=true
SELF_SERVICE_SIGNUP_ENABLED=false
PUBLICATION_ENABLED=true
PRODUCT_IMPORT_ENABLED=false
LEGACY_MATS_ADMIN_ENABLED=true
```

`NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` müssen bereits beim Cloudflare-Build vorhanden sein. Der Supabase-Secret-Key und alle übrigen Secrets dürfen nie mit `NEXT_PUBLIC_` beginnen.

Für Produktion müssen URL, Publishable Key, serverseitiger Secret Key und `ADMIN_IMPORT_SECRET` aus dem Produktionsprojekt stammen. `APP_ORIGIN` ist `https://wünschi.de`; die Flags für den geschlossenen Start sind `MULTI_WISHLIST_ENABLED=true`, `SELF_SERVICE_SIGNUP_ENABLED=false`, `PUBLICATION_ENABLED=true`, `PRODUCT_IMPORT_ENABLED=false` und `LEGACY_MATS_ADMIN_ENABLED=true`.

## 4. Supabase Auth

Für Staging den jeweiligen Worker-Host eintragen. Für Produktion unter **Authentication → URL Configuration** eintragen:

```text
Site URL:
https://wünschi.de

Redirect URLs:
https://wünschi.de/auth/callback
https://www.wünschi.de/auth/callback
https://wuenschi.lino-loriz.workers.dev/auth/callback
```

Zusätzlich muss der Magic-Link-E-Mail-Versand eingerichtet und getestet werden.

## 5. Staging prüfen

Vor der Produktion mindestens diese Abläufe testen:

1. Magic-Link anfordern und Session-Cookie setzen.
2. Beta-Familie provisionieren und erste Liste öffnen.
3. Wunsch anlegen, bearbeiten und sortieren.
4. Liste veröffentlichen und öffentliche URL öffnen.
5. Öffentliche Reservierung und Stornierung testen.
6. Einladung an eine zweite E-Mail-Adresse annehmen.
7. Mats-Legacy-Seite unter `/mats` und `/admin` auf unveränderte Funktion prüfen.

Die vollständige Staging-Abnahme steht in [staging-acceptance.md](staging-acceptance.md).

## 6. Finale Domain

Erst nach bestandener Staging-Abnahme den Worker mit der Custom Domain verbinden. Danach Produktionswerte setzen:

```text
APP_ORIGIN=https://wünschi.de
```

In Supabase für die Produktion die exakte Callback-URL ergänzen:

```text
https://wünschi.de/auth/callback
```

Die Produktionsmigrationen dürfen erst nach Backup, Mats-Baseline und bestandener Staging-Abnahme ausgeführt werden. Die bestehenden Mats-Daten müssen anschließend erneut gegen die Baseline geprüft werden. Dieser Abgleich wurde am 9. August 2026 erfolgreich durchgeführt: 30 Wünsche, 9 Reservierungen und alle relevanten Fingerprints sind unverändert.

## 7. Deployment-Befehle

```bash
npm run cloudflare:build
npm run cloudflare:preview
npm run cloudflare:deploy
```

Der Deploy-Befehl benötigt eine Cloudflare-Anmeldung beziehungsweise ein CI-Token. Er verändert keine Supabase-Datenbankmigrationen automatisch.
