# Feld-Eigentümer-Matrix

> Generiert mit `node scripts/gen-feld-matrix.mjs` aus `docs/schema.md` und dem Code, Stand 2026-10-10. Handkorrekturen nur im Abschnitt „Befunde (Vorbereitung Walkthrough)“ am Ende der Datei — alles davor wird beim naechsten Lauf ueberschrieben.

Leitfrage je Spalte: **fachlich oder technisch?** · **wer schreibt es** (RPC/Trigger/Ingest/Cron) · **wo im Portal pflegbar**. Ziel: Jedes fachliche Feld hat genau einen Pflegeort im Portal (Supabase Studio ist kein Pflegeort — nur Konrad und die Architektur-Session).

## 1. Identität & Zugang

### `person`

**Zweck:** Eine natürliche Person = ein Datensatz. Login-Verknüpfung über auth_user_id.

**Datenschutz-Klasse (Vorschlag):** besonders geschützt (Art. 9)

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260908141744_v2_identity_roles.sql), Migration/Seed (20260910110003_v2_preferred_language_nullable.sql), Migration/Seed (20261009075127_v6_spalten_kontaktschluessel.sql), anonymize_person(), apply_volunteer(), claim_or_create_person(), create_kiosk_account(), create_team_member(), invite_assistant(), luma_sync_registration(), partner_add_speaker(), partner_add_stage_guest(), partner_contact_upsert_internal(), partner_update_speaker(), partner_update_stage_guest(), person_derive_contact_keys() [Trigger trg_person_contact_keys], person_merge_core(), person_tier_on_claim() [Trigger trg_person_tier], purge_diet_data(), set_diet(), set_my_cv(), set_my_photo(), set_person_access(), set_person_salutation(), set_updated_at() [Trigger trg_person_updated], testdaten_person(), unmerge_persons(), update_my_speaker_profile(), update_partner_contact(), update_person_master(), upsert_speaker(), upsert_speaker_contact() · löscht Zeilen: person_merge_core()

**Trigger auf dieser Tabelle:** trg_person_updated → set_updated_at(), trg_person_tier → person_tier_on_claim(), trg_person_login_drops_partner_edit → drop_partner_edit_on_login(), trg_person_vocab_guard → person_vocab_guard(), trg_person_contact_keys → person_derive_contact_keys()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** /onboarding, /profil, lib

**Seiten (lesen/schreiben):** /admin, /admin/partner, /admin/partner/[org], /admin/personen/[id], /admin/personen/dubletten, /admin/speaker, /admin/verwaltung/zugaenge, /events, /onboarding, /partner, /partner/buehne/gaeste, /profil, /speaker, /speaker-leads, /start, /summit, /tickets/bestaetigung, /volunteers, Cron: /api/cron/luma-sync, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `auth_user_id` | uuid | technisch | anonymize_person(), claim_or_create_person(), person_merge_core(), unmerge_persons() | /admin/personen/dubletten, /onboarding, /profil, /start, /summit | |
| `first_name` | text | fachlich | anonymize_person(), create_kiosk_account(), create_team_member(), invite_assistant(), luma_sync_registration(), partner_add_speaker(), partner_add_stage_guest(), partner_contact_upsert_internal(), partner_update_speaker(), partner_update_stage_guest(), testdaten_person(), update_my_speaker_profile(), update_partner_contact(), update_person_master(), upsert_speaker(), upsert_speaker_contact() | /admin/partner, /admin/partner/[org], /admin/personen/[id], /admin/speaker, /admin/verwaltung/zugaenge, /events, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads | |
| `last_name` | text | fachlich | anonymize_person(), create_kiosk_account(), create_team_member(), invite_assistant(), luma_sync_registration(), partner_add_speaker(), partner_add_stage_guest(), partner_contact_upsert_internal(), partner_update_speaker(), partner_update_stage_guest(), testdaten_person(), update_my_speaker_profile(), update_partner_contact(), update_person_master(), upsert_speaker(), upsert_speaker_contact() | /admin/partner, /admin/partner/[org], /admin/personen/[id], /admin/speaker, /admin/verwaltung/zugaenge, /events, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads | |
| `birthdate` | date | fachlich | anonymize_person(), apply_volunteer(), update_person_master() | /admin/personen/[id], /volunteers | |
| `occupation_status` | text | fachlich |  |  | |
| `work_experience` | text | fachlich |  |  | |
| `career_level` | text | fachlich |  |  | |
| `employer_type` | text | fachlich |  |  | |
| `employer_name` | text | fachlich | anonymize_person() |  | |
| `study_field` | text | fachlich |  |  | |
| `study_program` | text | fachlich |  |  | |
| `university` | text | fachlich | anonymize_person() |  | |
| `self_assessment` | text | fachlich | anonymize_person() |  | |
| `linkedin_url` | text | fachlich | anonymize_person(), partner_update_speaker(), update_my_speaker_profile(), update_person_master() | /admin/personen/[id], /partner, /speaker | |
| `linkedin_normalized` | text | fachlich | Migration/Seed (20261009075127_v6_spalten_kontaktschluessel.sql), anonymize_person(), person_derive_contact_keys() [Trigger trg_person_contact_keys] |  | |
| `phone` | text | fachlich | anonymize_person(), update_my_speaker_profile(), update_person_master() | /admin/personen/[id], /speaker | |
| `phone_e164` | text | fachlich | Migration/Seed (20261009075127_v6_spalten_kontaktschluessel.sql), anonymize_person(), person_derive_contact_keys() [Trigger trg_person_contact_keys] |  | |
| `gender` | text | fachlich | anonymize_person(), update_person_master() | /admin/personen/[id] | |
| `nationality` | text | fachlich | anonymize_person(), update_person_master() | /admin/personen/[id] | |
| `country` | text | fachlich | update_person_master() | /admin/personen/[id] | |
| `preferred_language` | text | fachlich | Migration/Seed (20260910110003_v2_preferred_language_nullable.sql), update_my_speaker_profile(), update_person_master(), upsert_speaker() | /admin/personen/[id], /speaker, /speaker-leads | |
| `startup_phase` | text | fachlich |  |  | |
| `invite_code` | text | fachlich | anonymize_person() |  | |
| `is_ambassador` | boolean | fachlich |  |  | |
| `referred_by_person_id` | uuid | technisch | person_merge_core() |  | |
| `engagement_score` | numeric | fachlich |  |  | |
| `source_first` | text | fachlich | claim_or_create_person(), create_kiosk_account(), create_team_member(), invite_assistant(), luma_sync_registration(), partner_contact_upsert_internal(), testdaten_person(), upsert_speaker(), upsert_speaker_contact() | /admin/speaker, /admin/verwaltung/zugaenge, /events, /onboarding, /profil, /speaker, /speaker-leads, /start, /summit | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_person_updated] |  | |
| `title` | text | fachlich | anonymize_person(), partner_update_speaker(), update_my_speaker_profile(), update_person_master(), upsert_speaker() | /admin/personen/[id], /partner, /speaker, /speaker-leads | |
| `city` | text | fachlich | anonymize_person(), update_person_master() | /admin/personen/[id] | |
| `tier` | text | fachlich | Migration/Seed (20260908141744_v2_identity_roles.sql), invite_assistant(), luma_sync_registration(), partner_contact_upsert_internal(), person_tier_on_claim() [Trigger trg_person_tier], unmerge_persons(), upsert_speaker(), upsert_speaker_contact() | /admin/personen/dubletten, /admin/speaker, /events, /speaker, /speaker-leads | |
| `deleted_at` | timestamp with time zone | technisch | anonymize_person() |  | |
| `diet` | text | fachlich | anonymize_person(), purge_diet_data(), set_diet() |  | |
| `diet_note` | text | fachlich | anonymize_person(), purge_diet_data() |  | |
| `salutation_de` | text | fachlich | anonymize_person(), set_person_salutation() | /admin/personen/[id] | |
| `salutation_en` | text | fachlich | anonymize_person(), set_person_salutation() | /admin/personen/[id] | |
| `photo_path` | text | fachlich | anonymize_person(), set_my_photo() | /profil | |
| `job_title` | text | fachlich | anonymize_person() |  | |
| `study_program_label` | text | fachlich | anonymize_person() |  | |
| `job_openness` | text | fachlich |  |  | |
| `function_area` | text | fachlich |  |  | |
| `graduation_year` | smallint | fachlich |  |  | |
| `availability` | text | fachlich |  |  | |
| `mobility` | text | fachlich |  |  | |
| `cv_path` | text | fachlich | anonymize_person(), set_my_cv() | /profil | |
| `access_blocked_at` | timestamp with time zone | technisch | set_person_access() | /admin/verwaltung/zugaenge | |

### `person_email`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** anonymize_person(), claim_or_create_person(), create_kiosk_account(), create_team_member(), invite_assistant(), luma_sync_registration(), manage_person_email(), partner_add_speaker(), partner_add_stage_guest(), partner_contact_upsert_internal(), partner_update_stage_guest(), person_merge_core(), set_primary_email(), set_updated_at() [Trigger trg_person_email_updated], testdaten_person(), unmerge_persons(), update_partner_contact(), upsert_speaker(), upsert_speaker_contact() · löscht Zeilen: anonymize_person(), manage_person_email()

**Trigger auf dieser Tabelle:** trg_person_email_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/partner, /admin/partner/[org], /admin/personen/[id], /admin/personen/dubletten, /admin/speaker, /admin/verwaltung/zugaenge, /events, /onboarding, /partner, /partner/buehne/gaeste, /profil, /speaker, /speaker-leads, /start, /summit, Cron: /api/cron/luma-sync, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id` | uuid | technisch | claim_or_create_person(), create_kiosk_account(), create_team_member(), invite_assistant(), luma_sync_registration(), manage_person_email(), partner_add_speaker(), partner_add_stage_guest(), partner_contact_upsert_internal(), partner_update_stage_guest(), person_merge_core(), testdaten_person(), unmerge_persons(), update_partner_contact(), upsert_speaker(), upsert_speaker_contact() | /admin/partner, /admin/partner/[org], /admin/personen/[id], /admin/personen/dubletten, /admin/speaker, /admin/verwaltung/zugaenge, /events, /onboarding, /partner, /partner/buehne/gaeste, /profil, /speaker, /speaker-leads, /start, /summit | |
| `email` | extensions.citext | fachlich | anonymize_person(), claim_or_create_person(), create_kiosk_account(), create_team_member(), invite_assistant(), luma_sync_registration(), manage_person_email(), partner_add_speaker(), partner_add_stage_guest(), partner_contact_upsert_internal(), partner_update_stage_guest(), testdaten_person(), update_partner_contact(), upsert_speaker(), upsert_speaker_contact() | /admin/partner, /admin/partner/[org], /admin/personen/[id], /admin/speaker, /admin/verwaltung/zugaenge, /events, /onboarding, /partner, /partner/buehne/gaeste, /profil, /speaker, /speaker-leads, /start, /summit | |
| `type` | text | fachlich | manage_person_email() | /admin/personen/[id] | |
| `is_primary` | boolean | fachlich | claim_or_create_person(), create_kiosk_account(), create_team_member(), invite_assistant(), luma_sync_registration(), manage_person_email(), partner_add_speaker(), partner_add_stage_guest(), partner_contact_upsert_internal(), partner_update_stage_guest(), person_merge_core(), set_primary_email(), testdaten_person(), unmerge_persons(), update_partner_contact(), upsert_speaker(), upsert_speaker_contact() | /admin/partner, /admin/partner/[org], /admin/personen/[id], /admin/personen/dubletten, /admin/speaker, /admin/verwaltung/zugaenge, /events, /onboarding, /partner, /partner/buehne/gaeste, /profil, /speaker, /speaker-leads, /start, /summit | |
| `verified` | boolean | fachlich | anonymize_person(), claim_or_create_person(), create_kiosk_account(), create_team_member(), invite_assistant(), luma_sync_registration(), manage_person_email(), partner_add_stage_guest(), partner_contact_upsert_internal(), partner_update_stage_guest(), testdaten_person(), update_partner_contact(), upsert_speaker(), upsert_speaker_contact() | /admin/partner, /admin/partner/[org], /admin/personen/[id], /admin/speaker, /admin/verwaltung/zugaenge, /events, /onboarding, /partner, /partner/buehne/gaeste, /profil, /speaker, /speaker-leads, /start, /summit | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_person_email_updated] |  | |

### `person_acquisition_channel`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** anonymize_person() · löscht Zeilen: anonymize_person()

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

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20261010145421_v6_profil_function_area_liste.sql), anonymize_person() · löscht Zeilen: anonymize_person()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** /benachrichtigungen, /onboarding, /profil

**Seiten (lesen/schreiben):** /admin/personen/[id], /benachrichtigungen, /onboarding, /profil

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `person_id` | uuid | technisch | Migration/Seed (20261010145421_v6_profil_function_area_liste.sql) |  | |
| `vocabulary` | text | fachlich | Migration/Seed (20261010145421_v6_profil_function_area_liste.sql) |  | |
| `term_key` | text | fachlich | Migration/Seed (20261010145421_v6_profil_function_area_liste.sql) |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `person_merge_log`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** anonymize_person(), merge_persons(), unmerge_persons()

**Seiten (lesen/schreiben):** /admin/personen/dubletten

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `surviving_person_id` | uuid | technisch | merge_persons() | /admin/personen/dubletten | |
| `merged_person_id` | uuid | technisch | merge_persons() | /admin/personen/dubletten | |
| `merged_at` | timestamp with time zone | technisch |  |  | |
| `actor` | text | fachlich | merge_persons() | /admin/personen/dubletten | |
| `payload` | jsonb | fachlich | anonymize_person(), merge_persons() | /admin/personen/dubletten | |
| `undone_at` | timestamp with time zone | technisch | unmerge_persons() | /admin/personen/dubletten | |
| `undone_by` | uuid | technisch | unmerge_persons() | /admin/personen/dubletten | |

### `potential_duplicate`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** duplicate_scan(), person_merge_core(), set_updated_at() [Trigger trg_potential_duplicate_updated] · löscht Zeilen: person_merge_core()

**Trigger auf dieser Tabelle:** trg_potential_duplicate_updated → set_updated_at()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** /admin/personen/dubletten

**Seiten (lesen/schreiben):** /admin, /admin/personen/dubletten

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id_a` | uuid | fachlich | duplicate_scan() | /admin/personen/dubletten | |
| `person_id_b` | uuid | fachlich | duplicate_scan() | /admin/personen/dubletten | |
| `score` | numeric | fachlich | duplicate_scan() | /admin/personen/dubletten | |
| `signals` | jsonb | fachlich | duplicate_scan() | /admin/personen/dubletten | |
| `status` | text | fachlich |  |  | |
| `reviewed_by` | uuid | technisch |  |  | |
| `reviewed_at` | timestamp with time zone | technisch |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_potential_duplicate_updated] |  | |

### `consent_record`

**Zweck:** Jede Einwilligung/Widerruf als eigene Zeile (Nachweis). Aktueller Stand: View consent_current.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20261001121437_v6_consent_type_waechter.sql), ac_apply_unsubscribe(), anonymize_person(), apply_to_session(), record_speaker_consent_on_behalf(), release_application_share(), revoke_application_share()

**Trigger auf dieser Tabelle:** trg_consent_record_vocab_guard → consent_record_vocab_guard()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** /benachrichtigungen, /onboarding, /profil, /speaker, /volunteers

**Seiten (lesen/schreiben):** /benachrichtigungen, /meine, /onboarding, /profil, /programm, /speaker, /volunteers

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id` | uuid | technisch | ac_apply_unsubscribe(), apply_to_session(), record_speaker_consent_on_behalf(), release_application_share(), revoke_application_share() | /meine, /programm, /speaker | |
| `consent_type` | text | fachlich | Migration/Seed (20261001121437_v6_consent_type_waechter.sql), ac_apply_unsubscribe(), apply_to_session(), record_speaker_consent_on_behalf(), release_application_share(), revoke_application_share() | /meine, /programm, /speaker | |
| `version` | text | fachlich | ac_apply_unsubscribe(), apply_to_session(), record_speaker_consent_on_behalf(), release_application_share(), revoke_application_share() | /meine, /programm, /speaker | |
| `granted` | boolean | fachlich | ac_apply_unsubscribe(), apply_to_session(), record_speaker_consent_on_behalf(), release_application_share(), revoke_application_share() | /meine, /programm, /speaker | |
| `granted_at` | timestamp with time zone | technisch |  |  | |
| `revoked_at` | timestamp with time zone | technisch |  |  | |
| `source` | text | fachlich | ac_apply_unsubscribe(), apply_to_session(), record_speaker_consent_on_behalf(), release_application_share(), revoke_application_share() | /meine, /programm, /speaker | |
| `user_agent` | text | fachlich | anonymize_person() |  | |
| `meta` | jsonb | fachlich | ac_apply_unsubscribe(), apply_to_session(), record_speaker_consent_on_behalf(), release_application_share(), revoke_application_share() | /meine, /programm, /speaker | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `suppression`

**Zweck:** sha256(lower(email)) gelöschter/gesperrter Adressen. Vor jedem Import und Mailversand prüfen.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** add_suppression(), anonymize_person()

**Seiten (lesen/schreiben):** lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `email_hash` | text | fachlich | add_suppression(), anonymize_person() |  | |
| `reason` | text | fachlich | add_suppression(), anonymize_person() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `registration`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** anonymize_person(), cancel_registration(), luma_sync_registration(), register_for_session(), set_updated_at() [Trigger trg_registration_updated]

**Trigger auf dieser Tabelle:** trg_registration_updated → set_updated_at(), trg_registration_mail → registration_mail_trigger()

**Seiten (lesen/schreiben):** /admin, /admin/personen/[id], /events, /meine, /programm, /summit, Cron: /api/cron/luma-sync

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id` | uuid | technisch | luma_sync_registration(), register_for_session() | /events, /meine, /programm | |
| `event_id` | uuid | technisch | luma_sync_registration(), register_for_session() | /events, /meine, /programm | |
| `status` | text | fachlich | cancel_registration(), luma_sync_registration(), register_for_session() | /events, /meine, /programm | |
| `ticket_type` | text | fachlich |  |  | |
| `source` | text | fachlich | luma_sync_registration(), register_for_session() | /events, /meine, /programm | |
| `external_source` | text | fachlich | luma_sync_registration() | /events | |
| `external_ref` | text | technisch | anonymize_person(), luma_sync_registration() | /events | |
| `external_ids` | jsonb | fachlich | anonymize_person() |  | |
| `registered_at` | timestamp with time zone | technisch | luma_sync_registration(), register_for_session() | /events, /meine, /programm | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_registration_updated] |  | |
| `session_id` | uuid | technisch | register_for_session() | /meine, /programm | |

### `role_assignment`

**Zweck:** Rolle × Scope je Person. Rollen außer admin sind edition-gebunden (edition_id). Schreiben nur service_role.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** anonymize_person(), assign_role(), create_kiosk_account(), ingest_partner_deal(), invite_assistant(), invite_speaker(), partner_add_speaker(), partner_contact_upsert_internal(), remove_assistant(), remove_partner_contact(), revoke_role(), set_updated_at() [Trigger trg_role_assignment_updated], set_volunteer_status(), speaker_access_revoke(), sync_granted_roles(), upsert_speaker(), upsert_speaker_contact() · löscht Zeilen: anonymize_person(), remove_partner_contact(), set_volunteer_status(), sync_granted_roles()

