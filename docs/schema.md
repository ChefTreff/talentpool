# Datenmodell (generiert)

> **Nicht von Hand bearbeiten.** Erzeugt mit `node --env-file=.env.local scripts/gen-schema-doc.mjs` aus dem laufenden Supabase-Projekt (PostgREST-OpenAPI über `information_schema` + `comment on`).
>
> Stand: 2026-09-25 07:09 UTC · 98 Tabellen · 6 Views · 522 Funktionen
>
> Nur über die Data-API exponierte Schemas erscheinen hier — `public`. Das Schema `integration` ist absichtlich nicht exponiert (Masterplan §2) und wird in den Migrationen beschrieben.

## Tabellen

### `admin_section_override`
ADM-053: Ausnahmen zur Abschnitts-Vorgabe aus lib/admin-sections.ts. Je Zeile entweder eine Rolle oder eine Person; `allowed` schaltet an oder aus. Person schlägt Rolle, Rolle schlägt Vorgabe; `admin` sieht immer alles und ist nicht abschaltbar.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `section` | text | ja |  |  |  |
| `role` | text |  |  |  |  |
| `person_id` | uuid |  |  | `person.id` |  |
| `allowed` | boolean | ja |  |  |  |
| `note` | text |  |  |  |  |
| `created_by` | uuid |  |  | `person.id` |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `ai_rate_limit`
Aufrufzähler je Person, Assistent und Stunde (0126). Bremse für Modellaufrufe; wird vom Housekeeping aufgeräumt. Kein Inhalt, keine Frage — nur Zahlen.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `auth_user_id` | uuid | PK |  |  |  |
| `kind` | text | PK |  |  |  |
| `window_start` | timestamp with time zone | PK |  |  |  |
| `hits` | integer | ja | `0` |  |  |

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
| `created_at` | timestamp with time zone | ja | `now()` |  |  |

### `booth`
Stand je Partner × Edition (Nummer, Fläche, Rückwand-Maße); Team pflegt, Partner liest. Produktionsdetails folgen in Welle 4.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
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

### `booth_assignment`
Wer wann an einem Stand steht (0124). event_day_id null = beide Tage. Ersetzt booth.org_edition_id: ein Stand kann tagesweise geteilt werden.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `booth_id` | uuid | ja |  | `booth.id` |  |
| `org_edition_id` | uuid | ja |  | `org_edition.id` |  |
| `event_day_id` | uuid |  |  | `event_day.id` |  |
| `note` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `booth_service_check`
Abgehakte Position der Stand-Checkliste. Eine Zeile je Stand und Artikel; fehlt sie, ist die Position offen.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `org_edition_id` | uuid | ja |  | `org_edition.id` |  |
| `product_sku` | text | ja |  | `product.sku` |  |
| `checked_by` | uuid |  |  | `person.id` |  |
| `checked_at` | timestamp with time zone | ja | `now()` |  |  |
| `note` | text |  |  |  |  |
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
| `result` | text | ja | `ok` |  | ok = eingelassen · duplicate = zweiter Scan am selben Tag · invalid = Ticket nicht gültig · blocked = gesperrt. Unbekannte Barcodes stehen hier nicht — sie werden nicht gespeichert. |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `edition_id` | uuid | ja |  | `event.id` |  |
| `scan_day` | date | ja |  |  | Tag des Scans in der Zeitzone der Edition. Eigene Spalte, weil `at time zone` STABLE ist und ein Ausdrucksindex darüber unzulässig wäre. |

### `company_tour`
Eine Company Tour: Rundfahrt vom Sammelpunkt zu mehreren Partnern (Konrad, 18.09.). Sechs Touren 2027; die echten Zeiten setzt das Team, bis dahin Dummy-Touren.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `edition_id` | uuid | ja |  | `event.id` |  |
| `name` | text | ja |  |  |  |
| `track` | text |  |  |  |  |
| `event_day_id` | uuid |  |  | `event_day.id` |  |
| `meeting_point` | text | ja | `CCH, Congressplatz 1, 20355 Hamburg` |  | Sammelpunkt 2027: CCH, Congressplatz 1, 20355 Hamburg. 2026 war es die Handelskammer — der Wert steht als Feld, damit ein Umzug keine Migration braucht. |
| `starts_at` | timestamp with time zone |  |  |  |  |
| `ends_at` | timestamp with time zone |  |  |  |  |
| `lead_contact_id` | uuid |  |  | `edition_contact.id` | Begleitperson der Tour, im Partner-Portal als „Euer Tour Lead" mit Name, Foto, E-Mail und Telefon. Aus edition_contact (Typ tour_lead), nie aus den Ablaufplänen 2026. Externe und Volunteers brauchen dort contract_consent_at — der Domain-CHECK wurde am 18.09. entsprechend gelockert (20260918105038). |
| `capacity` | integer |  |  |  |  |
| `notes` | text |  |  |  | Interne Planungsnotiz. Kommt nicht ins Partner-Portal. |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `session_id` | uuid |  |  | `session.id` | Die Session, auf die sich Teilnehmende für diese Tour bewerben (TAL-003). Optional; ohne sie gibt es für die Tour keinen Bewerbungsweg im Portal. |

### `company_tour_stop`
Eine Station einer Company Tour. Der Partner bucht den Stopp und beantwortet dazu die Fragen aus 2026 (Ansprechperson, Adresse, Zeitfenster, Snacks, Hinweise, gesuchte Profile, Fotografieren).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `tour_id` | uuid | ja |  | `company_tour.id` |  |
| `sort_order` | integer | ja | `1` |  |  |
| `arrival_at` | timestamp with time zone |  |  |  |  |
| `departure_at` | timestamp with time zone |  |  |  |  |
| `host_org_id` | uuid |  |  | `organization.id` |  |
| `address` | text |  |  |  |  |
| `contact_name` | text |  |  |  | Ansprechperson beim Partner vor Ort. Dienstliche Angaben; sie arbeitet beim Partner, deshalb ohne Domain-Prüfung. |
| `contact_email` | extensions.citext |  |  |  |  |
| `contact_phone` | text |  |  |  |  |
| `time_note` | text |  |  |  |  |
| `snacks` | boolean |  |  |  |  |
| `notes_public` | text |  |  |  | Was Teilnehmende wissen müssen: Anmeldung am Empfang, Personalausweis, Sicherheitskleidung. |
| `target_profile` | jsonb | ja |  |  |  |
| `photos_allowed` | boolean |  |  |  |  |
| `filled_at` | timestamp with time zone |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

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
| `answers_schema` | jsonb |  |  |  | Formular-Pflichten: [{key, label_de, label_en, type text\|textarea\|select\|number\|boolean\|date, required, options[]}]; submit_deliverable prüft required. |
| `fulfilled_by_sku` | text |  |  | `product.sku` | Buchungs-Pflicht gilt als eingereicht, sobald eine bestätigte Shop-Bestellung dieses Produkt enthält; Storno setzt sie zurück. |

### `edition_contact`
Ansprechpartner je Edition (F9.1). Dienstliche Mailadresse per CHECK erzwungen; die Nummer ist Pflicht, aber nicht prüfbar — gemeint ist die dienstliche.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `edition_id` | uuid | ja |  | `event.id` |  |
| `type` | text | ja |  |  |  |
| `display_name` | text | ja |  |  |  |
| `role_label_de` | text |  |  |  |  |
| `role_label_en` | text |  |  |  |  |
| `email` | extensions.citext | ja |  |  |  |
| `phone` | text | ja |  |  |  |
| `photo_path` | text |  |  |  |  |
| `is_default` | boolean | ja | `false` |  | Rückfall innerhalb einer bestehenden Zuordnungsbeziehung: ein Partner ohne gesetzten Lead sieht diesen. Nie eine Liste für alle Angemeldeten. |
| `sort_order` | integer | ja | `0` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `contract_consent_at` | date |  |  |  | Datum der vertraglichen Einwilligung, die Kontaktdaten im Portal zu zeigen (0114). Pflicht bei Adressen ausserhalb @chef-treff.de. Selbstauskunft der Redaktion, kein Nachweis — das Setzen steht mit Akteur im Audit-Log. |

### `edition_file`
Dateien, die einer Edition gehören und nicht einer Organisation: Hallenplan, Anfahrt, Aufbauplan. Privater Bucket `edition-files`, Pfad <edition_id>/<kind>/<datei>.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `edition_id` | uuid | ja |  | `event.id` |  |
| `kind` | text | ja |  |  |  |
| `storage_path` | text | ja |  |  |  |
| `filename` | text | ja |  |  |  |
| `mime` | text |  |  |  |  |
| `size_bytes` | bigint |  |  |  |  |
| `label_de` | text |  |  |  |  |
| `label_en` | text |  |  |  |  |
| `audience` | text[] | ja |  |  |  |
| `sort_order` | integer | ja | `0` |  |  |
| `uploaded_by` | uuid |  |  | `person.id` |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `edition_info`
Allgemeine Auskünfte je Edition (F9.1): Öffnungszeiten, Einlass, Aufbau, Adresse. Text, kein Zeitstempel — eine Auskunft, kein Termin.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `edition_id` | uuid | ja |  | `event.id` |  |
| `key` | text | ja |  |  |  |
| `audience` | text[] | ja |  |  |  |
| `label_de` | text |  |  |  |  |
| `label_en` | text |  |  |  |  |
| `value_de` | text |  |  |  |  |
| `value_en` | text |  |  |  |  |
| `sort_order` | integer | ja | `0` |  |  |
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
| `vivenu_event_id` | text |  |  |  | vivenu-Event der Edition (Shop mit Undershops); Team setzt es über set_edition_vivenu. |
| `swapcard_event_id` | text |  |  |  | Swapcard-Event der Edition (Content-API); gesetzt über set_edition_swapcard. Ohne Wert überträgt der Adapter nichts. |
| `hubspot_done_stage_id` | text |  |  |  | HubSpot-Phase, in die ein Deal nach gelungenem Ingest geschoben wird (z. B. „Onboarding Operations (Automation Complete)“); leer = kein Weiterschieben. |
| `vivenu_volunteer_undershop_id` | text |  |  |  | Undershop „Volunteers" dieser Edition. Ein Shop, viele persönliche Coupons. |

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
| `object_id` | uuid |  |  |  |  |
| `external_id` | text | ja |  |  |  |
| `meta` | jsonb |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `object_key` | text |  |  |  | Fremdschluessel fuer textgeschluesselte Objekte, etwa product.sku (0120). Genau eines von object_id und object_key ist gesetzt. |

### `hack_application`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `person_id` | uuid | ja |  | `person.id` |  |
| `edition_id` | uuid | ja |  | `event.id` |  |
| `skills` | text[] | ja |  |  |  |
| `motivation` | text |  |  |  |  |
| `team_pref` | text |  |  |  |  |
| `team_id` | uuid |  |  | `hack_team.id` |  |
| `status` | text | ja | `applied` |  |  |
| `applied_at` | timestamp with time zone | ja | `now()` |  |  |
| `decided_at` | timestamp with time zone |  |  |  |  |
| `decided_by` | uuid |  |  | `person.id` |  |
| `note` | text |  |  |  |  |

