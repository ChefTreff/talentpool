# Security-Review nach der Pause — 14.09.2026

Architektur-/Security-Session nach Rückkehr aus der Pause (Arbeitsauftrag Welle 4, Abschnitt E). Geprüft: die vierzehn in der Pause von der Build-Session angewendeten Migrationen (0067–0073, 0075–0081), die vier vor dem Anwenden vorgelegten (0082–0085), die sicherheitsrelevanten Code-Stellen der PRs #28–#34 und die Datenbank als Ganzes. Zusammenfassung der Build-Session: `docs/security-check-pause-2026-09-11.md`, ihr Bericht: `docs/bericht-welle-4-pause.md`.

## 1 · Datenbankweite Checks (Frankfurt, 14.09. vormittags)

| Prüfung | Ergebnis |
|---|---|
| SECURITY-DEFINER-Funktionen mit anon-EXECUTE oder ohne gepinnten `search_path` | **0** von 282 Funktionen |
| Grants für `anon` | nur `select` auf `vocab_term`, keine Spalten-Grants |
| Tabellen ohne RLS (public, integration) | keine |
| Grants für `authenticated` ohne Policy | keine — 38 Tabellen mit Lese-Grant tragen je eine Policy; Spalten-Grants auf `ticket` (id, event_id, person_id, status, barcode), `product` (ohne Einkaufsspalten), `org_edition`, `expense_claim` (ohne IBAN) |
| Storage | unverändert: `partner-assets`/`speaker-assets` privat mit Pfadregeln, `partner-logos`/`product-images` öffentlich, Schreiben nur service_role |
| Supabase-Advisor (security) | 22 × INFO „RLS ohne Policy“ = Integrations-/Import-Tabellen ohne Grants (gewollt, fail-closed); 1 × WARN „Definer-Funktionen für authenticated ausführbar“ = unser RPC-Muster mit Rollenprüfung innen; darunter sieben Trigger-Funktionen aus den Wellen 1–2 ⇒ **0086** |

## 2 · Rückblick 0067–0081 (Build-Session, Pause)

| Nr. | Thema | Befund |
|---|---|---|
| 0067 | Volunteer-Rolle bei Absage per `delete` | korrekt; nur die automatisch vergebene Zuweisung |
| 0068 | `day_of_edition`, `upsert_shift` prüft den Tag | korrekt, Helfer ohne EXECUTE |
| 0069 | `volunteer_days()` | harmlos; **die Begründung war falsch** — `event_day_read using (true)` existiert seit v2, `event_day` ist für Angemeldete direkt lesbar (4 Zeilen). Kein Handlungsbedarf. |
| 0070 | `is_volunteer_team()` ohne `volunteer_lead`, `my_lead_shifts()` | korrekt, keine Mailadressen/Geburtsdaten |
| 0071–0073 | vivenu-Ingest, `ticket_secret`, Statusabbildung | korrekt; Personenzuordnung über die Inhaber-/Käufer-Mail ist ein bewusstes Muster (Ticketpflicht), Secret nur in `ticket_secret` ohne Grants |
| 0075–0078 | `stale`, Tickettyp, NOT-NULL-Rückfälle | korrekt |
| 0079 | Undershop + Pass-Typ als Kontingentschlüssel, `ticket_allocations_of_orgs` (Partner-Team/service_role) | korrekt |
| 0080 | `personalized` ⇒ `partial`, nie zurückstufen | korrekt |
| 0081 | echte vivenu-Aufzählung, `recount_allocation_usage` zählt nur belegende Status | korrekt |

