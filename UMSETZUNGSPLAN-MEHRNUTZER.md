# Umsetzungsplan: Baby-Wunschlisten für weitere Familien

## Status und Ziel

Dieses Dokument ist die fachliche und technische Grundlage für die Weiterentwicklung der bestehenden Baby-Wunschwebseite zu einer Mehrnutzerplattform.

Die klare Architekturentscheidung lautet:

- Supabase bleibt die gemeinsame Datenbasis.
- Es wird keine eigene Datenbank und keine eigene Tabelle pro Familie angelegt.
- Jede Familie erhält einen eigenen Datensatz in `wishlists`.
- Die Trennung erfolgt über `wishlist_id`, Mitgliedschaften und Supabase Row Level Security (RLS).
- Die bestehende Mats-Liste wird weder kopiert noch neu erstellt.
- Mats bleibt als getrennte Legacy-Liste unter `/mats` erreichbar; `/` wird die Wünschi-Startseite für Eltern.
- Die Entwicklung beginnt erst auf Grundlage dieses Plans.

## Unveränderliche Anforderungen für Mats

Mats wird technisch zur ersten Liste beziehungsweise zum ersten Mandanten der erweiterten Plattform.

Folgende Bestandsdaten müssen unverändert erhalten bleiben:

- Listen-ID: `3d1f46e6-8e0e-4418-a0da-581be7cf795f`
- alle vorhandenen Wunsch-IDs
- alle vorhandenen Wunschfelder und Sortierungen
- alle vorhandenen Reservierungs-IDs
- Passwort-Hashes und Reservierungszeitpunkte
- Bildadressen und Storage-Objekte
- GoWish-Quellinformationen
- eigener öffentlicher Pfad `/mats`
- bestehende Reservierungs- und Freigabefunktion

Referenzbestand zum Zeitpunkt der Planung:

- 1 Wunschliste
- 30 Wünsche
- 9 Reservierungsdatensätze

`/admin` bleibt während der Übergangsphase als Mats-Verwaltung verfügbar. Der bisherige globale Admin-Code darf nach Einführung weiterer Listen ausschließlich Mats autorisieren und niemals Zugriff auf andere Familienlisten ermöglichen.

## Grundmodell in Supabase

Alle Familien verwenden dieselben Tabellen. Die Datentrennung erfolgt zeilenweise:

```text
Supabase Auth
    │
    └── auth.users
          │
          └── wishlist_members
                 │
                 └── wishlists
                       │
                       └── wishes
                             │
                             └── reservations
```

Beispiel:

```text
Liste Mats:      wishlist_id = 3d1f46e6-...
Liste Familie B: wishlist_id = neue UUID
Liste Familie C: wishlist_id = neue UUID
```

Jeder Wunsch gehört über `wishes.wishlist_id` genau einer Liste. Jede Reservierung gehört über `reservations.wish_id` zu einem Wunsch und damit eindeutig zu einer Liste.

## Zieldatenmodell

### Bestehende Tabelle `public.wishlists`

Die Tabelle bleibt bestehen und wird ausschließlich additiv erweitert.

| Feld | Status | Zweck |
|---|---|---|
| `id` | vorhanden | UUID der Liste; Mats-ID bleibt unverändert |
| `title` | vorhanden | Öffentlicher Listentitel |
| `intro` | vorhanden | Öffentliche Einleitung |
| `owner_user_id` | vorhanden | Übergangsfeld für den Hauptbesitzer |
| `published_at` | vorhanden | Veröffentlichungszeitpunkt |
| `archived_at` | vorhanden | Archivierung/Soft-Delete |
| `created_at`, `updated_at` | vorhanden | Zeitstempel |
| `public_slug` | neu | Zufällige, eindeutige öffentliche Listenadresse |
| `visibility` | neu | Zunächst `unlisted`, später optional `access_code` |
| `delete_after` | neu, optional | Termin für eine kontrollierte endgültige Löschung |

Vorgaben für `public_slug`:

- eindeutig per Unique-Index
- nicht ausschließlich aus dem Babynamen erzeugen
- mindestens 128 Bit Zufall
- nur URL-sichere Zeichen
- rotierbar, falls ein Link versehentlich öffentlich wird

Beispiel:

```text
/w/7Mwh4oeqP8sN2RuLpljY3w
```

