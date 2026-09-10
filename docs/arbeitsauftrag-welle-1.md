# Arbeitsauftrag Welle 1 · Talent + Programm (15.–21.09.2026)

> Voraussetzung: Welle 0 Teil A (Schema v2) ist live; Teil B (App-Fundament) ist gemergt. Grundlage: Masterplan §1 (Talent-Portal, Programm-DB + Editor), Ergänzungen v0.1a (Ticket-Journey) und v0.1c (Programm-Board); `docs/datenmodell-v2.md`; Entscheidungslog bis 08.09. Ziel: Ein Talent kann sich einloggen, sein Profil anlegen, das veröffentlichte Programm sehen, sich mit einem Klick bewerben oder anmelden, seine Tickets sehen und personalisieren. Das Programm-Team pflegt Sessions und Slots im Board.

## A · Backend (Architektur-Session)
| # | Thema | Inhalt | Akzeptanz |
|---|---|---|---|
| A1 | Vivenu-Ingest | Route Handler `app/api/webhooks/vivenu` (Signaturprüfung, `integration.webhook_event` idempotent, Verarbeitung `transaction.complete` → `ticket` je Ticket über `ticket_type_map`, `ticket.updated/cancelled`, `scan.created` → `checkin`); nächtlicher Sweep über die Vivenu-REST-API (pg_cron → Edge Function); **Sandbox zuerst** (`VIVENU_SANDBOX=true`) | Doppelter Webhook → `duplicate`; ungültige Signatur → 401 + Log; Sweep gleicht fehlende Tickets nach |
| A2 | Bestätigungs-Backend | Laden der Tickets einer Transaction für den eingeloggten Käufer (buyer_email = Auth-E-Mail); Rückschreiben der Badge-Felder nach vivenu nach `personalize_ticket`; **finale Ticket-Mail** aus dem Portal (Template `ticket_final`, QR = Barcode) über `lib/mail` → `mail_log` | Personalisierung schreibt vivenu-Ticket (Sandbox) und verschickt genau eine Mail |
| A3 | Claim erweitert | `claim_or_create_person()` verknüpft beim Login Tickets mit `holder_email` = verifizierte E-Mail (`person_id`), vergibt Rolle `talent` (Edition FLS27) und schreibt Consent `terms`/`privacy` aus dem Login-Formular | Neuer Login mit personalisiertem Ticket sieht das Ticket sofort unter „Meine Tickets" |
| A4 ✅ (08.09., live `20260908182849`) | Programm-Backend | View `programme_board` (Slots + Sessions + Speaker je Tag, interne Felder nur für Programm-Leser), RPC `upsert_session` (Programm-Team), `attach_session_to_slot`, `publish_session` (prüft Pflichtfelder + Speaker), Vokabular-gestützte Validierung | Board lädt einen Tag in einer Abfrage; Veröffentlichen ohne Speaker liefert `23514` |
| A5 | Bewerbungs-Mails + Cron | Templates DE/EN: `application_received`, `application_accepted` (mit `confirm_by`), `application_waitlisted`, `application_declined`, `application_promoted`, `registration_confirmed`; Versand ausgelöst durch `decision_release` (Queue in `mail_log` status `queued`, Worker im Route Handler / Cron); pg_cron stündlich `expire_overdue_applications()` + `promote_waitlist()` für frei gewordene Plätze | Freigabe erzeugt je Bewerbung genau eine Mail; verfallene Zusagen rücken nach |
| A6 | Tests | `supabase/tests/v2_ingest.sql` (Idempotenz, Ticket-Mapping), Erweiterung der Bewerbungs-Tests um Mails/Cron | Alle Tests grün, Advisor ohne ERROR |