**Trigger auf dieser Tabelle:** trg_role_assignment_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/partner, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/verwaltung/zugaenge, /admin/volunteers, /partner, /speaker, /speaker-leads, Cron: /api/cron/hubspot-sweep, Webhook: /api/webhooks/hubspot

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id` | uuid | technisch | assign_role(), create_kiosk_account(), ingest_partner_deal(), invite_assistant(), invite_speaker(), partner_add_speaker(), partner_contact_upsert_internal(), set_volunteer_status(), sync_granted_roles(), upsert_speaker(), upsert_speaker_contact() | /admin/partner, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/verwaltung/zugaenge, /admin/volunteers, /partner, /speaker, /speaker-leads | |
| `role` | text | fachlich | assign_role(), create_kiosk_account(), ingest_partner_deal(), invite_assistant(), invite_speaker(), partner_add_speaker(), partner_contact_upsert_internal(), set_volunteer_status(), sync_granted_roles(), upsert_speaker(), upsert_speaker_contact() | /admin/partner, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/verwaltung/zugaenge, /admin/volunteers, /partner, /speaker, /speaker-leads | |
| `scope_type` | text | fachlich | assign_role(), create_kiosk_account(), ingest_partner_deal(), invite_assistant(), invite_speaker(), partner_add_speaker(), partner_contact_upsert_internal(), set_volunteer_status(), sync_granted_roles(), upsert_speaker(), upsert_speaker_contact() | /admin/partner, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/verwaltung/zugaenge, /admin/volunteers, /partner, /speaker, /speaker-leads | |
| `scope_id` | uuid | technisch | assign_role(), ingest_partner_deal(), partner_contact_upsert_internal(), sync_granted_roles() | /admin/partner, /admin/rollen, /admin/speaker-leads, /admin/verwaltung/zugaenge | |
| `edition_id` | uuid | technisch | assign_role(), create_kiosk_account(), ingest_partner_deal(), invite_assistant(), invite_speaker(), partner_add_speaker(), partner_contact_upsert_internal(), set_volunteer_status(), sync_granted_roles(), upsert_speaker(), upsert_speaker_contact() | /admin/partner, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/verwaltung/zugaenge, /admin/volunteers, /partner, /speaker, /speaker-leads | |
| `portal` | text | fachlich | assign_role() | /admin/partner, /admin/rollen, /admin/speaker-leads, /admin/verwaltung/zugaenge | |
| `valid_from` | timestamp with time zone | fachlich | assign_role(), create_kiosk_account(), set_volunteer_status() | /admin/partner, /admin/rollen, /admin/speaker-leads, /admin/verwaltung/zugaenge, /admin/volunteers | |
| `valid_to` | timestamp with time zone | fachlich | assign_role(), create_kiosk_account(), ingest_partner_deal(), invite_assistant(), partner_contact_upsert_internal(), remove_assistant(), revoke_role(), set_volunteer_status(), speaker_access_revoke(), sync_granted_roles() | /admin/partner, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/verwaltung/zugaenge, /admin/volunteers, /speaker | |
| `granted_by` | uuid | technisch | assign_role(), create_kiosk_account(), invite_assistant(), invite_speaker(), partner_add_speaker(), partner_contact_upsert_internal(), set_volunteer_status(), upsert_speaker(), upsert_speaker_contact() | /admin/partner, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/verwaltung/zugaenge, /admin/volunteers, /partner, /speaker, /speaker-leads | |
| `note` | text | fachlich | assign_role(), create_kiosk_account(), ingest_partner_deal(), invite_assistant(), invite_speaker(), partner_add_speaker(), partner_contact_upsert_internal(), revoke_role(), set_volunteer_status(), sync_granted_roles(), upsert_speaker(), upsert_speaker_contact() | /admin/partner, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/verwaltung/zugaenge, /admin/volunteers, /partner, /speaker, /speaker-leads | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_role_assignment_updated] |  | |

### `audit_log`

**Zweck:** Admin-/Manager-Aktionen, Partner-Zugriffe auf Bewerberdaten, Exporte. Nur service_role liest.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** log_audit(), run_application_housekeeping(), run_shop_finalization(), send_partner_reminders(), send_presentation_reminders(), set_expense_integration(), shop_quotes_housekeeping(), speaker_audit_bereinigen()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** /admin/mail, /admin/personen/dubletten, API-Route: /api/admin/hubspot/archive-products, API-Route: /api/admin/partner/documents/sync, API-Route: /api/admin/products/sync, API-Route: /api/admin/swapcard/sponsors

**Seiten (lesen/schreiben):** /admin, /admin/mail, /admin/personen/dubletten, API-Route: /api/admin/hubspot/archive-products, API-Route: /api/admin/partner/documents/sync, API-Route: /api/admin/products/sync, API-Route: /api/admin/swapcard/sponsors, Cron: /api/cron/mail, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | bigint | technisch |  |  | |
| `actor_person_id` | uuid | technisch | log_audit(), set_expense_integration() | /admin | |
| `actor_auth_uid` | uuid | fachlich | log_audit(), set_expense_integration() | /admin | |
| `action` | text | fachlich | log_audit(), run_application_housekeeping(), run_shop_finalization(), send_partner_reminders(), send_presentation_reminders(), set_expense_integration(), shop_quotes_housekeeping() | /admin | |
| `object_type` | text | fachlich | log_audit(), run_application_housekeeping(), run_shop_finalization(), send_partner_reminders(), send_presentation_reminders(), set_expense_integration(), shop_quotes_housekeeping() | /admin | |
| `object_id` | text | technisch | log_audit(), run_application_housekeeping(), run_shop_finalization(), send_partner_reminders(), send_presentation_reminders(), set_expense_integration(), shop_quotes_housekeeping() | /admin | |
| `before` | jsonb | fachlich | log_audit(), speaker_audit_bereinigen() |  | |
| `after` | jsonb | fachlich | log_audit(), run_application_housekeeping(), run_shop_finalization(), send_partner_reminders(), send_presentation_reminders(), set_expense_integration(), shop_quotes_housekeeping(), speaker_audit_bereinigen() | /admin | |
| `created_at` | timestamp with time zone | technisch |  |  | |

## 2. Edition & Programm

### `event`

**Zweck:** Format/Termin (Summit, Hackathon, Side-Event, Community). is_edition = Klammer wie FLS27-Woche; Kinder verweisen über edition_id.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), luma_sync_event(), set_edition_hubspot(), set_edition_swapcard(), set_edition_vivenu(), set_edition_volunteer_undershop(), set_hackathon_info(), set_updated_at() [Trigger trg_event_updated]

**Trigger auf dieser Tabelle:** trg_event_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin, /admin/bewerbungen/[id], /admin/bewerbungen/sessions, /admin/catering, /admin/edition, /admin/fotos, /admin/fristen, /admin/grafiken, /admin/grafiken/meet-us-at, /admin/hackathon, /admin/hospitality, /admin/medien, /admin/partner, /admin/personen, /admin/produktion, /admin/rollen, /admin/side-events, /admin/speaker-leads, /admin/speaker/[id], /admin/speaker/aufgaben, /admin/speaker/export, /admin/speaker/verlauf, /admin/technik, /admin/technik/praesentationen, /admin/verwaltung/zugaenge, /admin/volunteers/fristen, /admin/volunteers/schichten, /admin/wiki, /events, /hackathon/schedule, /meine, /partner/media/grafik, /programm, /speaker, /speaker-leads, /speaker-leads/praesentationen, /speaker/travel, /volunteers, API-Route: /api/admin/sevdesk/shop-invoices, API-Route: /api/admin/swapcard/speakers, API-Route: /api/speaker/kalender, API-Route: /api/wiki/frage, Cron: /api/cron/luma-sync, Cron: /api/cron/volunteer-tickets

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `name` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), luma_sync_event() | /events | |
| `format_tag` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), luma_sync_event() | /events | |
| `start_date` | date | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), luma_sync_event(), set_hackathon_info() | /admin/hackathon, /events | |
| `end_date` | date | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), luma_sync_event(), set_hackathon_info() | /admin/hackathon, /events | |
| `parent_event_id` | uuid | technisch |  |  | |
| `location` | text | fachlich | luma_sync_event(), set_hackathon_info() | /admin/hackathon, /events | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_hackathon_info(), set_updated_at() [Trigger trg_event_updated] | /admin/hackathon | |
| `slug` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `is_edition` | boolean | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), luma_sync_event() | /events | |
| `edition_id` | uuid | technisch | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql) |  | |
| `timezone` | text | fachlich | luma_sync_event() | /events | |
| `venue` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), set_hackathon_info() | /admin/hackathon | |
| `status` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), luma_sync_event() | /events | |
| `hubspot_pipeline_id` | text | technisch | set_edition_hubspot() | /admin/partner | |
| `hubspot_onboarding_stage_id` | text | technisch | set_edition_hubspot() | /admin/partner | |
| `vivenu_event_id` | text | technisch | set_edition_vivenu() | /admin/partner | |
| `swapcard_event_id` | text | technisch | set_edition_swapcard() | /admin/partner | |
| `hubspot_done_stage_id` | text | technisch | set_edition_hubspot() | /admin/partner | |
| `vivenu_volunteer_undershop_id` | text | technisch | set_edition_volunteer_undershop() |  | |
| `start_time` | time without time zone | fachlich | set_hackathon_info() | /admin/hackathon | |
| `end_time` | time without time zone | fachlich | set_hackathon_info() | /admin/hackathon | |
| `schedule_note_de` | text | fachlich | set_hackathon_info() | /admin/hackathon | |
| `schedule_note_en` | text | fachlich | set_hackathon_info() | /admin/hackathon | |

### `event_day`

**Zweck:** Veranstaltungstag eines Events (Einlass, Programmbeginn/-ende).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908194632_v2_board_realtime_questions.sql), delete_event_day(), set_updated_at() [Trigger trg_event_day_updated], upsert_event_day() · löscht Zeilen: delete_event_day()

**Trigger auf dieser Tabelle:** trg_event_day_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/edition, /admin/partner/staende, /admin/produktion, /admin/programm, /admin/programm/tabelle, /partner, /partner/buehne, /partner/buehne/speaker, /partner/buehne/tabelle, /regie/druck, /speaker, /speaker-leads/board, /speaker-leads/board/tabelle, /speaker-leads/regie, /speaker/travel, API-Route: /api/speaker/kalender, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `event_id` | uuid | technisch | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), upsert_event_day() | /admin/edition | |
| `day_date` | date | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), upsert_event_day() | /admin/edition | |
| `label_de` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), upsert_event_day() | /admin/edition | |
| `label_en` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), upsert_event_day() | /admin/edition | |
| `doors_open` | time without time zone | fachlich | Migration/Seed (20260908194632_v2_board_realtime_questions.sql), upsert_event_day() | /admin/edition | |
| `programme_start` | time without time zone | fachlich | Migration/Seed (20260908194632_v2_board_realtime_questions.sql), upsert_event_day() | /admin/edition | |
| `programme_end` | time without time zone | fachlich | Migration/Seed (20260908194632_v2_board_realtime_questions.sql), upsert_event_day() | /admin/edition | |
| `sort_order` | integer | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), upsert_event_day() | /admin/edition | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_event_day_updated] |  | |

### `stage`

**Zweck:** Bühne oder Raum eines Events. Parameter (Wechselzeit, Standarddauer, Kontingent) steuern das Programm-Board.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20261008093516_v6_buehnen_stammdaten.sql), Migration/Seed (20261008134737_v6_hauptbuehnen_2027.sql), delete_stage(), set_updated_at() [Trigger trg_stage_updated], upsert_stage() · löscht Zeilen: delete_stage()

**Trigger auf dieser Tabelle:** trg_stage_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/edition, /admin/produktion, /admin/programm, /admin/programm/tabelle, /admin/rollen, /admin/speaker-leads, /admin/speaker/[id], /partner, /partner/buehne, /partner/buehne/speaker, /partner/buehne/tabelle, /partner/talk, /regie/druck, /speaker-leads, /speaker-leads/board, /speaker-leads/board/tabelle, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `event_id` | uuid | technisch | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20261008134737_v6_hauptbuehnen_2027.sql), upsert_stage() | /admin/edition | |
| `name` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20261008134737_v6_hauptbuehnen_2027.sql), upsert_stage() | /admin/edition | |
| `slug` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20261008134737_v6_hauptbuehnen_2027.sql), upsert_stage() | /admin/edition | |
| `type` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20261008093516_v6_buehnen_stammdaten.sql), Migration/Seed (20261008134737_v6_hauptbuehnen_2027.sql), upsert_stage() | /admin/edition | |
| `room` | text | fachlich | upsert_stage() | /admin/edition | |
| `capacity` | integer | fachlich | upsert_stage() | /admin/edition | |
| `partner_org_id` | uuid | technisch | upsert_stage() | /admin/edition | |
| `stage_lead_person_id` | uuid | technisch | upsert_stage() | /admin/edition | |
| `changeover_min` | integer | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), upsert_stage() | /admin/edition | |
| `default_duration_min` | integer | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), upsert_stage() | /admin/edition | |
| `partner_slot_quota` | integer | fachlich | upsert_stage() | /admin/edition | |
| `sort_order` | integer | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20261008134737_v6_hauptbuehnen_2027.sql), upsert_stage() | /admin/edition | |
| `active` | boolean | fachlich | Migration/Seed (20261008134737_v6_hauptbuehnen_2027.sql), upsert_stage() | /admin/edition | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_stage_updated] |  | |
| `valid_days` | date[] | fachlich | upsert_stage() | /admin/edition | |
| `kind` | text | fachlich |  |  | |

### `stage_day`

**Zweck:** Bühne × Tag: Öffnungszeiten und Slot-Kontingent (allgemeine Slot-Logik, Antwort 74).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908194632_v2_board_realtime_questions.sql), set_updated_at() [Trigger trg_stage_day_updated], upsert_stage_day()

**Trigger auf dieser Tabelle:** trg_stage_day_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/edition, /admin/programm, /admin/rollen, /partner/buehne, /speaker-leads/board

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `stage_id` | uuid | technisch | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), upsert_stage_day() | /admin/edition | |
| `event_day_id` | uuid | technisch | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), upsert_stage_day() | /admin/edition | |
| `open_from` | time without time zone | fachlich | Migration/Seed (20260908194632_v2_board_realtime_questions.sql), upsert_stage_day() | /admin/edition | |
| `open_to` | time without time zone | fachlich | Migration/Seed (20260908194632_v2_board_realtime_questions.sql), upsert_stage_day() | /admin/edition | |
| `slot_quota` | integer | fachlich | upsert_stage_day() | /admin/edition | |
| `notes` | text | fachlich | upsert_stage_day() | /admin/edition | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_stage_day_updated] |  | |

### `track`

**Zweck:** Thematischer Track (Swapcard-Track).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** delete_track(), upsert_track() · löscht Zeilen: delete_track()

**Seiten (lesen/schreiben):** /admin/edition

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `event_id` | uuid | technisch | upsert_track() | /admin/edition | |
| `name_de` | text | fachlich | upsert_track() | /admin/edition | |
| `name_en` | text | fachlich | upsert_track() | /admin/edition | |
| `slug` | text | fachlich | upsert_track() | /admin/edition | |
| `sort_order` | integer | fachlich | upsert_track() | /admin/edition | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `slot`

**Zweck:** Zeitfenster auf einer Bühne. Genau eine Session kann darauf liegen. Farbe im Board = status.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** create_slot(), delete_slot(), move_slot(), partner_create_session(), partner_delete_session(), partner_update_session(), publish_session(), release_partner_session(), set_slot_status(), set_updated_at() [Trigger trg_slot_updated] · löscht Zeilen: delete_slot(), partner_delete_session()

**Trigger auf dieser Tabelle:** trg_slot_updated → set_updated_at(), trg_slot_consistency → slot_consistency_check(), trg_slot_board_notify → programme_board_notify(), trg_slot_session_change_mail → slot_session_change_mail()

**Seiten (lesen/schreiben):** /admin/edition, /admin/partner, /admin/rollen, /partner, /partner/buehne

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `stage_id` | uuid | technisch | create_slot(), move_slot(), partner_create_session() | /admin/edition, /partner, /partner/buehne | |
| `event_day_id` | uuid | technisch | create_slot(), move_slot(), partner_create_session() | /admin/edition, /partner, /partner/buehne | |
| `start_at` | timestamp with time zone | technisch | create_slot(), move_slot(), partner_create_session() | /admin/edition, /partner, /partner/buehne | |
| `end_at` | timestamp with time zone | technisch | create_slot(), move_slot(), partner_create_session() | /admin/edition, /partner, /partner/buehne | |
| `slot_type` | text | fachlich | create_slot(), partner_create_session() | /admin/edition, /partner, /partner/buehne | |
| `status` | text | fachlich | partner_create_session(), partner_update_session(), publish_session(), release_partner_session(), set_slot_status() | /admin/edition, /admin/partner, /partner, /partner/buehne | |
| `sort_order` | integer | fachlich |  |  | |
| `source_ref` | text | fachlich | create_slot(), partner_create_session() | /admin/edition, /partner, /partner/buehne | |
| `responsible_person_id` | uuid | technisch |  |  | |
| `internal_title` | text | fachlich |  |  | |
| `internal_notes` | text | fachlich |  |  | |
| `created_by` | uuid | technisch | create_slot(), partner_create_session() | /admin/edition, /partner, /partner/buehne | |
| `updated_by` | uuid | technisch | create_slot(), move_slot(), publish_session(), set_slot_status() | /admin/edition, /partner/buehne | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_slot_updated] |  | |

### `slot_history`

**Zweck:** Änderungslog des Programm-Boards (Verschiebungen nach Veröffentlichung sichtbar).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** attach_session_to_slot(), create_slot(), detach_session(), move_slot(), set_slot_status()

**Seiten (lesen/schreiben):** /admin/edition, /partner/buehne

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | bigint | technisch |  |  | |
| `slot_id` | uuid | technisch | attach_session_to_slot(), create_slot(), detach_session(), move_slot(), set_slot_status() | /admin/edition, /partner/buehne | |
| `changed_by` | uuid | technisch | attach_session_to_slot(), create_slot(), detach_session(), move_slot(), set_slot_status() | /admin/edition, /partner/buehne | |
| `changed_at` | timestamp with time zone | technisch |  |  | |
| `action` | text | fachlich | attach_session_to_slot(), create_slot(), detach_session(), move_slot(), set_slot_status() | /admin/edition, /partner/buehne | |
| `before` | jsonb | fachlich | detach_session(), move_slot(), set_slot_status() | /admin/edition, /partner/buehne | |
| `after` | jsonb | fachlich | attach_session_to_slot(), create_slot(), move_slot(), set_slot_status() | /admin/edition, /partner/buehne | |
| `reason` | text | fachlich | move_slot() | /admin/edition, /partner/buehne | |

### `session`

**Zweck:** Programmpunkt (öffentliche Felder für App/Website/Swapcard). Interne Regie-Werte liegen in regie_cue (Welle 4).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260921115330_v6_formate_schema.sql), Migration/Seed (20260923111840_v6_technik_neu_geschnitten.sql), Migration/Seed (20260924194015_v6_eine_sprache.sql), approve_session_content(), attach_session_to_slot(), create_slot(), detach_session(), matching_career_level_entfernen(), partner_create_session(), partner_delete_session(), partner_request_publish(), partner_update_session(), partner_withdraw_publish(), publish_session(), release_partner_session(), session_publish_check() [Trigger trg_session_publish], set_session_owner(), set_session_partner(), set_updated_at() [Trigger trg_session_updated], unpublish_session(), update_session_tech(), upsert_session()

**Trigger auf dieser Tabelle:** trg_session_updated → set_updated_at(), trg_session_publish → session_publish_check(), trg_session_board_notify → programme_board_notify(), trg_session_change_mail → session_change_mail()

**Seiten (lesen/schreiben):** /admin/edition, /admin/partner, /partner, /partner/buehne, /partner/buehne/tabelle, /speaker-leads, /speaker/session, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `event_id` | uuid | technisch | partner_create_session(), upsert_session() | /admin/edition, /partner, /partner/buehne | |
| `slot_id` | uuid | technisch | attach_session_to_slot(), create_slot(), detach_session(), partner_create_session() | /admin/edition, /partner, /partner/buehne | |
| `format` | text | fachlich | partner_create_session(), upsert_session() | /admin/edition, /partner, /partner/buehne | |
| `title_de` | text | fachlich | approve_session_content(), partner_create_session(), partner_update_session(), session_publish_check() [Trigger trg_session_publish], upsert_session() | /admin/edition, /admin/partner, /partner, /partner/buehne, /speaker-leads | |
| `title_en` | text | fachlich | approve_session_content(), partner_update_session(), session_publish_check() [Trigger trg_session_publish], upsert_session() | /admin/edition, /admin/partner, /partner, /partner/buehne, /speaker-leads | |
| `description_de` | text | fachlich | approve_session_content(), partner_update_session(), session_publish_check() [Trigger trg_session_publish], upsert_session() | /admin/edition, /admin/partner, /partner, /partner/buehne, /speaker-leads | |
| `description_en` | text | fachlich | approve_session_content(), partner_update_session(), session_publish_check() [Trigger trg_session_publish], upsert_session() | /admin/edition, /admin/partner, /partner, /partner/buehne, /speaker-leads | |
| `language` | text | fachlich | Migration/Seed (20260924194015_v6_eine_sprache.sql), approve_session_content(), partner_create_session(), partner_update_session(), upsert_session() | /admin/edition, /admin/partner, /partner, /partner/buehne, /speaker-leads | |
| `access_mode` | text | fachlich | partner_create_session(), upsert_session() | /admin/edition, /partner, /partner/buehne | |
| `eligibility_rule` | jsonb | fachlich | upsert_session() | /admin/edition, /partner/buehne | |
| `capacity` | integer | fachlich | partner_create_session(), upsert_session() | /admin/edition, /partner, /partner/buehne | |
| `ticket_required` | boolean | fachlich | upsert_session() | /admin/edition, /partner/buehne | |
| `application_deadline` | timestamp with time zone | fachlich | upsert_session() | /admin/edition, /partner/buehne | |
| `confirm_by_hours` | integer | fachlich | upsert_session() | /admin/edition, /partner/buehne | |
| `host_org_id` | uuid | technisch | partner_create_session(), upsert_session() | /admin/edition, /partner, /partner/buehne | |
| `track_id` | uuid | technisch | upsert_session() | /admin/edition, /partner/buehne | |
| `moderation_person_id` | uuid | technisch | upsert_session() | /admin/edition, /partner/buehne | |
| `publish_status` | text | fachlich | partner_create_session(), partner_delete_session(), partner_request_publish(), partner_update_session(), partner_withdraw_publish(), publish_session(), release_partner_session(), session_publish_check() [Trigger trg_session_publish], unpublish_session() | /admin/edition, /admin/partner, /partner, /partner/buehne | |
| `tags` | text[] | fachlich | upsert_session() | /admin/edition, /partner/buehne | |
| `swapcard_id` | text | technisch |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_session_updated], update_session_tech() | /speaker/session | |
| `created_by` | uuid | technisch | partner_create_session(), upsert_session() | /admin/edition, /partner, /partner/buehne | |
| `updated_by` | uuid | technisch | approve_session_content(), attach_session_to_slot(), detach_session(), partner_create_session(), partner_delete_session(), partner_request_publish(), partner_update_session(), partner_withdraw_publish(), publish_session(), release_partner_session(), set_session_partner(), unpublish_session(), update_session_tech(), upsert_session() | /admin/edition, /admin/partner, /partner, /partner/buehne, /speaker-leads, /speaker/session | |
| `tech` | jsonb | fachlich | Migration/Seed (20260923111840_v6_technik_neu_geschnitten.sql), update_session_tech() | /speaker/session | |
| `partner_org_id` | uuid | technisch | Migration/Seed (20260921115330_v6_formate_schema.sql), partner_create_session(), set_session_partner() | /admin/edition, /partner, /partner/buehne | |
| `format_details` | jsonb | fachlich | matching_career_level_entfernen(), partner_create_session(), partner_update_session() | /admin/partner, /partner | |
| `owner_person_id` | uuid | technisch | set_session_owner() | /admin/edition, /partner/buehne | |

### `session_speaker`

**Zweck:** Speaker/Moderation/Host je Session.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** partner_add_speaker(), partner_assign_stage_guest(), partner_remove_stage_guest(), set_session_speakers() · löscht Zeilen: partner_assign_stage_guest(), partner_remove_stage_guest(), set_session_speakers()

**Trigger auf dieser Tabelle:** trg_session_speaker_board_notify → programme_board_notify_speaker()

**Seiten (lesen/schreiben):** /admin/edition, /admin/partner, /admin/partner/[org], /partner, /partner/buehne, /partner/buehne/gaeste

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `session_id` | uuid | technisch | partner_add_speaker(), partner_assign_stage_guest(), set_session_speakers() | /admin/edition, /admin/partner, /admin/partner/[org], /partner, /partner/buehne, /partner/buehne/gaeste | |
| `person_id` | uuid | technisch | partner_add_speaker(), partner_assign_stage_guest(), set_session_speakers() | /admin/edition, /admin/partner, /admin/partner/[org], /partner, /partner/buehne, /partner/buehne/gaeste | |
| `role` | text | fachlich | partner_add_speaker(), partner_assign_stage_guest(), set_session_speakers() | /admin/edition, /admin/partner, /admin/partner/[org], /partner, /partner/buehne, /partner/buehne/gaeste | |
| `sort_order` | integer | fachlich | partner_assign_stage_guest(), set_session_speakers() | /admin/edition, /admin/partner, /admin/partner/[org], /partner, /partner/buehne, /partner/buehne/gaeste | |
| `confirmed` | boolean | fachlich | partner_assign_stage_guest(), set_session_speakers() | /admin/edition, /admin/partner, /admin/partner/[org], /partner, /partner/buehne, /partner/buehne/gaeste | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `session_question`

**Zweck:** Fragen einer Session: aus dem Katalog oder eigene (max. 2, Freigabe durch Programm-Team).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** approve_session_questions(), partner_copy_table_questions(), partner_request_question(), partner_set_session_questions(), set_session_questions() · löscht Zeilen: partner_copy_table_questions(), partner_set_session_questions(), set_session_questions()

**Trigger auf dieser Tabelle:** trg_session_question_limit → session_question_limit()

**Seiten (lesen/schreiben):** /admin/bewerbungen/[id], /admin/edition, /admin/fragenkatalog, /admin/partner, /admin/partner/[org], /partner, /partner/buehne, /programm, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `session_id` | uuid | technisch | partner_copy_table_questions(), partner_request_question(), partner_set_session_questions(), set_session_questions() | /admin/edition, /partner, /partner/buehne | |
| `question_id` | uuid | technisch | partner_copy_table_questions(), partner_set_session_questions(), set_session_questions() | /admin/edition, /partner, /partner/buehne | |
| `label_de` | text | fachlich | partner_copy_table_questions(), partner_request_question(), set_session_questions() | /admin/edition, /partner, /partner/buehne | |
| `label_en` | text | fachlich | partner_copy_table_questions(), partner_request_question(), set_session_questions() | /admin/edition, /partner, /partner/buehne | |
| `type` | text | fachlich | partner_copy_table_questions(), partner_request_question(), set_session_questions() | /admin/edition, /partner, /partner/buehne | |
| `options` | jsonb | fachlich | partner_copy_table_questions(), partner_request_question(), set_session_questions() | /admin/edition, /partner, /partner/buehne | |
| `required` | boolean | fachlich | partner_copy_table_questions(), partner_request_question(), set_session_questions() | /admin/edition, /partner, /partner/buehne | |
| `sort_order` | integer | fachlich | partner_copy_table_questions(), partner_request_question(), partner_set_session_questions(), set_session_questions() | /admin/edition, /partner, /partner/buehne | |
| `approved_by` | uuid | technisch | approve_session_questions(), partner_copy_table_questions(), set_session_questions() | /admin/edition, /admin/partner, /partner, /partner/buehne | |
| `approved_at` | timestamp with time zone | technisch | approve_session_questions(), partner_copy_table_questions(), set_session_questions() | /admin/edition, /admin/partner, /partner, /partner/buehne | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `requested_by` | uuid | technisch | partner_copy_table_questions(), partner_request_question() | /partner | |
| `purpose` | text | fachlich | partner_copy_table_questions(), partner_request_question() | /partner | |

### `session_submission`

**Zweck:** Vom Speaker eingereichte Session-Inhalte; final steht in session (Freigabe kopiert).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260924194015_v6_eine_sprache.sql), anonymize_person(), approve_session_content(), reject_session_content(), set_updated_at() [Trigger trg_session_submission_updated], submit_session_content()

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
| `language` | text | fachlich | Migration/Seed (20260924194015_v6_eine_sprache.sql), submit_session_content() | /speaker/session | |
| `notes` | text | fachlich | anonymize_person(), submit_session_content() | /speaker/session | |
| `status` | text | fachlich | approve_session_content(), reject_session_content(), submit_session_content() | /speaker-leads, /speaker/session | |
| `reviewed_by` | uuid | technisch | approve_session_content(), reject_session_content() | /speaker-leads | |
| `reviewed_at` | timestamp with time zone | technisch | approve_session_content(), reject_session_content() | /speaker-leads | |
| `review_note` | text | fachlich | approve_session_content(), reject_session_content() | /speaker-leads | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_session_submission_updated] |  | |

### `question_catalog`

**Zweck:** Zentraler Fragenkatalog für Bewerbungen (Antwort C: Katalog + max. 2 eigene Fragen je Session).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), reorder_question_catalog(), set_updated_at() [Trigger trg_question_catalog_updated], upsert_question_catalog()

**Trigger auf dieser Tabelle:** trg_question_catalog_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/edition, /admin/fragenkatalog, /partner, /partner/buehne

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `key` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), upsert_question_catalog() | /admin/fragenkatalog | |
| `label_de` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), upsert_question_catalog() | /admin/fragenkatalog | |
| `label_en` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), upsert_question_catalog() | /admin/fragenkatalog | |
| `help_de` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), upsert_question_catalog() | /admin/fragenkatalog | |
| `help_en` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), upsert_question_catalog() | /admin/fragenkatalog | |
| `type` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), upsert_question_catalog() | /admin/fragenkatalog | |
| `options` | jsonb | fachlich | upsert_question_catalog() | /admin/fragenkatalog | |
| `active` | boolean | fachlich | upsert_question_catalog() | /admin/fragenkatalog | |
| `sort_order` | integer | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), reorder_question_catalog(), upsert_question_catalog() | /admin/fragenkatalog | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_question_catalog_updated] |  | |
| `partner_selectable` | boolean | fachlich | upsert_question_catalog() | /admin/fragenkatalog | |

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

**Schreibwege (Funktionen/Trigger):** anonymize_person(), application_mail_trigger() [Trigger trg_application_mail], apply_to_session(), confirm_application(), decide_application(), expire_overdue_applications(), promote_waitlist(), release_application_share(), release_decisions(), revoke_application_share(), set_updated_at() [Trigger trg_application_updated], withdraw_application()

**Trigger auf dieser Tabelle:** trg_application_updated → set_updated_at(), trg_application_mail → application_mail_trigger()

**Seiten (lesen/schreiben):** /admin/bewerbungen, /meine, /partner, /programm

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `session_id` | uuid | technisch | apply_to_session() | /meine, /programm | |
| `person_id` | uuid | technisch | apply_to_session() | /meine, /programm | |
| `status` | text | fachlich | application_mail_trigger() [Trigger trg_application_mail], confirm_application(), decide_application(), expire_overdue_applications(), promote_waitlist(), withdraw_application() | /admin/bewerbungen, /meine, /partner, /programm | |
| `rank` | integer | fachlich | decide_application() | /admin/bewerbungen, /partner | |
| `answers` | jsonb | fachlich | anonymize_person(), apply_to_session() | /meine, /programm | |
| `consent_share` | boolean | fachlich | apply_to_session(), release_application_share(), revoke_application_share() | /meine, /programm | |
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

**Schreibwege (Funktionen/Trigger):** delete_regie_cue(), set_regie_anweisungen(), upsert_regie_cue() · löscht Zeilen: delete_regie_cue()

**Seiten (lesen/schreiben):** lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `stage_id` | uuid | technisch | set_regie_anweisungen(), upsert_regie_cue() |  | |
| `event_day_id` | uuid | technisch | set_regie_anweisungen(), upsert_regie_cue() |  | |
| `slot_id` | uuid | technisch | set_regie_anweisungen(), upsert_regie_cue() |  | |
| `cue_start` | timestamp with time zone | fachlich | set_regie_anweisungen(), upsert_regie_cue() |  | |
| `cue_end` | timestamp with time zone | fachlich | set_regie_anweisungen(), upsert_regie_cue() |  | |
| `sort_order` | integer | fachlich | upsert_regie_cue() |  | |
| `action` | text | fachlich | set_regie_anweisungen(), upsert_regie_cue() |  | |
| `umbau_min` | integer | fachlich | upsert_regie_cue() |  | |
| `moderation` | text | fachlich | upsert_regie_cue() |  | |
| `regie` | text | fachlich | upsert_regie_cue() |  | |
| `backstage` | text | fachlich | upsert_regie_cue() |  | |
| `mobiliar` | text | fachlich | set_regie_anweisungen(), upsert_regie_cue() |  | |
| `notes` | text | fachlich | set_regie_anweisungen(), upsert_regie_cue() |  | |
| `mic_assignments` | jsonb | fachlich | set_regie_anweisungen(), upsert_regie_cue() |  | |
| `media` | jsonb | fachlich | set_regie_anweisungen(), upsert_regie_cue() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | upsert_regie_cue() |  | |
| `created_by` | uuid | technisch | set_regie_anweisungen(), upsert_regie_cue() |  | |
| `updated_by` | uuid | technisch | set_regie_anweisungen(), upsert_regie_cue() |  | |
| `people_on_stage` | text | fachlich | set_regie_anweisungen(), upsert_regie_cue() |  | |

## 3. Speaker

### `speaker_profile`

**Zweck:** Speaker je Edition: Pipeline, Staff-Flags (Reception, Lounge, Pass, Hospitality, Reisekosten), Tech-Rider, Assistenz. Schreiben nur per RPC. Lesen mit Nutzerrechten nur über eine ausgeschriebene Spaltenliste (LEAD-053): priority, created_by, created_by_org_id, partner_editable_until_login, stage_guest_consent_at und companion_quota sind nur über die Funktionen lesbar; neue Spalten brauchen ihren eigenen grant select (spalte), wenn ein direkter Lesezugriff sie braucht.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260925084741_v6_bestaetigt_eine_wahrheit.sql), anonymize_person(), approve_travel_costs(), book_hospitality(), cancel_hospitality(), confirm_hospitality(), drop_partner_edit_on_login(), handover_speaker(), invite_assistant(), invite_speaker(), partner_add_speaker(), partner_add_stage_guest(), partner_remove_stage_guest(), partner_update_speaker(), partner_update_stage_guest(), register_speaker_asset(), remove_assistant(), set_companion_quota(), set_expense_mode(), set_speaker_contacts(), set_speaker_mail_via(), set_speaker_pipeline(), set_updated_at() [Trigger trg_speaker_profile_updated], speaker_profile_check() [Trigger trg_speaker_profile_check], speaker_profile_confirmed_at() [Trigger trg_speaker_profile_confirmed_at], update_my_speaker_profile(), update_speaker(), upsert_speaker() · löscht Zeilen: partner_remove_stage_guest()

**Trigger auf dieser Tabelle:** trg_speaker_profile_updated → set_updated_at(), trg_speaker_profile_check → speaker_profile_check(), trg_speaker_profile_tickets → speaker_profile_tickets_sync(), trg_speaker_profile_prefill → trg_speaker_profile_prefill(), trg_speaker_profile_confirmed_at → speaker_profile_confirmed_at()

**Seiten (lesen/schreiben):** /admin, /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker-leads, /admin/speaker-tickets, /admin/speaker/[id], /admin/technik/praesentationen, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads, /speaker-leads/praesentationen, /speaker/reisekosten, /speaker/session, /speaker/travel

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id` | uuid | technisch | partner_add_speaker(), partner_add_stage_guest(), upsert_speaker() | /admin/partner, /admin/partner/[org], /partner, /partner/buehne/gaeste, /speaker-leads | |
| `edition_id` | uuid | technisch | partner_add_speaker(), partner_add_stage_guest(), upsert_speaker() | /admin/partner, /admin/partner/[org], /partner, /partner/buehne/gaeste, /speaker-leads | |
| `speaker_type` | text | fachlich | partner_add_stage_guest(), update_speaker(), upsert_speaker() | /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker-tickets, /partner, /partner/buehne/gaeste, /speaker-leads | |
| `pipeline_status` | text | fachlich | partner_add_speaker(), partner_add_stage_guest(), set_speaker_pipeline(), update_speaker(), upsert_speaker() | /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker-tickets, /partner, /partner/buehne/gaeste, /speaker-leads | |
| `owner_person_id` | uuid | technisch | handover_speaker(), partner_add_speaker(), update_speaker(), upsert_speaker() | /admin/speaker, /admin/speaker-leads, /admin/speaker-tickets, /partner, /speaker-leads | |
| `job_title` | text | fachlich | anonymize_person(), partner_add_stage_guest(), partner_update_speaker(), partner_update_stage_guest(), update_my_speaker_profile(), update_speaker(), upsert_speaker() | /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker-tickets, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads | |
| `organization_name` | text | fachlich | anonymize_person(), partner_add_stage_guest(), partner_update_speaker(), partner_update_stage_guest(), update_my_speaker_profile(), update_speaker(), upsert_speaker() | /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker-tickets, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads | |
| `org_id` | uuid | technisch | update_speaker(), upsert_speaker() | /admin/speaker, /admin/speaker-tickets, /speaker-leads | |
| `bio_short_en` | text | fachlich | anonymize_person(), partner_update_speaker(), update_my_speaker_profile(), update_speaker() | /admin/speaker, /admin/speaker-tickets, /partner, /speaker, /speaker-leads | |
| `bio_short_de` | text | fachlich | anonymize_person(), partner_update_speaker(), update_my_speaker_profile(), update_speaker() | /admin/speaker, /admin/speaker-tickets, /partner, /speaker, /speaker-leads | |
| `bio_long_en` | text | fachlich | anonymize_person(), partner_update_speaker(), update_my_speaker_profile(), update_speaker() | /admin/speaker, /admin/speaker-tickets, /partner, /speaker, /speaker-leads | |
| `bio_long_de` | text | fachlich | anonymize_person(), partner_update_speaker(), update_my_speaker_profile(), update_speaker() | /admin/speaker, /admin/speaker-tickets, /partner, /speaker, /speaker-leads | |
| `socials` | jsonb | fachlich | anonymize_person(), partner_update_speaker(), update_my_speaker_profile(), update_speaker() | /admin/speaker, /admin/speaker-tickets, /partner, /speaker, /speaker-leads | |
| `photo_asset_id` | uuid | technisch | anonymize_person(), register_speaker_asset() | /admin, /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker/[id], /admin/technik/praesentationen, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads, /speaker-leads/praesentationen, /speaker/reisekosten, /speaker/session | |
| `reception_eligible` | boolean | fachlich | partner_add_stage_guest(), update_speaker(), upsert_speaker() | /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker-tickets, /partner, /partner/buehne/gaeste, /speaker-leads | |
| `lounge_access` | boolean | fachlich | partner_add_stage_guest(), update_speaker(), upsert_speaker() | /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker-tickets, /partner, /partner/buehne/gaeste, /speaker-leads | |
| `pass_type` | text | fachlich | update_speaker(), upsert_speaker() | /admin/speaker, /admin/speaker-tickets, /speaker-leads | |
| `hotel_tier` | text | fachlich | update_speaker(), upsert_speaker() | /admin/speaker, /admin/speaker-tickets, /speaker-leads | |
| `hospitality_status` | text | fachlich | book_hospitality(), cancel_hospitality(), confirm_hospitality(), partner_add_stage_guest(), update_speaker(), upsert_speaker() | /admin, /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker-tickets, /partner, /partner/buehne/gaeste, /speaker-leads, /speaker/travel | |
| `travel_costs_covered` | boolean | fachlich | approve_travel_costs(), partner_add_stage_guest(), update_speaker(), upsert_speaker() | /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker-tickets, /partner, /partner/buehne/gaeste, /speaker-leads | |
| `travel_costs_approved_by` | uuid | technisch | approve_travel_costs() | /admin/speaker, /speaker-leads | |
| `travel_costs_approved_at` | timestamp with time zone | technisch | approve_travel_costs() | /admin/speaker, /speaker-leads | |
| `tech_rider` | jsonb | fachlich | update_my_speaker_profile(), update_speaker() | /admin/speaker, /admin/speaker-tickets, /speaker, /speaker-leads | |
| `assistant_person_id` | uuid | technisch | invite_assistant(), remove_assistant(), speaker_profile_check() [Trigger trg_speaker_profile_check] | /admin/speaker, /speaker | |
| `internal_notes` | text | fachlich | anonymize_person(), update_speaker(), upsert_speaker() | /admin/speaker, /admin/speaker-tickets, /speaker-leads | |
| `invited_at` | timestamp with time zone | technisch | invite_speaker() | /admin/speaker, /speaker-leads | |
| `created_by` | uuid | technisch | partner_add_stage_guest(), upsert_speaker() | /admin/partner, /admin/partner/[org], /partner, /partner/buehne/gaeste, /speaker-leads | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_speaker_contacts(), set_updated_at() [Trigger trg_speaker_profile_updated] | /admin/speaker | |
| `lead_contact_id` | uuid | technisch | set_speaker_contacts() | /admin/speaker | |
| `buddy_contact_id` | uuid | technisch | set_speaker_contacts() | /admin/speaker | |
| `confirmed_at` | timestamp with time zone | technisch | Migration/Seed (20260925084741_v6_bestaetigt_eine_wahrheit.sql), partner_add_stage_guest(), set_speaker_pipeline(), speaker_profile_confirmed_at() [Trigger trg_speaker_profile_confirmed_at] | /admin/partner, /admin/partner/[org], /admin/speaker, /partner, /partner/buehne/gaeste, /speaker-leads | |
| `declined_at` | timestamp with time zone | technisch | set_speaker_pipeline() | /admin/speaker, /speaker-leads | |
| `decline_reason` | text | fachlich | anonymize_person(), set_speaker_pipeline() | /admin/speaker, /speaker-leads | |
| `contact_first_name` | text | fachlich | update_my_speaker_profile() | /speaker | |
| `contact_last_name` | text | fachlich | anonymize_person(), update_my_speaker_profile() | /speaker | |
| `contact_email` | extensions.citext | fachlich | anonymize_person(), update_my_speaker_profile() | /speaker | |
| `contact_phone` | text | fachlich | anonymize_person(), update_my_speaker_profile() | /speaker | |
| `contact_kind` | text | fachlich | anonymize_person(), update_my_speaker_profile() | /speaker | |
| `contact_consent_at` | date | technisch | anonymize_person(), update_my_speaker_profile() | /speaker | |
| `created_by_org_id` | uuid | technisch | partner_add_speaker(), partner_add_stage_guest() | /admin/partner, /admin/partner/[org], /partner, /partner/buehne/gaeste | |
| `partner_editable_until_login` | boolean | fachlich | drop_partner_edit_on_login(), partner_add_speaker(), partner_add_stage_guest() | /admin/partner, /admin/partner/[org], /partner, /partner/buehne/gaeste | |
| `expense_mode` | text | fachlich | set_expense_mode() | /admin/speaker | |
| `expense_lump_sum_cents` | integer | fachlich | set_expense_mode() | /admin/speaker | |
| `category` | text | fachlich |  |  | |
| `topic_cluster` | text | fachlich | anonymize_person(), update_speaker() | /admin/speaker, /admin/speaker-tickets, /speaker-leads | |
| `topic_role` | text | fachlich | anonymize_person(), update_speaker() | /admin/speaker, /admin/speaker-tickets, /speaker-leads | |
| `priority` | text | fachlich | anonymize_person(), update_speaker() | /admin/speaker, /admin/speaker-tickets, /speaker-leads | |
| `recommended_format` | text | fachlich | anonymize_person(), update_speaker() | /admin/speaker, /admin/speaker-tickets, /speaker-leads | |
| `contact_via` | text | fachlich | anonymize_person(), update_speaker() | /admin/speaker, /admin/speaker-tickets, /speaker-leads | |
| `outreach_channel` | text | fachlich | anonymize_person(), update_speaker() | /admin/speaker, /admin/speaker-tickets, /speaker-leads | |
| `stage_guest` | boolean | fachlich | partner_add_stage_guest() | /admin/partner, /admin/partner/[org], /partner, /partner/buehne/gaeste | |
| `stage_guest_consent_at` | timestamp with time zone | technisch | partner_add_stage_guest() | /admin/partner, /admin/partner/[org], /partner, /partner/buehne/gaeste | |
| `mail_via_contact_id` | uuid | technisch | partner_add_speaker(), set_speaker_mail_via() | /admin/speaker, /partner | |
| `companion_quota` | integer | fachlich | set_companion_quota() | /admin/speaker-tickets | |

