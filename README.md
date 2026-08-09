# Wünschi

Wünschi ist eine warme, private Wunschlisten-Anwendung für werdende Familien. Die offizielle Domain ist [wünschi.de](https://wünschi.de). Die öffentliche Root-Adresse `/` ist die Wünschi-Startseite mit Einstieg in den Elternbereich. Mats’ bestehende, vollständige Liste liegt getrennt unter `/mats`; die Mehrlistenverwaltung liegt unter `/app`.

## Projektidentität

| Merkmal | Wert |
|---|---|
| Produktname | Wünschi |
| Offizielle Domain | `wünschi.de` |
| Technischer ASCII-Identifier | `wuenschi` |

Die zentrale technische Quelle für diese Werte ist [src/lib/brand.ts](src/lib/brand.ts). Für lokale Entwicklung bleibt `APP_ORIGIN` auf `http://localhost:3000`; im öffentlichen Betrieb muss es auf `https://wünschi.de` gesetzt werden.

**Produktionsstand, 9. August 2026:** Die Mehrlisten-Migrationen wurden nach Staging-Abnahme in Mats’ Produktionsprojekt eingespielt. Direkt davor und danach wurden Mats’ 30 Wünsche, 9 Reservierungen und die zugehörigen Fingerprints erfolgreich abgeglichen. Die Startseite und der Elternbereich verwenden dieselbe Produktionsdatenbank.

## Funktionsumfang

- geschützte Elternkonten, Rollen und E-Mail-gebundene Einladungen
- bis zu drei aktive Listen je Konto und bis zu 200 aktive Wünsche je Liste
- private Entwurfsvorschau, Veröffentlichung per nicht erratbarem Link und Link-Rotation
- öffentliche Reservierungen ohne Gastkonto; Namen und Passwörter bleiben privat
- Wunschverwaltung, Sortierung, Archivierung und optionaler Produktimport
- Datenexport, Löschantrag und definierte Aufbewahrungsfristen
- Mats’ Legacy-Verwaltung bleibt als unabhängiger Rückfallweg verfügbar

## Lokal starten

```bash
npm install
npm run dev
```

Ohne Supabase-Konfiguration bleibt nur die Wünschi-Startseite verfügbar. Die Mats-Seite verwendet bewusst keine Beispieldaten als Ersatz: Sie benötigt eine funktionierende Supabase-Verbindung. Die Elternverwaltung benötigt zusätzlich einen Publishable Key.

Prüfbefehle:

```bash
npm test
npm run lint
npm run build
```

## Konfiguration

`.env.example` nach `.env.local` kopieren und die folgenden Werte setzen:

| Variable | Zweck | Erforderlich |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL des Supabase-Projekts | Ja für Supabase-Betrieb |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-Schlüssel; alternativ der alte `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Ja für Auth |
| `SUPABASE_SECRET_KEY` | serverseitiger Supabase-Secret-Key; alternativ `SUPABASE_SERVICE_ROLE_KEY` | Ja für Verwaltungs- und Wartungsrouten |
| `ADMIN_IMPORT_SECRET` | gemeinsamer, nur serverseitiger Mats-Legacy-Admin-Code | Ja, solange `/admin` genutzt wird |
| `PUBLIC_WISHLIST_ACCESS_SESSION_SECRET` | signiert die zeitlich begrenzten Zugriffsfreigaben für veröffentlichte Listen | Ja vor Veröffentlichung |
| `MATS_ACCESS_CODE` | separater Zugangscode für die bestehende Seite `/mats` | Ja, solange `/mats` erreichbar ist |
| `MATS_ACCESS_CODE_VERSION` | widerruft beim Wechsel des Mats-Codes bisherige Browser-Freigaben | Ja, solange `/mats` erreichbar ist |
| `APP_ORIGIN` | exakte öffentliche Origin, im Produktivbetrieb `https://wünschi.de` | Ja vor Veröffentlichung |
| `INTERNAL_CRON_SECRET` | separates Geheimnis für die internen Löschläufe | Ja vor Produktivbetrieb |
| `INTERNAL_PROVISIONING_SECRET` | separates Geheimnis für die manuelle Aufnahme in die geschlossene Beta | Ja für geschlossene Beta |
| `MULTI_WISHLIST_ENABLED` | schaltet `/app`, Einladungen und Mehrlisten-APIs frei | Nein, standardmäßig `false` |
| `SELF_SERVICE_SIGNUP_ENABLED` | schaltet `/neu` frei | Nein, standardmäßig `false` |
| `PUBLICATION_ENABLED` | erlaubt das Veröffentlichen von Listen | Nein, standardmäßig `false` |
| `PRODUCT_IMPORT_ENABLED` | erlaubt das serverseitige Auslesen von Produktseiten | Nein, standardmäßig `false` |
| `LEGACY_MATS_ADMIN_ENABLED` | hält den Legacy-Admin als Rückfallweg aktiv | Nein, standardmäßig `true` |

`SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_IMPORT_SECRET`, `PUBLIC_WISHLIST_ACCESS_SESSION_SECRET`, `MATS_ACCESS_CODE`, `INTERNAL_CRON_SECRET` und `INTERNAL_PROVISIONING_SECRET` dürfen niemals mit `NEXT_PUBLIC_` beginnen, in den Browser gelangen oder eingecheckt werden.

## Sichere Inbetriebnahme

1. **Produktentscheidungen bestätigen.** Beta-Modell, Owner-Rollen, Linkmodell, Reservierungsmodell, Sichtbarkeit des Gastnamens, Bildarten sowie Quoten/Löschfristen sind im Umsetzungsplan festgehalten.
2. **Produktionsbestand sichern.** Vorher Datenbank-Backup, Mats-Fingerprints und Storage-Manifest erstellen. Die erwarteten Werte müssen vor der Migration dokumentiert sein.
3. **Staging isolieren.** Ein separates Supabase-Projekt mit eigener Auth- und Storage-Umgebung verwenden.
4. **Migrationen zuerst in Staging prüfen.** `npx supabase db push --dry-run`, dann `npx supabase db push`; anschließend jeden Fall aus [docs/staging-acceptance.md](docs/staging-acceptance.md) mit zwei Testkonten durchführen.
5. **Staging abnehmen.** RLS, Rollen, Einladungen, parallele Reservierungen, Datenlöschung und Mats-Regression müssen bestanden sein.
6. **Produktion migrieren.** Dies wurde am 9. August 2026 nach frischem, lokal geschütztem Datenexport und Baseline-Abgleich durchgeführt. Die Migrationen sind additiv; Mats wurde keinem Elternkonto zugeordnet.
7. **Geschlossen starten.** `MULTI_WISHLIST_ENABLED=true`, aber Selbstregistrierung, Veröffentlichung und Produktimport zunächst bewusst über die jeweiligen Flags steuern. Neue Testfamilien werden dann ausschließlich über den dokumentierten Provisionierungsweg aufgenommen.
8. **Mats getrennt halten.** Die vollständige Bestandsliste bleibt unter `/mats`; `/admin` bleibt ihr separater Legacy-Verwaltungsweg. Eine spätere Übernahme in ein Elternkonto erfordert eine ausdrückliche Entscheidung.

Ein Anwendungsrollback erfolgt über Flags und ein vorheriges Deployment. Nach der Anlage neuer Familienlisten dürfen Tabellen oder Spalten nicht per Down-Migration gelöscht werden; Fehler werden per Forward-Fix behoben.

Die genaue Fingerprint- und Storage-Manifest-Erfassung ist in [docs/mats-baseline.md](docs/mats-baseline.md) dokumentiert.

## Tägliche Wartung

Ein externer Scheduler muss täglich zwei interne, nicht öffentliche Endpunkte per `POST` mit `Authorization: Bearer $INTERNAL_CRON_SECRET` aufrufen:

- `/api/internal/purge-expired-data` entfernt abgelaufene Betriebsdaten, fällige Listen und anschließend deren Produktbilder.
- `/api/internal/purge-deleted-profiles` löscht nach der 30-tägigen Karenzfrist beantragte Konten.

Der erste Lauf löscht ausschließlich Daten, deren Fristen tatsächlich erreicht sind. Für Storage-Objekte nutzt die Anwendung eine dauerhafte Löschwarteschlange: Scheitert der Storage-Aufruf, bleibt der Eintrag offen und wird beim nächsten Lauf erneut versucht.

Für Monitoring den geschützten Endpunkt `GET /api/internal/health` mit demselben Authorization-Header alle fünf Minuten prüfen und bei jedem Nicht-`200` alarmieren. Der Endpunkt gibt absichtlich nur `{ "ok": true|false }` zurück. Anbieter, Empfänger und Eskalationsweg des Alarms werden erst bei Deployment festgelegt.

| Datenart | Frist |
|---|---:|
| stornierte Reservierungen | 30 Tage |
| Reservierungsdaten archivierter Listen | 90 Tage nach Archivierung |
| deaktivierte/abgelaufene Einladungen | kurz nach Ablauf bzw. Widerruf |
| beantragte Kontoentfernung | 30 Tage Karenzzeit |
| beantragte Listenentfernung | 90 Tage Karenzzeit |

Die im Produktplan genannte Erinnerung für unbenutzte Entwürfe nach 180 Tagen benötigt vor der Aktivierung noch einen gewählten E-Mail-Absender und einen Versanddienst.

## Sicherheit und Datenschutz

- Veröffentlichte Listen benötigen Link und Zugangscode. Der Code wird nur als bcrypt-Hash gespeichert; erfolgreiche Eingaben erzeugen eine signierte, 30 Tage gültige HttpOnly-Freigabe. Eine Code-Änderung widerruft bestehende Freigaben.
- Schreibende Routen prüfen Origin und JSON-Requests; Reservierungen haben dauerhafte Rate Limits und Idempotency-Keys.
- Reservierungspasswörter werden nicht im Klartext gespeichert oder ausgegeben.
- Produktimporte prüfen Ziel-URL, DNS-Ziel, Weiterleitungen, Dateityp und Größe.
- Produktbilder liegen im Bucket `product-images`; persönliche Baby- oder Familienbilder sind nicht Bestandteil des aktuellen Produkts.
- Der Datenexport enthält Kontodaten, Mitgliedschaften, Wünsche und Bildreferenzen, aber keine Reservierungsdaten anderer Personen.

Impressum und Datenschutzhinweise liegen unter `/impressum` und `/datenschutz` bereit. Vor der ersten öffentlichen Freigabe müssen sie gegen die tatsächlich gewählte Produktions-Hosting-, SMTP-, Logging- und Backup-Infrastruktur sowie die zugehörigen Auftragsverarbeitungen final geprüft und aktualisiert werden.

## Deployment ohne Domain

Für Entwicklung und Staging genügt eine Plattform-URL. Setze `APP_ORIGIN` dort exakt auf diese URL; Magic Links und Same-Origin-Prüfungen funktionieren nur mit der tatsächlichen Origin. Eine eigene Domain wird erst für den späteren öffentlichen Auftritt benötigt.

Für das geplante Cloudflare-Deployment ist die Anwendung als serverseitiger Worker mit OpenNext vorbereitet. Die Einrichtung von DNS, Cloudflare-Variablen, Supabase-Auth-URLs und die Staging-Reihenfolge steht in [docs/cloudflare-deployment.md](docs/cloudflare-deployment.md). Ein statisches Pages-Deployment ist für die serverseitigen Funktionen dieser Anwendung nicht ausreichend.

## Geschlossene Beta aufnehmen

Wenn `SELF_SERVICE_SIGNUP_ENABLED=false` ist, legt `POST /api/internal/provision-wishlist` ein neues, bestätigtes Elternkonto, eine erste Entwurfsliste und eine Owner-Mitgliedschaft in einem kontrollierten Ablauf an. Der Endpunkt akzeptiert ausschließlich JSON und `Authorization: Bearer $INTERNAL_PROVISIONING_SECRET`; Scheduler und Monitoring können dieses separate Geheimnis nicht verwenden.

Der genaue Staging- und Produktionsablauf steht in [docs/closed-beta-provisioning.md](docs/closed-beta-provisioning.md). Mats wird über diesen Weg nie verändert oder übernommen.
