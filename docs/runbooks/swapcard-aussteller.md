# Runbook Event-App: Aussteller nach Swapcard (Welle 3 A12)

Swapcard bleibt die Event-App 2027 (Entscheidung 13). Das Portal spricht nur den Adapter-Vertrag `lib/event-app/types.ts`; Swapcard ist eine Implementierung (`lib/event-app/swapcard`). Umfang in Welle 3: Aussteller. Personen, Sessions und Aussteller-Mitglieder folgen in Welle 4/5.

## Stand 11.09.2026 — Probelauf erledigt, Schema verifiziert
Key gültig (eine Introspektion kostet ~300 von 60 000 Punkten/Minute). Event „FUTURE LEADER SUMMIT 2027“ (16.–17.04.2027, `visibility PRIVATE`), **0 Aussteller im Event, 191 in der Community** (Vorjahre; ohne `clientIds`, `type` = Branche wie „Tech, Data & IT“). Geprüfte Operationen (`lib/event-app/swapcard/queries.ts`):
- Lesen: `event(id: ID!)` → `title, beginsAt, endsAt, totalExhibitors, community { id }`. Aussteller hängen an der **Community**, nicht am Event: `exhibitorsV2(communityId: ID!, filter: { eventIds, clientIds, ids, lastUpdatedSince }, cursor: { first, after })` → `pageInfo { hasNextPage endCursor }, totalCount, nodes`.
- Schreiben: `upsertEventExhibitorsV2(eventId: String!, exhibitors: [ExhibitorInput!]!, validateOnly: Boolean)` → `errors { inputId errorCode message path }`, `results { inputId exhibitor { … } }`; `deleteEventExhibitors(eventId: String!, exhibitorsIds: [String!]!)`.
- `ExhibitorInput`: `inputId, clientId, id, name, nameTranslations, description, descriptionTranslations [{ language: de_DE | en_US, value }], websiteUrl, logoUrl, type, booth, booths, categories, email, address, phoneNumbers, socialNetworks, documents, membersIds, groupId, customFields`.
- Für später: `importEventPeople`, `updateExhibitorMemberRoles` (Aussteller-Rollen im Event: „Admin“, „Limited“), `createEventSponsor`/`sponsorsCategories` (Sponsoren sind ein eigener Begriff neben Ausstellern).

## Einrichtung
1. **API-Key:** ✅ 11.09. in Vercel (`SWAPCARD_API_KEY`, sensibel) und lokal. `SWAPCARD_EVENT_ID` dient nur der Probe; der Sync liest die Event-ID aus der Datenbank.
2. **Probe (wiederholbar, nur lesend):** `node --env-file=.env.local scripts/swapcard-probe.mjs` im Haupt-Checkout — druckt Query-/Mutation-Namen, `ExhibitorInput`, Event-Kopf und die Aussteller im Event. Schreibt nichts nach Swapcard; die vollständige Schema-Auskunft liegt danach unter `$TMPDIR/swapcard-schema.json`.
3. **Event der Edition:** ✅ 11.09. für FLS27 gesetzt (`set_edition_swapcard`, Event „FUTURE LEADER SUMMIT 2027“). Für weitere Editionen: `select set_edition_swapcard('<edition_id>', '<swapcard event id>');`.
4. **Swapcard-Event einrichten:** Das FLS27-Event ist ein Duplikat von 2026 (Konrad, 11.09.). Erster Schreiblauf erst, wenn Einstellungen, Sprache (`language`) und Sichtbarkeit stimmen.

## Ablauf
- Quelle: `event_app_exhibitors(edition?)` — je Org der Edition Name (`communication_name`), Beschreibung DE und EN (Edition, sonst Org), Website, Sponsoring-Level, Standnummer, freigegebenes Vektor-Logo (aktuelle Fassung der akzeptierten Pflicht `logo_vector`), Kontakte mit Rolle `event_app_member`, gespeicherte Swapcard-ID.
- Zuordnung (`lib/event-app/sync.ts`): erst die Aussteller **des Events** (clientId = unsere Org-ID, dann gespeicherte ID, dann Name), dann die **Community** per Name — ein Treffer aus dem Vorjahr wird mit `id` mitgeschickt und so ans 2027-Event gehängt statt verdoppelt (`attach`). Nur Neues und Geändertes wird geschrieben.
- **Trockenlauf** (Standard): rechnet alles durch und lässt Swapcard mit `validateOnly: true` prüfen — Ergebnis je Org `would_create` / `would_update` / `would_attach`, Zähler `validated`, Prüf-Fehler als `invalid` mit Code und Pfad. Geschrieben wird nichts.
- **Echtlauf** (`dryRun: false`): Upsert in Paketen zu 25 (Mutationen kosten 1 000 Punkte), App-ID je Org×Edition nach `external_ref` (`set_event_app_ref`, system `swapcard`, object_type `exhibitor`). Gelöscht wird nichts automatisch.
- Übertragene Felder: `name`, `description` (DE), `descriptionTranslations` (en_US), `websiteUrl`, `booth`, `clientId`, `inputId`, **`logoUrl`** = öffentliche Kopie des freigegebenen PNG-Logos (Bucket `partner-logos`, eine Datei je Fassung; der Echtlauf kopiert, der Trockenlauf rechnet mit der künftigen URL). **Kein `type`** bis zur Kategorien-Entscheidung.
- Auslösen: Team im Admin (B9) über `POST /api/admin/swapcard/exhibitors` mit `{ editionId?, dryRun (Standard true), orgId? }`; Gate Admin-Bereich + `is_partner_team()`. Läufe in `integration.sync_job` (system `swapcard`), Fehler des Echtlaufs in `integration.sync_error`. Ohne `SWAPCARD_API_KEY` endet der Lauf als `skipped`.

## Offen — Entscheidungen Konrad
- **`type`:** Konrad (11.09.): Kategorien werden noch erarbeitet und dann in Swapcard nachgezogen; bis dahin kein `type`. 2026 stand dort die Branche, Sponsoring-Level sind in Swapcard eher Sponsoren-Kategorien.
- **Logos:** entschieden (11.09.) — Partner liefern SVG **und** PNG als Pflichten (`logo_vector`, `logo_png`, Migration 0057); freigegebene PNGs landen im öffentlichen Bucket `partner-logos`, die SVG-Kopie für die Website folgt mit A11.
- **Sprache:** Beschreibung DE als Standard, EN als Übersetzung `en_US`; ist das Event englisch (`language en_US`), drehen wir das.
- **Mitglieder:** `event_app_member`-Kontakte werden exportiert, aber noch nicht angelegt (Personen-Sync Welle 4/5).