### `speaker_asset`

**Zweck:** Dateien im Bucket speaker-assets: Präsentationen (Versionen, late, Technik-Check, Slid@Home), Fotos, Sonstiges.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** anonymize_person(), delete_speaker_asset(), register_speaker_asset(), set_slides_release(), set_tech_check(), set_updated_at() [Trigger trg_speaker_asset_updated] · löscht Zeilen: anonymize_person(), delete_speaker_asset()

**Trigger auf dieser Tabelle:** trg_speaker_asset_updated → set_updated_at()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** /admin

**Seiten (lesen/schreiben):** /admin, /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker/[id], /admin/technik/praesentationen, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads, /speaker-leads/praesentationen, /speaker/reisekosten, /speaker/session

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `profile_id` | uuid | technisch | register_speaker_asset() | /admin, /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker/[id], /admin/technik/praesentationen, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads, /speaker-leads/praesentationen, /speaker/reisekosten, /speaker/session | |
| `session_id` | uuid | technisch | register_speaker_asset() | /admin, /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker/[id], /admin/technik/praesentationen, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads, /speaker-leads/praesentationen, /speaker/reisekosten, /speaker/session | |
| `kind` | text | fachlich | register_speaker_asset() | /admin, /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker/[id], /admin/technik/praesentationen, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads, /speaker-leads/praesentationen, /speaker/reisekosten, /speaker/session | |
| `storage_path` | text | fachlich | register_speaker_asset() | /admin, /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker/[id], /admin/technik/praesentationen, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads, /speaker-leads/praesentationen, /speaker/reisekosten, /speaker/session | |
| `filename` | text | fachlich | register_speaker_asset() | /admin, /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker/[id], /admin/technik/praesentationen, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads, /speaker-leads/praesentationen, /speaker/reisekosten, /speaker/session | |
| `mime` | text | fachlich | register_speaker_asset() | /admin, /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker/[id], /admin/technik/praesentationen, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads, /speaker-leads/praesentationen, /speaker/reisekosten, /speaker/session | |
| `size_bytes` | bigint | fachlich | register_speaker_asset() | /admin, /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker/[id], /admin/technik/praesentationen, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads, /speaker-leads/praesentationen, /speaker/reisekosten, /speaker/session | |
| `version` | integer | fachlich | register_speaker_asset() | /admin, /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker/[id], /admin/technik/praesentationen, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads, /speaker-leads/praesentationen, /speaker/reisekosten, /speaker/session | |
| `is_current` | boolean | fachlich | delete_speaker_asset(), register_speaker_asset() | /admin, /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker/[id], /admin/technik/praesentationen, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads, /speaker-leads/praesentationen, /speaker/reisekosten, /speaker/session | |
| `late` | boolean | fachlich | register_speaker_asset() | /admin, /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker/[id], /admin/technik/praesentationen, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads, /speaker-leads/praesentationen, /speaker/reisekosten, /speaker/session | |
| `tech_check_status` | text | fachlich | set_tech_check() | /admin | |
| `tech_check_note` | text | fachlich | set_tech_check() | /admin | |
| `tech_checked_by` | uuid | technisch | set_tech_check() | /admin | |
| `tech_checked_at` | timestamp with time zone | technisch | set_tech_check() | /admin | |
| `slides_release` | boolean | fachlich | set_slides_release() | /speaker/session | |
| `uploaded_by` | uuid | technisch | register_speaker_asset() | /admin, /admin/partner, /admin/partner/[org], /admin/speaker, /admin/speaker/[id], /admin/technik/praesentationen, /partner, /partner/buehne/gaeste, /speaker, /speaker-leads, /speaker-leads/praesentationen, /speaker/reisekosten, /speaker/session | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_speaker_asset_updated] |  | |

### `speaker_travel`

**Zweck:** An- und Abreise je Speaker-Profil (Abgleich 15.09.). Datum und Uhrzeit getrennt: die Eingabe meint Ortszeit in Hamburg, kein `timestamptz`.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** anonymize_person(), set_my_speaker_travel(), set_updated_at() [Trigger trg_speaker_travel_updated] · löscht Zeilen: anonymize_person()

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
| `needs_dropoff` | boolean | fachlich | set_my_speaker_travel() | /speaker/travel | |

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

**Schreibwege (Funktionen/Trigger):** anonymize_person(), book_hospitality(), cancel_hospitality(), confirm_hospitality(), decline_hospitality(), set_updated_at() [Trigger trg_hospitality_booking_updated]

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
| `details` | jsonb | fachlich | anonymize_person(), book_hospitality() | /speaker/travel | |
| `created_by` | uuid | technisch | book_hospitality() | /speaker/travel | |
| `confirmed_by` | uuid | technisch | confirm_hospitality() | /admin | |
| `confirmed_at` | timestamp with time zone | technisch | confirm_hospitality() | /admin | |
| `cancelled_at` | timestamp with time zone | technisch | cancel_hospitality(), decline_hospitality() | /admin, /speaker/travel | |
| `team_note` | text | fachlich | anonymize_person(), confirm_hospitality(), decline_hospitality() | /admin | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_hospitality_booking_updated] |  | |

### `expense_claim`

**Zweck:** Reisekostenanträge der Speaker. Bankdaten nur im Vault (bank_secret_id), hier nur Maske und Kontoinhaber.

**Datenschutz-Klasse (Vorschlag):** Bank/Vault

**Schreibwege (Funktionen/Trigger):** anonymize_person(), approve_expense(), mark_expense_paid(), reject_expense(), set_expense_bank_details(), set_expense_integration(), set_updated_at() [Trigger trg_expense_claim_updated], submit_expense(), upsert_expense_claim()

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
| `bank_secret_id` | uuid | technisch | anonymize_person(), set_expense_bank_details() | /speaker/reisekosten | |
| `bank_masked` | text | fachlich | anonymize_person(), set_expense_bank_details() | /speaker/reisekosten | |
| `bank_holder` | text | fachlich | anonymize_person(), set_expense_bank_details() | /speaker/reisekosten | |
| `invoice_no` | text | fachlich | submit_expense() | /speaker/reisekosten | |
| `invoice_asset_id` | uuid | technisch | set_expense_integration() | /admin | |
| `submitted_at` | timestamp with time zone | technisch | submit_expense() | /speaker/reisekosten | |
| `submitted_by` | uuid | technisch | submit_expense() | /speaker/reisekosten | |
| `reviewed_by` | uuid | technisch | approve_expense(), reject_expense() | /admin | |
| `reviewed_at` | timestamp with time zone | technisch | approve_expense(), reject_expense() | /admin | |
| `review_note` | text | fachlich | anonymize_person(), approve_expense(), reject_expense(), submit_expense(), upsert_expense_claim() | /admin, /speaker/reisekosten | |
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

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260917183022_v6_aufraeumen_feldmatrix.sql), ingest_partner_deal(), record_shop_invoice(), record_shop_quote(), set_org_customer_number(), set_org_sevdesk_contact(), set_updated_at() [Trigger trg_organization_updated], update_partner_onboarding()

**Trigger auf dieser Tabelle:** trg_organization_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/initiativen/award, /admin/partner, /partner, API-Route: /api/admin/partner/documents/sync, API-Route: /api/admin/sevdesk/shop-invoices, API-Route: /api/partner/shop/angebot, Cron: /api/cron/hubspot-sweep, Cron: /api/cron/mail, Webhook: /api/webhooks/hubspot

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `legal_name` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /admin/partner, /partner | |
| `communication_name` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /admin/partner, /partner | |
| `address_street` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /admin/partner, /partner | |
| `address_zip` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /admin/partner, /partner | |
| `address_city` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /admin/partner, /partner | |
| `address_country` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /admin/partner, /partner | |
| `hubspot_id` | text | technisch | ingest_partner_deal() |  | |
| `partner_category` | text | fachlich | ingest_partner_deal() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_organization_updated] |  | |
| `type` | text | fachlich | ingest_partner_deal() |  | |
| `slug` | text | fachlich |  |  | |
| `website` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /admin/partner, /partner | |
| `active` | boolean | fachlich | ingest_partner_deal() |  | |
| `sevdesk_contact_id` | text | technisch | record_shop_invoice(), record_shop_quote(), set_org_sevdesk_contact() |  | |
| `description_de` | text | fachlich | Migration/Seed (20260917183022_v6_aufraeumen_feldmatrix.sql), ingest_partner_deal(), update_partner_onboarding() | /admin/partner, /partner | |
| `description_en` | text | fachlich | Migration/Seed (20260917183022_v6_aufraeumen_feldmatrix.sql), update_partner_onboarding() | /admin/partner, /partner | |
| `industry` | text | fachlich | update_partner_onboarding() | /admin/partner, /partner | |
| `address_extra` | text | fachlich |  |  | |
| `customer_number` | text | fachlich | ingest_partner_deal(), set_org_customer_number() | /admin/partner | |

### `org_membership`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** anonymize_person(), partner_contact_upsert_internal(), person_merge_core(), remove_partner_contact(), set_contact_roles(), set_updated_at() [Trigger trg_org_membership_updated], transfer_primary_contact(), unmerge_persons(), update_partner_contact() · löscht Zeilen: anonymize_person(), remove_partner_contact()

**Trigger auf dieser Tabelle:** trg_org_membership_updated → set_updated_at(), trg_org_membership_roles → trg_org_membership_roles()