## B · Frontend (Build-Session)
| # | Thema | Inhalt | Akzeptanz |
|---|---|---|---|
| B1 | Onboarding-Wizard | Schritte: Basis (Name, Sprache, Stadt/Land) → Beruf/Studium (Vokabular) → Interessen → Consent (`consent_record`) → fertig; Progressive Profiling (Pflicht nur Badge-Minimum), DE/EN, Fortschrittsanzeige | Neuer Nutzer hat nach ≤ 3 Minuten ein vollständiges Profil; kein Feld ohne Vokabular-Label |
| B2 | Programm-Ansicht `/programm` | Tag-Tabs, Bühnen-Filter, Format/Sprache-Filter, Session-Karte + Detail-Drawer; Button je `access_mode`: „Hingehen" (nur Info) · „Anmelden" (`register_for_session`) · „Bewerben" (1-Klick, Fragen-Modal aus `session_question`, `apply_to_session`); Status aus `my_applications()`; Kollisions-Dialog bei `collision` mit „ersetzen" (`p_replace_conflicting`) | Bewerben in ≤ 2 Klicks ohne Fragen, ≤ 1 Modal mit Fragen; Fehlercodes werden als klare Meldungen übersetzt (`docs/datenmodell-v2.md`) |
| B3 | Meine Teilnahme `/meine` | Bewerbungen (maskierter Status, Frist, Bestätigen/Zurückziehen), Anmeldungen (Storno), Tickets (QR groß, Pass-Typ, Personalisierungsstatus) | Bestätigen nach Freigabe funktioniert inkl. Ticketpflicht-Hinweis |
| B4 | Ticket-Bestätigung `/tickets/bestaetigung` | Nach vivenu-Redirect (`?tx=`): Login-Gate, Tickets der Transaktion, je Ticket „Für mich / andere Person", Badge-Minimum (Vorname, Nachname, Position, Unternehmen), „Vorerst überspringen", Next-Best-Actions (Profil → Programm → Interessen), Add-on-Hinweise | Personalisierung ruft `personalize_ticket`; Zustände pending/partial/complete sichtbar |
| B5 | Admin: Programm-Editor + Board | Sessions CRUD (Titel DE/EN, Beschreibung, Format, Sprache, Zugangsart, Kapazität, Frist, Fragen, Speaker), Veröffentlichen mit Pflichtfeld-Check; **Programm-Board** (dnd-kit): Spalten = Bühnen, 5-Min-Raster, Drag/Resize → `move_slot`, Warnungen als Toast, `confirmation_required`-Dialog, `23P01` als Fehler, Backlog-Leiste (Sessions ohne Slot → `create_slot` mit `p_session_id`), Status-Legende, Kopfzeile aus `stage_day_slot_stats`, Realtime-Refresh | Zwei Tabs sehen dieselbe Verschiebung ohne Reload; Speaker-Manager-Rolle sieht andere Bühnen read-only |
| B6 | Admin: Bewerbungen + Rollen | Bewerbungs-Queue je Session (Shortlist/Zusage/Warteliste/Absage, Rang, Antworten), „Entscheidungen freigeben"; Rollenverwaltung (Zuweisung mit Scope, Gültigkeit) über service_role nach `requireRole('admin')` | Freigabe-Knopf ruft `release_decisions`; jede Rollenänderung erscheint im Audit-Log |

## C · Definition of Done Welle 1
- Ein Ende-zu-Ende-Durchlauf im Sandbox-Modus: Ticketkauf (vivenu Sandbox) → Redirect → Personalisierung → Login → Programm → Bewerbung → Freigabe → Bestätigung → Ticket-Mail. Protokoll in `docs/tests/welle-1-e2e.md`.
- `npm run build`/`lint` grün, Advisor ohne ERROR, Tests grün, Doku (`datenmodell-v2.md`, Mail-Plan) aktualisiert, Drive gespiegelt.
- Feedback-Runde mit Konrad zu Wizard, Programm-Ansicht und Board (80 %-Prinzip); Ergebnisse ins Feedback-Register.

## Status 09.09.2026 (morgens)
- Teil A: ✅ A4 Programm-Backend (+ Realtime aus der DB, Fragen-RPCs, Programmzeiten). ⏳ A5 Bewerbungs-Mails + Cron als Nächstes. ⏳ A1/A2 vivenu warten auf Sandbox-Key. A3 folgt mit A1.
- Teil B: PR #2 (B5 Board, B2 Programm-Ansicht, B1 Onboarding) — erster Durchgang abgearbeitet (Merge mit main, privater Kanal, Fragen-RPC, Tests, Consent-Diff, Walkthrough). Zweiter Durchgang 10.09.: DB-Befunde per Migration 0018 behoben; sieben kleine UI-Punkte offen (PR-Kommentar), dann Merge. B3, B6 folgen in eigenem PR, B4 nach A1/A2.
- Infrastruktur: Supabase-Umzug nach Frankfurt **abgeschlossen** (Runbook `docs/runbooks/supabase-umzug.md`, Historie 09.09.): Login, Bootstrap-Admin, vier SQL-Tests grün, Demo-Programm vorhanden. Offen: Secret Key lokal eintragen (Konrad), Integration-Sync Preview/Dev, altes Projekt pausieren.

