# Datenmodell (generiert)

> **Nicht von Hand bearbeiten.** Erzeugt mit `node --env-file=.env.local scripts/gen-schema-doc.mjs` aus dem laufenden Supabase-Projekt (PostgREST-OpenAPI über `information_schema` + `comment on`).
>
> Stand: 2026-09-10 17:36 UTC · 53 Tabellen · 6 Views · 184 Funktionen
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

### `booth`
Stand je Partner × Edition (Nummer, Fläche, Rückwand-Maße); Team pflegt, Partner liest. Produktionsdetails folgen in Welle 4.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `org_edition_id` | uuid | ja |  | `org_edition.id` |  |
| `booth_number` | text |  |  |  |  |
| `booth_type` | text |  |  |  |  |
| `segment` | text |  |  |  |  |
| `length_m` | numeric |  |  |  |  |
| `width_m` | numeric |  |  |  |  |
| `backdrop_w_mm` | integer |  |  |  |  |
| `backdrop_h_mm` | integer |  |  |  |  |
| `notes` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

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

### `deadline`
Fristen je Edition; speist Countdowns, Uploads (late-Markierung) und später Wiki/Checklisten.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `edition_id` | uuid | ja |  | `event.id` |  |
| `key` | text | ja |  |  |  |
| `audience` | text | ja | `all` |  |  |
| `due_at` | timestamp with time zone | ja |  |  |  |
| `label_de` | text | ja |  |  |  |
| `label_en` | text | ja |  |  |  |
| `description_de` | text |  |  |  |  |
| `description_en` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `reminder_lead_hours` | integer | ja | `48` |  | Erinnerung so viele Stunden vor der wirksamen Fälligkeit (Deadline ∧ 48 h vor Slot); 0 = zur Fälligkeit. |

### `decision_release`
Erst nach Freigabe werden Zusagen/Absagen sichtbar und Mails ausgelöst (Antwort C).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `session_id` | uuid | ja |  | `session.id` |  |
| `released_by` | uuid |  |  | `person.id` |  |
| `released_at` | timestamp with time zone | ja | `now()` |  |  |
| `note` | text |  |  |  |  |

### `deliverable`
Pflicht eines Partners je Edition, abgeleitet aus deliverable_template × gebuchte Leistungen.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `org_edition_id` | uuid | ja |  | `org_edition.id` |  |
| `template_id` | uuid | ja |  | `deliverable_template.id` |  |
| `key` | text | ja |  |  |  |
| `product_sku` | text |  |  | `product.sku` |  |
| `status` | text | ja | `open` |  |  |
| `due_at` | timestamp with time zone |  |  |  |  |
| `submitted_at` | timestamp with time zone |  |  |  |  |
| `submitted_by` | uuid |  |  | `person.id` |  |
| `asset_ids` | uuid[] | ja |  |  |  |
| `answers` | jsonb | ja |  |  |  |
| `reviewed_by` | uuid |  |  | `person.id` |  |
| `reviewed_at` | timestamp with time zone |  |  |  |  |
| `review_note` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `deliverable_template`
Checklisten-Vorlagen je Produkt/Kategorie/alle; daraus entstehen die Pflichten (deliverable) einer Partner-Organisation.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `key` | text | ja |  |  |  |
| `product_sku` | text |  |  | `product.sku` |  |
| `category` | text |  |  |  |  |
| `type` | text | ja |  |  |  |
| `label_de` | text | ja |  |  |  |
| `label_en` | text | ja |  |  |  |
| `description_de` | text |  |  |  |  |
| `description_en` | text |  |  |  |  |
| `due_rule` | jsonb | ja |  |  |  |
| `file_rules` | jsonb |  |  |  |  |
| `required` | boolean | ja | `true` |  |  |
| `audience_roles` | text[] | ja |  |  |  |
| `sort` | integer | ja | `100` |  |  |
| `active` | boolean | ja | `true` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

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
| `hubspot_pipeline_id` | text |  |  |  | HubSpot-Deal-Pipeline der Edition; der Ingest ordnet Deals darüber zu. |
| `hubspot_onboarding_stage_id` | text |  |  |  | Deal-Phase „Onboarding Automation"; der Webhook auf diese Phase löst den Ingest aus. |

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

