# Übergabe an Claude Code: ausschließlich Design

## Auftrag

Du übernimmst in diesem Projekt ausschließlich visuelle und gestalterische Änderungen. Funktion, Geschäftslogik, Datenverarbeitung, Sicherheit und bestehende Abläufe müssen exakt erhalten bleiben.

Dein erster Schritt in dieser Sitzung ist nur die Bestandsaufnahme: Lies `AGENTS.md`, `CLAUDE.md`, `package.json`, `src/app/layout.tsx`, `src/app/globals.css` und die für die sichtbare Oberfläche relevanten Page- und Component-Dateien. Prüfe außerdem `git status` und den vorhandenen Diff. Verändere zunächst keine Datei. Fasse danach kurz das bestehende Designsystem zusammen und warte auf die konkreten Designwünsche des Nutzers.

## Technischer Bestand

- Next.js 16.2 mit App Router
- React 19.2
- TypeScript 5
- Tailwind CSS 4 ist über `@tailwindcss/postcss` und `@import "tailwindcss"` eingebunden.
- Das aktuelle Styling besteht trotzdem überwiegend aus klassischem globalem CSS: eigene semantische Klassen und CSS Custom Properties in `src/app/globals.css`. Die Komponenten verwenden diese Klassen über `className`; Tailwind-Utility-Klassen prägen die bestehende Oberfläche derzeit nicht.
- Die visuelle Grundidee ist eine ruhige, warme Baby- und Familienwelt mit Papier-, Salbei- und Naturtönen sowie einer Kombination aus Serif- und Sans-Serif-Typografie.

## Harte Grenzen

Erlaubt sind nur gestalterische Anpassungen, zum Beispiel:

- Farben, Typografie, Abstände, Größen, Ausrichtung und visuelle Hierarchie
- Rahmen, Radien, Schatten, Hintergründe und rein dekorative Elemente
- responsive Layout-Anpassungen
- Hover-, Focus- und rein visuelle Übergangszustände
- barrierearme visuelle Verbesserungen wie Kontrast und sichtbare Fokuszustände
- notwendige Änderungen an `className` oder rein präsentationalem Markup, sofern Verhalten und Semantik erhalten bleiben

Nicht erlaubt sind insbesondere:

- Änderungen an Geschäftslogik, Datenmodell, Datenbank oder Supabase
- Änderungen an API-Routen, Middleware, Authentifizierung, Autorisierung oder Sicherheitslogik
- Änderungen an Requests, Server Actions, Formularverarbeitung oder Validierung
- Änderungen an State, Props, Event-Handlern, Navigation, Links oder Benutzerabläufen
- Änderungen an sichtbaren Inhalten, rechtlichen Texten oder fachlichen Aussagen ohne ausdrücklichen Auftrag
- Änderungen an Tests, Migrationen, Konfiguration, Umgebungsvariablen oder Deployment
- neue Abhängigkeiten oder Änderungen an `package.json` und Lockdateien
- Entfernen, Zurücksetzen, Überschreiben oder Stashen bereits vorhandener Änderungen
- Staging oder Commits ohne ausdrücklichen Auftrag

Wenn ein Designwunsch eine funktionale Änderung erfordern würde, stoppe und erkläre dem Nutzer konkret, welche funktionale Änderung nötig wäre. Nimm sie nicht selbst vor.

## Zulässiger Dateibereich bei späteren Designaufträgen

Arbeite bevorzugt in `src/app/globals.css`. Änderungen in `src/app/**/*.tsx`, `src/components/**/*.tsx` oder an rein visuellen Assets unter `public/` sind nur zulässig, wenn sie für die gewünschte Darstellung notwendig sind und ausschließlich präsentational bleiben. Dateien unter `src/app/api/`, `src/lib/`, `supabase/`, `scripts/` sowie Konfigurations- und Umgebungsdateien sind tabu.

## Schutz des aktuellen Arbeitsstands

Der Working Tree enthält bereits zahlreiche uncommittete Änderungen des Nutzers. Behandle sie als unveränderbaren Bestand: Prüfe vor und nach jedem Eingriff den Diff, fasse nur die für den jeweiligen Designauftrag nötigen Stellen an und ändere keine fremden Zeilen nebenbei. Keine pauschalen Formatierungen und keine großflächigen mechanischen Umschreibungen.

## Vorgehen bei jedem konkreten Designauftrag

1. Benenne kurz die betroffenen Ansichten und Dateien.
2. Lies vor dem Schreiben die einschlägige Next.js-Dokumentation unter `node_modules/next/dist/docs/`, wie in `AGENTS.md` gefordert.
3. Setze die kleinste rein visuelle Änderung um, die den Wunsch vollständig erfüllt.
4. Erhalte semantisches HTML, Tastaturbedienung, Fokusführung und Responsive-Verhalten.
5. Prüfe den Diff ausdrücklich auf funktionale Änderungen und entferne solche Änderungen vollständig.
6. Führe mindestens `npm run lint` aus; nutze bei größeren gestalterischen Eingriffen zusätzlich den bestehenden Build, sofern der Arbeitsstand dies erlaubt.
7. Berichte knapp: geänderte Dateien, visuelle Wirkung, Prüfung und verbleibende Einschränkungen.

## Startanweisung

Beginne jetzt nur mit der Bestandsaufnahme. Nimm noch keine Änderungen vor und warte anschließend auf die konkreten Designvorgaben des Nutzers.
