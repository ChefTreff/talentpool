# Abgleich Volunteers — Altsystem → neues Portal

**Stand: 2026-09-17 · Entwurf der Architektur-Session (Codebefund, nicht am Gerenderten geprüft) · zur Prüfung durch Konrad im Walkthrough**

**Quellen (alt):** Airtable-Base Volunteering `appRrXacJe9PQ748O` (Inventar §5: Volunteers (Confirmed) 266 Zeilen mit ~250 Feldern, Einsatz 222 Zeilen / 98 Positionen mit 119 Stunden-Spalten, Waitlist 359, Accommodation Offer 37, Anmeldung Volunteer Day 62, Ohne Account / Non Confirmed 72 / 53, Feedback_ 16 / Feedback Team Leads 6; Interfaces „VOLO ÜBERSICHT“ und „NON/FEHLT VOLOS“, 8 Formulare) · Notion-Volunteer-Wiki `2c017aa69eee8029b469fde07c244467` (Inventar §14.1: ≈53 Artikel) · Feedback der Team Leads 2026 (Inventar §5).
**Quellen (neu):** `/volunteers`, `/volunteers/schichten`, `/volunteers/team`, `/volunteers/wiki`, `/admin/volunteers`, `/admin/volunteers/schichten`, `/admin/volunteers/tickets`, `/checkin`; Migrationen 0065–0070 (`20260911165420` …), 0084 (`20260914095318` Volunteer-Tickets), 0090 (`20260914112220` Check-in), 0083 (`20260914095053` Wissensbasis); Arbeitsauftrag Welle 4 Abschnitt D (E1, E2, E8, E9).

**Methode.** Zeile = eine Seite, Tabelle, ein Feldblock oder eine Funktion des Altsystems; daneben steht, wo das im neuen Portal liegt, in welchem Zustand, und woran man das im Code sieht. Geprüft wurde ausschließlich am Quelltext und an den Migrationen — nicht am Gerenderten, nicht mit echten Daten; „vorhanden“ heißt deshalb „im Code belegt“, nicht „am Bildschirm gesehen“.

**Regel: Die Matrix benennt Lücken, sie schließt keine.** Gebaut wird nur, was Konrad je Zeile als „FLS27 braucht es“ markiert. Alles andere wird als „bewusst weggelassen“ ins Entscheidungslog geschrieben, damit es nicht in jeder Runde neu auftaucht.

---

