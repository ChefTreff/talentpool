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

## Stand 21.09.2026 — EA1: Abnahme gegen das 27er-Event
Zweite Probe, nur lesend plus ein `validateOnly`-Trockenlauf (nichts geschrieben). Event „FUTURE LEADER SUMMIT 2027", `language de_DE`, `visibility PRIVATE`, **0 Aussteller im Event, 191 in der Community**. Die drei Testorganisationen der Edition gingen fehlerfrei durch die Prüfung. Vier Befunde, alle in diesem PR behoben:

1. **`validateOnly` meldet nur Fehler, nie Erfolge.** Belegt mit drei Eingaben: leerer Name ⇒ `FIELD_MISSING`, kaputte Adresse ⇒ `URL_INVALID`, gültige Eingabe ⇒ `errors: []` **und `results: []`**. Der Zähler `validated` hing an `results` und wäre dauerhaft 0 geblieben. Er zählt jetzt „Eingaben minus Beanstandungen"; ein Trockenlauf ohne Fehler heißt „alles gültig".
2. **`type` ist die Branche, nicht das Level.** Die 191 Aussteller der Community tragen dort „Tech, Data & IT", „Consumer Goods", „Accelerator & Startup Services"; im Event steht dazu das Auswahlfeld **„Branche"** (`isDefault`, Werte wie `tech-and-it`). Die alte Abbildung „Typ = Sponsoring-Level" war falsch und ist entfernt — gesendet wurde sie nie. **Eine Branche kennt das Portal nicht**; solange das so ist, bleibt das Feld in Swapcard Handarbeit.
3. **Beschreibungen kamen bei jedem Lauf als „geändert" zurück.** Swapcard speichert den Text als HTML und gibt ihn beim Lesen ohne Tags **und ohne Trennzeichen** zurück: aus „Absatz A\n\nAbsatz B" wird „Absatz AAbsatz B". Der Vergleich ignoriert jetzt jeden Leerraum.
4. **Standnummern wurden nie verglichen.** Sie hängen am Event (`exhibitor.withEvent(eventId).booths`), nicht am Aussteller; die Leseabfrage holte sie nicht. Nach dem ersten Schreiben hätte eine Standänderung Swapcard nie wieder erreicht. Die Abfrage liest sie jetzt mit; für Aussteller, die nur in der Community stehen, bleibt der Vergleich aus (`undefined` heißt „wissen wir nicht", `[]` heißt „am Event, ohne Stand").

**Level und Kategorie kommen jetzt aus den Produkten** (Migration 0132): `product.sponsoring_level_key` sagt je Produkt, welches Level es vergibt (zwölf Pakete vorbelegt, im Produkt-Editor pflegbar); `event_app_exhibitors` liefert daraus `level_key`, `level_rank`, `level_source` (`product` schlägt `hubspot`) und `categories` (Produktkategorien der gebuchten **Pakete**, in Vokabular-Reihenfolge). Der Trockenlauf im Admin zeigt beides je Aussteller. **Nach Swapcard geht davon noch nichts** — erst muss entschieden sein, in welches Feld.

**Rollen im Event:** genau zwei, „Admin" (Vorgabe) und „Limited" (`event.exhibitorRoles`). Eine Zuweisung läuft über `updateExhibitorMemberRoles` und gehört zum Personen-Sync (EA2/EA4), nicht hierher.

## Offen — Entscheidungen Konrad
- **Branche (Swapcard-Feld „Typ"/`type`):** Das Portal hat kein Branchenfeld. Entweder die Partner pflegen es im Portal (neues Vokabular, 14 Werte aus Swapcard übernehmen, Feld im Partner-Onboarding) — oder es bleibt in Swapcard Handarbeit. Solange nichts entschieden ist, sendet der Sync kein `type`.
- **Wohin mit Level und Kategorie?** `ExhibitorInput` bietet `categories: [String!]` und `customFields` (Auswahlfelder je `definitionId`). Für ein Sponsoring-Level wäre ein eigenes Auswahlfeld im Event sauberer als die Branche zu überschreiben. Braucht ein angelegtes Feld in Swapcard, dann eine Zeile Code.
- **Ohne Level:** „Standbühne (18qm)" (I-79895) passt in keines der acht Vokabular-Level, und `main_stage_loge` hat kein Produkt. Beides ist im Produkt-Editor nachtragbar, sobald Konrad sagt, was gilt.
- **`type`:** Konrad (11.09.): Kategorien werden noch erarbeitet und dann in Swapcard nachgezogen; bis dahin kein `type`. 2026 stand dort die Branche, Sponsoring-Level sind in Swapcard eher Sponsoren-Kategorien.
- **Logos:** entschieden (11.09.) — Partner liefern SVG **und** PNG als Pflichten (`logo_vector`, `logo_png`, Migration 0057); freigegebene PNGs landen im öffentlichen Bucket `partner-logos`, die SVG-Kopie für die Website folgt mit A11.
- **Sprache:** Beschreibung DE als Standard, EN als Übersetzung `en_US`; ist das Event englisch (`language en_US`), drehen wir das.
- **Mitglieder:** `event_app_member`-Kontakte werden exportiert, aber noch nicht angelegt (Personen-Sync Welle 4/5).
