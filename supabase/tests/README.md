# SQL-Smoke-Tests (Schema v2)

Ausführung: Inhalt einer Datei per Supabase-MCP `execute_sql` oder im SQL-Editor laufen lassen (Owner-Kontext). Jede Datei ist eine Transaktion mit `rollback` am Ende und hinterlässt keine Daten. Ergebniszeilen mit `ALLOWED (BUG)` bedeuten: eine Regel greift nicht. Voraussetzung: mindestens eine Person mit `auth_user_id` (ein eingeloggter Account).

| Datei | Migrationen | Prüft |
|---|---|---|
| `v2_roles_programme.sql` | 0006, 0007 | Scope-Rechte, Überlappung je Bühne (23P01), Board-Warnungen, Pflichtfelder beim Veröffentlichen, Bestätigungspflicht, History/Statistik |
| `v2_application_ticket.sql` | 0009 | Bewerbungs-Pipeline (Eignung, Doppelbewerbung, Entscheider-Rechte, Maskierung bis Freigabe, Ticketpflicht, Kollision + Ersetzen), Anmeldung mit Warteliste, Personalisierung, max. 2 eigene Fragen |
| `v2_programme_editor.sql` | 0015 | Backlog-Sessions, Anhängen im Scope, Speaker setzen, Veröffentlichen nur Programm-Team, Detach-Sperre |
| `v2_board_questions.sql` | 0016, 0017 | Realtime-Policies/Trigger, Programmzeiten, Fragen-RPCs (Katalog vs. eigene Fragen) |

Simulation eines eingeloggten Nutzers innerhalb der Transaktion:
`perform set_config('request.jwt.claims', json_build_object('sub', <auth_uid>, 'role', 'authenticated', 'email', <email>)::text, true);`

Nach jedem Umzug/Neuaufbau alle vier Dateien laufen lassen (Runbook `supabase-umzug.md`, Schritt „Prüfen").
