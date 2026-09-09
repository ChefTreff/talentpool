# Datenmodell (generiert)

> **Nicht von Hand bearbeiten.** Erzeugt mit `node --env-file=.env.local scripts/gen-schema-doc.mjs` aus dem laufenden Supabase-Projekt (PostgREST-OpenAPI über `information_schema` + `comment on`).
>
> Stand: 2026-09-09 07:27 UTC · 37 Tabellen · 6 Views · 50 Funktionen
>
> Nur über die Data-API exponierte Schemas erscheinen hier — `public`. Das Schema `integration` ist absichtlich nicht exponiert (Masterplan §2) und wird in den Migrationen beschrieben.

## Tabellen

### `application`
Bewerbung Person × Session. Pipeline: applied → shortlisted → accepted → confirmed → attended/no_show | waitlisted → promoted | declined/expired/withdrawn.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `session_id` | uuid | ja |  | `session.id` |  |
| `person_id` | uuid | ja |  | `person.id` |  |
| `status` | text | ja | `applied` |  | Bewerber sehen Entscheidungen erst nach decision_release (my_applications()). |
| `rank` | integer |  |  |  |  |
| `answers` | jsonb | ja |  |  |  |
| `consent_share` | boolean | ja | `false` |  |  |
| `decided_by` | uuid |  |  | `person.id` |  |
| `decided_at` | timestamp with time zone |  |  |  |  |
| `confirm_by` | timestamp with time zone |  |  |  |  |
| `confirmed_at` | timestamp with time zone |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `audit_log`
Admin-/Manager-Aktionen, Partner-Zugriffe auf Bewerberdaten, Exporte. Nur service_role liest.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | bigint | PK |  |  |  |
| `actor_person_id` | uuid |  |  | `person.id` |  |
| `actor_auth_uid` | uuid |  |  |  |  |
| `action` | text | ja |  |  |  |
| `object_type` | text |  |  |  |  |
| `object_id` | text |  |  |  |  |
| `before` | jsonb |  |  |  |  |
| `after` | jsonb |  |  |  |  |
| `ip_hash` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |

### `checkin`
Scan-Ereignisse (Kiosk-Rolle). Setup Einlass offen (vivenu-Support Frage 11).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | bigint | PK |  |  |  |
| `ticket_id` | uuid | ja |  | `ticket.id` |  |
| `scanned_at` | timestamp with time zone | ja | `now()` |  |  |
| `device_id` | text |  |  |  |  |
| `operator_person_id` | uuid |  |  | `person.id` |  |
| `location` | text |  |  |  |  |
| `result` | text | ja | `ok` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |

### `consent_record`
Jede Einwilligung/Widerruf als eigene Zeile (Nachweis). Aktueller Stand: View consent_current.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `person_id` | uuid | ja |  | `person.id` |  |
| `consent_type` | text | ja |  |  |  |
| `version` | text | ja |  |  |  |
| `granted` | boolean | ja |  |  |  |
| `granted_at` | timestamp with time zone | ja | `now()` |  |  |
| `revoked_at` | timestamp with time zone |  |  |  |  |
| `source` | text | ja | `portal` |  |  |
| `ip_hash` | text |  |  |  |  |
| `user_agent` | text |  |  |  |  |
| `meta` | jsonb |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |

### `decision_release`
Erst nach Freigabe werden Zusagen/Absagen sichtbar und Mails ausgelöst (Antwort C).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `session_id` | uuid | ja |  | `session.id` |  |
| `released_by` | uuid |  |  | `person.id` |  |
| `released_at` | timestamp with time zone | ja | `now()` |  |  |
| `note` | text |  |  |  |  |

### `event`
Format/Termin (Summit, Hackathon, Side-Event, Community). is_edition = Klammer wie FLS27-Woche; Kinder verweisen über edition_id.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `name` | text | ja |  |  |  |
| `format_tag` | text | ja |  |  |  |
| `start_date` | date |  |  |  |  |
| `end_date` | date |  |  |  |  |
| `parent_event_id` | uuid |  |  | `event.id` |  |
| `location` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `slug` | text |  |  |  |  |
| `is_edition` | boolean | ja | `false` |  |  |
| `edition_id` | uuid |  |  | `event.id` | Edition, zu der dieses Event gehört (Rollen sind edition-gebunden). |
| `timezone` | text | ja | `Europe/Berlin` |  |  |
| `venue` | text |  |  |  |  |
| `status` | text | ja | `planning` |  |  |

