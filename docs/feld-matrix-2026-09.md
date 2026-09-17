# Feld-Eigentümer-Matrix

> Generiert mit `node scripts/gen-feld-matrix.mjs` aus `docs/schema.md` und dem Code, Stand 2026-09-17. Handkorrekturen nur im Abschnitt „Befunde (Vorbereitung Walkthrough)“ am Ende der Datei — alles davor wird beim naechsten Lauf ueberschrieben.

Leitfrage je Spalte: **fachlich oder technisch?** · **wer schreibt es** (RPC/Trigger/Ingest/Cron) · **wo im Portal pflegbar**. Ziel: Jedes fachliche Feld hat genau einen Pflegeort im Portal (Supabase Studio ist kein Pflegeort — nur Konrad und die Architektur-Session).

## 1. Identität & Zugang

### `person`

**Zweck:** Eine natürliche Person = ein Datensatz. Login-Verknüpfung über auth_user_id.

**Datenschutz-Klasse (Vorschlag):** besonders geschützt (Art. 9)

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260908141744_v2_identity_roles.sql), Migration/Seed (20260910110003_v2_preferred_language_nullable.sql), apply_volunteer(), claim_or_create_person(), delete_my_profile(), invite_assistant(), partner_contact_upsert_internal(), person_tier_on_claim() [Trigger trg_person_tier], purge_diet_data(), set_diet(), set_person_salutation(), set_updated_at() [Trigger trg_person_updated], update_my_speaker_profile(), upsert_speaker()

**Trigger auf dieser Tabelle:** trg_person_updated → set_updated_at(), trg_person_tier → person_tier_on_claim()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** /onboarding, /profil, lib

**Seiten (lesen/schreiben):** /admin, /admin/personen, /admin/personen/[id], /admin/speaker, /onboarding, /profil, /speaker, /speaker-leads, /volunteers, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `auth_user_id` | uuid | technisch | claim_or_create_person(), delete_my_profile() | /onboarding, /profil | |
| `first_name` | text | fachlich | delete_my_profile(), invite_assistant(), partner_contact_upsert_internal(), update_my_speaker_profile(), upsert_speaker() | /admin/speaker, /speaker, /speaker-leads | |
| `last_name` | text | fachlich | delete_my_profile(), invite_assistant(), partner_contact_upsert_internal(), update_my_speaker_profile(), upsert_speaker() | /admin/speaker, /speaker, /speaker-leads | |
| `birthdate` | date | fachlich | apply_volunteer(), delete_my_profile() | /volunteers | |
| `occupation_status` | text | fachlich |  |  | |
| `work_experience` | text | fachlich |  |  | |
| `career_level` | text | fachlich |  |  | |
| `employer_type` | text | fachlich |  |  | |
| `employer_name` | text | fachlich | delete_my_profile() |  | |
| `study_field` | text | fachlich |  |  | |
| `study_program` | text | fachlich |  |  | |
| `university` | text | fachlich | delete_my_profile() |  | |
| `self_assessment` | text | fachlich |  |  | |
| `linkedin_url` | text | fachlich | delete_my_profile(), update_my_speaker_profile() | /speaker | |
| `linkedin_normalized` | text | fachlich | delete_my_profile() |  | |
| `phone` | text | fachlich | delete_my_profile() |  | |
| `phone_e164` | text | fachlich | delete_my_profile(), update_my_speaker_profile() | /speaker | |
| `cv_url` | text | fachlich | delete_my_profile() |  | |
| `gender` | text | fachlich |  |  | |
| `nationality` | text | fachlich | delete_my_profile() |  | |
| `country` | text | fachlich |  |  | |
| `preferred_language` | text | fachlich | Migration/Seed (20260910110003_v2_preferred_language_nullable.sql), update_my_speaker_profile(), upsert_speaker() | /speaker, /speaker-leads | |
| `startup_phase` | text | fachlich |  |  | |
| `invite_code` | text | fachlich | delete_my_profile() |  | |
| `is_ambassador` | boolean | fachlich |  |  | |
| `referred_by_person_id` | uuid | technisch |  |  | |
| `engagement_score` | numeric | fachlich |  |  | |
| `source_first` | text | fachlich | claim_or_create_person(), invite_assistant(), partner_contact_upsert_internal(), upsert_speaker() | /admin/speaker, /onboarding, /profil, /speaker, /speaker-leads | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_person_updated] |  | |
| `title` | text | fachlich | delete_my_profile(), update_my_speaker_profile(), upsert_speaker() | /speaker, /speaker-leads | |
| `city` | text | fachlich | delete_my_profile() |  | |
| `pronouns` | text | fachlich | delete_my_profile(), update_my_speaker_profile() | /speaker | |
| `photo_url` | text | fachlich | delete_my_profile() |  | |
| `tier` | text | fachlich | Migration/Seed (20260908141744_v2_identity_roles.sql), invite_assistant(), partner_contact_upsert_internal(), person_tier_on_claim() [Trigger trg_person_tier], upsert_speaker() | /admin/speaker, /speaker, /speaker-leads | |
| `deleted_at` | timestamp with time zone | technisch | delete_my_profile() |  | |
| `diet` | text | fachlich | purge_diet_data(), set_diet() |  | |
| `diet_note` | text | fachlich | purge_diet_data() |  | |
| `salutation_de` | text | fachlich | set_person_salutation() | /admin/personen/[id] | |
| `salutation_en` | text | fachlich | set_person_salutation() | /admin/personen/[id] | |

### `person_email`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** claim_or_create_person(), delete_my_profile(), invite_assistant(), partner_contact_upsert_internal(), set_primary_email(), set_updated_at() [Trigger trg_person_email_updated], upsert_speaker() · löscht Zeilen: delete_my_profile()

**Trigger auf dieser Tabelle:** trg_person_email_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/personen/[id], /admin/speaker, /onboarding, /profil, /speaker, /speaker-leads, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id` | uuid | technisch | claim_or_create_person(), invite_assistant(), partner_contact_upsert_internal(), upsert_speaker() | /admin/speaker, /onboarding, /profil, /speaker, /speaker-leads | |
| `email` | extensions.citext | fachlich | claim_or_create_person(), delete_my_profile(), invite_assistant(), partner_contact_upsert_internal(), upsert_speaker() | /admin/speaker, /onboarding, /profil, /speaker, /speaker-leads | |
| `type` | text | fachlich |  |  | |
| `is_primary` | boolean | fachlich | claim_or_create_person(), invite_assistant(), partner_contact_upsert_internal(), set_primary_email(), upsert_speaker() | /admin/speaker, /onboarding, /profil, /speaker, /speaker-leads | |
| `verified` | boolean | fachlich | claim_or_create_person(), delete_my_profile(), invite_assistant(), partner_contact_upsert_internal(), upsert_speaker() | /admin/speaker, /onboarding, /profil, /speaker, /speaker-leads | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_person_email_updated] |  | |

### `person_acquisition_channel`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** delete_my_profile() · löscht Zeilen: delete_my_profile()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** /profil

**Seiten (lesen/schreiben):** /admin/personen/[id], /profil

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `person_id` | uuid | technisch |  |  | |
| `vocabulary` | text | fachlich |  |  | |
| `term_key` | text | fachlich |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `person_eligibility`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** _keine insert/update/delete in supabase/migrations/*.sql gefunden_

**Seiten (lesen/schreiben):** _keine .from()/.rpc()-Fundstelle in app/lib/components_

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `person_id` | uuid | technisch |  |  | |
| `eligibility_u35` | boolean | fachlich |  |  | |

### `person_interest`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** delete_my_profile() · löscht Zeilen: delete_my_profile()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** /onboarding, /profil

**Seiten (lesen/schreiben):** /admin/personen/[id], /onboarding, /profil

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `person_id` | uuid | technisch |  |  | |
| `vocabulary` | text | fachlich |  |  | |
| `term_key` | text | fachlich |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `person_merge_log`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** _keine insert/update/delete in supabase/migrations/*.sql gefunden_

**Seiten (lesen/schreiben):** _keine .from()/.rpc()-Fundstelle in app/lib/components_

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `surviving_person_id` | uuid | technisch |  |  | |
| `merged_person_id` | uuid | technisch |  |  | |
| `merged_at` | timestamp with time zone | technisch |  |  | |
| `actor` | text | fachlich |  |  | |
| `payload` | jsonb | fachlich |  |  | |

### `potential_duplicate`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_updated_at() [Trigger trg_potential_duplicate_updated]

**Trigger auf dieser Tabelle:** trg_potential_duplicate_updated → set_updated_at()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** /admin/dubletten

**Seiten (lesen/schreiben):** /admin, /admin/dubletten

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id_a` | uuid | fachlich |  |  | |
| `person_id_b` | uuid | fachlich |  |  | |
| `score` | numeric | fachlich |  |  | |
| `signals` | jsonb | fachlich |  |  | |
| `status` | text | fachlich |  |  | |
| `reviewed_by` | uuid | technisch |  |  | |
| `reviewed_at` | timestamp with time zone | technisch |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_potential_duplicate_updated] |  | |

### `consent_record`