**Seiten (lesen/schreiben):** /admin/partner, /admin/personen/dubletten, /partner

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id` | uuid | technisch | partner_contact_upsert_internal() |  | |
| `org_id` | uuid | technisch | partner_contact_upsert_internal() |  | |
| `roles` | text[] | fachlich | partner_contact_upsert_internal(), person_merge_core(), set_contact_roles(), transfer_primary_contact(), unmerge_persons() | /admin/partner, /admin/personen/dubletten, /partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_org_membership_updated] |  | |
| `contact_position` | text | fachlich | partner_contact_upsert_internal(), update_partner_contact() | /admin/partner, /partner | |
| `invited_at` | timestamp with time zone | technisch | partner_contact_upsert_internal(), update_partner_contact() | /admin/partner, /partner | |
| `partner_editable_until_login` | boolean | fachlich | partner_contact_upsert_internal() |  | |

### `org_edition`

**Zweck:** Partner-Organisation je Edition: Onboarding-Stand, Rechnungsdaten, Pass-Typ-Wahl, HubSpot-Deal.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260918141036_v6_initiativen.sql), ingest_partner_deal(), partner_onboarding_recheck(), partner_set_onboarding_status(), set_initiative_stage(), set_logo_category(), set_logo_whitening_consent(), set_org_contacts(), set_pass_type_choice(), set_updated_at() [Trigger trg_org_edition_updated], update_partner_onboarding()

**Trigger auf dieser Tabelle:** trg_org_edition_updated → set_updated_at(), trg_org_edition_deliverables → trg_org_edition_sync(), trg_org_edition_pass_type → trg_org_edition_pass_type(), trg_org_edition_prefill_pass_type → org_edition_prefill_pass_type()

**Seiten (lesen/schreiben):** /admin/initiativen, /admin/partner, /admin/partner/logos, /partner, Cron: /api/cron/hubspot-sweep, Webhook: /api/webhooks/hubspot

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `org_id` | uuid | technisch | ingest_partner_deal() |  | |
| `edition_id` | uuid | technisch | ingest_partner_deal() |  | |
| `onboarding_status` | text | fachlich | ingest_partner_deal(), partner_onboarding_recheck(), partner_set_onboarding_status() | /admin/partner | |
| `invited_at` | timestamp with time zone | technisch | ingest_partner_deal(), partner_set_onboarding_status() | /admin/partner | |
| `onboarding_filled_at` | timestamp with time zone | technisch | partner_onboarding_recheck(), partner_set_onboarding_status() | /admin/partner | |
| `invoice_email` | extensions.citext | fachlich | ingest_partner_deal(), update_partner_onboarding() | /admin/partner, /partner | |
| `invoice_name` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /admin/partner, /partner | |
| `vat_id` | text | technisch | ingest_partner_deal(), update_partner_onboarding() | /admin/partner, /partner | |
| `po_number` | text | fachlich | ingest_partner_deal(), update_partner_onboarding() | /admin/partner, /partner | |
| `sponsoring_level` | text | fachlich | ingest_partner_deal() |  | |
| `hubspot_deal_id` | text | technisch | ingest_partner_deal() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_initiative_stage(), set_org_contacts(), set_updated_at() [Trigger trg_org_edition_updated] | /admin/initiativen | |
| `lead_contact_id` | uuid | technisch | set_org_contacts() |  | |
| `buddy_contact_id` | uuid | technisch | set_org_contacts() |  | |
| `pipeline_stage` | text | fachlich | set_initiative_stage() | /admin/initiativen | |
| `source` | text | fachlich | Migration/Seed (20260918141036_v6_initiativen.sql) |  | |
| `logo_whitening_consent_at` | timestamp with time zone | technisch | set_logo_whitening_consent() | /admin/partner, /partner | |
| `logo_whitening_consent_by` | uuid | technisch | set_logo_whitening_consent() | /admin/partner, /partner | |
| `logo_category` | text | fachlich | set_logo_category() | /admin/partner/logos | |

### `org_product`

**Zweck:** Gebuchte Leistungen je Partner × Edition (aus HubSpot-Line-Items); steuert Checkliste und Sichtbarkeit.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** assign_org_products(), ingest_partner_deal(), set_updated_at() [Trigger trg_org_product_updated] · löscht Zeilen: assign_org_products()

**Trigger auf dieser Tabelle:** trg_org_product_updated → set_updated_at(), trg_org_product_deliverables → trg_org_product_sync(), trg_org_product_allocations → trg_org_product_allocations(), trg_org_product_roles → trg_org_product_roles()

**Seiten (lesen/schreiben):** /admin/initiativen, Cron: /api/cron/hubspot-sweep, Webhook: /api/webhooks/hubspot

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `org_edition_id` | uuid | technisch | assign_org_products(), ingest_partner_deal() | /admin/initiativen | |
| `product_sku` | text | fachlich | assign_org_products(), ingest_partner_deal() | /admin/initiativen | |
| `qty` | numeric | fachlich | assign_org_products(), ingest_partner_deal() | /admin/initiativen | |
| `unit_price_cents` | integer | fachlich | assign_org_products(), ingest_partner_deal() | /admin/initiativen | |
| `hubspot_line_item_id` | text | technisch | ingest_partner_deal() |  | |
| `status` | text | fachlich | assign_org_products(), ingest_partner_deal() | /admin/initiativen | |
| `notes` | text | fachlich |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_org_product_updated] |  | |
| `source` | text | fachlich | assign_org_products() | /admin/initiativen | |
| `nachgebucht_am` | timestamp with time zone | fachlich | ingest_partner_deal() |  | |

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

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260911074329_v3_ticket_allocations.sql), recount_allocation_usage(), set_ticket_allocation(), set_ticket_allocation_discount(), set_ticket_allocation_vivenu(), set_updated_at() [Trigger trg_org_ticket_allocation_updated], sync_ticket_allocations() · löscht Zeilen: sync_ticket_allocations()

**Trigger auf dieser Tabelle:** trg_org_ticket_allocation_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/partner, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `event_id` | uuid | technisch | set_ticket_allocation_discount(), sync_ticket_allocations() | /admin/partner | |
| `org_id` | uuid | technisch | set_ticket_allocation_discount(), sync_ticket_allocations() | /admin/partner | |
| `pass_type` | text | fachlich | set_ticket_allocation_discount(), sync_ticket_allocations() | /admin/partner | |
| `quantity` | integer | fachlich | set_ticket_allocation(), set_ticket_allocation_discount(), sync_ticket_allocations() | /admin/partner | |
| `coupon_code` | text | fachlich | set_ticket_allocation(), set_ticket_allocation_vivenu() | /admin/partner | |
| `undershop_url` | text | fachlich | set_ticket_allocation(), set_ticket_allocation_vivenu() | /admin/partner | |
| `used_count` | integer | fachlich | recount_allocation_usage() |  | |
| `notes` | text | fachlich | set_ticket_allocation() | /admin/partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_org_ticket_allocation_updated] |  | |
| `org_edition_id` | uuid | technisch | Migration/Seed (20260911074329_v3_ticket_allocations.sql), set_ticket_allocation_discount(), sync_ticket_allocations() | /admin/partner | |
| `status` | text | fachlich | set_ticket_allocation(), set_ticket_allocation_discount(), set_ticket_allocation_vivenu(), sync_ticket_allocations() | /admin/partner | |
| `vivenu_coupon_id` | text | technisch | set_ticket_allocation_vivenu() |  | |
| `vivenu_undershop_id` | text | technisch | set_ticket_allocation_vivenu() |  | |
| `last_error` | text | fachlich | set_ticket_allocation(), set_ticket_allocation_vivenu() | /admin/partner | |
| `synced_at` | timestamp with time zone | technisch | set_ticket_allocation(), set_ticket_allocation_vivenu(), sync_ticket_allocations() | /admin/partner | |
| `discount_percent` | integer | fachlich | set_ticket_allocation_discount(), sync_ticket_allocations() | /admin/partner | |

### `partner_asset`

**Zweck:** Dateien einer Partner-Organisation im Bucket partner-assets (Pfad <edition>/<org>/<kind>/<datei>), versioniert.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** register_partner_asset(), register_sevdesk_document(), review_deliverable(), set_partner_graphic(), set_updated_at() [Trigger trg_partner_asset_updated], submit_deliverable(), upload_partner_document()

**Trigger auf dieser Tabelle:** trg_partner_asset_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/partner, /partner, API-Route: /api/admin/partner/documents/sync, API-Route: /api/admin/partnergrafik, Cron: /api/cron/mail

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `org_edition_id` | uuid | technisch | register_partner_asset(), register_sevdesk_document(), set_partner_graphic(), upload_partner_document() | /partner | |
| `deliverable_id` | uuid | technisch | register_partner_asset(), submit_deliverable() | /partner | |
| `kind` | text | fachlich | register_partner_asset(), register_sevdesk_document(), set_partner_graphic(), upload_partner_document() | /partner | |
| `storage_path` | text | fachlich | register_partner_asset(), register_sevdesk_document(), set_partner_graphic(), upload_partner_document() | /partner | |
| `filename` | text | fachlich | register_partner_asset(), register_sevdesk_document(), set_partner_graphic(), upload_partner_document() | /partner | |
| `mime` | text | fachlich | register_partner_asset(), register_sevdesk_document(), set_partner_graphic(), upload_partner_document() | /partner | |
| `size_bytes` | bigint | fachlich | register_partner_asset(), register_sevdesk_document(), set_partner_graphic(), upload_partner_document() | /partner | |
| `version` | integer | fachlich | register_partner_asset(), register_sevdesk_document(), set_partner_graphic(), upload_partner_document() | /partner | |
| `is_current` | boolean | fachlich | register_partner_asset(), register_sevdesk_document(), set_partner_graphic(), upload_partner_document() | /partner | |
| `status` | text | fachlich | register_sevdesk_document(), review_deliverable(), set_partner_graphic(), upload_partner_document() | /admin/partner | |
| `review_note` | text | fachlich | review_deliverable() | /admin/partner | |
| `reviewed_by` | uuid | technisch | review_deliverable(), set_partner_graphic() | /admin/partner | |
| `reviewed_at` | timestamp with time zone | technisch | review_deliverable(), set_partner_graphic() | /admin/partner | |
| `uploaded_by` | uuid | technisch | register_partner_asset(), set_partner_graphic(), upload_partner_document() | /partner | |
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

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260917190402_v6_challenge_frist.sql), Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), Migration/Seed (20260918122700_v6_branding.sql), mark_overdue_deliverables(), refresh_deliverable_due(), review_deliverable(), set_updated_at() [Trigger trg_deliverable_updated], shop_sync_fulfilled_deliverables(), submit_deliverable(), sync_deliverables()

**Trigger auf dieser Tabelle:** trg_deliverable_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/partner, /partner

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `org_edition_id` | uuid | technisch | sync_deliverables() |  | |
| `template_id` | uuid | technisch | sync_deliverables() |  | |
| `key` | text | fachlich | sync_deliverables() |  | |
| `product_sku` | text | fachlich | sync_deliverables() |  | |
| `status` | text | fachlich | Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), mark_overdue_deliverables(), review_deliverable(), shop_sync_fulfilled_deliverables(), submit_deliverable(), sync_deliverables() | /admin/partner, /partner | |
| `due_at` | timestamp with time zone | technisch | Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260917190402_v6_challenge_frist.sql), Migration/Seed (20260918122700_v6_branding.sql), refresh_deliverable_due(), sync_deliverables() |  | |
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

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911085655_v3_deliverable_extras.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260917190402_v6_challenge_frist.sql), Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), Migration/Seed (20260918122700_v6_branding.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921111140_v6_hackathon_backdrop.sql), Migration/Seed (20260924101126_v6_logo_druck_einwilligung.sql), Migration/Seed (20261001122557_v6_hack_tracks.sql), Migration/Seed (20261001124252_v6_hack_auswertung.sql), Migration/Seed (20261002085359_v6_rueckwand_nur_challenge.sql), set_updated_at() [Trigger trg_deliverable_template_updated], upsert_deliverable_template()

**Trigger auf dieser Tabelle:** trg_deliverable_template_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/partner, /admin/partner/vorlagen, /partner, /partner/checkliste

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `key` | text | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921111140_v6_hackathon_backdrop.sql), upsert_deliverable_template() | /admin/partner | |
| `product_sku` | text | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921111140_v6_hackathon_backdrop.sql), Migration/Seed (20261002085359_v6_rueckwand_nur_challenge.sql), upsert_deliverable_template() | /admin/partner | |
| `category` | text | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), Migration/Seed (20260921111140_v6_hackathon_backdrop.sql), upsert_deliverable_template() | /admin/partner | |
| `type` | text | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921111140_v6_hackathon_backdrop.sql), upsert_deliverable_template() | /admin/partner | |
| `label_de` | text | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), Migration/Seed (20260918122700_v6_branding.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921111140_v6_hackathon_backdrop.sql), upsert_deliverable_template() | /admin/partner | |
| `label_en` | text | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), Migration/Seed (20260918122700_v6_branding.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921111140_v6_hackathon_backdrop.sql), upsert_deliverable_template() | /admin/partner | |
| `description_de` | text | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), Migration/Seed (20260918122700_v6_branding.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921111140_v6_hackathon_backdrop.sql), Migration/Seed (20260924101126_v6_logo_druck_einwilligung.sql), upsert_deliverable_template() | /admin/partner | |
| `description_en` | text | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), Migration/Seed (20260918122700_v6_branding.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921111140_v6_hackathon_backdrop.sql), Migration/Seed (20260924101126_v6_logo_druck_einwilligung.sql), upsert_deliverable_template() | /admin/partner | |
| `due_rule` | jsonb | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260917190402_v6_challenge_frist.sql), Migration/Seed (20260918122700_v6_branding.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921111140_v6_hackathon_backdrop.sql), upsert_deliverable_template() | /admin/partner | |
| `file_rules` | jsonb | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260921111140_v6_hackathon_backdrop.sql), Migration/Seed (20260924101126_v6_logo_druck_einwilligung.sql), upsert_deliverable_template() | /admin/partner | |
| `required` | boolean | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921111140_v6_hackathon_backdrop.sql), upsert_deliverable_template() | /admin/partner | |
| `audience_roles` | text[] | fachlich | Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260921111140_v6_hackathon_backdrop.sql), upsert_deliverable_template() | /admin/partner | |
| `sort` | integer | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921111140_v6_hackathon_backdrop.sql), upsert_deliverable_template() | /admin/partner | |
| `active` | boolean | fachlich | Migration/Seed (20260911113609_v3_logo_png_public_bucket.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921111140_v6_hackathon_backdrop.sql), upsert_deliverable_template() | /admin/partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_deliverable_template_updated] |  | |
| `fulfilled_by_sku` | text | fachlich | Migration/Seed (20260911085655_v3_deliverable_extras.sql), upsert_deliverable_template() | /admin/partner | |

### `deadline`

**Zweck:** Fristen je Edition; speist Countdowns, Uploads (late-Markierung) und später Wiki/Checklisten.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260917190402_v6_challenge_frist.sql), Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), Migration/Seed (20261009122829_v6_shuttle_sperre.sql), delete_deadline(), set_updated_at() [Trigger trg_deadline_updated], upsert_deadline() · löscht Zeilen: delete_deadline()

**Trigger auf dieser Tabelle:** trg_deadline_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/side-events, /admin/speaker/aufgaben, /partner/messestand, /speaker, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `edition_id` | uuid | technisch | Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260917190402_v6_challenge_frist.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), Migration/Seed (20261009122829_v6_shuttle_sperre.sql), upsert_deadline() |  | |
| `key` | text | fachlich | Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260917190402_v6_challenge_frist.sql), Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), Migration/Seed (20261009122829_v6_shuttle_sperre.sql), upsert_deadline() |  | |
| `audience` | text | fachlich | Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260917190402_v6_challenge_frist.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), Migration/Seed (20261009122829_v6_shuttle_sperre.sql), upsert_deadline() |  | |
| `due_at` | timestamp with time zone | technisch | Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260917190402_v6_challenge_frist.sql), Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), Migration/Seed (20261009122829_v6_shuttle_sperre.sql), upsert_deadline() |  | |
| `label_de` | text | fachlich | Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260917190402_v6_challenge_frist.sql), Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), Migration/Seed (20261009122829_v6_shuttle_sperre.sql), upsert_deadline() |  | |
| `label_en` | text | fachlich | Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260917190402_v6_challenge_frist.sql), Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), Migration/Seed (20261009122829_v6_shuttle_sperre.sql), upsert_deadline() |  | |
| `description_de` | text | fachlich | Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260917190402_v6_challenge_frist.sql), Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), Migration/Seed (20261009122829_v6_shuttle_sperre.sql), upsert_deadline() |  | |
| `description_en` | text | fachlich | Migration/Seed (20260910104806_v2_speaker_content_assets.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260917190402_v6_challenge_frist.sql), Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), Migration/Seed (20261009122829_v6_shuttle_sperre.sql), upsert_deadline() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_deadline_updated], upsert_deadline() |  | |
| `reminder_lead_hours` | integer | fachlich | Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260917190402_v6_challenge_frist.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), upsert_deadline() |  | |
| `custom` | boolean | fachlich | Migration/Seed (20261009122829_v6_shuttle_sperre.sql), upsert_deadline() |  | |

### `booth`

**Zweck:** Stand je Partner × Edition (Nummer, Fläche, Rückwand-Maße); Team pflegt, Partner liest. Produktionsdetails folgen in Welle 4.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_updated_at() [Trigger trg_booth_updated], upsert_booth()

**Trigger auf dieser Tabelle:** trg_booth_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/partner

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `booth_number` | text | fachlich | upsert_booth() | /admin/partner | |
| `booth_type` | text | fachlich | upsert_booth() | /admin/partner | |
| `segment` | text | fachlich | upsert_booth() | /admin/partner | |
| `length_m` | numeric | fachlich | upsert_booth() | /admin/partner | |
| `width_m` | numeric | fachlich | upsert_booth() | /admin/partner | |
| `backdrop_w_mm` | integer | fachlich | upsert_booth() | /admin/partner | |
| `backdrop_h_mm` | integer | fachlich | upsert_booth() | /admin/partner | |
| `notes` | text | fachlich | upsert_booth() | /admin/partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_booth_updated], upsert_booth() | /admin/partner | |

### `booth_service_check`

**Zweck:** Abgehakte Position der Stand-Checkliste. Eine Zeile je Stand und Artikel; fehlt sie, ist die Position offen.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_booth_service_check() · löscht Zeilen: set_booth_service_check()

**Seiten (lesen/schreiben):** /admin/produktion

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `org_edition_id` | uuid | technisch | set_booth_service_check() | /admin/produktion | |
| `product_sku` | text | fachlich | set_booth_service_check() | /admin/produktion | |
| `checked_by` | uuid | technisch | set_booth_service_check() | /admin/produktion | |
| `checked_at` | timestamp with time zone | technisch |  |  | |
| `note` | text | fachlich | set_booth_service_check() | /admin/produktion | |
| `created_at` | timestamp with time zone | technisch |  |  | |

## 5. Messeshop & Produkte

### `product`

**Zweck:** Produktstamm (Pakete, Zusatzleistungen, Shop-Artikel). SKU = Item-ID der Item-Liste; nach dem Import ist das Portal Quelle der Wahrheit.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260914094832_v4_produktion.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260917190103_v6_partner_format_key.sql), Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921112508_v6_ea1_aussteller_level.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), Migration/Seed (20260925093130_v6_standpakete_eigenproduktion.sql), Migration/Seed (20261001081703_v6_hackathon_challenge_rolle.sql), Migration/Seed (20261001082329_v6_hackathon_stand_kein_vertrieb.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), set_updated_at() [Trigger trg_product_updated], upsert_product()

**Trigger auf dieser Tabelle:** trg_product_updated → set_updated_at(), product_supplier_chk → trg_product_supplier()

**Seiten (lesen/schreiben):** /admin/initiativen, /admin/partner, /admin/partner/vorlagen, /admin/produktion/produkte, API-Route: /api/admin/products/bild

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `sku` | text | fachlich | Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `name_de` | text | fachlich | Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `name_en` | text | fachlich | Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `description_de` | text | fachlich | Migration/Seed (20260921115330_v6_formate_schema.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `description_en` | text | fachlich | Migration/Seed (20260921115330_v6_formate_schema.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `type` | text | fachlich | Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `category` | text | fachlich | Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `unit` | text | fachlich | Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `net_price_cents` | integer | fachlich | Migration/Seed (20260918141036_v6_initiativen.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `purchase_price_cents` | integer | fachlich | upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `margin` | numeric | fachlich | upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `vat_rate` | numeric | fachlich | Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `supplier` | text | fachlich | Migration/Seed (20260914094832_v4_produktion.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `supplier_sku` | text | fachlich | upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `supplier_url` | text | fachlich | upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `stock_total` | integer | fachlich | upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `track_stock` | boolean | fachlich | Migration/Seed (20260918141036_v6_initiativen.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `available_until` | timestamp with time zone | fachlich | upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `shop_visible` | boolean | fachlich | Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), Migration/Seed (20260918141036_v6_initiativen.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `shop_sort` | integer | fachlich | upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `late_orderable` | boolean | fachlich | Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260918141036_v6_initiativen.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `shop_hint_de` | text | fachlich | upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `shop_hint_en` | text | fachlich | upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `purchase_note_de` | text | fachlich | upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `purchase_note_en` | text | fachlich | upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `merch_config` | jsonb | fachlich | upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `images` | jsonb | fachlich | Migration/Seed (20260918141036_v6_initiativen.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `source_hubspot` | boolean | fachlich | Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), Migration/Seed (20261001082329_v6_hackathon_stand_kein_vertrieb.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `source_shop` | boolean | fachlich | Migration/Seed (20260918141036_v6_initiativen.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `internal_comment` | text | fachlich | Migration/Seed (20261001082329_v6_hackathon_stand_kein_vertrieb.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `active` | boolean | fachlich | Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), Migration/Seed (20260925093130_v6_standpakete_eigenproduktion.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `edition_id` | uuid | technisch | upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_product_updated] |  | |
| `pass_type` | text | fachlich | Migration/Seed (20260910170349_v3_hubspot_ingest.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `grants_role` | text | fachlich | Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20261001081703_v6_hackathon_challenge_rolle.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `area_sqm` | numeric | fachlich | Migration/Seed (20260915115415_v5_messestand.sql) |  | |
| `size_note` | text | fachlich | Migration/Seed (20260915115415_v5_messestand.sql) |  | |
| `format_key` | text | fachlich | Migration/Seed (20260917190103_v6_partner_format_key.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `sponsoring_level_key` | text | fachlich | Migration/Seed (20260921112508_v6_ea1_aussteller_level.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |
| `stand_days` | smallint | fachlich | Migration/Seed (20261001125937_v6_initiativen_award.sql), upsert_product() | /admin/partner, /admin/produktion/produkte | |

### `product_component`

**Zweck:** Stückliste: was in einem Paket steckt (Messebau/Regie).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260925093130_v6_standpakete_eigenproduktion.sql), upsert_product_component() · löscht Zeilen: upsert_product_component()

**Seiten (lesen/schreiben):** /admin/partner, /admin/partner/produkte, /admin/produktion/produkte

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `bundle_sku` | text | fachlich | Migration/Seed (20260925093130_v6_standpakete_eigenproduktion.sql), upsert_product_component() | /admin/partner, /admin/produktion/produkte | |
| `component_sku` | text | fachlich | Migration/Seed (20260925093130_v6_standpakete_eigenproduktion.sql), upsert_product_component() | /admin/partner, /admin/produktion/produkte | |
| `qty` | numeric | fachlich | Migration/Seed (20260925093130_v6_standpakete_eigenproduktion.sql), upsert_product_component() | /admin/partner, /admin/produktion/produkte | |

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

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), record_shop_quote(), run_shop_finalization(), set_updated_at() [Trigger trg_shop_order_updated], shop_admin_set_line(), shop_admin_set_status(), shop_cancel(), shop_confirm(), shop_edit(), shop_quote_abort(), shop_quote_begin(), shop_quote_withdraw(), shop_quotes_housekeeping(), shop_remove_line(), shop_upsert_line()

**Trigger auf dieser Tabelle:** trg_shop_order_updated → set_updated_at(), trg_shop_order_fulfil → trg_shop_order_fulfil()

**Seiten (lesen/schreiben):** /admin/partner, /partner, API-Route: /api/partner/shop/angebot

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `org_edition_id` | uuid | technisch | shop_upsert_line() | /partner | |
| `order_no` | text | fachlich | shop_upsert_line() | /partner | |
| `phase` | integer | fachlich | Migration/Seed (20260917192416_v6_shop_zwei_phasen.sql), shop_upsert_line() | /partner | |
| `status` | text | fachlich | run_shop_finalization(), shop_admin_set_status(), shop_cancel(), shop_confirm(), shop_edit(), shop_quote_abort(), shop_quote_begin(), shop_quote_withdraw(), shop_quotes_housekeeping(), shop_upsert_line() | /admin/partner, /partner | |
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
| `quote_started_at` | timestamp with time zone | technisch | run_shop_finalization(), shop_admin_set_status(), shop_cancel(), shop_confirm(), shop_quote_abort(), shop_quote_begin(), shop_quote_withdraw(), shop_quotes_housekeeping() | /admin/partner, /partner | |
| `quote_valid_until` | timestamp with time zone | fachlich | record_shop_quote(), run_shop_finalization(), shop_admin_set_status(), shop_cancel(), shop_confirm(), shop_quote_abort(), shop_quote_begin(), shop_quote_withdraw(), shop_quotes_housekeeping() | /admin/partner, /partner | |

### `shop_order_line`

**Zweck:** Bestellzeile mit Snapshot der Produktdaten zum Zeitpunkt der Bestätigung.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_updated_at() [Trigger trg_shop_order_line_updated], shop_admin_set_line(), shop_confirm(), shop_quote_begin(), shop_remove_line(), shop_upsert_line() · löscht Zeilen: shop_admin_set_line(), shop_remove_line(), shop_upsert_line()

**Trigger auf dieser Tabelle:** trg_shop_order_line_updated → set_updated_at(), trg_shop_order_line_fulfil → trg_shop_order_line_fulfil()

**Seiten (lesen/schreiben):** /admin/partner, /partner, API-Route: /api/partner/shop/angebot

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `order_id` | uuid | technisch | shop_admin_set_line(), shop_upsert_line() | /admin/partner, /partner | |
| `product_sku` | text | fachlich | shop_admin_set_line(), shop_upsert_line() | /admin/partner, /partner | |
| `name_de` | text | fachlich | shop_admin_set_line(), shop_confirm(), shop_quote_begin(), shop_upsert_line() | /admin/partner, /partner | |
| `name_en` | text | fachlich | shop_admin_set_line(), shop_confirm(), shop_quote_begin(), shop_upsert_line() | /admin/partner, /partner | |
| `category` | text | fachlich | shop_admin_set_line(), shop_confirm(), shop_quote_begin(), shop_upsert_line() | /admin/partner, /partner | |
| `unit` | text | fachlich | shop_admin_set_line(), shop_confirm(), shop_quote_begin(), shop_upsert_line() | /admin/partner, /partner | |
| `vat_rate` | numeric | fachlich | shop_admin_set_line(), shop_confirm(), shop_quote_begin(), shop_upsert_line() | /admin/partner, /partner | |
| `price_net_cents` | integer | fachlich | shop_admin_set_line(), shop_confirm(), shop_quote_begin(), shop_upsert_line() | /admin/partner, /partner | |
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
| `pass_type` | text | fachlich | request_ticket_increase() | /partner | |
| `quantity` | integer | fachlich | request_ticket_increase() | /partner | |

## 6. Tickets & Einlass

### `ticket`

**Zweck:** Ticket aus vivenu (Barcode = QR) oder Freiticket (Crew/Speaker). Badge-Felder werden nach vivenu zurückgeschrieben.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** anonymize_person(), backfill_ticket_pass_types(), cancel_companion_ticket(), checkin_scan(), confirm_companion_ticket(), decline_companion_ticket(), ingest_vivenu_ticket(), link_tickets_to_person(), mark_ticket_writeback(), personalize_ticket(), remind_ticket_personalization(), request_companion_ticket(), set_ticket_issued(), set_ticket_lounge(), set_updated_at() [Trigger trg_ticket_updated], speaker_profile_tickets_sync(), speaker_ticket_create(), team_add_companion_ticket(), trg_ticket_volunteer_redeem() [Trigger ticket_volunteer_redeem]

**Trigger auf dieser Tabelle:** trg_ticket_updated → set_updated_at(), ticket_volunteer_redeem → trg_ticket_volunteer_redeem()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** /tickets/bestaetigung, Cron: /api/cron/ticket-erinnerung, Cron: /api/cron/vivenu-tickets

**Seiten (lesen/schreiben):** /admin, /admin/speaker-tickets, /checkin, /meine, /speaker/tickets, /tickets/bestaetigung, Cron: /api/cron/ticket-erinnerung, Cron: /api/cron/vivenu-tickets, Webhook: /api/webhooks/vivenu

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `event_id` | uuid | technisch | ingest_vivenu_ticket(), request_companion_ticket(), speaker_ticket_create(), team_add_companion_ticket() | /admin/speaker-tickets, /speaker/tickets, /tickets/bestaetigung | |
| `person_id` | uuid | technisch | ingest_vivenu_ticket(), link_tickets_to_person(), personalize_ticket(), speaker_ticket_create() | /tickets/bestaetigung | |
| `ticket_type_map_id` | uuid | technisch | backfill_ticket_pass_types(), ingest_vivenu_ticket(), set_ticket_issued() | /admin/speaker-tickets, /tickets/bestaetigung | |
| `pass_type` | text | fachlich | backfill_ticket_pass_types(), ingest_vivenu_ticket(), request_companion_ticket(), speaker_profile_tickets_sync(), speaker_ticket_create(), team_add_companion_ticket() | /admin/speaker-tickets, /speaker/tickets, /tickets/bestaetigung | |
| `barcode` | text | fachlich | ingest_vivenu_ticket(), set_ticket_issued() | /admin/speaker-tickets, /tickets/bestaetigung | |
| `vivenu_ticket_id` | text | technisch | ingest_vivenu_ticket(), set_ticket_issued() | /admin/speaker-tickets, /tickets/bestaetigung | |
| `vivenu_transaction_id` | text | technisch | ingest_vivenu_ticket(), set_ticket_issued() | /admin/speaker-tickets, /tickets/bestaetigung | |
| `vivenu_customer_id` | text | technisch | ingest_vivenu_ticket() | /tickets/bestaetigung | |
| `buyer_email` | extensions.citext | fachlich | anonymize_person(), ingest_vivenu_ticket() | /tickets/bestaetigung | |
| `holder_email` | extensions.citext | fachlich | anonymize_person(), ingest_vivenu_ticket(), personalize_ticket(), request_companion_ticket(), speaker_ticket_create(), team_add_companion_ticket() | /admin/speaker-tickets, /speaker/tickets, /tickets/bestaetigung | |
| `holder_first_name` | text | fachlich | anonymize_person(), ingest_vivenu_ticket(), personalize_ticket(), request_companion_ticket(), speaker_ticket_create(), team_add_companion_ticket() | /admin/speaker-tickets, /speaker/tickets, /tickets/bestaetigung | |
| `holder_last_name` | text | fachlich | anonymize_person(), ingest_vivenu_ticket(), personalize_ticket(), request_companion_ticket(), speaker_ticket_create(), team_add_companion_ticket() | /admin/speaker-tickets, /speaker/tickets, /tickets/bestaetigung | |
| `holder_company` | text | fachlich | anonymize_person(), ingest_vivenu_ticket(), personalize_ticket(), speaker_ticket_create() | /tickets/bestaetigung | |
| `holder_position` | text | fachlich | anonymize_person(), personalize_ticket(), speaker_ticket_create() | /tickets/bestaetigung | |
| `status` | text | fachlich | cancel_companion_ticket(), confirm_companion_ticket(), decline_companion_ticket(), ingest_vivenu_ticket(), request_companion_ticket(), set_ticket_issued(), speaker_profile_tickets_sync(), speaker_ticket_create(), team_add_companion_ticket(), trg_ticket_volunteer_redeem() [Trigger ticket_volunteer_redeem] | /admin, /admin/speaker-tickets, /speaker/tickets, /tickets/bestaetigung | |
| `personalization_status` | text | fachlich | ingest_vivenu_ticket(), personalize_ticket(), request_companion_ticket(), speaker_ticket_create(), team_add_companion_ticket() | /admin/speaker-tickets, /speaker/tickets, /tickets/bestaetigung | |
| `addons` | jsonb | fachlich | ingest_vivenu_ticket() | /tickets/bestaetigung | |
| `price_cents` | integer | fachlich | ingest_vivenu_ticket(), request_companion_ticket(), speaker_ticket_create(), team_add_companion_ticket() | /admin/speaker-tickets, /speaker/tickets, /tickets/bestaetigung | |
| `currency` | text | fachlich | ingest_vivenu_ticket() | /tickets/bestaetigung | |
| `source` | text | fachlich | ingest_vivenu_ticket(), request_companion_ticket(), speaker_ticket_create(), team_add_companion_ticket() | /admin/speaker-tickets, /speaker/tickets, /tickets/bestaetigung | |
| `purchased_at` | timestamp with time zone | technisch | ingest_vivenu_ticket(), set_ticket_issued() | /admin/speaker-tickets, /tickets/bestaetigung | |
| `personalized_at` | timestamp with time zone | technisch | personalize_ticket() | /tickets/bestaetigung | |
| `checked_in_at` | timestamp with time zone | technisch | checkin_scan() | /checkin | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | backfill_ticket_pass_types(), ingest_vivenu_ticket(), link_tickets_to_person(), mark_ticket_writeback(), set_updated_at() [Trigger trg_ticket_updated] | /tickets/bestaetigung | |
| `speaker_profile_id` | uuid | technisch | request_companion_ticket(), speaker_ticket_create(), team_add_companion_ticket() | /admin/speaker-tickets, /speaker/tickets | |
| `lounge_access` | boolean | fachlich | request_companion_ticket(), set_ticket_lounge(), speaker_profile_tickets_sync(), speaker_ticket_create(), team_add_companion_ticket() | /admin/speaker-tickets, /speaker/tickets | |
| `team_note` | text | fachlich | anonymize_person(), confirm_companion_ticket(), decline_companion_ticket(), speaker_profile_tickets_sync() | /admin | |
| `requested_by` | uuid | technisch | request_companion_ticket(), speaker_ticket_create(), team_add_companion_ticket() | /admin/speaker-tickets, /speaker/tickets | |
| `approved_by` | uuid | technisch | confirm_companion_ticket(), decline_companion_ticket(), team_add_companion_ticket() | /admin, /admin/speaker-tickets | |
| `approved_at` | timestamp with time zone | technisch | confirm_companion_ticket(), decline_companion_ticket(), team_add_companion_ticket() | /admin, /admin/speaker-tickets | |
| `meta` | jsonb | fachlich | ingest_vivenu_ticket() | /tickets/bestaetigung | |
| `extra_fields` | jsonb | fachlich | anonymize_person(), ingest_vivenu_ticket() | /tickets/bestaetigung | |
| `vivenu_discount_id` | text | technisch | ingest_vivenu_ticket() | /tickets/bestaetigung | |
| `vivenu_updated_at` | timestamp with time zone | technisch | ingest_vivenu_ticket() | /tickets/bestaetigung | |
| `vivenu_ticket_type_id` | text | technisch | ingest_vivenu_ticket() | /tickets/bestaetigung | |
| `vivenu_undershop_id` | text | technisch | ingest_vivenu_ticket() | /tickets/bestaetigung | |
| `vivenu_writeback_pending` | boolean | fachlich | mark_ticket_writeback() | /tickets/bestaetigung | |
| `vivenu_mailed_at` | timestamp with time zone | technisch |  |  | |
| `personalization_reminded_at` | timestamp with time zone | technisch | remind_ticket_personalization() |  | |

### `ticket_secret`

**Zweck:** vivenu-Ticket-Secrets für die Personalisierung. Keine Grants, keine Policy — nur service_role.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_ticket_secret()

**Seiten (lesen/schreiben):** /admin/speaker-tickets

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `ticket_id` | uuid | technisch | set_ticket_secret() | /admin/speaker-tickets | |
| `secret` | text | fachlich | set_ticket_secret() | /admin/speaker-tickets | |
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

**Schreibwege (Funktionen/Trigger):** ack_volunteer_safety(), anonymize_person(), apply_volunteer(), remind_volunteer_tickets(), set_updated_at() [Trigger trg_volunteer_profile_updated], set_volunteer_coupon(), set_volunteer_status(), trg_ticket_volunteer_redeem(), trg_volunteer_status_coupon() [Trigger volunteer_status_coupon], update_my_volunteer_profile()

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
| `availability` | jsonb | fachlich | anonymize_person(), apply_volunteer(), update_my_volunteer_profile() | /volunteers | |
| `buddy_person_id` | uuid | technisch | anonymize_person(), apply_volunteer() | /volunteers | |
| `buddy_note` | text | fachlich | anonymize_person(), apply_volunteer(), update_my_volunteer_profile() | /volunteers | |
| `notes_internal` | text | fachlich | anonymize_person() |  | |
| `applied_at` | timestamp with time zone | technisch |  |  | |
| `decided_at` | timestamp with time zone | technisch | set_volunteer_status() | /admin/volunteers | |
| `decided_by` | uuid | technisch | set_volunteer_status() | /admin/volunteers | |
| `decision_note` | text | fachlich | anonymize_person(), set_volunteer_status() | /admin/volunteers | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_volunteer_profile_updated], set_volunteer_coupon(), trg_ticket_volunteer_redeem() |  | |
| `coupon_code` | text | fachlich | set_volunteer_coupon(), trg_volunteer_status_coupon() [Trigger volunteer_status_coupon] |  | |
| `vivenu_coupon_id` | text | technisch | set_volunteer_coupon(), trg_volunteer_status_coupon() [Trigger volunteer_status_coupon] |  | |
| `coupon_status` | text | fachlich | set_volunteer_coupon(), trg_ticket_volunteer_redeem(), trg_volunteer_status_coupon() [Trigger volunteer_status_coupon] |  | |
| `coupon_issued_at` | timestamp with time zone | technisch | set_volunteer_coupon(), trg_volunteer_status_coupon() [Trigger volunteer_status_coupon] |  | |
| `redeemed_at` | timestamp with time zone | technisch | trg_ticket_volunteer_redeem() |  | |
| `ticket_id` | uuid | technisch | trg_ticket_volunteer_redeem() |  | |
| `coupon_error` | text | fachlich | anonymize_person(), set_volunteer_coupon(), trg_volunteer_status_coupon() [Trigger volunteer_status_coupon] |  | |
| `reminded_at` | timestamp with time zone | technisch | remind_volunteer_tickets(), trg_volunteer_status_coupon() [Trigger volunteer_status_coupon] |  | |
| `safety_ack_at` | timestamp with time zone | technisch | ack_volunteer_safety() | /volunteers | |
| `safety_ack_version` | text | fachlich | ack_volunteer_safety() | /volunteers | |

### `shift`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** apply_shift_templates(), set_updated_at() [Trigger trg_shift_updated], upsert_shift()

**Trigger auf dieser Tabelle:** trg_shift_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/volunteers

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `edition_id` | uuid | technisch | apply_shift_templates(), upsert_shift() | /admin/volunteers | |
| `event_day_id` | uuid | technisch | apply_shift_templates(), upsert_shift() | /admin/volunteers | |
| `area` | text | fachlich | apply_shift_templates(), upsert_shift() | /admin/volunteers | |
| `position` | text | fachlich | apply_shift_templates(), upsert_shift() | /admin/volunteers | |
| `start_at` | timestamp with time zone | technisch | apply_shift_templates(), upsert_shift() | /admin/volunteers | |
| `end_at` | timestamp with time zone | technisch | apply_shift_templates(), upsert_shift() | /admin/volunteers | |
| `capacity` | integer | fachlich | apply_shift_templates(), upsert_shift() | /admin/volunteers | |
| `overbook` | integer | fachlich | apply_shift_templates(), upsert_shift() | /admin/volunteers | |
| `location` | text | fachlich | apply_shift_templates(), upsert_shift() | /admin/volunteers | |
| `lead_person_id` | uuid | technisch | upsert_shift() | /admin/volunteers | |
| `briefing_md` | text | fachlich | apply_shift_templates(), upsert_shift() | /admin/volunteers | |
| `active` | boolean | fachlich | apply_shift_templates(), upsert_shift() | /admin/volunteers | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_shift_updated] |  | |
| `template_id` | uuid | technisch | apply_shift_templates() | /admin/volunteers | |

### `shift_assignment`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** anonymize_person(), assign_shift(), confirm_shift(), decline_shift(), promote_shift_waitlist(), send_shift_reminders(), set_updated_at() [Trigger trg_shift_assignment_updated], unassign_shift() · löscht Zeilen: unassign_shift()

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
| `decline_reason` | text | fachlich | anonymize_person(), decline_shift() | /volunteers | |
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

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20261010145420_v6_hackathon_skill_vokabular.sql), anonymize_person(), answer_hack_request(), apply_hackathon(), join_hack_team(), leave_hack_team(), set_hack_application_status(), set_hack_seeking()

**Seiten (lesen/schreiben):** /admin/hackathon, /hackathon

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id` | uuid | technisch | apply_hackathon() | /hackathon | |
| `edition_id` | uuid | technisch | apply_hackathon() | /hackathon | |
| `skills` | text[] | fachlich | Migration/Seed (20261010145420_v6_hackathon_skill_vokabular.sql), apply_hackathon() | /hackathon | |
| `motivation` | text | fachlich | anonymize_person(), apply_hackathon() | /hackathon | |
| `team_pref` | text | fachlich | anonymize_person(), apply_hackathon() | /hackathon | |
| `team_id` | uuid | technisch | answer_hack_request(), join_hack_team(), leave_hack_team() | /hackathon | |
| `status` | text | fachlich | set_hack_application_status() | /admin/hackathon | |
| `applied_at` | timestamp with time zone | technisch |  |  | |
| `decided_at` | timestamp with time zone | technisch | set_hack_application_status() | /admin/hackathon | |
| `decided_by` | uuid | technisch | set_hack_application_status() | /admin/hackathon | |
| `note` | text | fachlich | anonymize_person(), set_hack_application_status() | /admin/hackathon | |
| `github_url` | text | fachlich | anonymize_person(), apply_hackathon() | /hackathon | |
| `website_url` | text | fachlich | anonymize_person(), apply_hackathon() | /hackathon | |
| `behance_url` | text | fachlich | anonymize_person(), apply_hackathon() | /hackathon | |
| `track_prefs` | text[] | fachlich | apply_hackathon() | /hackathon | |
| `seeking_team` | boolean | fachlich | answer_hack_request(), set_hack_seeking() | /hackathon | |
| `challenge_prefs` | uuid[] | fachlich | apply_hackathon() | /hackathon | |