### `event_day`
Veranstaltungstag eines Events (Einlass, Programmbeginn/-ende).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `event_id` | uuid | ja |  | `event.id` |  |
| `day_date` | date | ja |  |  |  |
| `label_de` | text |  |  |  |  |
| `label_en` | text |  |  |  |  |
| `doors_open` | time without time zone |  |  |  |  |
| `programme_start` | time without time zone |  |  |  |  |
| `programme_end` | time without time zone |  |  |  |  |
| `sort_order` | integer | ja | `0` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `external_ref`
Fremd-IDs je Portal-Objekt (ein System ↔ ein Objekt ↔ eine ID).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `system` | text | ja |  |  |  |
| `object_type` | text | ja |  |  |  |
| `object_id` | uuid | ja |  |  |  |
| `external_id` | text | ja |  |  |  |
| `meta` | jsonb |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `mail_log`
Jede versendete oder unterdrückte Mail mit Zustellstatus (Resend-Webhooks aktualisieren status).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | bigint | PK |  |  |  |
| `to_email` | extensions.citext | ja |  |  |  |
| `person_id` | uuid |  |  | `person.id` |  |
| `template_key` | text |  |  |  |  |
| `locale` | text |  |  |  |  |
| `subject` | text |  |  |  |  |
| `provider` | text | ja | `resend` |  |  |
| `provider_id` | text |  |  |  |  |
| `status` | text | ja | `queued` |  |  |
| `error` | text |  |  |  |  |
| `meta` | jsonb |  |  |  |  |
| `related_type` | text |  |  |  |  |
| `related_id` | uuid |  |  |  |  |
| `queued_at` | timestamp with time zone | ja | `now()` |  |  |
| `sent_at` | timestamp with time zone |  |  |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `mail_template`
System-Mails DE/EN. Versand über Resend (lib/mail), Rendering aus Markdown.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `key` | text | PK |  |  |  |
| `locale` | text | PK |  |  |  |
| `version` | integer | ja | `1` |  |  |
| `subject` | text | ja |  |  |  |
| `body_md` | text | ja |  |  |  |
| `description` | text |  |  |  |  |
| `active` | boolean | ja | `true` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `org_membership`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `person_id` | uuid | ja |  | `person.id` |  |
| `org_id` | uuid | ja |  | `organization.id` |  |
| `roles` | text[] | ja |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `org_ticket_allocation`
Ticket-Kontingent je Partner (Code/Secret Shop) und Pass-Typ.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `event_id` | uuid | ja |  | `event.id` |  |
| `org_id` | uuid | ja |  | `organization.id` |  |
| `pass_type` | text | ja |  |  |  |
| `quantity` | integer | ja |  |  |  |
| `coupon_code` | text |  |  |  |  |
| `undershop_url` | text |  |  |  |  |
| `used_count` | integer | ja | `0` |  |  |
| `notes` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `organization`
Partner, Startups, Initiativen, Hochschulen, Agenturen. HubSpot-Company über hubspot_id.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `legal_name` | text |  |  |  |  |
| `communication_name` | text |  |  |  |  |
| `logo_dark` | text |  |  |  |  |
| `logo_light` | text |  |  |  |  |
| `description` | text |  |  |  |  |
| `address_street` | text |  |  |  |  |
| `address_zip` | text |  |  |  |  |
| `address_city` | text |  |  |  |  |
| `address_country` | text |  |  |  |  |
| `hubspot_id` | text |  |  |  |  |
| `partner_category` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `type` | text |  |  |  |  |
| `slug` | text |  |  |  |  |
| `website` | text |  |  |  |  |
| `active` | boolean | ja | `true` |  |  |
| `sevdesk_contact_id` | text |  |  |  |  |

