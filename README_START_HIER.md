# My Heise App – Übergabe / Projektstand (Export 29.09.2026)

Dieses Paket ist der komplette Stand von „My Heise App“ für Heise Haustechnik GmbH & Co. KG (Braunlage): Datenbankschema, alle Daten, kompletter Quellcode und die Projekt-Dokus. Damit kann ein neues Team (auch ein neuer Claude-Chat) sofort weiterarbeiten, ohne den Verlauf zu kennen.

## Überblick
„My Heise App“ ist eine reine Web-App (PWA, kein Framework, keine Build-Pipeline im Browser): ein Login/Hub (`index.html`) plus einzelne Module, alle als eine einzige HTML-Datei mit eingebettetem CSS/JS. Backend ist Supabase (Postgres + Auth + Storage + Edge Functions), Auslieferung über GitHub Pages (oder vergleichbar) – Jan lädt die Dateien manuell hoch, es gibt keine CI/CD.

**Module (Stand heute):**
| Datei | Modul | Zweck |
|---|---|---|
| `index.html` | Hub / Startseite | Login, Benutzerverwaltung, Nachrichten, App-Kacheln |
| `lager.html` | Lagerverwaltung | Viessmann-Kommissionslager, Ein-/Auslagerung, Inventur |
| `leitern.html` | Leiterprüfung | Prüfung/Wartung von Leitern nach DGUV |
| `fahrzeuge.html` | Fuhrpark | Fahrzeugakte, Meldungen, Buchung, TÜV, Führerscheinkontrolle |
| `unterweisung.html` | Unterweisungen | Jährliche Sicherheitsunterweisung (12 Themen), Prüfung, PDF-Nachweis |
| `gefaehrdung.html` | Gefährdungsbeurteilung | Gefährdungsbeurteilung Baustelle nach § 5 ArbSchG, PDF |
| `objekt.html` | Objektaufnahme | Erstauftragsannahme beim Kunden (Anlage, Fotos), PDF-Aufnahmeprotokoll |

Alle Module laufen gegen dasselbe Supabase-Projekt und dieselbe Sitzung (`heiseSession`). Rollen/Rechte pro Modul liegen in der Tabelle `app_zugriff`.

## Wo ist was in diesem Export?
- `doku/` – die drei ausführlichen Projekt-Dokus (Leiterprüfung/Hub/Fuhrpark/Unterweisungen, Gefährdungsbeurteilung, Objektaufnahme). **Zuerst lesen**, dort steht der fachliche und technische Stand jedes Moduls im Detail (Rollen, Abläufe, Datenbanktabellen, Einrichtung nach dem Hochladen, offene fachliche Prüfpunkte).
- `app-gebaut/` – die fertig gebauten, direkt deploybaren HTML-Dateien plus Icon/Logo/Manifest. Das ist genau das, was aktuell bei Jan auf GitHub liegt bzw. liegen soll.
- `quellcode/` – der modulare Quellcode je Modul, aus dem die Dateien in `app-gebaut/` gebaut werden (siehe „Bauen“ unten). Hier weiterentwickeln, nicht direkt in den `*.html`-Dateien.
- `supabase/migrations/` – alle 18 Datenbank-Migrationen als einzelne, chronologisch nummerierte `.sql`-Dateien (Supabase-CLI-Format). Damit lässt sich ein neues Supabase-Projekt 1:1 aufbauen (`supabase db push` bzw. Migrationen der Reihe nach ausführen).
- `full_schema.sql` – dieselben Migrationen als eine einzige Datei zum schnellen Durchlesen oder direkten Einspielen in eine leere Postgres/Supabase-Datenbank.
- `daten/` – alle aktuellen Tabelleninhalte, je Tabelle eine JSON-Datei (Rohdaten, so wie sie in Postgres stehen).
- `daten_alle.json` – dieselben Daten als eine Datei (alle Tabellen als Schlüssel).

## Datenbank
- Supabase-Projekt: **„Lagerverwaltung Heise“**, Projekt-ID `bbjzfoirefcsqqgztjpt`, Region eu-central-1, Postgres 17.
- Der Zugriff auf dieses Projekt (Supabase-Dashboard-Login, API-Keys) liegt bei Jan/Heise Haustechnik – das Kollegen-Team braucht entweder Zugriff auf dieses Projekt oder baut sich mit `full_schema.sql` ein eigenes auf (z. B. für eine Entwicklungs-/Test-Instanz).
- Auth läuft über Supabase Auth (E-Mail/Passwort, keine Klartext-Passwörter in der Tabelle `benutzer`).
- Storage: mehrere private Buckets für Fotos/Belege je Modul (`fuhrpark-dateien`, `unterweisung-dateien`, `gefaehrdung-dateien`, `objekt-dateien`, plus die Lager-Bucket(s)). **Die eigentlichen Dateien (Fotos, Belege) sind in diesem Export nicht enthalten** – nur die Datenbank-Referenzen (Pfade) darauf. Wer die Binärdateien selbst braucht, muss sie zusätzlich aus dem Supabase-Storage exportieren.
- Alle Tabellen haben Row Level Security (RLS); die Rechte-Logik steckt in SQL-Funktionen (`*_rolle()`, `*_zugriff()`, `*_darf()`) und Policies, nicht im Frontend – das Frontend blendet nur passend ein/aus.