### `hack_challenge`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** publish_hack_challenge(), set_hack_challenge_deadline(), set_hack_challenge_judging(), set_hack_challenge_profile(), set_hack_challenge_track()

**Seiten (lesen/schreiben):** /admin/hackathon, /hackathon, lib

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
| `updated_at` | timestamp with time zone | technisch | set_hack_challenge_deadline(), set_hack_challenge_judging(), set_hack_challenge_profile(), set_hack_challenge_track() | /admin/hackathon | |
| `track` | text | fachlich | publish_hack_challenge(), set_hack_challenge_track() | /admin/hackathon, /hackathon | |
| `judging_mode` | text | fachlich | publish_hack_challenge(), set_hack_challenge_judging() | /admin/hackathon, /hackathon | |
| `metric_label` | text | fachlich | publish_hack_challenge(), set_hack_challenge_judging() | /admin/hackathon, /hackathon | |
| `metric_higher_better` | boolean | fachlich | publish_hack_challenge(), set_hack_challenge_judging() | /admin/hackathon, /hackathon | |
| `submission_deadline` | timestamp with time zone | fachlich | set_hack_challenge_deadline() | /admin/hackathon | |
| `target_study_fields` | text[] | fachlich | set_hack_challenge_profile() |  | |
| `target_skills` | text[] | fachlich | set_hack_challenge_profile() |  | |
| `target_profile` | text | fachlich | set_hack_challenge_profile() |  | |

### `hack_team`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20261010145420_v6_hackathon_skill_vokabular.sql), assign_challenges(), create_hack_team(), leave_hack_team(), set_hack_team_looking(), set_team_challenge()

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
| `updated_at` | timestamp with time zone | technisch | assign_challenges(), leave_hack_team(), set_hack_team_looking(), set_team_challenge() | /hackathon | |
| `looking` | boolean | fachlich | set_hack_team_looking() | /hackathon | |
| `looking_skills` | text[] | fachlich | Migration/Seed (20261010145420_v6_hackathon_skill_vokabular.sql), set_hack_team_looking() | /hackathon | |
| `looking_note` | text | fachlich | set_hack_team_looking() | /hackathon | |

### `hack_team_member`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** answer_hack_request(), create_hack_team(), join_hack_team(), leave_hack_team() · löscht Zeilen: leave_hack_team()

**Trigger auf dieser Tabelle:** hack_team_size → trg_hack_team_size(), hack_member_edition → trg_hack_member_edition()

**Seiten (lesen/schreiben):** /hackathon

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `team_id` | uuid | technisch | answer_hack_request(), create_hack_team(), join_hack_team() | /hackathon | |
| `person_id` | uuid | technisch | answer_hack_request(), create_hack_team(), join_hack_team() | /hackathon | |
| `edition_id` | uuid | technisch | answer_hack_request(), create_hack_team(), join_hack_team() | /hackathon | |
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
| `late` | boolean | fachlich | submit_hack() | /hackathon | |

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

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260915114852_v5_wiki_inhalte.sql), Migration/Seed (20260921110522_v6_wiki_hackathon.sql), Migration/Seed (20261008083319_v6_wiki_thema_produktbezug.sql), Migration/Seed (20261008142621_v6_wiki_en_entwuerfe.sql), Migration/Seed (20261009080045_v6_wiki_zwischenueberschriften.sql), delete_kb_article(), publish_kb_article(), upsert_kb_article()

**Trigger auf dieser Tabelle:** trg_kb_article_chunks → trg_kb_article_chunks()

**Seiten (lesen/schreiben):** /admin/wiki

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `slug` | text | fachlich | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), Migration/Seed (20260921110522_v6_wiki_hackathon.sql), Migration/Seed (20261008142621_v6_wiki_en_entwuerfe.sql), upsert_kb_article() | /admin/wiki | |
| `edition_id` | uuid | technisch | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), Migration/Seed (20260921110522_v6_wiki_hackathon.sql), Migration/Seed (20261008142621_v6_wiki_en_entwuerfe.sql), upsert_kb_article() | /admin/wiki | |
| `language` | text | fachlich | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), Migration/Seed (20260921110522_v6_wiki_hackathon.sql), Migration/Seed (20261008142621_v6_wiki_en_entwuerfe.sql), upsert_kb_article() | /admin/wiki | |
| `audience` | text[] | fachlich | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), Migration/Seed (20260921110522_v6_wiki_hackathon.sql), Migration/Seed (20261008142621_v6_wiki_en_entwuerfe.sql), upsert_kb_article() | /admin/wiki | |
| `roles` | text[] | fachlich | Migration/Seed (20260921110522_v6_wiki_hackathon.sql), Migration/Seed (20261008142621_v6_wiki_en_entwuerfe.sql), upsert_kb_article() | /admin/wiki | |
| `phase` | text | fachlich | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), Migration/Seed (20260921110522_v6_wiki_hackathon.sql), Migration/Seed (20261008142621_v6_wiki_en_entwuerfe.sql), upsert_kb_article() | /admin/wiki | |
| `title` | text | fachlich | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), Migration/Seed (20260921110522_v6_wiki_hackathon.sql), Migration/Seed (20261008142621_v6_wiki_en_entwuerfe.sql), upsert_kb_article() | /admin/wiki | |
| `body_md` | text | fachlich | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), Migration/Seed (20260921110522_v6_wiki_hackathon.sql), Migration/Seed (20261008142621_v6_wiki_en_entwuerfe.sql), Migration/Seed (20261009080045_v6_wiki_zwischenueberschriften.sql), upsert_kb_article() | /admin/wiki | |
| `status` | text | fachlich | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), Migration/Seed (20260921110522_v6_wiki_hackathon.sql), Migration/Seed (20261008142621_v6_wiki_en_entwuerfe.sql), delete_kb_article(), publish_kb_article(), upsert_kb_article() | /admin/wiki | |
| `valid_until` | timestamp with time zone | fachlich | Migration/Seed (20261008142621_v6_wiki_en_entwuerfe.sql), upsert_kb_article() | /admin/wiki | |
| `owner_person_id` | uuid | technisch | Migration/Seed (20261008142621_v6_wiki_en_entwuerfe.sql), upsert_kb_article() | /admin/wiki | |
| `sort_order` | integer | fachlich | Migration/Seed (20260915114852_v5_wiki_inhalte.sql), Migration/Seed (20260921110522_v6_wiki_hackathon.sql), Migration/Seed (20261008142621_v6_wiki_en_entwuerfe.sql), upsert_kb_article() | /admin/wiki | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | delete_kb_article(), publish_kb_article(), upsert_kb_article() | /admin/wiki | |
| `updated_by` | uuid | technisch | delete_kb_article(), publish_kb_article(), upsert_kb_article() | /admin/wiki | |
| `published_at` | timestamp with time zone | technisch | publish_kb_article() | /admin/wiki | |
| `category` | text | fachlich | Migration/Seed (20261008083319_v6_wiki_thema_produktbezug.sql), Migration/Seed (20261008142621_v6_wiki_en_entwuerfe.sql), upsert_kb_article() | /admin/wiki | |
| `product_formats` | text[] | fachlich | Migration/Seed (20261008083319_v6_wiki_thema_produktbezug.sql), Migration/Seed (20261008142621_v6_wiki_en_entwuerfe.sql), upsert_kb_article() | /admin/wiki | |

### `mail_log`

**Zweck:** Jede versendete oder unterdrückte Mail mit Zustellstatus (Resend-Webhooks aktualisieren status).

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** anonymize_person(), cancel_queued_mail(), invite_to_side_event(), partner_mail_cc(), queue_mail(), queue_mail_debounced(), requeue_mail(), set_updated_at() [Trigger trg_mail_log_updated], update_partner_contact()

**Trigger auf dieser Tabelle:** trg_mail_log_updated → set_updated_at()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** Cron: /api/cron/mail, lib