## 1 · Airtable „Volunteers (Confirmed)“ (266 Zeilen, ~250 Felder)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Bewerbung über prefilled „Unique Onboarding Form“ (Einmal-Link je Person) | `/volunteers`, dreistufiger Wizard (Person · Präferenzen · Einwilligung) | **anders** — Login statt Einmal-Link, danach jederzeit änderbar | `app/(volunteers)/volunteers/ApplyForm.tsx` (`STEPS = person, prefs, consent`), RPC `apply_volunteer` (0065) | | |
| Stammdaten (Name, E-Mail) in der Volunteer-Zeile | `person` + `person_email`, Volunteer-Zeile nur noch als Profil | **anders** — Person ist zentral, nicht je Bereich neu | `volunteer_admin_overview` liest Name/Mail aus `person`/`person_email` (0065) | | |
| Geburtsdatum / Mindestalter | Pflichtfeld in der Bewerbung, Prüfung 18 Jahre am ersten Eventtag | **vorhanden**, neu (E1) | `apply_volunteer` ⇒ P0001 `too_young`, schreibt `person.birthdate` (0065:143–148) | | |
| **Rolle** (Vokabular, 20 Werte: Check-In, Cloakroom, Speakers Care, Stage …) | `shift.area` + `shift.position`; Vokabular `volunteer_area` | **anders** — die Rolle hängt an der Schicht, nicht an der Person. **Das Vokabular `volunteer_area` ist leer**, solange die Liste 2026 nicht importiert ist; ohne Eintrag lässt sich keine Schicht anlegen | `supabase/migrations/20260911165420_v4_volunteers.sql:7` („bleibt in dieser Migration leer“), `docs/security-check-pause-2026-09-11.md` F3, `app/(admin)/admin/volunteers/ShiftPlan.tsx:218–222` (Hinweis statt Formular) | | |
| **Areas** (6 Überkategorien als Wunsch: Growth · Partnerships · People · Production · Program · Side Events) | `volunteer_profile.areas[]`, angekreuzt im Wizard | **vorhanden** als Struktur, **Liste fehlt** (s. o.) | `20260911165420_v4_volunteers.sql:25`, `ApplyForm.tsx:35` | | |
| **Lead** (Bereichsleitung als Feld an der Person) | `shift.lead_person_id`; eigene Sicht `/volunteers/team` | **anders** — Leitung hängt an der Schicht; die Leitung sieht nur ihre eigenen Schichten mit Namen und Stand, ohne Mailadressen | `20260911165420_v4_volunteers.sql:52`, RPC `my_lead_shifts` (0070), `app/(volunteers)/volunteers/team/LeadShifts.tsx` | | |
| **T-Shirt-Größe** S–XXL | `volunteer_profile.shirt_size`, Vokabular `shirt_size` | **vorhanden** | `20260911165420_v4_volunteers.sql:13–14` (S/M/L/XL/XXL), `:24` | | |
| **6× Tages-Zuteilung / 6× „Staffed“** (eine Spalte je Eventtag) | `shift_assignment` je Schicht | **anders** — Zuteilung je Schicht statt je Tag; Tagespräferenz getrennt als `day_prefs[]` | `20260911165420_v4_volunteers.sql:61–73`, `:26` | | |
| **„Zugeteilt Status“** (1–4 Schicht · Wartepool · NEU ZUGETEILT · ÄNDERUNG · ABSAGE · Praktikum) | `shift_assignment.status` = assigned / confirmed / declined / no_show / waitlisted | **anders** — fünf saubere Zustände statt Mischung aus Anzahl, Ereignis und Sonderfall; „Praktikum“ hat kein Gegenstück | `20260911165420_v4_volunteers.sql:65` | | |
| **Shift Confirmation** (Rückbestätigung durch die Person) | `/volunteers/schichten`: bestätigen oder mit Grund absagen | **vorhanden** | RPCs `confirm_shift` / `decline_shift` (0065), `app/(volunteers)/volunteers/schichten/ShiftList.tsx` | | |
| Nicht-Bestätiger → Telefon-Kampagne (Interface „NON/FEHLT VOLOS“) | — | **fehlt** — siehe §6 | `volunteer_admin_overview` gibt keine Telefonnummer und keinen Anruf-Status heraus (0065) | | |
| **Discount-Code 50 %** (Ticket zum halben Preis) | Coupon je Person im Volunteer-Undershop, Crew-Pass | **anders** (E2) — voller Crew-Pass statt 50 %, Einlösen ist der bewusste Aktivierungsschritt | `volunteer_profile.coupon_code/coupon_status/redeemed_at` (0084), `lib/vivenu/volunteers.ts:143–170` (nur Tickettypen mit `pass_type = 'crew'`), `app/(volunteers)/volunteers/TicketCard.tsx` | | |
| Nachfassen bei Nicht-Einlösern (von Hand) | Liste + automatische Erinnerung | **vorhanden**, neu | `/admin/volunteers/tickets` (`volunteer_tickets_admin`), `remind_volunteer_tickets` (0084), Cron `app/api/cron/volunteer-tickets/route.ts` | | |
| **Crew-Buddy** (Link auf eine andere Volunteer-Zeile) | `volunteer_profile.buddy_note` (Freitext-Wunsch) | **anders** — die Spalte `buddy_person_id` existiert, wird in der Oberfläche aber nie gesetzt; eine Buddy-**Zuordnung** durch das Team gibt es nicht | `20260911165420_v4_volunteers.sql:28–29`; `app/(volunteers)/volunteers/actions.ts` schreibt nur `buddyNote` | | |
| **5 Selbst-Ratings** (Sprachen, Belastbarkeit …) | — | **fehlt** — kein Feld, keine RPC, keine Anzeige | Suche nach `rating` in `app/`, `lib/`, `supabase/` ohne Treffer | | |
| **Sicherheitsbriefing** (Feld + Nachweis je Person) | — | **fehlt** — `shift.briefing_md` ist ein Briefingtext je Schicht, kein Nachweis je Person | `20260911165420_v4_volunteers.sql:53`; Suche nach `sicherheitsbriefing` / `safety` ohne Treffer | | |
| **Zertifikat** (Teilnahmebescheinigung) | — | **fehlt** | Suche nach `zertifikat` / `certificate` ohne Treffer (nur `supabase/config.toml`, unbeteiligt) | | |
| **~40 Feedbackfelder** an der Person | — | **fehlt** — siehe §7 | keine Tabelle, keine RPC, keine Seite | | |
| Verfügbarkeit (Raster aus Feldern) | `volunteer_profile.availability` als ein Satz Freitext | **anders**, bewusst — Datenminimierung | `app/(volunteers)/volunteers/actions.ts` („Freitext statt Raster: was jemand kann, steht in einem Satz besser als in zehn Haken“) | | |
| Ernährung (nur im Volunteer-Day-Formular erfasst) | `person.diet` + `diet_note`, Kachel **erst nach der Zusage** | **vorhanden**, an anderer Stelle und enger | `app/(volunteers)/volunteers/page.tsx` (DietCard nur bei `status === 'accepted'`), Migration 0100, Auswertung `/admin/catering` | | |
| Consent-Feld `Agree` (im Altbestand unbelegt) | versionierte Einwilligung terms + privacy (dazu optional photo_video) | **vorhanden**, besser | `apply_volunteer` ⇒ P0001 `consent_required` (0065:138–141), `lib/consent.ts`, `app/(volunteers)/volunteers/actions.ts` | | |
| Kommunikation als Checkbox-Spalte je Mailing | Mail-Vorlagen über `queue_mail` | **anders** | Vorlagen `volunteer_applied`, `volunteer_accepted`, `volunteer_declined`, `shift_assigned`, `shift_reminder` (0065) | | |
| **WhatsApp-Gruppen** als Hauptkanal | — | **bewusst weggelassen** — Entscheidung 08.09.2026: „Community/FLC nur Talents; WhatsApp vorerst nicht“ | `docs/entscheidungen.md` (Antworten Fragenkatalog, Abschnitt G) | | |
| Interne Notiz zur Person | `volunteer_profile.notes_internal`, nur Team | **vorhanden** | `20260911165420_v4_volunteers.sql:30`, `volunteer_admin_overview` | | |
| Zurückziehen der Bewerbung | Knopf „Bewerbung zurückziehen“ im Profil | **vorhanden**, neu | `update_my_volunteer_profile` mit `status = 'withdrawn'` (0065), `ProfileView.tsx:220–236`; Rolle endet sofort (0067) | | |

