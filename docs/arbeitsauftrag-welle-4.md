# Arbeitsauftrag Welle 4 — Volunteers · Check-in · Hackathon · Produktion · Wissensbasis (Entwurf 11.09.2026)

**Stand:** Entwurf der Architektur-Session, freigabepflichtig. Die mit ▶ markierten Bausteine sind ohne weitere Entscheidung startbar; alles mit ⏳ wartet auf die Antworten unter „Offene Entscheidungen“. Masterplan v0.1e, Zeitfenster laut Plan 01.–09.10., Start jetzt möglich, weil Welle 3 auf der Oberfläche fertig ist.

**Arbeitsteilung (neu, Entscheidungslog 11.09.):** Die Build-Session baut Backend **und** Oberfläche. Migrationen liegen als Dateien mit SQL-Test im PR (`docs/db-konventionen.md`), PR-Titel „Migration enthalten“; angewendet, umbenannt und ins Entscheidungslog geschrieben werden sie nur von der Architektur-Session, der Walkthrough gegen die Datenbank beginnt nach ihrem Kommentar „Migration live“. Ein PR je Baustein, ein Review-Durchgang, Wegwerf-Konten nach den fünf Regeln, ab 01.11. keine Tests gegen die Produktions-DB.

## Was schon da ist (nicht neu bauen)
- Rollen mit Scopes (`role_assignment`, edition-gebunden), Bereiche in `lib/areas.ts` + `requireArea`, Vokabular `role` (u. a. `volunteer`, `volunteer_lead`, `checkin_operator`, `production_team`).
- `ticket` (vivenu-Barcode = QR), `checkin` (Welle 1, ungenutzt — prüfen, ob Spalten zur Kiosk-Logik passen, sonst ersetzen), `registration`/`application` mit Freigabe-Gate, `session` inkl. interner Felder (`internal_title`, `internal_notes`, Regie-Zeiten laut Masterplan), `stage`/`slot`/`event_day`, `booth`, `deliverable`-Engine mit `answers_schema` (Formular-Pflichten!) und `fulfilled_by_sku`, Produktstamm inkl. Hackathon-Produkte, Mail-Warteschlange (`queue_mail`, Housekeeping alle 10 Min.), Audit, Storage-Muster (privater Bucket + Pfadregel), Sicherheits-Header mit `camera=(self)` (Kiosk-Scanner darf die Kamera nutzen).