### `expense_claim`
Reisekostenanträge der Speaker. Bankdaten nur im Vault (bank_secret_id), hier nur Maske und Kontoinhaber.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `profile_id` | uuid | ja |  | `speaker_profile.id` |  |
| `status` | text | ja | `draft` |  |  |
| `currency` | text | ja | `EUR` |  |  |
| `positions` | jsonb | ja |  |  |  |
| `amount_cents` | integer | ja | `0` |  |  |
| `bank_secret_id` | uuid |  |  |  |  |
| `bank_masked` | text |  |  |  |  |
| `bank_holder` | text |  |  |  |  |
| `invoice_no` | text |  |  |  |  |
| `invoice_asset_id` | uuid |  |  | `speaker_asset.id` |  |
| `submitted_at` | timestamp with time zone |  |  |  |  |
| `submitted_by` | uuid |  |  | `person.id` |  |
| `reviewed_by` | uuid |  |  | `person.id` |  |
| `reviewed_at` | timestamp with time zone |  |  |  |  |
| `review_note` | text |  |  |  |  |
| `sevdesk_ref` | text |  |  |  |  |
| `sevdesk_sent_at` | timestamp with time zone |  |  |  |  |
| `qonto_sent_at` | timestamp with time zone |  |  |  |  |
| `paid_at` | timestamp with time zone |  |  |  |  |
| `paid_by` | uuid |  |  | `person.id` |  |
| `payment_ref` | text |  |  |  |  |
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

### `hospitality_booking`
Hotel-/Shuttle-Buchungen der Speaker; requested → confirmed durch das Team, waitlisted bei Überbuchung.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `quota_id` | uuid | ja |  | `hospitality_quota.id` |  |
| `profile_id` | uuid | ja |  | `speaker_profile.id` |  |
| `kind` | text | ja |  |  |  |
| `status` | text | ja | `requested` |  |  |
| `guests` | integer | ja | `1` |  |  |
| `details` | jsonb | ja |  |  |  |
| `created_by` | uuid |  |  | `person.id` |  |
| `confirmed_by` | uuid |  |  | `person.id` |  |
| `confirmed_at` | timestamp with time zone |  |  |  |  |
| `cancelled_at` | timestamp with time zone |  |  |  |  |
| `team_note` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `hospitality_quota`
Hospitality-Kontingente je Edition: Hotels nach Tier, Shuttles. Kapazität hotel = Zimmer, shuttle = Plätze.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `edition_id` | uuid | ja |  | `event.id` |  |
| `kind` | text | ja |  |  |  |
| `tier` | text |  |  |  |  |
| `label_de` | text | ja |  |  |  |
| `label_en` | text | ja |  |  |  |
| `description_de` | text |  |  |  |  |
| `description_en` | text |  |  |  |  |
| `location` | text |  |  |  |  |
| `capacity` | integer | ja | `0` |  |  |
| `window_from` | timestamp with time zone |  |  |  |  |
| `window_to` | timestamp with time zone |  |  |  |  |
| `notes` | text |  |  |  |  |
| `active` | boolean | ja | `true` |  |  |
| `sort_order` | integer | ja | `100` |  |  |
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