---

## 2 · Airtable „Einsatz“ — Positions-/Schichtraster (222 Zeilen, 98 Positionen, 119 Stunden-Spalten)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Position (98 Zeilen, Freitext) | `shift.position` (Freitext) unter `shift.area` (Vokabular) | **anders** — zweistufig: Bereich aus dem Vokabular, Position als Text | `20260911165420_v4_volunteers.sql:45–46` | | |
| **Zeit als 119 Stunden-Spalten** (Di 07.04. 7 Uhr … So 12.04. 18 Uhr), je Spalte Links auf Volunteers | `shift.start_at` / `end_at` als Zeitstempel, `event_day_id` | **anders**, deutlich einfacher — eine Zeile je Schicht statt 119 Spalten | `20260911165420_v4_volunteers.sql:44,47–48` + `check (end_at > start_at)` | | |
| Kapazität nur implizit (wie viele Links in der Zelle stehen) | `shift.capacity` + `shift.overbook` (bewusste Überbuchung) | **vorhanden**, neu (E9) | `20260911165420_v4_volunteers.sql:49–50`; Anzeige „belegt / frei / Warteliste“ in `ShiftPlan.tsx` | | |
| Keine Soll-Kapazität, kein Schichtdauer-Feld (Feedback Team Leads: „Start/Ende nicht einsehbar“) | Zeiten stehen in jeder Ansicht, in der Zeitzone des Events | **vorhanden**, behebt den Mangel | `ShiftList.tsx` (Formatierung mit `timeZone`), `app/(admin)/admin/volunteers/schichten/page.tsx:26–32` | | |
| Ort / Treffpunkt | `shift.location` | **vorhanden** | `20260911165420_v4_volunteers.sql:51` | | |
| Briefing-URL (Link ins Notion-Wiki) | `shift.briefing_md` (Markdown, direkt in der Schicht) | **anders** — Text statt Link; der Sprung ins Wiki bleibt möglich über `/volunteers/wiki` | `20260911165420_v4_volunteers.sql:53`, `ShiftList.tsx` | | |
| Sicherheitsbriefing je Position | — | **fehlt** (wie §1) | s. o. | | |
| Keine Überschneidungsprüfung (eine Person konnte doppelt stehen) | `assign_shift` verweigert Überschneidungen | **vorhanden**, neu | `assign_shift` ⇒ P0001 `shift_overlap` (0065), Test `supabase/tests/v4_volunteers.sql` | | |
| Zuteilung durch die Orga (Volunteer gibt nur Präferenzen) | `/admin/volunteers/schichten`, Auswahl je Schicht | **vorhanden**, Prinzip unverändert (Antwort 26) | `assign_shift` / `unassign_shift` (0065), `ShiftPlan.tsx:326–349` | | |
| Wartepool als Rolle „Wartepool“ | Warteliste je Schicht, rückt bei Absage automatisch nach | **anders**, besser (E9) | `shift_assignment.status = 'waitlisted'`, `promote_shift_waitlist`, Nachrücken in `decline_shift` (0065) | | |
| Erinnerung vor der Schicht (von Hand) | `shift_reminder` 48 h vorher, genau einmal je Zuweisung | **vorhanden**, neu | `send_shift_reminders`, `shift_assignment.reminded_at` (0065) | | |
| Raster als Ganzes ausdrucken / je Tag ansehen | Filter Tag × Bereich im Schichtplan, CSV-Export | **anders** — Liste statt Raster; keine Druckansicht | `ShiftPlan.tsx:231–251`, `app/(admin)/admin/volunteers/export/route.ts` | | |
| Schicht duplizieren / Raster für den nächsten Tag kopieren | — | **fehlt** — jede Schicht wird einzeln angelegt | `ShiftPlan.tsx` kennt nur „neue Schicht“ und „bearbeiten“ (`upsert_shift`) | | |