Der Zustand einer Liste wird zunächst aus den bestehenden Feldern abgeleitet:

```text
Entwurf:       published_at IS NULL AND archived_at IS NULL
Veröffentlicht: published_at IS NOT NULL AND archived_at IS NULL
Archiviert:    archived_at IS NOT NULL
```

Damit wird kein zusätzliches redundantes Statusfeld benötigt.

### Neue Tabelle `public.profiles`

`profiles` ergänzt Supabase Auth. Es werden keine Passwörter oder Authentifizierungsgeheimnisse gespeichert.

| Feld | Typ | Zweck |
|---|---|---|
| `user_id` | `uuid` PK/FK | Verweis auf `auth.users.id` |
| `display_name` | `text` | Anzeigename im Elternbereich |
| `created_at` | `timestamptz` | Erstellung |
| `updated_at` | `timestamptz` | letzte Änderung |
| `deleted_at` | `timestamptz`, nullable | kontrollierter Kontolöschprozess |

### Neue Tabelle `public.wishlist_members`

Diese Tabelle erlaubt mehreren Eltern beziehungsweise Verwaltern Zugriff auf dieselbe Liste.

| Feld | Typ | Zweck |
|---|---|---|
| `wishlist_id` | `uuid` FK | zugehörige Liste |
| `user_id` | `uuid` FK | Supabase-Auth-Nutzer |
| `role` | `text` | `owner`, `editor`, optional `viewer` |
| `created_by` | `uuid`, nullable | einladender Nutzer |
| `created_at` | `timestamptz` | Zeitpunkt der Mitgliedschaft |

Primärschlüssel:

```text
(wishlist_id, user_id)
```

Rollen:

- `owner`: veröffentlichen, Mitglieder verwalten, Share-Link rotieren, exportieren, archivieren und löschen
- `editor`: Wünsche anlegen, bearbeiten, sortieren und archivieren
- `viewer`: optional reine Verwaltungsansicht

Mindestens ein Owner muss bestehen bleiben. Eigentumsübertragung und Entfernung des letzten Owners müssen über geprüfte Datenbankfunktionen verhindert werden.

`wishlists.owner_user_id` bleibt während der Übergangsphase erhalten. Langfristig wird `wishlist_members` zur maßgeblichen Rechtequelle.

### Neue Tabelle `public.wishlist_invitations`

| Feld | Typ | Zweck |
|---|---|---|
| `id` | `uuid` PK | Einladung |
| `wishlist_id` | `uuid` FK | betroffene Liste |
| `email_normalized` | `text`, nullable | eingeladene E-Mail-Adresse |
| `role` | `text` | vorgesehene Rolle |
| `token_hash` | `bytea` UNIQUE | Hash des Einladungstokens |
| `invited_by` | `uuid` FK | einladender Nutzer |
| `expires_at` | `timestamptz` | Ablauf, empfohlen 72 Stunden |
| `accepted_at` | `timestamptz`, nullable | Annahme |
| `revoked_at` | `timestamptz`, nullable | Widerruf |
| `created_at` | `timestamptz` | Erstellung |

Einladungstokens werden nie im Klartext gespeichert.

### Bestehende Tabelle `public.wishes`

Die Tabelle bleibt grundsätzlich unverändert. `wishlist_id` ist bereits der richtige Mandantenschlüssel.

Optional ergänzen:

| Feld | Typ | Zweck |
|---|---|---|
| `image_storage_path` | `text`, nullable | Storage-Pfad für kontrollierte spätere Löschung |

Die bisherigen `image_url`-Werte werden nicht verändert. Lokale Mats-Pfade unter `/products/...` bleiben bestehen.

Neue importierte Produktbilder werden nach folgendem Muster gespeichert:

```text
product-images/<wishlist_id>/<zufällige-datei-id>.<endung>
```

Die Listen-ID muss künftig aus dem autorisierten Listenkontext übergeben werden. Sie darf nicht mehr global aus `WISHLIST_ID` gelesen werden.

### Bestehende Tabelle `public.reservations`

Die vorhandenen Reservierungen bleiben unverändert. Eine zusätzliche `wishlist_id` ist zunächst nicht notwendig, da sie über `reservations.wish_id → wishes.wishlist_id` eindeutig ermittelt werden kann.

Es werden neue versionierte Datenbankfunktionen angelegt:

