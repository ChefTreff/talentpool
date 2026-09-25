# Vorschlag PART-081 · Standbühnen-Speaker als Gäste

Stand 24.09.2026 (Nacht), Partner-Chat. **Nur Vorschlag — gebaut wird nach Freigabe** durch Konrad und die Architektur-Session (Arbeitsauftrag Welle 6, „Freigabe nach der Pause“ → Partner, Punkt 3).

> **Entschieden und umgesetzt (25.09.2026):** Konrads Antworten K-32 — (1) Einlass über ein Ticket aus dem Partner-Kontingent, kein Freiticket; (2) Gäste werden in der Event-App **als Speaker** angelegt, mit ihrer Session (abweichend von der Empfehlung „nur Name“); (3) Porträt **Pflicht**; (4) Gastprofil weg, Person bleibt. Dazu die Auflage der Architektur-Session: Einwilligungs-Haken mit Zeitstempel (`speaker_profile.stage_guest_consent_at`). Umsetzung im Vorschlag `v6_standbuehnen_gaeste` (Partner-Chat): Datenmodell wie unten; `can_manage_speaker` bleibt **unverändert** — das Porträt öffnet ein eigener interner Helfer nur für den Foto-Pfad eigener Gäste; Swapcard exportiert einen Gast erst mit **veröffentlichter** Session am Slot; die Zuordnung zum Programmpunkt läuft über `partner_assign_stage_guest` in der Tabelle der Standbühne (nicht über das Board).

## Anlass

PART-081 (Konrad, Runde 21.09., am 24.09. bestätigt): Der Partner kann für seine Standbühne keine Speaker anlegen. Neue Kategorie **Standbühnen-Speaker = Gäste**:

- **kein** Speaker-Hub (kein Portalzugang als Speaker),
- **kein** separates Ticket,
- **keine** Lounge,
- **nicht** auf der Website,
- **nur in Swapcard als Speaker am Slot**.

Formular: Vorname, Nachname, Position, Unternehmen, E-Mail, Porträt; eine Liste zum Bearbeiten und Löschen „wie Kontakte“.

## Was heute an einem Speaker hängt (Bestand, geprüft gegen den Snapshot)

| Folge | Wo sie entsteht | Für einen Gast |
|---|---|---|
| Portalzugang (Speaker-Hub) | Rolle `speaker` aus `invite_speaker` (Knopf des Teams, ab „zugesagt“) und aus `upsert_speaker` (Anlage durch das Team, **immer**) | darf nie entstehen |
| Freiticket | Trigger `speaker_profile_tickets_sync` → `speaker_ticket_create`, sobald der Status „zugesagt“ ist | darf nie entstehen |
| Lounge, Empfang, Reisekosten, Hotel | Felder am Profil: `lounge_access` (Standard **true**), `reception_eligible`, `travel_costs_covered`, `hospitality_status`; `receptions_admin`, `my_receptions` lesen `reception_eligible` | immer aus |
| Swapcard | `event_app_speakers()` exportiert Profile mit `confirmed_at` und ohne `declined_at` (EA2) | ja — aber **nur mit Slot** |
| Website | Speaker-Export über Sanity kommt erst mit SPK-046 | nie |
| Listen des Speaker-Teams | `manager_speakers`, `speaker_leads_admin`, `unassigned_speakers` | ausblenden oder kennzeichnen |
| Porträt | `register_speaker_asset` / `speaker_asset_path_allowed`: die Person selbst, Assistenz, `can_manage_speaker`, Team | der Partner muss hochladen dürfen |

`confirmed_at` setzt nur `set_speaker_pipeline`, kein Trigger. `partner_add_speaker` (0139) legt Speaker für Partner-Sessions heute als `lead` an, mit `created_by_org_id` und `partner_editable_until_login` — das Muster übernimmt der Vorschlag.

## Vorschlag Datenmodell

