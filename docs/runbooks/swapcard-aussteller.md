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

**Level und Kategorie kommen jetzt aus den Produkten** (Migration 0135): `product.sponsoring_level_key` sagt je Produkt, welches Level es vergibt (zwölf Pakete vorbelegt, im Produkt-Editor pflegbar); `event_app_exhibitors` liefert daraus `level_key`, `level_rank`, `level_source` (`product` schlägt `hubspot`) und `categories` (Produktkategorien der gebuchten **Pakete**, in Vokabular-Reihenfolge). Der Trockenlauf im Admin zeigt beides je Aussteller. **Nach Swapcard geht davon noch nichts** — erst muss entschieden sein, in welches Feld.

**Rollen im Event:** genau zwei, „Admin" (Vorgabe) und „Limited" (`event.exhibitorRoles`). Eine Zuweisung läuft über `updateExhibitorMemberRoles` und gehört zum Personen-Sync (EA2/EA4), nicht hierher.

## Stand 21.09.2026 — Branche (Migration 0138)
Konrad: die Branche wird im Portal gepflegt. Umgesetzt als Vokabular **`industry`** und Spalte `organization.industry` — an der Organisation, nicht an der Teilnahme, weil eine Branche sich nicht von Edition zu Edition ändert (wie `organization.type` und `partner_category`).

Die vierzehn Schlüssel sind **nicht erfunden**, sondern die Optionswerte des Swapcard-Feldes „Branche", am 21.09. aus dem Bestand der 191 Aussteller gelesen: `tech-and-it`, `consulting`, `banking-and-finance`, `industrie`, `logistics`, `fmcg`, `e-commerce`, `marketing-and-advertising`, `b2b-services`, `energy-and-sustainability`, `health`, `deep-tech-and-science`, `education`, `accelerator`. `label_en` ist wörtlich die Beschriftung, die Swapcard anzeigt („Tech, Data & IT"), `label_de` unsere Übersetzung. Die Übertragung ist damit eine Gleichsetzung, keine Übersetzungstabelle.

Gepflegt wird sie vom Partner selbst im Onboarding (Schritt „Beschreibung"); `partner_can_edit` schliesst das Team ein, also ist sie auch von innen korrigierbar. Ohne Angabe geht `type` **nicht** mit — Swapcard behält dann, was dort steht, statt auf leer gesetzt zu werden. Dasselbe gilt für einen Schlüssel, den jemand im Vokabular deaktiviert hat.

**Zwei Feinheiten, die beim Lesen auffielen:**
* Swapcard gibt `type` beim Lesen als **Beschriftung** zurück („Tech, Data & IT"), den Optionswert nur in `typeLabel.value`. Der Vergleich läuft über `typeValue`; gegen `type` hielte er jeden Lauf für geändert.
* **Welche Schreibweise Swapcard beim *Schreiben* annimmt, ist ungeprüft.** `validateOnly` beanstandet auch erfundene Werte nicht (dreifach probiert: Optionswert, Beschriftung, Unsinn — alle drei ohne Fehler). Wir schicken den Optionswert, weil er der kanonische Wert ist. Klärt der erste Echtlauf (EA6); falls Swapcard die Beschriftung will, ist es eine Zeile — das Vokabular trägt beides.

## Stand 21.09.2026 — Logo-Wand („Sponsoring & Werbung", Migration 0139)

Konrad pflegt die Logo-Wand bisher von Hand: „das ist immer super viel Arbeit". Sie lässt sich über die API füllen — `createEventSponsor(eventId, {categoryId!, name!, logoUrl, redirectUrl, mode})`, gelesen über die **oberste** Ebene `sponsors(eventId)` (nicht über `event { … }`), Kategorien über `event { sponsorsCategories }`.

Die Kategorien im 27er-Event sind die Sponsoring-Stufen. Zuordnung von Konrad, abgelegt als Eltern-Kind-Beziehung im Vokabular (`sponsoring_level` → `swapcard_sponsor_category`), also über die Vokabularpflege änderbar:

| Stufe | Kategorie |
|---|---|
| Premium, Lounge | Premium Partner |
| Signature | Presenting Partner |
| General, Intro, Gemeinschaftsstand | Official Partner |
| Start-Up | Startup Partner |
| **alles ohne Stufe** | **Official Partner** |

Die letzte Zeile ist die wichtigste: Wer nur eine Masterclass, eine Company Tour oder einen Speaking Slot gebucht hat, trägt keine Stufe. Konrad: „Es darf auf jeden Fall niemand durchrutschen." Das `coalesce` steht deshalb in `event_app_exhibitors` und nicht im Anwendungscode. `main_stage_loge` ist bewusst **nicht** zugeordnet (keine Angabe, kein Produkt) und fällt ins Netz.

**Zwei Funde beim Bauen:**
* `set_event_app_ref` schrieb `object_type` **fest** als `'exhibitor'`. Für die Wand gebraucht, hätte sie die Ausstellerreferenz derselben Teilnahme überschrieben — ein stiller Datenverlust, der erst beim nächsten Standsync aufgefallen wäre. Sie nimmt jetzt die Art als Parameter (Vorgabe unverändert `exhibitor`).
* **Der 27er-Event trägt noch die Wand von 2026: 54 Einträge**, alle mit Logo, alle **ohne Namen**, keiner mit einem Aussteller verknüpft. Weder über den Namen noch über eine Verknüpfung zuzuordnen — ein Lauf legte unsere daneben und die Wand stünde doppelt. Der Trockenlauf zählt sie deshalb getrennt auf, mit Bild, und die Oberfläche bietet das Entfernen an. **Entfernen ist endgültig**: Swapcard kennt für Sponsoren keinen Papierkorb, anders als HubSpot bei Produkten.

Partner ohne freigegebenes PNG können nicht auf die Wand. Der Lauf zählt sie namentlich auf, statt sie zu überspringen.

## Offen — Entscheidungen Konrad
- **Wohin mit Level und Kategorie?** `ExhibitorInput` bietet `categories: [String!]` und `customFields` (Auswahlfelder je `definitionId`). Für ein Sponsoring-Level wäre ein eigenes Auswahlfeld im Event sauberer als die Branche zu überschreiben. Braucht ein angelegtes Feld in Swapcard, dann eine Zeile Code.
- **Ohne Level:** „Standbühne (18qm)" (I-79895) passt in keines der acht Vokabular-Level, und `main_stage_loge` hat kein Produkt. Beides ist im Produkt-Editor nachtragbar, sobald Konrad sagt, was gilt.
- **`type`:** Konrad (11.09.): Kategorien werden noch erarbeitet und dann in Swapcard nachgezogen; bis dahin kein `type`. 2026 stand dort die Branche, Sponsoring-Level sind in Swapcard eher Sponsoren-Kategorien.
- **Logos:** entschieden (11.09.) — Partner liefern SVG **und** PNG als Pflichten (`logo_vector`, `logo_png`, Migration 0057); freigegebene PNGs landen im öffentlichen Bucket `partner-logos`, die SVG-Kopie für die Website folgt mit A11.
- **Sprache:** Beschreibung DE als Standard, EN als Übersetzung `en_US`; ist das Event englisch (`language en_US`), drehen wir das.
- **Mitglieder:** `event_app_member`-Kontakte werden exportiert, aber noch nicht angelegt (Personen-Sync Welle 4/5).