## Bauen (Entwicklung)
Jedes Modul besteht aus nummerierten Teil-Dateien (HTML-Kopf, CSS, HTML-Body, mehrere JS-Dateien) in einem eigenen Ordner unter `quellcode/`, die ein `build.sh`/`build_*.py`-Skript zu der fertigen `*.html`-Datei zusammensetzt (der letzte `<script>`-Block wird dabei mit `node --check` auf Syntaxfehler geprüft). Bearbeitet wird immer in den Teil-Dateien, nie in der gebauten `*.html` direkt.

| Ordner | Baut | Befehl |
|---|---|---|
| `quellcode/leitern/` (inkl. `hub/`) | `index.html`, `leitern.html`, `lager.html` | `python3 build_hub.py`, `bash build.sh`, `python3 patch_lager.py && python3 patch_lager2.py` |
| `quellcode/fuhrpark/` | `fahrzeuge.html` | `bash build.sh` |
| `quellcode/unt/` | `unterweisung.html` | `bash build.sh` |
| `quellcode/gb/` | `gefaehrdung.html` | `bash build.sh` |
| `quellcode/oa/` | `objekt.html` | `bash build.sh` |

Jeder Ordner enthält außerdem die Test-Skripte: ein gemocktes Supabase-Backend (`*mock.py`, reines Python, kein echtes Netzwerk) und Szenario-Skripte (`SCN=<szenario>.py ROLE=<rolle> python3 <x>mock.py`), die den kompletten Ablauf per Playwright gegen das Mock-Backend durchklicken (Wizard, Fotos, PDF, Rollen). Das ist die vorhandene Test-Suite – vor größeren Änderungen damit gegenprüfen.

## Deployment
Kein Server, kein Build-Schritt in Produktion: Jan lädt die Dateien aus `app-gebaut/` manuell in ein privates GitHub-Repo hoch (statisches Hosting, z. B. GitHub Pages). Nach jedem Upload muss die Seite auf dem Gerät hart neu geladen werden (PWA-Cache).

## Rollen & Rechte – Grundprinzip
Zentrale Tabelle `app_zugriff` (benutzer_id, app-Kürzel, rolle). Neue Mitarbeiter bekommen automatisch Lager + Leiterprüfung + Unterweisungen (Rolle „Nutzer/Benutzer“); Fuhrpark, Gefährdungsbeurteilung und Objektaufnahme müssen pro Person unter „Benutzer & Zugriff“ bewusst freigeschaltet werden. Admin sieht und darf in jedem Modul alles.

## Offene Punkte / bekannte Einschränkungen (aus den Dokus)
- Kein Offline-Modus in keinem Modul – Fotos/Speichern brauchen Netz.
- E-Mail-Erinnerungen (Unterweisungen) sind bewusst noch nicht gebaut, Jan klärt das mit dem IT-Betreuer.
- Buchungs-Mail der Lagerverwaltung (Resend) ist vorbereitet, aber abgeschaltet, bis IT die DNS-Einträge gesetzt hat.
- Beispielinhalte (Unterweisungs-Themen, Gefährdungskatalog) sind fachliche Entwürfe und sollten vor Produktiveinsatz von der Fachkraft für Arbeitssicherheit geprüft werden (Details in den jeweiligen Dokus).
- Kein reales Logo/Icon-Feintuning für Viessmann geprüft; iPhone-Icon-Debugging nur bei Bedarf.
- Die eigentlichen hochgeladenen Fotos/Belege liegen nur in Supabase Storage, nicht in diesem Export.

## Wie man als neuer Entwickler/Claude-Chat einsteigt
1. `README_START_HIER.md` (diese Datei) und dann die drei Dokus in `doku/` lesen.
2. `full_schema.sql` überfliegen, um Tabellen/Funktionen/Policies je Modul zu verstehen.
3. Für Änderungen: passenden Ordner in `quellcode/` öffnen, Teil-Dateien anpassen, `build.sh` laufen lassen, gegen das gemockte Backend testen, dann DB-Änderungen als neue Migration gegen das echte Supabase-Projekt anwenden.
4. Neue Module folgen demselben Muster: eigener Ordner mit nummerierten Teilen + `build.sh`, eigene Tabellen mit RLS + Rollenfunktion, Eintrag in `hub/hub.js` (`MODULES`), Freischaltung über `app_zugriff`.
