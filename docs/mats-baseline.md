# Mats-Baseline vor Datenbankmigrationen

Das Script `scripts/capture-mats-baseline.mjs` erstellt einen lokalen, nicht versionierten Nachweis für Mats’ Bestandsdaten. Es enthält keine Klartext-Reservierungsdaten oder Passwort-Hashes, sondern nur Zähler, IDs, Bildklassifikationen und SHA-256-Fingerprints. Das Storage-Manifest enthält Objektmetadaten und wird deshalb ebenfalls ausschließlich unter `.baseline/` gespeichert.

## Vor der Migration

1. Zuerst einen Wiederherstellungspunkt/Backup und einen separaten Storage-Export im Supabase-Dashboard erstellen.
2. Die tatsächlich verwendete Produktionskonfiguration nur in einer sicheren Shell laden.
3. Baseline erfassen:

```bash
node --env-file=.env.local scripts/capture-mats-baseline.mjs --out .baseline/mats-before.json
```

Das Script erwartet genau 30 Wünsche und 9 Reservierungen, wie im Umsetzungsplan dokumentiert. Eine andere Zahl beendet den Aufruf mit Fehlercode `2`; Ursache vor jeder Migration aufklären, nicht den Referenzwert anpassen.

Falls zusätzlich ein Tabellenexport erforderlich ist, `--include-records` bewusst ergänzen. Dann enthält die Ausgabe auch Gastnamen, Passwort-Hashes und Reservierungszeitpunkte und ist daher nur in einem verschlüsselten, zugriffsbeschränkten Arbeitsbereich zulässig:

```bash
node --env-file=.env.local scripts/capture-mats-baseline.mjs \
  --include-records \
  --out .baseline/mats-before-record-export.json
```

Alle Ausgaben unter `.baseline/` sind per `.gitignore` ausgeschlossen und werden mit Dateirechten `0600` angelegt. Sie dürfen weder eingecheckt noch weitergegeben werden.

## Nach der Migration

Nach den additiven Migrationen erneut erfassen und vergleichen:

```bash
node --env-file=.env.local scripts/capture-mats-baseline.mjs \
  --compare .baseline/mats-before.json \
  --out .baseline/mats-after.json
```

Ein abweichender Fingerprint oder Zähler beendet den Aufruf mit Fehlercode `2`. Zulässige neue Mehrlistenfelder wie `public_slug`, `visibility`, `delete_after` und `image_storage_path` sind bewusst nicht Teil des Altbestands-Fingerprints. Bei Abweichungen sofort Flags deaktivieren und nicht weiter migrieren.

Das Script ist ein Integritätsnachweis, kein Ersatz für Backup, Storage-Export, Screenshots der Root-/Admin-Seite und die Staging-Abnahme.

## Erfasster Ausgangsnachweis

Am 5. August 2026 wurde gegen die konfigurierte Bestandsumgebung eine Baseline erstellt. Sie bestätigt 30 Wünsche (28 aktiv, 2 archiviert), 9 Reservierungen (7 offen, 2 storniert), 30 lokale Produktpfade unter `/products/` und keine Objekte im Bucket `product-images`. Die vollständigen SHA-256-Fingerprints und Objektmetadaten liegen ausschließlich in der nicht versionierten Datei `.baseline/mats-before-multi-wishlist.json`.

Ein lokaler Smoke-Test gegen dieselbe Konfiguration bestätigte außerdem, dass `/` „Wünsche für Mats“ und genau die 28 aktiven Wunschkarten rendert. `/api/reservations/status` lieferte sieben offene Wunsch-IDs. Dabei wurden keine Daten geschrieben.
