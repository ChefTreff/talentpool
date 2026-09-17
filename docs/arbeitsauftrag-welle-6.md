# Arbeitsauftrag Welle 6 — Formate, Partner-Struktur, Initiativen, Produktstamm, Belege, Rollen (Entwurf 17.09.2026)

> **Quelle:** Konrads Walkthrough-Antworten vom 17.09.2026 (Matrizen `docs/abgleich/partner-hub-rest.md`, `messeshop.md`, `initiativen.md`, Speaker-Punkte, Rückfragen 1–3, Backend-Vorentscheidungen) und `docs/plan-ergaenzung-2026-09-17.md` §2. Backlog-IDs verweisen auf `docs/feedback/*.md`.
> **Arbeitsteilung:** Das Datenmodell (Abschnitt A) legt die Architektur-Session hier fest. Die Chats schreiben ihre Migrationen **als Dateien** unter `supabase/migrations/vorschlag/` mit Test nach `docs/db-konventionen.md`; anwenden, umbenennen, Entscheidungslog macht die Architektur-Session. Oberfläche (B) je Chat mit dem heutigen UI-Kit und dem Skill `/portal-design`; das Design-System v2 (PR #53) zieht nach dem Merge automatisch auf regelkonforme Seiten.
> **Tempo (Konrad):** P1 und P2 kurzfristig, mehrfach testbar. Reihenfolge in E.

## Was schon da ist (nicht neu bauen)
- **Programm:** `event` → `event_day` → `stage`/`stage_day` → `slot` → `session` mit `session_speaker`; Formate als Vokabular `session_format` (`keynote`, `panel`, `masterclass`, `company_tour`, `side_event`, `podcast`, `workshop` kommen in Migrationen vor — Bestand beim Erweitern prüfen).
- **Bewerbungen:** `session.access_mode = 'application'`, `question_catalog`, `session_question`, `application` mit Pipeline und `decision_release`; Partner-Sicht `/partner/bewerber` (Freigabe-Gate, Consent `share_with_partner`); Export als v2 vorgemerkt (Welle 3).
- **Leistungen:** `product` (SKU, Kategorie, Preise, `shop_visible`, `shop_sort`, Hinweise), `org_product` (gebucht, aus HubSpot-Positionen), `deliverable_template` → `deliverable` je Produkt, `visibleNavKeys` in `app/(partner)/partner/nav.ts` (Seiten nach SKU/Flag), `shop_phase` (heute drei Phasen), `stock_ledger`, `shop_order`, `shop_request`.
- **Hospitality:** `hospitality_quota`, `hospitality_booking` (`kind`, `details jsonb`, Status), Anreise `speaker_travel`; `edition_contact` (Ansprechpartner mit dienstlichen Kontaktdaten, Foto).
- **Dateien:** Buckets `partner-assets` (privat), `partner-logos` (öffentlich), `speaker-assets`, `edition-files`; `partner_asset`, `speaker_asset`, `external_ref`, Schema `integration` (`sync_job`, `sync_error`).
- **Rollen:** `role_assignment`, `has_role()`, `team_role_keys()` (0106), Admin über Rolle (0107), `edition_contact`.
- **Wissensbasis + Assistent** (0108/0109), `portal_video` (0092), Team-Verwaltung `/admin/team`.

---

## A · Datenmodell (verbindlich; Migrationen als Dateien durch den genannten Chat)

### A1 · Formate und „Partner am Slot“ — Chat Partner (mit Talent & Hackathon für die Teilnehmerseite) — PART-042/044–048, TAL-002/003, LEAD-010, ADM-025/026
1. **Vokabular `session_format`** um `interview_table` ergänzen (`side_event` prüfen, ob als Format vorhanden). Anzeigenamen DE/EN in `vocab_term`.
2. **`session.partner_org_id uuid references organization`** (nullable, Index). Ein Slot „gehört“ damit einem Partner: Keynote/Panel (Talk), Masterclass, Company Tour, Side-Event, Interview Table. Setzen dürfen Admin und Speaker-Leads (`can_edit_stage`/Programm-Team) über `set_session_partner(session_id, org_id|null)` mit Audit.
3. **`session.format_details jsonb not null default '{}'`** — formatspezifische Angaben, Schlüssel je Format **fest dokumentiert und in der RPC geprüft** (keine freien Schlüssel, kein Personenbezug):
   - `side_event`: `location_text`, `image_asset_id` (Hintergrundbild fürs Programm, Bucket `partner-assets`, Pfadprüfung wie `partner_asset_path_allowed`).
   - `interview_table`: `job_title`, `job_posting_text` (≤ 2.000 Zeichen), `job_posting_url`, `target_profile` (Objekt mit denselben Vokabular-Schlüsseln wie das Teilnehmerprofil: `experience_level[]`, `study_background[]`, `career_level[]`, …).
   - `company_tour`: die neun Angaben aus 2026 — `contact_name`, `contact_email`, `contact_phone` (Ansprechperson des Partners, dienstlich), `address`, `time_note`, `snacks` (bool), `notes` (Anmeldung, Personalausweis, Sicherheitskleidung), `target_profile`, `photos_allowed` (bool).
   - `masterclass`, `keynote`, `panel`: keine Zusatzfelder — Titel, Beschreibung DE/EN, Sprache stehen an `session`.
4. **Wer legt Sessions an?** Team wie bisher (Admin, Programm). **Partner** nur über `partner_create_session(p_format, p_payload)` für `side_event` und `interview_table`, und nur im Rahmen eines Anspruchs: `product.format_key text` (neu) sagt, welches Format eine gebuchte Leistung öffnet; `partner_entitlement(org, format)` = Summe `org_product.qty` mit diesem `format_key` minus vorhandene Sessions des Partners in diesem Format (Interview Table: Sessions je Tisch-Tag unbegrenzt in Zahl, aber nur innerhalb der gebuchten Tage; Details in der RPC). Masterclass und Company Tour legt das Team an (fester Slot), der Partner **füllt** sie über `partner_update_session(session_id, p_fields)` — Whitelist je Format: `title_de/en`, `description_de/en`, `language`, `format_details`-Schlüssel; niemals Zeiten, Bühne, Kapazität, Status, `partner_org_id`.
5. **Interview Tables:** je Slot eine `session` (Format `interview_table`, `partner_org_id`, `starts_at`/`ends_at` innerhalb der gebuchten Tage, `capacity` Standard 1 — offen D1). Der Partner legt, ändert und löscht seine Slots, solange keine Bewerbung `accepted`/`confirmed` daran hängt.
6. **Bewerbungsfragen:** `question_catalog.partner_selectable boolean default false`; `partner_set_session_questions(session_id, question_ids[])` erlaubt nur wählbare Katalogfragen; **neue Fragen auf Antrag**: `question_request` (org_edition_id, session_id, wording_de/en, purpose, status offen/angenommen/abgelehnt, decided_by, audit) — das Team prüft und legt bei Annahme die Katalogfrage an. **Regel:** keine Fragen zu Art.-9-Daten; Geschlecht nur als optionale Frage mit ausgewiesenem Zweck (z. B. Frauen-Format), Auswertung nur aggregiert im Export.
7. **Bewerbungen verwalten (Partnerseite):** `partner_session_applications(session_id)` (existiert im Kern über `/partner/bewerber`, um Format-Sessions erweitern), zwei Listen: Bewerbungen und **Teilnehmer** (`accepted`/`confirmed`), `export_session_applications(session_id)` als CSV **nur mit den Feldern, für die `consent_share` vorliegt**, jeder Export im Audit-Log (wer, wann, wie viele Zeilen).
8. **Talk (Keynote/Panel):** Partner sieht seinen Slot gespiegelt (`partner_sessions()` liefert alles, was das Speaker-Portal unter „Slot“ zeigt, außer internen Notizen). **`partner_add_speaker(session_id, p_person)`**: legt Person (E-Mail-Dublettenprüfung wie `handover`-Muster), `speaker_profile` (Pipeline `invited`, `owner_person_id` = zuständige Speaker-Leitung nach Bühne) und `session_speaker` an, löst die normale Speaker-Einladung aus; erlaubt nur, wenn `partner_org_id` = eigene Org und die Session noch keinen bestätigten Speaker in dieser Rolle hat; Audit. Der Partner-Kontakt darf danach Stammdaten des Speakers pflegen, **bis der Speaker sich selbst angemeldet hat** (`speaker_profile.partner_editable_until_login`) — danach nur noch lesen.
9. **Sichtbarkeit:** Partner-Kontakte lesen Sessions ihrer Org über RPC (keine neue Policy auf `session`); Teilnehmende sehen Format-Sessions über `programme_public` (mit `format_details` ohne `contact_*`).

### A2 · Branding — Chat Partner — PART-043
`deliverable_template` für die Branding-Produkte (zuerst „Digital Branding (16:9)“: Dateiregel Bild 1920×1080, PNG/JPG/PDF; weitere Standelemente als Daten ergänzbar); Seite `/partner/branding` listet die Pflichten der Branding-Produkte mit Upload — dasselbe Upload-Feld wie in Checkliste und Dateien (PART-035). Keine neue Tabelle.

### A3 · Initiativen — Chat Admin & Schnittstellen — ADM-022/024
1. `organization.type = 'initiative'` (Vokabular prüfen), **`org_edition.pipeline_stage text`** mit Vokabular `initiative_stage` (`outreach`, `gespraech`, `agreement`, `onboarding`, `aktiv`, `abgelehnt`) und `org_edition.source` = `portal` (statt HubSpot). Funnel-RPCs `set_initiative_stage` (Audit), Liste `initiatives_admin(edition)`.
2. **Leistungen ohne HubSpot:** `assign_org_products(org_edition_id, [{sku, qty}])` legt `org_product`-Zeilen mit `source = 'agreement'` und Preis 0 an (Barter); Pflichten entstehen über den bestehenden Trigger.
3. **Rabattstufen:** `org_ticket_allocation.discount_percent integer not null default 100` (erlaubt 100, 50); `sync_ticket_allocations` und die vivenu-Coupon-Anlage (`lib/vivenu/allocations.ts`: `discountValue` aus dem Prozentsatz) nehmen den Wert mit; zwei Kontingente je Org mit unterschiedlichem Satz sind zulässig.
4. **Produkte (Daten, keine Migration nötig außer Seed):** `INI-PARTNERSCHAFT` (Pflichten: Logo SVG/PNG, Beschreibung, Volunteer-Zusage als Formularfeld „Anzahl“), `INI-BEACHFLAG` (Pflicht: Druckdatei), `INI-STAND-2T`, `INI-STAND-1T`.
5. **Stände tagesweise:** `booth_assignment (booth_id, org_edition_id, event_day_id null = alle Tage, unique(booth_id, event_day_id))` ersetzt `booth.org_edition_id unique`; Produktion sieht je Tag, wer am Stand ist. Bestand migrieren.
6. **Award (P3, eigener Baustein später):** `initiative_award_entry`, öffentliche Abstimmung mit Missbrauchsschutz (Rate-Limit je IP-Hash, ein Vote je Browser, keine Personendaten), öffentliche Seite in `PUBLIC_PATHS` — Sicherheitsgrenze, Freigabe durch die Architektur-Session.

### A4 · Produktstamm und Abgleich — Chat Ops (Oberfläche) + Admin & Schnittstellen (Abgleich) — PROD-006, PART-038
1. `product` bekommt `available_phase2 boolean not null default false` („kurzfristig bestellbar“), `image_path text` (Bucket `product-images`, öffentlich, Pfad `<sku>/<uuid>.<ext>`); `upsert_product(p)` für `production_team`/Admin mit Audit (Felder: Name DE/EN, Beschreibung, Kategorie, Preise, USt-Satz, Bestand, Sichtbarkeit, Phase, Sortierung, Hinweise, `format_key`, Bild).
2. **Zwei Phasen:** `deadline`-Schlüssel `shop_phase1_end` (19.03.2027) und `shop_phase2_end` (09.04.2027); `shop_phase()` liefert `phase1 | phase2 | closed`; in Phase 2 nur Artikel mit `available_phase2`. Die dritte Phase entfällt (Entscheidung 17.09. ersetzt 10.09.).
3. **Abgleich:** `integration.sync_job` Typ `product_sync` (Richtung `out`): HubSpot Products API (Anlage/Update je SKU, Referenz in `external_ref` system `hubspot`, object_type `product`), SevDesk Part API (Artikel mit eigener ID, `external_ref` system `sevdesk`); idempotent über SKU, Fehler in `sync_error`; Route `/api/admin/products/sync` (Admin/Produktion, Rollenprüfung vor `service_role`), Auslösung nach Speichern und nächtlich. Ersetzt Airtable-Formular und make.com.

### A5 · Belege aus SevDesk — Chat Admin & Schnittstellen — PART-036
Täglicher Abruf je Organisation mit `sevdesk_contact_id`: Angebote und Rechnungen (inkl. Messeshop-Rechnungen) als PDF in den privaten Bucket `partner-assets` unter `<edition>/<org>/documents/<sevdesk_id>.pdf`, Zeile in `partner_asset` (`kind` `offer` | `invoice`, `external_ref` system `sevdesk`), Partner liest über `/partner/dateien` mit signierter URL. Rückfall: `upload_partner_document` durch das Team. Nur Lesen bei SevDesk; kein Löschen, kein Schreiben.

### A6 · Rolle Marketing, Grafiken, Bühnenfotos — Chat Admin & Schnittstellen — ADM-023/027, PART-041, SPK-019
1. Vokabular `role` + `team_role_keys()` um **`marketing_team`** ergänzen; `can_manage_media()` = Admin oder `marketing_team`. Vergabe in `/admin/team`.
2. **Media Kit:** Bucket `media-kit` (privat), Tabelle `media_kit_item` (Titel DE/EN, Datei, Zielgruppe `partner`/`speaker`, Sortierung, gültig ab/bis); Partner und Speaker lesen ihre Zielgruppe über RPC mit signierter URL. **Partnergrafik** je Org als `partner_asset` kind `partner_graphic` (Erzeugung: zunächst Upload durch das Marketing; automatische Erzeugung später mit den Slot-Grafiken).
3. **Bühnenfotos je Slot:** `session_asset` (session_id, kind `stage_photo` | `slot_graphic` | `speaker_graphic`, path, uploaded_by, created_at) im Bucket `session-assets` (privat); sichtbar für die Speaker der Session, den Partner der Session (`partner_org_id`) und das Team; **Benachrichtigung** an die Speaker beim ersten Foto (`mail_template` `stage_photos_ready`, DE/EN). LinkedIn-Vorlagen als `media_kit_item` Zielgruppe `speaker`.

### A7 · Speaker: Shuttle, Technik, Ansprechperson — Chat Speaker-Domäne — SPK-015/016/018, ADM-028, PROD-007
1. **Shuttle:** eigene Tabelle `shuttle_booking` (profile_id, passenger_name, passengers integer, driver_phone, pickup_at, pickup_location, pickup_address, dropoff_location, dropoff_address, latest_arrival_at, status `requested|confirmed|cancelled`, booked_by_email, note, created_by, confirmed_by/at, cancelled_at) — die Felder der Airtable-Tabelle 2026; mehrere Fahrten je Speaker, auch Zwischenfahrten; RPCs `request_shuttle`, `cancel_shuttle` (Speaker/Assistenz), `confirm_shuttle` (Team), Liste `shuttle_bookings_admin(edition)` + CSV-Export für das Unternehmen (nur Fahrtdaten, kein Bezug zu anderen Personendaten). `hospitality_booking` kind `shuttle` läuft aus (Bestand übernehmen, Kind entfernen).
2. **Technik am Slot:** `session.tech jsonb` mit festen Schlüsseln nach Regie 2026: `people_on_stage`, `microphone` (`headset|hand|both`), `presentation_media[]` (`slides|video|audio|none`), `special_requirements`, `furniture`; Speaker/Assistenz schreiben über `update_session_tech(session_id, tech)` nur für eigene Sessions; Regie (`regie_cue`, `/produktion`) und Speaker-Leads lesen. `speaker_profile.tech_rider` bleibt als Vorbelegung, wird beim Anlegen der Session-Technik übernommen.
3. **Ansprechperson:** `my_speaker_contact()` liefert die Kontaktdaten der betreuenden Person (Owner aus `speaker_profile.owner_person_id`, Daten aus `edition_contact` der Edition, sonst `person` + dienstliche Angaben) — Name, Foto, E-Mail, Telefon; nur für den eingeloggten Speaker und seine Assistenz. Voraussetzung (Checkliste): Kontaktdaten der Speaker-Buddys in `edition_contact` gepflegt.

### A8 · Aufräumen aus der Feld-Matrix — Architektur-Session (Migration 0110, eigener Baustein)
`organization.description_de/en` (Bestand aus `org_edition` übernehmen, dort entfernen; `update_partner_onboarding` schreibt nur noch an die Organisation) · `person.photo_path` im Bucket `person-photos` (privat) statt `photo_url`, Bestand migrieren, Anzeige über signierte URL · `staff_user` und `scripts/make-staff.mjs` entfernen (inkl. `staff_users_without_admin()`) · `speaker_profile.job_title/organization_name` bleiben als Snapshot, Vorbelegung aus `person` beim Anlegen (Trigger).

---

## B · Oberfläche je Chat (Bausteine = je ein PR; UI mit heutigem Kit; Backlog-Status pflegen)

**Partner**
- B1 · Seitenleiste in zwei Gruppen „Euer Summit“ (Checkliste, Dateien, Tickets, Event-App, Messeshop, Media Kit) und „Eure Formate“ (nur Menügruppe: Messestand, Masterclass, Company Tour, Side-Event, Interview Table, Hackathon, Branding, Talk), Seiten nur bei gebuchtem Produkt (`product.format_key`/Nav-Schlüssel) — PART-042 · **P1**
- B2 · Shop nur mit gebuchtem Messestand; zwei Phasen mit Artikel-Flag — PART-037/038 · **P1** (Migration A4.2)
- B3 · Challenge-Frist vier Wochen (`weeks_before` auswerten oder Vorlage umstellen) — PART-040/032 · **P1**
- B4 · Hackathon-Sektion mit Challenge, Preisen, Fristen, Ansprechpartner, eigenem Backdrop — PART-033
- B5 · Branding — PART-043 (A2)
- B6 · Talk: Slot gespiegelt, Speaker eintragen — PART-044 (A1.8)
- B7 · Masterclass, Company Tour, Side-Event, Interview Tables — je Seite zwei Sektionen (Inhalte, Bewerbungen mit Fragen, Liste, Teilnehmer-Tab, Export) — PART-045–048 (A1)
- B8 · Uploads gespiegelt in Checkliste und Dateien — PART-035
- B9 · Belege im Dateibereich — PART-036 (A5)
- B10 · Media Kit — PART-041 (A6)
- B11 · Video-Pop-up und „Anleitung & Support“ — PART-039 · P3

**Speaker-Domäne**
- S1 · Ansprechperson mit Kontaktdaten — SPK-015 (A7.3)
- S2 · Shuttle-Formular und -Liste — SPK-016 (A7.1)
- S3 · Einwilligung als Pop-up nach „Buchen“ — SPK-017
- S4 · Technik unter „Slot“ — SPK-018 (A7.2), Regie liest (PROD-007 mit Ops abstimmen)
- S5 · „Media Kit & Bühnenfotos“ — SPK-019 (A6.3)
- S6 · Talk-Generator — SPK-012 (Technik wie Assistent)
- S7 · Grafik-Maske — SPK-013
- S8 · Kalender-Einladungen, Versand gesperrt — SPK-014
- S9 · Folien nach dem Summit (Speaker-Seite) — SPK-011
- L1 · Partner am Slot im Board — LEAD-010 (A1.2)

**Admin & Schnittstellen**
- M1 · Rolle `marketing_team`, `/admin/grafiken` (Media Kit, Partnergrafiken, Bühnenfotos, Speaker-/Slot-Grafiken) — ADM-023/027/020 (A6)
- M2 · Initiativen-CRM — ADM-022 (A3)
- M3 · Company-Tours-Planung `/admin/programm/company-tours` — ADM-026 (A1)
- M4 · Partner am Slot im Admin-Programm — ADM-025 (A1.2)
- M5 · Produktabgleich HubSpot/SevDesk — A4.3
- M6 · Belege-Abruf SevDesk — A5
- M7 · Shuttle-Export — ADM-028 (A7.1)
- M8 · Verwaltungsfunktionen aus der Feld-Matrix: Editionen, Tage, Bühnen, Slots, Tracks anlegen; Mail-Vorlagen; Vokabular-Werte — Feld-Matrix (a), team-werkzeuge.md
- M9 · Award — ADM-024 · P3 (A3.6, Freigabe Architektur)

**Volunteers, Produktion & Check-in**
- O1 · Produktionsliste je Stand = Paket + Shop — PROD-004 · **P1**
- O2 · Interne Stand-Checkliste — PROD-005
- O3 · Produktstamm-Pflege `/produktion/produkte` — PROD-006 (A4.1)
- O4 · Technik im Regieplan — PROD-007 (A7.2)

**Talent & Hackathon**
- T1 · Bewerbung für alle Formate gleich, mit Format-Details — TAL-002/003 (A1)
- T2 · Folien nach dem Summit (Teilnehmerseite) — TAL-001
- H1 · `/hackathon` bleibt Teilnehmer-App; Partner-Teile wandern — HACK-005

---

## C · Regeln
- **Ansprüche prüft die Datenbank, nicht die Oberfläche:** jede Partner-RPC prüft `partner_org_id`/Mitgliedschaft und den Anspruch aus `org_product`; Whitelists je Format; Fehlerschlüssel 42501 / 22023 (`invalid_format`, `no_entitlement`, `slot_locked`, `question_not_selectable`) in `BUSINESS_KEYS` und beiden Wörterbüchern.
- **Datenminimierung bei Bewerbungen:** Export und Listen nur mit Feldern, für die `consent_share` vorliegt; Export im Audit-Log; keine Art.-9-Fragen; Geschlecht nur optional mit Zweck.
- **Dateien** nur in Buckets mit Pfadprüfung und signierten URLs; öffentlich nur `partner-logos` und `product-images`.
- **Integrationen** (HubSpot-Produkte, SevDesk-Artikel und -Belege) nur serverseitig nach Rollenprüfung, idempotent, protokolliert in `integration.sync_job`/`sync_error`; SevDesk nur lesen für Belege.
- **Kontaktdaten von Ansprechpersonen** nur im eingeloggten Portal (SPK-015), dienstliche Angaben bevorzugt.
- Jede Migration mit Test; Suchen und Zuordnungen mit einer menschlichen Frage testen (§6); am Ende `select harden_definer_functions();`.
- Migrationen im Bereich Sicherheitsgrenzen (`PUBLIC_PATHS`, Storage-Policies, Grants fremder Tabellen) nur nach Vorprüfung durch die Architektur-Session.

## D · Offene Entscheidungen (Konrad)
1. **Interview Tables:** Kapazität je Slot — eine Person, oder mehrere (Gruppengespräch)?
2. **Freigabe-Gate:** Erscheinen partner-angelegte Side-Events und Interview-Slots sofort im Programm, oder erst nach Freigabe durch das Team? (Empfehlung: Freigabe, wie bei Entscheidungen zu Bewerbungen.)
3. **Export-Umfang:** Welche Bewerberfelder darf der Partner exportieren (Vorschlag: Name, E-Mail, Antworten auf die Fragen — nur mit `consent_share`)?
4. **Hackathon-Backdrop:** Maße und Dateiregel.
5. **Company-Tour-Zeiten 2027** und Zahl der Tour-Slots.
6. **Award:** Zeitraum der Abstimmung, Jury-Anteil.

## E · Reihenfolge
1. **Sofort (P1):** B1, B2 (mit A4.2), B3, O1.
2. **A1 Formate-Datenmodell** (Partner-Chat schreibt die Migration nach diesem Auftrag, Architektur-Session prüft zuerst das Schema, dann die RPCs) → B6, B7, T1, M3, M4, L1.
3. **Parallel:** A7 (Speaker-Chat) → S1–S4; A6 (Admin) → M1, S5, B10; A4 (Ops + Admin) → O3, M5; A5 (Admin) → M6, B9; A3 (Admin) → M2.
4. **Architektur-Session:** Migration 0110 (A8) diese Woche; Review jeder Migration vor dem Anwenden; Entscheidungslog.
5. **P3 danach:** B11, M9.

## Status
- 17.09.2026: Entwurf der Architektur-Session aus Konrads Walkthrough-Antworten. Offene Entscheidungen D1–D6 an Konrad; A1 gilt vorbehaltlich D1/D2 (Kapazität und Freigabe-Gate sind in der RPC ein Parameter).