**Seiten (lesen/schreiben):** /admin/mail, /admin/partner, /admin/side-events, /partner, Cron: /api/cron/mail, lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | bigint | technisch |  |  | |
| `to_email` | extensions.citext | fachlich | anonymize_person(), queue_mail(), requeue_mail(), update_partner_contact() | /admin/mail, /admin/partner, /partner | |
| `person_id` | uuid | technisch | queue_mail(), requeue_mail() | /admin/mail | |
| `template_key` | text | fachlich | queue_mail(), requeue_mail() | /admin/mail | |
| `locale` | text | fachlich | queue_mail(), requeue_mail() | /admin/mail | |
| `subject` | text | fachlich |  |  | |
| `provider` | text | fachlich | queue_mail() |  | |
| `provider_id` | text | technisch |  |  | |
| `status` | text | fachlich | cancel_queued_mail(), queue_mail(), requeue_mail() | /admin/mail | |
| `error` | text | fachlich |  |  | |
| `meta` | jsonb | fachlich | anonymize_person(), cancel_queued_mail(), invite_to_side_event(), partner_mail_cc(), queue_mail(), queue_mail_debounced(), requeue_mail(), update_partner_contact() | /admin/mail, /admin/partner, /admin/side-events, /partner | |
| `related_type` | text | fachlich | queue_mail(), requeue_mail() | /admin/mail | |
| `related_id` | uuid | technisch | queue_mail(), requeue_mail() | /admin/mail | |
| `queued_at` | timestamp with time zone | technisch |  |  | |
| `sent_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | cancel_queued_mail(), partner_mail_cc(), queue_mail_debounced(), set_updated_at() [Trigger trg_mail_log_updated], update_partner_contact() | /admin/partner, /partner | |
| `send_after` | timestamp with time zone | fachlich | queue_mail_debounced() |  | |

### `mail_template`

**Zweck:** System-Mails DE/EN. Versand über Resend (lib/mail), Rendering aus Markdown.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908151704_v2_fix_mail_template_newlines.sql), Migration/Seed (20260910074957_v2_application_mails_queue.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910111622_v2_hospitality.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910115407_v2_speaker_tickets.sql), Migration/Seed (20260910125130_v2_presentation_reminder_manager_scope.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260910172455_v3_partner_reminders.sql), Migration/Seed (20260911070632_v3_shop.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914095318_v4_volunteer_tickets.sql), Migration/Seed (20260917185916_v6_session_grafiken.sql), Migration/Seed (20260918105546_v6_profil_loeschen.sql), Migration/Seed (20260924102901_v6_zusatztickets.sql), Migration/Seed (20260925093316_v6_ticket_final_mail.sql), Migration/Seed (20260925102305_v6_talk_speaker_zugang.sql), Migration/Seed (20261005170530_v6_speaker_tickets_final.sql), Migration/Seed (20261008081953_v6_team_hinweismail.sql), Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261008102417_v6_mail_verzoegert.sql), Migration/Seed (20261010145422_v6_ticket_versand_erinnerung.sql), set_updated_at() [Trigger trg_mail_template_updated/trg_mail_template_updated], upsert_mail_template()

**Trigger auf dieser Tabelle:** trg_mail_template_updated → set_updated_at(), trg_mail_template_updated → set_updated_at()

**Seiten (lesen/schreiben):** lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `key` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260910074957_v2_application_mails_queue.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910111622_v2_hospitality.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910115407_v2_speaker_tickets.sql), Migration/Seed (20260910125130_v2_presentation_reminder_manager_scope.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260910172455_v3_partner_reminders.sql), Migration/Seed (20260911070632_v3_shop.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914095318_v4_volunteer_tickets.sql), Migration/Seed (20260917185916_v6_session_grafiken.sql), Migration/Seed (20260918105546_v6_profil_loeschen.sql), Migration/Seed (20260924102901_v6_zusatztickets.sql), Migration/Seed (20260925093316_v6_ticket_final_mail.sql), Migration/Seed (20260925102305_v6_talk_speaker_zugang.sql), Migration/Seed (20261008081953_v6_team_hinweismail.sql), Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261008102417_v6_mail_verzoegert.sql), Migration/Seed (20261010145422_v6_ticket_versand_erinnerung.sql), upsert_mail_template() |  | |
| `locale` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260910074957_v2_application_mails_queue.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910111622_v2_hospitality.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910115407_v2_speaker_tickets.sql), Migration/Seed (20260910125130_v2_presentation_reminder_manager_scope.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260910172455_v3_partner_reminders.sql), Migration/Seed (20260911070632_v3_shop.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914095318_v4_volunteer_tickets.sql), Migration/Seed (20260917185916_v6_session_grafiken.sql), Migration/Seed (20260918105546_v6_profil_loeschen.sql), Migration/Seed (20260924102901_v6_zusatztickets.sql), Migration/Seed (20260925093316_v6_ticket_final_mail.sql), Migration/Seed (20260925102305_v6_talk_speaker_zugang.sql), Migration/Seed (20261008081953_v6_team_hinweismail.sql), Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261008102417_v6_mail_verzoegert.sql), Migration/Seed (20261010145422_v6_ticket_versand_erinnerung.sql), upsert_mail_template() |  | |
| `version` | integer | fachlich | Migration/Seed (20260910074957_v2_application_mails_queue.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910111622_v2_hospitality.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910115407_v2_speaker_tickets.sql), Migration/Seed (20260910125130_v2_presentation_reminder_manager_scope.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260910172455_v3_partner_reminders.sql), Migration/Seed (20260911070632_v3_shop.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260917185916_v6_session_grafiken.sql), Migration/Seed (20260918105546_v6_profil_loeschen.sql), Migration/Seed (20260924102901_v6_zusatztickets.sql), Migration/Seed (20260925093316_v6_ticket_final_mail.sql), Migration/Seed (20260925102305_v6_talk_speaker_zugang.sql), Migration/Seed (20261005170530_v6_speaker_tickets_final.sql), Migration/Seed (20261008081953_v6_team_hinweismail.sql), Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261008102417_v6_mail_verzoegert.sql), upsert_mail_template() |  | |
| `subject` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260910074957_v2_application_mails_queue.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910111622_v2_hospitality.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910115407_v2_speaker_tickets.sql), Migration/Seed (20260910125130_v2_presentation_reminder_manager_scope.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260910172455_v3_partner_reminders.sql), Migration/Seed (20260911070632_v3_shop.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914095318_v4_volunteer_tickets.sql), Migration/Seed (20260917185916_v6_session_grafiken.sql), Migration/Seed (20260918105546_v6_profil_loeschen.sql), Migration/Seed (20260924102901_v6_zusatztickets.sql), Migration/Seed (20260925093316_v6_ticket_final_mail.sql), Migration/Seed (20260925102305_v6_talk_speaker_zugang.sql), Migration/Seed (20261008081953_v6_team_hinweismail.sql), Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261008102417_v6_mail_verzoegert.sql), Migration/Seed (20261010145422_v6_ticket_versand_erinnerung.sql), upsert_mail_template() |  | |
| `body_md` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908151704_v2_fix_mail_template_newlines.sql), Migration/Seed (20260910074957_v2_application_mails_queue.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910111622_v2_hospitality.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910115407_v2_speaker_tickets.sql), Migration/Seed (20260910125130_v2_presentation_reminder_manager_scope.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260910172455_v3_partner_reminders.sql), Migration/Seed (20260911070632_v3_shop.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914095318_v4_volunteer_tickets.sql), Migration/Seed (20260917185916_v6_session_grafiken.sql), Migration/Seed (20260918105546_v6_profil_loeschen.sql), Migration/Seed (20260924102901_v6_zusatztickets.sql), Migration/Seed (20260925093316_v6_ticket_final_mail.sql), Migration/Seed (20260925102305_v6_talk_speaker_zugang.sql), Migration/Seed (20261005170530_v6_speaker_tickets_final.sql), Migration/Seed (20261008081953_v6_team_hinweismail.sql), Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261008102417_v6_mail_verzoegert.sql), Migration/Seed (20261010145422_v6_ticket_versand_erinnerung.sql), upsert_mail_template() |  | |
| `description` | text | fachlich | Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260910074957_v2_application_mails_queue.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910111622_v2_hospitality.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910115407_v2_speaker_tickets.sql), Migration/Seed (20260910125130_v2_presentation_reminder_manager_scope.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260910172455_v3_partner_reminders.sql), Migration/Seed (20260911070632_v3_shop.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260917185916_v6_session_grafiken.sql), Migration/Seed (20260918105546_v6_profil_loeschen.sql), Migration/Seed (20260924102901_v6_zusatztickets.sql), Migration/Seed (20260925093316_v6_ticket_final_mail.sql), Migration/Seed (20260925102305_v6_talk_speaker_zugang.sql), Migration/Seed (20261008081953_v6_team_hinweismail.sql), Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261008102417_v6_mail_verzoegert.sql), upsert_mail_template() |  | |
| `active` | boolean | fachlich | Migration/Seed (20260910074957_v2_application_mails_queue.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910111622_v2_hospitality.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910115407_v2_speaker_tickets.sql), Migration/Seed (20260910125130_v2_presentation_reminder_manager_scope.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260910163331_v3_partner_deliverables.sql), Migration/Seed (20260910170349_v3_hubspot_ingest.sql), Migration/Seed (20260910172455_v3_partner_reminders.sql), Migration/Seed (20260911070632_v3_shop.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914095318_v4_volunteer_tickets.sql), Migration/Seed (20260917185916_v6_session_grafiken.sql), Migration/Seed (20260918105546_v6_profil_loeschen.sql), Migration/Seed (20260924102901_v6_zusatztickets.sql), Migration/Seed (20260925093316_v6_ticket_final_mail.sql), Migration/Seed (20260925102305_v6_talk_speaker_zugang.sql), Migration/Seed (20261008081953_v6_team_hinweismail.sql), Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261008102417_v6_mail_verzoegert.sql), Migration/Seed (20261010145422_v6_ticket_versand_erinnerung.sql), upsert_mail_template() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_mail_template_updated/trg_mail_template_updated] |  | |
| `updated_by` | uuid | technisch | upsert_mail_template() |  | |

### `portal_video`

**Zweck:** Eingebettete Videos je Schlüssel (F9.4). Seiten binden über `key` ein, der Link ist Redaktionssache. Nur Loom — der CHECK und die CSP gehören zusammen.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20261001130657_v6_medien_event_app_loom.sql), delete_portal_video(), upsert_portal_video() · löscht Zeilen: delete_portal_video()

**Seiten (lesen/schreiben):** /admin/videos

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `key` | text | fachlich | Migration/Seed (20261001130657_v6_medien_event_app_loom.sql), upsert_portal_video() | /admin/videos | |
| `title_de` | text | fachlich | Migration/Seed (20261001130657_v6_medien_event_app_loom.sql), upsert_portal_video() | /admin/videos | |
| `title_en` | text | fachlich | Migration/Seed (20261001130657_v6_medien_event_app_loom.sql), upsert_portal_video() | /admin/videos | |
| `url` | text | fachlich | Migration/Seed (20261001130657_v6_medien_event_app_loom.sql), upsert_portal_video() | /admin/videos | |
| `audience` | text[] | fachlich | Migration/Seed (20261001130657_v6_medien_event_app_loom.sql), upsert_portal_video() | /admin/videos | |
| `edition_id` | uuid | technisch | upsert_portal_video() | /admin/videos | |
| `sort_order` | integer | fachlich | Migration/Seed (20261001130657_v6_medien_event_app_loom.sql), upsert_portal_video() | /admin/videos | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | upsert_portal_video() | /admin/videos | |

### `edition_contact`

**Zweck:** Ansprechpartner je Edition (F9.1). Dienstliche Mailadresse per CHECK erzwungen; die Nummer ist Pflicht, aber nicht prüfbar — gemeint ist die dienstliche.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** delete_edition_contact(), upsert_edition_contact() · löscht Zeilen: delete_edition_contact()

**Seiten (lesen/schreiben):** /admin/ansprechpartner, /admin/company-tours

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `edition_id` | uuid | technisch | upsert_edition_contact() | /admin/ansprechpartner, /admin/company-tours | |
| `type` | text | fachlich | upsert_edition_contact() | /admin/ansprechpartner, /admin/company-tours | |
| `display_name` | text | fachlich | upsert_edition_contact() | /admin/ansprechpartner, /admin/company-tours | |
| `role_label_de` | text | fachlich | upsert_edition_contact() | /admin/ansprechpartner, /admin/company-tours | |
| `role_label_en` | text | fachlich | upsert_edition_contact() | /admin/ansprechpartner, /admin/company-tours | |
| `email` | extensions.citext | fachlich | upsert_edition_contact() | /admin/ansprechpartner, /admin/company-tours | |
| `phone` | text | fachlich | upsert_edition_contact() | /admin/ansprechpartner, /admin/company-tours | |
| `photo_path` | text | fachlich | upsert_edition_contact() | /admin/ansprechpartner, /admin/company-tours | |
| `is_default` | boolean | fachlich | upsert_edition_contact() | /admin/ansprechpartner, /admin/company-tours | |
| `sort_order` | integer | fachlich | upsert_edition_contact() | /admin/ansprechpartner, /admin/company-tours | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | upsert_edition_contact() | /admin/ansprechpartner, /admin/company-tours | |
| `contract_consent_at` | date | technisch | upsert_edition_contact() | /admin/ansprechpartner, /admin/company-tours | |

### `edition_file`

**Zweck:** Dateien, die einer Edition gehören und nicht einer Organisation: Hallenplan, Anfahrt, Aufbauplan. Privater Bucket `edition-files`, Pfad <edition_id>/<kind>/<datei>.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20261001130946_v6_hallenplan_zielgruppe.sql), delete_edition_file(), set_edition_file(), set_edition_file_preview(), set_updated_at() [Trigger trg_edition_file_updated] · löscht Zeilen: delete_edition_file()

**Trigger auf dieser Tabelle:** trg_edition_file_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/produktion/dateien, API-Route: /api/admin/media-kit, API-Route: /api/produktion/edition-files

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `edition_id` | uuid | technisch | set_edition_file() | /admin/produktion/dateien | |
| `kind` | text | fachlich | set_edition_file() | /admin/produktion/dateien | |
| `storage_path` | text | fachlich | set_edition_file() | /admin/produktion/dateien | |
| `filename` | text | fachlich | set_edition_file() | /admin/produktion/dateien | |
| `mime` | text | fachlich | set_edition_file() | /admin/produktion/dateien | |
| `size_bytes` | bigint | fachlich | set_edition_file() | /admin/produktion/dateien | |
| `label_de` | text | fachlich | set_edition_file() | /admin/produktion/dateien | |
| `label_en` | text | fachlich | set_edition_file() | /admin/produktion/dateien | |
| `audience` | text[] | fachlich | Migration/Seed (20261001130946_v6_hallenplan_zielgruppe.sql), set_edition_file() | /admin/produktion/dateien | |
| `sort_order` | integer | fachlich | set_edition_file() | /admin/produktion/dateien | |
| `uploaded_by` | uuid | technisch | set_edition_file() | /admin/produktion/dateien | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | Migration/Seed (20261001130946_v6_hallenplan_zielgruppe.sql), set_edition_file(), set_edition_file_preview(), set_updated_at() [Trigger trg_edition_file_updated] | /admin/produktion/dateien | |
| `preview_path` | text | fachlich | set_edition_file_preview() |  | |
| `preview_width` | integer | fachlich | set_edition_file_preview() |  | |
| `preview_height` | integer | fachlich | set_edition_file_preview() |  | |

### `vocab_term`

**Zweck:** _(kein Kommentar in schema.md)_

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260721160705_seed_vocab.sql), Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908175758_v2_service_role_grants_session_context.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260911120247_v3_vocab_org_type_foundation.sql), Migration/Seed (20260911121546_v3_vocab_org_type_service.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914094832_v4_produktion.sql), Migration/Seed (20260914095053_v4_wissensbasis.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260915113046_v5_ansprechpartner_und_zeiten.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260915115505_v5_catering.sql), Migration/Seed (20260915115707_v5_speaker_anreise.sql), Migration/Seed (20260915115751_v5_speaker_zusage_anrede.sql), Migration/Seed (20260917185916_v6_session_grafiken.sql), Migration/Seed (20260917190103_v6_partner_format_key.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260918142855_v6_shuttle.sql), Migration/Seed (20260918151535_v6_reception.sql), Migration/Seed (20260921101742_v6_speaker_kontakt.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), Migration/Seed (20260921115332_v6_company_tours.sql), Migration/Seed (20260921120434_v6_branche_aussteller.sql), Migration/Seed (20260922095139_v6_sponsoren_kategorien.sql), Migration/Seed (20260923105947_v6_session_themen.sql), Migration/Seed (20260923111840_v6_technik_neu_geschnitten.sql), Migration/Seed (20260923120811_v6_reisekosten_pauschale.sql), Migration/Seed (20260924133947_v6_kontakte_bearbeiten_cc.sql), Migration/Seed (20260924135111_v6_profilfelder.sql), Migration/Seed (20260924135400_v6_rollenmodell_abschnitte.sql), Migration/Seed (20260924193425_v6_reisemittel.sql), Migration/Seed (20260924194015_v6_eine_sprache.sql), Migration/Seed (20260925084552_v6_lead039_einordnung.sql), Migration/Seed (20260925092258_v6_lead039_verlauf.sql), Migration/Seed (20260925102305_v6_talk_speaker_zugang.sql), Migration/Seed (20260926090609_v6_media_kit.sql), Migration/Seed (20261001122557_v6_hack_tracks.sql), Migration/Seed (20261001123808_v6_logokategorie.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), Migration/Seed (20261002083323_v6_tour_zuordnung.sql), Migration/Seed (20261002085454_v6_produktionsliste_stand.sql), Migration/Seed (20261002085957_v6_benachrichtigungen.sql), Migration/Seed (20261002091904_v6_feedback.sql), Migration/Seed (20261002140832_v6_volunteers_schichtmodell.sql), Migration/Seed (20261002144630_v6_tour_typ_marketing.sql), Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261008083319_v6_wiki_thema_produktbezug.sql), Migration/Seed (20261008083344_v6_hack_eventseite.sql), Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261010145420_v6_hackathon_skill_vokabular.sql), delete_vocab_term(), set_updated_at() [Trigger trg_vocab_term_updated], upsert_vocab_term() · löscht Zeilen: delete_vocab_term()

**Trigger auf dieser Tabelle:** trg_vocab_term_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin, /admin/anreise, /admin/ansprechpartner, /admin/benachrichtigungen, /admin/bewerbungen, /admin/bewerbungen/[id], /admin/bewerbungen/sessions, /admin/bewerbungen/tickets, /admin/catering, /admin/community-events/[id], /admin/company-tours/zuordnung, /admin/einreichungen, /admin/feedback, /admin/hackathon, /admin/hospitality, /admin/initiativen/award, /admin/mail/vorlagen, /admin/medien, /admin/partner/[org], /admin/partner/integrationen, /admin/partner/kontingente, /admin/partner/logos, /admin/partner/produkte, /admin/personen, /admin/personen/[id], /admin/produktion/dateien, /admin/produktion/produkte, /admin/reisekosten, /admin/rollen, /admin/speaker, /admin/speaker-leads, /admin/speaker-tickets, /admin/speaker/[id], /admin/speaker/export, /admin/speaker/verlauf, /admin/verwaltung/einwilligungen, /admin/verwaltung/zugaenge, /admin/vokabular, /admin/volunteers, /admin/volunteers/schichten, /admin/volunteers/vorlagen, /admin/wiki, /award, /award/bewerben, /benachrichtigungen, /checkin, /feedback, /hackathon, /hackathon/challenges, /hackathon/schedule, /hackathon/teams, /meine, /onboarding, /partner, /partner/company-tour, /partner/hackathon, /partner/interview-tables, /partner/kontakte, /partner/masterclass, /partner/onboarding, /partner/shop, /partner/side-event, /partner/talk, /partner/tickets, /profil, /programm, /speaker-leads, /speaker-leads/anreise, /speaker/profil, /speaker/reisekosten, /speaker/session, /speaker/tickets, /speaker/travel, /tickets, /tickets/bestaetigung, /volunteers, /volunteers/schichten, /volunteers/team, API-Route: /api/admin/swapcard/sponsors

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `vocabulary` | text | fachlich | Migration/Seed (20260721160705_seed_vocab.sql), Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908175758_v2_service_role_grants_session_context.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260911120247_v3_vocab_org_type_foundation.sql), Migration/Seed (20260911121546_v3_vocab_org_type_service.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914094832_v4_produktion.sql), Migration/Seed (20260914095053_v4_wissensbasis.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260915113046_v5_ansprechpartner_und_zeiten.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260915115505_v5_catering.sql), Migration/Seed (20260915115707_v5_speaker_anreise.sql), Migration/Seed (20260915115751_v5_speaker_zusage_anrede.sql), Migration/Seed (20260917185916_v6_session_grafiken.sql), Migration/Seed (20260917190103_v6_partner_format_key.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260918142855_v6_shuttle.sql), Migration/Seed (20260918151535_v6_reception.sql), Migration/Seed (20260921101742_v6_speaker_kontakt.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), Migration/Seed (20260921115332_v6_company_tours.sql), Migration/Seed (20260921120434_v6_branche_aussteller.sql), Migration/Seed (20260922095139_v6_sponsoren_kategorien.sql), Migration/Seed (20260923105947_v6_session_themen.sql), Migration/Seed (20260923111840_v6_technik_neu_geschnitten.sql), Migration/Seed (20260923120811_v6_reisekosten_pauschale.sql), Migration/Seed (20260924135111_v6_profilfelder.sql), Migration/Seed (20260924135400_v6_rollenmodell_abschnitte.sql), Migration/Seed (20260925084552_v6_lead039_einordnung.sql), Migration/Seed (20260925092258_v6_lead039_verlauf.sql), Migration/Seed (20260925102305_v6_talk_speaker_zugang.sql), Migration/Seed (20260926090609_v6_media_kit.sql), Migration/Seed (20261001122557_v6_hack_tracks.sql), Migration/Seed (20261001123808_v6_logokategorie.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), Migration/Seed (20261002083323_v6_tour_zuordnung.sql), Migration/Seed (20261002085454_v6_produktionsliste_stand.sql), Migration/Seed (20261002085957_v6_benachrichtigungen.sql), Migration/Seed (20261002091904_v6_feedback.sql), Migration/Seed (20261002140832_v6_volunteers_schichtmodell.sql), Migration/Seed (20261002144630_v6_tour_typ_marketing.sql), Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261008083319_v6_wiki_thema_produktbezug.sql), Migration/Seed (20261008083344_v6_hack_eventseite.sql), Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), upsert_vocab_term() | /admin/vokabular | |
| `key` | text | fachlich | Migration/Seed (20260721160705_seed_vocab.sql), Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908175758_v2_service_role_grants_session_context.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260911120247_v3_vocab_org_type_foundation.sql), Migration/Seed (20260911121546_v3_vocab_org_type_service.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914094832_v4_produktion.sql), Migration/Seed (20260914095053_v4_wissensbasis.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260915113046_v5_ansprechpartner_und_zeiten.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260915115505_v5_catering.sql), Migration/Seed (20260915115707_v5_speaker_anreise.sql), Migration/Seed (20260915115751_v5_speaker_zusage_anrede.sql), Migration/Seed (20260917185916_v6_session_grafiken.sql), Migration/Seed (20260917190103_v6_partner_format_key.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260918142855_v6_shuttle.sql), Migration/Seed (20260918151535_v6_reception.sql), Migration/Seed (20260921101742_v6_speaker_kontakt.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), Migration/Seed (20260921115332_v6_company_tours.sql), Migration/Seed (20260921120434_v6_branche_aussteller.sql), Migration/Seed (20260922095139_v6_sponsoren_kategorien.sql), Migration/Seed (20260923105947_v6_session_themen.sql), Migration/Seed (20260923111840_v6_technik_neu_geschnitten.sql), Migration/Seed (20260923120811_v6_reisekosten_pauschale.sql), Migration/Seed (20260924135111_v6_profilfelder.sql), Migration/Seed (20260924135400_v6_rollenmodell_abschnitte.sql), Migration/Seed (20260925084552_v6_lead039_einordnung.sql), Migration/Seed (20260925092258_v6_lead039_verlauf.sql), Migration/Seed (20260925102305_v6_talk_speaker_zugang.sql), Migration/Seed (20260926090609_v6_media_kit.sql), Migration/Seed (20261001122557_v6_hack_tracks.sql), Migration/Seed (20261001123808_v6_logokategorie.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), Migration/Seed (20261002083323_v6_tour_zuordnung.sql), Migration/Seed (20261002085454_v6_produktionsliste_stand.sql), Migration/Seed (20261002085957_v6_benachrichtigungen.sql), Migration/Seed (20261002091904_v6_feedback.sql), Migration/Seed (20261002140832_v6_volunteers_schichtmodell.sql), Migration/Seed (20261002144630_v6_tour_typ_marketing.sql), Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261008083319_v6_wiki_thema_produktbezug.sql), Migration/Seed (20261008083344_v6_hack_eventseite.sql), Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), upsert_vocab_term() | /admin/vokabular | |
| `label_de` | text | fachlich | Migration/Seed (20260721160705_seed_vocab.sql), Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908175758_v2_service_role_grants_session_context.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260911120247_v3_vocab_org_type_foundation.sql), Migration/Seed (20260911121546_v3_vocab_org_type_service.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914094832_v4_produktion.sql), Migration/Seed (20260914095053_v4_wissensbasis.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260915113046_v5_ansprechpartner_und_zeiten.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260915115505_v5_catering.sql), Migration/Seed (20260915115707_v5_speaker_anreise.sql), Migration/Seed (20260915115751_v5_speaker_zusage_anrede.sql), Migration/Seed (20260917185916_v6_session_grafiken.sql), Migration/Seed (20260917190103_v6_partner_format_key.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260918142855_v6_shuttle.sql), Migration/Seed (20260918151535_v6_reception.sql), Migration/Seed (20260921101742_v6_speaker_kontakt.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), Migration/Seed (20260921115332_v6_company_tours.sql), Migration/Seed (20260921120434_v6_branche_aussteller.sql), Migration/Seed (20260922095139_v6_sponsoren_kategorien.sql), Migration/Seed (20260923105947_v6_session_themen.sql), Migration/Seed (20260923111840_v6_technik_neu_geschnitten.sql), Migration/Seed (20260923120811_v6_reisekosten_pauschale.sql), Migration/Seed (20260924133947_v6_kontakte_bearbeiten_cc.sql), Migration/Seed (20260924135111_v6_profilfelder.sql), Migration/Seed (20260924135400_v6_rollenmodell_abschnitte.sql), Migration/Seed (20260925084552_v6_lead039_einordnung.sql), Migration/Seed (20260925092258_v6_lead039_verlauf.sql), Migration/Seed (20260925102305_v6_talk_speaker_zugang.sql), Migration/Seed (20260926090609_v6_media_kit.sql), Migration/Seed (20261001122557_v6_hack_tracks.sql), Migration/Seed (20261001123808_v6_logokategorie.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), Migration/Seed (20261002083323_v6_tour_zuordnung.sql), Migration/Seed (20261002085454_v6_produktionsliste_stand.sql), Migration/Seed (20261002085957_v6_benachrichtigungen.sql), Migration/Seed (20261002091904_v6_feedback.sql), Migration/Seed (20261002140832_v6_volunteers_schichtmodell.sql), Migration/Seed (20261002144630_v6_tour_typ_marketing.sql), Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261008083319_v6_wiki_thema_produktbezug.sql), Migration/Seed (20261008083344_v6_hack_eventseite.sql), Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), upsert_vocab_term() | /admin/vokabular | |
| `label_en` | text | fachlich | Migration/Seed (20260721160705_seed_vocab.sql), Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908175758_v2_service_role_grants_session_context.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260911120247_v3_vocab_org_type_foundation.sql), Migration/Seed (20260911121546_v3_vocab_org_type_service.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914094832_v4_produktion.sql), Migration/Seed (20260914095053_v4_wissensbasis.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260915113046_v5_ansprechpartner_und_zeiten.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260915115505_v5_catering.sql), Migration/Seed (20260915115707_v5_speaker_anreise.sql), Migration/Seed (20260915115751_v5_speaker_zusage_anrede.sql), Migration/Seed (20260917185916_v6_session_grafiken.sql), Migration/Seed (20260917190103_v6_partner_format_key.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260918142855_v6_shuttle.sql), Migration/Seed (20260918151535_v6_reception.sql), Migration/Seed (20260921101742_v6_speaker_kontakt.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), Migration/Seed (20260921115332_v6_company_tours.sql), Migration/Seed (20260921120434_v6_branche_aussteller.sql), Migration/Seed (20260922095139_v6_sponsoren_kategorien.sql), Migration/Seed (20260923105947_v6_session_themen.sql), Migration/Seed (20260923111840_v6_technik_neu_geschnitten.sql), Migration/Seed (20260923120811_v6_reisekosten_pauschale.sql), Migration/Seed (20260924133947_v6_kontakte_bearbeiten_cc.sql), Migration/Seed (20260924135111_v6_profilfelder.sql), Migration/Seed (20260924135400_v6_rollenmodell_abschnitte.sql), Migration/Seed (20260925084552_v6_lead039_einordnung.sql), Migration/Seed (20260925092258_v6_lead039_verlauf.sql), Migration/Seed (20260925102305_v6_talk_speaker_zugang.sql), Migration/Seed (20260926090609_v6_media_kit.sql), Migration/Seed (20261001122557_v6_hack_tracks.sql), Migration/Seed (20261001123808_v6_logokategorie.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), Migration/Seed (20261002083323_v6_tour_zuordnung.sql), Migration/Seed (20261002085454_v6_produktionsliste_stand.sql), Migration/Seed (20261002085957_v6_benachrichtigungen.sql), Migration/Seed (20261002091904_v6_feedback.sql), Migration/Seed (20261002140832_v6_volunteers_schichtmodell.sql), Migration/Seed (20261002144630_v6_tour_typ_marketing.sql), Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261008083319_v6_wiki_thema_produktbezug.sql), Migration/Seed (20261008083344_v6_hack_eventseite.sql), Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), upsert_vocab_term() | /admin/vokabular | |
| `sort_order` | integer | fachlich | Migration/Seed (20260721160705_seed_vocab.sql), Migration/Seed (20260908145110_v2_seed_vocab_fls27.sql), Migration/Seed (20260908175758_v2_service_role_grants_session_context.sql), Migration/Seed (20260910101820_v2_speaker_profile.sql), Migration/Seed (20260910112957_v2_expenses.sql), Migration/Seed (20260910144439_v3_products.sql), Migration/Seed (20260910162431_v3_partner_org_context.sql), Migration/Seed (20260911120247_v3_vocab_org_type_foundation.sql), Migration/Seed (20260911121546_v3_vocab_org_type_service.sql), Migration/Seed (20260911165420_v4_volunteers.sql), Migration/Seed (20260914094832_v4_produktion.sql), Migration/Seed (20260914095053_v4_wissensbasis.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260915113046_v5_ansprechpartner_und_zeiten.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260915115505_v5_catering.sql), Migration/Seed (20260915115707_v5_speaker_anreise.sql), Migration/Seed (20260915115751_v5_speaker_zusage_anrede.sql), Migration/Seed (20260917185916_v6_session_grafiken.sql), Migration/Seed (20260917190103_v6_partner_format_key.sql), Migration/Seed (20260918141036_v6_initiativen.sql), Migration/Seed (20260918142855_v6_shuttle.sql), Migration/Seed (20260918151535_v6_reception.sql), Migration/Seed (20260921101742_v6_speaker_kontakt.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), Migration/Seed (20260921115332_v6_company_tours.sql), Migration/Seed (20260921120434_v6_branche_aussteller.sql), Migration/Seed (20260922095139_v6_sponsoren_kategorien.sql), Migration/Seed (20260923105947_v6_session_themen.sql), Migration/Seed (20260923111840_v6_technik_neu_geschnitten.sql), Migration/Seed (20260923120811_v6_reisekosten_pauschale.sql), Migration/Seed (20260924135111_v6_profilfelder.sql), Migration/Seed (20260924135400_v6_rollenmodell_abschnitte.sql), Migration/Seed (20260925084552_v6_lead039_einordnung.sql), Migration/Seed (20260925092258_v6_lead039_verlauf.sql), Migration/Seed (20260925102305_v6_talk_speaker_zugang.sql), Migration/Seed (20260926090609_v6_media_kit.sql), Migration/Seed (20261001122557_v6_hack_tracks.sql), Migration/Seed (20261001123808_v6_logokategorie.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), Migration/Seed (20261002083323_v6_tour_zuordnung.sql), Migration/Seed (20261002085454_v6_produktionsliste_stand.sql), Migration/Seed (20261002085957_v6_benachrichtigungen.sql), Migration/Seed (20261002091904_v6_feedback.sql), Migration/Seed (20261002140832_v6_volunteers_schichtmodell.sql), Migration/Seed (20261002144630_v6_tour_typ_marketing.sql), Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261008083319_v6_wiki_thema_produktbezug.sql), Migration/Seed (20261008083344_v6_hack_eventseite.sql), Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), upsert_vocab_term() | /admin/vokabular | |
| `active` | boolean | fachlich | Migration/Seed (20260911120247_v3_vocab_org_type_foundation.sql), Migration/Seed (20260911121546_v3_vocab_org_type_service.sql), Migration/Seed (20260914094832_v4_produktion.sql), Migration/Seed (20260914095053_v4_wissensbasis.sql), Migration/Seed (20260914095624_v4_hackathon.sql), Migration/Seed (20260915112530_v5_sponsoring_level_vokabular.sql), Migration/Seed (20260915113046_v5_ansprechpartner_und_zeiten.sql), Migration/Seed (20260915115415_v5_messestand.sql), Migration/Seed (20260915115505_v5_catering.sql), Migration/Seed (20260915115707_v5_speaker_anreise.sql), Migration/Seed (20260915115751_v5_speaker_zusage_anrede.sql), Migration/Seed (20260917190103_v6_partner_format_key.sql), Migration/Seed (20260921115330_v6_formate_schema.sql), Migration/Seed (20260921115332_v6_company_tours.sql), Migration/Seed (20260921120434_v6_branche_aussteller.sql), Migration/Seed (20260922095139_v6_sponsoren_kategorien.sql), Migration/Seed (20260924135111_v6_profilfelder.sql), Migration/Seed (20260924135400_v6_rollenmodell_abschnitte.sql), Migration/Seed (20260924193425_v6_reisemittel.sql), Migration/Seed (20260924194015_v6_eine_sprache.sql), Migration/Seed (20260926090609_v6_media_kit.sql), Migration/Seed (20261001122557_v6_hack_tracks.sql), Migration/Seed (20261001123808_v6_logokategorie.sql), Migration/Seed (20261001125937_v6_initiativen_award.sql), Migration/Seed (20261002083323_v6_tour_zuordnung.sql), Migration/Seed (20261002085454_v6_produktionsliste_stand.sql), Migration/Seed (20261002085957_v6_benachrichtigungen.sql), Migration/Seed (20261002091904_v6_feedback.sql), Migration/Seed (20261002140832_v6_volunteers_schichtmodell.sql), Migration/Seed (20261002144630_v6_tour_typ_marketing.sql), Migration/Seed (20261008083319_v6_wiki_thema_produktbezug.sql), Migration/Seed (20261008083344_v6_hack_eventseite.sql), Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261010145420_v6_hackathon_skill_vokabular.sql), upsert_vocab_term() | /admin/vokabular | |
| `parent_vocabulary` | text | fachlich | Migration/Seed (20260721160705_seed_vocab.sql), Migration/Seed (20260922095139_v6_sponsoren_kategorien.sql), Migration/Seed (20261001123808_v6_logokategorie.sql), upsert_vocab_term() | /admin/vokabular | |
| `parent_key` | text | fachlich | Migration/Seed (20260721160705_seed_vocab.sql), Migration/Seed (20260922095139_v6_sponsoren_kategorien.sql), Migration/Seed (20261001123808_v6_logokategorie.sql), upsert_vocab_term() | /admin/vokabular | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | Migration/Seed (20260924133947_v6_kontakte_bearbeiten_cc.sql), set_updated_at() [Trigger trg_vocab_term_updated] |  | |

### `external_ref`

**Zweck:** Fremd-IDs je Portal-Objekt (ein System ↔ ein Objekt ↔ eine ID).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** delete_external_ref(), luma_sync_event(), record_shop_invoice(), record_shop_quote(), run_shop_finalization(), set_event_app_person_ref(), set_event_app_ref(), set_external_ref(), set_product_external_ref(), set_updated_at() [Trigger trg_external_ref_updated], shop_admin_set_status(), shop_cancel(), shop_confirm(), shop_quote_withdraw(), shop_quotes_housekeeping() · löscht Zeilen: delete_external_ref()

**Trigger auf dieser Tabelle:** trg_external_ref_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/partner, /admin/partner/produkte, /admin/speaker/website, /events, /partner, API-Route: /api/admin/products/sync, API-Route: /api/admin/sanity/partner-logos, API-Route: /api/admin/sanity/speakers, API-Route: /api/admin/sevdesk/shop-invoices, API-Route: /api/admin/swapcard/exhibitors, API-Route: /api/admin/swapcard/speakers, API-Route: /api/admin/swapcard/sponsors, API-Route: /api/partner/shop/angebot, API-Route: /api/partner/shop/angebot/[order]/pdf, Cron: /api/cron/luma-sync, Cron: /api/cron/mail

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `system` | text | fachlich | luma_sync_event(), record_shop_invoice(), record_shop_quote(), set_event_app_person_ref(), set_event_app_ref(), set_external_ref(), set_product_external_ref() | /admin/speaker/website, /events | |
| `object_type` | text | fachlich | luma_sync_event(), record_shop_invoice(), record_shop_quote(), set_event_app_person_ref(), set_event_app_ref(), set_external_ref(), set_product_external_ref() | /admin/speaker/website, /events | |
| `object_id` | uuid | technisch | luma_sync_event(), record_shop_invoice(), record_shop_quote(), set_event_app_person_ref(), set_event_app_ref(), set_external_ref() | /admin/speaker/website, /events | |
| `external_id` | text | technisch | luma_sync_event(), record_shop_invoice(), record_shop_quote(), set_event_app_person_ref(), set_event_app_ref(), set_external_ref(), set_product_external_ref() | /admin/speaker/website, /events | |
| `meta` | jsonb | fachlich | luma_sync_event(), record_shop_invoice(), record_shop_quote(), run_shop_finalization(), set_event_app_person_ref(), set_event_app_ref(), set_external_ref(), shop_admin_set_status(), shop_cancel(), shop_confirm(), shop_quote_withdraw(), shop_quotes_housekeeping() | /admin/partner, /admin/speaker/website, /events, /partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | luma_sync_event(), set_updated_at() [Trigger trg_external_ref_updated] | /events | |
| `object_key` | text | fachlich | set_product_external_ref() |  | |

## 10. Nicht zugeordnet

### `ac_contact`

**Zweck:** Was in ActiveCampaign für diese Person gesetzt ist (Kontakt-Id, Themen-Tags). Nur Server (ActiveCampaign-Sync, TAL-009).

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** ac_mark_removed(), ac_mark_synced() · löscht Zeilen: ac_mark_removed()

**Seiten (lesen/schreiben):** Cron: /api/cron/activecampaign-sync

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `person_id` | uuid | technisch | ac_mark_synced() |  | |
| `ac_contact_id` | text | technisch | ac_mark_synced() |  | |
| `topics` | text[] | fachlich | ac_mark_synced() |  | |
| `synced_at` | timestamp with time zone | technisch | ac_mark_synced() |  | |

### `admin_section_override`

**Zweck:** ADM-053: Ausnahmen zur Abschnitts-Vorgabe aus lib/admin-sections.ts. Je Zeile entweder eine Rolle oder eine Person; `allowed` schaltet an oder aus. Person schlägt Rolle, Rolle schlägt Vorgabe; `admin` sieht immer alles und ist nicht abschaltbar.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261009122723_v6_team_zugaenge_zusammen.sql), delete_admin_section_override(), set_admin_section_override(), set_updated_at() [Trigger set_updated_at] · löscht Zeilen: delete_admin_section_override()

**Trigger auf dieser Tabelle:** set_updated_at → set_updated_at()

**Seiten (lesen/schreiben):** /admin/rollen

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `section` | text | fachlich | Migration/Seed (20261008082640_v6_side_events.sql), set_admin_section_override() | /admin/rollen | |
| `role` | text | fachlich | set_admin_section_override() | /admin/rollen | |
| `person_id` | uuid | technisch | set_admin_section_override() | /admin/rollen | |
| `allowed` | boolean | fachlich | set_admin_section_override() | /admin/rollen | |
| `note` | text | fachlich | set_admin_section_override() | /admin/rollen | |
| `created_by` | uuid | technisch | set_admin_section_override() | /admin/rollen | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger set_updated_at] |  | |

### `admin_section_role`

**Zweck:** Vorgabe: welche Rolle oeffnet welchen Admin-Abschnitt (PORT1b). Spiegelung von lib/admin-sections.ts, gehalten von tests/admin-sections.test.ts; Ausnahmen stehen in admin_section_override.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260925085557_v6_port1b_abschnitt_rollen.sql), Migration/Seed (20260925091507_v6_company_tours_admin.sql), Migration/Seed (20260925101238_v6_produktion_abschnitte.sql), Migration/Seed (20260925102703_v6_checkin_admin.sql), Migration/Seed (20260925103840_v6_logo_produktionsliste.sql), Migration/Seed (20260925110347_v6_audit_einsicht.sql), Migration/Seed (20260925170219_v6_zugaenge.sql), Migration/Seed (20261001082105_v6_fragenkatalog_pflege.sql), Migration/Seed (20261001085426_v6_admin_hackathon.sql), Migration/Seed (20261001085459_v6_einwilligung_sperrliste.sql), Migration/Seed (20261001131628_v6_produktstamm_pflege.sql), Migration/Seed (20261002083323_v6_tour_zuordnung.sql), Migration/Seed (20261002085957_v6_benachrichtigungen.sql), Migration/Seed (20261002091014_v6_event_fotos.sql), Migration/Seed (20261002091904_v6_feedback.sql), Migration/Seed (20261005160632_v6_hotel_freigabe_rechte.sql), Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261008142630_v6_fristen_je_bereich.sql), Migration/Seed (20261009122723_v6_team_zugaenge_zusammen.sql)

**Seiten (lesen/schreiben):** _keine .from()/.rpc()-Fundstelle in app/lib/components_

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `section` | text | fachlich | Migration/Seed (20260925085557_v6_port1b_abschnitt_rollen.sql), Migration/Seed (20260925091507_v6_company_tours_admin.sql), Migration/Seed (20260925101238_v6_produktion_abschnitte.sql), Migration/Seed (20260925102703_v6_checkin_admin.sql), Migration/Seed (20260925103840_v6_logo_produktionsliste.sql), Migration/Seed (20260925110347_v6_audit_einsicht.sql), Migration/Seed (20260925170219_v6_zugaenge.sql), Migration/Seed (20261001082105_v6_fragenkatalog_pflege.sql), Migration/Seed (20261001085426_v6_admin_hackathon.sql), Migration/Seed (20261001085459_v6_einwilligung_sperrliste.sql), Migration/Seed (20261001131628_v6_produktstamm_pflege.sql), Migration/Seed (20261002083323_v6_tour_zuordnung.sql), Migration/Seed (20261002085957_v6_benachrichtigungen.sql), Migration/Seed (20261002091014_v6_event_fotos.sql), Migration/Seed (20261002091904_v6_feedback.sql), Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261008142630_v6_fristen_je_bereich.sql) |  | |
| `role` | text | fachlich | Migration/Seed (20260925085557_v6_port1b_abschnitt_rollen.sql), Migration/Seed (20260925091507_v6_company_tours_admin.sql), Migration/Seed (20260925101238_v6_produktion_abschnitte.sql), Migration/Seed (20260925102703_v6_checkin_admin.sql), Migration/Seed (20260925103840_v6_logo_produktionsliste.sql), Migration/Seed (20260925110347_v6_audit_einsicht.sql), Migration/Seed (20260925170219_v6_zugaenge.sql), Migration/Seed (20261001082105_v6_fragenkatalog_pflege.sql), Migration/Seed (20261001085426_v6_admin_hackathon.sql), Migration/Seed (20261001085459_v6_einwilligung_sperrliste.sql), Migration/Seed (20261001131628_v6_produktstamm_pflege.sql), Migration/Seed (20261002083323_v6_tour_zuordnung.sql), Migration/Seed (20261002085957_v6_benachrichtigungen.sql), Migration/Seed (20261002091014_v6_event_fotos.sql), Migration/Seed (20261002091904_v6_feedback.sql), Migration/Seed (20261008082640_v6_side_events.sql), Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261008142630_v6_fristen_je_bereich.sql) |  | |

### `ai_rate_limit`

**Zweck:** Aufrufzähler je Person, Assistent und Stunde (0126). Bremse für Modellaufrufe; wird vom Housekeeping aufgeräumt. Kein Inhalt, keine Frage — nur Zahlen.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** ai_take_slot(), purge_ai_rate_limit() · löscht Zeilen: purge_ai_rate_limit()

**Seiten (lesen/schreiben):** API-Route: /api/speaker/post, API-Route: /api/speaker/titel

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `auth_user_id` | uuid | technisch | ai_take_slot() |  | |
| `kind` | text | fachlich | ai_take_slot() |  | |
| `window_start` | timestamp with time zone | fachlich | ai_take_slot() |  | |
| `hits` | integer | fachlich | ai_take_slot() |  | |

### `award_application`

**Zweck:** ADM-024: Bewerbung zum Initiativen-Award (Felder nach dem Airtable-Formular). Ansprechperson nur hier, nie öffentlich. Bilder im privaten Bucket award-images.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** award_apply(), award_purge_contacts(), award_set_images(), delete_award_application(), set_award_organization(), set_award_status(), set_updated_at() [Trigger trg_award_application_updated] · löscht Zeilen: delete_award_application()

**Trigger auf dieser Tabelle:** trg_award_application_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/initiativen/award, API-Route: /api/award/bewerbung, Cron: /api/cron/award-kontakte

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `edition_id` | uuid | technisch | award_apply() |  | |
| `organization_id` | uuid | technisch | set_award_organization() | /admin/initiativen/award | |
| `name` | text | fachlich | award_apply() |  | |
| `topics` | text[] | fachlich | award_apply() |  | |
| `location` | text | fachlich | award_apply() |  | |
| `description` | text | fachlich | award_apply() |  | |
| `mission` | text | fachlich | award_apply() |  | |
| `project` | text | fachlich | award_apply() |  | |
| `contact_first_name` | text | fachlich | award_apply(), award_purge_contacts() |  | |
| `contact_last_name` | text | fachlich | award_apply(), award_purge_contacts() |  | |
| `contact_email` | extensions.citext | fachlich | award_apply(), award_purge_contacts() |  | |
| `founded_year` | smallint | fachlich | award_apply() |  | |
| `active_members` | integer | fachlich | award_apply() |  | |
| `website` | text | fachlich | award_apply() |  | |
| `university` | text | fachlich | award_apply() |  | |
| `notes` | text | fachlich | award_apply() |  | |
| `images` | text[] | fachlich | award_set_images() |  | |
| `privacy_consent_at` | timestamp with time zone | technisch | award_apply() |  | |
| `status` | text | fachlich | set_award_status() | /admin/initiativen/award | |
| `source` | text | fachlich | award_apply() |  | |
| `submitter_hash` | text | fachlich | award_apply() |  | |
| `decided_by` | uuid | technisch | set_award_status() | /admin/initiativen/award | |
| `decided_at` | timestamp with time zone | technisch | set_award_status() | /admin/initiativen/award | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_award_application_updated] |  | |
| `contact_purged_at` | timestamp with time zone | technisch | award_purge_contacts() |  | |

### `award_secret`

**Zweck:** ADM-024: Salz für award_vote.voter_hash je Edition. Nur für die Award-Funktionen; nie auslesen.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** award_hash()

**Seiten (lesen/schreiben):** _keine .from()/.rpc()-Fundstelle in app/lib/components_

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `edition_id` | uuid | technisch | award_hash() |  | |
| `salt` | bytea | fachlich |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `award_vote`

**Zweck:** ADM-024: öffentliche Stimme ohne Personendaten — voter_hash = sha256(IP, Edition, Salz), gebildet in award_hash(); die Adresse wird nicht gespeichert.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** award_vote_cast()

**Seiten (lesen/schreiben):** API-Route: /api/award/stimme

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `application_id` | uuid | technisch | award_vote_cast() |  | |
| `edition_id` | uuid | technisch | award_vote_cast() |  | |
| `voter_hash` | text | fachlich | award_vote_cast() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `booth_assignment`

**Zweck:** Wer wann an einem Stand steht (0124). event_day_id null = beide Tage. Ersetzt booth.org_edition_id: ein Stand kann tagesweise geteilt werden.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260921103627_v6_staende_tagesweise.sql), remove_booth_assignment(), set_booth_assignment(), set_updated_at() [Trigger trg_booth_assignment_updated], upsert_booth() · löscht Zeilen: remove_booth_assignment()

**Trigger auf dieser Tabelle:** trg_booth_assignment_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/partner

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `booth_id` | uuid | technisch | Migration/Seed (20260921103627_v6_staende_tagesweise.sql), set_booth_assignment(), upsert_booth() | /admin/partner | |
| `org_edition_id` | uuid | technisch | Migration/Seed (20260921103627_v6_staende_tagesweise.sql), set_booth_assignment(), upsert_booth() | /admin/partner | |
| `event_day_id` | uuid | technisch | Migration/Seed (20260921103627_v6_staende_tagesweise.sql), set_booth_assignment(), upsert_booth() | /admin/partner | |
| `note` | text | fachlich | set_booth_assignment() | /admin/partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_booth_assignment_updated] |  | |

### `booth_review`

**Zweck:** PROD-005: interne Prüfung je Stand und Prüfpunkt (Vokabular booth_review_item). Fehlt die Zeile, ist der Punkt offen. basis_hash = Fingerabdruck der Positionen zum Prüfzeitpunkt; weicht er ab, gilt die Prüfung als veraltet.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_booth_review() · löscht Zeilen: set_booth_review()

**Seiten (lesen/schreiben):** /admin/produktion

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `org_edition_id` | uuid | technisch | set_booth_review() | /admin/produktion | |
| `item_key` | text | fachlich | set_booth_review() | /admin/produktion | |
| `status` | text | fachlich | set_booth_review() | /admin/produktion | |
| `note` | text | fachlich | set_booth_review() | /admin/produktion | |
| `basis_hash` | text | fachlich | set_booth_review() | /admin/produktion | |
| `checked_by` | uuid | technisch | set_booth_review() | /admin/produktion | |
| `checked_at` | timestamp with time zone | technisch | set_booth_review() | /admin/produktion | |

### `company_tour`

**Zweck:** Eine Company Tour: Rundfahrt vom Sammelpunkt zu mehreren Partnern (Konrad, 18.09.). Sechs Touren 2027; die echten Zeiten setzt das Team, bis dahin Dummy-Touren.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260921115332_v6_company_tours.sql), Migration/Seed (20261002083323_v6_tour_zuordnung.sql), Migration/Seed (20261002144630_v6_tour_typ_marketing.sql), ensure_company_tours(), set_company_tour_type(), set_updated_at() [Trigger trg_company_tour_updated], upsert_company_tour()

**Trigger auf dieser Tabelle:** trg_company_tour_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/company-tours, /admin/company-tours/zuordnung

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `edition_id` | uuid | technisch | Migration/Seed (20260921115332_v6_company_tours.sql), ensure_company_tours(), upsert_company_tour() | /admin/company-tours, /admin/company-tours/zuordnung | |
| `name` | text | fachlich | Migration/Seed (20260921115332_v6_company_tours.sql), ensure_company_tours(), upsert_company_tour() | /admin/company-tours, /admin/company-tours/zuordnung | |
| `track` | text | fachlich | Migration/Seed (20260921115332_v6_company_tours.sql), upsert_company_tour() | /admin/company-tours | |
| `event_day_id` | uuid | technisch | Migration/Seed (20260921115332_v6_company_tours.sql), upsert_company_tour() | /admin/company-tours | |
| `meeting_point` | text | fachlich | Migration/Seed (20260921115332_v6_company_tours.sql), ensure_company_tours(), upsert_company_tour() | /admin/company-tours, /admin/company-tours/zuordnung | |
| `starts_at` | timestamp with time zone | technisch | Migration/Seed (20260921115332_v6_company_tours.sql), upsert_company_tour() | /admin/company-tours | |
| `ends_at` | timestamp with time zone | technisch | Migration/Seed (20260921115332_v6_company_tours.sql), upsert_company_tour() | /admin/company-tours | |
| `lead_contact_id` | uuid | technisch | upsert_company_tour() | /admin/company-tours | |
| `capacity` | integer | fachlich | upsert_company_tour() | /admin/company-tours | |
| `notes` | text | fachlich | Migration/Seed (20260921115332_v6_company_tours.sql), upsert_company_tour() | /admin/company-tours | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_company_tour_type(), set_updated_at() [Trigger trg_company_tour_updated] | /admin/company-tours/zuordnung | |
| `session_id` | uuid | technisch | upsert_company_tour() | /admin/company-tours | |
| `tour_type` | text | fachlich | Migration/Seed (20261002083323_v6_tour_zuordnung.sql), Migration/Seed (20261002144630_v6_tour_typ_marketing.sql), ensure_company_tours(), set_company_tour_type() | /admin/company-tours/zuordnung | |

### `company_tour_stop`

**Zweck:** Eine Station einer Company Tour. Der Partner bucht den Stopp und beantwortet dazu die Fragen aus 2026 (Ansprechperson, Adresse, Zeitfenster, Snacks, Hinweise, gesuchte Profile, Fotografieren).

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260921115332_v6_company_tours.sql), assign_tour_stop(), ensure_company_tours(), matching_career_level_entfernen(), partner_update_tour_stop(), set_updated_at() [Trigger trg_company_tour_stop_updated], swap_tour_stops(), upsert_company_tour_stop()

**Trigger auf dieser Tabelle:** trg_company_tour_stop_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/company-tours, /admin/company-tours/zuordnung, /admin/partner, /partner

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `tour_id` | uuid | technisch | Migration/Seed (20260921115332_v6_company_tours.sql), ensure_company_tours(), swap_tour_stops(), upsert_company_tour_stop() | /admin/company-tours, /admin/company-tours/zuordnung | |
| `sort_order` | integer | fachlich | Migration/Seed (20260921115332_v6_company_tours.sql), ensure_company_tours(), swap_tour_stops(), upsert_company_tour_stop() | /admin/company-tours, /admin/company-tours/zuordnung | |
| `arrival_at` | timestamp with time zone | technisch | Migration/Seed (20260921115332_v6_company_tours.sql), swap_tour_stops(), upsert_company_tour_stop() | /admin/company-tours, /admin/company-tours/zuordnung | |
| `departure_at` | timestamp with time zone | technisch | Migration/Seed (20260921115332_v6_company_tours.sql), swap_tour_stops(), upsert_company_tour_stop() | /admin/company-tours, /admin/company-tours/zuordnung | |
| `host_org_id` | uuid | technisch | assign_tour_stop(), upsert_company_tour_stop() | /admin/company-tours, /admin/company-tours/zuordnung | |
| `address` | text | fachlich | partner_update_tour_stop(), upsert_company_tour_stop() | /admin/company-tours, /admin/partner, /partner | |
| `contact_name` | text | fachlich | partner_update_tour_stop() | /admin/partner, /partner | |
| `contact_email` | extensions.citext | fachlich | partner_update_tour_stop() | /admin/partner, /partner | |
| `contact_phone` | text | fachlich | partner_update_tour_stop() | /admin/partner, /partner | |
| `time_note` | text | fachlich | partner_update_tour_stop() | /admin/partner, /partner | |
| `snacks` | boolean | fachlich | partner_update_tour_stop() | /admin/partner, /partner | |
| `notes_public` | text | fachlich | partner_update_tour_stop() | /admin/partner, /partner | |
| `target_profile` | jsonb | fachlich | matching_career_level_entfernen(), partner_update_tour_stop() | /admin/partner, /partner | |
| `photos_allowed` | boolean | fachlich | partner_update_tour_stop() | /admin/partner, /partner | |
| `filled_at` | timestamp with time zone | technisch | partner_update_tour_stop() | /admin/partner, /partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | assign_tour_stop(), set_updated_at() [Trigger trg_company_tour_stop_updated], swap_tour_stops() | /admin/company-tours/zuordnung | |

### `company_tour_wish`

**Zweck:** PART-092: Wünsche des Partners eines Tour-Stopps unter den Bewerbungen der Tour (höchstens fünf je Stopp, nur mit Einwilligung). Keine Entscheidung — die trifft das Team. Nur über partner_set_tour_wish, partner_tour_applications und tour_wishes_for_session.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** partner_set_tour_wish() · löscht Zeilen: partner_set_tour_wish()

**Seiten (lesen/schreiben):** /partner

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `stop_id` | uuid | technisch | partner_set_tour_wish() | /partner | |
| `application_id` | uuid | technisch | partner_set_tour_wish() | /partner | |
| `created_by` | uuid | technisch | partner_set_tour_wish() | /partner | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `event_photo`

**Zweck:** Fotoauswahl je Event (TAL-010) im privaten Bucket event-photos (<event_id>/<datei>). Sichtbar nur veröffentlicht und nur für Eingecheckte.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** delete_event_photo(), register_event_photo(), set_event_photo() · löscht Zeilen: delete_event_photo()

**Seiten (lesen/schreiben):** /admin/fotos, API-Route: /api/admin/fotos

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `event_id` | uuid | technisch | register_event_photo() |  | |
| `storage_path` | text | fachlich | register_event_photo() |  | |
| `filename` | text | fachlich | register_event_photo() |  | |
| `credit` | text | fachlich | register_event_photo(), set_event_photo() | /admin/fotos | |
| `sort_order` | integer | fachlich | register_event_photo() |  | |
| `published` | boolean | fachlich | set_event_photo() | /admin/fotos | |
| `uploaded_by` | uuid | technisch | register_event_photo() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `event_photo_removal_request`

**Zweck:** Löschwunsch einer Person zu einem Event-Foto (TAL-010); das Team entscheidet.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** handle_photo_removal(), request_photo_removal()

**Seiten (lesen/schreiben):** /admin/fotos, /fotos

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `photo_id` | uuid | technisch | request_photo_removal() | /fotos | |
| `person_id` | uuid | technisch | request_photo_removal() | /fotos | |
| `note` | text | fachlich | request_photo_removal() | /fotos | |
| `status` | text | fachlich | handle_photo_removal() | /admin/fotos | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `handled_by` | uuid | technisch | handle_photo_removal() | /admin/fotos | |
| `handled_at` | timestamp with time zone | technisch | handle_photo_removal() | /admin/fotos | |

### `feedback_entry`

**Zweck:** Feedback (TAL-011). person_id null = anonym; dann gibt es weder Person noch Uhrzeit (nur created_on) noch einen Audit-Eintrag. Zugriff nur über Funktionen.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** set_feedback(), submit_feedback()

**Seiten (lesen/schreiben):** /admin/feedback, /feedback

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id` | uuid | technisch | submit_feedback() | /feedback | |
| `format` | text | fachlich | submit_feedback() | /feedback | |
| `kind` | text | fachlich | submit_feedback() | /feedback | |
| `ratings` | jsonb | fachlich | submit_feedback() | /feedback | |
| `return_intent` | text | fachlich | submit_feedback() | /feedback | |
| `main_reason` | text | fachlich | submit_feedback() | /feedback | |
| `memorable` | text | fachlich | submit_feedback() | /feedback | |
| `body` | text | fachlich | submit_feedback() | /feedback | |
| `created_on` | date | fachlich |  |  | |
| `status` | text | fachlich | set_feedback() | /admin/feedback | |
| `tags` | text[] | fachlich | set_feedback() | /admin/feedback | |
| `handled_by` | uuid | technisch | set_feedback() | /admin/feedback | |