### `person`
Eine natürliche Person = ein Datensatz. Login-Verknüpfung über auth_user_id.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `auth_user_id` | uuid |  |  |  |  |
| `first_name` | text |  |  |  |  |
| `last_name` | text |  |  |  |  |
| `birthdate` | date |  |  |  |  |
| `occupation_status` | text |  |  |  |  |
| `work_experience` | text |  |  |  |  |
| `career_level` | text |  |  |  |  |
| `employer_type` | text |  |  |  |  |
| `employer_name` | text |  |  |  |  |
| `study_field` | text |  |  |  |  |
| `study_program` | text |  |  |  |  |
| `university` | text |  |  |  |  |
| `self_assessment` | text |  |  |  |  |
| `linkedin_url` | text |  |  |  |  |
| `linkedin_normalized` | text |  |  |  |  |
| `phone` | text |  |  |  |  |
| `phone_e164` | text |  |  |  |  |
| `cv_url` | text |  |  |  |  |
| `gender` | text |  |  |  |  |
| `nationality` | text |  |  |  |  |
| `country` | text |  |  |  |  |
| `preferred_language` | text | ja | `de` |  |  |
| `startup_phase` | text |  |  |  |  |
| `invite_code` | text |  |  |  |  |
| `is_ambassador` | boolean | ja | `false` |  |  |
| `referred_by_person_id` | uuid |  |  | `person.id` |  |
| `engagement_score` | numeric |  |  |  |  |
| `source_first` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `title` | text |  |  |  |  |
| `city` | text |  |  |  |  |
| `pronouns` | text |  |  |  |  |
| `photo_url` | text |  |  |  |  |
| `tier` | text | ja | `lead` |  | lead = bekannt ohne Login · talent = hat sich eingeloggt (Claim). Wird per Trigger gesetzt. |
| `deleted_at` | timestamp with time zone |  |  |  | Gesetzt durch delete_my_profile(): Datensatz anonymisiert, Historie bleibt. |

### `person_acquisition_channel`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `person_id` | uuid | PK |  | `person.id` |  |
| `vocabulary` | text | ja | `acquisition_channel` |  |  |
| `term_key` | text | PK |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |

### `person_eligibility`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `person_id` | uuid | PK |  |  |  |
| `eligibility_u35` | boolean |  |  |  |  |

### `person_email`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `person_id` | uuid | ja |  | `person.id` |  |
| `email` | extensions.citext | ja |  |  |  |
| `type` | text | ja | `private` |  |  |
| `is_primary` | boolean | ja | `false` |  |  |
| `verified` | boolean | ja | `false` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `person_interest`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `person_id` | uuid | PK |  | `person.id` |  |
| `vocabulary` | text | PK |  |  |  |
| `term_key` | text | PK |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |

### `person_merge_log`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `surviving_person_id` | uuid | ja |  | `person.id` |  |
| `merged_person_id` | uuid | ja |  |  |  |
| `merged_at` | timestamp with time zone | ja | `now()` |  |  |
| `actor` | text |  |  |  |  |
| `payload` | jsonb |  |  |  |  |

### `potential_duplicate`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `person_id_a` | uuid | ja |  | `person.id` |  |
| `person_id_b` | uuid | ja |  | `person.id` |  |
| `score` | numeric | ja |  |  |  |
| `signals` | jsonb | ja |  |  |  |
| `status` | text | ja | `open` |  |  |
| `reviewed_by` | uuid |  |  |  |  |
| `reviewed_at` | timestamp with time zone |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `programme_backlog`
Sessions ohne Slot (Backlog-Leiste des Boards).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `session_id` | uuid | PK |  |  |  |
| `event_id` | uuid |  |  | `event.id` |  |
| `title_de` | text |  |  |  |  |
| `title_en` | text |  |  |  |  |
| `format` | text |  |  |  |  |
| `language` | text |  |  |  |  |
| `access_mode` | text |  |  |  |  |
| `publish_status` | text |  |  |  |  |
| `host_org_id` | uuid |  |  | `organization.id` |  |
| `created_by` | uuid |  |  | `person.id` |  |
| `created_at` | timestamp with time zone |  |  |  |  |
| `speakers` | jsonb |  |  |  |  |
| `can_edit` | boolean |  |  |  |  |

### `question_catalog`
Zentraler Fragenkatalog für Bewerbungen (Antwort C: Katalog + max. 2 eigene Fragen je Session).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `key` | text | ja |  |  |  |
| `label_de` | text | ja |  |  |  |
| `label_en` | text | ja |  |  |  |
| `help_de` | text |  |  |  |  |
| `help_en` | text |  |  |  |  |
| `type` | text | ja |  |  |  |
| `options` | jsonb |  |  |  |  |
| `active` | boolean | ja | `true` |  |  |
| `sort_order` | integer | ja | `0` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `registration`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `person_id` | uuid | ja |  | `person.id` |  |
| `event_id` | uuid | ja |  | `event.id` |  |
| `status` | text | ja |  |  |  |
| `ticket_type` | text |  |  |  |  |
| `source` | text |  |  |  |  |
| `external_source` | text |  |  |  |  |
| `external_ref` | text |  |  |  |  |
| `external_ids` | jsonb |  |  |  |  |
| `registered_at` | timestamp with time zone | ja | `now()` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `session_id` | uuid |  |  | `session.id` | Gesetzt bei Anmeldung zu einer Session (access_mode registration); null bei Event-Registrierungen. |