---

## 3 · Airtable „Waitlist“ (359 Zeilen: FLS27-Warteliste + Alt-Profile)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Warteliste für FLS27 als eigene Tabelle, gespeist aus einem Formular (13.–17.04.2027, 12.500 TN) | — | **fehlt** — es gibt keine Bewerber-Warteliste. `shift_assignment.status = 'waitlisted'` ist die Warteliste **je Schicht**, nicht die vor der Zulassung | `20260911165420_v4_volunteers.sql:65`; keine Tabelle `volunteer_waitlist`, kein Status zwischen `applied` und `accepted` | | |
| Jahr / „Helped before“ (no / once / twice) | — | **fehlt** — Bewerbungen sind edition-gebunden, eine Historie über Editionen wird nicht angezeigt | `volunteer_profile` ist `unique (person_id, edition_id)` (0065:37); keine RPC über mehrere Editionen | | |
| Bewertung der Bewerbung durch das Team | `volunteer_profile.notes_internal` (Freitext) | **anders** — Notiz statt Bewertungsskala | `volunteer_admin_overview` (0065) | | |
| Prefilled link zum Nachfassen | — | **bewusst weggelassen** — im Portal ersetzt der Login den Handshake (Inventar §7 Muster 4) | `docs/legacy-inventar.md` §7 Punkt 4 | | |
| T-Shirt-Größe / Areas schon in der Warteliste | erst mit der Bewerbung | **anders** | `apply_volunteer` (0065) | | |

---