## A · Backend (Migrationen als Dateien, je mit Test)
| # | Baustein | Inhalt | Akzeptanz |
|---|---|---|---|
| A1 ▶ | Volunteers-Datenmodell | `volunteer_profile` (person, edition, status applied/accepted/declined/withdrawn, shirt_size aus Vokabular, areas[], day_prefs[], availability jsonb, buddy_person_id, notes_internal), `shift` (edition, area, position, start_at, end_at, capacity, location, lead_person_id, briefing_md), `shift_assignment` (shift, person, status assigned/confirmed/declined/no_show, confirmed_at). RPCs: `apply_volunteer(p_data)`, `my_volunteer_profile()`, `update_my_volunteer_profile(p_data)`, `my_shifts()`, `confirm_shift(id)` / `decline_shift(id, reason)`; Team (`is_volunteer_team()` = admin oder `volunteer_lead`): `volunteer_admin_overview(edition?)`, `set_volunteer_status(profile, status, note?)` (accepted ⇒ Rolle `volunteer` Scope edition automatisch, declined/withdrawn ⇒ Rolle endet), `upsert_shift(p_data)`, `assign_shift(shift, person)` / `unassign_shift(id)`, `shift_plan(edition, day?)`. Mails: `volunteer_applied` (Eingang), `volunteer_accepted`/`volunteer_declined`, `shift_assigned`, `shift_reminder` (Housekeeping, 48 h vorher, einmal je Zuweisung). Zuteilung **durch uns** (Antwort 26), keine Selbstbuchung. | Bewerbung nur mit Consent-Version; Kapazität hart (`capacity` ⇒ P0001 `shift_full`); Überschneidung je Person ⇒ 23P01/`shift_overlap`; alles RLS + Spalten-Grants, Mails nur über `queue_mail`; SQL-Test |
| A2 ▶ | Check-in | RPC `checkin_scan(p_barcode, p_device)` nur für `checkin_operator` (Scope edition): Ticket über Barcode finden, Antwort `{status: ok|already|unknown|invalid, holder_name, pass_type, checked_in_at}`; Eintrag in `checkin` (idempotent je Ticket × Tag), `checkin_stats(edition, day?)` für Team und Kiosk-Kopfzeile. Kiosk-Konto sieht **nichts anderes** (kein `my_*`, kein Programm). Aufbewahrung: Scans 30 Tage nach Editionsende löschen (Housekeeping). **Abhängigkeit:** vivenu-Ticket-Ingest (Welle 1 A7b) muss `ticket.barcode` füllen — Stand prüfen und im PR benennen. | Fremder Barcode ⇒ `unknown`, zweiter Scan ⇒ `already` mit Zeit; Operator ohne Edition-Scope 42501; SQL-Test |
| A3 ⏳ | Hackathon | `hack_challenge` (partner_org, edition, title/description DE/EN, prizes, mentors jsonb, status), `hack_application` (person, edition, skills[], team_pref, motivation, status), `hack_team` (name, challenge, members[], status), `hack_submission` (team, url, files, submitted_at), `hack_judging_score` (judge, team, criteria jsonb, total). Partner-Leistung „Challenge“ als **Formular-Pflicht** über die vorhandene `deliverable`-Engine (Template `hackathon_challenge`, Typ form, `answers_schema`), Freigabe durch das Team ⇒ `hack_challenge`. | wartet auf E3–E5 |
| A4 ▶ | Produktion | `regie_cue` je Slot (cue_start/cue_end, umbau_min, mic_assignments jsonb, media jsonb, notes; Scope `production_team`), `booth_service_check` (org_edition × product_sku × checked_by/at, note) — Stand-Checkliste aus gebuchten Leistungen (`org_product`) + Pflichten (`deliverable`) + `booth`; RPCs `regie_view(stage, day)` (alle Sessions inkl. interner Felder, nur `production_team`/Programm-Team), `upsert_regie_cue`, `booth_checklist(edition, org?)`, `set_booth_service_check`. | Partner sehen keine Regie-Felder; Team-RPCs 42501 für andere; SQL-Test |
| A5 ▶ | Wissensbasis | `kb_article` (slug, audience[] partner/speaker/talent/volunteer/hackathon, role[], phase vor/aufbau/event/abbau, language, edition_id null = evergreen, status draft/published, valid_until, owner_person_id, title, body_md, updated_by), Overlay-Regel: Artikel mit `edition_id` überlagert den evergreen-Artikel gleichen Slugs; RPCs `kb_articles(audience, language, edition?)` (nur published, Audience-Filter nach Rolle), `upsert_kb_article` (Admin/Owner), `publish_kb_article`. Import-Skript für das Volunteer-Wiki aus der Notion-DB `2c017aa69eee8029b469fde07c244467` (Rollen-Seiten ⇒ `role[]`, Termine/Orte ⇒ Variablen `{{…}}`). `kb_chunk`/pgvector und Chatbot: **Welle 5**. | Partner sehen nur Partner-Artikel, EN vollständig für Speaker; SQL-Test; Import mit `--dry-run` |
| A6 ⏳ | Volunteer-Tickets & Add-ons | Ticket-Code je Volunteer (vivenu-Coupon wie Partner-Kontingente, aber personenbezogen) und Add-ons Unterkunft/Bahn (Antwort 26: Shop-Add-on/Bundle). | wartet auf E2 |

## B · Oberfläche (Kontrakte aus A, Deutsch zuerst, EN vollständig; Hackathon EN zuerst)
| # | Baustein | Inhalt |
|---|---|---|
| B1 ▶ | `/volunteers` Bewerbung + Profil | Wizard (Person, Präferenzen: Bereiche, Tage, Verfügbarkeit, Shirt, Buddy-Wunsch, Consent), danach Profil mit Status; „Zuteilung folgt durch das Team“. |
| B2 ▶ | `/volunteers/schichten` | Meine Schichten mit Ort, Zeit, Lead, Briefing; bestätigen/absagen (Grund); Ticket-Code-Kachel (leer bis A6). |
| B3 ▶ | `/admin/volunteers` | Bewerbungen (Status setzen), Schichtplan je Tag/Bereich (Kapazität, Zuteilung per Auswahl, Konflikte aus der RPC), Export nur Team. |
| B4 ▶ | `/checkin` Kiosk | Große Scan-Ansicht (Kamera via `getUserMedia`, QR-Decoder im Client), Ergebnis in Ampelfarben mit Name und Pass-Typ, Zähler; funktioniert im Vollbild auf Tablet; kein Menü, kein anderer Bereich. |
| B5 ▶ | `/produktion` | Regie-Ansicht Bühne × Tag (Slots, Sessions, Cues, Mikros, Umbau), Stand-Checkliste je Partner mit Abhaken; nur `production_team`/Programm-Team. |
| B6 ▶ | Wiki | `/admin/wiki` Editor (Markdown, Audience, Rolle, Phase, Sprache, Edition-Overlay, Veröffentlichen) und Anzeige je Bereich (Partner-Wiki im Partnerbereich, Speaker-Wiki EN im Speakerbereich, Volunteer-Wiki mit Rollen-/Phasenfilter). |
| B7 ⏳ | `/hackathon` Teilnehmer | Bewerbung, Team bilden/beitreten, Challenge wählen, Einreichung, Zeitplan; Judging-Ansicht für Jury. |
| B8 ⏳ | Partner-Hackathon-Leistungen | Challenge-Formular als Pflicht in der Checkliste (rendert die Engine schon), Mentoren/Preise; Sichtbarkeit produktbasiert (`hackathon`-Produkte). |

