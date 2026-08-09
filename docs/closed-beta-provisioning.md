# Geschlossene Beta: Familie aufnehmen

Dieser Ablauf dient ausschließlich zum kontrollierten Anlegen einer **neuen** Testfamilie, solange `SELF_SERVICE_SIGNUP_ENABLED=false` ist. Er erstellt genau ein Elternkonto, eine Entwurfsliste und eine Owner-Mitgliedschaft. Mats’ Liste und vorhandene Nutzer werden nicht berührt.

## Voraussetzungen

- Zuerst gegen Staging testen, nicht gegen Mats’ Produktion.
- `MULTI_WISHLIST_ENABLED=true` und `SELF_SERVICE_SIGNUP_ENABLED=false` setzen.
- Einen zufälligen, separaten Wert für `INTERNAL_PROVISIONING_SECRET` hinterlegen. Er darf nicht mit `INTERNAL_CRON_SECRET` identisch sein.
- Supabase Auth und der E-Mail-Versand für Magic Links sind konfiguriert.

## Einmalige Aufnahme

Von einem sicheren Operator-Rechner aus die Plattform-URL aufrufen; das Geheimnis nicht in Terminal-Historien, Tickets oder Chat-Nachrichten speichern.

```bash
curl --fail-with-body --request POST "$APP_ORIGIN/api/internal/provision-wishlist" \
  --header "Authorization: Bearer $INTERNAL_PROVISIONING_SECRET" \
  --header "Content-Type: application/json" \
  --data '{"email":"eltern@example.test","displayName":"Alex","title":"Wünsche für unser Baby","intro":"Mit Liebe ausgesucht."}'
```

Bei Erfolg antwortet der Endpunkt mit `201` und der neu angelegten Listen-ID. Die Person öffnet anschließend `/login` und fordert selbst ihren Magic Link an. Erst nach der Anmeldung kann sie die Liste bearbeiten, eine Vorschau prüfen und veröffentlichen.

## Fehlerfälle und Grenzen

- Die E-Mail muss neu sein. Bereits angelegte Konten werden bewusst nicht über diesen Notfallweg verändert.
- Schlägt die Datenbank-Provisionierung fehl, wird das gerade erstellte Auth-Konto wieder entfernt.
- Der Endpunkt liefert keine Zugangstokens und schreibt keine E-Mail-Adresse in Logs.
- Für eine zweite Person der Familie wird nach der ersten Anmeldung die normale Owner-Einladung verwendet.
- Die Aufnahme erst nach bestandener Staging-Abnahme, Backup und Mats-Fingerprint gegen Produktion durchführen.