## 4 · Airtable „Accommodation Offer“ (37 Hostel-Betten)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Bett-Zuteilung (Bett, Arrival, Departure, Bezahlung) | — | **fehlt** — keine Tabelle, keine Zuteilung, keine Anzeige | Suche nach `accommodation` / `hostel` / `unterkunft` in `app/`, `lib/`, `supabase/migrations/` ohne Treffer (nur ein Wiki-Artikel „Hotel & Unterkunft“ für Partner/Speaker, 0096) | | |
| Unterkunft und Bahnticket als Add-on beim Ticket-Einlösen (Entscheidung E2) | Volunteer-Undershop existiert, **Add-ons nicht** | **fehlt** — der Undershop wird angelegt und auf Crew-Tickettypen begrenzt, Add-on-Artikel sind nirgends definiert oder angezeigt | `lib/vivenu/volunteers.ts` (Undershop + Coupon), Suche nach `addOn` / `hotel` / `bahn` in `lib/vivenu/*` ohne Treffer; `ticket.addons` wird beim Ingest nur gespeichert (0071/0075) | | |

---

## 5 · Airtable „Anmeldung Volunteer Day“ (Kick-off 24.03., 62 Zeilen)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Anmeldung zum Volunteer Day (Kick-off vor dem Event) | — | **fehlt** — `event_day` sind die Tage der Edition, kein Vorbereitungstermin; es gibt keine Anmeldung, keine Teilnehmerliste | `volunteer_days()` (0069) liefert nur Tage von `summit-27` / `hackathon-27` (0068); Suche nach `volunteer_day` findet nur die Tagespräferenz | | |
| Ernährung im Volunteer-Day-Formular | `person.diet` / `diet_note` nach der Zusage | **vorhanden**, an anderer Stelle | `app/(volunteers)/volunteers/page.tsx`, Migration 0100 | | |

---

## 6 · Nacharbeit: „Ohne Account“ / „Non Confirmed“ / dedupliziert (72 / 53) + Interface „NON/FEHLT VOLOS“

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Anrufliste mit `ANRUFER` und Nacharbeit-Status (AUSSTEHEND · ANGERUFEN-… · POSITIV · ABSAGE · NUMMER FALSCH) | — | **fehlt** — kein Telefonfeld in der Volunteer-Sicht, kein Anruf-Status, keine Zuweisung an Anrufer | `volunteer_admin_overview` gibt Name, Mail, Status, Wünsche, Notiz und Zählwerte aus, keine Telefonnummer (0065) | | |
| „Wer hat nicht bestätigt?“ sichtbar machen | Schichtplan zeigt je Schicht jede Person mit Stand | **anders** — sichtbar je Schicht, nicht als Arbeitsliste über alle Schichten | `ShiftPlan.tsx` (`people[].status`), `shift_plan` (0065) | | |
| „Ohne Account“ (Login-Probleme) | entfällt: Login ist die Bewerbung | **anders**, mit Absicht | `app/(volunteers)/layout.tsx` (Bereich steht jeder angemeldeten Person offen) | | |
| Deduplizieren von Personen | `/admin/dubletten` (bereichsübergreifend) | **vorhanden**, an anderer Stelle | `app/(admin)/admin/dubletten/page.tsx` | | |
| Wer hat sein Ticket nicht geholt | `/admin/volunteers/tickets` mit Erinnerungsdatum | **vorhanden**, neu | `volunteer_tickets_admin` (0084), `app/(admin)/admin/volunteers/tickets/TicketTable.tsx` | | |

---

## 7 · „Feedback_“ (16) und „Feedback Team Leads“ (6)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Retro-Fragebogen für Volunteers (Ratings + Freitext) | — | **fehlt** | keine Tabelle, keine RPC, keine Seite; Suche nach `nps` ohne Treffer | | |
| Retro-Fragebogen für Team Leads | — | **fehlt** | s. o. | | |
| ~40 Feedbackfelder an der Volunteer-Zeile | — | **fehlt** | s. §1 | | |

---