### `org_edition`
Partner-Organisation je Edition: Onboarding-Stand, Rechnungsdaten, Pass-Typ-Wahl, HubSpot-Deal.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `org_id` | uuid | ja |  | `organization.id` |  |
| `edition_id` | uuid | ja |  | `event.id` |  |
| `onboarding_status` | text | ja | `none` |  |  |
| `invited_at` | timestamp with time zone |  |  |  |  |
| `onboarding_filled_at` | timestamp with time zone |  |  |  |  |
| `description_de` | text |  |  |  |  |
| `description_en` | text |  |  |  |  |
| `invoice_email` | extensions.citext |  |  |  |  |
| `invoice_name` | text |  |  |  |  |
| `vat_id` | text |  |  |  |  |
| `po_number` | text |  |  |  |  |
| `pass_type_choice` | text |  |  |  |  |
| `sponsoring_level` | text |  |  |  |  |
| `hubspot_deal_id` | text |  |  |  |  |
| `notes_internal` | text |  |  |  |  |
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
| `contact_position` | text |  |  |  |  |
| `invited_at` | timestamp with time zone |  |  |  |  |

### `org_product`
Gebuchte Leistungen je Partner × Edition (aus HubSpot-Line-Items); steuert Checkliste und Sichtbarkeit.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `org_edition_id` | uuid | ja |  | `org_edition.id` |  |
| `product_sku` | text | ja |  | `product.sku` |  |
| `qty` | numeric | ja | `1` |  |  |
| `unit_price_cents` | integer |  |  |  |  |
| `hubspot_line_item_id` | text |  |  |  |  |
| `status` | text | ja | `booked` |  |  |
| `notes` | text |  |  |  |  |
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

### `partner_asset`
Dateien einer Partner-Organisation im Bucket partner-assets (Pfad <edition>/<org>/<kind>/<datei>), versioniert.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `org_edition_id` | uuid | ja |  | `org_edition.id` |  |
| `deliverable_id` | uuid |  |  | `deliverable.id` |  |
| `kind` | text | ja |  |  |  |
| `storage_path` | text | ja |  |  |  |
| `filename` | text | ja |  |  |  |
| `mime` | text |  |  |  |  |
| `size_bytes` | bigint |  |  |  |  |
| `version` | integer | ja | `1` |  |  |
| `is_current` | boolean | ja | `true` |  |  |
| `status` | text | ja | `pending` |  |  |
| `review_note` | text |  |  |  |  |
| `reviewed_by` | uuid |  |  | `person.id` |  |
| `reviewed_at` | timestamp with time zone |  |  |  |  |
| `uploaded_by` | uuid |  |  | `person.id` |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `partner_deal`
Verarbeitete HubSpot-Deals je Partner × Edition (Idempotenz des Ingests, Sweep-Abgleich). Kein Personenbezug im payload.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `hubspot_deal_id` | text | PK |  |  |  |
| `org_edition_id` | uuid | ja |  | `org_edition.id` |  |
| `deal_name` | text |  |  |  |  |
| `ingested_at` | timestamp with time zone | ja | `now()` |  |  |
| `payload` | jsonb |  |  |  |  |

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
| `preferred_language` | text |  |  |  |  |
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

### `product`
Produktstamm (Pakete, Zusatzleistungen, Shop-Artikel). SKU = Item-ID der Item-Liste; nach dem Import ist das Portal Quelle der Wahrheit.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `sku` | text | PK |  |  |  |
| `name_de` | text | ja |  |  |  |
| `name_en` | text |  |  |  |  |
| `description_de` | text |  |  |  |  |
| `description_en` | text |  |  |  |  |
| `type` | text | ja |  |  |  |
| `category` | text | ja |  |  |  |
| `unit` | text | ja | `piece` |  |  |
| `net_price_cents` | integer |  |  |  |  |
| `purchase_price_cents` | integer |  |  |  |  |
| `margin` | numeric |  |  |  |  |
| `vat_rate` | numeric | ja | `7` |  |  |
| `supplier` | text |  |  |  |  |
| `supplier_sku` | text |  |  |  |  |
| `supplier_url` | text |  |  |  |  |
| `stock_total` | integer |  |  |  |  |
| `track_stock` | boolean | ja | `false` |  |  |
| `available_until` | timestamp with time zone |  |  |  |  |
| `shop_visible` | boolean | ja | `false` |  |  |
| `shop_sort` | integer |  |  |  |  |
| `late_orderable` | boolean | ja | `false` |  |  |
| `shop_hint_de` | text |  |  |  |  |
| `shop_hint_en` | text |  |  |  |  |
| `purchase_note_de` | text |  |  |  |  |
| `purchase_note_en` | text |  |  |  |  |
| `merch_config` | jsonb |  |  |  |  |
| `images` | jsonb | ja |  |  |  |
| `source_hubspot` | boolean | ja | `false` |  |  |
| `source_shop` | boolean | ja | `false` |  |  |
| `internal_comment` | text |  |  |  |  |
| `active` | boolean | ja | `true` |  |  |
| `edition_id` | uuid |  |  | `event.id` |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `pass_type` | text |  |  |  |  |
| `grants_role` | text |  |  |  |  |

