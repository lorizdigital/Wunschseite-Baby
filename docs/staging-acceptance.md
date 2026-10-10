# Staging-Abnahme für Mehrnutzer-Wunschlisten

Diese Fälle müssen nach `supabase db push` gegen eine isolierte Staging-Umgebung ausgeführt werden. Jeder Test verwendet zwei verschiedene Auth-Konten (A und B) und zwei verschiedene Listen (L1 und L2). Keine der nachfolgenden Aktionen darf gegen Mats’ Produktionsliste erfolgen.

## Wiederholbarer Basis-Abnahmetest

`npm run test:staging` führt einen abgegrenzten Test gegen die in `.env.staging.local` konfigurierte Instanz aus. Vor dem Lauf müssen dort die folgenden expliziten Schutzwerte gesetzt sein:

```dotenv
STAGING_ENVIRONMENT=staging
STAGING_ACCEPTANCE_CONFIRMATION=run-staging-acceptance
STAGING_SUPABASE_PROJECT_REF=<20-stellige-staging-projektkennung>
STAGING_DATABASE_URL=postgresql://postgres:<url-kodiertes-passwort>@db.<projektkennung>.supabase.co:5432/postgres
STAGING_CLEANUP_CONFIRMATION=cleanup-staging-acceptance
```

`STAGING_SUPABASE_PROJECT_REF` ist exakt der Subdomain-Teil von `NEXT_PUBLIC_SUPABASE_URL`, also bei `https://abc…xyz.supabase.co` die Kennung `abc…xyz`. Der Test akzeptiert nur eine URL dieses Projekts und sperrt zusätzlich die bekannte Mats-Produktionskennung.

`STAGING_DATABASE_URL` ist ausschließlich eine PostgreSQL-Admin-Verbindung für diesen lokalen Testlauf. Sie gehört weder in den Browser noch in ein Deployment und darf nicht eingecheckt werden. Das Passwort muss URL-kodiert sein. Akzeptiert werden nur diese Supabase-Verbindungsformen für dieselbe Projektkennung und die Datenbank `postgres`:

- Direktverbindung: Benutzer `postgres`, Host `db.<projektkennung>.supabase.co`.
- Pooler-Verbindung: Benutzer `postgres.<projektkennung>`, Host `*.pooler.supabase.com`.

Der Test legt drei zufällige, bestätigte Auth-Testkonten an: zwei für die Mandantentrennung und eines für die geschlossene Beta. Er prüft reale `create_wishlist_v1`-, `provision_wishlist_v1`- und `create_wish_v1`-Abläufe, die RLS-Mandantentrennung (A kann weder L2, Wünsche noch Mitglieder von B lesen oder ändern), die nicht öffentlich lesbare Entwurfsliste sowie die veröffentlichte, eng begrenzte Read-RPC. Anschließend prüft er die Reservierung über `reserve_wish_v3`, Idempotenz, Konkurrenzschutz, öffentlichen Reservierungsstatus und `cancel_reservation_v2`.

Zuletzt prüft er den Legacy-Verwaltungspfad für Mats: `admin_release_mats_reservation_v1` hebt eine offene Reservierung ohne Passwort auf. Weil diese Funktion fest an Mats' Wunschlisten-ID gebunden ist, legt das Skript dafür einen einzelnen Abnahme-Wunsch in dieser Liste an, reserviert ihn, gibt ihn über den Service-Role-Schlüssel frei und entfernt ihn wieder. Geprüft werden der Erfolgsfall, das wiederholte Aufheben ohne offene Reservierung (`false` statt Erfolgsmeldung), die Abweisung eines Wunsches außerhalb der Mats-Liste mit `P0002`, der erhaltene Stornovermerk auf der Reservierungszeile und das Entfernen der Idempotenz-Einträge. Die Liste selbst wird nicht verändert.

Die Bereinigung erfolgt absichtlich nicht mit dem Service-Role-Key über die REST-API: Dieser Key hat keine direkten Tabellenrechte. Stattdessen führt das Skript eine feste, parameterfreie SQL-Datei über `npx supabase db query --db-url` aus. Sie läuft in einer Transaktion und löscht nur Auth-Konten, deren E-Mail zur reservierten Testdomain `staging-acceptance.invalid` gehört **und** deren Metadaten die vom Skript gesetzten `staging_acceptance_*`-Marker enthalten. Danach werden die zugehörigen Reservierungs- und Idempotenzdaten, Wünsche, Einladungen, Mitgliedschaften, Listen, Profile, Auth-Konten sowie gegebenenfalls zugehörige Einträge der Storage-Löschwarteschlange in FK-sicherer Reihenfolge entfernt. Dadurch werden auch Reste aus abgebrochenen früheren Testläufen entfernt. Bei einem Datenbankfehler wird die Transaktion zurückgerollt. Die Ausgabe enthält weder Zugangsdaten noch Schlüssel.

