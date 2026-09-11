# Runbook Event-App: Aussteller nach Swapcard (Welle 3 A12)

Swapcard bleibt die Event-App 2027 (Entscheidung 13). Das Portal spricht nur den Adapter-Vertrag `lib/event-app/types.ts`; Swapcard ist eine Implementierung (`lib/event-app/swapcard`). Umfang in Welle 3: Aussteller. Personen, Sessions und Aussteller-Mitglieder folgen in Welle 4/5.

## Einrichtung
1. **API-Key:** Event Studio → API keys (Nutzer mit Organizer-Rechten auf dem Event) → Vercel `SWAPCARD_API_KEY` (sensibel). `SWAPCARD_EVENT_ID` in Vercel dient nur der Probe; der Sync liest die Event-ID aus der Datenbank.
2. **Lokale Probe (Pflicht vor dem ersten Schreiblauf):** Beide Werte in `.env.local` eintragen (sensible Vercel-Variablen kommen per `env-pull` nur als Platzhalter — wie beim `SUPABASE_SECRET_KEY`), dann
   ```bash
   node --env-file=.env.local scripts/swapcard-probe.mjs
   ```
   Das Skript liest nur: Key-Prüfung, Query-/Mutation-Namen zu Event/Aussteller/Personen, Felder von `ExhibitorInput`, Kopf des Events. Die Ausgabe enthält keine Geheimnisse; die vollständige Schema-Auskunft liegt danach unter `$TMPDIR/swapcard-schema.json`. Danach werden die Konstanten in `lib/event-app/swapcard/queries.ts` an das echte Schema angepasst (Event-Abfrage und Aussteller-Liste je Event sind bis dahin aus der Doku abgeleitet).
3. **Event der Edition:** als Partner-Team `select set_edition_swapcard('<edition_id>', '<swapcard event id>');`. Ohne Eintrag überträgt der Sync nichts.
4. **Swapcard-Event einrichten:** Das FLS27-Event ist derzeit ein Duplikat von 2026 (Konrad, 11.09.). Erst wenn Einstellungen, Aussteller-Kategorien/-Typen und Sichtbarkeit stimmen und das Event nicht öffentlich ist, der erste Schreiblauf.

## Ablauf
- Quelle: `event_app_exhibitors(edition?)` — je Org der Edition Name (`communication_name`), Beschreibung (Edition, sonst Org; DE zuerst), Website, Sponsoring-Level (= Logo-Typ in der App), Standnummer, freigegebenes Vektor-Logo (aktuelle Fassung der akzeptierten Pflicht `logo_vector`), Kontakte mit Rolle `event_app_member`, gespeicherte Swapcard-ID.
- Sync (`lib/event-app/sync.ts`): bestehende Aussteller des Events lesen, je Org zuordnen (erst `clientId` = unsere Org-ID, dann gespeicherte ID, dann Name), nur Neues und Geändertes über `upsertEventExhibitors` schreiben (Pakete zu 25, Mutationen kosten 1 000 Punkte bei 60 000/Minute), App-ID in `external_ref` (`set_event_app_ref`). Gelöscht wird nichts automatisch.
- Auslösen: Team im Admin (B9) über `POST /api/admin/swapcard/exhibitors` mit `{ editionId?, dryRun (Standard true), orgId? }`; Gate Admin-Bereich + `is_partner_team()`. Der Trockenlauf zeigt je Org `would_create`/`would_update`/`unchanged`. Läufe in `integration.sync_job` (system `swapcard`), Fehler in `integration.sync_error`.
- Ohne `SWAPCARD_API_KEY` endet der Lauf als `skipped`, ohne `swapcard_event_id` je Edition ebenso.

## Offen
- **Logos:** `partner-assets` ist privat, Swapcard braucht eine öffentlich abrufbare Rasterdatei; Vektor-Logos müssen gerendert werden. Vorschlag: öffentlicher Bucket `partner-logos` mit freigegebenen Logos (auch für Sanity/A11), PNG aus SVG per `sharp`, EPS/AI/PDF als Pflicht `logo_png` oder Konvertierung durch das Team. Bis zur Entscheidung überträgt der Sync kein Logo.
- **Mitglieder:** `event_app_member`-Kontakte werden exportiert, aber noch nicht als Aussteller-Mitglieder angelegt (Personen-Sync Welle 4/5).
- **Standnummer:** `ExhibitorInput` zeigt laut Doku kein Feld dafür; nach der Probe prüfen.