```text
reserve_wish_v2(
  p_wishlist_id,
  p_wish_id,
  p_guest_name,
  p_password
)

cancel_reservation_v2(
  p_wishlist_id,
  p_wish_id,
  p_password
)
```

Beide Funktionen müssen prüfen:

1. Die Liste existiert.
2. Die Liste ist veröffentlicht und nicht archiviert.
3. Der Wunsch gehört zur angegebenen Liste.
4. Der Wunsch ist nicht archiviert.
5. Es existiert noch keine offene Reservierung.
6. Reservierung beziehungsweise Freigabe erfolgt atomar.

Die bisherigen Reservierungsfunktionen bleiben während des Rollback-Zeitraums erhalten.

### Optionale Tabelle `public.audit_events`

Empfohlen für administrative Nachvollziehbarkeit:

| Feld | Zweck |
|---|---|
| `id` | fortlaufende ID |
| `wishlist_id` | betroffene Liste |
| `actor_user_id` | handelnder Nutzer |
| `action` | Aktion, z. B. `wishlist.published` |
| `entity_type`, `entity_id` | betroffenes Objekt |
| `metadata` | begrenzte technische Metadaten |
| `created_at` | Zeitpunkt |

Nicht protokollieren:

- Passwörter
- Reservierungs- oder Einladungstokens
- Auth-Header
- unnötige Gastnamen
- vollständige Produkt- oder Beschreibungstexte

## Routenmodell

| Route | Zweck |
|---|---|
| `/` | Wünschi-Startseite mit Einstieg in den Elternbereich |
| `/mats` | bestehende Mats-Legacy-Seite |
| `/admin` | Übergangsweise Mats-Verwaltung |
| `/w/[publicSlug]` | öffentliche Liste einer Familie |
| `/app` | Übersicht eigener Listen |
| `/app/lists/[wishlistId]` | Verwaltung einer Liste |
| `/neu` | Onboarding und neue Liste |
| `/api/public/wishlists/[slug]/status` | listenbezogener Reservierungsstatus |
| `/api/public/wishlists/[slug]/reservations` | Reservieren und Freigeben |
| `/api/app/wishlists/[id]/...` | authentifizierte Verwaltung |

Die Route `/mats` löst ausdrücklich Mats’ bestehende UUID auf. Sie darf nicht über einen veränderbaren Slug oder eine allgemeine Fallback-Logik von anderen Listen abhängen. Die Root-Route `/` enthält niemals Mats-Daten.

Unbekannte Slugs liefern 404. Eine Datenbankstörung oder ein unbekannter Slug darf niemals Mats als Fallback für eine fremde Liste anzeigen.

## Authentifizierung und Onboarding

Empfehlung für Eltern: Supabase Auth mit E-Mail-Magic-Link oder E-Mail-OTP.

Onboarding:

1. E-Mail-Adresse eingeben und bestätigen.
2. Profil mit Anzeigenamen anlegen.
3. Neue Liste im Entwurfszustand anlegen.
4. Titel und Einleitung festlegen.
5. Ersten Wunsch manuell oder über Produktimport hinzufügen.
6. Gastansicht in einer Vorschau prüfen.
7. Liste veröffentlichen.
8. Zufälligen Share-Link erhalten.
9. Optional zweiten Elternteil einladen.

Sessions werden über sichere `HttpOnly`, `Secure`, `SameSite=Lax`-Cookies geführt. Serverseitig wird der Nutzer über Supabase `getUser()` validiert.

Gäste benötigen weiterhin kein Konto.

Das bestehende Reservierungspasswort wird für Mats beibehalten. Für neue Reservierungen wird eine Mindestlänge von acht Zeichen empfohlen. Die Freigabe-API muss weiterhin kürzere bestehende Mats-Passwörter akzeptieren.

## RLS- und Service-Role-Konzept

Row Level Security muss auf allen mandantenbezogenen Tabellen aktiviert sein.

Regeln:

- Nutzer lesen nur eigene Profile.
- Mitglieder lesen nur Listen, in denen sie Mitglied sind.
- Owner verwalten Mitglieder und Listeneinstellungen.
- Owner und Editor verwalten ausschließlich Wünsche ihrer eigenen Listen.
- Familie A erhält keinen Zugriff auf Familie B.
- Gäste erhalten keinen direkten Tabellenzugriff auf Reservierungen.
- Öffentliche Gastdaten werden nur über sichere Views, RPCs oder serverseitige Endpunkte ausgeliefert.
- Passwort- und Token-Hashes erscheinen nie in Views oder API-Antworten.