### `feedback_quota`

**Zweck:** Tageszähler für Feedback (TAL-011) — getrennt vom Text, ohne Uhrzeit, damit anonyme Einsendungen nicht zuzuordnen sind.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** submit_feedback()

**Seiten (lesen/schreiben):** /feedback

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `person_id` | uuid | technisch | submit_feedback() | /feedback | |
| `day` | date | fachlich | submit_feedback() | /feedback | |
| `n` | integer | fachlich | submit_feedback() | /feedback | |

### `hack_dataset`

**Zweck:** Datensatz je Hackathon-Challenge (HACK-012) im privaten Bucket hack-datasets (<challenge_id>/<datei>). Zugriff nur über can_manage_hack_dataset, can_read_hack_dataset, register_hack_dataset, hack_challenge_dataset.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** register_hack_dataset()

**Seiten (lesen/schreiben):** API-Route: /api/hackathon/dataset

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `challenge_id` | uuid | technisch | register_hack_dataset() |  | |
| `storage_path` | text | fachlich | register_hack_dataset() |  | |
| `filename` | text | fachlich | register_hack_dataset() |  | |
| `mime` | text | fachlich | register_hack_dataset() |  | |
| `size_bytes` | bigint | fachlich | register_hack_dataset() |  | |
| `is_current` | boolean | fachlich | register_hack_dataset() |  | |
| `uploaded_by` | uuid | technisch | register_hack_dataset() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `hack_join_request`

**Zweck:** Beitrittsanfragen im Hackathon (HACK-016): to_team = Person fragt beim Team an, to_person = Team lädt ein. Zugriff nur über Funktionen; nie Kontaktdaten.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** answer_hack_request(), invite_hack_person(), request_hack_join(), withdraw_hack_request()

**Seiten (lesen/schreiben):** /hackathon

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `team_id` | uuid | technisch | invite_hack_person(), request_hack_join() | /hackathon | |
| `person_id` | uuid | technisch | invite_hack_person(), request_hack_join() | /hackathon | |
| `edition_id` | uuid | technisch | invite_hack_person(), request_hack_join() | /hackathon | |
| `direction` | text | fachlich | invite_hack_person(), request_hack_join() | /hackathon | |
| `status` | text | fachlich | answer_hack_request(), withdraw_hack_request() | /hackathon | |
| `message` | text | fachlich | invite_hack_person(), request_hack_join() | /hackathon | |
| `created_by` | uuid | technisch | invite_hack_person(), request_hack_join() | /hackathon | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `decided_by` | uuid | technisch | answer_hack_request(), withdraw_hack_request() | /hackathon | |
| `decided_at` | timestamp with time zone | technisch | answer_hack_request(), withdraw_hack_request() | /hackathon | |

### `hack_metric_result`

**Zweck:** Metrik-Wert je Team (HACK-009): eingetragen von Team oder Jury der Challenge, bestätigt vom Hack-Team. Zugriff nur über set_hack_metric, confirm_hack_metric, hack_leaderboard, hack_judging.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** confirm_hack_metric(), set_hack_metric()

**Seiten (lesen/schreiben):** /admin/hackathon, /hackathon

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `team_id` | uuid | technisch | set_hack_metric() | /hackathon | |
| `value` | numeric | fachlich | set_hack_metric() | /hackathon | |
| `note` | text | fachlich | set_hack_metric() | /hackathon | |
| `entered_by` | uuid | technisch | set_hack_metric() | /hackathon | |
| `entered_at` | timestamp with time zone | technisch | set_hack_metric() | /hackathon | |
| `confirmed_by` | uuid | technisch | confirm_hack_metric() | /admin/hackathon | |
| `confirmed_at` | timestamp with time zone | technisch | confirm_hack_metric() | /admin/hackathon | |

### `hack_submission_file`

**Zweck:** Dateien einer Hackathon-Abgabe (HACK-011) im privaten Bucket hack-submissions (<team_id>/<datei>). Zugriff nur über Funktionen.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** register_hack_submission_file(), remove_hack_submission_file() · löscht Zeilen: remove_hack_submission_file()

**Seiten (lesen/schreiben):** API-Route: /api/hackathon/submission

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `team_id` | uuid | technisch | register_hack_submission_file() |  | |
| `storage_path` | text | fachlich | register_hack_submission_file() |  | |
| `filename` | text | fachlich | register_hack_submission_file() |  | |
| `mime` | text | fachlich | register_hack_submission_file() |  | |
| `size_bytes` | bigint | fachlich | register_hack_submission_file() |  | |
| `late` | boolean | fachlich | register_hack_submission_file() |  | |
| `uploaded_by` | uuid | technisch | register_hack_submission_file() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `initiative_stage_log`

**Zweck:** ADM-022: Verlauf des Initiativen-Funnels — je Stufenwechsel oder Notiz eine Zeile. Die aktuelle Stufe steht in org_edition.pipeline_stage.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_initiative_stage()

**Seiten (lesen/schreiben):** /admin/initiativen

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `org_edition_id` | uuid | technisch | set_initiative_stage() | /admin/initiativen | |
| `stage` | text | fachlich | set_initiative_stage() | /admin/initiativen | |
| `note` | text | fachlich | set_initiative_stage() | /admin/initiativen | |
| `changed_at` | timestamp with time zone | technisch |  |  | |
| `changed_by` | uuid | technisch | set_initiative_stage() | /admin/initiativen | |

### `kb_chunk`

**Zweck:** Artikel der Wissensbasis in H2-Abschnitten, für die Volltextsuche des Assistenten (0108). Entsteht ausschliesslich per Trigger aus kb_article; Zielgruppe und Status stehen bewusst NICHT hier, sondern werden beim Suchen aus kb_article gelesen.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** kb_rebuild_chunks() · löscht Zeilen: kb_rebuild_chunks()

**Seiten (lesen/schreiben):** _keine .from()/.rpc()-Fundstelle in app/lib/components_

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `article_id` | uuid | technisch | kb_rebuild_chunks() |  | |
| `section_index` | integer | fachlich | kb_rebuild_chunks() |  | |
| `heading` | text | fachlich | kb_rebuild_chunks() |  | |
| `body` | text | fachlich | kb_rebuild_chunks() |  | |
| `language` | text | fachlich | kb_rebuild_chunks() |  | |
| `ts` | tsvector | fachlich | kb_rebuild_chunks() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `kb_question_log`

**Zweck:** Was gefragt wurde, ohne wer (0108). Zweck: Wiki-Pflege — Fragen ohne Treffer sind die Luecken. Keine person_id, keine Antworttexte. Rollierend 90 Tage (purge_kb_questions).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** kb_log_question(), purge_kb_questions() · löscht Zeilen: purge_kb_questions()

**Seiten (lesen/schreiben):** API-Route: /api/wiki/frage

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | bigint | technisch |  |  | |
| `audience` | text | fachlich | kb_log_question() |  | |
| `language` | text | fachlich | kb_log_question() |  | |
| `question` | text | fachlich | kb_log_question() |  | |
| `article_ids` | uuid[] | fachlich | kb_log_question() |  | |
| `hit` | boolean | fachlich | kb_log_question() |  | |
| `duration_ms` | integer | fachlich | kb_log_question() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `kb_rate_limit`

**Zweck:** Fragenzähler des Wissens-Assistenten je Konto und Stunde (0108). Bewusst getrennt von kb_question_log: der Zähler weiss, wer fragt, das Protokoll nicht — die beiden werden nie verbunden.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** kb_log_question(), kb_take_question_slot(), purge_kb_questions() · löscht Zeilen: purge_kb_questions()

**Seiten (lesen/schreiben):** API-Route: /api/wiki/frage

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `auth_user_id` | uuid | technisch | kb_take_question_slot() |  | |
| `window_start` | timestamp with time zone | fachlich | kb_take_question_slot() |  | |
| `hits` | integer | fachlich | kb_take_question_slot() |  | |
| `logged` | integer | fachlich | kb_log_question() |  | |

### `mail_template_key`

**Zweck:** ADM-102: je Mail-Vorlage (nicht je Sprache) Kategorie, Anzeigename und erlaubte Platzhalter. Kein Fremdschluessel von mail_template.key: eine Vorlage ohne Zeile gilt als Kategorie system (nur admin).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261010145422_v6_ticket_versand_erinnerung.sql), set_mail_template_meta()

**Seiten (lesen/schreiben):** /admin/mail/vorlagen

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `key` | text | fachlich | Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261010145422_v6_ticket_versand_erinnerung.sql), set_mail_template_meta() | /admin/mail/vorlagen | |
| `category` | text | fachlich | Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261010145422_v6_ticket_versand_erinnerung.sql), set_mail_template_meta() | /admin/mail/vorlagen | |
| `name_de` | text | fachlich | Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261010145422_v6_ticket_versand_erinnerung.sql), set_mail_template_meta() | /admin/mail/vorlagen | |
| `name_en` | text | fachlich | Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261010145422_v6_ticket_versand_erinnerung.sql), set_mail_template_meta() | /admin/mail/vorlagen | |
| `variables` | text[] | fachlich | Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261010145422_v6_ticket_versand_erinnerung.sql), set_mail_template_meta() | /admin/mail/vorlagen | |
| `sort_order` | integer | fachlich | Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261010145422_v6_ticket_versand_erinnerung.sql) |  | |
| `updated_at` | timestamp with time zone | technisch | set_mail_template_meta() | /admin/mail/vorlagen | |

### `next_up_item`

**Zweck:** Hinweise „Next Up" auf Home im Teilnehmer-Portal (TAL-006): Events und Programme, im Admin gepflegt. Keine Personendaten.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** delete_next_up_item(), set_updated_at() [Trigger trg_next_up_updated], upsert_next_up_item() · löscht Zeilen: delete_next_up_item()

**Trigger auf dieser Tabelle:** trg_next_up_updated → set_updated_at()

**Seiten (lesen/schreiben):** /admin/next-up

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `word_de` | text | fachlich | upsert_next_up_item() | /admin/next-up | |
| `word_en` | text | fachlich | upsert_next_up_item() | /admin/next-up | |
| `title_de` | text | fachlich | upsert_next_up_item() | /admin/next-up | |
| `title_en` | text | fachlich | upsert_next_up_item() | /admin/next-up | |
| `teaser_de` | text | fachlich | upsert_next_up_item() | /admin/next-up | |
| `teaser_en` | text | fachlich | upsert_next_up_item() | /admin/next-up | |
| `link_url` | text | fachlich | upsert_next_up_item() | /admin/next-up | |
| `starts_at` | timestamp with time zone | technisch | upsert_next_up_item() | /admin/next-up | |
| `visible_from` | timestamp with time zone | fachlich | upsert_next_up_item() | /admin/next-up | |
| `visible_until` | timestamp with time zone | fachlich | upsert_next_up_item() | /admin/next-up | |
| `sort_order` | integer | fachlich | upsert_next_up_item() | /admin/next-up | |
| `active` | boolean | fachlich | upsert_next_up_item() | /admin/next-up | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_next_up_updated] |  | |

### `partner_session_return`

**Zweck:** Jüngster Rückgabegrund der Programmleitung je Partner-Session (PART-083). Schreibt release_partner_session (Rückgabe: Upsert, Freigabe: löschen); lesen nur Definer-Funktionen — keine Grants, damit ihn Speaker der Session nicht über session lesen.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** release_partner_session() · löscht Zeilen: release_partner_session()

**Seiten (lesen/schreiben):** /admin/edition, /partner/buehne

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `session_id` | uuid | technisch | release_partner_session() | /admin/edition, /partner/buehne | |
| `note` | text | fachlich | release_partner_session() | /admin/edition, /partner/buehne | |
| `returned_at` | timestamp with time zone | technisch | release_partner_session() | /admin/edition, /partner/buehne | |
| `returned_by` | uuid | technisch | release_partner_session() | /admin/edition, /partner/buehne | |

### `person_language`

**Zweck:** Sprachkenntnisse je Person mit Niveau (TAL-013 B4). Pflege durch die Person selbst.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** anonymize_person() · löscht Zeilen: anonymize_person()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** /profil

**Seiten (lesen/schreiben):** /admin/personen/[id], /profil

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `person_id` | uuid | technisch |  |  | |
| `language` | text | fachlich |  |  | |
| `level` | text | fachlich |  |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `language_vocabulary` | text | fachlich |  |  | |
| `level_vocabulary` | text | fachlich |  |  | |

### `portal_link`

**Zweck:** Links je Schlüssel (PART-072: Store-Links der Event-App). Seiten lesen über portal_links_for, gepflegt unter /admin/videos. Anders als portal_video nicht nur Loom — hier wird verlinkt, nicht eingebettet.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260926091025_v6_portal_links.sql), Migration/Seed (20261002091443_v6_partner_3d_tour.sql), delete_portal_link(), upsert_portal_link() · löscht Zeilen: delete_portal_link()

**Seiten (lesen/schreiben):** /admin/videos

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `key` | text | fachlich | Migration/Seed (20260926091025_v6_portal_links.sql), Migration/Seed (20261002091443_v6_partner_3d_tour.sql), upsert_portal_link() | /admin/videos | |
| `title_de` | text | fachlich | Migration/Seed (20260926091025_v6_portal_links.sql), Migration/Seed (20261002091443_v6_partner_3d_tour.sql), upsert_portal_link() | /admin/videos | |
| `title_en` | text | fachlich | Migration/Seed (20260926091025_v6_portal_links.sql), Migration/Seed (20261002091443_v6_partner_3d_tour.sql), upsert_portal_link() | /admin/videos | |
| `url` | text | fachlich | Migration/Seed (20260926091025_v6_portal_links.sql), Migration/Seed (20261002091443_v6_partner_3d_tour.sql), upsert_portal_link() | /admin/videos | |
| `audience` | text[] | fachlich | Migration/Seed (20260926091025_v6_portal_links.sql), Migration/Seed (20261002091443_v6_partner_3d_tour.sql), upsert_portal_link() | /admin/videos | |
| `edition_id` | uuid | technisch | upsert_portal_link() | /admin/videos | |
| `sort_order` | integer | fachlich | Migration/Seed (20260926091025_v6_portal_links.sql), Migration/Seed (20261002091443_v6_partner_3d_tour.sql), upsert_portal_link() | /admin/videos | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | upsert_portal_link() | /admin/videos | |

### `profile_deletion_request`

**Zweck:** Antraege auf Profilloeschung nach Art. 17 DSGVO (0115). Entsteht nur, wenn der Loeschung etwas entgegensteht — sonst loescht die Person selbst und sofort.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** anonymize_person(), open_deletion_request(), request_profile_deletion(), resolve_deletion_request()

**Seiten (lesen/schreiben):** /admin/loeschantraege, /admin/personen/[id], /profil/loeschen

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `person_id` | uuid | technisch | open_deletion_request(), request_profile_deletion() | /admin/personen/[id], /profil/loeschen | |
| `reason` | text | fachlich | anonymize_person(), open_deletion_request(), request_profile_deletion() | /admin/personen/[id], /profil/loeschen | |
| `blockers` | text[] | fachlich | open_deletion_request(), request_profile_deletion() | /admin/personen/[id], /profil/loeschen | |
| `status` | text | fachlich | open_deletion_request(), request_profile_deletion(), resolve_deletion_request() | /admin/loeschantraege, /admin/personen/[id], /profil/loeschen | |
| `requested_at` | timestamp with time zone | technisch |  |  | |
| `handled_by` | uuid | technisch | request_profile_deletion(), resolve_deletion_request() | /admin/loeschantraege, /profil/loeschen | |
| `handled_at` | timestamp with time zone | technisch | request_profile_deletion(), resolve_deletion_request() | /admin/loeschantraege, /profil/loeschen | |
| `handled_note` | text | fachlich | resolve_deletion_request() | /admin/loeschantraege | |
| `opened_by` | uuid | technisch | open_deletion_request() | /admin/personen/[id] | |

### `session_asset`

**Zweck:** Bilder, die an einem Auftritt haengen: Buehnenfoto und Slot-Grafik (0111). Die Speaker-Grafik gehoert an den Menschen und bleibt in speaker_asset.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** delete_session_asset(), register_session_asset(), set_session_asset(), set_updated_at() [Trigger trg_session_asset_updated] · löscht Zeilen: delete_session_asset()

**Trigger auf dieser Tabelle:** trg_session_asset_updated → set_updated_at()

**Seiten (lesen/schreiben):** API-Route: /api/admin/session-assets

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `session_id` | uuid | technisch | register_session_asset() |  | |
| `kind` | text | fachlich | register_session_asset() |  | |
| `storage_path` | text | fachlich | register_session_asset() |  | |
| `filename` | text | fachlich | register_session_asset() |  | |
| `mime` | text | fachlich | register_session_asset() |  | |
| `size_bytes` | bigint | fachlich | register_session_asset() |  | |
| `width` | integer | fachlich | register_session_asset() |  | |
| `height` | integer | fachlich | register_session_asset() |  | |
| `cutout` | boolean | fachlich | register_session_asset(), set_session_asset() |  | |
| `credit` | text | fachlich | register_session_asset(), set_session_asset() |  | |
| `version` | integer | fachlich | register_session_asset() |  | |
| `is_current` | boolean | fachlich | register_session_asset(), set_session_asset() |  | |
| `uploaded_by` | uuid | technisch | register_session_asset() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_session_asset_updated] |  | |

### `shift_template`

**Zweck:** Schicht-Vorlage (VOL-002/S3): Bereich, Position, Uhrzeiten in der Ortszeit des Events, Plätze. apply_shift_templates legt daraus Schichten für Tage an (shift.template_id). Nur über Funktionen.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** delete_shift_template(), upsert_shift_template() · löscht Zeilen: delete_shift_template()

**Seiten (lesen/schreiben):** /admin/volunteers

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `edition_id` | uuid | technisch | upsert_shift_template() | /admin/volunteers | |
| `area` | text | fachlich | upsert_shift_template() | /admin/volunteers | |
| `position` | text | fachlich | upsert_shift_template() | /admin/volunteers | |
| `start_time` | time without time zone | fachlich | upsert_shift_template() | /admin/volunteers | |
| `end_time` | time without time zone | fachlich | upsert_shift_template() | /admin/volunteers | |
| `weekday` | integer | fachlich | upsert_shift_template() | /admin/volunteers | |
| `capacity` | integer | fachlich | upsert_shift_template() | /admin/volunteers | |
| `overbook` | integer | fachlich | upsert_shift_template() | /admin/volunteers | |
| `location` | text | fachlich | upsert_shift_template() | /admin/volunteers | |
| `briefing_md` | text | fachlich | upsert_shift_template() | /admin/volunteers | |
| `sort_order` | integer | fachlich | upsert_shift_template() | /admin/volunteers | |
| `active` | boolean | fachlich | upsert_shift_template() | /admin/volunteers | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | upsert_shift_template() | /admin/volunteers | |