### `product_component`
Stückliste: was in einem Paket steckt (Messebau/Regie).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `bundle_sku` | text | PK |  | `product.sku` |  |
| `component_sku` | text | PK |  | `product.sku` |  |
| `qty` | numeric | ja |  |  |  |

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

### `session_submission`
Vom Speaker eingereichte Session-Inhalte; final steht in session (Freigabe kopiert).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `session_id` | uuid | ja |  | `session.id` |  |
| `speaker_profile_id` | uuid |  |  | `speaker_profile.id` |  |
| `submitted_by` | uuid |  |  | `person.id` |  |
| `title` | text |  |  |  |  |
| `description` | text |  |  |  |  |
| `topics` | text[] | ja |  |  |  |
| `language` | text |  |  |  |  |
| `notes` | text |  |  |  |  |
| `status` | text | ja | `submitted` |  |  |
| `reviewed_by` | uuid |  |  | `person.id` |  |
| `reviewed_at` | timestamp with time zone |  |  |  |  |
| `review_note` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

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

### `speaker_asset`
Dateien im Bucket speaker-assets: Präsentationen (Versionen, late, Technik-Check, Slid@Home), Fotos, Sonstiges.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `profile_id` | uuid | ja |  | `speaker_profile.id` |  |
| `session_id` | uuid |  |  | `session.id` |  |
| `kind` | text | ja |  |  |  |
| `storage_path` | text | ja |  |  |  |
| `filename` | text | ja |  |  |  |
| `mime` | text |  |  |  |  |
| `size_bytes` | bigint |  |  |  |  |
| `version` | integer | ja | `1` |  |  |
| `is_current` | boolean | ja | `true` |  |  |
| `late` | boolean | ja | `false` |  |  |
| `tech_check_status` | text | ja | `pending` |  |  |
| `tech_check_note` | text |  |  |  |  |
| `tech_checked_by` | uuid |  |  | `person.id` |  |
| `tech_checked_at` | timestamp with time zone |  |  |  |  |
| `slides_release` | boolean | ja | `false` |  |  |
| `uploaded_by` | uuid |  |  | `person.id` |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `speaker_profile`
Speaker je Edition: Pipeline, Staff-Flags (Reception, Lounge, Pass, Hospitality, Reisekosten), Tech-Rider, Assistenz. Schreiben nur per RPC.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `person_id` | uuid | ja |  | `person.id` |  |
| `edition_id` | uuid | ja |  | `event.id` |  |
| `speaker_type` | text | ja | `other` |  |  |
| `pipeline_status` | text | ja | `lead` |  |  |
| `owner_person_id` | uuid |  |  | `person.id` |  |
| `job_title` | text |  |  |  |  |
| `organization_name` | text |  |  |  |  |
| `org_id` | uuid |  |  | `organization.id` |  |
| `bio_short_en` | text |  |  |  |  |
| `bio_short_de` | text |  |  |  |  |
| `bio_long_en` | text |  |  |  |  |
| `bio_long_de` | text |  |  |  |  |
| `socials` | jsonb | ja |  |  |  |
| `photo_asset_id` | uuid |  |  | `speaker_asset.id` |  |
| `reception_eligible` | boolean | ja | `false` |  |  |
| `lounge_access` | boolean | ja | `true` |  |  |
| `pass_type` | text | ja | `speaker` |  |  |
| `hotel_tier` | text | ja | `standard` |  |  |
| `hospitality_status` | text | ja | `none` |  |  |
| `travel_costs_covered` | boolean | ja | `false` |  |  |
| `travel_costs_approved_by` | uuid |  |  | `person.id` |  |
| `travel_costs_approved_at` | timestamp with time zone |  |  |  |  |
| `tech_rider` | jsonb | ja |  |  |  |
| `assistant_person_id` | uuid |  |  | `person.id` |  |
| `internal_notes` | text |  |  |  |  |
| `invited_at` | timestamp with time zone |  |  |  |  |
| `created_by` | uuid |  |  | `person.id` |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

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
| `barcode` | text |  |  |  | QR aus vivenu. NULL, solange ein Freiticket noch nicht ausgestellt ist (Status requested/approved). |
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
| `speaker_profile_id` | uuid |  |  | `speaker_profile.id` | Freiticket aus dem Speaker-Portal: eigenes Ticket (source speaker) oder Begleitticket (source speaker_companion). |
| `lounge_access` | boolean | ja | `false` |  | Speaker-Lounge; aus speaker_profile.lounge_access, Begleittickets nie. |
| `team_note` | text |  |  |  | Hinweis des Teams an den Anfragenden (Ablehnungsgrund, Rückfrage). |
| `requested_by` | uuid |  |  | `person.id` |  |
| `approved_by` | uuid |  |  | `person.id` |  |
| `approved_at` | timestamp with time zone |  |  |  |  |

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
| `admin_products` | p_only_active: boolean |
| `applications_for_session` | p_session_id: uuid |
| `applications_overview` | p_event_id: uuid |
| `apply_to_session` | p_answers: jsonb, p_consent_share: boolean, p_session_id: uuid |
| `approve_expense` | p_claim_id: uuid, p_note: text |
| `approve_session_content` | p_overrides: jsonb, p_submission_id: uuid |
| `approve_session_questions` | p_session_id: uuid |
| `approve_travel_costs` | p_approved: boolean, p_profile_id: uuid |
| `assign_role` | p_edition_id: uuid, p_note: text, p_person_id: uuid, p_portal: text, p_role: text, p_scope_id: uuid, p_scope_type: text, p_valid_from: timestamp with time zone, p_valid_to: timestamp with time zone |
| `attach_session_to_slot` | p_session_id: uuid, p_slot_id: uuid |
| `book_hospitality` | p_details: jsonb, p_guests: integer, p_quota_id: uuid |
| `can_decide_session` | p_session_id: uuid |
| `can_edit_session` | p_session_id: uuid |
| `can_edit_slot` | p_slot_id: uuid |
| `can_edit_stage` | p_stage_id: uuid |
| `can_manage_speaker` | p_profile_id: uuid |
| `cancel_companion_ticket` | p_ticket_id: uuid |
| `cancel_hospitality` | p_booking_id: uuid |
| `cancel_registration` | p_session_id: uuid |
| `claim_or_create_person` | args: ? |
| `confirm_application` | p_application_id: uuid, p_replace_conflicting: boolean |
| `confirm_companion_ticket` | p_note: text, p_ticket_id: uuid |
| `confirm_hospitality` | p_booking_id: uuid, p_note: text |
| `create_slot` | p_end: timestamp with time zone, p_session_id: uuid, p_slot_type: text, p_source_ref: text, p_stage_id: uuid, p_start: timestamp with time zone |
| `current_org_edition` | p_edition_id: uuid, p_org_id: uuid |
| `current_person_id` | args: ? |
| `decide_application` | p_application_id: uuid, p_rank: integer, p_status: text |
| `decisions_released` | p_session_id: uuid |
| `decline_companion_ticket` | p_note: text, p_ticket_id: uuid |
| `decline_hospitality` | p_booking_id: uuid, p_note: text |
| `delete_my_profile` | args: ? |
| `deliverable_due` | p_oe: public.org_edition, p_template: public.deliverable_template |
| `detach_session` | p_session_id: uuid |
| `edition_valid_to` | p_edition_id: uuid |
| `email_hash` | p_email: text |
| `ensure_speaker_ticket` | p_profile_id: uuid |
| `expense_bank_details` | p_claim_id: uuid |
| `expense_eligibility` | p_profile_id: uuid |
| `expense_queue` | p_edition_id: uuid |
| `expire_overdue_applications` | args: ? |
| `finish_sync_job` | p_error: text, p_id: bigint, p_stats: jsonb, p_status: text |
| `finish_webhook_event` | p_error: text, p_id: bigint, p_related_id: uuid, p_related_type: text, p_status: text |
| `fmt_cents` | p_cents: integer, p_locale: text |
| `harden_definer_functions` | args: ? |
| `has_role` | p_edition_id: uuid, p_role: text, p_scope_id: uuid, p_scope_type: text |
| `hospitality_admin_overview` | p_edition_id: uuid |
| `hospitality_block_reason` | p_profile_id: uuid |
| `hospitality_options` | p_edition_id: uuid |
| `hospitality_used` | p_quota_id: uuid |
| `hotel_tier_rank` | p_tier: text |
| `hubspot_deals_ingested` | p_deal_ids: text[] |
| `hubspot_editions` | args: ? |
| `iban_valid` | p_iban: text |
| `immutable_unaccent` | : text |
| `ingest_partner_deal` | p: jsonb |
| `invite_assistant` | p_email: text, p_first_name: text, p_last_name: text, p_profile_id: uuid |
| `invite_speaker` | p_profile_id: uuid |
| `is_admin` | args: ? |
| `is_application_team` | p_session_id: uuid |
| `is_expense_approver` | args: ? |
| `is_member_of_org` | p_org_id: uuid |
| `is_partner_of` | p_org_id: uuid |
| `is_partner_team` | args: ? |
| `is_programme_editor` | p_event_id: uuid |
| `is_programme_reader` | args: ? |
| `is_session_visible` | p_session_id: uuid |
| `is_speaker_of` | p_session_id: uuid |
| `is_speaker_side_of` | p_session_id: uuid |
| `is_speaker_team` | p_edition_id: uuid |
| `is_staff` | args: ? |
| `is_suppressed` | p_email: text |
| `is_u35` | p_birthdate: date, p_ref: date |
| `is_vocab_key` | p_key: text, p_vocabulary: text |
| `log_audit` | p_action: text, p_after: jsonb, p_before: jsonb, p_object_id: text, p_object_type: text |
| `mail_fmt_ts` | p_locale: text, p_ts: timestamp with time zone, p_tz: text |
| `manager_speakers` | p_edition_id: uuid |
| `mark_expense_paid` | p_claim_id: uuid, p_payment_ref: text |
| `mark_overdue_deliverables` | args: ? |
| `move_slot` | p_confirm: boolean, p_end: timestamp with time zone, p_slot_id: uuid, p_stage_id: uuid, p_start: timestamp with time zone |
| `my_applications` | args: ? |
| `my_deliverables` | p_edition_id: uuid, p_org_id: uuid |
| `my_expense_claims` | args: ? |
| `my_hospitality` | p_edition_id: uuid |
| `my_manager_scope` | args: ? |
| `my_partner_orgs` | args: ? |
| `my_partner_stages` | args: ? |
| `my_roles` | args: ? |
| `my_sessions` | args: ? |
| `my_speaker_assets` | p_profile_id: uuid |
| `my_speaker_profile` | p_edition_id: uuid |
| `my_speaker_profile_id` | p_edition_id: uuid |
| `my_speaker_tickets` | p_edition_id: uuid |
| `notify_partner_leads` | p_related_id: uuid, p_related_type: text, p_template_key: text, p_vars: jsonb |
| `notify_speaker_leads` | p_related_id: uuid, p_related_type: text, p_template_key: text, p_vars: jsonb |
| `partner_admin_overview` | p_edition_id: uuid |
| `partner_applications` | p_session_id: uuid |
| `partner_asset_path_allowed` | p_name: text, p_write: boolean |
| `partner_can_edit` | p_org_id: uuid |
| `partner_can_manage_contacts` | p_org_id: uuid |
| `partner_contact_upsert_internal` | p_actor: uuid, p_edition_id: uuid, p_email: text, p_first_name: text, p_last_name: text, p_org_id: uuid, p_position: text, p_roles: text[], p_source: text |
| `partner_contacts` | p_org_id: uuid |
| `partner_deals` | p_org_id: uuid |
| `partner_digest_items` | p_org_edition_id: uuid |
| `partner_ingest_log` | p_limit: integer |
| `partner_onboarding_recheck` | p_org_edition_id: uuid |
| `partner_overview` | p_edition_id: uuid, p_org_id: uuid |
| `partner_review_queue` | p_edition_id: uuid |
| `partner_roles` | p_org_id: uuid |
| `partner_sessions` | p_org_id: uuid |
| `partner_set_onboarding_status` | p_edition_id: uuid, p_org_id: uuid, p_status: text |
| `pending_submissions` | p_event_id: uuid |
| `personalize_ticket` | p_company: text, p_first_name: text, p_for_me: boolean, p_holder_email: text, p_last_name: text, p_position: text, p_ticket_id: uuid |
| `presentation_window` | p_session_id: uuid |
| `promote_waitlist` | p_count: integer, p_session_id: uuid |
| `publish_session` | p_session_id: uuid |
| `queue_mail` | p_person_id: uuid, p_related_id: uuid, p_related_type: text, p_template_key: text, p_vars: jsonb |
| `record_sync_error` | p_job_id: bigint, p_message: text, p_object_id: text, p_object_type: text, p_payload: jsonb |
| `record_webhook_event` | p_event_type: text, p_external_id: text, p_headers: jsonb, p_payload: jsonb, p_signature_valid: boolean, p_source: text |
| `refresh_deliverable_due` | args: ? |
| `register_for_session` | p_session_id: uuid |
| `register_partner_asset` | p_deliverable_id: uuid, p_edition_id: uuid, p_filename: text, p_kind: text, p_mime: text, p_org_id: uuid, p_size_bytes: bigint, p_storage_path: text |
| `register_speaker_asset` | p_filename: text, p_kind: text, p_mime: text, p_profile_id: uuid, p_session_id: uuid, p_size_bytes: bigint, p_storage_path: text |
| `reject_expense` | p_claim_id: uuid, p_note: text |
| `reject_session_content` | p_note: text, p_submission_id: uuid |
| `release_decisions` | p_note: text, p_session_id: uuid |
| `remove_assistant` | p_profile_id: uuid |
| `remove_partner_contact` | p_org_id: uuid, p_person_id: uuid |
| `request_companion_ticket` | p_email: text, p_first_name: text, p_last_name: text, p_profile_id: uuid |
| `resolve_sync_error` | p_id: bigint |
| `resync_deliverables` | p_edition_id: uuid |
| `review_deliverable` | p_accepted: boolean, p_deliverable_id: uuid, p_note: text |
| `revoke_role` | p_assignment_id: uuid, p_note: text |
| `roles_of_person` | p_person_id: uuid |
| `run_application_housekeeping` | args: ? |
| `run_partner_housekeeping` | args: ? |
| `search_organizations` | p_limit: integer, p_query: text |
| `search_people` | p_limit: integer, p_query: text |
| `send_partner_reminders` | args: ? |
| `send_presentation_reminders` | args: ? |
| `session_context` | args: ? |
| `session_mail_vars` | p_locale: text, p_session_id: uuid |
| `session_speakers_public` | p_session_id: uuid |
| `set_contact_roles` | p_org_id: uuid, p_person_id: uuid, p_roles: text[] |
| `set_edition_hubspot` | p_edition_id: uuid, p_pipeline_id: text, p_stage_id: text |
| `set_expense_bank_details` | p_bic: text, p_claim_id: uuid, p_holder: text, p_iban: text |
| `set_expense_integration` | p_claim_id: uuid, p_invoice_asset_id: uuid, p_qonto_sent: boolean, p_sevdesk_ref: text |
| `set_primary_email` | p_email_id: uuid |
| `set_session_questions` | p_questions: jsonb, p_replace_custom: boolean, p_session_id: uuid |
| `set_session_speakers` | p_session_id: uuid, p_speakers: jsonb |
| `set_slides_release` | p_asset_id: uuid, p_release: boolean |
| `set_slot_status` | p_slot_id: uuid, p_status: text |
| `set_speaker_pipeline` | p_profile_id: uuid, p_status: text |
| `set_tech_check` | p_asset_id: uuid, p_note: text, p_status: text |
| `set_ticket_issued` | p_barcode: text, p_ticket_id: uuid, p_ticket_type_map_id: uuid, p_vivenu_ticket_id: text, p_vivenu_transaction_id: text |
| `slot_has_published_session` | p_slot_id: uuid |
| `speaker_asset_path_allowed` | p_name: text |
| `speaker_is_confirmed` | p_status: text |
| `speaker_next_steps` | p_profile_id: uuid |
| `speaker_ticket_create` | p_profile_id: uuid |
| `speaker_tickets_admin` | p_edition_id: uuid |
| `start_sync_job` | p_direction: text, p_job_type: text, p_system: text, p_triggered_by: text |
| `submit_deliverable` | p_answers: jsonb, p_asset_ids: uuid[], p_deliverable_id: uuid |
| `submit_expense` | p_claim_id: uuid |
| `submit_session_content` | p_data: jsonb, p_session_id: uuid |
| `sync_deliverables` | p_org_edition_id: uuid |
| `template_applies` | p_org_edition_id: uuid, p_template: public.deliverable_template |
| `transfer_primary_contact` | p_org_id: uuid, p_person_id: uuid |
| `unpublish_session` | p_reason: text, p_session_id: uuid |
| `update_my_speaker_profile` | p_data: jsonb |
| `update_partner_onboarding` | p_data: jsonb, p_edition_id: uuid, p_org_id: uuid |
| `update_speaker` | p_data: jsonb, p_profile_id: uuid |
| `upsert_booth` | p_data: jsonb, p_edition_id: uuid, p_org_id: uuid |
| `upsert_deadline` | p_data: jsonb |
| `upsert_deliverable_template` | p_data: jsonb |
| `upsert_expense_claim` | p_data: jsonb |
| `upsert_hospitality_quota` | p_data: jsonb |
| `upsert_partner_contact` | p_edition_id: uuid, p_email: text, p_first_name: text, p_last_name: text, p_org_id: uuid, p_position: text, p_roles: text[] |
| `upsert_product` | p_data: jsonb |
| `upsert_product_component` | p_bundle_sku: text, p_component_sku: text, p_qty: numeric |
| `upsert_session` | p_data: jsonb |
| `upsert_speaker` | p_data: jsonb |
| `validate_expense_positions` | p_positions: jsonb, p_profile_id: uuid |
| `withdraw_application` | p_application_id: uuid |