**Reihenfolge und Branches:** PR 1 = **A1 + B1 + B2** (`welle-4/volunteers`, Migration enthalten) · PR 2 = **B3** (`welle-4/volunteer-admin`) · PR 3 = **A2 + B4** (`welle-4/checkin`, nach Prüfung des Ticket-Ingests) · PR 4 = **A4 + B5** (`welle-4/produktion`) · PR 5 = **A5 + B6** (`welle-4/wiki`) · PR 6 = **A3 + A6 + B7 + B8** (`welle-4/hackathon`, nach E2–E5).

## C · Regeln
- Sicherheit wie in Welle 3: RLS + Spalten-Grants, keine Grants für `anon`, Schreiben nur über RPCs, `service_role` nur serverseitig nach Rollenprüfung, Audit für Team-Aktionen, jede Migration endet mit `select harden_definer_functions();`. Kiosk-Rolle ist die schmalste Rolle im System: zwei RPCs, kein Personenzugriff darüber hinaus.
- Datenschutz: Volunteer-Daten minimal (Shirt, Verfügbarkeit, Buddy-Wunsch), Consent versioniert; Check-in-Scans 30 Tage nach der Edition löschen; keine privaten Kontaktdaten von Team/Freelancern.
- Fehlerschlüssel neu in `BUSINESS_KEYS` + beide Wörterbücher (`shift_full`, `shift_overlap`, `already_applied`, `not_accepted`, `unknown_ticket`, `already_checked_in`, …).
- Walkthrough-Daten: Wegwerf-Konten (`delivered+w4…@resend.dev`), Rollen mit `valid_to` in zwei Stunden, Schichten auf einem Test-`event_day`, danach löschen.

## D · Offene Entscheidungen (Konrad)
- **E1 Volunteer-Bereiche und Shirt-Größen:** Liste der Bereiche (Vokabular `volunteer_area`) und Größen; Mindestalter/Consent für Minderjährige?
- **E2 Volunteer-Ticket + Add-ons:** Ticket als vivenu-Coupon je Person (wie Partner) oder Freiticket-Import? Unterkunft/Bahn als Shop-Add-on im Portal oder extern?
- **E3 Hackathon-Teilnehmer-App in Welle 4 oder nur Partner-Teil** (Frage 25)? Discord bleibt Kommunikationskanal?
- **E4 Challenge-Felder** (Titel, Beschreibung, Preise, Mentoren, Ressourcen?) und **Judging-Kriterien** mit Gewichten.
- **E5 Team-Bildung:** freie Teams, Zuteilung durch uns oder Mischform; Teamgröße.
- **E6 Produktionsportal:** welche Leistungen stehen auf der Stand-Checkliste (Produktkategorien) und welche Regie-Felder braucht die Regie wirklich (Cue-Zeiten, Mikros, Medien, Umbau)?
- **E7 Wiki-Owner** je Wiki (Frage 68) und Sprachen (Volunteers DE, Hackathon EN?).
- **E8 Kiosk-Konten:** ein Konto je Gerät (Magic-Link auf Team-Adresse) oder ein gemeinsames Kiosk-Konto je Edition? Anzahl Geräte, Offline-Verhalten (Zähler nachtragen?).
- **E9 No-Show/Ersatz:** wie werden Schichten bei Absage nachbesetzt (Warteliste je Schicht?)?

## Status
- 11.09.2026: Entwurf (Claude), startbar: A1/A2/A4/A5 mit B1–B6; Hackathon nach E3–E5. Build-Session beginnt mit PR 1 (Volunteers).