### `hack_challenge`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `edition_id` | uuid | ja |  | `event.id` |  |
| `org_id` | uuid |  |  | `organization.id` |  |
| `deliverable_id` | uuid |  |  | `deliverable.id` |  |
| `title_de` | text |  |  |  |  |
| `title_en` | text | ja |  |  |  |
| `description_de` | text |  |  |  |  |
| `description_en` | text |  |  |  |  |
| `prizes` | text |  |  |  |  |
| `resources` | text |  |  |  |  |
| `mentors` | jsonb | ja |  |  |  |
| `criteria` | jsonb | ja |  |  | Judging-Kriterien mit Gewichten (E4): [{key, label, weight}]. Die Gesamtnote rechnet `set_hack_score` daraus. |
| `status` | text | ja | `draft` |  |  |
| `sort_order` | integer | ja | `0` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `hack_judging_score`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `team_id` | uuid | ja |  | `hack_team.id` |  |
| `judge_id` | uuid | ja |  | `person.id` |  |
| `criteria` | jsonb | ja |  |  |  |
| `total` | numeric |  |  |  |  |
| `note` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `hack_submission`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `team_id` | uuid | ja |  | `hack_team.id` |  |
| `url` | text |  |  |  |  |
| `repo_url` | text |  |  |  |  |
| `notes` | text |  |  |  |  |
| `files` | jsonb | ja |  |  |  |
| `submitted_at` | timestamp with time zone |  |  |  |  |
| `submitted_by` | uuid |  |  | `person.id` |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `hack_team`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `edition_id` | uuid | ja |  | `event.id` |  |
| `name` | text | ja |  |  |  |
| `challenge_id` | uuid |  |  | `hack_challenge.id` |  |
| `join_code` | text | ja |  |  |  |
| `status` | text | ja | `forming` |  |  |
| `discord_url` | text |  |  |  |  |
| `note_internal` | text |  |  |  |  |
| `created_by` | uuid |  |  | `person.id` |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `hack_team_member`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `team_id` | uuid | ja |  | `hack_team.id` |  |
| `person_id` | uuid | ja |  | `person.id` |  |
| `edition_id` | uuid | ja |  | `event.id` |  |
| `role` | text |  |  |  |  |
| `is_captain` | boolean | ja | `false` |  |  |
| `joined_at` | timestamp with time zone | ja | `now()` |  |  |

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

