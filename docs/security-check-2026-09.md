# Security- und Backend-Check September 2026 — Teil 1 (24.09.2026)

Auftrag (Konrad, 22.09.2026): „Wir überprüfen einmal, welche Felder wir haben und wo/ob sie genutzt werden plus versuchen einmal das Portal selbst anzugreifen, um Sicherheitslücken zu schließen.“ Durchgeführt von der Architektur-Session am 24.09.2026 gegen die Live-Datenbank (nur lesend) und `portal.chef-treff.de` (ohne Anmeldedaten). Stand des Codes: `main` c75d0f4.

## 1 · Befunde

| Nr. | Schwere | Befund | Stand |
|---|---|---|---|
| F1 | **hoch** | Die Sicht `consent_current` war die einzige Sicht ohne `security_invoker`. Mit SELECT-Grant für `authenticated` lief sie mit Eigentümerrechten an der RLS von `consent_record` vorbei: jede angemeldete Person konnte alle Einwilligungsdatensätze aller Personen lesen (Probe als `authenticated` ohne Person: 11 von 11 Zeilen). | **behoben** mit Migration 0150 (`20260924101124`); Test `supabase/tests/v6_consent_current_invoker.sql` (vorher „LECK: 11 Zeilen“, nachher 0) |
| F2 | mittel | Bucket `speaker-photos` ist **öffentlich**: jedes hochgeladene Speaker-Foto ist per URL ohne Anmeldung lesbar, auch von Speakern, die nie freigegeben werden (URL nur durch Unkenntnis geschützt). | offen → **SPK-047** beim Speaker-Chat: privat plus signierte URLs nach dem Muster `person-photos` (0151); die Website bekommt Fotos künftig über Sanity (SPK-046) |
| F3 | niedrig | Die vollständige Content-Security-Policy läuft im **Report-Only**-Modus (`CSP_ENFORCE` nicht gesetzt); scharf sind nur `frame-ancestors 'none'`, `base-uri`, `object-src`, `form-action`. | Entscheidung Konrad: Reports (Vercel-Logs `[csp]`) prüfen und vor dem Go-live 14.10. scharf schalten |
| F4 | niedrig | Antwort-Header `x-powered-by: Next.js` verrät das Framework. | Admin & Schnittstellen-Chat: `poweredByHeader: false` in `next.config.ts` (mit PORT) |
| F5 | Hinweis | Kein anwendungsseitiges Rate-Limit beim Magic-Link (`signInWithOtp` direkt gegen Supabase Auth); es gelten die Supabase-Auth-Limits. | Konrad: Auth-Rate-Limits im Supabase-Dashboard kontrollieren (E-Mail-OTP je Stunde, Abstand je Adresse) |
| F6 | Hinweis | `ip_hash` in `audit_log` und `consent_record` wird von keinem Code und keiner Funktion befüllt. | Entscheidung Konrad: befüllen (Nachweis) oder Spalten streichen (Datenminimierung; Zeitpunkt, Fassung und `user_agent` liegen vor) |
| F7 | Hinweis | Bucket `edition-files` ist für **alle angemeldeten** Personen lesbar (Hallenplan, gewollt). Der zweite Hallenplan nur für Speaker (PROD-009) braucht deshalb eine Pfad- oder Bucket-Trennung, sonst sehen ihn auch Partner. | an Produktion/Admin mit PROD-009 |
| F8 | Hinweis | `anon` darf 13 reine Hilfsfunktionen ausführen (`email_hash`, `fmt_cents`, `iban_valid`, `is_u35`, `export_privacy_notice`, `team_role_keys` …) — keine Definer, kein Datenzugriff. | unkritisch, dokumentiert |
| F9 | Hinweis | Assistenten (Titel, Post) prüften nur Nutzer-Züge auf Länge; Assistant-Züge aus dem Browser waren ungekappt (Kostenrisiko, 10 Aufrufe je Person und Stunde). | **behoben** mit #142 (`verlaufAusBrowser`, 4000 Zeichen je Assistant-Zug) |
| F10 | hoch | **Partner lesen Entwürfe anderer Partner.** `is_programme_reader()` schließt `standbuehne_editor` und `speaker_manager` ein; die Policy `session_read` lässt damit jede Person mit Standbühnen-Rolle **alle** Sessions lesen, auch unveröffentlichte Entwürfe fremder Partner (Titel, Beschreibung, `format_details` mit Stellenangaben). Befund des Partner-Chats am 24.09., live bestätigt (2 Rollenzuweisungen `standbuehne_editor`, Scope org). | **behoben 25.09.: Migration 0180 = 20260925070949 (#190)** — `is_programme_reader()` nur `is_staff()`; Policies `session_read`/`slot_read` und `is_session_visible`: Veröffentlichtes, eigene Auftritte, eigene Organisation (Kontakt oder Standbühnen-Editor, Scope org), Bühnen mit Bearbeitungsrecht; Realtime-Kanal nur für Board-Nutzer mit reinen IDs; Test 16/16 mit Rollenwechsel |
| F11 | niedrig | `session_mail_vars(p_session_id, p_locale)` war für `authenticated` ausführbar und lieferte Titel, Zeit, Bühne und Veranstaltung jeder Session (auch Entwürfe) allein über die Kennung; gebraucht nur von vier SECURITY-DEFINER-Aufrufern (Mail-Trigger, Erinnerungslauf), kein Anwendungscode. | **behoben 25.09.: Migration 0181 = 20260925071823** — EXECUTE für public, anon, authenticated entzogen; Test 3/3 (Grants, Aufruf als authenticated 42501, Aufrufer bleiben Definer) |

## 2 · Datenbank (Ergebnis der Prüfung)

- **RLS:** alle 92 Tabellen in `public` haben RLS; 48 davon bewusst ohne Policy (Zugriff nur über SECURITY-DEFINER-Funktionen und `service_role`: `audit_log`, `organization`, `partner_deal`, `mail_log`, `suppression`, `ticket_secret`, `volunteer_profile` …). Keine Tabelle mit Grant an `authenticated` ohne Policy.
- **Grants:** `anon` nur SELECT auf `vocab_term`. `authenticated`: SELECT auf 48 Tabellen und Sichten mit Policies (u. a. `person` nur eigene Zeile: `auth_user_id = auth.uid()`), Schreiben nur `consent_record` (INSERT, eigene Person, `source = 'portal'`), `person_interest` und `person_acquisition_channel` (INSERT/DELETE).
- **Funktionen:** 513 in `public`; jede SECURITY-DEFINER-Funktion hat `search_path` gepinnt; keine für `anon` ausführbar; keine mit `select *` oder `to_jsonb` auf `person`. `harden_definer_functions()` am Ende jeder Migration wirkt.
- **Sichten:** 8; alle mit `security_invoker` — `consent_current` seit 0150.
- **Storage:** 8 Buckets. Öffentlich und gewollt: `contact-photos` (Ansprechpersonen), `partner-logos`, `product-images`. Öffentlich und zu ändern: `speaker-photos` (F2). Privat mit Pfadregeln je Person/Organisation/Session: `edition-files` (lesen alle Angemeldeten), `partner-assets`, `session-assets`, `speaker-assets` (Belege nicht löschbar), `person-photos` (neu, 0151).
- **Rechte-Belege per Test:** `lead016_buehnen_sichtregel.sql` (reines Editor-Konto kommt nicht an fremde Bühnen, 6/6), `v6_lead_tagesrahmen.sql` (Stage Leads hart im Tagesrahmen, 8/8), `v6_person_portraet.sql` (fremde Pfade gesperrt, 11/11), `v6_logo_druck_einwilligung.sql` (fremde Org 42501, anon gesperrt, 10/10).
- Extensions: btree_gist, citext, pg_stat_statements, pg_trgm, pgcrypto, supabase_vault, unaccent, uuid-ossp. 16 Auth-Nutzer (Team und Testkonten).

## 3 · Anwendung (Code und Aufrufe ohne Anmeldung)

- **25 API-Routen:** 23 mit `requireArea`/`requireUser`, `CRON_SECRET` (zeitsicherer Vergleich) oder Webhook-Signatur; öffentlich nur `/api/csp-report` (protokolliert, speichert nichts). Alle Server-Actions (`"use server"`) prüfen über `requireArea`/`createSupabaseServerClient`.
- **service_role** nur in `lib/supabase/admin.ts` (server-only) und 27 Server-Dateien, jeweils nach Rollenprüfung oder Signatur/Secret; nie im Browser.
- **Webhooks:** HubSpot Signatur v3 mit 5-Minuten-Fenster und Idempotenz (`integration.webhook_event`); vivenu Signatur und Idempotenz; Zahlungsdaten nicht betroffen.
- **Exporte:** 4 CSV-Routen, alle über `lib/csv.ts` (`csvCell`, Formelschutz).
- **Uploads:** ausschließlich direkt in Storage mit Pfad-Policies und signierten Upload-URLs; kein Multipart über den Server (Grenze 4 MB umgangen, PROD-008/ADM-043).
- **HTML:** ein `dangerouslySetInnerHTML` (Vorschau der Mail-Vorlagen im Admin, eigener Inhalt); das Wiki rendert Markdown ohne HTML.
- **Aufrufe ohne Anmeldung gegen `portal.chef-treff.de`:** Cron-Routen und Webhooks → 401; alle Admin-, Speaker-, Partner-, Produktions-, Regie- und Export-Routen → 307 nach `/login?next=…`; `/login?next=https://evil.example` und `/auth/callback?next=//evil.example` führen nicht nach außen (`safeNextPath`).
- **Header:** HSTS (2 Jahre, includeSubDomains), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (Kamera nur eigene Seite, sonst aus), CSP scharf für Rahmen/Basis/Objekte/Formulare, Rest Report-Only (F3), `x-powered-by` (F4).

## 4 · Feldinventur

92 Tabellen, 1192 Spalten. Verglichen wurde jeder Spaltenname (als Wort) mit dem Code (`app`, `lib`, `components`, `scripts`, 524 Dateien) und den 513 Live-Funktionen (`supabase/snapshot/functions`). Nur 16 Spalten kommen nirgends vor:

| Tabelle | Spalte(n) | Einordnung |
|---|---|---|
| `audit_log`, `consent_record` | `ip_hash` | nie befüllt → F6 |
| `decision_release` | `released_at` | nur im Test; Freigabe-Zeitpunkt wird über die Funktion nicht gesetzt → prüfen (Talent-Chat, Bewerbungen) |
| `event` | `parent_event_id` | Nebenevents hängen über `edition_id`; Spalte ohne Nutzung → streichen oder Masterplan-Rest? Entscheidung Architektur |
| `hack_team` | `note_internal` | Hackathon ruht; bleibt bis zur Feature-Übersicht |
| `person` | `is_ambassador`, `referred_by_person_id` | Empfehlungs-/Botschafter-Logik nie gebaut → Talent-Chat, Leitbild Community-Portal (TAL-005ff.) oder streichen |
| `person_merge_log` | `actor`, `merged_at`, `merged_person_id`, `surviving_person_id` | Tabelle ohne Funktion → ADM-036 (Dubletten zusammenführen) |
| `registration` | `external_source` | ohne Nutzung → mit EA4 (vivenu-Personalisierung) klären |
| `session` | `swapcard_id` | wird mit EA3 (Slot → Swapcard) belegt |
| `slot` | `responsible_person_id` | ADM-018 (Verantwortliche je Session) offen |
| `ticket_type_map` | `rights`, `swapcard_group` | EA4a (Zuordnung Pass-Typ → Swapcard-Gruppe) |

Alle übrigen 1176 Spalten werden im Code oder in Funktionen verwendet (Wortsuche; Spalten mit Allerweltsnamen wie `status` gelten dabei als verwendet). **33 Tabellen sind noch leer** (vor Go-live erwartbar): `registration`, `checkin`, `suppression`, `partner_asset`, `partner_deal`, `shop_request`, `hack_*` (6), `speaker_reception*`, `speaker_task*`, `shuttle_booking`, `portal_video`, `edition_info`, `profile_deletion_request`, `storage_purge_queue` u. a. Vollständige Tabelle je Tabelle: Abschnitt 6.

## 5 · Offen und nächste Schritte

1. **Teil 2 (Angriffsprobe mit Rollenkonten):** je Rolle ein geliehenes Konto (wie in `lead016_buehnen_sichtregel.sql`) und eine Liste von Zugriffen, die verboten sein müssen — Partner auf fremde Organisation (`partner_overview`, Uploads, Board), Speaker auf fremdes Profil und fremde Belege, Stage Lead auf Admin-Routen und fremde Bühnen, Volunteer auf Ernährungsdaten anderer, Kiosk-Konto außerhalb `/checkin`. Als SQL-Tests unter `supabase/tests/security_*.sql`, damit sie wiederholbar sind. Termin: Woche ab 28.09.
2. Entscheidungen Konrad: F3 (CSP scharf), F5 (Auth-Limits prüfen), F6 (`ip_hash`), F2 (Bucket, liegt beim Speaker-Chat).
3. Wiederholen nach PORT2 (Umzug Produktion in den Admin): neue Routen unter `/admin/produktion/*` gegen die Rollenprüfung testen.
4. Schlüsselrotation Supabase Secret Key (offen seit 18.09.) und HubSpot-Service-Schlüssel (7 Tage Karenz) — Runbook `key-rotation.md`.

## 6 · Feldinventur je Tabelle (Zeilen live, Spalten, ungenutzte Spalten)

| Tabelle | Zeilen live | Spalten | Spalten ohne Verwendung in Code und Funktionen |
|---|---|---|---|
| `ai_rate_limit` | 1 | 4 | — |
| `application` | 3 | 13 | — |
| `audit_log` | 1074 | 10 | `ip_hash` |
| `booth` | 1 | 11 | — |
| `booth_assignment` | 1 | 7 | — |
| `booth_service_check` | 0 | 7 | — |
| `checkin` | 0 | 10 | — |
| `company_tour` | 6 | 13 | — |
| `company_tour_stop` | 18 | 18 | — |
| `consent_record` | 11 | 12 | `ip_hash` |
| `deadline` | 7 | 12 | — |
| `decision_release` | 0 | 5 | `released_at (nur Test)` |
| `deliverable` | 12 | 16 | — |
| `deliverable_template` | 14 | 19 | — |
| `edition_contact` | 4 | 14 | — |
| `edition_file` | 1 | 14 | — |
| `edition_info` | 0 | 11 | — |
| `event` | 3 | 21 | `parent_event_id` |
| `event_day` | 6 | 11 | — |
| `expense_claim` | 1 | 24 | — |
| `external_ref` | 0 | 9 | — |
| `hack_application` | 0 | 12 | — |
| `hack_challenge` | 0 | 16 | — |
| `hack_judging_score` | 0 | 8 | — |
| `hack_submission` | 0 | 9 | — |
| `hack_team` | 0 | 11 | `note_internal` |
| `hack_team_member` | 0 | 7 | — |
| `hospitality_booking` | 1 | 14 | — |
| `hospitality_quota` | 5 | 17 | — |
| `kb_article` | 16 | 17 | — |
| `kb_chunk` | 39 | 8 | — |
| `kb_question_log` | 7 | 8 | — |
| `kb_rate_limit` | 0 | 4 | — |
| `mail_log` | 104 | 16 | — |
| `mail_template` | 72 | 10 | — |
| `org_edition` | 3 | 22 | — |
| `org_membership` | 4 | 8 | — |
| `org_product` | 7 | 11 | — |
| `org_step` | 6 | 4 | — |
| `org_step_check` | 0 | 5 | — |
| `org_ticket_allocation` | 5 | 18 | — |
| `organization` | 3 | 21 | — |
| `partner_asset` | 0 | 17 | — |
| `partner_deal` | 0 | 5 | — |
| `person` | 25 | 41 | `is_ambassador`, `referred_by_person_id` |
| `person_acquisition_channel` | 0 | 4 | — |
| `person_email` | 25 | 8 | — |
| `person_interest` | 5 | 4 | — |
| `person_merge_log` | 0 | 6 | `actor`, `merged_at`, `merged_person_id`, `surviving_person_id` |
| `portal_video` | 0 | 10 | — |
| `potential_duplicate` | 0 | 10 | — |
| `product` | 167 | 40 | — |
| `product_component` | 23 | 3 | — |
| `profile_deletion_request` | 0 | 9 | — |
| `question_catalog` | 4 | 13 | — |
| `regie_cue` | 3 | 21 | — |
| `registration` | 0 | 13 | `external_source` |
| `role_assignment` | 20 | 13 | — |
| `session` | 11 | 28 | `swapcard_id` |
| `session_asset` | 2 | 16 | — |
| `session_question` | 1 | 14 | — |
| `session_speaker` | 10 | 6 | — |
| `session_submission` | 0 | 15 | — |
| `shift` | 1 | 15 | — |
| `shift_assignment` | 1 | 11 | — |
| `shop_order` | 2 | 15 | — |
| `shop_order_line` | 5 | 13 | — |
| `shop_request` | 0 | 11 | — |
| `shuttle_booking` | 0 | 21 | — |
| `slot` | 23 | 16 | `responsible_person_id` |
| `slot_history` | 17 | 8 | — |
| `speaker_asset` | 3 | 19 | — |
| `speaker_contact` | 1 | 12 | — |
| `speaker_profile` | 2 | 45 | — |
| `speaker_reception` | 0 | 16 | — |
| `speaker_reception_rsvp` | 0 | 8 | — |
| `speaker_task` | 0 | 12 | — |
| `speaker_task_tick` | 0 | 4 | — |
| `speaker_travel` | 1 | 15 | — |
| `stage` | 7 | 16 | — |
| `stage_day` | 10 | 9 | — |
| `stock_ledger` | 0 | 7 | — |
| `storage_purge_queue` | 0 | 7 | — |
| `suppression` | 0 | 3 | — |
| `ticket` | 6 | 38 | — |
| `ticket_secret` | 2 | 3 | — |
| `ticket_type_map` | 3 | 10 | `rights`, `swapcard_group` |
| `track` | 0 | 7 | — |
| `vocab_binding` | 42 | 6 | — |
| `vocab_term` | 505 | 10 | — |
| `volunteer_coupon_revocation` | 0 | 7 | — |
| `volunteer_profile` | 1 | 25 | — |

## Teil 2 (25.09.2026): Rollenkonten — Inventur und Probe

**Methode.** (1) Statische Inventur aus der Live-Datenbank: alle SECURITY-DEFINER-Funktionen in `public`, die `authenticated` ausführen darf und deren Quelltext kein Rechtemuster enthält (`current_person_id`, `auth.uid`, `is_*`, `has_role`, `can_*`, `active_roles` …); Tabellen ohne RLS; Policies für `authenticated` mit `qual = true`. (2) Live-Probe mit echtem Rollenwechsel (`set local role authenticated`) als dauerhafter Test `supabase/tests/sicherheit_rollenkonten.sql`: Externe ohne Rolle und ein Partner-Kontakt zählen je Tabelle mit `person_id` bzw. `org_id` die sichtbaren fremden Zeilen; Erwartung null, Ausnahme `session_speaker` veröffentlichter Sessions.

**Ergebnis Inventur.** 28 Kandidaten. 27 davon prüfen ihre Rechte über delegierte Funktionen (`is_expense_approver()`, `is_marketing_team()`, `is_hack_team()`, `is_production_team()`, `my_kb_audiences()`, `my_speaker_profile_id()`) oder sind harmlose Helfer ohne Personenbezug (`is_partner_of`, `is_speaker_assistant`, `slot_has_published_session`, `hospitality_used`, `hospitality_block_reason`, `decisions_released`, `presentation_window`, `shop_phase`, `hack_edition`, `validate_expense_positions`, Trigger `org_edition_prefill_pass_type`). Einer war offen: `session_mail_vars` → **F11**, behoben mit 0181. Tabellen ohne RLS in `public`: keine. Policies mit `qual = true` für `authenticated`: 14 — Stammdaten zum Lesen (`event`, `event_day`, `stage`, `stage_day`, `track`, `deadline`, `question_catalog`, `product_component`, `vocab_term`, `decision_release`) und Selbst-Einfügungen (`consent_record`, `person_acquisition_channel`, `person_interest`, `person_language`; die Spaltenprüfung `person_id = ich` liegt jeweils im `with check`). 49 Tabellen mit SELECT-Grant für `authenticated`, alle mit RLS.

**Ergebnis Probe (25.09., 5/5).** Externe ohne Rolle: 11 Tabellen mit `person_id` lesbar, keine fremde Zeile außer Speakern veröffentlichter Sessions; 3 Tabellen mit `org_id` lesbar, nur eigene Mitgliedschaft; keine fremden Entwürfe (nach 0180), keine Slots ohne veröffentlichte Session außer Rahmen; `ticket_secret`, `audit_log`, `organization` ohne Grant; `expense_claim`, `hospitality_booking`, `role_assignment` leer. Partner-Kontakt: keine Zeile fremder Organisationen. Der Test läuft ab jetzt nach jeder Migration, die Policies oder Grants ändert (Konvention in `docs/db-konventionen.md`).

**Noch offen für Teil 3:** Stage Leads (`speaker_manager`) und Standbühnen-Editoren als eigene Probe-Rollen (0180 hat sie im eigenen Test 16/16), Storage-Bucket-Policies je Rolle, Rate-Limits (K-14) und die Auth-Einstellungen (K-13 CSP nach der Klickrunde).


## Teil 3 (Vorarbeit, 25.09.2026) — Rechte-Review Stage-Lead-Portal durch den Speaker-Chat

Vollständiges Review in `docs/rechte-review-speaker-leads-2026-09-25.md` (Draft-PR #231, Branch `speaker/port3`, nur Doku). Lücken L1–L7, alle über die Rolle `speaker_manager` (externe Stage Leads); **live gibt es noch keinen externen Zugang**, die Auflage „keine externen Zugänge vor PORT3“ bleibt deshalb hart.

| Nr. | Schwere | Befund | Behebung (PORT3, Variante A) |
|---|---|---|---|
| L5 | **ernst** | `upsert_speaker`: `on conflict … do update` ohne `can_manage_speaker`; `person_id` wird auch von Nicht-Team angenommen → jeder `speaker_manager` überschreibt jedes bestehende Profil der Edition (Pipeline-Status, Typ, Titel, Organisation, interne Notiz, Reception, Reisekosten) per E-Mail oder `person_id` | Konfliktpfad prüft `can_manage_speaker(bestehendes Profil)`; `person_id` nur für das Team; Nicht-Team bekommt bei fremdem Profil **42501**, das Team behält `speaker_exists` (Entscheidung F1) |
| L1 | mittel | `can_manage_speaker`, Edition-Zweig für `speaker_manager` | Zweig fällt; nur Bühnen-Scope (`is_stage_lead_of`) und eigene Einträge |
| L2 | mittel | `can_search_board` global und Edition | nur Teamrollen und Bühnen-Scope |
| L3 | mittel | `board_search_people` zeigt Namen aller Speaker der Edition | nur eigene Bühne und eigene Einträge (Entscheidung F2: Stage Leads finden keine bestätigten Speaker der Edition) |
| L4 | mittel | `speaker_managers` gibt E-Mails an Leads | E-Mails nur für das Team |
| L6 | niedrig | `my_manager_scope` liefert Editionen nur aus Edition-Scope | aus Bühnen-Scope ableiten |
| L7 | mittel | `assign_role` und `/admin/speaker-leads` vergeben den Edition-Scope | Vergabe-Weg weist Edition und global für `speaker_manager` ab; Bühnenwahl im Admin; Konrads Edition-Zeile weg |

Bereits dicht: Board-Lesewege und fremde Entwürfe (`security_invoker`, `session_read`, 0180). **Entscheidungen der Architektur-Session (25.09.):** F1 42501 für Nicht-Team, `speaker_exists` nur Team · F2 nein, nur eigene Bühne und eigene Einträge · F3 Slot- und Tag-Scope bleiben erlaubt, `is_stage_lead_of(stage)` gilt für die ganze Bühne (Slot/Tag sind Teilmengen derselben Bühne; Schreibrechte folgen weiter `can_edit_stage`). Nach „Migration live“ von PORT3 bekommt `supabase/tests/sicherheit_rollenkonten.sql` einen Stage-Lead-Schritt (fremde Bühne 0 Zeilen mit gesetzter Vorbedingung, `upsert_speaker` auf fremdes Profil 42501).