Der bestehende Supabase-Service-Key umgeht RLS. Normale Elternaktionen müssen deshalb künftig mit einem nutzergebundenen Supabase-Client erfolgen.

Der Service-Key bleibt ausschließlich für eng begrenzte Serveraufgaben:

- atomare Reservierungs-RPCs
- gesicherter Produktimport
- Storage-Verarbeitung
- Wartungs- und Löschjobs

Auch bei Service-Role-Aufrufen muss die Listenzugehörigkeit serverseitig geprüft werden. Eine vom Browser gelieferte `wishlist_id` ist keine Autorisierung.

## Entwicklungsphasen

### Phase 0 – Bestandsaufnahme, Sicherung und Staging

Aufgaben:

- Supabase-Datenbankbackup beziehungsweise Wiederherstellungspunkt bestätigen.
- Export von `wishlists`, `wishes` und `reservations` erstellen.
- Manifest aller Objekte im Bucket `product-images` sichern.
- Bildreferenzen nach lokalen Pfaden, Supabase-Objekten und externen URLs einordnen.
- Wunsch- und Reservierungsfelder per SHA-256-Fingerprint dokumentieren.
- Statusverteilung der neun Reservierungsdatensätze festhalten.
- Screenshots und E2E-Baseline für `/mats` und `/admin` erstellen.
- getrennte Entwicklungs-, Staging- und Produktionsumgebung festlegen.

Wichtig: Ein Datenbankbackup sichert nicht automatisch die eigentlichen Storage-Dateien.

Abnahme:

- Mats-Referenzbestand ist reproduzierbar dokumentiert.
- Datenbank- und Storage-Sicherung sind vorhanden.
- Rückkehr zum aktuellen Deployment ist möglich.

### Phase 1 – Additive Datenbankmigration

Aufgaben:

- `wishlists.public_slug` zunächst nullable ergänzen.
- `wishlists.visibility` ergänzen.
- optional `wishlists.delete_after` ergänzen.
- optional `wishes.image_storage_path` ergänzen.
- `profiles` anlegen.
- `wishlist_members` anlegen.
- `wishlist_invitations` anlegen.
- optional `audit_events` und persistente Rate-Limit-Tabelle anlegen.
- Indizes, Foreign Keys und Check-Constraints anlegen.
- RLS auf neuen Tabellen aktivieren.
- keine bestehende Spalte, Policy oder Funktion löschen.

Mats-Backfill:

- ausschließlich für die bekannte Mats-UUID einen zufälligen Slug ergänzen
- `visibility = 'unlisted'` setzen
- keine Updates an `wishes`
- keine Updates an `reservations`
- keine Änderung an `image_url`
- keine Änderung an `published_at` oder `archived_at`

Erst nachdem alle Listen einen Slug besitzen, kann `public_slug` auf `NOT NULL` gesetzt werden.

Abnahme:

- Altbestand-Fingerprints sind unverändert.
- Mats hat zusätzlich einen gültigen Slug.
- das bisherige Deployment läuft weiterhin.

### Phase 2 – Versionierte RPCs und Datenzugriffsschicht

Aufgaben:

- `reserve_wish_v2` anlegen.
- `cancel_reservation_v2` anlegen.
- atomare Funktion für Listenerstellung anlegen.
- optional Einladungsannahme und Eigentumsübertragung als RPC umsetzen.
- globale `getWishlistId()`-Abhängigkeit durch expliziten Listenkontext ersetzen.
- jede Abfrage und Mutation auf die konkrete Liste begrenzen.
- Reservierungsstatus über `wishes.wishlist_id` filtern.
- unbekannte Listen fail-closed behandeln.
- Bildspeicherung auf `storeProductImage(wishlistId, imageUrl)` umstellen.
- alte RPCs mindestens zwei stabile Releases beziehungsweise 14 Tage behalten.

Abnahme:

- Status einer Liste enthält keine Wunsch-ID einer anderen Liste.
- Slug A mit Wunsch-ID B wird abgewiesen.
- parallele Reservierungen ergeben genau einen Erfolg.
- `/mats` lädt weiterhin ausdrücklich Mats.

### Phase 3 – Supabase Auth, Mitgliedschaften und RLS