### `shift_wish`

**Zweck:** Wunschschichten (VOL-002, K-44): angenommene Volunteers wählen 1–5 Schichten in Reihenfolge; zugeteilt wird vom Team. Nur über Funktionen.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** set_my_shift_wishes() · löscht Zeilen: set_my_shift_wishes()

**Seiten (lesen/schreiben):** /volunteers

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `person_id` | uuid | technisch | set_my_shift_wishes() | /volunteers | |
| `shift_id` | uuid | technisch | set_my_shift_wishes() | /volunteers | |
| `rank` | integer | fachlich | set_my_shift_wishes() | /volunteers | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `shuttle_booking`

**Zweck:** Shuttle-Fahrten je Speaker-Profil (A7.1). Mehrere Fahrten je Speaker, auch Zwischenfahrten. Jede Fahrt wird vom Speaker-Team freigegeben. Felder nach der Airtable-Shuttle-Tabelle 2026.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** cancel_shuttle(), confirm_shuttle(), request_shuttle(), set_updated_at() [Trigger trg_shuttle_booking_touch]

**Trigger auf dieser Tabelle:** trg_shuttle_booking_touch → set_updated_at()

**Seiten (lesen/schreiben):** /admin, /speaker-leads/shuttle, /speaker/travel

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `profile_id` | uuid | technisch | request_shuttle() | /speaker-leads/shuttle, /speaker/travel | |
| `passenger_name` | text | fachlich | request_shuttle() | /speaker-leads/shuttle, /speaker/travel | |
| `passengers` | integer | fachlich | request_shuttle() | /speaker-leads/shuttle, /speaker/travel | |
| `driver_phone` | text | fachlich | request_shuttle() | /speaker-leads/shuttle, /speaker/travel | |
| `pickup_at` | timestamp with time zone | technisch | request_shuttle() | /speaker-leads/shuttle, /speaker/travel | |
| `pickup_location` | text | fachlich | request_shuttle() | /speaker-leads/shuttle, /speaker/travel | |
| `pickup_address` | text | fachlich | request_shuttle() | /speaker-leads/shuttle, /speaker/travel | |
| `dropoff_location` | text | fachlich | request_shuttle() | /speaker-leads/shuttle, /speaker/travel | |
| `dropoff_address` | text | fachlich | request_shuttle() | /speaker-leads/shuttle, /speaker/travel | |
| `latest_arrival_at` | timestamp with time zone | technisch | request_shuttle() | /speaker-leads/shuttle, /speaker/travel | |
| `status` | text | fachlich | cancel_shuttle(), confirm_shuttle() | /admin, /speaker-leads/shuttle, /speaker/travel | |
| `booked_by_email` | text | fachlich | request_shuttle() | /speaker-leads/shuttle, /speaker/travel | |
| `note` | text | fachlich | request_shuttle() | /speaker-leads/shuttle, /speaker/travel | |
| `over_limit_reason` | text | fachlich | request_shuttle() | /speaker-leads/shuttle, /speaker/travel | |
| `created_by` | uuid | technisch | request_shuttle() | /speaker-leads/shuttle, /speaker/travel | |
| `confirmed_by` | uuid | technisch | confirm_shuttle() | /admin | |
| `confirmed_at` | timestamp with time zone | technisch | confirm_shuttle() | /admin | |
| `cancelled_at` | timestamp with time zone | technisch | cancel_shuttle() | /admin, /speaker-leads/shuttle, /speaker/travel | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_shuttle_booking_touch] |  | |

### `side_event`

**Zweck:** Side Event je Edition (ADM-077): Zeit, Ort, Beschreibung, Obergrenze. Eingeladen wird über side_event_invite; sichtbar ist es für Speaker nur mit Einladung und wenn veröffentlicht. Löst die Speaker Reception (0125) ab.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** delete_side_event(), upsert_side_event() · löscht Zeilen: delete_side_event()

**Seiten (lesen/schreiben):** /admin/side-events

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `edition_id` | uuid | technisch | upsert_side_event() | /admin/side-events | |
| `title_de` | text | fachlich | upsert_side_event() | /admin/side-events | |
| `title_en` | text | fachlich | upsert_side_event() | /admin/side-events | |
| `description_de` | text | fachlich | upsert_side_event() | /admin/side-events | |
| `description_en` | text | fachlich | upsert_side_event() | /admin/side-events | |
| `location` | text | fachlich | upsert_side_event() | /admin/side-events | |
| `address` | text | fachlich | upsert_side_event() | /admin/side-events | |
| `starts_at` | timestamp with time zone | technisch | upsert_side_event() | /admin/side-events | |
| `ends_at` | timestamp with time zone | technisch | upsert_side_event() | /admin/side-events | |
| `capacity` | integer | fachlich | upsert_side_event() | /admin/side-events | |
| `rsvp_deadline` | timestamp with time zone | fachlich | upsert_side_event() | /admin/side-events | |
| `published` | boolean | fachlich | upsert_side_event() | /admin/side-events | |
| `created_by` | uuid | technisch | upsert_side_event() | /admin/side-events | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch |  |  | |

### `side_event_attempt`

**Zweck:** Anfragen an die öffentliche Seite /side-event/<token> je Quelle (award_hash, gesalzen) — Grundlage der Ratenbegrenzung; Zeilen älter als ein Tag räumt die Funktion selbst weg. Keine Grants.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** side_event_respond_by_token() · löscht Zeilen: side_event_respond_by_token()

**Seiten (lesen/schreiben):** /side-event/[token], API-Route: /api/side-event/antwort

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `source_hash` | text | fachlich | side_event_respond_by_token() | /side-event/[token] | |
| `created_at` | timestamp with time zone | technisch |  |  | |

### `side_event_invite`

**Zweck:** Einladung eines Speaker-Profils zu einem Side Event (ADM-077): eine Zeile je Profil, Status invited/yes/no. Eine Absage bleibt stehen, damit das Team „abgesagt“ von „nie geantwortet“ unterscheidet. Ohne Grants — gelesen und geschrieben wird über die RPCs.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20261008082640_v6_side_events.sql), anonymize_person(), invite_to_side_event(), respond_side_event(), set_side_event_status(), side_event_respond_by_token()

**Seiten (lesen/schreiben):** /admin/side-events, /side-event/[token], /speaker, API-Route: /api/side-event/antwort

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `side_event_id` | uuid | technisch | Migration/Seed (20261008082640_v6_side_events.sql), invite_to_side_event(), set_side_event_status() | /admin/side-events | |
| `profile_id` | uuid | technisch | Migration/Seed (20261008082640_v6_side_events.sql), invite_to_side_event(), set_side_event_status() | /admin/side-events | |
| `status` | text | fachlich | Migration/Seed (20261008082640_v6_side_events.sql), invite_to_side_event(), respond_side_event(), set_side_event_status(), side_event_respond_by_token() | /admin/side-events, /side-event/[token], /speaker | |
| `guests` | integer | fachlich | Migration/Seed (20261008082640_v6_side_events.sql), invite_to_side_event(), respond_side_event(), set_side_event_status(), side_event_respond_by_token() | /admin/side-events, /side-event/[token], /speaker | |
| `note` | text | fachlich | anonymize_person(), respond_side_event(), set_side_event_status() | /admin/side-events, /speaker | |
| `responded_at` | timestamp with time zone | technisch | Migration/Seed (20261008082640_v6_side_events.sql), respond_side_event(), set_side_event_status(), side_event_respond_by_token() | /admin/side-events, /side-event/[token], /speaker | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch |  |  | |
| `via` | text | fachlich | Migration/Seed (20261008082640_v6_side_events.sql), invite_to_side_event(), respond_side_event(), set_side_event_status(), side_event_respond_by_token() | /admin/side-events, /side-event/[token], /speaker | |
| `invited_at` | timestamp with time zone | technisch | Migration/Seed (20261008082640_v6_side_events.sql), invite_to_side_event(), set_side_event_status() | /admin/side-events | |
| `invited_by` | uuid | technisch | invite_to_side_event(), set_side_event_status() | /admin/side-events | |
| `token_hash` | text | fachlich | anonymize_person(), invite_to_side_event() | /admin/side-events | |
| `mailed_at` | timestamp with time zone | technisch | invite_to_side_event() | /admin/side-events | |

### `slide_drive_mirror`

**Zweck:** Spiegelstand je Präsentationslinie (Speaker-Profil × Session) im Technik-Ordner (SPK-023). Ohne Fremdschlüssel: überlebt das Löschen, bis die Drive-Kopie entfernt ist. Nur service_role schreibt.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** _keine insert/update/delete in supabase/migrations/*.sql gefunden_

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** /admin, /admin/technik, /speaker-leads, /speaker/session, Cron: /api/cron/mail

**Seiten (lesen/schreiben):** /admin, /admin/technik, /speaker-leads, /speaker/session, Cron: /api/cron/mail

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `profile_id` | uuid | technisch |  |  | |
| `session_id` | uuid | technisch |  |  | |
| `asset_id` | uuid | technisch |  |  | |
| `asset_version` | integer | fachlich |  |  | |
| `drive_file_id` | text | technisch |  |  | |
| `target_hash` | text | fachlich |  |  | |
| `status` | text | fachlich |  |  | |
| `error_key` | text | fachlich |  |  | |
| `error_detail` | text | fachlich |  |  | |
| `attempts` | integer | fachlich |  |  | |
| `mirrored_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch |  |  | |

### `slide_drive_setting`

**Zweck:** Technik-Ordner in Google Drive je Edition (SPK-023). Nur der Server liest ihn; setzen über set_edition_slides_folder (Abschnitt tech). Nicht an event, weil event für alle angemeldeten Konten lesbar ist.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20261001131959_v6_folien_drive.sql), set_edition_slides_folder() · löscht Zeilen: set_edition_slides_folder()

**Seiten (lesen/schreiben):** /admin, /admin/technik, /speaker-leads, /speaker/session, Cron: /api/cron/mail

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `edition_id` | uuid | technisch | Migration/Seed (20261001131959_v6_folien_drive.sql), set_edition_slides_folder() | /admin/technik | |
| `folder_id` | text | technisch | Migration/Seed (20261001131959_v6_folien_drive.sql), set_edition_slides_folder() | /admin/technik | |
| `updated_by` | uuid | technisch | set_edition_slides_folder() | /admin/technik | |
| `updated_at` | timestamp with time zone | technisch | set_edition_slides_folder() | /admin/technik | |

### `speaker_activity`

**Zweck:** Verlauf der Speaker-Pipeline (LEAD-039 Schnitt 2): Notizen, Kontakte, Aufgaben mit Frist. Intern wie das Profil: lesen mit can_manage_speaker, schreiben nur über die RPCs.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** add_speaker_activity(), anonymize_person(), delete_speaker_activity(), set_speaker_activity_done(), set_updated_at() [Trigger trg_speaker_activity_updated], update_speaker_activity() · löscht Zeilen: anonymize_person(), delete_speaker_activity()

**Trigger auf dieser Tabelle:** trg_speaker_activity_updated → set_updated_at()

**Seiten (lesen/schreiben):** lib

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `profile_id` | uuid | technisch | add_speaker_activity() |  | |
| `kind` | text | fachlich | add_speaker_activity() |  | |
| `body` | text | fachlich | add_speaker_activity(), update_speaker_activity() |  | |
| `occurred_at` | timestamp with time zone | technisch | add_speaker_activity(), update_speaker_activity() |  | |
| `due_on` | date | fachlich | add_speaker_activity(), update_speaker_activity() |  | |
| `assignee_person_id` | uuid | technisch | add_speaker_activity(), update_speaker_activity() |  | |
| `done_at` | timestamp with time zone | technisch | set_speaker_activity_done() |  | |
| `done_by` | uuid | technisch | set_speaker_activity_done() |  | |
| `author_person_id` | uuid | technisch | add_speaker_activity() |  | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_speaker_activity_updated] |  | |

### `speaker_contact`

**Zweck:** Kontakte einer Speakerin (SPK-040, 0148): Assistenz, Agentur, Office … in einer Tabelle, mit `has_access` für den Portalzugang. Löst `speaker_profile.assistant_person_id` und die Felder `contact_*` ab; die bleiben vorerst additiv stehen.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260923121327_v6_speaker_kontakte.sql), partner_add_speaker(), remove_speaker_contact(), speaker_contact_check() [Trigger speaker_contact_check_trg], upsert_speaker_contact() · löscht Zeilen: remove_speaker_contact()

**Trigger auf dieser Tabelle:** speaker_contact_check_trg → speaker_contact_check()

**Seiten (lesen/schreiben):** /admin/speaker, /partner, /speaker

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `profile_id` | uuid | technisch | Migration/Seed (20260923121327_v6_speaker_kontakte.sql), partner_add_speaker(), upsert_speaker_contact() | /admin/speaker, /partner, /speaker | |
| `kind` | text | fachlich | Migration/Seed (20260923121327_v6_speaker_kontakte.sql), partner_add_speaker(), upsert_speaker_contact() | /admin/speaker, /partner, /speaker | |
| `person_id` | uuid | technisch | Migration/Seed (20260923121327_v6_speaker_kontakte.sql), partner_add_speaker(), upsert_speaker_contact() | /admin/speaker, /partner, /speaker | |
| `first_name` | text | fachlich | Migration/Seed (20260923121327_v6_speaker_kontakte.sql), partner_add_speaker(), upsert_speaker_contact() | /admin/speaker, /partner, /speaker | |
| `last_name` | text | fachlich | Migration/Seed (20260923121327_v6_speaker_kontakte.sql), partner_add_speaker(), upsert_speaker_contact() | /admin/speaker, /partner, /speaker | |
| `email` | extensions.citext | fachlich | Migration/Seed (20260923121327_v6_speaker_kontakte.sql), partner_add_speaker(), upsert_speaker_contact() | /admin/speaker, /partner, /speaker | |
| `phone` | text | fachlich | Migration/Seed (20260923121327_v6_speaker_kontakte.sql), upsert_speaker_contact() | /admin/speaker, /speaker | |
| `has_access` | boolean | fachlich | Migration/Seed (20260923121327_v6_speaker_kontakte.sql), partner_add_speaker(), upsert_speaker_contact() | /admin/speaker, /partner, /speaker | |
| `consent_at` | date | technisch | Migration/Seed (20260923121327_v6_speaker_kontakte.sql), partner_add_speaker(), upsert_speaker_contact() | /admin/speaker, /partner, /speaker | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | speaker_contact_check() [Trigger speaker_contact_check_trg] |  | |

### `speaker_portal_selection`

**Zweck:** SPK-071: welches Speaker-Profil eine Person im Speaker-Portal gerade bearbeitet (eigenes oder als Assistenz/Kontakt). Nur über set_my_speaker_profile und my_speaker_profile_id — keine Grants.

**Datenschutz-Klasse (Vorschlag):** personenbezogen

**Schreibwege (Funktionen/Trigger):** set_my_speaker_profile()

**Seiten (lesen/schreiben):** /speaker

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `person_id` | uuid | technisch | set_my_speaker_profile() | /speaker | |
| `profile_id` | uuid | technisch | set_my_speaker_profile() | /speaker | |
| `updated_at` | timestamp with time zone | technisch | set_my_speaker_profile() | /speaker | |

### `speaker_stage_candidate`

**Zweck:** Bühnen, die für einen Speaker in Frage kommen (LEAD-039) — konkrete Bühnen der Edition. Intern wie das Profil: lesen mit can_manage_speaker, schreiben nur über set_speaker_stage_candidates.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** anonymize_person(), set_speaker_stage_candidates() · löscht Zeilen: anonymize_person(), set_speaker_stage_candidates()

**Seiten (lesen/schreiben):** /admin/speaker, /speaker-leads

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `profile_id` | uuid | technisch | set_speaker_stage_candidates() | /admin/speaker, /speaker-leads | |
| `stage_id` | uuid | technisch | set_speaker_stage_candidates() | /admin/speaker, /speaker-leads | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `created_by` | uuid | technisch | set_speaker_stage_candidates() | /admin/speaker, /speaker-leads | |

### `speaker_step_reopen`

**Zweck:** Wieder geöffnete Punkte der Speaker-Checkliste (SPK-082): eine Zeile = ein abgeleitet erledigter Schritt (`speaker_next_steps`) wurde von Hand wieder geöffnet. Die Ausnahme, nicht der Haken — die abgeleitete Wahrheit bleibt unberührt; eine Zeile zu einem inzwischen wieder offenen Schritt zählt nicht. Keine Grants, nur über my_speaker_step_reopened / set_speaker_step_reopened.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_speaker_step_reopened() · löscht Zeilen: set_speaker_step_reopened()

**Seiten (lesen/schreiben):** /speaker

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `profile_id` | uuid | technisch | set_speaker_step_reopened() | /speaker | |
| `step_key` | text | fachlich | set_speaker_step_reopened() | /speaker | |
| `reopened_by` | uuid | technisch | set_speaker_step_reopened() | /speaker | |
| `reopened_at` | timestamp with time zone | technisch |  |  | |

### `speaker_task`

**Zweck:** Aufgaben, die der Speaker selbst abhakt (SPK-024, 0149) — je Edition, im Admin gepflegt. Nur für Erledigungen, die das Portal nicht selbst beobachten kann; Abgeleitetes bleibt in `next_steps`.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** delete_speaker_task(), upsert_speaker_task() · löscht Zeilen: delete_speaker_task()

**Seiten (lesen/schreiben):** /admin/speaker

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `edition_id` | uuid | technisch | upsert_speaker_task() | /admin/speaker | |
| `key` | text | fachlich | upsert_speaker_task() | /admin/speaker | |
| `label_de` | text | fachlich | upsert_speaker_task() | /admin/speaker | |
| `label_en` | text | fachlich | upsert_speaker_task() | /admin/speaker | |
| `description_de` | text | fachlich | upsert_speaker_task() | /admin/speaker | |
| `description_en` | text | fachlich | upsert_speaker_task() | /admin/speaker | |
| `deadline_key` | text | fachlich | upsert_speaker_task() | /admin/speaker | |
| `sort_order` | integer | fachlich | upsert_speaker_task() | /admin/speaker | |
| `is_active` | boolean | fachlich | upsert_speaker_task() | /admin/speaker | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch |  |  | |

### `speaker_task_tick`

**Zweck:** Ein Haken je Speaker und Aufgabe (0149). Der Haken ist eine Aussage der Speakerin, kein beobachteter Zustand — deshalb steht dabei, wer ihn wann gesetzt hat.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** set_speaker_task_tick() · löscht Zeilen: set_speaker_task_tick()

**Seiten (lesen/schreiben):** /speaker

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `profile_id` | uuid | technisch | set_speaker_task_tick() | /speaker | |
| `task_id` | uuid | technisch | set_speaker_task_tick() | /speaker | |
| `done_at` | timestamp with time zone | technisch |  |  | |
| `done_by` | uuid | technisch | set_speaker_task_tick() | /speaker | |

### `stage_blocked_time`

**Zweck:** Sperrzeiten (ADM-085, LEAD-062): in diesem Zeitraum trägt die Bühne keine Inhalts-Slots; stage_id leer = alle Bühnen des Events. Keine Grants, RLS an — gelesen und geschrieben nur über stage_blocked_times, upsert_stage_blocked_time und delete_stage_blocked_time; geprüft in create_slot und move_slot (stage_slot_check).

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** delete_stage_blocked_time(), set_updated_at() [Trigger trg_stage_blocked_time_updated], upsert_stage_blocked_time() · löscht Zeilen: delete_stage_blocked_time()

**Trigger auf dieser Tabelle:** trg_stage_blocked_time_updated → set_updated_at(), trg_stage_blocked_time_check → stage_blocked_time_check()

**Seiten (lesen/schreiben):** /admin/edition

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `event_id` | uuid | technisch | upsert_stage_blocked_time() | /admin/edition | |
| `stage_id` | uuid | technisch | upsert_stage_blocked_time() | /admin/edition | |
| `starts_at` | timestamp with time zone | technisch | upsert_stage_blocked_time() | /admin/edition | |
| `ends_at` | timestamp with time zone | technisch | upsert_stage_blocked_time() | /admin/edition | |
| `reason` | text | fachlich | upsert_stage_blocked_time() | /admin/edition | |
| `created_by` | uuid | technisch | upsert_stage_blocked_time() | /admin/edition | |
| `created_at` | timestamp with time zone | technisch |  |  | |
| `updated_at` | timestamp with time zone | technisch | set_updated_at() [Trigger trg_stage_blocked_time_updated] |  | |

### `storage_purge_queue`

**Zweck:** Dateipfade, die nach einer Profilloeschung aus dem Bucket muessen (0115). SQL kann Storage nicht loeschen; der Cron raeumt mit service_role und loescht die Zeile.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** anonymize_person(), delete_award_application(), set_my_cv(), set_my_photo()

**Direkte Schreibzugriffe (kein RPC, `.from().insert/update/upsert/delete()` im Client-Code):** Cron: /api/cron/mail

**Seiten (lesen/schreiben):** /admin/initiativen/award, /profil, Cron: /api/cron/mail

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `id` | uuid | technisch |  |  | |
| `bucket` | text | fachlich | anonymize_person(), delete_award_application(), set_my_cv(), set_my_photo() | /admin/initiativen/award, /profil | |
| `path` | text | fachlich | anonymize_person(), delete_award_application(), set_my_cv(), set_my_photo() | /admin/initiativen/award, /profil | |
| `reason` | text | fachlich | set_my_cv(), set_my_photo() | /profil | |
| `requested_at` | timestamp with time zone | technisch |  |  | |
| `attempts` | integer | fachlich |  |  | |
| `error` | text | fachlich |  |  | |

### `vocab_binding`

**Zweck:** Wo ein Vokabular tatsaechlich benutzt wird (0130). Grundlage der Loeschsperre: ohne Eintrag wird ein Begriff nicht geloescht, weil niemand sagen kann, ob er in Gebrauch ist.

**Datenschutz-Klasse (Vorschlag):** keine

**Schreibwege (Funktionen/Trigger):** Migration/Seed (20260921104956_v6_vokabularpflege.sql), Migration/Seed (20260921112508_v6_ea1_aussteller_level.sql), Migration/Seed (20260921120434_v6_branche_aussteller.sql), Migration/Seed (20260925084552_v6_lead039_einordnung.sql), Migration/Seed (20260925092258_v6_lead039_verlauf.sql), Migration/Seed (20261001122557_v6_hack_tracks.sql), Migration/Seed (20261001123445_v6_hack_track_praeferenz.sql), Migration/Seed (20261001132202_v6_hack_wunschprofil.sql), Migration/Seed (20261002083729_v6_hack_teamsuche.sql), Migration/Seed (20261002085454_v6_produktionsliste_stand.sql), Migration/Seed (20261002085957_v6_benachrichtigungen.sql), Migration/Seed (20261008083319_v6_wiki_thema_produktbezug.sql), Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261010145421_v6_profil_function_area_liste.sql)

**Seiten (lesen/schreiben):** _keine .from()/.rpc()-Fundstelle in app/lib/components_

| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |
|---|---|---|---|---|---|
| `vocabulary` | text | fachlich | Migration/Seed (20260921104956_v6_vokabularpflege.sql), Migration/Seed (20260921112508_v6_ea1_aussteller_level.sql), Migration/Seed (20260921120434_v6_branche_aussteller.sql), Migration/Seed (20260925084552_v6_lead039_einordnung.sql), Migration/Seed (20260925092258_v6_lead039_verlauf.sql), Migration/Seed (20261001122557_v6_hack_tracks.sql), Migration/Seed (20261001123445_v6_hack_track_praeferenz.sql), Migration/Seed (20261001132202_v6_hack_wunschprofil.sql), Migration/Seed (20261002083729_v6_hack_teamsuche.sql), Migration/Seed (20261002085454_v6_produktionsliste_stand.sql), Migration/Seed (20261002085957_v6_benachrichtigungen.sql), Migration/Seed (20261008083319_v6_wiki_thema_produktbezug.sql), Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261010145421_v6_profil_function_area_liste.sql) |  | |
| `table_name` | text | fachlich | Migration/Seed (20260921104956_v6_vokabularpflege.sql), Migration/Seed (20260921112508_v6_ea1_aussteller_level.sql), Migration/Seed (20260921120434_v6_branche_aussteller.sql), Migration/Seed (20260925084552_v6_lead039_einordnung.sql), Migration/Seed (20260925092258_v6_lead039_verlauf.sql), Migration/Seed (20261001122557_v6_hack_tracks.sql), Migration/Seed (20261001123445_v6_hack_track_praeferenz.sql), Migration/Seed (20261001132202_v6_hack_wunschprofil.sql), Migration/Seed (20261002083729_v6_hack_teamsuche.sql), Migration/Seed (20261002085454_v6_produktionsliste_stand.sql), Migration/Seed (20261002085957_v6_benachrichtigungen.sql), Migration/Seed (20261008083319_v6_wiki_thema_produktbezug.sql), Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261010145421_v6_profil_function_area_liste.sql) |  | |
| `column_name` | text | fachlich | Migration/Seed (20260921104956_v6_vokabularpflege.sql), Migration/Seed (20260921112508_v6_ea1_aussteller_level.sql), Migration/Seed (20260921120434_v6_branche_aussteller.sql), Migration/Seed (20260925084552_v6_lead039_einordnung.sql), Migration/Seed (20260925092258_v6_lead039_verlauf.sql), Migration/Seed (20261001122557_v6_hack_tracks.sql), Migration/Seed (20261001123445_v6_hack_track_praeferenz.sql), Migration/Seed (20261001132202_v6_hack_wunschprofil.sql), Migration/Seed (20261002083729_v6_hack_teamsuche.sql), Migration/Seed (20261002085454_v6_produktionsliste_stand.sql), Migration/Seed (20261002085957_v6_benachrichtigungen.sql), Migration/Seed (20261008083319_v6_wiki_thema_produktbezug.sql), Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261010145421_v6_profil_function_area_liste.sql) |  | |
| `is_array` | boolean | fachlich | Migration/Seed (20260921104956_v6_vokabularpflege.sql), Migration/Seed (20260921112508_v6_ea1_aussteller_level.sql), Migration/Seed (20260921120434_v6_branche_aussteller.sql), Migration/Seed (20260925084552_v6_lead039_einordnung.sql), Migration/Seed (20260925092258_v6_lead039_verlauf.sql), Migration/Seed (20261001122557_v6_hack_tracks.sql), Migration/Seed (20261001123445_v6_hack_track_praeferenz.sql), Migration/Seed (20261001132202_v6_hack_wunschprofil.sql), Migration/Seed (20261002083729_v6_hack_teamsuche.sql), Migration/Seed (20261002085454_v6_produktionsliste_stand.sql), Migration/Seed (20261002085957_v6_benachrichtigungen.sql), Migration/Seed (20261008083319_v6_wiki_thema_produktbezug.sql), Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261010145421_v6_profil_function_area_liste.sql) |  | |
| `vocabulary_column` | text | fachlich | Migration/Seed (20260921104956_v6_vokabularpflege.sql), Migration/Seed (20260921112508_v6_ea1_aussteller_level.sql), Migration/Seed (20260921120434_v6_branche_aussteller.sql), Migration/Seed (20260925084552_v6_lead039_einordnung.sql), Migration/Seed (20260925092258_v6_lead039_verlauf.sql), Migration/Seed (20261002085957_v6_benachrichtigungen.sql), Migration/Seed (20261008083319_v6_wiki_thema_produktbezug.sql), Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261010145421_v6_profil_function_area_liste.sql) |  | |
| `note` | text | fachlich | Migration/Seed (20260921104956_v6_vokabularpflege.sql), Migration/Seed (20260921112508_v6_ea1_aussteller_level.sql), Migration/Seed (20260921120434_v6_branche_aussteller.sql), Migration/Seed (20260925084552_v6_lead039_einordnung.sql), Migration/Seed (20260925092258_v6_lead039_verlauf.sql), Migration/Seed (20261001122557_v6_hack_tracks.sql), Migration/Seed (20261001123445_v6_hack_track_praeferenz.sql), Migration/Seed (20261001132202_v6_hack_wunschprofil.sql), Migration/Seed (20261002083729_v6_hack_teamsuche.sql), Migration/Seed (20261002085454_v6_produktionsliste_stand.sql), Migration/Seed (20261002085957_v6_benachrichtigungen.sql), Migration/Seed (20261008083319_v6_wiki_thema_produktbezug.sql), Migration/Seed (20261008134736_v6_mail_vorlagen_kategorie.sql), Migration/Seed (20261010145421_v6_profil_function_area_liste.sql) |  | |

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
