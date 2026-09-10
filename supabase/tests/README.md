# SQL-Smoke-Tests (Schema v2)

Ausführung: Inhalt einer Datei per Supabase-MCP `execute_sql` oder im SQL-Editor laufen lassen (Owner-Kontext). Jede Datei ist eine Transaktion mit `rollback` am Ende und hinterlässt keine Daten. Ergebniszeilen mit `ALLOWED (BUG)` bedeuten: eine Regel greift nicht. Voraussetzung: mindestens eine Person mit `auth_user_id` (ein eingeloggter Account). Die Tests entfernen deren Rollen und Staff-Eintrag **innerhalb der Transaktion**, damit Negativtests (fremde Bühne, Entscheidung ohne Rolle) auch mit dem Admin-Konto greifen; der Rollback stellt alles wieder her.

| Datei | Migrationen | Prüft |
|---|---|---|
| `v2_roles_programme.sql` | 0006, 0007 | Scope-Rechte, Überlappung je Bühne (23P01), Board-Warnungen, Pflichtfelder beim Veröffentlichen, Bestätigungspflicht, History/Statistik |
| `v2_application_ticket.sql` | 0009, 0020 | Bewerbungs-Pipeline (Eignung, Doppelbewerbung, Entscheider-Rechte, Maskierung bis Freigabe, Ticketpflicht, Kollision + Ersetzen), Anmeldung mit Warteliste, Personalisierung, max. 2 eigene Fragen, Mail-Warteschlange (Eingang, Zusage nach Freigabe mit Frist, Anmeldung), Housekeeping (Frist abgelaufen ⇒ expired, Warteliste rückt nach ⇒ Mail) |
| `v2_programme_editor.sql` | 0015, 0018 | Backlog-Sessions, Anhängen im Scope, Speaker setzen (Bestätigung bleibt erhalten), Leertexte ⇒ NULL, Veröffentlichen nur Programm-Team und nur mit Titel DE+EN, Detach-Sperre, keine TRUNCATE/REFERENCES/TRIGGER-Grants für API-Rollen |
| `v2_board_questions.sql` | 0016, 0017 | Realtime-Policies/Trigger, Programmzeiten, Fragen-RPCs (Katalog vs. eigene Fragen) |
| `v2_roles_admin.sql` | 0022–0024 | Admin-Lesewege: `applications_for_session` (Entscheider, 42501 sonst), `applications_overview`, `roles_of_person`, `assign_role` (idempotent, Vokabular, Scope-Check), `revoke_role` (Ablaufdatum, letzter Admin geschützt), `search_people` (Team; E-Mail nur Admin), Audit-Einträge, `search_organizations` (Team) |
| `v2_speaker.sql` | 0025 | Speaker-Profil: Anlegen nur Manager/Team, Pass-Regel (Masterclass ⇒ Professional ohne Lounge), Rolle `speaker` je Edition, Idempotenz über E-Mail (case-insensitiv), Team-Felder für Manager gesperrt, Suppression, Einladung erst ab `confirmed` (Mail `speaker_invite`), `manager_speakers`, Scope-Verlust ⇒ 42501, eigenes Profil lesen/schreiben (Whitelist), Assistenz einladen/entfernen (Rolle + Mail), Reisekosten-Freigabe nur `area_lead_speaker`/Admin |

Simulation eines eingeloggten Nutzers innerhalb der Transaktion:
`perform set_config('request.jwt.claims', json_build_object('sub', <auth_uid>, 'role', 'authenticated', 'email', <email>)::text, true);`

Nach jedem Umzug/Neuaufbau alle vier Dateien laufen lassen (Runbook `supabase-umzug.md`, Schritt „Prüfen"). Zusätzlich die Realtime-Probe `node --env-file=.env.local scripts/realtime-probe.mjs` (prüft Policies auf `realtime.messages` mit echtem Realtime-Dienst statt nur in SQL).