1. **Kennzeichen** `speaker_profile.stage_guest boolean not null default false`. `speaker_type` taugt dafür nicht: es beschreibt die Rolle auf der Bühne (Keynote, Panel, Moderation …), und ein Gast kann jede davon haben.
2. **CHECK** `speaker_profile_stage_guest_chk`: `not stage_guest or (not lounge_access and not reception_eligible and not travel_costs_covered and hospitality_status = 'none' and created_by_org_id is not null)` — ein Gast kann keine Leistung eines Speakers bekommen, und er gehört immer einer Organisation.
3. **Status:** Gäste stehen auf `confirmed` mit `confirmed_at` (der Partner hat sie zugesagt). Damit bleibt der Swapcard-Export beim bestehenden Filter; die Sperren unten verhindern Ticket und Einladung. *Alternative:* `lead` und im Export `or stage_guest` — lehne ich ab, weil `lead` „noch nicht angesprochen“ heißt und Gäste dann in der Akquise-Liste des Teams stünden.
4. **Sperren** (jeweils aus `supabase/snapshot/functions/`):
   - `invite_speaker`: P0001 `stage_guest` — kein Hub-Zugang.
   - `upsert_speaker`: keine Rolle `speaker` für ein Gastprofil.
   - `speaker_ticket_create` und `speaker_profile_tickets_sync`: kein Ticket für Gäste (Trigger überspringt, die Funktion weist mit `not_eligible` ab).
   - `event_app_speakers`: Gäste nur, wenn sie an einer Session mit Slot hängen („nur am Slot“).
5. **Partner-RPCs** (Rechte über `partner_can_edit(org)`, Fehlerschlüssel nach Konvention):
   - `partner_stage_guests(org, edition?)` — Liste mit Pflegerecht.
   - `partner_add_stage_guest(org, vorname, nachname, position, unternehmen, email, edition?)` — Person über die Adresse finden oder anlegen; Profil mit `stage_guest`, `confirmed`, `confirmed_at`, `created_by_org_id`, Leistungen aus; `partner_editable_until_login` wie bei den Kontakten nur für selbst angelegte Personen. Ist die Person in dieser Edition schon regulärer Speaker, bleibt sie das (P0001 `already_speaker`).
   - `partner_update_stage_guest(profile, …)` — Position und Unternehmen immer; Name und Adresse nur bei selbst angelegten Personen vor dem ersten Login.
   - `partner_remove_stage_guest(profile)` — nimmt den Gast von allen Sessions dieser Organisation und löscht das Gastprofil; die Person bleibt (Löschen gehört zu „Profil löschen“).
   - Porträt: `can_manage_speaker` erlaubt der Organisation, die das Gastprofil angelegt hat, den Upload (`register_speaker_asset` unverändert); Swapcard bekommt es über die öffentliche Kopie wie bei allen Speakern (EA2).
6. **Test** je Sperre mit Vorbedingung (sonst belegt ein grüner Schritt nichts): Gast bekommt keine Rolle, kein Ticket, keine Lounge (CHECK 23514), erscheint ohne Slot nicht im Export, mit Slot schon; fremde Organisation 42501; `anon` gesperrt.

## Oberfläche

- `/partner/buehne`: Abschnitt **„Eure Gäste auf der Standbühne“** — Liste und Panel wie bei den Kontakten (`components/partner/ContactList.tsx` als Vorbild, gleiche Pflichtfelder, Porträt dazu), erklärender Satz: „Gäste erscheinen in der Event-App am Programmpunkt. Sie bekommen keinen Speaker-Zugang, kein eigenes Ticket und keine Lounge — für den Einlass braucht jede Person ein Ticket aus eurem Kontingent.“
- **Admin:** dieselbe Liste in `/admin/partner/[org]` (Regel vom 22.09.).
- **Zuordnung zum Slot** geschieht im Board bzw. in der tabellarischen Eingabe (PART-078): die Speaker-Auswahl für einen Slot auf der eigenen Standbühne muss die Gäste der Organisation anbieten. Das Board gehört dem Speaker-Chat → Bedarf über die Architektur-Session.

## Was andere Chats bräuchten

- **Speaker-Domäne:** Speaker-Auswahl im Board für Partner-Bühnen (Gäste anbieten); Team-Listen blenden Gäste standardmäßig aus (Filter „Gäste zeigen“); Website-Export SPK-046 filtert `not stage_guest`.
- **Admin & Schnittstellen:** Swapcard-Export (EA2) mit der Slot-Bedingung; prüfen, ob der Import in Swapcard eine Einladungsmail auslöst.

## Fragen an Konrad

1. **Einlass:** Brauchen Gäste ein Ticket aus dem Partner-Kontingent (Vorschlag), oder kommen sie ohne Ticket auf die Standbühne?
2. **Swapcard-Zugang:** Sollen Gäste in Swapcard eine Einladung zur App bekommen oder nur als Name am Programmpunkt stehen?
3. **Porträt Pflicht?** Im Formular steht es — ohne Porträt zeigt Swapcard den Platzhalter.
4. **Löschen:** Reicht „Gastprofil weg, Person bleibt“, oder soll eine nur für den Gast angelegte Person ganz verschwinden?