Aufgaben:

- Magic-Link- oder OTP-Anmeldung integrieren.
- sichere Cookie-Sessions einrichten.
- Profile anlegen und bearbeiten.
- Owner-, Editor- und optionale Viewer-Rolle implementieren.
- Einladungen erstellen, annehmen, widerrufen und ablaufen lassen.
- RLS-Policies und erforderliche Helper-Funktionen entwickeln.
- Service-Role-Nutzung auf definierte Serverfälle reduzieren.
- Tests mit mindestens zwei Nutzern und zwei Listen erstellen.

Abnahme:

- Owner A kann Liste B auch mit bekannter UUID nicht lesen oder verändern.
- Editor darf keine Mitglieder oder Eigentümerrechte verwalten.
- letzter Owner kann nicht entfernt werden.
- abgelaufene oder widerrufene Einladungen sind unbrauchbar.

### Phase 4 – Öffentliche Listenrouten

Aufgaben:

- `/w/[publicSlug]` implementieren.
- Titel, Einleitung, Branding und Metadaten dynamisch machen.
- Mats-spezifische Texte ausschließlich für die Mats-Seite verwenden.
- öffentliche Status- und Reservierungsendpunkte auf den Slug begrenzen.
- Slug-Rotation ermöglichen.
- archivierte Listen mit 404 oder 410 beantworten.
- `noindex`, `nofollow`, `noarchive` beibehalten.

Abnahme:

- jede Testfamilie erhält eine isolierte öffentliche Liste.
- unbekannte Slugs zeigen niemals Mats.
- öffentliche Antworten enthalten keine Gastnamen oder Hashes.

### Phase 5 – Elternbereich und Onboarding

Aufgaben:

- Listenübersicht implementieren.
- neue Liste als Entwurf anlegen.
- Titel und Einleitung bearbeiten.
- Wünsche hinzufügen, bearbeiten, sortieren und archivieren.
- Produktimport und Bildspeicherung listenbezogen machen.
- Vorschau und Veröffentlichung ergänzen.
- Share-Link kopieren und rotieren.
- zweiten Elternteil einladen.
- Export, Archivierung und Löschantrag ergänzen.
- Quoten serverseitig durchsetzen.

Vorgeschlagene Startquoten:

- maximal drei aktive Listen pro Konto
- maximal 200 aktive Wünsche pro Liste
- maximal 5 MB pro Produktbild
- maximal 20 Produktimporte pro Nutzer und Stunde

### Phase 6 – Sicherheit, Datenschutz und Betrieb

Sicherheitsaufgaben:

- dauerhafte Rate Limits implementieren
- Same-Origin- und CSRF-Schutz ergänzen
- Content Security Policy und weitere Sicherheitsheader setzen
- Produktimport weiterhin gegen SSRF und unsichere Redirects schützen
- Idempotency-Key für Reservierungen prüfen
- Demo-Modus in Produktion deaktivieren
- Produkt- und Verwaltungsrouten konsequent `no-store` ausliefern
- keine Tokens, Gastnamen oder Auth-Header protokollieren
- Monitoring und Alarmierung ergänzen

Vorgeschlagene Rate Limits:

- Reservieren: 10 Versuche pro IP in 10 Minuten, zusätzlich 3 pro Wunsch
- Freigeben: 10 Passwortversuche pro IP und Wunsch in 15 Minuten
- Listenerstellung: 3 Listen pro Konto und Tag
- Produktimport: 20 Vorgänge pro Nutzer und Stunde

Datenschutzaufgaben:

- Datenschutzerklärung und Impressum fertigstellen
- Supabase-, Hosting-, Logging- und Backup-Regionen prüfen
- Auftragsverarbeitungsverträge prüfen
- Datenexport und Löschworkflow bereitstellen
- keine vollständigen Geburtsdaten, Adressen oder Gesundheitsdaten abfragen
- persönliche Baby-/Familienbilder nur in privatem Bucket speichern
- Produktbilder dürfen im vorhandenen öffentlichen Bucket bleiben

Vorgeschlagene Löschfristen:

- stornierte Reservierungen nach 30 Tagen
- übrige Gast-/Reservierungsdaten 90 Tage nach Listenarchivierung
- unbenutzte Entwürfe nach Erinnerung nach 180 Tagen
- Einladungen kurz nach Ablauf oder Widerruf bereinigen