### `role_assignment`
Rolle × Scope je Person. Rollen außer admin sind edition-gebunden (edition_id). Schreiben nur service_role.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `person_id` | uuid | ja |  | `person.id` |  |
| `role` | text | ja |  |  |  |
| `scope_type` | text | ja | `global` |  |  |
| `scope_id` | uuid |  |  |  |  |
| `edition_id` | uuid |  |  | `event.id` |  |
| `portal` | text |  |  |  |  |
| `valid_from` | timestamp with time zone | ja | `now()` |  |  |
| `valid_to` | timestamp with time zone |  |  |  |  |
| `granted_by` | uuid |  |  | `person.id` |  |
| `note` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `session`
Programmpunkt (öffentliche Felder für App/Website/Swapcard). Interne Regie-Werte liegen in regie_cue (Welle 4).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `event_id` | uuid | ja |  | `event.id` |  |
| `slot_id` | uuid |  |  | `slot.id` |  |
| `format` | text | ja | `keynote` |  |  |
| `title_de` | text |  |  |  |  |
| `title_en` | text |  |  |  |  |
| `description_de` | text |  |  |  |  |
| `description_en` | text |  |  |  |  |
| `language` | text | ja | `de` |  |  |
| `access_mode` | text | ja | `open` |  | open = einfach hingehen · registration = anmelden · application = bewerben (Pipeline). |
| `eligibility_rule` | jsonb |  |  |  | JSON-Regel für Bewerbungsberechtigung (z. B. {"tier":"talent","u35":true}). |
| `capacity` | integer |  |  |  |  |
| `ticket_required` | boolean | ja | `true` |  |  |
| `application_deadline` | timestamp with time zone |  |  |  |  |
| `confirm_by_hours` | integer | ja | `72` |  |  |
| `host_org_id` | uuid |  |  | `organization.id` |  |
| `track_id` | uuid |  |  | `track.id` |  |
| `moderation_person_id` | uuid |  |  | `person.id` |  |
| `publish_status` | text | ja | `draft` |  |  |
| `tags` | text[] | ja |  |  |  |
| `swapcard_id` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `created_by` | uuid |  |  | `person.id` |  |
| `updated_by` | uuid |  |  | `person.id` |  |

### `session_question`
Fragen einer Session: aus dem Katalog oder eigene (max. 2, Freigabe durch Programm-Team).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `session_id` | uuid | ja |  | `session.id` |  |
| `question_id` | uuid |  |  | `question_catalog.id` |  |
| `label_de` | text |  |  |  |  |
| `label_en` | text |  |  |  |  |
| `type` | text |  |  |  |  |
| `options` | jsonb |  |  |  |  |
| `required` | boolean | ja | `false` |  |  |
| `sort_order` | integer | ja | `0` |  |  |
| `approved_by` | uuid |  |  | `person.id` |  |
| `approved_at` | timestamp with time zone |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |

### `session_speaker`
Speaker/Moderation/Host je Session.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `session_id` | uuid | PK |  | `session.id` |  |
| `person_id` | uuid | PK |  | `person.id` |  |
| `role` | text | PK | `speaker` |  |  |
| `sort_order` | integer | ja | `0` |  |  |
| `confirmed` | boolean | ja | `false` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |

### `slot`
Zeitfenster auf einer Bühne. Genau eine Session kann darauf liegen. Farbe im Board = status.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `stage_id` | uuid | ja |  | `stage.id` |  |
| `event_day_id` | uuid | ja |  | `event_day.id` |  |
| `start_at` | timestamp with time zone | ja |  |  |  |
| `end_at` | timestamp with time zone | ja |  |  |  |
| `slot_type` | text | ja | `content` |  |  |
| `status` | text | ja | `open` |  |  |
| `sort_order` | integer | ja | `0` |  |  |
| `source_ref` | text |  |  |  |  |
| `responsible_person_id` | uuid |  |  | `person.id` |  |
| `internal_title` | text |  |  |  | Interner Titel für Regie/Programm-Team, nie öffentlich. |
| `internal_notes` | text |  |  |  |  |
| `created_by` | uuid |  |  | `person.id` |  |
| `updated_by` | uuid |  |  | `person.id` |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `slot_history`
Änderungslog des Programm-Boards (Verschiebungen nach Veröffentlichung sichtbar).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | bigint | PK |  |  |  |
| `slot_id` | uuid | ja |  | `slot.id` |  |
| `changed_by` | uuid |  |  | `person.id` |  |
| `changed_at` | timestamp with time zone | ja | `now()` |  |  |
| `action` | text | ja |  |  |  |
| `before` | jsonb |  |  |  |  |
| `after` | jsonb |  |  |  |  |
| `reason` | text |  |  |  |  |

### `staff_user`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `auth_user_id` | uuid | PK |  |  |  |
| `email` | extensions.citext |  |  |  |  |
| `display_name` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |

### `stage`
Bühne oder Raum eines Events. Parameter (Wechselzeit, Standarddauer, Kontingent) steuern das Programm-Board.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `event_id` | uuid | ja |  | `event.id` |  |
| `name` | text | ja |  |  |  |
| `slug` | text |  |  |  |  |
| `type` | text | ja | `side` |  |  |
| `room` | text |  |  |  |  |
| `capacity` | integer |  |  |  |  |
| `partner_org_id` | uuid |  |  | `organization.id` | Partnerbühne: Organisation, die ihre Spalte selbst pflegt (Rolle standbuehne_editor). |
| `stage_lead_person_id` | uuid |  |  | `person.id` |  |
| `changeover_min` | integer | ja | `0` |  |  |
| `default_duration_min` | integer | ja | `30` |  |  |
| `partner_slot_quota` | integer |  |  |  | Kontingent verkaufter Partner-Slots auf dieser Bühne (Zähler im Board). |
| `sort_order` | integer | ja | `0` |  |  |
| `active` | boolean | ja | `true` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `stage_day`
Bühne × Tag: Öffnungszeiten und Slot-Kontingent (allgemeine Slot-Logik, Antwort 74).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `stage_id` | uuid | ja |  | `stage.id` |  |
| `event_day_id` | uuid | ja |  | `event_day.id` |  |
| `open_from` | time without time zone |  |  |  |  |
| `open_to` | time without time zone |  |  |  |  |
| `slot_quota` | integer |  |  |  |  |
| `notes` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `suppression`
sha256(lower(email)) gelöschter/gesperrter Adressen. Vor jedem Import und Mailversand prüfen.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `email_hash` | text | PK |  |  |  |
| `reason` | text | ja | `profile_deleted` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |

### `ticket`
Ticket aus vivenu (Barcode = QR) oder Freiticket (Crew/Speaker). Badge-Felder werden nach vivenu zurückgeschrieben.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `event_id` | uuid | ja |  | `event.id` |  |
| `person_id` | uuid |  |  | `person.id` |  |
| `ticket_type_map_id` | uuid |  |  | `ticket_type_map.id` |  |
| `pass_type` | text |  |  |  |  |
| `barcode` | text | ja |  |  |  |
| `vivenu_ticket_id` | text |  |  |  |  |
| `vivenu_transaction_id` | text |  |  |  |  |
| `vivenu_customer_id` | text |  |  |  |  |
| `buyer_email` | extensions.citext |  |  |  |  |
| `holder_email` | extensions.citext |  |  |  | E-Mail der Person, für die das Ticket personalisiert wurde (kann vom Käufer abweichen). |
| `holder_first_name` | text |  |  |  |  |
| `holder_last_name` | text |  |  |  |  |
| `holder_company` | text |  |  |  |  |
| `holder_position` | text |  |  |  |  |
| `status` | text | ja | `valid` |  |  |
| `personalization_status` | text | ja | `pending` |  |  |
| `addons` | jsonb | ja |  |  |  |
| `price_cents` | integer |  |  |  |  |
| `currency` | text | ja | `EUR` |  |  |
| `source` | text | ja | `vivenu` |  |  |
| `purchased_at` | timestamp with time zone |  |  |  |  |
| `personalized_at` | timestamp with time zone |  |  |  |  |
| `checked_in_at` | timestamp with time zone |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `ticket_type_map`
vivenu-Tickettyp ↔ Pass-Typ ↔ Swapcard-Gruppe/Rechte (Antwort 53: eine Gruppe je Pass-Typ).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `event_id` | uuid | ja |  | `event.id` |  |
| `vivenu_ticket_type_id` | text | ja |  |  |  |
| `vivenu_ticket_name` | text |  |  |  |  |
| `pass_type` | text | ja |  |  |  |
| `swapcard_group` | text |  |  |  |  |
| `rights` | jsonb | ja |  |  |  |
| `active` | boolean | ja | `true` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `track`
Thematischer Track (Swapcard-Track).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `event_id` | uuid | ja |  | `event.id` |  |
| `name_de` | text | ja |  |  |  |
| `name_en` | text |  |  |  |  |
| `slug` | text |  |  |  |  |
| `sort_order` | integer | ja | `0` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |

### `vocab_term`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `vocabulary` | text | PK |  |  |  |
| `key` | text | PK |  |  |  |
| `label_de` | text | ja |  |  |  |
| `label_en` | text | ja |  |  |  |
| `sort_order` | integer | ja | `0` |  |  |
| `active` | boolean | ja | `true` |  |  |
| `parent_vocabulary` | text |  |  |  |  |
| `parent_key` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

## Views

### `consent_current`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `person_id` | uuid |  |  | `person.id` |  |
| `consent_type` | text |  |  |  |  |
| `version` | text |  |  |  |  |
| `granted` | boolean |  |  |  |  |
| `granted_at` | timestamp with time zone |  |  |  |  |
| `revoked_at` | timestamp with time zone |  |  |  |  |

### `person_lifecycle`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `person_id` | uuid |  |  | `person.id` |  |
| `format_tag` | text |  |  |  |  |
| `lifecycle_status` | text |  |  |  |  |

### `person_lifecycle_current`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `person_id` | uuid |  |  | `person.id` |  |
| `lifecycle_status` | text |  |  |  |  |

### `programme_board`
Board-Sicht je Tag: Slots × Bühnen mit Session und Speakern; can_edit für den Aufrufer.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `slot_id` | uuid | PK |  |  |  |
| `stage_id` | uuid |  |  | `stage.id` |  |
| `stage_name` | text |  |  |  |  |
| `stage_slug` | text |  |  |  |  |
| `stage_type` | text |  |  |  |  |
| `room` | text |  |  |  |  |
| `stage_sort` | integer |  |  |  |  |
| `changeover_min` | integer |  |  |  |  |
| `default_duration_min` | integer |  |  |  |  |
| `event_day_id` | uuid |  |  | `event_day.id` |  |
| `day_date` | date |  |  |  |  |
| `event_id` | uuid |  |  | `event.id` |  |
| `start_at` | timestamp with time zone |  |  |  |  |
| `end_at` | timestamp with time zone |  |  |  |  |
| `slot_type` | text |  |  |  |  |
| `slot_status` | text |  |  |  |  |
| `slot_sort` | integer |  |  |  |  |
| `session_id` | uuid | PK |  |  |  |
| `title_de` | text |  |  |  |  |
| `title_en` | text |  |  |  |  |
| `format` | text |  |  |  |  |
| `language` | text |  |  |  |  |
| `access_mode` | text |  |  |  |  |
| `publish_status` | text |  |  |  |  |
| `capacity` | integer |  |  |  |  |
| `host_org_id` | uuid |  |  | `organization.id` |  |
| `track_id` | uuid |  |  | `track.id` |  |
| `speakers` | jsonb |  |  |  |  |
| `can_edit` | boolean |  |  |  |  |

### `programme_public`
Veröffentlichtes Programm (Talent-Portal, Swapcard-Sync).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `session_id` | uuid | PK |  |  |  |
| `event_id` | uuid |  |  | `event.id` |  |
| `format` | text |  |  |  |  |
| `title_de` | text |  |  |  |  |
| `title_en` | text |  |  |  |  |
| `description_de` | text |  |  |  |  |
| `description_en` | text |  |  |  |  |
| `language` | text |  |  |  |  |
| `access_mode` | text |  |  |  |  |
| `capacity` | integer |  |  |  |  |
| `ticket_required` | boolean |  |  |  |  |
| `application_deadline` | timestamp with time zone |  |  |  |  |
| `track_id` | uuid |  |  | `track.id` |  |
| `tags` | text[] |  |  |  |  |
| `host_org_id` | uuid |  |  | `organization.id` |  |
| `slot_id` | uuid | PK |  |  |  |
| `start_at` | timestamp with time zone |  |  |  |  |
| `end_at` | timestamp with time zone |  |  |  |  |
| `stage_id` | uuid | PK |  |  |  |
| `stage_name` | text |  |  |  |  |
| `room` | text |  |  |  |  |
| `event_day_id` | uuid | PK |  |  |  |
| `day_date` | date |  |  |  |  |