Ergebnis: keine Sicherheitslücke, keine Korrektur-Migration nötig. Prozess-Fund: zwei Dateinamen ohne Server-Version (behoben in #35).

## 3 · Review 0082–0085 vor dem Anwenden — Korrekturen direkt in den Branches

| Nr. | Fund | Korrektur |
|---|---|---|
| 0082 | `is_production_team()` umfasste `programme_team`; `supplier_order_list` nennt Einkaufspreise; `slot_id` eines Cues wurde nicht gegen Bühne × Tag geprüft; Trigger-Funktion mit EXECUTE | Rolle ohne `programme_team` (Bereich `/produktion` kennt nur Produktion und Leitung); Slot-Prüfung ⇒ 22023 `invalid_cue`; `revoke execute`; Tests 11–12 |
| 0083 | `upsert_kb_article` prüfte nur die **neue** Zielgruppenliste mit „mindestens eine“ — eine Volunteer-Leitung hätte einen Partner-Artikel übernehmen oder eigene Texte ins Partner-Wiki schieben können | `can_edit_kb_all()` (alle Zielgruppen) für Schreiben, Veröffentlichen, Archivieren und den Editor; beim Ändern zusätzlich die bisherige Zielgruppe; Tests 10a–d |
| 0084 | Widerrufener Coupon (`revoked`) wurde bei vivenu nie deaktiviert — ein abgelehnter Volunteer behielt einen gültigen 100-%-Code; Mail-Vorlage nutzte `{{link}}`, das der Versand nicht kennt (leerer Link); Trigger-Funktionen mit EXECUTE | Tabelle `volunteer_coupon_revocation` + RPCs `volunteer_coupon_revocations_pending`/`mark_volunteer_coupon_revoked`; erneute Zusage ⇒ `none`; `{{portal_url}}/volunteers`; `ticket_status` in der Team-Liste; `revoke execute`; Tests 09a–e. **Offen (Code, Build-Session):** der Cron muss die Liste abarbeiten (`updateCoupon active:false`); der Volunteer-Undershop bietet heute alle Tickettypen zu 0 € an — nur Typen mit `pass_type = 'crew'` zulassen. |
| 0085 | Jede Partner-Jury (`hackathon_partner`) sah und bewertete **alle** Teams — Einreichungen konkurrierender Teams inklusive; Mentoren wurden nie aus dem Formular übernommen; `submission_closed` im Kopf ohne Umsetzung; Hilfs-/Trigger-Funktionen mit EXECUTE | `can_judge_hack_team()` (Team: alle; Partner: nur die Challenge der eigenen Organisation über `is_member_of_org`); Mentoren aus `mentor_names`; Kopf berichtigt; `revoke execute`; Tests 10a–d |

Alle vier Smoke-Tests gegen Frankfurt grün (13/17/15/17 Prüfungen). Server-Versionen: 0082 `20260914094832`, 0083 `20260914095053`, 0084 `20260914095318`, 0085 `20260914095624`, 0086 `20260914095907`.

## 4 · Code-Stellen

- **Webhook `/api/webhooks/vivenu`** (#28): Signatur HMAC-SHA256 hex über den Raw-Body **vor** dem Parsen, ohne Secret Ablehnung; `redactSecrets()` entfernt `secret`-Felder **nach** der Prüfung, vor dem Protokoll; Idempotenz über die Webhook-Id; Verarbeitung nach der Antwort. In Ordnung.
- **Login-Umleitung** (#29): `safeNextPath()` lässt nur Pfade dieses Hosts zu; Einstieg aus `session_context` (Admin zuerst, sonst erster eigener Bereich). Keine offene Weiterleitung.
- **Server-Actions** (#30, #31, #33) und **CSV-Route** (#30): Bereichs-Gate (`requireArea`) davor, Rechteprüfung in der Datenbank über den Sitzungs-Client — kein service_role im Nutzerpfad.
- **Markdown-Renderer** (#31): nur React-Knoten, Links nur `http(s)`, `rel="noopener noreferrer"`. Kein Weg von Text zu Skript.
- **Cron `/api/cron/volunteer-tickets`** (#32): `CRON_SECRET` im konstantzeitigen Vergleich; Coupons mit `allowAllEvents: false`, `maxUsage: 1`, `singleUsage: true`.

## 5 · Nächste Schritte

1. Build-Session: Widerrufs-Sync und Undershop-Tickettypen (A6), Walkthroughs #30–#33, dann PR 24 Check-in (A2 + B4).
2. Architektur-Session: Merge #30–#33 nach Walkthrough und Gate; Volunteer-Airtable-Auslese; Sanity-Trockenlauf; CSP-Logs → `CSP_ENFORCE`.
3. Lehren stehen in `docs/db-konventionen.md` (§4: Rechteprüfung beim Ändern, Widerruf im Fremdsystem, Mail-Variablen; §8: Korrekturen im PR-Branch, gestapelte PRs).