### `kb_article`
Wissensbasis. `edition_id` NULL = jahresunabhängig; ein Artikel mit Edition überlagert ihn für diese Edition.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `slug` | text | ja |  |  |  |
| `edition_id` | uuid |  |  | `event.id` |  |
| `language` | text | ja | `de` |  |  |
| `audience` | text[] | ja |  |  |  |
| `roles` | text[] | ja |  |  | Nur für Volunteers: Rollen-Seiten aus dem Notion-Wiki. Leer heisst „für alle der Zielgruppe". |
| `phase` | text | ja | `evergreen` |  |  |
| `title` | text | ja |  |  |  |
| `body_md` | text | ja | `` |  |  |
| `status` | text | ja | `draft` |  |  |
| `valid_until` | timestamp with time zone |  |  |  |  |
| `owner_person_id` | uuid |  |  | `person.id` |  |
| `sort_order` | integer | ja | `0` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_by` | uuid |  |  | `person.id` |  |
| `published_at` | timestamp with time zone |  |  |  |  |

### `kb_chunk`
Artikel der Wissensbasis in H2-Abschnitten, für die Volltextsuche des Assistenten (0108). Entsteht ausschliesslich per Trigger aus kb_article; Zielgruppe und Status stehen bewusst NICHT hier, sondern werden beim Suchen aus kb_article gelesen.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `article_id` | uuid | ja |  | `kb_article.id` |  |
| `section_index` | integer | ja |  |  |  |
| `heading` | text |  |  |  |  |
| `body` | text | ja |  |  |  |
| `language` | text | ja |  |  |  |
| `ts` | tsvector | ja |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |

### `kb_question_log`
Was gefragt wurde, ohne wer (0108). Zweck: Wiki-Pflege — Fragen ohne Treffer sind die Luecken. Keine person_id, keine Antworttexte. Rollierend 90 Tage (purge_kb_questions).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | bigint | PK |  |  |  |
| `audience` | text | ja |  |  |  |
| `language` | text | ja |  |  |  |
| `question` | text | ja |  |  |  |
| `article_ids` | uuid[] | ja |  |  |  |
| `hit` | boolean | ja |  |  |  |
| `duration_ms` | integer |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |

### `kb_rate_limit`
Fragenzähler des Wissens-Assistenten je Konto und Stunde (0108). Bewusst getrennt von kb_question_log: der Zähler weiss, wer fragt, das Protokoll nicht — die beiden werden nie verbunden.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `auth_user_id` | uuid | PK |  |  |  |
| `window_start` | timestamp with time zone | PK |  |  |  |
| `hits` | integer | ja | `0` |  |  |
| `logged` | integer | ja | `0` |  |  |

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
| `updated_by` | uuid |  |  | `person.id` | Wer die Vorlage zuletzt geaendert hat (0112). Der volle Vorher-/Nachhertext steht im Audit-Log. |

### `next_up_item`
Hinweise „Next Up" auf Home im Teilnehmer-Portal (TAL-006): Events und Programme, im Admin gepflegt. Keine Personendaten.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `word_de` | text |  |  |  |  |
| `word_en` | text |  |  |  |  |
| `title_de` | text | ja |  |  |  |
| `title_en` | text |  |  |  |  |
| `teaser_de` | text |  |  |  |  |
| `teaser_en` | text |  |  |  |  |
| `link_url` | text |  |  |  |  |
| `starts_at` | timestamp with time zone |  |  |  |  |
| `visible_from` | timestamp with time zone |  |  |  |  |
| `visible_until` | timestamp with time zone |  |  |  |  |
| `sort_order` | integer | ja | `0` |  |  |
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
| `invoice_email` | extensions.citext |  |  |  |  |
| `invoice_name` | text |  |  |  |  |
| `vat_id` | text |  |  |  |  |
| `po_number` | text |  |  |  |  |
| `pass_type_choice` | text |  |  |  | talent \| startup — Pass-Typ der Talente-Tickets. Beim Anlegen aus organization.partner_category vorbelegt (0105), vom Partner-Team über set_pass_type_choice() änderbar; NULL bedeutet Rückfall auf den Org-Typ (effective_pass_type). |
| `sponsoring_level` | text |  |  |  |  |
| `hubspot_deal_id` | text |  |  |  |  |
| `notes_internal` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `lead_contact_id` | uuid |  |  | `edition_contact.id` |  |
| `buddy_contact_id` | uuid |  |  | `edition_contact.id` |  |
| `pipeline_stage` | text |  |  |  | Funnel-Stufe einer Initiative (0116, Vokabular initiative_stage). Bei Partnern null — deren Stand fuehrt HubSpot. |
| `source` | text | ja | `hubspot` |  | Woher diese Teilnahme kommt (0116): hubspot (Bestand und Vertrieb), portal (im Admin angelegt, z. B. Initiativen), import (Altdaten). Der HubSpot-Abgleich fasst nur hubspot-Zeilen an. |
| `logo_whitening_consent_at` | timestamp with time zone |  |  |  | Der Partner erlaubt, sein Logo für die Foto-Wand auf dem Summit einfarbig weiß zu drucken (Konrad, 22.09.2026). NULL heißt: keine Erlaubnis, das Logo kommt nicht auf die Wand — hochladen und anderweitig nutzen bleibt davon unberührt. Gilt je Edition und **nicht je Datei**: wer sein Logo korrigiert, soll nicht stillschweigend von der Wand fallen. |
| `logo_whitening_consent_by` | uuid |  |  | `person.id` | Wer die Erlaubnis erteilt hat. Nachweis, kein Anzeigefeld. |

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
| `partner_editable_until_login` | boolean | ja | `false` |  | Die Organisation hat die Person selbst angelegt: Name und Adresse darf sie pflegen, bis die Person sich zum ersten Mal anmeldet (PART-062, Regel wie 0139). |

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
| `source` | text | ja | `hubspot` |  | Woher die gebuchte Leistung kommt (0116): hubspot (Deal), agreement (Vereinbarung, Preis 0), shop (Messeshop). |

### `org_step`
Katalog der selbst zu meldenden Schritte je Thema (F9.8). Der Wortlaut steht in der Oberfläche, hier stehen nur Schlüssel und Reihenfolge — so ist „x von y" eine Zahl aus der Datenbank.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `topic` | text | PK |  |  |  |
| `key` | text | PK |  |  |  |
| `sort_order` | integer | ja | `0` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |

### `org_step_check`
Selbstauskunft: dieser Schritt ist erledigt. Kein Nachweis — was in Swapcard passiert, sehen wir nicht. Zeile da = erledigt, Zeile weg = offen.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `org_edition_id` | uuid | PK |  | `org_edition.id` |  |
| `topic` | text | PK |  |  |  |
| `key` | text | PK |  |  |  |
| `done_at` | timestamp with time zone | ja | `now()` |  |  |
| `done_by` | uuid |  |  | `person.id` |  |

### `org_ticket_allocation`
Ticket-Kontingent je Partner × Edition × Pass-Typ, abgeleitet aus Ticket-Produkten; Coupon/Undershop kommen aus vivenu (Route), Status pending_vivenu bis dahin.

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
| `org_edition_id` | uuid |  |  | `org_edition.id` |  |
| `status` | text | ja | `pending_vivenu` |  |  |
| `vivenu_coupon_id` | text |  |  |  |  |
| `vivenu_undershop_id` | text |  |  |  |  |
| `last_error` | text |  |  |  |  |
| `synced_at` | timestamp with time zone |  |  |  |  |
| `discount_percent` | integer | ja | `100` |  | Rabattsatz des Kontingents in Prozent (0123): 100 = kostenlos, 50 = halber Preis. Die 100er-Zeile leitet sync_ticket_allocations aus den Produkten ab; die 50er setzt das Team von Hand, und die Ableitung fasst sie nicht an. |

### `organization`
Partner, Startups, Initiativen, Hochschulen, Agenturen. HubSpot-Company über hubspot_id.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `legal_name` | text |  |  |  |  |
| `communication_name` | text |  |  |  |  |
| `logo_dark` | text |  |  |  |  |
| `logo_light` | text |  |  |  |  |
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
| `description_de` | text |  |  |  | Beschreibung des Partners (DE), gilt über Editionen hinweg; Partner aktualisieren sie jährlich, starten aber nie leer (Konrad 17.09.2026). Ersetzt organization.description und org_edition.description_de. |
| `description_en` | text |  |  |  | Beschreibung des Partners (EN), gilt über Editionen hinweg; Gegenstück zu description_de. |
| `industry` | text |  |  |  | Vokabular industry (0138): Branche des Unternehmens. Entspricht dem Swapcard-Feld „Branche" (`Exhibitor.type`); die Schluessel sind dessen Optionswerte. NULL = nicht angegeben, dann sendet der Ausstellerlauf kein `type` und Swapcard behaelt, was dort steht. |
| `address_extra` | text |  |  |  | Adresszusatz (Gebäude, Etage, c/o) — pflegt der Partner unter „Eure Daten"; steht auf der Rechnung unter der Straße (PART-059). |
| `customer_number` | text |  |  |  | Kundennummer aus HubSpot. Partner sehen sie nur; das Partner-Team pflegt sie (set_org_customer_number), bis der HubSpot-Ingest sie übernimmt (PART-059). |

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

### `partner_session_return`
Jüngster Rückgabegrund der Programmleitung je Partner-Session (PART-083). Schreibt release_partner_session (Rückgabe: Upsert, Freigabe: löschen); lesen nur Definer-Funktionen — keine Grants, damit ihn Speaker der Session nicht über session lesen.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `session_id` | uuid | PK |  | `session.id` |  |
| `note` | text | ja |  |  |  |
| `returned_at` | timestamp with time zone | ja | `now()` |  |  |
| `returned_by` | uuid |  |  | `person.id` |  |

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
| `tier` | text | ja | `lead` |  | lead = bekannt ohne Login · talent = hat sich eingeloggt (Claim). Wird per Trigger gesetzt. |
| `deleted_at` | timestamp with time zone |  |  |  | Gesetzt durch delete_my_profile(): Datensatz anonymisiert, Historie bleibt. |
| `diet` | text |  |  |  | Ernährungsform aus dem Vokabular `diet`. Grundlage der Catering-Bestellung. NULL = keine Angabe. |
| `diet_note` | text |  |  |  | Unverträglichkeiten und Allergien, Freitext, freiwillig. Kann eine Gesundheitsangabe nach Art. 9 DSGVO sein — wird nie zusammen mit dem Namen herausgegeben. |
| `salutation_de` | text |  |  |  | Fertige Briefanrede, z. B. „Sehr geehrte Frau Prof. Dr. Zehle". Redaktionell gepflegt — aus Titel und Namen lässt sie sich nicht zuverlässig bauen. |
| `salutation_en` | text |  |  |  |  |
| `photo_path` | text |  |  |  | Porträt im privaten Bucket person-photos (<person_id>/<datei>); gesetzt nur über set_my_photo (TAL-012). |
| `job_title` | text |  |  |  | Position/Jobtitel, Freitext, nur Anzeige (TAL-013 A3). Speaker-Editionen führen ihren eigenen Stand in speaker_profile.job_title. |
| `study_program_label` | text |  |  |  | Exakte Studiengangsbezeichnung, Freitext, nur Anzeige (Ebene 3, Entscheidung 08.09.). |
| `job_openness` | text |  |  |  | vocab job_openness (A6). |
| `function_area` | text |  |  |  | vocab function_area, Einfachauswahl (A7, Konrad 24.09.). |
| `graduation_year` | smallint |  |  |  | Abschlussjahr (B5). |
| `availability` | text |  |  |  | vocab availability (C2). |
| `mobility` | text |  |  |  | vocab mobility (C2). |
| `cv_path` | text |  |  |  | Lebenslauf im privaten Bucket person-cv (<person_id>/<datei>); gesetzt nur über set_my_cv (B3). |

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

### `person_language`
Sprachkenntnisse je Person mit Niveau (TAL-013 B4). Pflege durch die Person selbst.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `person_id` | uuid | PK |  | `person.id` |  |
| `language` | text | PK |  |  |  |
| `level` | text | ja |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `language_vocabulary` | text | ja | `spoken_language` |  |  |
| `level_vocabulary` | text | ja | `language_level` |  |  |

### `person_merge_log`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `surviving_person_id` | uuid | ja |  | `person.id` |  |
| `merged_person_id` | uuid | ja |  |  |  |
| `merged_at` | timestamp with time zone | ja | `now()` |  |  |
| `actor` | text |  |  |  |  |
| `payload` | jsonb |  |  |  |  |

### `portal_video`
Eingebettete Videos je Schlüssel (F9.4). Seiten binden über `key` ein, der Link ist Redaktionssache. Nur Loom — der CHECK und die CSP gehören zusammen.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `key` | text | ja |  |  |  |
| `title_de` | text |  |  |  |  |
| `title_en` | text |  |  |  |  |
| `url` | text | ja |  |  |  |
| `audience` | text[] | ja |  |  |  |
| `edition_id` | uuid |  |  | `event.id` |  |
| `sort_order` | integer | ja | `0` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

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
| `images` | jsonb | ja |  |  | Bilder aus dem Bucket product-images: [{path, url, name, type, size}] — öffentlich lesbar, Pflege über Import-Skript/Admin. |
| `source_hubspot` | boolean | ja | `false` |  |  |
| `source_shop` | boolean | ja | `false` |  |  |
| `internal_comment` | text |  |  |  |  |
| `active` | boolean | ja | `true` |  |  |
| `edition_id` | uuid |  |  | `event.id` |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `pass_type` | text |  |  |  |  |
| `grants_role` | text |  |  |  |  |
| `area_sqm` | numeric |  |  |  | Standfläche eines Pakets in Quadratmetern. Zahl, nicht Text — die Einheit setzt die Oberfläche (qm/sqm). |
| `size_note` | text |  |  |  | Maß als sprachneutrale Notiz, z. B. „6 m × 3 m". Ergänzt `area_sqm` in der Übersichtstabelle. |
| `format_key` | text |  |  |  | Vokabular partner_format: welche Seite der Gruppe „Eure Formate" dieses Produkt im Partner-Portal öffnet. NULL = keine eigene Seite (Mobiliar, Technik, Zusatzleistungen). |
| `sponsoring_level_key` | text |  |  |  | Vokabular sponsoring_level (0135): welches Sponsoring-Level dieses Produkt dem Partner gibt. NULL = vergibt kein Level (Zusatzleistungen, Bühnenformate, Tickets). Gebucht ein Partner mehrere, gilt das beste (kleinster sort_order). |

### `product_component`
Stückliste: was in einem Paket steckt (Messebau/Regie).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `bundle_sku` | text | PK |  | `product.sku` |  |
| `component_sku` | text | PK |  | `product.sku` |  |
| `qty` | numeric | ja |  |  |  |

### `profile_deletion_request`
Antraege auf Profilloeschung nach Art. 17 DSGVO (0115). Entsteht nur, wenn der Loeschung etwas entgegensteht — sonst loescht die Person selbst und sofort.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `person_id` | uuid | ja |  | `person.id` |  |
| `reason` | text |  |  |  |  |
| `blockers` | text[] | ja |  |  |  |
| `status` | text | ja | `pending` |  |  |
| `requested_at` | timestamp with time zone | ja | `now()` |  |  |
| `handled_by` | uuid |  |  | `person.id` |  |
| `handled_at` | timestamp with time zone |  |  |  |  |
| `handled_note` | text |  |  |  |  |

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
| `partner_selectable` | boolean | ja | `false` |  | Darf ein Partner diese Katalogfrage für sein Format auswählen? Vorgabe nein — der Katalog trägt auch Fragen, die nur das Team stellt. |

### `regie_cue`
Ablaufplan je Bühne und Tag (Vorlage regie-2026). `slot_id` optional — Doors open und Puffer haben keine Session.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `stage_id` | uuid | ja |  | `stage.id` |  |
| `event_day_id` | uuid | ja |  | `event_day.id` |  |
| `slot_id` | uuid |  |  | `slot.id` |  |
| `cue_start` | timestamp with time zone | ja |  |  |  |
| `cue_end` | timestamp with time zone | ja |  |  |  |
| `sort_order` | integer | ja | `0` |  |  |
| `action` | text | ja |  |  |  |
| `umbau_min` | integer |  |  |  |  |
| `moderation` | text |  |  |  |  |
| `regie` | text |  |  |  |  |
| `backstage` | text |  |  |  |  |
| `mobiliar` | text |  |  |  |  |
| `notes` | text |  |  |  |  |
| `mic_assignments` | jsonb | ja |  |  |  |
| `media` | jsonb | ja |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `created_by` | uuid |  |  | `person.id` |  |
| `updated_by` | uuid |  |  | `person.id` |  |
| `people_on_stage` | text |  |  |  | Wer auf der Bühne steht — Angabe der Stage Leads, nicht des Speakers (SPK-029). |

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
| `tech` | jsonb | ja |  |  | Technik-Ansage des Speakers je Slot (A7.2): people_on_stage, microphone, presentation_media, special_requirements, furniture — feste Schlüssel, Werte als Freitext. Die Disposition der Regie steht in regie_cue. |
| `partner_org_id` | uuid |  |  | `organization.id` | Der Partner, der dieses Format gebucht hat. Unterschied zu host_org_id: host = richtet aus (Masterclass, Company Tour, Side-Event, Interview Table — zählt in sessions_count und öffnet /partner/bewerber); partner_org_id = hat gebucht, auch beim Talk, wo die Bühne uns gehört und der Partner nur den Speaker stellt. |
| `format_details` | jsonb | ja |  |  | Formatspezifische Angaben mit festen Schlüsseln, geprüft in den Partner-RPCs (Teil 2). Nie freie Schlüssel; contact_* der Company Tour gehen nicht nach programme_public. |

### `session_asset`
Bilder, die an einem Auftritt haengen: Buehnenfoto und Slot-Grafik (0111). Die Speaker-Grafik gehoert an den Menschen und bleibt in speaker_asset.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `session_id` | uuid | ja |  | `session.id` |  |
| `kind` | text | ja |  |  |  |
| `storage_path` | text | ja |  |  |  |
| `filename` | text | ja |  |  |  |
| `mime` | text |  |  |  |  |
| `size_bytes` | bigint |  |  |  |  |
| `width` | integer |  |  |  |  |
| `height` | integer |  |  |  |  |
| `cutout` | boolean | ja | `false` |  |  |
| `credit` | text |  |  |  |  |
| `version` | integer | ja | `1` |  |  |
| `is_current` | boolean | ja | `true` |  |  |
| `uploaded_by` | uuid |  |  | `person.id` |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

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
| `requested_by` | uuid |  |  | `person.id` | Wer diese eigene Frage beantragt hat. Zusammen mit approved_at der Antragsweg: Zeile ohne approved_at = beantragt, mit = freigegeben und im Bewerbungsformular sichtbar. |
| `purpose` | text |  |  |  | Wozu die Frage dient — Pflicht bei beantragten Fragen (Teil 2 prüft es). Konrads Beispiel: Geschlecht nur für ein Frauen-Format, mit ausgewiesenem Zweck. Die Regel „keine Art.-9-Fragen" prüft das Team bei der Freigabe; eine Freitextfrage lässt sich nicht automatisch als sensibel erkennen. |

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

### `shift`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `edition_id` | uuid | ja |  | `event.id` |  |
| `event_day_id` | uuid |  |  | `event_day.id` |  |
| `area` | text | ja |  |  |  |
| `position` | text | ja |  |  |  |
| `start_at` | timestamp with time zone | ja |  |  |  |
| `end_at` | timestamp with time zone | ja |  |  |  |
| `capacity` | integer | ja | `1` |  |  |
| `overbook` | integer | ja | `0` |  |  |
| `location` | text |  |  |  |  |
| `lead_person_id` | uuid |  |  | `person.id` |  |
| `briefing_md` | text |  |  |  |  |
| `active` | boolean | ja | `true` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `shift_assignment`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `shift_id` | uuid | ja |  | `shift.id` |  |
| `person_id` | uuid | ja |  | `person.id` |  |
| `status` | text | ja | `assigned` |  |  |
| `confirmed_at` | timestamp with time zone |  |  |  |  |
| `declined_at` | timestamp with time zone |  |  |  |  |
| `decline_reason` | text |  |  |  |  |
| `reminded_at` | timestamp with time zone |  |  |  |  |
| `assigned_by` | uuid |  |  | `person.id` |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `shop_order`
Messeshop-Bestellung je Partner × Edition × Phase; MS-JJJJ-NNNN; eine aktive je Org und Phase.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `org_edition_id` | uuid | ja |  | `org_edition.id` |  |
| `order_no` | text | ja |  |  |  |
| `phase` | integer | ja |  |  |  |
| `status` | text | ja | `draft` |  |  |
| `note` | text |  |  |  |  |
| `internal_note` | text |  |  |  |  |
| `created_by` | uuid |  |  | `person.id` |  |
| `confirmed_by` | uuid |  |  | `person.id` |  |
| `confirmed_at` | timestamp with time zone |  |  |  |  |
| `completed_at` | timestamp with time zone |  |  |  |  |
| `cancelled_at` | timestamp with time zone |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `po_number` | text |  |  |  | Bestellnummer des Partners für diese Bestellung (F11.2). Vorgabe aus org_edition.po_number; je Auftrag überschreibbar. Wandert in den SevDesk-Entwurf. |

### `shop_order_line`
Bestellzeile mit Snapshot der Produktdaten zum Zeitpunkt der Bestätigung.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `order_id` | uuid | ja |  | `shop_order.id` |  |
| `product_sku` | text | ja |  | `product.sku` |  |
| `name_de` | text | ja |  |  |  |
| `name_en` | text |  |  |  |  |
| `category` | text |  |  |  |  |
| `unit` | text |  |  |  |  |
| `vat_rate` | numeric | ja | `7` |  |  |
| `price_net_cents` | integer | ja | `0` |  |  |
| `qty` | numeric | ja |  |  |  |
| `merch_config` | jsonb |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `shop_request`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `org_edition_id` | uuid | ja |  | `org_edition.id` |  |
| `product_sku` | text |  |  | `product.sku` |  |
| `text` | text | ja |  |  |  |
| `status` | text | ja | `open` |  |  |
| `answer` | text |  |  |  |  |
| `answered_by` | uuid |  |  | `person.id` |  |
| `answered_at` | timestamp with time zone |  |  |  |  |
| `created_by` | uuid |  |  | `person.id` |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `pass_type` | text |  |  |  | Nur bei Zusatzticket-Anfragen (PART-070): Tickettyp aus dem Vokabular `ticket_type`. NULL bei jeder anderen Anfrage. |
| `quantity` | integer |  |  |  | Nur bei Zusatzticket-Anfragen: wie viele zusätzlich. Zusammen mit `pass_type` gesetzt oder gar nicht (CHECK). |

### `shuttle_booking`
Shuttle-Fahrten je Speaker-Profil (A7.1). Mehrere Fahrten je Speaker, auch Zwischenfahrten. Jede Fahrt wird vom Speaker-Team freigegeben. Felder nach der Airtable-Shuttle-Tabelle 2026.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `profile_id` | uuid | ja |  | `speaker_profile.id` |  |
| `passenger_name` | text | ja |  |  | Wer befördert wird — nicht zwingend der Speaker. Steht an der Fahrt, damit der Export ohne Personentabelle auskommt. |
| `passengers` | integer | ja | `1` |  |  |
| `driver_phone` | text |  |  |  |  |
| `pickup_at` | timestamp with time zone | ja |  |  |  |
| `pickup_location` | text | ja |  |  |  |
| `pickup_address` | text |  |  |  |  |
| `dropoff_location` | text | ja |  |  |  |
| `dropoff_address` | text |  |  |  |  |
| `latest_arrival_at` | timestamp with time zone |  |  |  |  |
| `status` | text | ja | `requested` |  |  |
| `booked_by_email` | text |  |  |  | Dienstliche Adresse der anfordernden Person, von der Funktion gesetzt — keine Eingabe. |
| `note` | text |  |  |  |  |
| `over_limit_reason` | text |  |  |  | Begründung ab der sechsten nicht stornierten Fahrt (Obergrenze fünf, Konrad 17.09.). |
| `created_by` | uuid |  |  | `person.id` |  |
| `confirmed_by` | uuid |  |  | `person.id` |  |
| `confirmed_at` | timestamp with time zone |  |  |  |  |
| `cancelled_at` | timestamp with time zone |  |  |  |  |
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

### `speaker_contact`
Kontakte einer Speakerin (SPK-040, 0148): Assistenz, Agentur, Office … in einer Tabelle, mit `has_access` für den Portalzugang. Löst `speaker_profile.assistant_person_id` und die Felder `contact_*` ab; die bleiben vorerst additiv stehen.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `profile_id` | uuid | ja |  | `speaker_profile.id` |  |
| `kind` | text | ja |  |  |  |
| `person_id` | uuid |  |  | `person.id` |  |
| `first_name` | text |  |  |  |  |
| `last_name` | text |  |  |  |  |
| `email` | extensions.citext |  |  |  |  |
| `phone` | text |  |  |  |  |
| `has_access` | boolean | ja | `false` |  | Ob der Kontakt sich anmelden darf. Trägt die Rolle `speaker_assistant` der Edition; die Rechteprüfungen fragen über `is_speaker_assistant`. |
| `consent_at` | date | ja |  |  | Tag, an dem die Speakerin das Einverständnis dieser Person bestätigt hat. Pflicht — ohne sie speichern wir fremde Kontaktdaten nicht (Art. 6 DSGVO, wie 0127). |
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
| `lead_contact_id` | uuid |  |  | `edition_contact.id` |  |
| `buddy_contact_id` | uuid |  |  | `edition_contact.id` |  |
| `confirmed_at` | timestamp with time zone |  |  |  | Wann der Status zum ersten Mal auf „zugesagt" ging. Wird im Statuswechsel gesetzt, nicht von Hand. |
| `declined_at` | timestamp with time zone |  |  |  |  |
| `decline_reason` | text |  |  |  | Schlüssel aus dem Vokabular `speaker_decline_reason`. Für die Planung der nächsten Edition. |
| `contact_first_name` | text |  |  |  | Kontakt ohne Portalzugang (0127): Agentur, Office oder Management, das man anschreibt. Kein eigener Personendatensatz — die Person soll im Portal nichts tun. |
| `contact_last_name` | text |  |  |  |  |
| `contact_email` | extensions.citext |  |  |  |  |
| `contact_phone` | text |  |  |  |  |
| `contact_kind` | text |  |  |  |  |
| `contact_consent_at` | date |  |  |  | Bestätigung der Speakerin, dass dieser Kontakt der Weitergabe zugestimmt hat. Pflicht, sobald ein Kontaktfeld gefüllt ist. Selbstauskunft, kein Nachweis — das Setzen steht im Audit-Log. |
| `created_by_org_id` | uuid |  |  | `organization.id` | Der Partner, der diesen Speaker über /partner/talk eingetragen hat. Ohne dieses Feld wäre bei einem Speaker mit zwei Sessions nicht entscheidbar, welcher Partner ihn pflegen darf. |
| `partner_editable_until_login` | boolean | ja | `false` |  | Solange wahr, darf der eintragende Partner die Stammdaten pflegen — gedacht für den Fall, dass der Speaker (z. B. ein CEO) es nicht selbst tut. Fällt beim ersten Login des Speakers; danach nur noch lesen. |
| `expense_mode` | text | ja | `receipts` |  | Wie Reisekosten abgerechnet werden: receipts oder lump_sum (Vokabular expense_mode, SPK-042). |
| `expense_lump_sum_cents` | integer |  |  |  | Pauschalbetrag in Cent. Pflicht bei lump_sum, sonst leer. |

### `speaker_reception`
Speaker Reception je Edition (A7.4): Zeit, Ort, Beschreibung, Obergrenze. Anmeldung in speaker_reception_rsvp. Sichtbar nur für Speaker mit reception_eligible.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `edition_id` | uuid | ja |  | `event.id` |  |
| `title_de` | text | ja |  |  |  |
| `title_en` | text | ja |  |  |  |
| `description_de` | text |  |  |  |  |
| `description_en` | text |  |  |  |  |
| `location` | text | ja |  |  |  |
| `address` | text |  |  |  |  |
| `starts_at` | timestamp with time zone | ja |  |  |  |
| `ends_at` | timestamp with time zone |  |  |  |  |
| `capacity` | integer |  |  |  | Obergrenze in **Plätzen**, nicht Zusagen — eine Begleitung belegt einen zweiten. NULL = unbegrenzt. |
| `rsvp_deadline` | timestamp with time zone |  |  |  |  |
| `published` | boolean | ja | `false` |  |  |
| `created_by` | uuid |  |  | `person.id` |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `speaker_reception_rsvp`
Zu- und Absagen zur Reception. Eine Zeile je Profil; eine Absage bleibt stehen, damit das Team den Unterschied zwischen „abgesagt" und „nie geantwortet" sieht.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `reception_id` | uuid | PK |  | `speaker_reception.id` |  |
| `profile_id` | uuid | PK |  | `speaker_profile.id` |  |
| `status` | text | ja | `yes` |  |  |
| `guests` | integer | ja | `0` |  |  |
| `note` | text |  |  |  |  |
| `responded_at` | timestamp with time zone | ja | `now()` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `speaker_task`
Aufgaben, die der Speaker selbst abhakt (SPK-024, 0149) — je Edition, im Admin gepflegt. Nur für Erledigungen, die das Portal nicht selbst beobachten kann; Abgeleitetes bleibt in `next_steps`.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `edition_id` | uuid | ja |  | `event.id` |  |
| `key` | text | ja |  |  |  |
| `label_de` | text | ja |  |  |  |
| `label_en` | text | ja |  |  |  |
| `description_de` | text |  |  |  |  |
| `description_en` | text |  |  |  |  |
| `deadline_key` | text |  |  |  | Verweist auf `deadline.key` derselben Edition, ohne Fremdschlüssel: die Aufgabe darf vor der Frist da sein und soll nicht mit ihr verschwinden. |
| `sort_order` | integer | ja | `0` |  |  |
| `is_active` | boolean | ja | `true` |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |

### `speaker_task_tick`
Ein Haken je Speaker und Aufgabe (0149). Der Haken ist eine Aussage der Speakerin, kein beobachteter Zustand — deshalb steht dabei, wer ihn wann gesetzt hat.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `profile_id` | uuid | PK |  | `speaker_profile.id` |  |
| `task_id` | uuid | PK |  | `speaker_task.id` |  |
| `done_at` | timestamp with time zone | ja | `now()` |  |  |
| `done_by` | uuid | ja |  | `person.id` |  |

### `speaker_travel`
An- und Abreise je Speaker-Profil (Abgleich 15.09.). Datum und Uhrzeit getrennt: die Eingabe meint Ortszeit in Hamburg, kein `timestamptz`.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `profile_id` | uuid | PK |  | `speaker_profile.id` |  |
| `arrival_date` | date |  |  |  |  |
| `arrival_time` | time without time zone |  |  |  |  |
| `arrival_mode` | text |  |  |  |  |
| `arrival_ref` | text |  |  |  |  |
| `departure_date` | date |  |  |  |  |
| `departure_time` | time without time zone |  |  |  |  |
| `departure_mode` | text |  |  |  |  |
| `departure_ref` | text |  |  |  |  |
| `needs_pickup` | boolean | ja | `false` |  | Wunsch nach Abholung. Die Buchung selbst läuft weiter über das Shuttle-Kontingent in `hospitality_booking`. |
| `note` | text |  |  |  |  |
| `updated_by` | uuid |  |  | `person.id` |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `needs_dropoff` | boolean | ja | `false` |  | Wunsch, zur Abreise gebracht zu werden. Die Fahrt selbst läuft über shuttle_booking (SPK-032). |

### `stage`
Bühne oder Raum eines Events. Parameter (Wechselzeit, Standarddauer, Kontingent) steuern das Programm-Board.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `event_id` | uuid | ja |  | `event.id` |  |
| `name` | text | ja |  |  |  |
| `slug` | text |  |  |  |  |
| `type` | text | ja | `side` |  | main/side/room = Bühnen und Räume des Programms · partner_booth = Standbühne eines Partners (gibt Bearbeitungsrechte) · interview_table = Tisch eines Partners für Interview Tables · side_event_venue = Träger für Side-Event-Slots, der wirkliche Ort steht in session.format_details.location_text. |
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

### `stock_ledger`
Lagerbuch, nur anhängen: Reservierung (negativ) und Freigabe (positiv) je Bestellung; Team-Korrekturen ohne Bestellung.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | bigint | PK |  |  |  |
| `product_sku` | text | ja |  | `product.sku` |  |
| `order_id` | uuid |  |  | `shop_order.id` |  |
| `delta` | integer | ja |  |  |  |
| `comment` | text |  |  |  |  |
| `created_by` | uuid |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |

### `storage_purge_queue`
Dateipfade, die nach einer Profilloeschung aus dem Bucket muessen (0115). SQL kann Storage nicht loeschen; der Cron raeumt mit service_role und loescht die Zeile.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `bucket` | text | ja |  |  |  |
| `path` | text | ja |  |  |  |
| `reason` | text | ja | `profile_deleted` |  |  |
| `requested_at` | timestamp with time zone | ja | `now()` |  |  |
| `attempts` | integer | ja | `0` |  |  |
| `error` | text |  |  |  |  |

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
| `meta` | jsonb |  |  |  |  |
| `extra_fields` | jsonb |  |  |  |  |
| `vivenu_discount_id` | text |  |  |  | Eingelöster Coupon (appliedDiscountInfo[].discountId), Grundlage für org_ticket_allocation.used_count. |
| `vivenu_updated_at` | timestamp with time zone |  |  |  | Stand des Tickets bei vivenu (updatedAt). Ältere Webhooks werden dagegen verworfen. |
| `vivenu_ticket_type_id` | text |  |  |  | Tickettyp bei vivenu. Grundlage für den Nachtrag des Pass-Typs, wenn ticket_type_map später gefüllt wird. |
| `vivenu_undershop_id` | text |  |  |  | Undershop, aus dem das Ticket kam (vivenu `underShopId`) — Schlüssel auf das Partner-Kontingent. |

### `ticket_secret`
vivenu-Ticket-Secrets für die Personalisierung. Keine Grants, keine Policy — nur service_role.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `ticket_id` | uuid | PK |  | `ticket.id` |  |
| `secret` | text | ja |  |  |  |
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

### `vocab_binding`
Wo ein Vokabular tatsaechlich benutzt wird (0130). Grundlage der Loeschsperre: ohne Eintrag wird ein Begriff nicht geloescht, weil niemand sagen kann, ob er in Gebrauch ist.

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `vocabulary` | text | PK |  |  |  |
| `table_name` | text | PK |  |  |  |
| `column_name` | text | PK |  |  |  |
| `is_array` | boolean | ja | `false` |  |  |
| `vocabulary_column` | text |  |  |  |  |
| `note` | text |  |  |  |  |

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

### `volunteer_coupon_revocation`
Widerrufene Volunteer-Coupons, die bei vivenu noch zu deaktivieren sind (`deactivated_at` leer).

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | bigint | PK |  |  |  |
| `profile_id` | uuid | ja |  | `volunteer_profile.id` |  |
| `vivenu_coupon_id` | text | ja |  |  |  |
| `coupon_code` | text |  |  |  |  |
| `revoked_at` | timestamp with time zone | ja | `now()` |  |  |
| `deactivated_at` | timestamp with time zone |  |  |  |  |
| `error` | text |  |  |  |  |

### `volunteer_profile`

| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |
|---|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` |  |  |
| `person_id` | uuid | ja |  | `person.id` |  |
| `edition_id` | uuid | ja |  | `event.id` |  |
| `status` | text | ja | `applied` |  |  |
| `shirt_size` | text |  |  |  |  |
| `areas` | text[] | ja |  |  |  |
| `day_prefs` | uuid[] | ja |  |  |  |
| `availability` | jsonb |  |  |  |  |
| `buddy_person_id` | uuid |  |  | `person.id` |  |
| `buddy_note` | text |  |  |  |  |
| `notes_internal` | text |  |  |  |  |
| `applied_at` | timestamp with time zone | ja | `now()` |  |  |
| `decided_at` | timestamp with time zone |  |  |  |  |
| `decided_by` | uuid |  |  | `person.id` |  |
| `decision_note` | text |  |  |  |  |
| `created_at` | timestamp with time zone | ja | `now()` |  |  |
| `updated_at` | timestamp with time zone | ja | `now()` |  |  |
| `coupon_code` | text |  |  |  |  |
| `vivenu_coupon_id` | text |  |  |  |  |
| `coupon_status` | text | ja | `none` |  | none → pending (wartet auf vivenu) → issued (Code da) → redeemed (Ticket gezogen). `revoked`, wenn die Zusage zurückgenommen wurde. |
| `coupon_issued_at` | timestamp with time zone |  |  |  |  |
| `redeemed_at` | timestamp with time zone |  |  |  |  |
| `ticket_id` | uuid |  |  | `ticket.id` |  |
| `coupon_error` | text |  |  |  |  |
| `reminded_at` | timestamp with time zone |  |  |  |  |

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
| `admin_section_overrides` | args: ? |
| `ai_take_slot` | p_kind: text, p_limit: integer |
| `anonymize_person` | p_person_id: uuid |
| `applications_for_session` | p_session_id: uuid |
| `applications_overview` | p_event_id: uuid |
| `apply_hackathon` | p_data: jsonb |
| `apply_to_session` | p_answers: jsonb, p_consent_share: boolean, p_session_id: uuid |
| `apply_volunteer` | p_data: jsonb |
| `approve_expense` | p_claim_id: uuid, p_note: text |
| `approve_session_content` | p_overrides: jsonb, p_submission_id: uuid |
| `approve_session_questions` | p_session_id: uuid |
| `approve_travel_costs` | p_approved: boolean, p_profile_id: uuid |
| `assign_challenges` | p_edition_id: uuid |
| `assign_org_products` | p_items: jsonb, p_org_edition_id: uuid |
| `assign_role` | p_edition_id: uuid, p_note: text, p_person_id: uuid, p_portal: text, p_role: text, p_scope_id: uuid, p_scope_type: text, p_valid_from: timestamp with time zone, p_valid_to: timestamp with time zone |
| `assign_shift` | p_person_id: uuid, p_shift_id: uuid, p_status: text |
| `attach_session_to_slot` | p_session_id: uuid, p_slot_id: uuid |
| `backfill_ticket_pass_types` | args: ? |
| `board_like_pattern` | p_query: text |
| `board_search_partners` | p_event_id: uuid, p_limit: integer, p_query: text |
| `board_search_people` | p_event_id: uuid, p_limit: integer, p_query: text |
| `board_session_refs` | p_session_id: uuid |
| `book_hospitality` | p_details: jsonb, p_guests: integer, p_quota_id: uuid |
| `booth_checklist` | p_edition_id: uuid, p_org_id: uuid |
| `booth_day_plan` | p_edition_id: uuid |
| `booth_packages` | args: ? |
| `booths_free` | p_edition_id: uuid |
| `can_decide_session` | p_session_id: uuid |
| `can_edit_edition_contacts` | args: ? |
| `can_edit_edition_info` | args: ? |
| `can_edit_kb` | p_audience: text[] |
| `can_edit_kb_all` | p_audience: text[] |
| `can_edit_next_up` | args: ? |
| `can_edit_regie` | p_stage_id: uuid |
| `can_edit_session` | p_session_id: uuid |
| `can_edit_slot` | p_slot_id: uuid |
| `can_edit_stage` | p_stage_id: uuid |
| `can_judge_hack_team` | p_team_id: uuid |
| `can_manage_speaker` | p_profile_id: uuid |
| `can_manage_speaker_leads` | args: ? |
| `can_read_checkin_stats` | p_edition_id: uuid |
| `can_request_shuttle` | p_profile_id: uuid |
| `can_search_board` | p_event_id: uuid |
| `can_view_community_events` | args: ? |
| `cancel_companion_ticket` | p_ticket_id: uuid |
| `cancel_hospitality` | p_booking_id: uuid |
| `cancel_registration` | p_session_id: uuid |
| `cancel_shuttle` | p_booking_id: uuid |
| `catering_coverage` | p_edition_id: uuid |
| `catering_notes` | p_edition_id: uuid |
| `catering_people` | p_edition_id: uuid |
| `catering_summary` | p_edition_id: uuid |
| `check_edition_contact` | p_contact: uuid, p_edition: uuid, p_type: text |
| `check_format_details` | p_details: jsonb, p_format: text, p_org_id: uuid |
| `check_travel_mode` | p_mode: text |
| `checkin_edition` | args: ? |
| `checkin_scan` | p_barcode: text, p_device: text |
| `checkin_stats` | p_day: date, p_edition_id: uuid |
| `claim_or_create_person` | args: ? |
| `community_event_guests_admin` | p_event_id: uuid |
| `community_events_admin` | args: ? |
| `company_tours_admin` | p_edition_id: uuid |
| `confirm_application` | p_application_id: uuid, p_replace_conflicting: boolean |
| `confirm_companion_ticket` | p_note: text, p_ticket_id: uuid |
| `confirm_hospitality` | p_booking_id: uuid, p_note: text |
| `confirm_shift` | p_assignment_id: uuid |
| `confirm_shuttle` | p_booking_id: uuid |
| `create_hack_team` | p_edition_id: uuid, p_name: text |
| `create_slot` | p_end: timestamp with time zone, p_session_id: uuid, p_slot_type: text, p_source_ref: text, p_stage_id: uuid, p_start: timestamp with time zone |
| `current_org_edition` | p_edition_id: uuid, p_org_id: uuid |
| `current_person_id` | args: ? |
| `day_of_edition` | p_day_id: uuid, p_edition_id: uuid |
| `decide_application` | p_application_id: uuid, p_rank: integer, p_status: text |
| `decisions_released` | p_session_id: uuid |
| `decline_companion_ticket` | p_note: text, p_ticket_id: uuid |
| `decline_hospitality` | p_booking_id: uuid, p_note: text |
| `decline_shift` | p_assignment_id: uuid, p_reason: text |
| `delete_admin_section_override` | p_id: uuid |
| `delete_edition_contact` | p_id: uuid, p_reason: text |
| `delete_edition_file` | p_id: uuid |
| `delete_edition_info` | p_id: uuid |
| `delete_event_day` | p_id: uuid |
| `delete_kb_article` | p_id: uuid |
| `delete_my_profile` | args: ? |
| `delete_next_up_item` | p_id: uuid |
| `delete_portal_video` | p_id: uuid |
| `delete_reception` | p_id: uuid |
| `delete_regie_cue` | p_id: uuid |
| `delete_session_asset` | p_id: uuid |
| `delete_speaker_asset` | p_id: uuid |
| `delete_speaker_task` | p_task_id: uuid |
| `delete_stage` | p_id: uuid |
| `delete_track` | p_id: uuid |
| `delete_vocab_term` | p_key: text, p_vocabulary: text |
| `deletion_requests_admin` | p_status: text |
| `deliverable_due` | p_oe: public.org_edition, p_template: public.deliverable_template |
| `detach_session` | p_session_id: uuid |
| `edition_contacts_admin` | p_edition_id: uuid |
| `edition_files` | p_audience: text, p_edition_id: uuid |
| `edition_files_admin` | p_edition_id: uuid |
| `edition_infos` | p_audience: text, p_edition_id: uuid |
| `edition_infos_admin` | p_edition_id: uuid |
| `edition_valid_to` | p_edition_id: uuid |
| `effective_pass_type` | p_org_edition_id: uuid, p_product_pass_type: text |
| `email_hash` | p_email: text |
| `ensure_speaker_ticket` | p_profile_id: uuid |
| `event_app_exhibitors` | p_edition_id: uuid |
| `event_app_speakers` | p_edition_id: uuid |
| `exhibitor_list` | p_edition_id: uuid |
| `expense_bank_details` | p_claim_id: uuid |
| `expense_eligibility` | p_profile_id: uuid |
| `expense_queue` | p_edition_id: uuid |
| `expire_overdue_applications` | args: ? |
| `export_privacy_notice` | p_language: text |
| `export_session_applications` | p_session_id: uuid |
| `finish_sync_job` | p_error: text, p_id: bigint, p_stats: jsonb, p_status: text |
| `finish_webhook_event` | p_error: text, p_id: bigint, p_related_id: uuid, p_related_type: text, p_status: text |
| `fmt_cents` | p_cents: integer, p_locale: text |
| `format_detail_keys` | p_format: text |
| `hack_admin_overview` | p_edition_id: uuid, p_language: text |
| `hack_challenges` | p_edition_id: uuid, p_language: text |
| `hack_edition` | p_edition_id: uuid |
| `hack_join_code` | args: ? |
| `hack_judging` | p_edition_id: uuid, p_language: text |
| `hack_text` | p_de: text, p_en: text, p_language: text |
| `handover_speaker` | p_profile_id: uuid, p_to_person_id: uuid |
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
| `ingest_vivenu_ticket` | p_data: jsonb |
| `initiatives_admin` | p_edition_id: uuid |
| `invite_assistant` | p_email: text, p_first_name: text, p_last_name: text, p_profile_id: uuid |
| `invite_speaker` | p_profile_id: uuid |
| `is_admin` | args: ? |
| `is_application_team` | p_session_id: uuid |
| `is_expense_approver` | args: ? |
| `is_hack_judge` | args: ? |
| `is_hack_team` | args: ? |
| `is_kiosk_only` | args: ? |
| `is_marketing_team` | args: ? |
| `is_member_of_org` | p_org_id: uuid |
| `is_partner_of` | p_org_id: uuid |
| `is_partner_team` | args: ? |
| `is_production_team` | args: ? |
| `is_programme_board_user` | args: ? |
| `is_programme_editor` | p_event_id: uuid |
| `is_programme_reader` | args: ? |
| `is_session_visible` | p_session_id: uuid |
| `is_speaker_assistant` | p_person_id: uuid, p_profile_id: uuid |
| `is_speaker_manager` | p_person_id: uuid |
| `is_speaker_of` | p_session_id: uuid |
| `is_speaker_side_of` | p_session_id: uuid |
| `is_speaker_team` | p_edition_id: uuid |
| `is_staff` | args: ? |
| `is_standbuehne_editor_of` | p_org_id: uuid |
| `is_suppressed` | p_email: text |
| `is_u35` | p_birthdate: date, p_ref: date |
| `is_vocab_key` | p_key: text, p_vocabulary: text |
| `is_volunteer_team` | args: ? |
| `join_hack_team` | p_code: text, p_edition_id: uuid |
| `kb_article_by_slug` | p_audience: text, p_edition_id: uuid, p_language: text, p_slug: text |
| `kb_articles` | p_audience: text, p_edition_id: uuid, p_language: text, p_role: text |
| `kb_articles_admin` | p_audience: text |
| `kb_log_question` | p_article_ids: uuid[], p_audience: text, p_duration_ms: integer, p_hit: boolean, p_language: text, p_question: text |
| `kb_question_report` | p_days: integer |
| `kb_rebuild_chunks` | p_article_id: uuid |
| `kb_search` | p_audience: text, p_edition_id: uuid, p_language: text, p_limit: integer, p_query: text |
| `kb_take_question_slot` | p_limit: integer |
| `kb_ts_config` | p_language: text |
| `leave_hack_team` | p_edition_id: uuid |
| `list_external_refs` | p_object_type: text, p_system: text |
| `log_audit` | p_action: text, p_after: jsonb, p_before: jsonb, p_object_id: text, p_object_type: text |
| `luma_sync_event` | p_data: jsonb |
| `luma_sync_registration` | p_checked_in: boolean, p_email: text, p_guest_id: text, p_luma_event_id: text, p_registered_at: timestamp with time zone, p_status: text |
| `mail_cc_recipients` | p_person_ids: uuid[] |
| `mail_fmt_ts` | p_locale: text, p_ts: timestamp with time zone, p_tz: text |
| `mail_log_admin` | p_from: timestamp with time zone, p_limit: integer, p_offset: integer, p_person_id: uuid, p_query: text, p_status: text, p_template: text, p_to: timestamp with time zone |
| `mail_log_detail` | p_id: bigint |
| `mail_log_stats` | p_days: integer |
| `mail_template_history` | p_key: text, p_limit: integer, p_locale: text |
| `mail_templates_admin` | args: ? |
| `manager_shuttle_bookings` | p_edition_id: uuid |
| `manager_speakers` | p_edition_id: uuid |
| `mark_expense_paid` | p_claim_id: uuid, p_payment_ref: text |
| `mark_overdue_deliverables` | args: ? |
| `mark_volunteer_coupon_revoked` | p_error: text, p_id: bigint |
| `merch_fields` | p_config: jsonb |
| `merch_problem` | p_qty: numeric, p_schema: jsonb, p_values: jsonb |
| `move_slot` | p_confirm: boolean, p_end: timestamp with time zone, p_slot_id: uuid, p_stage_id: uuid, p_start: timestamp with time zone |
| `my_admin_section_overrides` | args: ? |
| `my_applications` | args: ? |
| `my_community_registrations` | args: ? |
| `my_contacts` | p_edition_id: uuid |
| `my_deletion_blockers` | args: ? |
| `my_deletion_status` | args: ? |
| `my_deliverables` | p_edition_id: uuid, p_org_id: uuid |
| `my_diet` | args: ? |
| `my_expense_claims` | args: ? |
| `my_hack` | p_edition_id: uuid, p_language: text |
| `my_hack_team_id` | p_edition_id: uuid |
| `my_hospitality` | p_edition_id: uuid |
| `my_kb_audiences` | args: ? |
| `my_lead_shifts` | p_edition_id: uuid |
| `my_manager_scope` | args: ? |
| `my_org_steps` | p_edition_id: uuid, p_org_id: uuid, p_topic: text |
| `my_partner_assets` | p_edition_id: uuid, p_org_id: uuid |
| `my_partner_documents` | p_edition_id: uuid, p_org_id: uuid |
| `my_partner_orgs` | args: ? |
| `my_partner_stages` | args: ? |
| `my_receptions` | p_edition_id: uuid |
| `my_regie_stages` | p_edition_id: uuid |
| `my_roles` | args: ? |
| `my_session_photos` | args: ? |
| `my_session_slides` | args: ? |
| `my_sessions` | args: ? |
| `my_shifts` | p_edition_id: uuid |
| `my_shuttle_bookings` | args: ? |
| `my_speaker_assets` | p_profile_id: uuid |
| `my_speaker_contacts` | p_profile_id: uuid |
| `my_speaker_profile` | p_edition_id: uuid |
| `my_speaker_profile_id` | p_edition_id: uuid |
| `my_speaker_tasks` | p_profile_id: uuid |
| `my_speaker_tickets` | p_edition_id: uuid |
| `my_speaker_travel` | p_edition_id: uuid |
| `my_ticket_allocations` | p_edition_id: uuid, p_org_id: uuid |
| `my_ticket_requests` | p_edition_id: uuid, p_org_id: uuid |
| `my_ticket_wallet_link` | p_ticket_id: uuid |
| `my_tickets` | args: ? |
| `my_volunteer_profile` | p_edition_id: uuid |
| `next_up_items` | args: ? |
| `next_up_items_admin` | args: ? |
| `notify_partner_leads` | p_related_id: uuid, p_related_type: text, p_template_key: text, p_vars: jsonb |
| `notify_speaker_leads` | p_related_id: uuid, p_related_type: text, p_template_key: text, p_vars: jsonb |
| `order_lunch_package` | p_edition_id: uuid, p_org_id: uuid, p_qty: integer |
| `org_editions_picker` | p_edition_id: uuid |
| `org_has_booth` | p_org_edition_id: uuid |
| `org_steps_progress` | p_edition_id: uuid, p_topic: text |
| `partner_add_speaker` | p_email: text, p_first_name: text, p_last_name: text, p_session_id: uuid |
| `partner_admin_overview` | p_edition_id: uuid |
| `partner_applications` | p_session_id: uuid |
| `partner_asset_path_allowed` | p_name: text, p_write: boolean |
| `partner_booth_window` | p_event_day_id: uuid, p_stage_id: uuid |
| `partner_can_edit` | p_org_id: uuid |
| `partner_can_manage_contacts` | p_org_id: uuid |
| `partner_company_tour` | p_edition_id: uuid, p_org_id: uuid |
| `partner_contact_upsert_internal` | p_actor: uuid, p_edition_id: uuid, p_email: text, p_first_name: text, p_last_name: text, p_org_id: uuid, p_position: text, p_roles: text[], p_source: text |
| `partner_contacts` | p_org_id: uuid |
| `partner_create_session` | p_capacity: integer, p_day_id: uuid, p_details: jsonb, p_edition_id: uuid, p_end: timestamp with time zone, p_format: text, p_org_id: uuid, p_stage_id: uuid, p_start: timestamp with time zone, p_title_de: text |
| `partner_deals` | p_org_id: uuid |
| `partner_delete_session` | p_session_id: uuid |
| `partner_digest_items` | p_org_edition_id: uuid |
| `partner_entitlement` | p_format: text, p_org_edition_id: uuid |
| `partner_format_sessions` | p_edition_id: uuid, p_format: text, p_org_id: uuid |
| `partner_ingest_log` | p_limit: integer |
| `partner_mail_cc` | p_mail_id: bigint, p_org_id: uuid |
| `partner_onboarding_recheck` | p_org_edition_id: uuid |
| `partner_overview` | p_edition_id: uuid, p_org_id: uuid |
| `partner_request_publish` | p_session_id: uuid |
| `partner_request_question` | p_label_de: text, p_label_en: text, p_options: jsonb, p_purpose: text, p_session_id: uuid, p_type: text |
| `partner_review_queue` | p_edition_id: uuid |
| `partner_roles` | p_org_id: uuid |
| `partner_sessions` | p_org_id: uuid |
| `partner_sessions_pending` | p_edition_id: uuid |
| `partner_set_onboarding_status` | p_edition_id: uuid, p_org_id: uuid, p_status: text |
| `partner_set_session_questions` | p_question_ids: uuid[], p_session_id: uuid |
| `partner_speakers` | p_edition_id: uuid, p_org_id: uuid |
| `partner_update_session` | p_fields: jsonb, p_session_id: uuid |
| `partner_update_speaker` | p_fields: jsonb, p_profile_id: uuid |
| `partner_update_tour_stop` | p_fields: jsonb, p_stop_id: uuid |
| `partner_window_binds` | p_stage_id: uuid |
| `partner_withdraw_publish` | p_session_id: uuid |
| `pending_submissions` | p_event_id: uuid |
| `person_cv_path_allowed` | p_name: text, p_write: boolean |
| `person_photo_path_allowed` | p_name: text, p_write: boolean |
| `personalize_ticket` | p_company: text, p_first_name: text, p_for_me: boolean, p_holder_email: text, p_last_name: text, p_position: text, p_ticket_id: uuid |
| `portal_video_for` | p_audience: text, p_edition_id: uuid, p_key: text |
| `portal_videos_admin` | args: ? |
| `presentation_window` | p_session_id: uuid |
| `products_for_sync` | p_system: text |
| `programme_format_details` | args: ? |
| `programme_skeleton` | p_event_id: uuid |
| `promote_shift_waitlist` | p_shift_id: uuid |
| `promote_waitlist` | p_count: integer, p_session_id: uuid |
| `publish_hack_challenge` | p_deliverable_id: uuid |
| `publish_kb_article` | p_id: uuid, p_published: boolean |
| `publish_session` | p_session_id: uuid |
| `purge_ai_rate_limit` | args: ? |
| `purge_checkins` | args: ? |
| `purge_diet_data` | p_days: integer |
| `purge_kb_questions` | p_days: integer |
| `queue_mail` | p_person_id: uuid, p_related_id: uuid, p_related_type: text, p_template_key: text, p_vars: jsonb |
| `reception_guests` | p_reception_id: uuid |
| `reception_taken` | p_reception_id: uuid |
| `receptions_admin` | p_edition_id: uuid |
| `record_shop_invoice` | p_meta: jsonb, p_order_ids: uuid[], p_org_id: uuid, p_sevdesk_contact_id: text, p_sevdesk_invoice_id: text |
| `record_sync_error` | p_job_id: bigint, p_message: text, p_object_id: text, p_object_type: text, p_payload: jsonb |
| `record_webhook_event` | p_event_type: text, p_external_id: text, p_headers: jsonb, p_payload: jsonb, p_signature_valid: boolean, p_source: text |
| `recount_allocation_usage` | p_allocation_id: uuid |
| `refresh_deliverable_due` | args: ? |
| `regie_open_slots` | p_event_day_id: uuid, p_stage_id: uuid |
| `regie_view` | p_event_day_id: uuid, p_stage_id: uuid |
| `register_for_session` | p_session_id: uuid |
| `register_partner_asset` | p_deliverable_id: uuid, p_edition_id: uuid, p_filename: text, p_kind: text, p_mime: text, p_org_id: uuid, p_size_bytes: bigint, p_storage_path: text |
| `register_session_asset` | p_data: jsonb |
| `register_sevdesk_document` | p_filename: text, p_kind: text, p_org_edition_id: uuid, p_size_bytes: bigint, p_storage_path: text |
| `register_speaker_asset` | p_filename: text, p_kind: text, p_mime: text, p_profile_id: uuid, p_session_id: uuid, p_size_bytes: bigint, p_storage_path: text |
| `reject_expense` | p_claim_id: uuid, p_note: text |
| `reject_session_content` | p_note: text, p_submission_id: uuid |
| `release_decisions` | p_note: text, p_session_id: uuid |
| `release_partner_session` | p_approved: boolean, p_note: text, p_session_id: uuid |
| `remind_volunteer_tickets` | args: ? |
| `remove_assistant` | p_profile_id: uuid |
| `remove_booth_assignment` | p_id: uuid |
| `remove_partner_contact` | p_org_id: uuid, p_person_id: uuid |
| `remove_speaker_contact` | p_contact_id: uuid |
| `request_companion_ticket` | p_email: text, p_first_name: text, p_last_name: text, p_profile_id: uuid |
| `request_profile_deletion` | p_reason: text |
| `request_shuttle` | p_data: jsonb, p_profile_id: uuid |
| `request_ticket_increase` | p_additional: integer, p_edition_id: uuid, p_org_id: uuid, p_pass_type: text, p_text: text |
| `requeue_mail` | p_log_id: bigint |
| `resolve_deletion_request` | p_action: text, p_id: uuid, p_note: text |
| `resolve_sync_error` | p_id: bigint |
| `restore_mail_template` | p_body_md: text, p_key: text, p_locale: text, p_subject: text |
| `resync_deliverables` | p_edition_id: uuid |
| `review_deliverable` | p_accepted: boolean, p_deliverable_id: uuid, p_note: text |
| `revoke_role` | p_assignment_id: uuid, p_note: text |
| `roles_of_person` | p_person_id: uuid |
| `run_application_housekeeping` | args: ? |
| `run_partner_housekeeping` | args: ? |
| `run_shop_finalization` | args: ? |
| `run_volunteer_housekeeping` | args: ? |
| `search_organizations` | p_limit: integer, p_query: text |
| `search_people` | p_limit: integer, p_query: text |
| `send_partner_reminders` | args: ? |
| `send_presentation_reminders` | args: ? |
| `send_shift_reminders` | args: ? |
| `session_asset_path_allowed` | p_name: text, p_write: boolean |
| `session_assets_admin` | p_event_id: uuid |
| `session_context` | args: ? |
| `session_mail_vars` | p_locale: text, p_session_id: uuid |
| `session_needs_release` | p_edition_id: uuid |
| `session_speakers_public` | p_session_id: uuid |
| `session_tech_keys` | args: ? |
| `sessions_for_assets` | p_event_id: uuid |
| `set_admin_section_override` | p_allowed: boolean, p_note: text, p_person_id: uuid, p_role: text, p_section: text |
| `set_booth_assignment` | p_booth_id: uuid, p_event_day_id: uuid, p_note: text, p_org_edition_id: uuid |
| `set_booth_service_check` | p_checked: boolean, p_note: text, p_org_edition_id: uuid, p_product_sku: text |
| `set_contact_roles` | p_org_id: uuid, p_person_id: uuid, p_roles: text[] |
| `set_diet` | p_diet: text, p_note: text |
| `set_edition_file` | p_data: jsonb |
| `set_edition_hubspot` | p_done_stage_id: text, p_edition_id: uuid, p_pipeline_id: text, p_stage_id: text |
| `set_edition_swapcard` | p_edition_id: uuid, p_swapcard_event_id: text |
| `set_edition_vivenu` | p_edition_id: uuid, p_vivenu_event_id: text |
| `set_edition_volunteer_undershop` | p_edition_id: uuid, p_undershop_id: text |
| `set_event_app_person_ref` | p_external_id: text, p_meta: jsonb, p_person_id: uuid, p_system: text |
| `set_event_app_ref` | p_external_id: text, p_meta: jsonb, p_object_type: text, p_org_edition_id: uuid, p_system: text |
| `set_expense_bank_details` | p_bic: text, p_claim_id: uuid, p_holder: text, p_iban: text |
| `set_expense_integration` | p_claim_id: uuid, p_invoice_asset_id: uuid, p_qonto_sent: boolean, p_sevdesk_ref: text |
| `set_expense_mode` | p_amount_cents: integer, p_mode: text, p_profile_id: uuid |
| `set_external_ref` | p_external_id: text, p_meta: jsonb, p_object_id: uuid, p_object_type: text, p_system: text |
| `set_hack_application_status` | p_id: uuid, p_note: text, p_status: text |
| `set_hack_score` | p_criteria: jsonb, p_note: text, p_team_id: uuid |
| `set_initiative_stage` | p_org_edition_id: uuid, p_stage: text |
| `set_logo_whitening_consent` | p_edition_id: uuid, p_granted: boolean, p_org_id: uuid |
| `set_my_cv` | p_path: text |
| `set_my_photo` | p_path: text |
| `set_my_speaker_travel` | p_data: jsonb, p_edition_id: uuid |
| `set_org_contacts` | p_buddy: uuid, p_lead: uuid, p_org_edition_id: uuid |
| `set_org_customer_number` | p_customer_number: text, p_org_id: uuid |
| `set_org_sevdesk_contact` | p_contact_id: text, p_org_id: uuid |
| `set_org_step` | p_done: boolean, p_edition_id: uuid, p_key: text, p_org_id: uuid, p_topic: text |
| `set_pass_type_choice` | p_choice: text, p_edition_id: uuid, p_org_id: uuid |
| `set_person_salutation` | p_de: text, p_en: text, p_person_id: uuid |
| `set_primary_email` | p_email_id: uuid |
| `set_product_external_ref` | p_external_id: text, p_sku: text, p_system: text |
| `set_reception_rsvp` | p_guests: integer, p_note: text, p_reception_id: uuid, p_status: text |
| `set_session_asset` | p_data: jsonb, p_id: uuid |
| `set_session_partner` | p_org_id: uuid, p_session_id: uuid |
| `set_session_questions` | p_questions: jsonb, p_replace_custom: boolean, p_session_id: uuid |
| `set_session_speakers` | p_session_id: uuid, p_speakers: jsonb |
| `set_slides_release` | p_asset_id: uuid, p_release: boolean |
| `set_slot_status` | p_slot_id: uuid, p_status: text |
| `set_speaker_contacts` | p_buddy: uuid, p_lead: uuid, p_profile_id: uuid |
| `set_speaker_pipeline` | p_profile_id: uuid, p_reason: text, p_status: text |
| `set_speaker_task_tick` | p_done: boolean, p_profile_id: uuid, p_task_id: uuid |
| `set_team_challenge` | p_challenge_id: uuid, p_team_id: uuid |
| `set_tech_check` | p_asset_id: uuid, p_note: text, p_status: text |
| `set_ticket_allocation` | p_coupon_code: text, p_id: uuid, p_notes: text, p_quantity: integer, p_status: text, p_undershop_url: text |
| `set_ticket_allocation_discount` | p_discount_percent: integer, p_org_edition_id: uuid, p_pass_type: text, p_quantity: integer |
| `set_ticket_allocation_vivenu` | p_coupon_code: text, p_error: text, p_id: uuid, p_status: text, p_undershop_url: text, p_vivenu_coupon_id: text, p_vivenu_undershop_id: text |
| `set_ticket_issued` | p_barcode: text, p_ticket_id: uuid, p_ticket_type_map_id: uuid, p_vivenu_ticket_id: text, p_vivenu_transaction_id: text |
| `set_ticket_secret` | p_secret: text, p_ticket_id: uuid |
| `set_volunteer_coupon` | p_coupon_code: text, p_error: text, p_profile_id: uuid, p_status: text, p_vivenu_coupon_id: text |
| `set_volunteer_status` | p_note: text, p_profile_id: uuid, p_status: text |
| `sevdesk_document_targets` | p_edition_id: uuid |
| `shift_plan` | p_day: uuid, p_edition_id: uuid |
| `shift_taken` | p_shift_id: uuid |
| `shop_admin_set_line` | p_merch_config: jsonb, p_order_id: uuid, p_qty: numeric, p_sku: text |
| `shop_admin_set_status` | p_note: text, p_order_id: uuid, p_status: text |
| `shop_cancel` | p_order_id: uuid |
| `shop_catalogue` | p_edition_id: uuid, p_org_id: uuid |
| `shop_confirm` | p_note: text, p_order_id: uuid, p_po_number: text |
| `shop_edit` | p_order_id: uuid |
| `shop_invoice_candidates` | p_edition_id: uuid |
| `shop_invoice_refs` | p_edition_id: uuid |
| `shop_my_orders` | p_edition_id: uuid, p_org_id: uuid |
| `shop_order_lines_json` | p_order_id: uuid |
| `shop_order_org` | p_order_id: uuid |
| `shop_order_reserved` | p_order_id: uuid, p_sku: text |
| `shop_order_totals` | p_order_id: uuid |
| `shop_orders_admin` | p_edition_id: uuid |
| `shop_phase` | p_edition_id: uuid |
| `shop_phase_deadline_key` | p_phase: integer |
| `shop_phase_info` | p_edition_id: uuid, p_org_id: uuid |
| `shop_reconcile_ledger` | p_order_id: uuid, p_release: boolean |
| `shop_remove_line` | p_order_id: uuid, p_sku: text |
| `shop_report` | p_edition_id: uuid |
| `shop_request_answer` | p_answer: text, p_id: uuid, p_status: text |
| `shop_request_product` | p_edition_id: uuid, p_org_id: uuid, p_sku: text, p_text: text |
| `shop_requests_admin` | p_edition_id: uuid |
| `shop_sku_via_deliverable` | p_org_edition_id: uuid, p_sku: text |
| `shop_stock_available` | p_sku: text |
| `shop_sync_fulfilled_deliverables` | p_org_edition_id: uuid |
| `shop_upsert_line` | p_edition_id: uuid, p_merch_config: jsonb, p_org_id: uuid, p_qty: numeric, p_sku: text |
| `shuttle_bookings_admin` | p_edition_id: uuid |
| `slot_has_published_session` | p_slot_id: uuid |
| `speaker_access_revoke` | p_edition_id: uuid, p_person_id: uuid |
| `speaker_asset_path_allowed` | p_name: text |
| `speaker_detail` | p_profile_id: uuid |
| `speaker_is_confirmed` | p_status: text |
| `speaker_leads_admin` | p_edition_id: uuid |
| `speaker_managers` | args: ? |
| `speaker_next_steps` | p_profile_id: uuid |
| `speaker_tasks_admin` | p_edition_id: uuid |
| `speaker_ticket_create` | p_profile_id: uuid |
| `speaker_ticket_for_issue` | p_ticket_id: uuid |
| `speaker_tickets_admin` | p_edition_id: uuid |
| `speaker_travel_list` | p_edition_id: uuid |
| `sponsoring_level_key` | p_level: text |
| `stage_editor_orgs` | p_person_id: uuid |
| `stage_frame_binds` | p_stage_id: uuid |
| `start_sync_job` | p_direction: text, p_job_type: text, p_system: text, p_triggered_by: text |
| `submit_deliverable` | p_answers: jsonb, p_asset_ids: uuid[], p_deliverable_id: uuid |
| `submit_expense` | p_claim_id: uuid |
| `submit_hack` | p_data: jsonb |
| `submit_session_content` | p_data: jsonb, p_session_id: uuid |
| `suggest_salutation` | p_locale: text, p_person_id: uuid |
| `supplier_order_list` | p_edition_id: uuid, p_supplier: text |
| `sync_deliverables` | p_org_edition_id: uuid |
| `sync_granted_roles` | p_org_id: uuid |
| `sync_ticket_allocations` | p_org_edition_id: uuid |
| `team_members` | args: ? |
| `team_role_keys` | args: ? |
| `template_applies` | p_org_edition_id: uuid, p_template: public.deliverable_template |
| `ticket_allocations_admin` | p_edition_id: uuid |
| `ticket_allocations_of_orgs` | p_event_id: uuid, p_org_ids: uuid[] |
| `ticket_allocations_pending` | args: ? |
| `ticket_requests_admin` | p_edition_id: uuid |
| `transfer_primary_contact` | p_org_id: uuid, p_person_id: uuid |
| `unassign_shift` | p_assignment_id: uuid |
| `unassigned_speakers` | p_edition_id: uuid |
| `unpublish_session` | p_reason: text, p_session_id: uuid |
| `update_my_speaker_profile` | p_data: jsonb |
| `update_my_volunteer_profile` | p_data: jsonb, p_edition_id: uuid |
| `update_partner_contact` | p_email: text, p_first_name: text, p_last_name: text, p_org_id: uuid, p_person_id: uuid, p_position: text, p_roles: text[] |
| `update_partner_onboarding` | p_data: jsonb, p_edition_id: uuid, p_org_id: uuid |
| `update_session_tech` | p_session_id: uuid, p_tech: jsonb |
| `update_speaker` | p_data: jsonb, p_profile_id: uuid |
| `upload_partner_document` | p_filename: text, p_kind: text, p_org_edition_id: uuid, p_size_bytes: bigint, p_storage_path: text |
| `upsert_booth` | p_data: jsonb, p_edition_id: uuid, p_org_id: uuid |
| `upsert_company_tour` | p_data: jsonb |
| `upsert_company_tour_stop` | p_data: jsonb |
| `upsert_deadline` | p_data: jsonb |
| `upsert_deliverable_template` | p_data: jsonb |
| `upsert_edition_contact` | p_data: jsonb |
| `upsert_edition_info` | p_data: jsonb |
| `upsert_event_day` | p_data: jsonb |
| `upsert_expense_claim` | p_data: jsonb |
| `upsert_hospitality_quota` | p_data: jsonb |
| `upsert_kb_article` | p_data: jsonb |
| `upsert_mail_template` | p_data: jsonb |
| `upsert_next_up_item` | p_data: jsonb |
| `upsert_partner_contact` | p_edition_id: uuid, p_email: text, p_first_name: text, p_last_name: text, p_org_id: uuid, p_position: text, p_roles: text[] |
| `upsert_portal_video` | p_data: jsonb |
| `upsert_product` | p_data: jsonb |
| `upsert_product_component` | p_bundle_sku: text, p_component_sku: text, p_qty: numeric |
| `upsert_reception` | p_data: jsonb |
| `upsert_regie_cue` | p_data: jsonb |
| `upsert_session` | p_data: jsonb |
| `upsert_shift` | p_data: jsonb |
| `upsert_speaker` | p_data: jsonb |
| `upsert_speaker_contact` | p_data: jsonb |
| `upsert_speaker_task` | p_data: jsonb |
| `upsert_stage` | p_data: jsonb |
| `upsert_stage_day` | p_data: jsonb |
| `upsert_track` | p_data: jsonb |
| `upsert_vocab_term` | p_data: jsonb |
| `validate_expense_positions` | p_positions: jsonb, p_profile_id: uuid |
| `vivenu_editions` | args: ? |
| `vivenu_personalization_status` | p_status: text |
| `vivenu_ticket_status` | p_status: text |
| `vocab_term_usage` | p_key: text, p_vocabulary: text |
| `vocab_terms_admin` | p_vocabulary: text |
| `volunteer_admin_overview` | p_edition_id: uuid |
| `volunteer_coupon_revocations_pending` | args: ? |
| `volunteer_coupons_pending` | args: ? |
| `volunteer_day_prefs` | p_data: jsonb, p_edition_id: uuid |
| `volunteer_days` | p_edition_id: uuid |
| `volunteer_edition` | p_edition_id: uuid |
| `volunteer_tickets_admin` | p_edition_id: uuid |
| `withdraw_application` | p_application_id: uuid |