### `stage_day_slot_stats`
Verfügbare/belegte Slots je Bühne × Tag (Board-Kopfzeile, Antwort 74).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `stage_day_id` | uuid | PK |  |  |  |
| `stage_id` | uuid |  |  | `stage.id` |  |
| `event_day_id` | uuid |  |  | `event_day.id` |  |
| `slot_quota` | integer |  |  |  |  |
| `slots_used` | bigint |  |  |  |  |
| `slots_placeholder` | bigint |  |  |  |  |
| `slots_available` | bigint |  |  |  |  |

## Funktionen (RPC)

| Funktion | Parameter |
|---|---|
| `active_roles` | args: ? |
| `apply_to_session` | p_answers: jsonb, p_consent_share: boolean, p_session_id: uuid |
| `approve_session_questions` | p_session_id: uuid |
| `attach_session_to_slot` | p_session_id: uuid, p_slot_id: uuid |
| `can_decide_session` | p_session_id: uuid |
| `can_edit_session` | p_session_id: uuid |
| `can_edit_slot` | p_slot_id: uuid |
| `can_edit_stage` | p_stage_id: uuid |
| `cancel_registration` | p_session_id: uuid |
| `claim_or_create_person` | args: ? |
| `confirm_application` | p_application_id: uuid, p_replace_conflicting: boolean |
| `create_slot` | p_end: timestamp with time zone, p_session_id: uuid, p_slot_type: text, p_source_ref: text, p_stage_id: uuid, p_start: timestamp with time zone |
| `current_person_id` | args: ? |
| `decide_application` | p_application_id: uuid, p_rank: integer, p_status: text |
| `decisions_released` | p_session_id: uuid |
| `delete_my_profile` | args: ? |
| `detach_session` | p_session_id: uuid |
| `email_hash` | p_email: text |
| `expire_overdue_applications` | args: ? |
| `harden_definer_functions` | args: ? |
| `has_role` | p_edition_id: uuid, p_role: text, p_scope_id: uuid, p_scope_type: text |
| `immutable_unaccent` | : text |
| `is_admin` | args: ? |
| `is_member_of_org` | p_org_id: uuid |
| `is_programme_editor` | p_event_id: uuid |
| `is_programme_reader` | args: ? |
| `is_session_visible` | p_session_id: uuid |
| `is_speaker_of` | p_session_id: uuid |
| `is_staff` | args: ? |
| `is_suppressed` | p_email: text |
| `is_u35` | p_birthdate: date, p_ref: date |
| `log_audit` | p_action: text, p_after: jsonb, p_before: jsonb, p_object_id: text, p_object_type: text |
| `move_slot` | p_confirm: boolean, p_end: timestamp with time zone, p_slot_id: uuid, p_stage_id: uuid, p_start: timestamp with time zone |
| `my_applications` | args: ? |
| `my_roles` | args: ? |
| `personalize_ticket` | p_company: text, p_first_name: text, p_for_me: boolean, p_holder_email: text, p_last_name: text, p_position: text, p_ticket_id: uuid |
| `promote_waitlist` | p_count: integer, p_session_id: uuid |
| `publish_session` | p_session_id: uuid |
| `register_for_session` | p_session_id: uuid |
| `release_decisions` | p_note: text, p_session_id: uuid |
| `session_context` | args: ? |
| `session_speakers_public` | p_session_id: uuid |
| `set_primary_email` | p_email_id: uuid |
| `set_session_questions` | p_questions: jsonb, p_replace_custom: boolean, p_session_id: uuid |
| `set_session_speakers` | p_session_id: uuid, p_speakers: jsonb |
| `set_slot_status` | p_slot_id: uuid, p_status: text |
| `slot_has_published_session` | p_slot_id: uuid |
| `unpublish_session` | p_reason: text, p_session_id: uuid |
| `upsert_session` | p_data: jsonb |
| `withdraw_application` | p_application_id: uuid |