Die Abnahme-Vorrichtung für den Legacy-Pfad folgt derselben Logik: Sie trägt einen festen Marker in der Beschreibung des Wunsches, der Aufbau bricht ab, sobald unter der vorgesehenen Wunsch-ID etwas ohne diesen Marker liegt, und jedes Löschen verlangt den Marker zusätzlich zur ID. Reste aus abgebrochenen Läufen werden vor und nach jedem Test entfernt.

Zusätzlich verweigert das Skript explizit die bekannte Mats-Produktions-Projektkennung. Die drei Umgebungsschutzwerte, Projekt-Ref-Abgleich, fest eingeschränkte Datenbank-URL und diese Sperre sind gemeinsam erforderlich.

Der Test ist bewusst kein Ersatz für die unten genannten Browser-E2E- und manuell gesteuerten Sonderfälle (Einladungen, Rollenwechsel, Archivierung und Löschwarteschlange).

| Fall | Aktion | Erwartetes Ergebnis |
|---|---|---|
| Mandantentrennung | A ruft die UUID von L2 über `/api/app/wishlists/[id]`, Wunsch- und Mitgliederendpunkte auf. | Durchgehend 404/403; keine Listendaten, Mitglieder oder Wünsche von B erscheinen. |
| Rollen | B ist `viewer` auf L1 und ruft alle Mutationsendpunkte auf. Danach B als `editor`, danach `owner`. | Viewer kann nichts ändern. Editor nur Wünsche. Owner zusätzlich Listentexte, Veröffentlichung, Link, Mitglieder und Einladungen. |
| Letzter Owner | A versucht, den letzten Owner zu entfernen oder zu `viewer` zu machen. | Datenbank lehnt ab; mindestens ein Owner bleibt erhalten. |
| Einladung | A erstellt eine E-Mail-gebundene Einladung für B; B meldet sich mit derselben E-Mail an und nimmt sie innerhalb von 72 Stunden an. Wiederholung, abgelaufener und widerrufener Link. | Nur die passende E-Mail akzeptiert. Erste Annahme erzeugt exakt eine Mitgliedschaft; Wiederholung/abgelaufen/widerrufen scheitert. |
| Parallele Reservierung | Zehn parallele `POST`s auf denselben veröffentlichten Wunsch mit unterschiedlichen Idempotency Keys. | Genau eine offene Reservierung; neun Antworten sind Konflikte. Derselbe Key liefert beim Wiederholen Erfolg ohne zweite Reservierung. |
| Archivierung | Liste und anschließend Wunsch mit offener Reservierung archivieren. | Archivierte Liste liefert 404 öffentlich und lässt keine Reservierung zu. Ein reservierter Wunsch kann nicht archiviert werden. |
| Mats-Freigabe durch die Verwaltung | Einen Wunsch unter `/mats` reservieren, dann in `/admin` „Reservierung aufheben“ auslösen. | Der Wunsch ist öffentlich wieder frei und erneut reservierbar. Die Übersicht nennt vorher Name und Datum der Reservierung. |
| Mats-Regression | Fingerprints, Wunschanzahl, Reservierungsstatus und Storage-Manifest vor/nach allen Migrationen vergleichen. | Vollständige Übereinstimmung; keine Mats-Mitgliedschaft wird automatisch erzeugt. |
| Löschlauf | Eine fällige, archivierte Testliste mit gespeichertem Produktbild anlegen; Storage beim ersten Löschlauf absichtlich nicht erreichbar machen, danach wiederholen. | Die Liste wird nur datenbankseitig gelöscht. Das Bild bleibt in der Warteschlange und wird beim nächsten erfolgreichen Lauf entfernt. |

Zusätzlich vor der Beta: Browser-E2E für Magic Link, `/neu`, Wunsch-CRUD, Einladungsannahme, Veröffentlichung und öffentliche Reservierung auf Desktop/Mobil; Accessibility-Check für Fokus, Tastatur und Fehlermeldungen.