## 8 · Interfaces und Formulare

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Interface „VOLO ÜBERSICHT“ (Bewerbungen + Zuteilung) | `/admin/volunteers` (Bewerbungen) und `/admin/volunteers/schichten` (Plan) | **vorhanden**, auf zwei Reiter geteilt | `app/(admin)/admin/volunteers/page.tsx`, `.../schichten/page.tsx`, Reiter in `shell.tsx` | | |
| Interface „NON/FEHLT VOLOS“ | — | **fehlt** (s. §6) | | | |
| **8 Standalone-Formulare** (Bewerbung, Waitlist, Volunteer Day, Nacharbeit u. a.) | ein Wizard plus änderbares Profil | **anders** — ein Login statt acht Formularlinks; drei der Formularzwecke haben kein Gegenstück (Waitlist §3, Volunteer Day §5, Nacharbeit §6) | `ApplyForm.tsx`, `ProfileView.tsx` | | |
| Zugriffsgrenze = wer welches Interface geöffnet bekommt | Rollen: `is_volunteer_team()` = `admin` + `area_lead_volunteers`; Schichtleitung sieht ausschließlich ihre eigenen Schichten | **anders**, enger | `is_volunteer_team` (0070), `my_lead_shifts` (0070), Entscheidungslog 14.09.2026 („Schichtleads sehen keine Bewerbungen“) | | |
| Export der Ansichten aus Airtable | CSV-Export Bewerbungen + Schichtplan, nur Team | **vorhanden**, neu | `app/(admin)/admin/volunteers/export/route.ts` (ohne Geburtsdatum, Datenminimierung) | | |

---

## 9 · Notion-Volunteer-Wiki (≈53 Artikel)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Wiki als Notion-Seite, per Link aus dem Briefing | `/volunteers/wiki` im Portal, mit Phasen- und Rollenfilter | **vorhanden** als Gefäß, **inhaltlich leer** — der Seed 0096 enthält zehn Artikel für Partner/Speaker/Talent, keinen für `volunteer` | `app/(volunteers)/volunteers/wiki/page.tsx`, `kb_article` (0083), `supabase/migrations/20260915114852_v5_wiki_inhalte.sql` (Zielgruppen `{partner,speaker}` / `{partner}` / `{partner,speaker,talent}`) | | |
| Import der ≈53 Artikel | Import-Skript mit Trockenlauf | **vorhanden** als Werkzeug, **nicht ausgeführt** — der Notion-Export fehlt | `scripts/wiki-import.mjs` (`--apply`, sonst Trockenlauf; Rollen aus `Rolle:`-Zeile, Phase aus `Phase:`); Entscheidungslog 14.09.: „Notion-Export des Volunteer-Wikis“ offen für Konrad | | |
| Rollen-Seiten (Check-In Hero, Stage Management, Speaker Management, Guest Relations, Logistics Hero, Side Events …) | `kb_article.roles[]`, Aufruf über `/volunteers/wiki?rolle=…` | **vorhanden** als Struktur | `kb_article.roles` (0083:46,71), `kb_articles(…, p_role)` (0083:174), `wiki/page.tsx` | | |
| Event-Phase (vor Event / Aufbau / Event / Abbau) | `kb_article.phase`, Vokabular `kb_phase` | **vorhanden**, neu gegenüber Notion | `20260914095053_v4_wissensbasis.sql:32–36,47` | | |
| DE-Seiten mit englischen Zwillings-Unterseiten | `kb_article.language` + Sprachrückfall | **anders**, besser — eine Sprachvariante je Artikel statt zweier Seiten | 0083, Korrektur 0088 (`20260914104823` Wiki-Sprachrückfall) | | |
| Blöcke „The Team“ mit Fotos, Vornamen und **WhatsApp-Einladungslinks** auf fast jeder Rollen-Seite | — | **bewusst weggelassen** — private Kontaktdaten von Team und Freelancern gehören nicht ins Portal (AGENTS „Datenschutz“; Inventar §14.1 Bewertung: durch Rollenbezeichnungen ersetzen) | `docs/legacy-inventar.md` §14.1, `AGENTS.md` | | |
| Hart codierte Termine, Orte, Parktarife, Tickettypen „…2026“ | Fristen und Termine als Daten (`deadline` je Edition), Wiki mit Edition-Overlay | **anders**, mit Absicht | `kb_article.edition_id` als Overlay über den evergreen-Artikel (0083:66–69,141–175) | | |
| „Volunteer Web-App“-Seite und „WhatsApp-Gruppen“-Seite | Portal selbst; WhatsApp entfällt | **bewusst weggelassen** | Entscheidung 08.09. (s. §1) | | |
| Volunteer Handbook (Kopie des Slush-Handbooks, ~61.000 Zeichen) | — | **bewusst weggelassen** — liegt in „OLD Volunteer Home“ und ist laut Inventar ausdrücklich auszuschließen | `docs/legacy-inventar.md` §14.1 | | |
| Chatbot „Chefi“ neben dem Wiki | — | **fehlt** — Wissensbasis steht, Chatbot ist für Welle 5 vorgesehen und nicht gebaut | Masterplan Ergänzung v0.1b; `kb_chunk`/pgvector in keiner Migration | | |