### Phase 7 – Mats-Kontoübernahme

Erst nach stabiler Mehrlistenfunktion:

1. Elternkonto über Supabase Auth anlegen beziehungsweise einladen.
2. Auth-Nutzer-ID nach bestätigter Anmeldung prüfen.
3. Mats-Liste diesem Konto als Owner zuordnen.
4. neue Verwaltung vollständig testen.
5. bisherigen Admin-Code weiterhin als Rückfallweg behalten.
6. Legacy-Admin erst nach bestätigter Übernahme deaktivieren.

Mats darf zu keinem Zeitpunkt von einer sofortigen oder fehlgeschlagenen Accountanlage abhängig sein.

### Phase 8 – Kontrollierter Rollout

Reihenfolge:

1. interne zweite Testliste
2. interne Testphase mit drei bis fünf Familien
3. öffentliche Registrierung mit Monitoring und Supportweg
4. Auswertung von Fehlern und Nutzung
5. schrittweise Aktivierung der Veröffentlichungs- und Importfunktionen

Feature-Flags:

- `MULTI_WISHLIST_ENABLED`
- `PUBLICATION_ENABLED`
- `PRODUCT_IMPORT_ENABLED`
- `LEGACY_MATS_ADMIN_ENABLED`

## Test- und Abnahmematrix

### Mandantentrennung

| Akteur | Liste A | Liste B |
|---|---|---|
| Owner A | vollständig verwalten | kein Zugriff |
| Editor A | Inhalte verwalten | kein Zugriff |
| Gast mit Slug A | veröffentlichte Gastansicht | kein Zugriff |
| anonymer Nutzer ohne Slug | kein Zugriff | kein Zugriff |
| archivierte Liste | Owner-Ansicht nach Regel | öffentlich 404/410 |

### Mats-Unverändertheitsnachweis

Vor und nach jeder Migrationsphase prüfen:

- identische Mats-Listen-ID
- identische 30 Wunsch-IDs
- identische bisherigen Wunschfelder
- identische Produktreihenfolge
- identische neun Reservierungs-IDs
- identische Reservierungsfelder, Hashes und Zeitstempel
- identische Statusverteilung der Reservierungen
- identische `image_url` je Wunsch
- identische GoWish-Quellidentitäten
- alle lokalen Mats-Bilddateien weiterhin vorhanden
- alle referenzierten Storage-Objekte weiterhin vorhanden

Neue Felder wie `public_slug` werden vom Altbestands-Fingerprint ausgeschlossen.

### Integritätsprüfungen

Erwartete Ergebnisse:

- keine verwaisten Wünsche
- keine verwaisten Reservierungen
- höchstens eine offene Reservierung pro Wunsch
- alle Slugs eindeutig und nicht leer
- jede neue Liste besitzt mindestens einen Owner
- jede Mitgliedschaft verweist auf existierende Liste und Nutzer
- Storage-Pfade neuer Bilder beginnen mit der zugehörigen `wishlist_id`

### Sicherheits- und Funktionstests

- Nutzer A kann Liste B nicht lesen oder verändern.
- Wunsch A kann nicht über den Endpunkt von Liste B reserviert werden.
- zehn parallele Reservierungen ergeben einen Erfolg und neun Konflikte.
- Status einer Liste enthält ausschließlich deren Wunsch-IDs.
- unbekannte Slugs ergeben 404 und niemals Mats-Fallback.
- Passwort- und Token-Hashes erscheinen in keiner Antwort oder Logausgabe.
- Storage-Zugriff funktioniert nicht listenübergreifend.
- SSRF-, XSS-, CSRF- und Brute-Force-Tests sind erfolgreich.
- DSGVO-Export und Löschlauf umfassen Datenbank und Storage.
- Sessionablauf, Logout und Magic-Link-Fehlerfälle sind abgedeckt.
- mobile Ansicht, Tastaturbedienung, Screenreader und Kontrast sind geprüft.

### Mats-Regressionsabnahme

- `/` zeigt die Wünschi-Startseite ohne Mats-Daten.
- `/mats` zeigt Mats’ vollständige Bestandsliste.
- Reservieren funktioniert weiterhin.
- Freigeben bestehender Reservierungen funktioniert weiterhin.
- `/admin` funktioniert während der Übergangsphase.
- Produktlinks und Bilder sind unverändert.
- Filter und Reservierungszähler stimmen.