**Zweck:** Jede Einwilligung/Widerruf als eigene Zeile (Nachweis). Aktueller Stand: View consent_current.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** _keine insert/update/delete in supabase/migrations/*.sql gefunden_

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** /onboarding, /speaker, /volunteers

**Seiten (lesen/schreiben):** /onboarding, /speaker, /volunteers

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id` | uuid | technisch |  |  | |
| `consent_type` | text | fachlich |  |  | |
| `version` | text | fachlich |  |  | |
| `granted` | boolean | fachlich |  |  | |
| `granted_at` | timestamp with time zone | technisch |  |  | |
| `revoked_at` | timestamp with time zone | technisch |  |  | |
| `source` | text | fachlich |  |  | |
| `ip_hash` | text | fachlich |  |  | |
| `user_agent` | text | fachlich |  |  | |
| `meta` | jsonb | fachlich |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `suppression`

**Zweck:** sha256(lower(email)) gelöschter/gesperrter Adressen. Vor jedem Import und Mailversand prüfen.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** delete_my_profile()

**Seiten (lesen/schreiben):** _keine .from()/.rpc()-Fundstelle in app/lib/components_

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `email_hash` | text | fachlich | delete_my_profile() |  | |
| `reason` | text | fachlich | delete_my_profile() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `registration`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** cancel_registration(), register_for_session(), set_updated_at() [Trigger trg_registration_updated]

**Trigger auf dieser Tabelle:** trg_registration_updated → set_updated_at(), trg_registration_mail → registration_mail_trigger()

**Seiten (lesen/schreiben):** /admin, /admin/personen/[id], /meine, /programm

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id` | uuid | technisch | register_for_session() | /meine, /programm | |
| `event_id` | uuid | technisch | register_for_session() | /meine, /programm | |
| `status` | text | fachlich | cancel_registration(), register_for_session() | /meine, /programm | |
| `ticket_type` | text | fachlich |  |  | |
| `source` | text | fachlich | register_for_session() | /meine, /programm | |
| `external_source` | text | fachlich |  |  | |
| `external_ref` | text | technisch |  |  | |
| `external_ids` | jsonb | fachlich |  |  | |
| `registered_at` | timestamp with time zone | technisch | register_for_session() | /meine, /programm | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_registration_updated] |  | |
| `session_id` | uuid | technisch | register_for_session() | /meine, /programm | |

### `role_assignment`

**Zweck:** Rolle × Scope je Person. Rollen außer admin sind edition-gebunden (edition_id). Schreiben nur service_role.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** assign_role(), delete_my_profile(), ingest_partner_deal(), invite_assistant(), invite_speaker(), partner_contact_upsert_internal(), remove_assistant(), remove_partner_contact(), revoke_role(), set_updated_at() [Trigger trg_role_assignment_updated], set_volunteer_status(), sync_granted_roles(), upsert_speaker() · löscht Zeilen: delete_my_profile(), remove_partner_contact(), set_volunteer_status(), sync_granted_roles()

**Trigger auf dieser Tabelle:** trg_role_assignment_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/partner, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/team, /admin/volunteers, /partner, /speaker, /speaker-leads, Cron: /api/cron/hubspot-sweep, Webhook: /api/webhooks/hubspot

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id` | uuid | technisch | assign_role(), ingest_partner_deal(), invite_assistant(), invite_speaker(), partner_contact_upsert_internal(), set_volunteer_status(), sync_granted_roles(), upsert_speaker() | /admin/partner, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/team, /admin/volunteers, /speaker, /speaker-leads | |
| `role` | text | fachlich | assign_role(), ingest_partner_deal(), invite_assistant(), invite_speaker(), partner_contact_upsert_internal(), set_volunteer_status(), sync_granted_roles(), upsert_speaker() | /admin/partner, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/team, /admin/volunteers, /speaker, /speaker-leads | |
| `scope_type` | text | fachlich | assign_role(), ingest_partner_deal(), invite_assistant(), invite_speaker(), partner_contact_upsert_internal(), set_volunteer_status(), sync_granted_roles(), upsert_speaker() | /admin/partner, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/team, /admin/volunteers, /speaker, /speaker-leads | |
| `scope_id` | uuid | technisch | assign_role(), ingest_partner_deal(), partner_contact_upsert_internal(), sync_granted_roles() | /admin/partner, /admin/rollen, /admin/speaker-leads, /admin/team | |
| `edition_id` | uuid | technisch | assign_role(), ingest_partner_deal(), invite_assistant(), invite_speaker(), partner_contact_upsert_internal(), set_volunteer_status(), sync_granted_roles(), upsert_speaker() | /admin/partner, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/team, /admin/volunteers, /speaker, /speaker-leads | |
| `portal` | text | fachlich | assign_role() | /admin/partner, /admin/rollen, /admin/speaker-leads, /admin/team | |
| `valid_from` | timestamp with time zone | fachlich | assign_role(), set_volunteer_status() | /admin/partner, /admin/rollen, /admin/speaker-leads, /admin/team, /admin/volunteers | |
| `valid_to` | timestamp with time zone | fachlich | assign_role(), ingest_partner_deal(), invite_assistant(), partner_contact_upsert_internal(), remove_assistant(), revoke_role(), set_volunteer_status(), sync_granted_roles() | /admin/partner, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/team, /admin/volunteers, /speaker | |
| `granted_by` | uuid | technisch | assign_role(), invite_assistant(), invite_speaker(), partner_contact_upsert_internal(), set_volunteer_status(), upsert_speaker() | /admin/partner, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/team, /admin/volunteers, /speaker, /speaker-leads | |
| `note` | text | fachlich | assign_role(), ingest_partner_deal(), invite_assistant(), invite_speaker(), partner_contact_upsert_internal(), revoke_role(), set_volunteer_status(), sync_granted_roles(), upsert_speaker() | /admin/partner, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/team, /admin/volunteers, /speaker, /speaker-leads | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_role_assignment_updated] |  | |

### `staff_user`

**Zweck:** Historisch: bis 0107 die Liste des Teams. Entscheidet seit 0107 nichts mehr — Zugang gibt die Rolle admin (is_staff()).

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** _keine insert/update/delete in supabase/migrations/*.sql gefunden_

**Seiten (lesen/schreiben):** _keine .from()/.rpc()-Fundstelle in app/lib/components_

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `auth_user_id` | uuid | technisch |  |  | |
| `email` | extensions.citext | fachlich |  |  | |
| `display_name` | text | fachlich |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `audit_log`

**Zweck:** Admin-/Manager-Aktionen, Partner-Zugriffe auf Bewerberdaten, Exporte. Nur service_role liest.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** log_audit(), run_application_housekeeping(), run_shop_finalization(), send_partner_reminders(), send_presentation_reminders(), set_expense_integration()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** /admin/dubletten, /admin/mail, /admin/vokabular

**Seiten (lesen/schreiben):** /admin, /admin/dubletten, /admin/mail, /admin/vokabular, Cron: /api/cron/mail

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | bigint | technisch |  |  | |
| `actor_person_id` | uuid | technisch | log_audit(), set_expense_integration() | /admin | |
| `actor_auth_uid` | uuid | fachlich | log_audit(), set_expense_integration() | /admin | |
| `action` | text | fachlich | log_audit(), run_application_housekeeping(), run_shop_finalization(), send_partner_reminders(), send_presentation_reminders(), set_expense_integration() | /admin | |
| `object_type` | text | fachlich | log_audit(), run_application_housekeeping(), run_shop_finalization(), send_partner_reminders(), send_presentation_reminders(), set_expense_integration() | /admin | |
| `object_id` | text | technisch | log_audit(), run_application_housekeeping(), run_shop_finalization(), send_partner_reminders(), send_presentation_reminders(), set_expense_integration() | /admin | |
| `before` | jsonb | fachlich | log_audit() |  | |
| `after` | jsonb | fachlich | log_audit(), run_application_housekeeping(), run_shop_finalization(), send_partner_reminders(), send_presentation_reminders(), set_expense_integration() | /admin | |
| `ip_hash` | text | fachlich |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

## 2. Edition & Programm

### `event`

**Zweck:** Format/Termin (Summit, Hackathon, Side-Event, Community). is_edition = Klammer wie FLS27-Woche; Kinder verweisen über edition_id.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), set_edition_hubspot(), set_edition_swapcard(), set_edition_vivenu(), set_edition_volunteer_undershop(), set_updated_at() [Trigger trg_event_updated]

**Trigger auf dieser Tabelle:** trg_event_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin, /admin/bewerbungen, /admin/bewerbungen/[id], /admin/catering, /admin/fristen, /admin/hospitality, /admin/partner, /admin/programm, /admin/programm/tabelle, /admin/rollen, /admin/speaker-leads, /admin/team, /admin/videos, /admin/volunteers/schichten, /admin/wiki, /hackathon/schedule, /meine, /partner/buehne, /produktion, /programm, /speaker-leads/board, /speaker-leads/board/tabelle, /volunteers, API-Route: /api/admin/sevdesk/shop-invoices, API-Route: /api/wiki/frage, Cron: /api/cron/volunteer-tickets

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `name` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `format_tag` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `start_date` | date | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `end_date` | date | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `parent_event_id` | uuid | technisch |  |  | |
| `location` | text | fachlich |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_event_updated] |  | |
| `slug` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `is_edition` | boolean | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `edition_id` | uuid | technisch | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `timezone` | text | fachlich |  |  | |
| `venue` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `status` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `hubspot_pipeline_id` | text | technisch | set_edition_hubspot() | /admin/partner | |
| `hubspot_onboarding_stage_id` | text | technisch | set_edition_hubspot() | /admin/partner | |
| `vivenu_event_id` | text | technisch | set_edition_vivenu() | /admin/partner | |
| `swapcard_event_id` | text | technisch | set_edition_swapcard() | /admin/partner | |
| `hubspot_done_stage_id` | text | technisch | set_edition_hubspot() | /admin/partner | |
| `vivenu_volunteer_undershop_id` | text | technisch | set_edition_volunteer_undershop() |  | |

### `event_day`

**Zweck:** Veranstaltungstag eines Events (Einlass, Programmbeginn/-ende).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908194632_v2_board_realtime_questions.sql), set_updated_at() [Trigger trg_event_day_updated]

**Trigger auf dieser Tabelle:** trg_event_day_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/programm, /admin/programm/tabelle, /partner/buehne, /produktion, /regie/druck, /speaker, /speaker-leads/board, /speaker-leads/board/tabelle, /speaker-leads/regie, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `event_id` | uuid | technisch | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `day_date` | date | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `label_de` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `label_en` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `doors_open` | time without time zone | fachlich | Migration/Seed (20260908194632_v2_board_realtime_questions.sql) |  | |
| `programme_start` | time without time zone | fachlich | Migration/Seed (20260908194632_v2_board_realtime_questions.sql) |  | |
| `programme_end` | time without time zone | fachlich | Migration/Seed (20260908194632_v2_board_realtime_questions.sql) |  | |
| `sort_order` | integer | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_event_day_updated] |  | |

### `stage`

**Zweck:** Bühne oder Raum eines Events. Parameter (Wechselzeit, Standarddauer, Kontingent) steuern das Programm-Board.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), set_updated_at() [Trigger trg_stage_updated]

**Trigger auf dieser Tabelle:** trg_stage_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/programm, /admin/programm/tabelle, /admin/rollen, /partner/buehne, /produktion, /regie/druck, /speaker-leads/board, /speaker-leads/board/tabelle, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `event_id` | uuid | technisch | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `name` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `slug` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `type` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `room` | text | fachlich |  |  | |
| `capacity` | integer | fachlich |  |  | |
| `partner_org_id` | uuid | technisch |  |  | |
| `stage_lead_person_id` | uuid | technisch |  |  | |
| `changeover_min` | integer | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `default_duration_min` | integer | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `partner_slot_quota` | integer | fachlich |  |  | |
| `sort_order` | integer | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `active` | boolean | fachlich |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_stage_updated] |  | |

### `stage_day`

**Zweck:** Bühne × Tag: Öffnungszeiten und Slot-Kontingent (allgemeine Slot-Logik, Antwort 74).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908194632_v2_board_realtime_questions.sql), set_updated_at() [Trigger trg_stage_day_updated]

**Trigger auf dieser Tabelle:** trg_stage_day_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/rollen

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `stage_id` | uuid | technisch | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `event_day_id` | uuid | technisch | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `open_from` | time without time zone | fachlich | Migration/Seed (20260908194632_v2_board_realtime_questions.sql) |  | |
| `open_to` | time without time zone | fachlich | Migration/Seed (20260908194632_v2_board_realtime_questions.sql) |  | |
| `slot_quota` | integer | fachlich |  |  | |
| `notes` | text | fachlich |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_stage_day_updated] |  | |

### `track`

**Zweck:** Thematischer Track (Swapcard-Track).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** _keine insert/update/delete in supabase/migrations/*.sql gefunden_

**Seiten (lesen/schreiben):** _keine .from()/.rpc()-Fundstelle in app/lib/components_

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `event_id` | uuid | technisch |  |  | |
| `name_de` | text | fachlich |  |  | |
| `name_en` | text | fachlich |  |  | |
| `slug` | text | fachlich |  |  | |
| `sort_order` | integer | fachlich |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `slot`

**Zweck:** Zeitfenster auf einer Bühne. Genau eine Session kann darauf liegen. Farbe im Board = status.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** create_slot(), move_slot(), publish_session(), set_slot_status(), set_updated_at() [Trigger trg_slot_updated]

**Trigger auf dieser Tabelle:** trg_slot_updated → set_updated_at(), trg_slot_consistency → slot_consistency_check(), trg_slot_board_notify → programme_board_notify()

**Seiten (lesen/schreiben):** /admin/rollen, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `stage_id` | uuid | technisch | create_slot(), move_slot() |  | |
| `event_day_id` | uuid | technisch | create_slot(), move_slot() |  | |
| `start_at` | timestamp with time zone | technisch | create_slot(), move_slot() |  | |
| `end_at` | timestamp with time zone | technisch | create_slot(), move_slot() |  | |
| `slot_type` | text | fachlich | create_slot() |  | |
| `status` | text | fachlich | publish_session(), set_slot_status() |  | |
| `sort_order` | integer | fachlich |  |  | |
| `source_ref` | text | fachlich | create_slot() |  | |
| `responsible_person_id` | uuid | technisch |  |  | |
| `internal_title` | text | fachlich |  |  | |
| `internal_notes` | text | fachlich |  |  | |
| `created_by` | uuid | technisch | create_slot() |  | |
| `updated_by` | uuid | technisch | create_slot(), move_slot(), publish_session(), set_slot_status() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_slot_updated] |  | |

### `slot_history`

**Zweck:** Änderungslog des Programm-Boards (Verschiebungen nach Veröffentlichung sichtbar).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** attach_session_to_slot(), create_slot(), detach_session(), move_slot(), set_slot_status()

**Seiten (lesen/schreiben):** lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | bigint | technisch |  |  | |
| `slot_id` | uuid | technisch | attach_session_to_slot(), create_slot(), detach_session(), move_slot(), set_slot_status() |  | |
| `changed_by` | uuid | technisch | attach_session_to_slot(), create_slot(), detach_session(), move_slot(), set_slot_status() |  | |
| `changed_at` | timestamp with time zone | technisch |  |  | |
| `action` | text | fachlich | attach_session_to_slot(), create_slot(), detach_session(), move_slot(), set_slot_status() |  | |
| `before` | jsonb | fachlich | detach_session(), move_slot(), set_slot_status() |  | |
| `after` | jsonb | fachlich | attach_session_to_slot(), create_slot(), move_slot(), set_slot_status() |  | |
| `reason` | text | fachlich | move_slot() |  | |

### `session`

**Zweck:** Programmpunkt (öffentliche Felder für App/Website/Swapcard). Interne Regie-Werte liegen in regie_cue (Welle 4).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** approve_session_content(), attach_session_to_slot(), create_slot(), detach_session(), publish_session(), session_publish_check() [Trigger trg_session_publish], set_updated_at() [Trigger trg_session_updated], unpublish_session(), upsert_session()

**Trigger auf dieser Tabelle:** trg_session_updated → set_updated_at(), trg_session_publish → session_publish_check(), trg_session_board_notify → programme_board_notify()

**Seiten (lesen/schreiben):** /speaker-leads, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `event_id` | uuid | technisch | upsert_session() |  | |
| `slot_id` | uuid | technisch | attach_session_to_slot(), create_slot(), detach_session() |  | |
| `format` | text | fachlich | upsert_session() |  | |
| `title_de` | text | fachlich | approve_session_content(), session_publish_check() [Trigger trg_session_publish], upsert_session() | /speaker-leads | |
| `title_en` | text | fachlich | approve_session_content(), session_publish_check() [Trigger trg_session_publish], upsert_session() | /speaker-leads | |
| `description_de` | text | fachlich | approve_session_content(), session_publish_check() [Trigger trg_session_publish], upsert_session() | /speaker-leads | |
| `description_en` | text | fachlich | approve_session_content(), session_publish_check() [Trigger trg_session_publish], upsert_session() | /speaker-leads | |
| `language` | text | fachlich | approve_session_content(), upsert_session() | /speaker-leads | |
| `access_mode` | text | fachlich | upsert_session() |  | |
| `eligibility_rule` | jsonb | fachlich | upsert_session() |  | |
| `capacity` | integer | fachlich | upsert_session() |  | |
| `ticket_required` | boolean | fachlich | upsert_session() |  | |
| `application_deadline` | timestamp with time zone | fachlich | upsert_session() |  | |
| `confirm_by_hours` | integer | fachlich | upsert_session() |  | |
| `host_org_id` | uuid | technisch | upsert_session() |  | |
| `track_id` | uuid | technisch | upsert_session() |  | |
| `moderation_person_id` | uuid | technisch | upsert_session() |  | |
| `publish_status` | text | fachlich | publish_session(), session_publish_check() [Trigger trg_session_publish], unpublish_session() |  | |
| `tags` | text[] | fachlich | upsert_session() |  | |
| `swapcard_id` | text | technisch |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_session_updated] |  | |
| `created_by` | uuid | technisch | upsert_session() |  | |
| `updated_by` | uuid | technisch | approve_session_content(), attach_session_to_slot(), detach_session(), publish_session(), unpublish_session(), upsert_session() | /speaker-leads | |

### `session_speaker`

**Zweck:** Speaker/Moderation/Host je Session.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** set_session_speakers() · löscht Zeilen: set_session_speakers()

**Trigger auf dieser Tabelle:** trg_session_speaker_board_notify → programme_board_notify_speaker()

**Seiten (lesen/schreiben):** lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `session_id` | uuid | technisch | set_session_speakers() |  | |
| `person_id` | uuid | technisch | set_session_speakers() |  | |
| `role` | text | fachlich | set_session_speakers() |  | |
| `sort_order` | integer | fachlich | set_session_speakers() |  | |
| `confirmed` | boolean | fachlich | set_session_speakers() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `session_question`

**Zweck:** Fragen einer Session: aus dem Katalog oder eigene (max. 2, Freigabe durch Programm-Team).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** approve_session_questions(), set_session_questions() · löscht Zeilen: set_session_questions()

**Trigger auf dieser Tabelle:** trg_session_question_limit → session_question_limit()

**Seiten (lesen/schreiben):** /admin/bewerbungen/[id], /programm, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `session_id` | uuid | technisch | set_session_questions() |  | |
| `question_id` | uuid | technisch | set_session_questions() |  | |
| `label_de` | text | fachlich | set_session_questions() |  | |
| `label_en` | text | fachlich | set_session_questions() |  | |
| `type` | text | fachlich | set_session_questions() |  | |
| `options` | jsonb | fachlich | set_session_questions() |  | |
| `required` | boolean | fachlich | set_session_questions() |  | |
| `sort_order` | integer | fachlich | set_session_questions() |  | |
| `approved_by` | uuid | technisch | approve_session_questions(), set_session_questions() |  | |
| `approved_at` | timestamp with time zone | technisch | approve_session_questions(), set_session_questions() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `session_submission`

**Zweck:** Vom Speaker eingereichte Session-Inhalte; final steht in session (Freigabe kopiert).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** approve_session_content(), reject_session_content(), set_updated_at() [Trigger trg_session_submission_updated], submit_session_content()

**Trigger auf dieser Tabelle:** trg_session_submission_updated → set_updated_at()

**Seiten (lesen/schreiben):** /speaker-leads, /speaker/session

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `session_id` | uuid | technisch | submit_session_content() | /speaker/session | |
| `speaker_profile_id` | uuid | technisch | submit_session_content() | /speaker/session | |
| `submitted_by` | uuid | technisch | submit_session_content() | /speaker/session | |
| `title` | text | fachlich | submit_session_content() | /speaker/session | |
| `description` | text | fachlich | submit_session_content() | /speaker/session | |
| `topics` | text[] | fachlich | submit_session_content() | /speaker/session | |
| `language` | text | fachlich | submit_session_content() | /speaker/session | |
| `notes` | text | fachlich | submit_session_content() | /speaker/session | |
| `status` | text | fachlich | approve_session_content(), reject_session_content(), submit_session_content() | /speaker-leads, /speaker/session | |
| `reviewed_by` | uuid | technisch | approve_session_content(), reject_session_content() | /speaker-leads | |
| `reviewed_at` | timestamp with time zone | technisch | approve_session_content(), reject_session_content() | /speaker-leads | |
| `review_note` | text | fachlich | approve_session_content(), reject_session_content() | /speaker-leads | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_session_submission_updated] |  | |

### `question_catalog`

**Zweck:** Zentraler Fragenkatalog für Bewerbungen (Antwort C: Katalog + max. 2 eigene Fragen je Session).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), set_updated_at() [Trigger trg_question_catalog_updated]

**Trigger auf dieser Tabelle:** trg_question_catalog_updated → set_updated_at()

**Seiten (lesen/schreiben):** lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `key` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `label_de` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `label_en` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `help_de` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `help_en` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `type` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `options` | jsonb | fachlich |  |  | |
| `active` | boolean | fachlich |  |  | |
| `sort_order` | integer | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_question_catalog_updated] |  | |

### `programme_backlog`

**Zweck:** Sessions ohne Slot (Backlog-Leiste des Boards).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** _keine insert/update/delete in supabase/migrations/*.sql gefunden_

**Seiten (lesen/schreiben):** /admin/programm, /partner/buehne, /speaker-leads/board

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `session_id` | uuid | technisch |  |  | |
| `event_id` | uuid | technisch |  |  | |
| `title_de` | text | fachlich |  |  | |
| `title_en` | text | fachlich |  |  | |
| `format` | text | fachlich |  |  | |
| `language` | text | fachlich |  |  | |
| `access_mode` | text | fachlich |  |  | |
| `publish_status` | text | fachlich |  |  | |
| `host_org_id` | uuid | technisch |  |  | |
| `created_by` | uuid | technisch |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `speakers` | jsonb | fachlich |  |  | |
| `can_edit` | boolean | fachlich |  |  | |

### `application`

**Zweck:** Bewerbung Person × Session. Pipeline: applied → shortlisted → accepted → confirmed → attended/no_show \| waitlisted → promoted \| declined/expired/withdrawn.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** application_mail_trigger() [Trigger trg_application_mail], apply_to_session(), confirm_application(), decide_application(), expire_overdue_applications(), promote_waitlist(), release_decisions(), set_updated_at() [Trigger trg_application_updated], withdraw_application()

**Trigger auf dieser Tabelle:** trg_application_updated → set_updated_at(), trg_application_mail → application_mail_trigger()

**Seiten (lesen/schreiben):** /admin/bewerbungen, /meine, /partner, /programm

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `session_id` | uuid | technisch | apply_to_session() | /meine, /programm | |
| `person_id` | uuid | technisch | apply_to_session() | /meine, /programm | |
| `status` | text | fachlich | application_mail_trigger() [Trigger trg_application_mail], confirm_application(), decide_application(), expire_overdue_applications(), promote_waitlist(), withdraw_application() | /admin/bewerbungen, /meine, /partner, /programm | |
| `rank` | integer | fachlich | decide_application() | /admin/bewerbungen, /partner | |
| `answers` | jsonb | fachlich | apply_to_session() | /meine, /programm | |
| `consent_share` | boolean | fachlich | apply_to_session() | /meine, /programm | |
| `decided_by` | uuid | technisch | decide_application() | /admin/bewerbungen, /partner | |
| `decided_at` | timestamp with time zone | technisch | decide_application() | /admin/bewerbungen, /partner | |
| `confirm_by` | timestamp with time zone | technisch | decide_application(), promote_waitlist(), release_decisions() | /admin/bewerbungen, /partner | |
| `confirmed_at` | timestamp with time zone | technisch | confirm_application() | /meine, /programm | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_application_updated] |  | |

### `decision_release`

**Zweck:** Erst nach Freigabe werden Zusagen/Absagen sichtbar und Mails ausgelöst (Antwort C).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** release_decisions()

**Trigger auf dieser Tabelle:** trg_decision_release_mail → decision_release_mail_trigger()

**Seiten (lesen/schreiben):** /admin/bewerbungen

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `session_id` | uuid | technisch | release_decisions() | /admin/bewerbungen | |
| `released_by` | uuid | technisch | release_decisions() | /admin/bewerbungen | |
| `released_at` | timestamp with time zone | technisch |  |  | |
| `note` | text | fachlich | release_decisions() | /admin/bewerbungen | |

### `regie_cue`

**Zweck:** Ablaufplan je Bühne und Tag (Vorlage regie-2026). `slot_id` optional — Doors open und Puffer haben keine Session.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** delete_regie_cue(), upsert_regie_cue() · löscht Zeilen: delete_regie_cue()

**Seiten (lesen/schreiben):** lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `stage_id` | uuid | technisch | upsert_regie_cue() |  | |
| `event_day_id` | uuid | technisch | upsert_regie_cue() |  | |
| `slot_id` | uuid | technisch | upsert_regie_cue() |  | |
| `cue_start` | timestamp with time zone | fachlich | upsert_regie_cue() |  | |
| `cue_end` | timestamp with time zone | fachlich | upsert_regie_cue() |  | |
| `sort_order` | integer | fachlich | upsert_regie_cue() |  | |
| `action` | text | fachlich | upsert_regie_cue() |  | |
| `umbau_min` | integer | fachlich | upsert_regie_cue() |  | |
| `moderation` | text | fachlich | upsert_regie_cue() |  | |
| `regie` | text | fachlich | upsert_regie_cue() |  | |
| `backstage` | text | fachlich | upsert_regie_cue() |  | |
| `mobiliar` | text | fachlich | upsert_regie_cue() |  | |
| `notes` | text | fachlich | upsert_regie_cue() |  | |
| `mic_assignments` | jsonb | fachlich | upsert_regie_cue() |  | |
| `media` | jsonb | fachlich | upsert_regie_cue() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | upsert_regie_cue() |  | |
| `created_by` | uuid | technisch | upsert_regie_cue() |  | |
| `updated_by` | uuid | technisch | upsert_regie_cue() |  | |

## 3. Speaker

### `speaker_profile`

**Zweck:** Speaker je Edition: Pipeline, Staff-Flags (Reception, Lounge, Pass, Hospitality, Reisekosten), Tech-Rider, Assistenz. Schreiben nur per RPC.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** approve_travel_costs(), book_hospitality(), cancel_hospitality(), confirm_hospitality(), handover_speaker(), invite_assistant(), invite_speaker(), register_speaker_asset(), remove_assistant(), set_speaker_contacts(), set_speaker_pipeline(), set_updated_at() [Trigger trg_speaker_profile_updated], speaker_profile_check() [Trigger trg_speaker_profile_check], update_my_speaker_profile(), update_speaker(), upsert_speaker()

**Trigger auf dieser Tabelle:** trg_speaker_profile_updated → set_updated_at(), trg_speaker_profile_check → speaker_profile_check(), trg_speaker_profile_tickets → speaker_profile_tickets_sync()

**Seiten (lesen/schreiben):** /admin, /admin/speaker, /admin/speaker-leads, /speaker, /speaker-leads, /speaker/reisekosten, /speaker/session, /speaker/travel

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id` | uuid | technisch | upsert_speaker() | /speaker-leads | |
| `edition_id` | uuid | technisch | upsert_speaker() | /speaker-leads | |
| `speaker_type` | text | fachlich | update_speaker(), upsert_speaker() | /admin/speaker, /speaker-leads | |
| `pipeline_status` | text | fachlich | set_speaker_pipeline(), update_speaker(), upsert_speaker() | /admin/speaker, /speaker-leads | |
| `owner_person_id` | uuid | technisch | handover_speaker(), update_speaker(), upsert_speaker() | /admin/speaker, /admin/speaker-leads, /speaker-leads | |
| `job_title` | text | fachlich | update_my_speaker_profile(), update_speaker(), upsert_speaker() | /admin/speaker, /speaker, /speaker-leads | |
| `organization_name` | text | fachlich | update_my_speaker_profile(), update_speaker(), upsert_speaker() | /admin/speaker, /speaker, /speaker-leads | |
| `org_id` | uuid | technisch | update_speaker(), upsert_speaker() | /admin/speaker, /speaker-leads | |
| `bio_short_en` | text | fachlich | update_my_speaker_profile(), update_speaker() | /admin/speaker, /speaker, /speaker-leads | |
| `bio_short_de` | text | fachlich | update_my_speaker_profile(), update_speaker() | /admin/speaker, /speaker, /speaker-leads | |
| `bio_long_en` | text | fachlich | update_my_speaker_profile(), update_speaker() | /admin/speaker, /speaker, /speaker-leads | |
| `bio_long_de` | text | fachlich | update_my_speaker_profile(), update_speaker() | /admin/speaker, /speaker, /speaker-leads | |
| `socials` | jsonb | fachlich | update_my_speaker_profile(), update_speaker() | /admin/speaker, /speaker, /speaker-leads | |
| `photo_asset_id` | uuid | technisch | register_speaker_asset() | /speaker/reisekosten, /speaker/session | |
| `reception_eligible` | boolean | fachlich | update_speaker(), upsert_speaker() | /admin/speaker, /speaker-leads | |
| `lounge_access` | boolean | fachlich | update_speaker(), upsert_speaker() | /admin/speaker, /speaker-leads | |
| `pass_type` | text | fachlich | update_speaker(), upsert_speaker() | /admin/speaker, /speaker-leads | |
| `hotel_tier` | text | fachlich | update_speaker(), upsert_speaker() | /admin/speaker, /speaker-leads | |
| `hospitality_status` | text | fachlich | book_hospitality(), cancel_hospitality(), confirm_hospitality(), update_speaker(), upsert_speaker() | /admin, /admin/speaker, /speaker-leads, /speaker/travel | |
| `travel_costs_covered` | boolean | fachlich | approve_travel_costs(), update_speaker(), upsert_speaker() | /admin/speaker, /speaker-leads | |
| `travel_costs_approved_by` | uuid | technisch | approve_travel_costs() | /admin/speaker, /speaker-leads | |
| `travel_costs_approved_at` | timestamp with time zone | technisch | approve_travel_costs() | /admin/speaker, /speaker-leads | |
| `tech_rider` | jsonb | fachlich | update_my_speaker_profile(), update_speaker() | /admin/speaker, /speaker, /speaker-leads | |
| `assistant_person_id` | uuid | technisch | invite_assistant(), remove_assistant(), speaker_profile_check() [Trigger trg_speaker_profile_check] | /admin/speaker, /speaker | |
| `internal_notes` | text | fachlich | update_speaker(), upsert_speaker() | /admin/speaker, /speaker-leads | |
| `invited_at` | timestamp with time zone | technisch | invite_speaker() | /admin/speaker, /speaker-leads | |
| `created_by` | uuid | technisch | upsert_speaker() | /speaker-leads | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_speaker_contacts(), set_updated_at() [Trigger trg_speaker_profile_updated] | /admin/speaker | |
| `lead_contact_id` | uuid | technisch | set_speaker_contacts() | /admin/speaker | |
| `buddy_contact_id` | uuid | technisch | set_speaker_contacts() | /admin/speaker | |
| `confirmed_at` | timestamp with time zone | technisch | set_speaker_pipeline() | /admin/speaker, /speaker-leads | |
| `declined_at` | timestamp with time zone | technisch | set_speaker_pipeline() | /admin/speaker, /speaker-leads | |
| `decline_reason` | text | fachlich | set_speaker_pipeline() | /admin/speaker, /speaker-leads | |

### `speaker_asset`

**Zweck:** Dateien im Bucket speaker-assets: Präsentationen (Versionen, late, Technik-Check, Slid@Home), Fotos, Sonstiges.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** register_speaker_asset(), set_slides_release(), set_tech_check(), set_updated_at() [Trigger trg_speaker_asset_updated]

**Trigger auf dieser Tabelle:** trg_speaker_asset_updated → set_updated_at()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** /admin

**Seiten (lesen/schreiben):** /admin, /speaker/reisekosten, /speaker/session

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `profile_id` | uuid | technisch | register_speaker_asset() | /speaker/reisekosten, /speaker/session | |
| `session_id` | uuid | technisch | register_speaker_asset() | /speaker/reisekosten, /speaker/session | |
| `kind` | text | fachlich | register_speaker_asset() | /speaker/reisekosten, /speaker/session | |
| `storage_path` | text | fachlich | register_speaker_asset() | /speaker/reisekosten, /speaker/session | |
| `filename` | text | fachlich | register_speaker_asset() | /speaker/reisekosten, /speaker/session | |
| `mime` | text | fachlich | register_speaker_asset() | /speaker/reisekosten, /speaker/session | |
| `size_bytes` | bigint | fachlich | register_speaker_asset() | /speaker/reisekosten, /speaker/session | |
| `version` | integer | fachlich | register_speaker_asset() | /speaker/reisekosten, /speaker/session | |
| `is_current` | boolean | fachlich | register_speaker_asset() | /speaker/reisekosten, /speaker/session | |
| `late` | boolean | fachlich | register_speaker_asset() | /speaker/reisekosten, /speaker/session | |
| `tech_check_status` | text | fachlich | set_tech_check() | /admin | |
| `tech_check_note` | text | fachlich | set_tech_check() | /admin | |
| `tech_checked_by` | uuid | technisch | set_tech_check() | /admin | |
| `tech_checked_at` | timestamp with time zone | technisch | set_tech_check() | /admin | |
| `slides_release` | boolean | fachlich | set_slides_release() | /speaker/session | |
| `uploaded_by` | uuid | technisch | register_speaker_asset() | /speaker/reisekosten, /speaker/session | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_speaker_asset_updated] |  | |

### `speaker_travel`

**Zweck:** An- und Abreise je Speaker-Profil (Abgleich 15.09.). Datum und Uhrzeit getrennt: die Eingabe meint Ortszeit in Hamburg, kein `timestamptz`.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_my_speaker_travel(), set_updated_at() [Trigger trg_speaker_travel_updated]

**Trigger auf dieser Tabelle:** trg_speaker_travel_updated → set_updated_at()

**Seiten (lesen/schreiben):** /speaker/travel

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `profile_id` | uuid | technisch | set_my_speaker_travel() | /speaker/travel | |
| `arrival_date` | date | fachlich | set_my_speaker_travel() | /speaker/travel | |
| `arrival_time` | time without time zone | fachlich | set_my_speaker_travel() | /speaker/travel | |
| `arrival_mode` | text | fachlich | set_my_speaker_travel() | /speaker/travel | |
| `arrival_ref` | text | fachlich | set_my_speaker_travel() | /speaker/travel | |
| `departure_date` | date | fachlich | set_my_speaker_travel() | /speaker/travel | |
| `departure_time` | time without time zone | fachlich | set_my_speaker_travel() | /speaker/travel | |
| `departure_mode` | text | fachlich | set_my_speaker_travel() | /speaker/travel | |
| `departure_ref` | text | fachlich | set_my_speaker_travel() | /speaker/travel | |
| `needs_pickup` | boolean | fachlich | set_my_speaker_travel() | /speaker/travel | |
| `note` | text | fachlich | set_my_speaker_travel() | /speaker/travel | |
| `updated_by` | uuid | technisch | set_my_speaker_travel() | /speaker/travel | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_speaker_travel_updated] |  | |

### `hospitality_quota`

**Zweck:** Hospitality-Kontingente je Edition: Hotels nach Tier, Shuttles. Kapazität hotel = Zimmer, shuttle = Plätze.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260910111622_v2_hospitality.sql), set_updated_at() [Trigger trg_hospitality_quota_updated], upsert_hospitality_quota()

**Trigger auf dieser Tabelle:** trg_hospitality_quota_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `edition_id` | uuid | technisch | Migration/Seed (20260910111622_v2_hospitality.sql), upsert_hospitality_quota() | /admin | |
| `kind` | text | fachlich | Migration/Seed (20260910111622_v2_hospitality.sql), upsert_hospitality_quota() | /admin | |
| `tier` | text | fachlich | Migration/Seed (20260910111622_v2_hospitality.sql), upsert_hospitality_quota() | /admin | |
| `label_de` | text | fachlich | Migration/Seed (20260910111622_v2_hospitality.sql), upsert_hospitality_quota() | /admin | |
| `label_en` | text | fachlich | Migration/Seed (20260910111622_v2_hospitality.sql), upsert_hospitality_quota() | /admin | |
| `description_de` | text | fachlich | Migration/Seed (20260910111622_v2_hospitality.sql), upsert_hospitality_quota() | /admin | |
| `description_en` | text | fachlich | Migration/Seed (20260910111622_v2_hospitality.sql), upsert_hospitality_quota() | /admin | |
| `location` | text | fachlich | Migration/Seed (20260910111622_v2_hospitality.sql), upsert_hospitality_quota() | /admin | |
| `capacity` | integer | fachlich | Migration/Seed (20260910111622_v2_hospitality.sql), upsert_hospitality_quota() | /admin | |
| `window_from` | timestamp with time zone | fachlich | Migration/Seed (20260910111622_v2_hospitality.sql), upsert_hospitality_quota() | /admin | |
| `window_to` | timestamp with time zone | fachlich | Migration/Seed (20260910111622_v2_hospitality.sql), upsert_hospitality_quota() | /admin | |
| `notes` | text | fachlich | Migration/Seed (20260910111622_v2_hospitality.sql), upsert_hospitality_quota() | /admin | |
| `active` | boolean | fachlich | Migration/Seed (20260910111622_v2_hospitality.sql), upsert_hospitality_quota() | /admin | |
| `sort_order` | integer | fachlich | Migration/Seed (20260910111622_v2_hospitality.sql), upsert_hospitality_quota() | /admin | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_hospitality_quota_updated] |  | |

### `hospitality_booking`

**Zweck:** Hotel-/Shuttle-Buchungen der Speaker; requested → confirmed durch das Team, waitlisted bei Überbuchung.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** book_hospitality(), cancel_hospitality(), confirm_hospitality(), decline_hospitality(), set_updated_at() [Trigger trg_hospitality_booking_updated]

**Trigger auf dieser Tabelle:** trg_hospitality_booking_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin, /speaker/travel

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `quota_id` | uuid | technisch | book_hospitality() | /speaker/travel | |
| `profile_id` | uuid | technisch | book_hospitality() | /speaker/travel | |
| `kind` | text | fachlich | book_hospitality() | /speaker/travel | |
| `status` | text | fachlich | book_hospitality(), cancel_hospitality(), confirm_hospitality(), decline_hospitality() | /admin, /speaker/travel | |
| `guests` | integer | fachlich | book_hospitality() | /speaker/travel | |
| `details` | jsonb | fachlich | book_hospitality() | /speaker/travel | |
| `created_by` | uuid | technisch | book_hospitality() | /speaker/travel | |
| `confirmed_by` | uuid | technisch | confirm_hospitality() | /admin | |
| `confirmed_at` | timestamp with time zone | technisch | confirm_hospitality() | /admin | |
| `cancelled_at` | timestamp with time zone | technisch | cancel_hospitality(), decline_hospitality() | /admin, /speaker/travel | |
| `team_note` | text | fachlich | confirm_hospitality(), decline_hospitality() | /admin | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_hospitality_booking_updated] |  | |

### `expense_claim`

**Zweck:** Reisekostenanträge der Speaker. Bankdaten nur im Vault (bank_secret_id), hier nur Maske und Kontoinhaber.

**Datenschutz-Klasse (Vorschlag):** Bank/Vault

**Schreibwege (Funktionen/Trigger):** approve_expense(), mark_expense_paid(), reject_expense(), set_expense_bank_details(), set_expense_integration(), set_updated_at() [Trigger trg_expense_claim_updated], submit_expense(), upsert_expense_claim()

**Trigger auf dieser Tabelle:** trg_expense_claim_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin, /speaker/reisekosten

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `profile_id` | uuid | technisch | upsert_expense_claim() | /speaker/reisekosten | |
| `status` | text | fachlich | approve_expense(), mark_expense_paid(), reject_expense(), submit_expense(), upsert_expense_claim() | /admin, /speaker/reisekosten | |
| `currency` | text | fachlich |  |  | |
| `positions` | jsonb | fachlich | upsert_expense_claim() | /speaker/reisekosten | |
| `amount_cents` | integer | fachlich | upsert_expense_claim() | /speaker/reisekosten | |
| `bank_secret_id` | uuid | technisch | set_expense_bank_details() | /speaker/reisekosten | |
| `bank_masked` | text | fachlich | set_expense_bank_details() | /speaker/reisekosten | |
| `bank_holder` | text | fachlich | set_expense_bank_details() | /speaker/reisekosten | |
| `invoice_no` | text | fachlich | submit_expense() | /speaker/reisekosten | |
| `invoice_asset_id` | uuid | technisch | set_expense_integration() | /admin | |
| `submitted_at` | timestamp with time zone | technisch | submit_expense() | /speaker/reisekosten | |
| `submitted_by` | uuid | technisch | submit_expense() | /speaker/reisekosten | |
| `reviewed_by` | uuid | technisch | approve_expense(), reject_expense() | /admin | |
| `reviewed_at` | timestamp with time zone | technisch | approve_expense(), reject_expense() | /admin | |
| `review_note` | text | fachlich | approve_expense(), reject_expense(), submit_expense(), upsert_expense_claim() | /admin, /speaker/reisekosten | |
| `sevdesk_ref` | text | fachlich | set_expense_integration() | /admin | |
| `sevdesk_sent_at` | timestamp with time zone | technisch | set_expense_integration() | /admin | |
| `qonto_sent_at` | timestamp with time zone | technisch | set_expense_integration() | /admin | |
| `paid_at` | timestamp with time zone | technisch | mark_expense_paid() | /admin | |
| `paid_by` | uuid | technisch | mark_expense_paid() | /admin | |
| `payment_ref` | text | fachlich | mark_expense_paid() | /admin | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_expense_claim_updated] |  | |

## 4. Partner & Leistungen

### `organization`

**Zweck:** Partner, Startups, Initiativen, Hochschulen, Agenturen. HubSpot-Company über hubspot_id.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** ingest_partner_deal(), record_shop_invoice(), set_org_sevdesk_contact(), set_updated_at() [Trigger trg_organization_updated], update_partner_onboarding()

**Trigger auf dieser Tabelle:** trg_organization_updated → set_updated_at()

**Seiten (lesen/schreiben):** /partner, API-Route: /api/admin/sevdesk/shop-invoices, Cron: /api/cron/hubspot-sweep, Webhook: /api/webhooks/hubspot

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `legal_name` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /partner | |
| `communication_name` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /partner | |
| `logo_dark` | text | fachlich |  |  | |
| `logo_light` | text | fachlich |  |  | |
| `description` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /partner | |
| `address_street` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /partner | |
| `address_zip` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /partner | |
| `address_city` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /partner | |
| `address_country` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /partner | |
| `hubspot_id` | text | technisch | ingest_partner_deal() |  | |
| `partner_category` | text | fachlich | ingest_partner_deal() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_organization_updated] |  | |
| `type` | text | fachlich | ingest_partner_deal() |  | |
| `slug` | text | fachlich |  |  | |
| `website` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /partner | |
| `active` | boolean | fachlich | ingest_partner_deal() |  | |
| `sevdesk_contact_id` | text | technisch | record_shop_invoice(), set_org_sevdesk_contact() |  | |

### `org_membership`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** partner_contact_upsert_internal(), remove_partner_contact(), set_contact_roles(), set_updated_at() [Trigger trg_org_membership_updated], transfer_primary_contact() · löscht Zeilen: remove_partner_contact()

**Trigger auf dieser Tabelle:** trg_org_membership_updated → set_updated_at(), trg_org_membership_roles → trg_org_membership_roles()

**Seiten (lesen/schreiben):** /admin/partner, /partner

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id` | uuid | technisch | partner_contact_upsert_internal() |  | |
| `org_id` | uuid | technisch | partner_contact_upsert_internal() |  | |
| `roles` | text[] | fachlich | partner_contact_upsert_internal(), set_contact_roles(), transfer_primary_contact() | /admin/partner, /partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_org_membership_updated] |  | |
| `contact_position` | text | fachlich | partner_contact_upsert_internal() |  | |
| `invited_at` | timestamp with time zone | technisch | partner_contact_upsert_internal() |  | |

### `org_edition`

**Zweck:** Partner-Organisation je Edition: Onboarding-Stand, Rechnungsdaten, Pass-Typ-Wahl, HubSpot-Deal.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** ingest_partner_deal(), partner_onboarding_recheck(), partner_set_onboarding_status(), set_org_contacts(), set_pass_type_choice(), set_updated_at() [Trigger trg_org_edition_updated], update_partner_onboarding()

**Trigger auf dieser Tabelle:** trg_org_edition_updated → set_updated_at(), trg_org_edition_deliverables → trg_org_edition_sync(), trg_org_edition_pass_type → trg_org_edition_pass_type(), trg_org_edition_prefill_pass_type → org_edition_prefill_pass_type()

**Seiten (lesen/schreiben):** /admin/partner, /partner, Cron: /api/cron/hubspot-sweep, Webhook: /api/webhooks/hubspot

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `org_id` | uuid | technisch | ingest_partner_deal() |  | |
| `edition_id` | uuid | technisch | ingest_partner_deal() |  | |
| `onboarding_status` | text | fachlich | ingest_partner_deal(), partner_onboarding_recheck(), partner_set_onboarding_status() | /admin/partner | |
| `invited_at` | timestamp with time zone | technisch | ingest_partner_deal(), partner_set_onboarding_status() | /admin/partner | |
| `onboarding_filled_at` | timestamp with time zone | technisch | partner_onboarding_recheck(), partner_set_onboarding_status() | /admin/partner | |
| `description_de` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /partner | |
| `description_en` | text | fachlich | update_partner_onboarding() | /partner | |
| `invoice_email` | extensions.citext | fachlich | ingest_partner_deal(), update_partner_onboarding() | /partner | |
| `invoice_name` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /partner | |
| `vat_id` | text | technisch | ingest_partner_deal(), update_partner_onboarding() | /partner | |
| `po_number` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /partner | |
| `sponsoring_level` | text | fachlich | ingest_partner_deal() |  | |
| `hubspot_deal_id` | text | technisch | ingest_partner_deal() |  | |
| `notes_internal` | text | fachlich |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_org_contacts(), set_updated_at() [Trigger trg_org_edition_updated] |  | |
| `lead_contact_id` | uuid | technisch | set_org_contacts() |  | |
| `buddy_contact_id` | uuid | technisch | set_org_contacts() |  | |

### `org_product`

**Zweck:** Gebuchte Leistungen je Partner × Edition (aus HubSpot-Line-Items); steuert Checkliste und Sichtbarkeit.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** ingest_partner_deal(), set_updated_at() [Trigger trg_org_product_updated]

**Trigger auf dieser Tabelle:** trg_org_product_updated → set_updated_at(), trg_org_product_deliverables → trg_org_product_sync(), trg_org_product_allocations → trg_org_product_allocations(), trg_org_product_roles → trg_org_product_roles()

**Seiten (lesen/schreiben):** Cron: /api/cron/hubspot-sweep, Webhook: /api/webhooks/hubspot

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `org_edition_id` | uuid | technisch | ingest_partner_deal() |  | |
| `product_sku` | text | fachlich | ingest_partner_deal() |  | |
| `qty` | numeric | fachlich | ingest_partner_deal() |  | |
| `unit_price_cents` | integer | fachlich | ingest_partner_deal() |  | |
| `hubspot_line_item_id` | text | technisch | ingest_partner_deal() |  | |
| `status` | text | fachlich | ingest_partner_deal() |  | |
| `notes` | text | fachlich |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_org_product_updated] |  | |

### `org_step`

**Zweck:** Katalog der selbst zu meldenden Schritte je Thema (F9.8). Der Wortlaut steht in der Oberfläche, hier stehen nur Schlüssel und Reihenfolge — so ist „x von y" eine Zahl aus der Datenbank.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260915114240_v5_org_schritte.sql)

**Seiten (lesen/schreiben):** _keine .from()/.rpc()-Fundstelle in app/lib/components_

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `topic` | text | fachlich | Migration/Seed (20260915114240_v5_org_schritte.sql) |  | |
| `key` | text | fachlich | Migration/Seed (20260915114240_v5_org_schritte.sql) |  | |
| `sort_order` | integer | fachlich | Migration/Seed (20260915114240_v5_org_schritte.sql) |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `org_step_check`

**Zweck:** Selbstauskunft: dieser Schritt ist erledigt. Kein Nachweis — was in Swapcard passiert, sehen wir nicht. Zeile da = erledigt, Zeile weg = offen.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_org_step() · löscht Zeilen: set_org_step()

**Seiten (lesen/schreiben):** /partner/event-app

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `org_edition_id` | uuid | technisch | set_org_step() | /partner/event-app | |
| `topic` | text | fachlich | set_org_step() | /partner/event-app | |
| `key` | text | fachlich | set_org_step() | /partner/event-app | |
| `done_at` | timestamp with time zone | technisch |  |  | |
| `done_by` | uuid | technisch | set_org_step() | /partner/event-app | |

### `org_ticket_allocation`

**Zweck:** Ticket-Kontingent je Partner × Edition × Pass-Typ, abgeleitet aus Ticket-Produkten; Coupon/Undershop kommen aus vivenu (Route), Status pending_vivenu bis dahin.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260911074329_v3_ticket_allocations.sql), recount_allocation_usage(), set_ticket_allocation(), set_ticket_allocation_vivenu(), set_updated_at() [Trigger trg_org_ticket_allocation_updated], sync_ticket_allocations() · löscht Zeilen: sync_ticket_allocations()

**Trigger auf dieser Tabelle:** trg_org_ticket_allocation_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/partner, Cron: /api/cron/vivenu-allocations

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `event_id` | uuid | technisch | sync_ticket_allocations() |  | |
| `org_id` | uuid | technisch | sync_ticket_allocations() |  | |
| `pass_type` | text | fachlich | sync_ticket_allocations() |  | |
| `quantity` | integer | fachlich | set_ticket_allocation(), sync_ticket_allocations() | /admin/partner | |
| `coupon_code` | text | fachlich | set_ticket_allocation(), set_ticket_allocation_vivenu() | /admin/partner | |
| `undershop_url` | text | fachlich | set_ticket_allocation(), set_ticket_allocation_vivenu() | /admin/partner | |
| `used_count` | integer | fachlich | recount_allocation_usage() |  | |
| `notes` | text | fachlich | set_ticket_allocation() | /admin/partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_org_ticket_allocation_updated] |  | |
| `org_edition_id` | uuid | technisch | Migration/Seed (20260911074329_v3_ticket_allocations.sql), sync_ticket_allocations() |  | |
| `status` | text | fachlich | set_ticket_allocation(), set_ticket_allocation_vivenu(), sync_ticket_allocations() | /admin/partner | |
| `vivenu_coupon_id` | text | technisch | set_ticket_allocation_vivenu() |  | |
| `vivenu_undershop_id` | text | technisch | set_ticket_allocation_vivenu() |  | |
| `last_error` | text | fachlich | set_ticket_allocation(), set_ticket_allocation_vivenu() | /admin/partner | |
| `synced_at` | timestamp with time zone | technisch | set_ticket_allocation(), set_ticket_allocation_vivenu(), sync_ticket_allocations() | /admin/partner | |

### `partner_asset`

**Zweck:** Dateien einer Partner-Organisation im Bucket partner-assets (Pfad <edition>/<org>/<kind>/<datei>), versioniert.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** register_partner_asset(), review_deliverable(), set_updated_at() [Trigger trg_partner_asset_updated], submit_deliverable()

**Trigger auf dieser Tabelle:** trg_partner_asset_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/partner, /partner

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `org_edition_id` | uuid | technisch | register_partner_asset() | /partner | |
| `deliverable_id` | uuid | technisch | register_partner_asset(), submit_deliverable() | /partner | |
| `kind` | text | fachlich | register_partner_asset() | /partner | |
| `storage_path` | text | fachlich | register_partner_asset() | /partner | |
| `filename` | text | fachlich | register_partner_asset() | /partner | |
| `mime` | text | fachlich | register_partner_asset() | /partner | |
| `size_bytes` | bigint | fachlich | register_partner_asset() | /partner | |
| `version` | integer | fachlich | register_partner_asset() | /partner | |
| `is_current` | boolean | fachlich | register_partner_asset() | /partner | |
| `status` | text | fachlich | review_deliverable() | /admin/partner | |
| `review_note` | text | fachlich | review_deliverable() | /admin/partner | |
| `reviewed_by` | uuid | technisch | review_deliverable() | /admin/partner | |
| `reviewed_at` | timestamp with time zone | technisch | review_deliverable() | /admin/partner | |
| `uploaded_by` | uuid | technisch | register_partner_asset() | /partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_partner_asset_updated] |  | |

### `partner_deal`

**Zweck:** Verarbeitete HubSpot-Deals je Partner × Edition (Idempotenz des Ingests, Sweep-Abgleich). Kein Personenbezug im payload.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260910170826_v3_partner_deal.sql), ingest_partner_deal()

**Seiten (lesen/schreiben):** Cron: /api/cron/hubspot-sweep, Webhook: /api/webhooks/hubspot

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `hubspot_deal_id` | text | technisch | Migration/Seed (20260910170826_v3_partner_deal.sql), ingest_partner_deal() |  | |
| `org_edition_id` | uuid | technisch | Migration/Seed (20260910170826_v3_partner_deal.sql), ingest_partner_deal() |  | |
| `deal_name` | text | fachlich | ingest_partner_deal() |  | |
| `ingested_at` | timestamp with time zone | technisch |  |  | |
| `payload` | jsonb | fachlich | ingest_partner_deal() |  | |

### `deliverable`

**Zweck:** Pflicht eines Partners je Edition, abgeleitet aus deliverable_template × gebuchte Leistungen.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260915115415_v5_messestand.sql), mark_overdue_deliverables(), refresh_deliverable_due(), review_deliverable(), set_updated_at() [Trigger trg_deliverable_updated], shop_sync_fulfilled_deliverables(), submit_deliverable(), sync_deliverables()

**Trigger auf dieser Tabelle:** trg_deliverable_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/partner, /hackathon/teams, /partner

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `org_edition_id` | uuid | technisch | sync_deliverables() |  | |
| `template_id` | uuid | technisch | sync_deliverables() |  | |
| `key` | text | fachlich | sync_deliverables() |  | |
| `product_sku` | text | fachlich | sync_deliverables() |  | |
| `status` | text | fachlich | mark_overdue_deliverables(), review_deliverable(), shop_sync_fulfilled_deliverables(), submit_deliverable(), sync_deliverables() | /admin/partner, /partner | |
| `due_at` | timestamp with time zone | technisch | Migration/Seed (20260915115415_v5_messestand.sql), refresh_deliverable_due(), sync_deliverables() |  | |
| `submitted_at` | timestamp with time zone | technisch | shop_sync_fulfilled_deliverables(), submit_deliverable() | /partner | |
| `submitted_by` | uuid | technisch | shop_sync_fulfilled_deliverables(), submit_deliverable() | /partner | |
| `asset_ids` | uuid[] | fachlich | submit_deliverable() | /partner | |
| `answers` | jsonb | fachlich | shop_sync_fulfilled_deliverables(), submit_deliverable() | /partner | |
| `reviewed_by` | uuid | technisch | review_deliverable(), shop_sync_fulfilled_deliverables() | /admin/partner | |
| `reviewed_at` | timestamp with time zone | technisch | review_deliverable(), shop_sync_fulfilled_deliverables() | /admin/partner | |
| `review_note` | text | fachlich | review_deliverable(), shop_sync_fulfilled_deliverables(), submit_deliverable() | /admin/partner, /partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_deliverable_updated] |  | |

### `deliverable_template`

**Zweck:** Checklisten-Vorlagen je Produkt/Kategorie/alle; daraus entstehen die Pflichten (deliverable) einer Partner-Organisation.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911085655_v3_deliverable_extras.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260915115415_v5_messestand.sql), set_updated_at() [Trigger trg_deliverable_template_updated], upsert_deliverable_template()

**Trigger auf dieser Tabelle:** trg_deliverable_template_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/partner, /admin/partner/vorlagen

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `key` | text | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), upsert_deliverable_template() | /admin/partner | |
| `product_sku` | text | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260914095624_v4_hackathon.sql), upsert_deliverable_template() | /admin/partner | |
| `category` | text | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260914095624_v4_hackathon.sql), upsert_deliverable_template() | /admin/partner | |
| `type` | text | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), upsert_deliverable_template() | /admin/partner | |
| `label_de` | text | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), upsert_deliverable_template() | /admin/partner | |
| `label_en` | text | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), upsert_deliverable_template() | /admin/partner | |
| `description_de` | text | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), upsert_deliverable_template() | /admin/partner | |
| `description_en` | text | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), upsert_deliverable_template() | /admin/partner | |
| `due_rule` | jsonb | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915115415_v5_messestand.sql), upsert_deliverable_template() | /admin/partner | |
| `file_rules` | jsonb | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), upsert_deliverable_template() | /admin/partner | |
| `required` | boolean | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), upsert_deliverable_template() | /admin/partner | |
| `audience_roles` | text[] | fachlich | Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), upsert_deliverable_template() | /admin/partner | |
| `sort` | integer | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), upsert_deliverable_template() | /admin/partner | |
| `active` | boolean | fachlich | Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), upsert_deliverable_template() | /admin/partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_deliverable_template_updated] |  | |
| `fulfilled_by_sku` | text | fachlich | Migration/Seed (20260911085655_v3_deliverable_extras.sql), upsert_deliverable_template() | /admin/partner | |

### `deadline`

**Zweck:** Fristen je Edition; speist Countdowns, Uploads (late-Markierung) und später Wiki/Checklisten.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260915115415_v5_messestand.sql), set_updated_at() [Trigger trg_deadline_updated], upsert_deadline()

**Trigger auf dieser Tabelle:** trg_deadline_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin, /admin/fristen, /partner/messestand

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `edition_id` | uuid | technisch | Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), upsert_deadline() | /admin | |
| `key` | text | fachlich | Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260915115415_v5_messestand.sql), upsert_deadline() | /admin | |
| `audience` | text | fachlich | Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), upsert_deadline() | /admin | |
| `due_at` | timestamp with time zone | technisch | Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260915115415_v5_messestand.sql), upsert_deadline() | /admin | |
| `label_de` | text | fachlich | Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260915115415_v5_messestand.sql), upsert_deadline() | /admin | |
| `label_en` | text | fachlich | Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260915115415_v5_messestand.sql), upsert_deadline() | /admin | |
| `description_de` | text | fachlich | Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260915115415_v5_messestand.sql), upsert_deadline() | /admin | |
| `description_en` | text | fachlich | Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260915115415_v5_messestand.sql), upsert_deadline() | /admin | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_deadline_updated] |  | |
| `reminder_lead_hours` | integer | fachlich | Migration/Seed (20260910144439_v3_products.sql), upsert_deadline() | /admin | |

### `booth`

**Zweck:** Stand je Partner × Edition (Nummer, Fläche, Rückwand-Maße); Team pflegt, Partner liest. Produktionsdetails folgen in Welle 4.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_updated_at() [Trigger trg_booth_updated], upsert_booth()

**Trigger auf dieser Tabelle:** trg_booth_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/partner

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `org_edition_id` | uuid | technisch | upsert_booth() | /admin/partner | |
| `booth_number` | text | fachlich | upsert_booth() | /admin/partner | |
| `booth_type` | text | fachlich | upsert_booth() | /admin/partner | |
| `segment` | text | fachlich | upsert_booth() | /admin/partner | |
| `length_m` | numeric | fachlich | upsert_booth() | /admin/partner | |
| `width_m` | numeric | fachlich | upsert_booth() | /admin/partner | |
| `backdrop_w_mm` | integer | fachlich | upsert_booth() | /admin/partner | |
| `backdrop_h_mm` | integer | fachlich | upsert_booth() | /admin/partner | |
| `notes` | text | fachlich | upsert_booth() | /admin/partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_booth_updated] |  | |

### `booth_service_check`

**Zweck:** Abgehakte Position der Stand-Checkliste. Eine Zeile je Stand und Artikel; fehlt sie, ist die Position offen.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_booth_service_check() · löscht Zeilen: set_booth_service_check()

**Seiten (lesen/schreiben):** /produktion

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `org_edition_id` | uuid | technisch | set_booth_service_check() | /produktion | |
| `product_sku` | text | fachlich | set_booth_service_check() | /produktion | |
| `checked_by` | uuid | technisch | set_booth_service_check() | /produktion | |
| `checked_at` | timestamp with time zone | technisch |  |  | |
| `note` | text | fachlich | set_booth_service_check() | /produktion | |
| `created_at` | timestamp with time zone | technisch |  |  | |

## 5. Messeshop & Produkte

### `product`

**Zweck:** Produktstamm (Pakete, Zusatzleistungen, Shop-Artikel). SKU = Item-ID der Item-Liste; nach dem Import ist das Portal Quelle der Wahrheit.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260914094832_v4_produktion.sql), Migration/Seed (20260915115415_v5_messestand.sql), set_updated_at() [Trigger trg_product_updated], upsert_product()

**Trigger auf dieser Tabelle:** trg_product_updated → set_updated_at(), product_supplier_chk → trg_product_supplier()

**Seiten (lesen/schreiben):** /admin/partner, /admin/partner/vorlagen

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `sku` | text | fachlich | upsert_product() | /admin/partner | |
| `name_de` | text | fachlich | upsert_product() | /admin/partner | |
| `name_en` | text | fachlich | upsert_product() | /admin/partner | |
| `description_de` | text | fachlich | upsert_product() | /admin/partner | |
| `description_en` | text | fachlich | upsert_product() | /admin/partner | |
| `type` | text | fachlich | upsert_product() | /admin/partner | |
| `category` | text | fachlich | upsert_product() | /admin/partner | |
| `unit` | text | fachlich | upsert_product() | /admin/partner | |
| `net_price_cents` | integer | fachlich | upsert_product() | /admin/partner | |
| `purchase_price_cents` | integer | fachlich | upsert_product() | /admin/partner | |
| `margin` | numeric | fachlich | upsert_product() | /admin/partner | |
| `vat_rate` | numeric | fachlich | upsert_product() | /admin/partner | |
| `supplier` | text | fachlich | Migration/Seed (20260914094832_v4_produktion.sql), upsert_product() | /admin/partner | |
| `supplier_sku` | text | fachlich | upsert_product() | /admin/partner | |
| `supplier_url` | text | fachlich | upsert_product() | /admin/partner | |
| `stock_total` | integer | fachlich | upsert_product() | /admin/partner | |
| `track_stock` | boolean | fachlich | upsert_product() | /admin/partner | |
| `available_until` | timestamp with time zone | fachlich | upsert_product() | /admin/partner | |
| `shop_visible` | boolean | fachlich | upsert_product() | /admin/partner | |
| `shop_sort` | integer | fachlich | upsert_product() | /admin/partner | |
| `late_orderable` | boolean | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), upsert_product() | /admin/partner | |
| `shop_hint_de` | text | fachlich | upsert_product() | /admin/partner | |
| `shop_hint_en` | text | fachlich | upsert_product() | /admin/partner | |
| `purchase_note_de` | text | fachlich | upsert_product() | /admin/partner | |
| `purchase_note_en` | text | fachlich | upsert_product() | /admin/partner | |
| `merch_config` | jsonb | fachlich | upsert_product() | /admin/partner | |
| `images` | jsonb | fachlich | upsert_product() | /admin/partner | |
| `source_hubspot` | boolean | fachlich | upsert_product() | /admin/partner | |
| `source_shop` | boolean | fachlich | upsert_product() | /admin/partner | |
| `internal_comment` | text | fachlich | upsert_product() | /admin/partner | |
| `active` | boolean | fachlich | upsert_product() | /admin/partner | |
| `edition_id` | uuid | technisch | upsert_product() | /admin/partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_product_updated] |  | |
| `pass_type` | text | fachlich | Migration/Seed (20260910170349_v3_hubspot_ingest.sql), upsert_product() | /admin/partner | |
| `grants_role` | text | fachlich | Migration/Seed (20260910170349_v3_hubspot_ingest.sql), upsert_product() | /admin/partner | |
| `area_sqm` | numeric | fachlich | Migration/Seed (20260915115415_v5_messestand.sql) |  | |
| `size_note` | text | fachlich | Migration/Seed (20260915115415_v5_messestand.sql) |  | |

### `product_component`

**Zweck:** Stückliste: was in einem Paket steckt (Messebau/Regie).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** upsert_product_component() · löscht Zeilen: upsert_product_component()

**Seiten (lesen/schreiben):** /admin/partner, /admin/partner/produkte

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `bundle_sku` | text | fachlich | upsert_product_component() | /admin/partner | |
| `component_sku` | text | fachlich | upsert_product_component() | /admin/partner | |
| `qty` | numeric | fachlich | upsert_product_component() | /admin/partner | |

### `stock_ledger`

**Zweck:** Lagerbuch, nur anhängen: Reservierung (negativ) und Freigabe (positiv) je Bestellung; Team-Korrekturen ohne Bestellung.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** shop_reconcile_ledger()

**Seiten (lesen/schreiben):** _keine .from()/.rpc()-Fundstelle in app/lib/components_

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | bigint | technisch |  |  | |
| `product_sku` | text | fachlich | shop_reconcile_ledger() |  | |
| `order_id` | uuid | technisch | shop_reconcile_ledger() |  | |
| `delta` | integer | fachlich | shop_reconcile_ledger() |  | |
| `comment` | text | fachlich | shop_reconcile_ledger() |  | |
| `created_by` | uuid | technisch | shop_reconcile_ledger() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `shop_order`

**Zweck:** Messeshop-Bestellung je Partner × Edition × Phase; MS-JJJJ-NNNN; eine aktive je Org und Phase.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** run_shop_finalization(), set_updated_at() [Trigger trg_shop_order_updated], shop_admin_set_line(), shop_admin_set_status(), shop_cancel(), shop_confirm(), shop_edit(), shop_remove_line(), shop_upsert_line()

**Trigger auf dieser Tabelle:** trg_shop_order_updated → set_updated_at(), trg_shop_order_fulfil → trg_shop_order_fulfil()

**Seiten (lesen/schreiben):** /admin/partner, /partner

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `org_edition_id` | uuid | technisch | shop_upsert_line() | /partner | |
| `order_no` | text | fachlich | shop_upsert_line() | /partner | |
| `phase` | integer | fachlich | shop_upsert_line() | /partner | |
| `status` | text | fachlich | run_shop_finalization(), shop_admin_set_status(), shop_cancel(), shop_confirm(), shop_edit(), shop_upsert_line() | /admin/partner, /partner | |
| `note` | text | fachlich | shop_confirm() | /partner | |
| `internal_note` | text | fachlich | shop_admin_set_status() | /admin/partner | |
| `created_by` | uuid | technisch | shop_upsert_line() | /partner | |
| `confirmed_by` | uuid | technisch | shop_confirm() | /partner | |
| `confirmed_at` | timestamp with time zone | technisch | shop_admin_set_status(), shop_confirm() | /admin/partner, /partner | |
| `completed_at` | timestamp with time zone | technisch | run_shop_finalization(), shop_admin_set_status() | /admin/partner | |
| `cancelled_at` | timestamp with time zone | technisch | run_shop_finalization(), shop_admin_set_status(), shop_cancel() | /admin/partner, /partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_shop_order_updated], shop_admin_set_line(), shop_remove_line(), shop_upsert_line() | /admin/partner, /partner | |
| `po_number` | text | fachlich | shop_confirm() | /partner | |

### `shop_order_line`

**Zweck:** Bestellzeile mit Snapshot der Produktdaten zum Zeitpunkt der Bestätigung.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_updated_at() [Trigger trg_shop_order_line_updated], shop_admin_set_line(), shop_confirm(), shop_remove_line(), shop_upsert_line() · löscht Zeilen: shop_admin_set_line(), shop_remove_line(), shop_upsert_line()

**Trigger auf dieser Tabelle:** trg_shop_order_line_updated → set_updated_at(), trg_shop_order_line_fulfil → trg_shop_order_line_fulfil()

**Seiten (lesen/schreiben):** /admin/partner, /partner

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `order_id` | uuid | technisch | shop_admin_set_line(), shop_upsert_line() | /admin/partner, /partner | |
| `product_sku` | text | fachlich | shop_admin_set_line(), shop_upsert_line() | /admin/partner, /partner | |
| `name_de` | text | fachlich | shop_admin_set_line(), shop_confirm(), shop_upsert_line() | /admin/partner, /partner | |
| `name_en` | text | fachlich | shop_admin_set_line(), shop_confirm(), shop_upsert_line() | /admin/partner, /partner | |
| `category` | text | fachlich | shop_admin_set_line(), shop_confirm(), shop_upsert_line() | /admin/partner, /partner | |
| `unit` | text | fachlich | shop_admin_set_line(), shop_confirm(), shop_upsert_line() | /admin/partner, /partner | |
| `vat_rate` | numeric | fachlich | shop_admin_set_line(), shop_confirm(), shop_upsert_line() | /admin/partner, /partner | |
| `price_net_cents` | integer | fachlich | shop_admin_set_line(), shop_confirm(), shop_upsert_line() | /admin/partner, /partner | |
| `qty` | numeric | fachlich | shop_admin_set_line(), shop_upsert_line() | /admin/partner, /partner | |
| `merch_config` | jsonb | fachlich | shop_admin_set_line(), shop_upsert_line() | /admin/partner, /partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_shop_order_line_updated] |  | |

### `shop_request`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** request_ticket_increase(), set_updated_at() [Trigger trg_shop_request_updated], shop_request_answer(), shop_request_product()

**Trigger auf dieser Tabelle:** trg_shop_request_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/partner, /partner

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `org_edition_id` | uuid | technisch | request_ticket_increase(), shop_request_product() | /partner | |
| `product_sku` | text | fachlich | request_ticket_increase(), shop_request_product() | /partner | |
| `text` | text | fachlich | request_ticket_increase(), shop_request_product() | /partner | |
| `status` | text | fachlich | shop_request_answer() | /admin/partner | |
| `answer` | text | fachlich | shop_request_answer() | /admin/partner | |
| `answered_by` | uuid | technisch | shop_request_answer() | /admin/partner | |
| `answered_at` | timestamp with time zone | technisch | shop_request_answer() | /admin/partner | |
| `created_by` | uuid | technisch | request_ticket_increase(), shop_request_product() | /partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_shop_request_updated] |  | |

## 6. Tickets & Einlass

### `ticket`

**Zweck:** Ticket aus vivenu (Barcode = QR) oder Freiticket (Crew/Speaker). Badge-Felder werden nach vivenu zurückgeschrieben.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** backfill_ticket_pass_types(), cancel_companion_ticket(), checkin_scan(), confirm_companion_ticket(), decline_companion_ticket(), ingest_vivenu_ticket(), personalize_ticket(), request_companion_ticket(), set_ticket_issued(), set_updated_at() [Trigger trg_ticket_updated], speaker_profile_tickets_sync(), speaker_ticket_create(), trg_ticket_volunteer_redeem() [Trigger ticket_volunteer_redeem]

**Trigger auf dieser Tabelle:** trg_ticket_updated → set_updated_at(), ticket_volunteer_redeem → trg_ticket_volunteer_redeem()

**Seiten (lesen/schreiben):** /admin, /checkin, /meine, /speaker/tickets, Cron: /api/cron/vivenu-tickets, Webhook: /api/webhooks/vivenu

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `event_id` | uuid | technisch | ingest_vivenu_ticket(), request_companion_ticket(), speaker_ticket_create() | /speaker/tickets | |
| `person_id` | uuid | technisch | ingest_vivenu_ticket(), personalize_ticket(), speaker_ticket_create() |  | |
| `ticket_type_map_id` | uuid | technisch | backfill_ticket_pass_types(), ingest_vivenu_ticket(), set_ticket_issued() |  | |
| `pass_type` | text | fachlich | backfill_ticket_pass_types(), ingest_vivenu_ticket(), request_companion_ticket(), speaker_profile_tickets_sync(), speaker_ticket_create() | /speaker/tickets | |
| `barcode` | text | fachlich | ingest_vivenu_ticket(), set_ticket_issued() |  | |
| `vivenu_ticket_id` | text | technisch | ingest_vivenu_ticket(), set_ticket_issued() |  | |
| `vivenu_transaction_id` | text | technisch | ingest_vivenu_ticket(), set_ticket_issued() |  | |
| `vivenu_customer_id` | text | technisch | ingest_vivenu_ticket() |  | |
| `buyer_email` | extensions.citext | fachlich | ingest_vivenu_ticket() |  | |
| `holder_email` | extensions.citext | fachlich | ingest_vivenu_ticket(), personalize_ticket(), request_companion_ticket(), speaker_ticket_create() | /speaker/tickets | |
| `holder_first_name` | text | fachlich | ingest_vivenu_ticket(), personalize_ticket(), request_companion_ticket(), speaker_ticket_create() | /speaker/tickets | |
| `holder_last_name` | text | fachlich | ingest_vivenu_ticket(), personalize_ticket(), request_companion_ticket(), speaker_ticket_create() | /speaker/tickets | |
| `holder_company` | text | fachlich | ingest_vivenu_ticket(), personalize_ticket(), speaker_ticket_create() |  | |
| `holder_position` | text | fachlich | personalize_ticket(), speaker_ticket_create() |  | |
| `status` | text | fachlich | cancel_companion_ticket(), confirm_companion_ticket(), decline_companion_ticket(), ingest_vivenu_ticket(), request_companion_ticket(), set_ticket_issued(), speaker_profile_tickets_sync(), speaker_ticket_create(), trg_ticket_volunteer_redeem() [Trigger ticket_volunteer_redeem] | /admin, /speaker/tickets | |
| `personalization_status` | text | fachlich | ingest_vivenu_ticket(), personalize_ticket(), request_companion_ticket(), speaker_ticket_create() | /speaker/tickets | |
| `addons` | jsonb | fachlich | ingest_vivenu_ticket() |  | |
| `price_cents` | integer | fachlich | ingest_vivenu_ticket(), request_companion_ticket(), speaker_ticket_create() | /speaker/tickets | |
| `currency` | text | fachlich | ingest_vivenu_ticket() |  | |
| `source` | text | fachlich | ingest_vivenu_ticket(), request_companion_ticket(), speaker_ticket_create() | /speaker/tickets | |
| `purchased_at` | timestamp with time zone | technisch | ingest_vivenu_ticket(), set_ticket_issued() |  | |
| `personalized_at` | timestamp with time zone | technisch | personalize_ticket() |  | |
| `checked_in_at` | timestamp with time zone | technisch | checkin_scan() | /checkin | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | backfill_ticket_pass_types(), ingest_vivenu_ticket(), set_updated_at() [Trigger trg_ticket_updated] |  | |
| `speaker_profile_id` | uuid | technisch | request_companion_ticket(), speaker_ticket_create() | /speaker/tickets | |
| `lounge_access` | boolean | fachlich | request_companion_ticket(), speaker_profile_tickets_sync(), speaker_ticket_create() | /speaker/tickets | |
| `team_note` | text | fachlich | confirm_companion_ticket(), decline_companion_ticket(), speaker_profile_tickets_sync() | /admin | |
| `requested_by` | uuid | technisch | request_companion_ticket(), speaker_ticket_create() | /speaker/tickets | |
| `approved_by` | uuid | technisch | confirm_companion_ticket(), decline_companion_ticket() | /admin | |
| `approved_at` | timestamp with time zone | technisch | confirm_companion_ticket(), decline_companion_ticket() | /admin | |
| `meta` | jsonb | fachlich | ingest_vivenu_ticket() |  | |
| `extra_fields` | jsonb | fachlich | ingest_vivenu_ticket() |  | |
| `vivenu_discount_id` | text | technisch | ingest_vivenu_ticket() |  | |
| `vivenu_updated_at` | timestamp with time zone | technisch | ingest_vivenu_ticket() |  | |
| `vivenu_ticket_type_id` | text | technisch | ingest_vivenu_ticket() |  | |
| `vivenu_undershop_id` | text | technisch | ingest_vivenu_ticket() |  | |

### `ticket_secret`

**Zweck:** vivenu-Ticket-Secrets für die Personalisierung. Keine Grants, keine Policy — nur service_role.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_ticket_secret()

**Seiten (lesen/schreiben):** _keine .from()/.rpc()-Fundstelle in app/lib/components_

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `ticket_id` | uuid | technisch | set_ticket_secret() |  | |
| `secret` | text | fachlich | set_ticket_secret() |  | |
| `updated_at` | timestamp with time zone | technisch |  |  | |

### `ticket_type_map`

**Zweck:** vivenu-Tickettyp ↔ Pass-Typ ↔ Swapcard-Gruppe/Rechte (Antwort 53: eine Gruppe je Pass-Typ).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_updated_at() [Trigger trg_ticket_type_map_updated]

**Trigger auf dieser Tabelle:** trg_ticket_type_map_updated → set_updated_at()

**Seiten (lesen/schreiben):** Cron: /api/cron/volunteer-tickets

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `event_id` | uuid | technisch |  |  | |
| `vivenu_ticket_type_id` | text | technisch |  |  | |
| `vivenu_ticket_name` | text | fachlich |  |  | |
| `pass_type` | text | fachlich |  |  | |
| `swapcard_group` | text | fachlich |  |  | |
| `rights` | jsonb | fachlich |  |  | |
| `active` | boolean | fachlich |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_ticket_type_map_updated] |  | |

### `checkin`

**Zweck:** Scan-Ereignisse (Kiosk-Rolle). Setup Einlass offen (vivenu-Support Frage 11).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260914112220_v4_checkin.sql), checkin_scan(), purge_checkins() · löscht Zeilen: purge_checkins()

**Seiten (lesen/schreiben):** /checkin, Cron: /api/cron/mail

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | bigint | technisch |  |  | |
| `ticket_id` | uuid | technisch | checkin_scan() | /checkin | |
| `scanned_at` | timestamp with time zone | technisch |  |  | |
| `device_id` | text | technisch | checkin_scan() | /checkin | |
| `operator_person_id` | uuid | technisch | checkin_scan() | /checkin | |
| `location` | text | fachlich |  |  | |
| `result` | text | fachlich | checkin_scan() | /checkin | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `edition_id` | uuid | technisch | Migration/Seed (20260914112220_v4_checkin.sql), checkin_scan() | /checkin | |
| `scan_day` | date | fachlich | Migration/Seed (20260914112220_v4_checkin.sql), checkin_scan() | /checkin | |

## 7. Volunteers

### `volunteer_profile`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** apply_volunteer(), remind_volunteer_tickets(), set_updated_at() [Trigger trg_volunteer_profile_updated], set_volunteer_coupon(), set_volunteer_status(), trg_ticket_volunteer_redeem(), trg_volunteer_status_coupon() [Trigger volunteer_status_coupon], update_my_volunteer_profile()

**Trigger auf dieser Tabelle:** trg_volunteer_profile_updated → set_updated_at(), volunteer_status_coupon → trg_volunteer_status_coupon()

**Seiten (lesen/schreiben):** /admin/volunteers, /volunteers, Cron: /api/cron/volunteer-tickets

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id` | uuid | technisch | apply_volunteer() | /volunteers | |
| `edition_id` | uuid | technisch | apply_volunteer() | /volunteers | |
| `status` | text | fachlich | set_volunteer_status(), trg_volunteer_status_coupon() [Trigger volunteer_status_coupon], update_my_volunteer_profile() | /admin/volunteers, /volunteers | |
| `shirt_size` | text | fachlich | apply_volunteer(), update_my_volunteer_profile() | /volunteers | |
| `areas` | text[] | fachlich | apply_volunteer(), update_my_volunteer_profile() | /volunteers | |
| `day_prefs` | uuid[] | fachlich | apply_volunteer(), update_my_volunteer_profile() | /volunteers | |
| `availability` | jsonb | fachlich | apply_volunteer(), update_my_volunteer_profile() | /volunteers | |
| `buddy_person_id` | uuid | technisch | apply_volunteer() | /volunteers | |
| `buddy_note` | text | fachlich | apply_volunteer(), update_my_volunteer_profile() | /volunteers | |
| `notes_internal` | text | fachlich |  |  | |
| `applied_at` | timestamp with time zone | technisch |  |  | |
| `decided_at` | timestamp with time zone | technisch | set_volunteer_status() | /admin/volunteers | |
| `decided_by` | uuid | technisch | set_volunteer_status() | /admin/volunteers | |
| `decision_note` | text | fachlich | set_volunteer_status() | /admin/volunteers | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_volunteer_profile_updated], set_volunteer_coupon(), trg_ticket_volunteer_redeem() |  | |
| `coupon_code` | text | fachlich | set_volunteer_coupon(), trg_volunteer_status_coupon() [Trigger volunteer_status_coupon] |  | |
| `vivenu_coupon_id` | text | technisch | set_volunteer_coupon(), trg_volunteer_status_coupon() [Trigger volunteer_status_coupon] |  | |
| `coupon_status` | text | fachlich | set_volunteer_coupon(), trg_ticket_volunteer_redeem(), trg_volunteer_status_coupon() [Trigger volunteer_status_coupon] |  | |
| `coupon_issued_at` | timestamp with time zone | technisch | set_volunteer_coupon(), trg_volunteer_status_coupon() [Trigger volunteer_status_coupon] |  | |
| `redeemed_at` | timestamp with time zone | technisch | trg_ticket_volunteer_redeem() |  | |
| `ticket_id` | uuid | technisch | trg_ticket_volunteer_redeem() |  | |
| `coupon_error` | text | fachlich | set_volunteer_coupon(), trg_volunteer_status_coupon() [Trigger volunteer_status_coupon] |  | |
| `reminded_at` | timestamp with time zone | technisch | remind_volunteer_tickets(), trg_volunteer_status_coupon() [Trigger volunteer_status_coupon] |  | |

### `shift`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_updated_at() [Trigger trg_shift_updated], upsert_shift()

**Trigger auf dieser Tabelle:** trg_shift_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/volunteers

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `edition_id` | uuid | technisch | upsert_shift() | /admin/volunteers | |
| `event_day_id` | uuid | technisch | upsert_shift() | /admin/volunteers | |
| `area` | text | fachlich | upsert_shift() | /admin/volunteers | |
| `position` | text | fachlich | upsert_shift() | /admin/volunteers | |
| `start_at` | timestamp with time zone | technisch | upsert_shift() | /admin/volunteers | |
| `end_at` | timestamp with time zone | technisch | upsert_shift() | /admin/volunteers | |
| `capacity` | integer | fachlich | upsert_shift() | /admin/volunteers | |
| `overbook` | integer | fachlich | upsert_shift() | /admin/volunteers | |
| `location` | text | fachlich | upsert_shift() | /admin/volunteers | |
| `lead_person_id` | uuid | technisch | upsert_shift() | /admin/volunteers | |
| `briefing_md` | text | fachlich | upsert_shift() | /admin/volunteers | |
| `active` | boolean | fachlich | upsert_shift() | /admin/volunteers | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_shift_updated] |  | |

### `shift_assignment`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** assign_shift(), confirm_shift(), decline_shift(), promote_shift_waitlist(), send_shift_reminders(), set_updated_at() [Trigger trg_shift_assignment_updated], unassign_shift() · löscht Zeilen: unassign_shift()

**Trigger auf dieser Tabelle:** trg_shift_assignment_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/volunteers, /volunteers

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `shift_id` | uuid | technisch | assign_shift() | /admin/volunteers | |
| `person_id` | uuid | technisch | assign_shift() | /admin/volunteers | |
| `status` | text | fachlich | assign_shift(), confirm_shift(), decline_shift(), promote_shift_waitlist() | /admin/volunteers, /volunteers | |
| `confirmed_at` | timestamp with time zone | technisch | confirm_shift() | /volunteers | |
| `declined_at` | timestamp with time zone | technisch | decline_shift() | /volunteers | |
| `decline_reason` | text | fachlich | decline_shift() | /volunteers | |
| `reminded_at` | timestamp with time zone | technisch | send_shift_reminders() |  | |
| `assigned_by` | uuid | technisch | assign_shift() | /admin/volunteers | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_shift_assignment_updated] |  | |

### `volunteer_coupon_revocation`

**Zweck:** Widerrufene Volunteer-Coupons, die bei vivenu noch zu deaktivieren sind (`deactivated_at` leer).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** mark_volunteer_coupon_revoked(), trg_volunteer_status_coupon()

**Seiten (lesen/schreiben):** Cron: /api/cron/volunteer-tickets

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | bigint | technisch |  |  | |
| `profile_id` | uuid | technisch | trg_volunteer_status_coupon() |  | |
| `vivenu_coupon_id` | text | technisch | trg_volunteer_status_coupon() |  | |
| `coupon_code` | text | fachlich | trg_volunteer_status_coupon() |  | |
| `revoked_at` | timestamp with time zone | technisch |  |  | |
| `deactivated_at` | timestamp with time zone | technisch | mark_volunteer_coupon_revoked() |  | |
| `error` | text | fachlich | mark_volunteer_coupon_revoked() |  | |

## 8. Hackathon

### `hack_application`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** apply_hackathon(), join_hack_team(), leave_hack_team(), set_hack_application_status()

**Seiten (lesen/schreiben):** /hackathon

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id` | uuid | technisch | apply_hackathon() | /hackathon | |
| `edition_id` | uuid | technisch | apply_hackathon() | /hackathon | |
| `skills` | text[] | fachlich | apply_hackathon() | /hackathon | |
| `motivation` | text | fachlich | apply_hackathon() | /hackathon | |
| `team_pref` | text | fachlich | apply_hackathon() | /hackathon | |
| `team_id` | uuid | technisch | join_hack_team(), leave_hack_team() | /hackathon | |
| `status` | text | fachlich | set_hack_application_status() |  | |
| `applied_at` | timestamp with time zone | technisch |  |  | |
| `decided_at` | timestamp with time zone | technisch | set_hack_application_status() |  | |
| `decided_by` | uuid | technisch | set_hack_application_status() |  | |
| `note` | text | fachlich | set_hack_application_status() |  | |

### `hack_challenge`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** publish_hack_challenge()

**Seiten (lesen/schreiben):** /hackathon

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `edition_id` | uuid | technisch | publish_hack_challenge() | /hackathon | |
| `org_id` | uuid | technisch | publish_hack_challenge() | /hackathon | |
| `deliverable_id` | uuid | technisch | publish_hack_challenge() | /hackathon | |
| `title_de` | text | fachlich | publish_hack_challenge() | /hackathon | |
| `title_en` | text | fachlich | publish_hack_challenge() | /hackathon | |
| `description_de` | text | fachlich | publish_hack_challenge() | /hackathon | |
| `description_en` | text | fachlich | publish_hack_challenge() | /hackathon | |
| `prizes` | text | fachlich | publish_hack_challenge() | /hackathon | |
| `resources` | text | fachlich | publish_hack_challenge() | /hackathon | |
| `mentors` | jsonb | fachlich | publish_hack_challenge() | /hackathon | |
| `criteria` | jsonb | fachlich | publish_hack_challenge() | /hackathon | |
| `status` | text | fachlich | publish_hack_challenge() | /hackathon | |
| `sort_order` | integer | fachlich |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch |  |  | |

### `hack_team`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** assign_challenges(), create_hack_team(), leave_hack_team(), set_team_challenge()

**Seiten (lesen/schreiben):** /hackathon

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `edition_id` | uuid | technisch | create_hack_team() | /hackathon | |
| `name` | text | fachlich | create_hack_team() | /hackathon | |
| `challenge_id` | uuid | technisch | assign_challenges(), set_team_challenge() | /hackathon | |
| `join_code` | text | fachlich | create_hack_team() | /hackathon | |
| `status` | text | fachlich | leave_hack_team() | /hackathon | |
| `discord_url` | text | fachlich |  |  | |
| `note_internal` | text | fachlich |  |  | |
| `created_by` | uuid | technisch | create_hack_team() | /hackathon | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | assign_challenges(), leave_hack_team(), set_team_challenge() | /hackathon | |

### `hack_team_member`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** create_hack_team(), join_hack_team(), leave_hack_team() · löscht Zeilen: leave_hack_team()

**Trigger auf dieser Tabelle:** hack_team_size → trg_hack_team_size(), hack_member_edition → trg_hack_member_edition()

**Seiten (lesen/schreiben):** /hackathon

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `team_id` | uuid | technisch | create_hack_team(), join_hack_team() | /hackathon | |
| `person_id` | uuid | technisch | create_hack_team(), join_hack_team() | /hackathon | |
| `edition_id` | uuid | technisch | create_hack_team(), join_hack_team() | /hackathon | |
| `role` | text | fachlich |  |  | |
| `is_captain` | boolean | fachlich | create_hack_team(), leave_hack_team() | /hackathon | |
| `joined_at` | timestamp with time zone | technisch |  |  | |

### `hack_submission`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** submit_hack()

**Seiten (lesen/schreiben):** /hackathon

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `team_id` | uuid | technisch | submit_hack() | /hackathon | |
| `url` | text | fachlich | submit_hack() | /hackathon | |
| `repo_url` | text | fachlich | submit_hack() | /hackathon | |
| `notes` | text | fachlich | submit_hack() | /hackathon | |
| `files` | jsonb | fachlich |  |  | |
| `submitted_at` | timestamp with time zone | technisch | submit_hack() | /hackathon | |
| `submitted_by` | uuid | technisch | submit_hack() | /hackathon | |
| `updated_at` | timestamp with time zone | technisch |  |  | |

### `hack_judging_score`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_hack_score()

**Seiten (lesen/schreiben):** /hackathon

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `team_id` | uuid | technisch | set_hack_score() | /hackathon | |
| `judge_id` | uuid | technisch | set_hack_score() | /hackathon | |
| `criteria` | jsonb | fachlich | set_hack_score() | /hackathon | |
| `total` | numeric | fachlich | set_hack_score() | /hackathon | |
| `note` | text | fachlich | set_hack_score() | /hackathon | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch |  |  | |

## 9. Inhalte, Kommunikation, Stammdaten, Integration

### `kb_article`

**Zweck:** Wissensbasis. `edition_id` NULL = jahresunabhängig; ein Artikel mit Edition überlagert ihn für diese Edition.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260915114852_v5_wiki_inhalte.sql), delete_kb_article(), publish_kb_article(), upsert_kb_article()

**Trigger auf dieser Tabelle:** trg_kb_article_chunks → trg_kb_article_chunks()

**Seiten (lesen/schreiben):** /admin/wiki

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `slug` | text | fachlich | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), upsert_kb_article() | /admin/wiki | |
| `edition_id` | uuid | technisch | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), upsert_kb_article() | /admin/wiki | |
| `language` | text | fachlich | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), upsert_kb_article() | /admin/wiki | |
| `audience` | text[] | fachlich | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), upsert_kb_article() | /admin/wiki | |
| `roles` | text[] | fachlich | upsert_kb_article() | /admin/wiki | |
| `phase` | text | fachlich | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), upsert_kb_article() | /admin/wiki | |
| `title` | text | fachlich | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), upsert_kb_article() | /admin/wiki | |
| `body_md` | text | fachlich | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), upsert_kb_article() | /admin/wiki | |
| `status` | text | fachlich | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), delete_kb_article(), publish_kb_article(), upsert_kb_article() | /admin/wiki | |
| `valid_until` | timestamp with time zone | fachlich | upsert_kb_article() | /admin/wiki | |
| `owner_person_id` | uuid | technisch | upsert_kb_article() | /admin/wiki | |
| `sort_order` | integer | fachlich | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), upsert_kb_article() | /admin/wiki | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | delete_kb_article(), publish_kb_article(), upsert_kb_article() | /admin/wiki | |
| `updated_by` | uuid | technisch | delete_kb_article(), publish_kb_article(), upsert_kb_article() | /admin/wiki | |
| `published_at` | timestamp with time zone | technisch | publish_kb_article() | /admin/wiki | |

### `mail_log`

**Zweck:** Jede versendete oder unterdrückte Mail mit Zustellstatus (Resend-Webhooks aktualisieren status).

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** queue_mail(), set_updated_at() [Trigger trg_mail_log_updated]

**Trigger auf dieser Tabelle:** trg_mail_log_updated → set_updated_at()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** Cron: /api/cron/mail, lib

**Seiten (lesen/schreiben):** /admin/mail, Cron: /api/cron/mail, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | bigint | technisch |  |  | |
| `to_email` | extensions.citext | fachlich | queue_mail() |  | |
| `person_id` | uuid | technisch | queue_mail() |  | |
| `template_key` | text | fachlich | queue_mail() |  | |
| `locale` | text | fachlich | queue_mail() |  | |
| `subject` | text | fachlich |  |  | |
| `provider` | text | fachlich | queue_mail() |  | |
| `provider_id` | text | technisch |  |  | |
| `status` | text | fachlich | queue_mail() |  | |
| `error` | text | fachlich |  |  | |
| `meta` | jsonb | fachlich | queue_mail() |  | |
| `related_type` | text | fachlich | queue_mail() |  | |
| `related_id` | uuid | technisch | queue_mail() |  | |
| `queued_at` | timestamp with time zone | technisch |  |  | |
| `sent_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_mail_log_updated] |  | |

### `mail_template`

**Zweck:** System-Mails DE/EN. Versand über Resend (lib/mail), Rendering aus Markdown.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908151704_v2_fix_mail_template_newlines.sql), Migration/Seed (20260910074957_v2_application_mails_queue.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910111622_v2_hospitality.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910115407_v2_speaker_tickets.sql), Migration/Seed (20260910125130_v2_presentation_reminder_manager_scope.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260910172455_v3_partner_reminders.sql), Migration/Seed (20260911070632_v3_shop.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914095318_v4_volunteer_tickets.sql), set_updated_at() [Trigger trg_mail_template_updated]

**Trigger auf dieser Tabelle:** trg_mail_template_updated → set_updated_at()

**Seiten (lesen/schreiben):** lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `key` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260910074957_v2_application_mails_queue.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910111622_v2_hospitality.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910115407_v2_speaker_tickets.sql), Migration/Seed (20260910125130_v2_presentation_reminder_manager_scope.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260910172455_v3_partner_reminders.sql), Migration/Seed (20260911070632_v3_shop.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914095318_v4_volunteer_tickets.sql) |  | |
| `locale` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260910074957_v2_application_mails_queue.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910111622_v2_hospitality.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910115407_v2_speaker_tickets.sql), Migration/Seed (20260910125130_v2_presentation_reminder_manager_scope.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260910172455_v3_partner_reminders.sql), Migration/Seed (20260911070632_v3_shop.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914095318_v4_volunteer_tickets.sql) |  | |
| `version` | integer | fachlich | Migration/Seed (20260910074957_v2_application_mails_queue.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910111622_v2_hospitality.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910115407_v2_speaker_tickets.sql), Migration/Seed (20260910125130_v2_presentation_reminder_manager_scope.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260910172455_v3_partner_reminders.sql), Migration/Seed (20260911070632_v3_shop.sql), Migration/Seed (20260911165420_v4_volunteers.sql) |  | |
| `subject` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260910074957_v2_application_mails_queue.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910111622_v2_hospitality.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910115407_v2_speaker_tickets.sql), Migration/Seed (20260910125130_v2_presentation_reminder_manager_scope.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260910172455_v3_partner_reminders.sql), Migration/Seed (20260911070632_v3_shop.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914095318_v4_volunteer_tickets.sql) |  | |
| `body_md` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908151704_v2_fix_mail_template_newlines.sql), Migration/Seed (20260910074957_v2_application_mails_queue.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910111622_v2_hospitality.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910115407_v2_speaker_tickets.sql), Migration/Seed (20260910125130_v2_presentation_reminder_manager_scope.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260910172455_v3_partner_reminders.sql), Migration/Seed (20260911070632_v3_shop.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914095318_v4_volunteer_tickets.sql) |  | |
| `description` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260910074957_v2_application_mails_queue.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910111622_v2_hospitality.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910115407_v2_speaker_tickets.sql), Migration/Seed (20260910125130_v2_presentation_reminder_manager_scope.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260910172455_v3_partner_reminders.sql), Migration/Seed (20260911070632_v3_shop.sql), Migration/Seed (20260911165420_v4_volunteers.sql) |  | |
| `active` | boolean | fachlich | Migration/Seed (20260910074957_v2_application_mails_queue.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910111622_v2_hospitality.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910115407_v2_speaker_tickets.sql), Migration/Seed (20260910125130_v2_presentation_reminder_manager_scope.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260910172455_v3_partner_reminders.sql), Migration/Seed (20260911070632_v3_shop.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914095318_v4_volunteer_tickets.sql) |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_mail_template_updated] |  | |

### `portal_video`

**Zweck:** Eingebettete Videos je Schlüssel (F9.4). Seiten binden über `key` ein, der Link ist Redaktionssache. Nur Loom — der CHECK und die CSP gehören zusammen.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** delete_portal_video(), upsert_portal_video() · löscht Zeilen: delete_portal_video()

**Seiten (lesen/schreiben):** /admin/videos

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `key` | text | fachlich | upsert_portal_video() | /admin/videos | |
| `title_de` | text | fachlich | upsert_portal_video() | /admin/videos | |
| `title_en` | text | fachlich | upsert_portal_video() | /admin/videos | |
| `url` | text | fachlich | upsert_portal_video() | /admin/videos | |
| `audience` | text[] | fachlich | upsert_portal_video() | /admin/videos | |
| `edition_id` | uuid | technisch | upsert_portal_video() | /admin/videos | |
| `sort_order` | integer | fachlich | upsert_portal_video() | /admin/videos | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | upsert_portal_video() | /admin/videos | |

### `edition_contact`

**Zweck:** Ansprechpartner je Edition (F9.1). Dienstliche Mailadresse per CHECK erzwungen; die Nummer ist Pflicht, aber nicht prüfbar — gemeint ist die dienstliche.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** delete_edition_contact(), upsert_edition_contact() · löscht Zeilen: delete_edition_contact()

**Seiten (lesen/schreiben):** /admin/ansprechpartner

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `edition_id` | uuid | technisch | upsert_edition_contact() | /admin/ansprechpartner | |
| `type` | text | fachlich | upsert_edition_contact() | /admin/ansprechpartner | |
| `display_name` | text | fachlich | upsert_edition_contact() | /admin/ansprechpartner | |
| `role_label_de` | text | fachlich | upsert_edition_contact() | /admin/ansprechpartner | |
| `role_label_en` | text | fachlich | upsert_edition_contact() | /admin/ansprechpartner | |
| `email` | extensions.citext | fachlich | upsert_edition_contact() | /admin/ansprechpartner | |
| `phone` | text | fachlich | upsert_edition_contact() | /admin/ansprechpartner | |
| `photo_path` | text | fachlich | upsert_edition_contact() | /admin/ansprechpartner | |
| `is_default` | boolean | fachlich | upsert_edition_contact() | /admin/ansprechpartner | |
| `sort_order` | integer | fachlich | upsert_edition_contact() | /admin/ansprechpartner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | upsert_edition_contact() | /admin/ansprechpartner | |

### `edition_file`

**Zweck:** Dateien, die einer Edition gehören und nicht einer Organisation: Hallenplan, Anfahrt, Aufbauplan. Privater Bucket `edition-files`, Pfad <edition_id>/<kind>/<datei>.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** delete_edition_file(), set_edition_file(), set_updated_at() [Trigger trg_edition_file_updated] · löscht Zeilen: delete_edition_file()

**Trigger auf dieser Tabelle:** trg_edition_file_updated → set_updated_at()

**Seiten (lesen/schreiben):** API-Route: /api/produktion/edition-files

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `edition_id` | uuid | technisch | set_edition_file() |  | |
| `kind` | text | fachlich | set_edition_file() |  | |
| `storage_path` | text | fachlich | set_edition_file() |  | |
| `filename` | text | fachlich | set_edition_file() |  | |
| `mime` | text | fachlich | set_edition_file() |  | |
| `size_bytes` | bigint | fachlich | set_edition_file() |  | |
| `label_de` | text | fachlich | set_edition_file() |  | |
| `label_en` | text | fachlich | set_edition_file() |  | |
| `audience` | text[] | fachlich | set_edition_file() |  | |
| `sort_order` | integer | fachlich | set_edition_file() |  | |
| `uploaded_by` | uuid | technisch | set_edition_file() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_edition_file(), set_updated_at() [Trigger trg_edition_file_updated] |  | |

### `edition_info`

**Zweck:** Allgemeine Auskünfte je Edition (F9.1): Öffnungszeiten, Einlass, Aufbau, Adresse. Text, kein Zeitstempel — eine Auskunft, kein Termin.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** delete_edition_info(), upsert_edition_info() · löscht Zeilen: delete_edition_info()

**Seiten (lesen/schreiben):** /admin/ansprechpartner

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `edition_id` | uuid | technisch | upsert_edition_info() | /admin/ansprechpartner | |
| `key` | text | fachlich | upsert_edition_info() | /admin/ansprechpartner | |
| `audience` | text[] | fachlich | upsert_edition_info() | /admin/ansprechpartner | |
| `label_de` | text | fachlich | upsert_edition_info() | /admin/ansprechpartner | |
| `label_en` | text | fachlich | upsert_edition_info() | /admin/ansprechpartner | |
| `value_de` | text | fachlich | upsert_edition_info() | /admin/ansprechpartner | |
| `value_en` | text | fachlich | upsert_edition_info() | /admin/ansprechpartner | |
| `sort_order` | integer | fachlich | upsert_edition_info() | /admin/ansprechpartner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch |  |  | |

### `vocab_term`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260721160705_seed_vocab.sql), Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908175758_v2_service_role_grants_session_context.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260911120247_v3_vocab_org_type_foundation.sql), Migration/Seed (20260911121546_v3_vocab_org_type_service.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914094832_v4_produktion.sql), Migration/Seed (20260914095053_v4_wissensbasis.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260915113046_v5_ansprechpartner_und_zeiten.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260915115505_v5_catering.sql), Migration/Seed (20260915115707_v5_speaker_anreise.sql), Migration/Seed (20260915115751_v5_speaker_zusage_anrede.sql), set_updated_at() [Trigger trg_vocab_term_updated]

**Trigger auf dieser Tabelle:** trg_vocab_term_updated → set_updated_at()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** /admin/vokabular

**Seiten (lesen/schreiben):** /admin, /admin/anreise, /admin/ansprechpartner, /admin/bewerbungen, /admin/bewerbungen/[id], /admin/catering, /admin/hospitality, /admin/partner/kontingente, /admin/partner/produkte, /admin/personen, /admin/personen/[id], /admin/reisekosten, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/speaker/[id], /admin/team, /admin/vokabular, /admin/volunteers, /admin/volunteers/schichten, /admin/wiki, /checkin, /hackathon, /hackathon/schedule, /meine, /onboarding, /partner, /partner/bewerber, /partner/bewerber/[id], /partner/shop, /partner/tickets, /produktion/catering, /produktion/dateien, /profil, /programm, /speaker, /speaker-leads, /speaker-leads/anreise, /speaker-leads/einreichungen, /speaker/reisekosten, /speaker/session, /speaker/tickets, /speaker/travel, /volunteers, /volunteers/schichten, /volunteers/team

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `vocabulary` | text | fachlich | Migration/Seed (20260721160705_seed_vocab.sql), Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908175758_v2_service_role_grants_session_context.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260911120247_v3_vocab_org_type_foundation.sql), Migration/Seed (20260911121546_v3_vocab_org_type_service.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914094832_v4_produktion.sql), Migration/Seed (20260914095053_v4_wissensbasis.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260915113046_v5_ansprechpartner_und_zeiten.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260915115505_v5_catering.sql), Migration/Seed (20260915115707_v5_speaker_anreise.sql), Migration/Seed (20260915115751_v5_speaker_zusage_anrede.sql) |  | |
| `key` | text | fachlich | Migration/Seed (20260721160705_seed_vocab.sql), Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908175758_v2_service_role_grants_session_context.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260911120247_v3_vocab_org_type_foundation.sql), Migration/Seed (20260911121546_v3_vocab_org_type_service.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914094832_v4_produktion.sql), Migration/Seed (20260914095053_v4_wissensbasis.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260915113046_v5_ansprechpartner_und_zeiten.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260915115505_v5_catering.sql), Migration/Seed (20260915115707_v5_speaker_anreise.sql), Migration/Seed (20260915115751_v5_speaker_zusage_anrede.sql) |  | |
| `label_de` | text | fachlich | Migration/Seed (20260721160705_seed_vocab.sql), Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908175758_v2_service_role_grants_session_context.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260911120247_v3_vocab_org_type_foundation.sql), Migration/Seed (20260911121546_v3_vocab_org_type_service.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914094832_v4_produktion.sql), Migration/Seed (20260914095053_v4_wissensbasis.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260915113046_v5_ansprechpartner_und_zeiten.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260915115505_v5_catering.sql), Migration/Seed (20260915115707_v5_speaker_anreise.sql), Migration/Seed (20260915115751_v5_speaker_zusage_anrede.sql) |  | |
| `label_en` | text | fachlich | Migration/Seed (20260721160705_seed_vocab.sql), Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908175758_v2_service_role_grants_session_context.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260911120247_v3_vocab_org_type_foundation.sql), Migration/Seed (20260911121546_v3_vocab_org_type_service.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914094832_v4_produktion.sql), Migration/Seed (20260914095053_v4_wissensbasis.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260915113046_v5_ansprechpartner_und_zeiten.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260915115505_v5_catering.sql), Migration/Seed (20260915115707_v5_speaker_anreise.sql), Migration/Seed (20260915115751_v5_speaker_zusage_anrede.sql) |  | |
| `sort_order` | integer | fachlich | Migration/Seed (20260721160705_seed_vocab.sql), Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908175758_v2_service_role_grants_session_context.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260911120247_v3_vocab_org_type_foundation.sql), Migration/Seed (20260911121546_v3_vocab_org_type_service.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914094832_v4_produktion.sql), Migration/Seed (20260914095053_v4_wissensbasis.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260915113046_v5_ansprechpartner_und_zeiten.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260915115505_v5_catering.sql), Migration/Seed (20260915115707_v5_speaker_anreise.sql), Migration/Seed (20260915115751_v5_speaker_zusage_anrede.sql) |  | |
| `active` | boolean | fachlich | Migration/Seed (20260911120247_v3_vocab_org_type_foundation.sql), Migration/Seed (20260911121546_v3_vocab_org_type_service.sql), Migration/Seed (20260914094832_v4_produktion.sql), Migration/Seed (20260914095053_v4_wissensbasis.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260915113046_v5_ansprechpartner_und_zeiten.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260915115505_v5_catering.sql), Migration/Seed (20260915115707_v5_speaker_anreise.sql), Migration/Seed (20260915115751_v5_speaker_zusage_anrede.sql) |  | |
| `parent_vocabulary` | text | fachlich | Migration/Seed (20260721160705_seed_vocab.sql) |  | |
| `parent_key` | text | fachlich | Migration/Seed (20260721160705_seed_vocab.sql) |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_vocab_term_updated] |  | |

### `external_ref`

**Zweck:** Fremd-IDs je Portal-Objekt (ein System ↔ ein Objekt ↔ eine ID).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** record_shop_invoice(), set_event_app_ref(), set_external_ref(), set_updated_at() [Trigger trg_external_ref_updated]

**Trigger auf dieser Tabelle:** trg_external_ref_updated → set_updated_at()

**Seiten (lesen/schreiben):** API-Route: /api/admin/sanity/partner-logos, API-Route: /api/admin/sevdesk/shop-invoices, API-Route: /api/admin/swapcard/exhibitors

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `system` | text | fachlich | record_shop_invoice(), set_event_app_ref(), set_external_ref() |  | |
| `object_type` | text | fachlich | record_shop_invoice(), set_event_app_ref(), set_external_ref() |  | |
| `object_id` | uuid | technisch | record_shop_invoice(), set_event_app_ref(), set_external_ref() |  | |
| `external_id` | text | technisch | record_shop_invoice(), set_event_app_ref(), set_external_ref() |  | |
| `meta` | jsonb | fachlich | record_shop_invoice(), set_event_app_ref(), set_external_ref() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_external_ref_updated] |  | |

## Befunde (Vorbereitung Walkthrough)

_Handschriftlich ergänzt nach Lauf von `node scripts/gen-feld-matrix.mjs`; nicht Teil der generierten Abschnitte oben._

### (a) Tabellen ohne erkennbaren Schreibweg über eine Portalseite

**Ganz ohne jeden Schreibweg** (auch keine Migration/Seed, kein Direktzugriff — in `supabase/migrations/*.sql` kein `insert`/`update`/`delete` gefunden):
`person_eligibility`, `person_merge_log`, `staff_user`, `track`, `programme_backlog`. Für `staff_user` passt das zur Entscheidung 0107 (entscheidet nichts mehr); `track` und `programme_backlog` wirken wie angelegte, aber noch nicht angeschlossene Struktur.

**Schreibweg vorhanden (Funktion/Trigger/Migration), aber nie über eine Portalseite** — deckt sich weitgehend mit der eigenen Einschätzung „wahrscheinlich fehlend" in Plan 5.5:
- Programm-Grundgerüst (Editionen/Tage/Bühnen/Slots anlegen, dort auch als fehlend vermerkt): `event_day`, `stage`, `stage_day`, `slot`, `slot_history`, `session_speaker`, `session_question`, `question_catalog`, `regie_cue`
- Partner/Messeshop-Nebentabellen: `org_product`, `org_step`, `partner_deal`, `stock_ledger`
- Tickets/Volunteers (teils bewusst sicherheitskritisch, kein Portal-Edit erwartet): `ticket_secret`, `ticket_type_map`, `volunteer_coupon_revocation`, `suppression`
- Kommunikation/Stammdaten: `mail_log` (Log, kein Editierbedarf erwartet), `mail_template` (in Plan 5.5 explizit als fehlend vermerkt), `edition_file`, `external_ref` (Systemabgleich, nur API-Routen)

### (b) Fachliche Spalten ohne Fundstelle im Code (Bezeichner kommt in app/lib/components nicht vor)

`audit_log`: ip_hash · `checkin`: scan_day · `consent_record`: ip_hash, user_agent · `deliverable`: asset_ids · `event_day`: doors_open · `hack_team`: note_internal · `mail_log`: related_type · `person`: linkedin_normalized, cv_url, invite_code, is_ambassador, engagement_score, source_first · `person_eligibility`: eligibility_u35 · `person_merge_log`: actor · `registration`: external_source, external_ids · `session`: eligibility_rule · `slot`: source_ref, internal_title · `stage`: partner_slot_quota · `stage_day`: open_from, open_to · `stock_ledger`: comment · `ticket`: buyer_email, addons, price_cents, extra_fields · `ticket_type_map`: vivenu_ticket_name, swapcard_group, rights · `vocab_term`: parent_vocabulary

(33 Spalten in 19 Tabellen. Heuristik: Spaltenname als Bezeichner nirgends in `app/**`, `lib/**`, `components/**` — erfasst keine dynamische Feldzugriffe wie `row[key]`.)

### (c) Kandidaten für Doppelungen (nur benannt, nicht bewertet)

Aus Plan 5.4 (Prüffragen, hier als Kandidaten übernommen):
- `speaker_profile.job_title`/`organization_name` ↔ `person.employer_name`/`occupation_status` (Jobtitel/Organisation)
- `deadline` ↔ Fälligkeiten in `deliverable`
- `staff_user` ↔ Rolle `admin` in `role_assignment`
- `partner_deal` (HubSpot-Spiegel) ↔ `org_product` (gebuchte Leistungen)
- `registration` ↔ `ticket`
- `edition_info` ↔ `kb_article`
- `org_edition.sponsoring_level` (Freitext) ↔ Vokabular-Schlüssel (bewusst beides, 0097)
- `edition_contact` ↔ `person`/`role_assignment` (bewusst getrennt: dienstliche Kontaktdaten)

Neu beim Matrixbau aufgefallen:
- `organization.description` ↔ `org_edition.description_de`/`description_en` — `update_partner_onboarding()` befüllt beide aus demselben Eingabefeld `p_data->>'description_de'`
- `person.photo_url` (direkte URL) ↔ `speaker_profile.photo_asset_id` (Verweis auf `speaker_asset`) — zwei verschiedene Speichermuster für „Profilfoto"

### (d) Entscheidungen Konrad vor dem Walkthrough (17.09.)
- Jobtitel/Organisation: `person` = aktuell, `speaker_profile` = Stand der Edition (Snapshot). Bleibt so, mit Vorbelegung aus `person`.
- Partner-Beschreibung: **je Organisation** (`organization.description_de/en`), `org_edition.description_de/en` entfällt (Bestand übernehmen).
- Profilfotos: überall Datei-Ablage mit Rechten; `person.photo_url` wird migriert.
- `staff_user`: **entfernt** (Aufräum-Migration 17.09., `v6_aufraeumen_feldmatrix`), ebenso `scripts/make-staff.mjs`.