## Anweisung an die Build-Session (09.09.2026, nach dem Umzug)
Stand: Frankfurt-Projekt `jqmqvgaiyjudkvtncijw` vollständig migriert, Login läuft, Konrad ist Admin + Staff, alle vier SQL-Smoke-Tests grün. Deine Diagnose zu den Schlüsselnamen war richtig; `main` hatte dieselbe Umstellung parallel (`295f921`, `4bcff40`). Deshalb zuerst zusammenführen.

1. **`main` in `welle-1/talent-programm` mergen** (`git fetch origin && git merge origin/main`). Konflikte erwartet in `lib/supabase/{env,admin,client,server}.ts`, `lib/auth.ts`, `proxy.ts`, `scripts/*.mjs`.
   - `lib/supabase/env.ts` und seine Aufrufer: Variante von `main` nehmen (Funktionsnamen `supabaseUrl`, `supabaseAnonKey`, `hasSupabaseEnv`) und deine Aufrufer darauf umstellen. Inhaltlich identisch: neues Namensschema vor altem.
   - `scripts/*.mjs`: deine Variante mit `scripts/supabase-env.mjs` behalten (klare Abbruchmeldung), Fallbacks `SUPABASE_URL`/`SUPABASE_ANON_KEY` beibehalten.
   - `lib/supabase/admin.ts`: zusätzlich Formatprüfung des geheimen Schlüssels (muss mit `sb_secret_` oder `eyJ` beginnen), sonst Fehler mit dem Hinweis „Platzhalter aus `vercel env pull`, siehe docs/zugangs-liste.md".
   - Danach `npm run build && npm run lint`.
2. **Secret Key:** kein Fehler in Vercel. `SUPABASE_SECRET_KEY` ist dort als sensibel angelegt, Production hat den echten Wert zur Laufzeit; `vercel env pull` liefert für sensible Variablen grundsätzlich nur einen Platzhalter. Konrad trägt den Wert lokal im Haupt-Checkout ein und verteilt ihn mit `sh scripts/env-pull.sh --worktrees`. Bitte weiterhin nichts an Zugangsdaten anfassen; wenn der Wert da ist, den Worktree-Dev-Server neu starten.
3. **Merge-Bedingungen PR #2** (unverändert aus dem Review-Kommentar):
   a. Realtime: Kanal `programme-board:${eventId}`, `supabase.channel(name, { config: { private: true } })`; `notifyPeers()` als Fallback lassen.
   b. `setSessionQuestions` auf RPC `set_session_questions(p_session_id, p_questions, p_replace_custom)` umstellen, service_role-Pfad entfernen; Eingabeform `[{question_id, required, sort_order}]`.
   c. Tests für `lib/tz.ts` und `geometry.ts` als Dateien (`node --test`, `tests/tz.test.ts`, `tests/geometry.test.ts`) plus `npm test`.
   d. `saveStep("consent")`: gegen `consent_current` vergleichen, nur Änderungen einfügen.
4. **Walkthrough gegen die Frankfurt-DB** (Demo-Programm Summit 27 Freitag: 13 Slots, 8 Sessions): Board unter `/admin/programm` inkl. Drag & Drop mit Warnungen, Programm-Ansicht, Onboarding; kurz `next=` und Realtime im Browser prüfen.
5. Dann PR-Kommentar (was getestet), Build/Lint grün → zweiter Review-Durchgang und Merge durch die Architektur-Session. Danach **B3** (Meine Teilnahme) und **B6** (Bewerbungs-Queue, Rollenverwaltung) in einem eigenen PR; B4 wartet auf A1/A2.

Regeln unverändert: keine Änderungen an `supabase/migrations/`, `docs/masterplan.md`, `docs/entscheidungen.md`; offene Fragen und Abweichungswünsche in die PR-Beschreibung.