## Rollback-Konzept

### Vor Freigabe neuer Familien

Der primäre Rollback ist ein Anwendungsrollback:

1. neue Feature-Flags deaktivieren
2. vorheriges Deployment aktivieren
3. Mats läuft weiter über die bekannte UUID
4. additive Tabellen und Spalten bleiben bestehen, werden aber ignoriert
5. alte RPCs stehen weiterhin zur Verfügung

Ein Datenbank-Restore ist dabei normalerweise nicht erforderlich.

### Nach Anlage neuer Familienlisten

Sobald neue Familien produktive Daten erstellt haben, dürfen neue Tabellen nicht mehr per Down-Migration gelöscht werden.

Vorgehen bei Problemen:

1. Neuanlage und Veröffentlichung deaktivieren.
2. Neue Routen bei Bedarf in Wartungsmodus versetzen.
3. vorhandene Daten vollständig erhalten.
4. Fehler per Forward-Fix korrigieren.
5. Mats weiterhin über den Legacy-Pfad bereitstellen.

Ein vollständiger Datenbank-Restore ist nur bei nachgewiesener Datenbeschädigung zulässig. Seit dem Backup angelegte Fremdlisten müssen vor einem Restore separat exportiert werden.

## Aufwand und Entwicklungsschnitte

| Arbeitspaket | Grober Aufwand |
|---|---:|
| Sicherung, Staging und additive Datenbankmigration | 2–3 Tage |
| Mandantenfähige Datenzugriffsschicht | 3–5 Tage |
| Supabase Auth, Mitgliedschaften und RLS | 4–6 Tage |
| Routing und öffentliche Listen | 3–5 Tage |
| Elternbereich und Onboarding | 5–8 Tage |
| Sicherheit, Datenschutz, Tests und Rollout | 4–7 Tage |

Gesamt für eine belastbare Selbstbedienungsplattform bei einer entwickelnden Person:

```text
ungefähr 4–7 Entwicklungswochen
```

Ein kleineres Zwischenziel, bei dem neue Familien zunächst manuell angelegt werden, ist voraussichtlich in 1–2 Wochen erreichbar.

## Empfohlener erster Produktumfang

- gemeinsame Supabase-/PostgreSQL-Datenbasis
- geschlossene, einladungsbasierte Beta
- zwei gleichberechtigte Eltern-Owner möglich
- zufällige, nicht indexierte Share-Links
- Gäste ohne Konto
- Reservierung weiterhin mit Gastname und Passwort
- Gastname für andere Gäste und standardmäßig auch für Eltern nicht sichtbar
- zunächst nur Produktbilder, keine persönlichen Babyfotos
- Mats bleibt dauerhaft unter `/mats` erreichbar

## Vor Entwicklungsbeginn zu bestätigende Produktentscheidungen

1. Startet die Beta ausschließlich auf Einladung?
2. Sollen beide Eltern gleichberechtigte Owner sein?
3. Reicht zunächst ein nicht erratbarer Share-Link ohne zusätzlichen PIN?
4. Bleibt die Reservierung für Gäste bei Name und Passwort?
5. Sehen Eltern nur den Status `reserviert` oder auch den Gastnamen?
6. Werden zunächst ausschließlich Produktbilder unterstützt?
7. Werden die vorgeschlagenen Quoten und Löschfristen übernommen?

## Definition of Ready

Die Entwicklung kann beginnen, wenn:

- die sieben Produktentscheidungen bestätigt sind
- ein aktuelles Backup- und Storage-Manifest vorliegt
- Staging und Produktion getrennt sind
- die Mats-Baseline dokumentiert ist
- die Reihenfolge der Entwicklungsphasen akzeptiert ist
- die erste Umsetzung ausschließlich additive Änderungen vorsieht

## Dokumentierter Analyseumfang

Für diesen Plan wurden getrennte Teilprüfungen durchgeführt:

- Datenmigration, Bestandsschutz, Backfill und Rollback
- Authentifizierung, RLS, Routing, Sicherheit, Datenschutz und Rollout
- Vergleich mit dem Mehrlisten- und Linkmodell des Projekts Mitgefeiert

Zum Zeitpunkt der Erstellung dieses Dokuments wurden keine Anwendungskomponenten, Supabase-Tabellen oder Produktivdaten verändert.