---

## 10 · Check-in (Airtable-Check-in + Rollenseiten „Check-In Hero“)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Check-in über Airtable-Ansicht auf dem Gerät | `/checkin` als Kiosk mit Kamera und QR-Decoder | **vorhanden**, besser | `app/(checkin)/checkin/page.tsx`, `KioskScanner.tsx` (jsQR), RPC `checkin_scan` (0090) | | |
| Gerät sieht die ganze Base | Kiosk-Konto mit genau einer Rolle, kein Menü, kein anderer Bereich | **anders**, deutlich enger (E8) | `requireArea("checkin")`, `isKioskOnly` in `lib/areas.ts:100`, Entscheidungslog 14.09. („Kiosk nicht im Umschalter“) | | |
| Ergebnis am Gerät (gültig / schon da / unbekannt) | Ampel plus Klartext, Name und Pass-Typ | **vorhanden** | `KioskScanner.tsx`, Antwort `ok` / `already` / `unknown` / `invalid` aus `checkin_scan` | | |
| Gerätekennung im Protokoll | Mailadresse des Kiosk-Kontos | **vorhanden**, neu | `app/(checkin)/checkin/page.tsx:29` | | |
| Getrennte Counter (Regular · Partner & Exhibitor · Speakers · Support · Entrance Control, Pre-Scan, Flow Manager) | ein Kiosk für alle Pass-Typen | **anders** — die Pass-Typen werden angezeigt, aber nicht getrennt bedient; keine Counter-Rollen, kein Pre-Scan | `PASS_TYPES` in `app/(checkin)/checkin/page.tsx:12` dient nur der Beschriftung | | |
| Zählstand am Counter / Tagesstatistik | Kiosk zählt die Scans **der laufenden Sitzung** | **fehlt** — das Kiosk zählt nur die Scans der laufenden Sitzung; `checkin_stats(edition, day?)` ist gebaut, wird aber nirgends in der Oberfläche gelesen | `KioskScanner.tsx:53,147`; Suche nach `checkin_stats` in `app/`, `lib/`, `components/` ohne Treffer | | |
| Handeingabe bei schlechter Kamera | Textfeld neben dem Scanner | **vorhanden**, neu | `KioskScanner.tsx` (Feld zum Tippen) | | |
| Aufbewahrung der Scans | Löschung 30 Tage nach Editionsende | **vorhanden**, neu | `purge_checkins` (0090), Housekeeping-Cron | | |

---

## 11 · Felder der alten Volunteers-Tabelle, die im neuen Modell kein Gegenstück haben

Reine Auflistung als Eingabe für die Ableitung des optimierten Schichtmodells — keine Bewertung, keine Empfehlung.

