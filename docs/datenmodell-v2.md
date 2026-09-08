# Datenmodell v2 — Überblick (Stand 08.09.2026, nach Welle-0-Migrationen)

> Menschlich lesbare Ergänzung zur generierten Schema-Doku (`docs/schema.md`, Build-Session B11). Quelle der Wahrheit sind die Migrationen unter `supabase/migrations/`. Änderungen nur per Migration und Eintrag im Entscheidungslog.

## Prinzipien
- **RLS auf jeder Tabelle**, default deny. Nutzer (`authenticated`) lesen nur eigene oder veröffentlichte Daten; Spalten-Whitelists blenden interne Felder aus (`slot.internal_*`, `application.status/rank`, `stage.stage_lead_person_id`).
- **Schreiben nur über RPCs** (SECURITY DEFINER, `search_path` gepinnt, Autorisierung im Funktionsrumpf) oder serverseitig über `service_role` nach `requireRole()`. `anon` kann keine SECURITY-DEFINER-Funktion aufrufen.
- **Rollen mit Scope** (`role_assignment`): global · edition · portal · org · stage · stage_day · slot; edition-gebunden, zeitlich begrenzbar. Helper: `has_role()`, `is_admin()`, `is_staff()`, `my_roles()`, `can_edit_stage()`, `can_edit_slot()`, `can_decide_session()`, `is_member_of_org()`.
- **Audit**: `audit_log` über `log_audit()` für Rollen, Slots, Entscheidungen, Ticket-Personalisierung, Profil-Löschung.
- **Löschen = Anonymisieren** (`delete_my_profile()`): PII entfernt, Historie pseudonym, Adressen gehasht in `suppression`, Auth-User danach serverseitig gelöscht.

## Domänen und Tabellen
| Domäne | Tabellen | Kern-RPCs / Views |
|---|---|---|
| Identität | `person` (+ title, city, pronouns, photo_url, tier, deleted_at), `person_email`, `organization` (+ type, slug, website, active, sevdesk_contact_id), `org_membership`, `role_assignment`, `consent_record`, `suppression`, `audit_log`, `staff_user` (Legacy) | `claim_or_create_person`, `set_primary_email`, `delete_my_profile`, View `consent_current` |
| Edition & Programm | `event` (+ slug, is_edition, edition_id, timezone, venue, status), `event_day`, `stage`, `stage_day`, `track`, `slot`, `session`, `session_speaker`, `slot_history` | `create_slot`, `move_slot` (Warnungen: before_open, after_close, off_grid_5min, changeover_short, speaker_conflict; hart: Überlappung je Bühne 23P01, Bestätigung nach Veröffentlichung P0001), `set_slot_status`, Views `programme_public`, `stage_day_slot_stats` |
| Bewerbung & Anmeldung | `question_catalog`, `session_question` (max. 2 eigene), `application`, `decision_release`, `registration` (+ session_id) | Talent: `apply_to_session`, `withdraw_application`, `confirm_application` (Ticketpflicht, Kollision → `p_replace_conflicting`), `register_for_session`, `cancel_registration`, `my_applications()` (maskiert bis Freigabe) · Entscheider: `decide_application`, `release_decisions`, `promote_waitlist`, `expire_overdue_applications` |
| Tickets | `ticket_type_map`, `ticket`, `org_ticket_allocation`, `checkin` | `personalize_ticket` (Käufer/Inhaber, für mich oder andere Person) |
| Integration | `integration.webhook_event` (unique Quelle+ID), `integration.sync_job`, `integration.sync_error`, `external_ref` | — (Route Handler schreiben über service_role) |
| Kommunikation | `mail_template` (key × locale), `mail_log` | `is_suppressed()` (nur service_role) |
| Vokabular | `vocab_term` (33 Vokabulare, 309 Begriffe) | — |
| Migration/Dedup (P0) | `import.staging_contact`, `import.source_person_map`, `potential_duplicate`, `person_merge_log` | — |

## Status-Maschinen
- **Slot** (`slot_status`, Farbe im Board): open → requested → confirmed_title_open → final · unused.
- **Session** (`publish_status`): draft → review → published → cancelled. Pflichtfelder beim Veröffentlichen: Slot (Bühne/Raum), Titel DE+EN, Beschreibung.
- **Bewerbung**: applied → shortlisted → accepted → confirmed → attended / no_show · waitlisted → promoted (→ confirmed) · declined · expired (Frist `confirm_by` = Freigabe + `session.confirm_by_hours`) · withdrawn. Sichtbarkeit von Zusagen/Absagen erst nach `decision_release`.
- **Ticket**: valid → checked_in · cancelled / refunded / blocked; `personalization_status` pending → partial → complete.

## Fehlercodes für das Frontend
`42501` nicht erlaubt · `23P01` Überlappung auf Bühne · `23514` Pflichtfeld/Regel verletzt · `23505` bereits vorhanden (Doppelbewerbung) · `P0001` fachliche Ablehnung mit `message` = Schlüssel (`confirmation_required`, `deadline_passed`, `not_eligible` + detail, `not_released`, `ticket_required`, `collision` + detail = kollidierende IDs, `confirm_deadline_passed`, `cannot_withdraw`, `not_confirmable`) · `P0002` nicht gefunden.

## Startdaten (Seed)
Edition `fls27` mit `summit-27` (16./17.04.2027, CCH) und `hackathon-27` (15./16.04.2027), vier Tage, fünf Bühnen 2027 (Main, Leadership & Growth, Industry, Startup, Impact & Tech) mit Wechselzeit/Standarddauer aus der FLS26-Analyse, `stage_day` je Bühne × Tag (Öffnungszeiten offen), Fragenkatalog (motivation, expectations, linkedin, cv_upload), Mail-Templates `test`/`welcome` DE+EN.

## Tests
SQL-Smoke-Tests laufen als Transaktion mit Rollback über den Supabase-MCP (`execute_sql`); Vorlagen liegen in `supabase/tests/`. Vor jedem Merge einer Migration: Tests + Security-Advisor ohne ERROR.

## Ergänzung 08.09. abends — Programm-Editor-Backend (Migration `20260908182849_v2_programme_editor`)
- **Views:** `programme_board` (ein Tag, alle Bühnen: Slot × Session × Speaker, `can_edit` für den Aufrufer) und `programme_backlog` (Sessions ohne Slot). Speaker-Namen kommen über `session_speakers_public()` nur für sichtbare Sessions.
- **Rechte:** `is_programme_editor(event_id)` (Programm-Team/Admin, Edition oder global) · `can_edit_session(session_id)` (Editor, oder Slot im eigenen Scope, oder eigene Backlog-Session als Speaker-Manager/Standbühnen-Editor).
- **RPCs:** `upsert_session(jsonb)` (anlegen/ändern, Teilupdate über vorhandene Schlüssel) · `set_session_speakers(session_id, jsonb[])` (ersetzt komplett) · `attach_session_to_slot` / `detach_session` (Detach nur unveröffentlicht: `unpublish_first`) · `publish_session` (nur Programm-Team; Pflichtfelder + mindestens ein Speaker bei Inhaltsformaten; setzt Slot auf `final`) · `unpublish_session(id, reason)`. Alle mit Audit-Log; Attach/Detach zusätzlich in `slot_history`.
- **Fehlercodes ergänzt:** `slot_occupied` (23505), `unpublish_first` (P0001), `publish requires at least one speaker` (23514).
- Getestet: 13 Prüfungen (Scope über Bühne, Backlog-Rechte, Veröffentlichungsregeln, Detach-Sperre, Audit/History).