- 5 Selbst-Ratings (Sprachkenntnisse, Belastbarkeit, Erfahrung u. a.)
- Sicherheitsbriefing (Feld und Nachweis je Person)
- Zertifikat / Teilnahmebescheinigung
- ~40 Feedbackfelder (Retro nach dem Event)
- Crew-Buddy als echte Zuordnung (nur der Wunsch als Freitext ist da)
- „Helped before“ (no / once / twice) und die Jahres-/Historie-Felder
- Nacharbeit-Status (AUSSTEHEND · ANGERUFEN-… · POSITIV · ABSAGE · NUMMER FALSCH) und das Feld `ANRUFER`
- Telefonnummer in der Volunteer-Sicht
- „Zugeteilt Status“-Sonderwert **Praktikum**
- Rollen-Wert **Wartepool** als Rolle (ersetzt durch den Zustand `waitlisted` je Schicht)
- 6× Tages-Zuteilung und 6× „Staffed“ als Spaltenpaare je Eventtag
- Accommodation: Bett, Arrival, Departure, Bezahlung
- Anmeldung Volunteer Day (Kick-off) und die dortige Dietary-Angabe als eigener Vorgang
- Discount-Code 50 % (ersetzt durch den Crew-Coupon)
- Prefilled-Link-Felder („Unique Onboarding Form“, „Prefilled link“)
- Kommunikations-Checkboxen je Mailing-Welle
- Bewertungsfeld der Warteliste
- Areas/Rollen-Vokabular selbst: die 6 Bereiche und 20 Rollen sind im neuen Vokabular `volunteer_area` **noch nicht angelegt**

---

## Fragen an Konrad

1. **Bereiche und Positionen 2027:** Das Vokabular `volunteer_area` ist leer, damit lässt sich keine Schicht anlegen. Soll die Liste 1:1 aus 2026 übernommen oder vorher zusammengefasst werden (die 20 Rollen enthalten sechs Bühnen als einzelne Rollen)?
2. **Bewerber-Warteliste:** Braucht FLS27 einen Zustand zwischen „beworben“ und „angenommen“ (Warteliste vor der Zulassung), oder genügen `applied` und die Warteliste je Schicht?
3. **Sicherheitsbriefing und Zertifikat:** Beides fehlt vollständig. Ist das für FLS27 nötig — und wenn ja, als Häkchen je Person oder als Nachweis mit Datum?
4. **Feedback nach dem Event:** Soll die Retro (Volunteers und Team Leads) ins Portal, oder bleibt sie außerhalb?
5. **Unterkunft:** Hostel-Betten gab es 2026 als eigene Zuteilung, entschieden ist „Add-on im vivenu-Shop“ — gebaut ist keins von beiden. Was soll es 2027 sein?
6. **Volunteer Day:** Gibt es 2027 wieder einen Kick-off mit Anmeldung? Dann fehlt dafür ein Vorgang.
7. **Nacharbeit per Telefon:** Soll das Portal die Anrufliste tragen (Telefonnummer, Anruf-Status, Anrufer), oder bleibt das außerhalb?
8. **Crew-Buddy:** Reicht der Wunsch als Freitext, oder soll das Team Buddys wirklich paaren (dann braucht es die Zuordnung in der Oberfläche)?

## Nicht geprüft

- **Nichts am Gerenderten.** Alle Zeilen sind Codebefunde. Die Lehre aus F4 gilt: ein serverseitiger Abruf zeigt nur den ersten Zustand einer Seite, und ein Blick in den Quelltext zeigt nicht, ob eine Funktion mit echten Daten auch trägt. Was hier „vorhanden“ heißt, ist im Walkthrough zu bestätigen.
- **Keine Daten.** Ob `volunteer_area`, `shirt_size` oder `kb_article` in Frankfurt tatsächlich gefüllt sind, wurde nicht abgefragt — nur, was die Migrationen anlegen.
- **Die Airtable-Base wurde nicht erneut geöffnet.** Grundlage ist `docs/legacy-inventar.md` §5 und §14.1 vom 07./08.09.2026. Das vollständige Auslesen der Tabelle `tblOjtNrvZWYFLf8e` (alle Felder, alle Ansichten) steht als eigene Aufgabe aus (Arbeitsauftrag Welle 4, E1) — erst danach ist die Feldliste in §11 abschließend.
- **Notion-Volunteer-Wiki:** Umfang aus der Startseite rekonstruiert (≈53 Artikel), nicht Artikel für Artikel gezählt; die Zuordnung Artikel → Rolle konnte nicht geprüft werden.
- **Check-in am Gerät.** Der Kamerapfad auf einem echten iPad (Safari) ist laut Arbeitsauftrag Welle 4 (Status 14.09., V) noch offen.
